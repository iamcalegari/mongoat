import { MongoatValidationError } from '@/errors';
import type { ModelValidationSchema } from '@/types/model';
import type { FieldMeta, SchemaClass } from '@/types/schema';

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
  // structuredClone em schemaValidatorBuilder).
  //
  // D-03/DECO-03: devolve o ModelValidationSchema "cru" equivalente ao
  // objeto plano escrito à mão — additionalProperties/_id/required de _id
  // são responsabilidade do schemaValidatorBuilder no Model, não daqui.
  return {
    bsonType: 'object',
    properties: structuredClone(meta.properties),
    required: [...meta.required],
  } as ModelValidationSchema;
}
