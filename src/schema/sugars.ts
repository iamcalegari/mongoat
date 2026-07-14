import { Prop } from './decorators';

/**
 * @public
 *
 * Sugar over `@Prop({ bsonType })` (D-02).
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
 * Sugar over `@Prop({ description })` (D-02).
 */
export function Description(description: string) {
  return Prop({ description });
}

/**
 * @public
 *
 * Sugar over `@Prop({ pattern })` (D-02) — a regular expression string in
 * the format MongoDB's `$jsonSchema` validator accepts.
 */
export function Pattern(pattern: string) {
  return Prop({ pattern });
}

/**
 * @public
 *
 * Sugar over `@Prop({ enum: values })` (D-02).
 */
export function Enum(values: unknown[]) {
  return Prop({ enum: values });
}

/**
 * @public
 *
 * Sugar over `@Prop({ minimum })` (D-02).
 */
export function Min(minimum: number) {
  return Prop({ minimum });
}

/**
 * @public
 *
 * Sugar over `@Prop({ maximum })` (D-02).
 */
export function Max(maximum: number) {
  return Prop({ maximum });
}

/**
 * @public
 *
 * Sugar over `@Prop({ minLength })` (D-02).
 */
export function MinLength(minLength: number) {
  return Prop({ minLength });
}

/**
 * @public
 *
 * Sugar over `@Prop({ maxLength })` (D-02).
 */
export function MaxLength(maxLength: number) {
  return Prop({ maxLength });
}
