import { Prop } from './decorators';

/**
 * @public
 *
 * Sugar over `@Prop({ bsonType })`.
 *
 * @example
 * ```typescript
 * class UserSchema {
 *   @BsonType('string')
 *   username!: string;
 * }
 * ```
 */
export function BsonType(bsonType: string | string[]) {
  return Prop({ bsonType });
}

/**
 * @public
 *
 * Sugar over `@Prop({ description })`.
 */
export function Description(description: string) {
  return Prop({ description });
}

/**
 * @public
 *
 * Sugar over `@Prop({ pattern })` — a regular expression string in
 * the format MongoDB's `$jsonSchema` validator accepts.
 */
export function Pattern(pattern: string) {
  return Prop({ pattern });
}

/**
 * @public
 *
 * Sugar over `@Prop({ enum: values })`.
 */
export function Enum(values: unknown[]) {
  return Prop({ enum: values });
}

/**
 * @public
 *
 * Sugar over `@Prop({ minimum })`.
 */
export function Min(minimum: number) {
  return Prop({ minimum });
}

/**
 * @public
 *
 * Sugar over `@Prop({ maximum })`.
 */
export function Max(maximum: number) {
  return Prop({ maximum });
}

/**
 * @public
 *
 * Sugar over `@Prop({ minLength })`.
 */
export function MinLength(minLength: number) {
  return Prop({ minLength });
}

/**
 * @public
 *
 * Sugar over `@Prop({ maxLength })`.
 */
export function MaxLength(maxLength: number) {
  return Prop({ maxLength });
}
