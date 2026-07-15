import { ObjectIdLike } from 'bson';
import { Db, ObjectId } from 'mongodb';

import { MongoatValidationError } from '@/errors';
import {
  CreateIndexProps,
  ModelDbValidationProps,
  ModelValidationSchema,
  ValidationQueryExpressions,
} from '@/types/model';

/**
 * Converts a given input into an ObjectId.
 *
 * Sem argumento (`undefined`) gera um ObjectId novo e aleatório
 * (`new ObjectId()`) — uso legítimo para criar um `_id` novo antes de
 * inserir um documento.
 *
 * Quando um argumento É fornecido, valida com `ObjectId.isValid` ANTES de
 * instanciar: bson@7 aceita apenas uma string de 24 hex chars, um
 * `ObjectIdLike` ou um `Uint8Array` de 12 bytes — qualquer outra coisa
 * (string malformada, número, array, etc.) lança `MongoatValidationError`
 * (`code: INVALID_OBJECT_ID`) em vez de silenciosamente gerar um id
 * aleatório que não bate com nada.
 *
 * @param inputId - The input value to be converted, which can be a string, ObjectId, ObjectIdLike, or Uint8Array. Omit to generate a new ObjectId.
 * @returns A new ObjectId instance derived from the inputId, or a freshly generated one when omitted.
 */

export function toObjectId(
  inputId?:
    | string
    | ObjectId
    | ObjectIdLike
    | Uint8Array<ArrayBufferLike>
    | undefined
): ObjectId {
  if (inputId === undefined) {
    return new ObjectId();
  }

  if (!ObjectId.isValid(inputId)) {
    // Nunca serializar o objeto/array inteiro (mensagem clara, sem detalhes
    // internos) — só inclui o valor cru quando é uma string curta, o caso
    // mais comum e diagnosticável.
    const preview =
      typeof inputId === 'string' ? ` (received "${inputId}")` : '';

    throw new MongoatValidationError(
      `Invalid ObjectId: expected a 24-character hex string, ObjectId, ObjectIdLike or 12-byte Uint8Array${preview}`,
      { code: 'INVALID_OBJECT_ID' }
    );
  }

  return new ObjectId(inputId);
}

/**
 * @internal
 *
 * Recursively marks every nested object-typed schema fragment (via
 * `properties`/`items`) with `additionalProperties: false` when it is not
 * already explicitly set — the same recursion the `$jsonSchema` validator
 * relies on to reject undeclared document fields at every nesting level,
 * not just the top level. Mutates `schema` IN PLACE; callers are
 * responsible for cloning before calling this when the input must not be
 * mutated (see `buildJsonSchemaValidator`, which clones before calling
 * this).
 *
 * @param schema - The schema fragment to augment (mutated in place).
 * @returns The same `schema` reference, for convenient chaining.
 */
export function includeAdditionalPropertiesFalse(
  schema: ModelValidationSchema
): ModelValidationSchema {
  if (schema.bsonType === 'object' && !schema.additionalProperties) {
    schema.additionalProperties = false;
  }

  if (schema.items) {
    includeAdditionalPropertiesFalse(schema.items);
  }

  if (schema.properties) {
    Object.keys(schema.properties).forEach((key) => {
      includeAdditionalPropertiesFalse((schema.properties ?? {})[key]);
    });
  }

  return schema;
}

/**
 * @internal
 *
 * Builds the full `$jsonSchema` MongoDB validator (`validationAction:
 * 'error'`, `validationLevel: 'strict'`) from a plain `ModelValidationSchema`
 * — injects the `_id` property/requirement and recursively enforces
 * `additionalProperties: false` via `includeAdditionalPropertiesFalse`. This
 * is the single code path shared by the `Model` constructor and migration
 * schema helpers, so both produce a byte-identical validator for the same
 * schema — never re-derive this logic elsewhere.
 *
 * Clones `schema` before mutating it (`structuredClone`) — never mutates the
 * caller's schema object.
 *
 * @param args.schema - The plain schema to augment.
 * @param args.validationQueryExpressions - Extra top-level keys merged into
 * `validator` alongside `$jsonSchema` (e.g. `$or`).
 * @returns The full `{ validationAction, validationLevel, validator }` triple
 * ready to pass to `applyCollectionValidator`/`db.createCollection`.
 */
