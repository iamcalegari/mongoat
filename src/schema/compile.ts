import { MongoatValidationError } from '@/errors';
import type { ModelValidationSchema } from '@/types/model';
import type {
  FieldMeta,
  NestedSchemaValue,
  PropFragment,
  SchemaClass,
} from '@/types/schema';

/**
 * @internal
 *
 * Key under which Mongoat stores its schema metadata inside
 * `context.metadata` / `Class[Symbol.metadata]`.
 */
export const SCHEMA_METADATA_KEY = 'mongoat:schema';

/**
 * @public
 *
 * Compiles a class decorated with `@Schema`/`@Prop` into the exact same
 * `ModelValidationSchema` shape a developer would write by hand with the
 * plain-object API — the two schema APIs are interchangeable.
 *
 * Pure transformation (no I/O): reads the metadata accumulated by the
 * field decorators from `Class[Symbol.metadata]` and returns a fresh,
 * detached schema object (mutating the returned schema never affects the
 * class metadata or later compilations).
 *
 * Exposed publicly as `Schema.compile` for introspection, debugging and
 * testing — models accept the decorated class directly and compile it
 * internally.
 *
 * Throws `MongoatValidationError` with code `INVALID_DECORATED_CLASS` when
 * the value is not a class decorated with Mongoat schema decorators.
 *
 * @example
 * ```typescript
 * const validationSchema = Schema.compile(UserSchema);
 * // { bsonType: 'object', properties: { ... }, required: [ ... ] }
 * ```
 */
export function compile(cls: SchemaClass): ModelValidationSchema {
  const metadata =
    typeof cls === 'function'
      ? (
          cls as unknown as {
            [Symbol.metadata]?: Record<PropertyKey, unknown> | null;
          }
        )[Symbol.metadata]
      : undefined;

  const meta = metadata?.[SCHEMA_METADATA_KEY] as FieldMeta | undefined;

  if (!meta) {
    // D-14: erro estrutural — estoura no compile (classe nunca passou pelo
    // @Schema/@Prop, então não há metadata para compilar).
    throw new MongoatValidationError(
      'Class is not decorated with @Schema — Schema.compile only accepts classes decorated with Mongoat schema decorators',
      { code: 'INVALID_DECORATED_CLASS' }
    );
  }

  // Clone-antes-de-repassar: o metadata é compartilhado por todos os
  // consumidores da classe — devolver as referências cruas deixaria uma
  // mutação downstream contaminar compilações futuras (mesma disciplina do
  // structuredClone em schemaValidatorBuilder). `compileProperty` clona por
  // campo (não `structuredClone(meta.properties)` de uma vez) — necessário
  // agora que um fragmento pode conter uma CLASSE decorada aninhada em
  // `type`/`items` (D-05), que `structuredClone` não sabe clonar
  // (`DataCloneError`).
  //
  // D-03/DECO-03: devolve o ModelValidationSchema "cru" equivalente ao
  // objeto plano escrito à mão — additionalProperties/_id/required de _id
  // são responsabilidade do schemaValidatorBuilder no Model, não daqui.
  return {
    bsonType: 'object',
    properties: Object.fromEntries(
      Object.entries(meta.properties).map(([fieldName, fragment]) => [
        fieldName,
        compileProperty(fragment),
      ])
    ),
    // D-04: `required` filtrado contra `optionalFields` AQUI (compile), não
    // no momento em que `@Optional()` roda — ver JSDoc de
    // FieldMeta.optionalFields para o porquê (idempotência independente da
    // ordem textual dos decorators no mesmo campo).
    required: meta.required.filter(
      (fieldName) => !meta.optionalFields.includes(fieldName)
    ),
  } as ModelValidationSchema;
}

/**
 * D-05: compila um único fragmento de campo (`meta.properties[nome]`) em um
 * `ModelValidationSchema` de property. `type`/`items` são chaves
 * Mongoat-only (nunca chegam ao `$jsonSchema` final como tal) — quando
 * presentes, são resolvidas recursivamente (`resolveNestedSchema`) e o
 * resultado substitui/complementa o fragmento; as demais chaves (bsonType,
 * description, pattern, enum, minimum, maximum, ...) seguem verbatim.
 *
 * `type` é tratado como "o shape completo desta property É o subschema
 * resolvido" — por isso o resultado de `resolveNestedSchema(type)` é
 * mesclado por cima do restante do fragmento (ex.: um `@Description` no
 * mesmo campo de um `@Prop({ type: Nested })` sobrevive; um `bsonType`
 * eventualmente declarado ao lado é sobrescrito pelo `bsonType: 'object'`
 * vindo do compile recursivo — o objeto aninhado sempre "vence" o shape).
 * `items`, por outro lado, só popula a chave `items` do resultado — o
 * `bsonType: 'array'` do array em si continua vindo do fragmento declarado
 * pelo dev (ex.: `@Prop({ bsonType: 'array', items: Nested })`).
 */
function compileProperty(fragment: PropFragment): ModelValidationSchema {
  const { items, type, ...rest } = fragment;
  const compiled = structuredClone(rest) as ModelValidationSchema;

  if (type !== undefined) {
    Object.assign(compiled, resolveNestedSchema(type));
  }

  if (items !== undefined) {
    compiled.items = resolveNestedSchema(items);
  }

  return compiled;
}

/**
 * D-05: resolve um valor de `type`/`items` — ou uma classe decorada
 * (compilada recursivamente via `compile`) ou um subschema JSON Schema
 * inline (objeto plano, aceito VERBATIM como escape hatch, sem
 * recompilação, só clonado para preservar a disciplina de "nunca devolver
 * uma referência mutável do dev").
 */
function resolveNestedSchema(
  value: NestedSchemaValue
): ModelValidationSchema {
  return typeof value === 'function'
    ? compile(value)
    : (structuredClone(value) as ModelValidationSchema);
}
