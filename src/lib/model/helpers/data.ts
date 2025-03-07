import { ObjectId } from 'bson';

export function deleteUndefinedData(obj: any): object {
  if (
    typeof obj !== 'object' ||
    obj === null ||
    ObjectId.isValid(obj) ||
    obj instanceof Date ||
    obj instanceof Date
  ) {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(deleteUndefinedData).filter((value) => value !== undefined);
  }
  ``;
  const newObj: any = {};

  for (const key in obj) {
    const value = deleteUndefinedData(obj[key]);

    if (value !== undefined) {
      newObj[key] = value;
    }
  }

  return newObj;
}