export function buildJsonSchemaValidator({
  schema,
  validationQueryExpressions = {},
}: {
  schema: ModelValidationSchema;
  validationQueryExpressions?: ValidationQueryExpressions;
}): ModelDbValidationProps {
  // Clonar antes de mutar — `includeAdditionalPropertiesFalse` mutates its
  // argument in-place; sem o clone, um objeto de schema reusado (por
  // referência) em dois models/migrations vazaria a mutação de volta para o
  // objeto do usuário (QUAL-01). `structuredClone` é global desde Node 17
  // (sem import) e cobre o shape de `ModelValidationSchema` (plain
  // objects/arrays/strings/booleans — sem funções nem tipos não-cloneáveis).
  const clonedSchema = structuredClone(schema);

  return {
    validationAction: 'error',
    validationLevel: 'strict',
    validator: {
      $jsonSchema: {
        additionalProperties: false,
        bsonType: 'object',
        properties: {
          _id: {
            bsonType: 'objectId',
            description: 'Id of the document in the database',
          },
          ...includeAdditionalPropertiesFalse(clonedSchema).properties,
        },
        required: [...((clonedSchema.required as string[]) ?? []), '_id'],
      },
      ...validationQueryExpressions,
    },
  };
}

/**
 * @internal
 *
 * Applies a `{ validationAction, validationLevel, validator }` triple (as
 * produced by `buildJsonSchemaValidator`) to an existing collection via
 * `collMod` — the single code path shared by `Database#setupValidators` and
 * migration schema helpers, so both apply the EXACT same validator to the
 * server.
 *
 * @param db - The connected native `Db`.
 * @param collectionName - The target collection name.
 * @param validator - The validation triple to apply.
 */
export async function applyCollectionValidator(
  db: Db,
  collectionName: string,
  validator: ModelDbValidationProps
): Promise<void> {
  await db.command({
    collMod: collectionName,
    validator: validator.validator,
    validationAction: validator.validationAction,
    validationLevel: validator.validationLevel,
  });
}

/**
 * @internal
 *
 * WR-10: applies a set of managed indexes to a collection WITHOUT an
 * unconditional `dropIndexes()` — that destroyed every index on the
 * collection (including ones created outside Mongoat by DBAs/migrations)
 * and opened a window without uniqueness between the drop and the recreate
 * on every boot. Instead, diffs: `createIndex` is already idempotent for
 * identical specs; only when a MANAGED index's spec has diverged (name or
 * key-pattern conflict) is that specific index dropped and recreated.
 *
 * The single code path shared by `Database#setupIndexes` and migration
 * schema helpers.
 *
 * @param db - The connected native `Db`.
 * @param collectionName - The target collection name.
 * @param indexes - The full set of managed index specs to apply.
 */
export async function applyCollectionIndexes(
  db: Db,
  collectionName: string,
  indexes: CreateIndexProps[]
): Promise<void> {
  const collection = db.collection(collectionName);

  if (!indexes.length) return;

  for (const newIndex of indexes) {
    const { key, ...options } = newIndex;

    try {
      await collection.createIndex(key, options);
    } catch (err) {
      const existingIndexes = await collection.listIndexes().toArray();

      const conflicting = existingIndexes.find(
        (existing) =>
          existing.name !== '_id_' &&
          (JSON.stringify(existing.key) === JSON.stringify(key) ||
            (options.name !== undefined && existing.name === options.name))
      );

      if (!conflicting) throw err;

      await collection.dropIndex(conflicting.name);
      await collection.createIndex(key, options);
    }
  }
}
