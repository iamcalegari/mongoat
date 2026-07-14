import type { ModelValidationSchema } from './model';

/**
 * @public
 *
 * Constructor type of a schema class decorated with `@Schema`.
 *
 * A decorated schema class needs no special base class or interface: at
 * runtime it is just a plain constructor (`typeof cls === 'function'`)
 * carrying an internal marker written by the `@Schema` decorator, which is
 * enough to tell it apart from a plain schema object (never callable, and
 * declaring `bsonType` directly). This keeps detection reflection-free —
 * no `reflect-metadata`, no `instanceof` against a library base class.
 */
export type SchemaClass<T extends object = object> = new (
  ...args: never[]
) => T;

/**
 * @internal
 *
 * Shape of the Mongoat metadata entry accumulated by the field decorators
 * (under the `mongoat:schema` key of `context.metadata`) and read back by
 * the class decorator and `Schema.compile`.
 */
export interface FieldMeta {
  properties: Record<string, Partial<ModelValidationSchema>>;
  required: string[];
  fieldPreHooks: {
    field: string;
    method: string;
    fn: (...args: unknown[]) => unknown;
  }[];
  classPreHooks: { method: string; fn: (...args: unknown[]) => unknown }[];
}
