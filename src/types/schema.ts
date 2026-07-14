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
 * Value accepted under the `type`/`items` fragment keys of `@Prop` (D-05):
 * either another class decorated with `@Schema`/`@Prop` (compiled
 * recursively by `Schema.compile`) or a plain `ModelValidationSchema`
 * subschema object — the escape hatch, accepted verbatim without
 * recompilation.
 */
export type NestedSchemaValue = SchemaClass | ModelValidationSchema;

/**
 * @internal
 *
 * Fragment shape accepted by `Prop` (and, by extension, every sugar
 * decorator built on top of it — they all resolve to `Prop({ ...fragment })`).
 * Extends `ModelValidationSchema` with two Mongoat-only keys that are NOT
 * JSON Schema keywords themselves: `type`/`items` are widened to also
 * accept a `NestedSchemaValue` (D-05) — `Schema.compile` resolves them into
 * the actual compiled subschema and drops the `type` wrapper key, it never
 * survives into the compiled `ModelValidationSchema`.
 */
export type PropFragment = Omit<Partial<ModelValidationSchema>, 'items'> & {
  items?: NestedSchemaValue;
  type?: NestedSchemaValue;
};

/**
 * @internal
 *
 * Shape of the Mongoat metadata entry accumulated by the field decorators
 * (under the `mongoat:schema` key of `context.metadata`) and read back by
 * the class decorator and `Schema.compile`.
 */
export interface FieldMeta {
  properties: Record<string, PropFragment>;
  required: string[];
  /**
   * D-04: field names decorated with `@Optional()`. Kept SEPARATE from
   * `required` (instead of removing the name from `required` the moment
   * `@Optional` runs) on purpose — multiple decorators on the same class
   * field can be applied in either textual order, and `@Schema` (which
   * reads this metadata) only runs after ALL field decorators of the class
   * have run (TC39 spec guarantee). Filtering `required` against this set
   * at COMPILE time (not at decoration time) makes the result identical
   * regardless of whether `@Optional()` was written above or below
   * `@Prop`/a sugar on the same field.
   */
  optionalFields: string[];
  fieldPreHooks: {
    field: string;
    method: string;
    fn: (...args: unknown[]) => unknown;
  }[];
  classPreHooks: { method: string; fn: (...args: unknown[]) => unknown }[];
}
