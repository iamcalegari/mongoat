import { ObjectIdLike } from 'bson';
import { ObjectId } from 'mongodb';

/**
 * Converts a given input into an ObjectId.
 *
 * @param inputId - The input value to be converted, which can be a string, number, ObjectId, ObjectIdLike, or Uint8Array.
 * @returns A new ObjectId instance derived from the inputId.
 */

export function toObjectId(
  inputId?: string | number | ObjectId | ObjectIdLike | Uint8Array
): ObjectId {
  return new ObjectId(inputId);
}
