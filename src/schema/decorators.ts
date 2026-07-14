import './polyfill';

import { MongoatValidationError } from '@/errors';
import type { ModelValidationSchema } from '@/types/model';
import type { FieldMeta } from '@/types/schema';

import { compile, SCHEMA_METADATA_KEY } from './compile';
import { assertStandardDecoratorMode } from './guards';

/**
 * @internal
 *
 * Marker symbol written on the decorated class by `Schema`. Lets the
 * `Model` constructor detect "decorated schema class" vs "plain schema
 * object" without instanceof checks or extra imports.
 */
export const kMongoatSchemaClass = Symbol('kMongoatSchemaClass');

/**
 * Initializes (once per class) and returns the Mongoat metadata entry.
 *
 * `Object.hasOwn` (not `in`) on purpose: decorator metadata objects inherit
 * from the parent class metadata via prototype chain — without the own-key
 * check, a subclass would silently MUTATE the parent's metadata instead of
 * starting its own entry.
 */
function getOrInitMeta(metadata: Record<PropertyKey, unknown>): FieldMeta {
  if (!Object.hasOwn(metadata, SCHEMA_METADATA_KEY)) {
    metadata[SCHEMA_METADATA_KEY] = {
      properties: {},
      required: [],
      fieldPreHooks: [],
      classPreHooks: [],
    } satisfies FieldMeta;
  }

  return metadata[SCHEMA_METADATA_KEY] as FieldMeta;
}

/**
 * @public
 *
 * Canonical field decorator: declares the JSON Schema fragment for the
 * decorated field. The fragment is written verbatim into the compiled
 * schema — an omitted `bsonType` simply means "no type restriction" (pure
 * JSON Schema semantics, no magic default).
 *
 * Fields decorated with `Prop` are **required by default**. Fields without
 * any decorator are invisible to decorators (a TC39 limitation) and stay
 * OUT of the compiled schema entirely.
 *
 * `Prop` only records metadata — it never changes the runtime value or the
 * initializer of the field.
 *
 * @example
 * ```typescript
 * class UserSchema {
 *   @Prop({ bsonType: 'string' })
 *   username!: string;
 * }
 * ```
 */
export function Prop(fragment: Partial<ModelValidationSchema>) {
  // D-01: decorator canônico — os açúcares (@BsonType, @Description, ...)
  // são implementados por cima dele em plano posterior da fase.
  return function (
    _value: undefined,
    context: ClassFieldDecoratorContext
  ): void {
    assertStandardDecoratorMode(context); // D-16

    const meta = getOrInitMeta(
      context.metadata as unknown as Record<PropertyKey, unknown>
    );
    const fieldName = String(context.name);

    // D-03: o fragmento entra como declarado (sem default mágico de
    // bsonType); clone raso para desacoplar do objeto do dev.
    meta.properties[fieldName] = { ...fragment };

    // D-04: required por padrão (o @Optional de plano posterior remove).
    if (!meta.required.includes(fieldName)) {
      meta.required.push(fieldName);
    }
    // Retorna void de propósito: nenhum decorator desta fase devolve um novo
    // inicializador de campo TC39 — tudo é só metadata.
  };
}

/**
 * @public
 *
 * Class decorator that closes a decorated schema class. Runs AFTER all
 * field decorators (a TC39 spec guarantee), so it sees the fully populated
 * metadata.
 *
 * The optional `collectionName` becomes the default collection name for
 * models created from this class (the model config can still override it).
 *
 * Throws `MongoatValidationError` with code `INVALID_DECORATED_CLASS` when
 * the class has no decorated field — an empty schema is always a mistake.
 *
 * @example
 * ```typescript
 * @Schema('users')
 * class UserSchema {
 *   @Prop({ bsonType: 'string' })
 *   username!: string;
 * }
 * ```
 */
export function Schema(collectionName?: string) {
  return function (value: unknown, context: ClassDecoratorContext): void {
    assertStandardDecoratorMode(context); // D-16

    const meta = getOrInitMeta(
      context.metadata as unknown as Record<PropertyKey, unknown>
    );

    if (Object.keys(meta.properties).length === 0) {
      // D-14: erro estrutural detectável já na decoração (o @Schema roda ao
      // DEFINIR a classe) — falha alto aqui, não espera o compile.
      throw new MongoatValidationError(
        'Class decorated with @Schema has no decorated field — add at least one @Prop (or sugar decorator) to a field',
        { code: 'INVALID_DECORATED_CLASS' }
      );
    }

    // D-06/D-08: marker interno para o Model detectar "classe decorada" e
    // herdar o collectionName default. Mutação direta — a classe original é
    // preservada (decorator retorna void).
    (value as Record<PropertyKey, unknown>)[kMongoatSchemaClass] = {
      collectionName,
    };
  };
}

// D-15: símbolo único — `Schema` é a função-decorator E carrega o estático
// `Schema.compile` (API pública de introspecção/debug/testes, D-07).
Schema.compile = compile;
