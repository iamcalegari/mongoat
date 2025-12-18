import "reflect-metadata";
import { Model } from '@/model'
import { METHODS } from "@/utils";
import { DocumentDefaults } from "@/types";

const DESCRIPTION_METADATA_KEY = Symbol('property:description');
const OPTIONAL_METADATA_KEY = Symbol('property:optional');
const DEFAULT_METADATA_KEY = Symbol('property:default');

const ALLOWED_METHODS_METADATA_KEY = Symbol('model:allowedMethods');

export function Description(description: string): PropertyDecorator {
  return function (target, propertyKey) {
    Reflect.defineMetadata(DESCRIPTION_METADATA_KEY, description, target, propertyKey);
  }
}

export function Optional(): PropertyDecorator {
  return function (target, propertyKey) {
    Reflect.defineMetadata(OPTIONAL_METADATA_KEY, true, target, propertyKey);
  }
}

export function Default(value: any): PropertyDecorator {
  return function (target, propertyKey) {
    Reflect.defineMetadata(DEFAULT_METADATA_KEY, value, target, propertyKey);
  }
}

export function AllowedMethods(methods: string[] | 'all' | 'crud'): ClassDecorator {
  const resolvedMethods = methods === 'all'
    ? Object.values(METHODS)
    : methods === 'crud' ? [
      METHODS.FIND,
      METHODS.INSERT,
      METHODS.UPDATE,
      METHODS.DELETE,
    ] : methods;

  return function (constructor: Function) {
    Reflect.defineMetadata(ALLOWED_METHODS_METADATA_KEY, resolvedMethods, constructor);
  }
}

export function Schema(collectionName: string): ClassDecorator {
  return function (constructor: Function) {
    const schema: any = {
      bsonType: 'object',
      properties: {},
      required: [],
    };

    const documentDefaults: DocumentDefaults<any> = {};


    for (const key of Reflect.ownKeys(constructor.prototype)) {
      const description = Reflect.getMetadata(DESCRIPTION_METADATA_KEY, constructor.prototype, key);
      const isOptional = Reflect.getMetadata(OPTIONAL_METADATA_KEY, constructor.prototype, key);
      const defaultValue = Reflect.getMetadata(DEFAULT_METADATA_KEY, constructor.prototype, key);

      schema.properties[key] = {
        bsonType: typeof constructor.prototype[key],
        description: description || '',
      };

      if (!isOptional) {
        schema.required.push(key);
      }

      if (defaultValue !== undefined) {
        documentDefaults[key as string] = defaultValue
      }

    }

    const allowedMethods: METHODS[] = Reflect.getMetadata(ALLOWED_METHODS_METADATA_KEY, constructor)

    Reflect.defineMetadata('model', new Model<any>({
      collectionName,
      schema,
      allowedMethods,
      documentDefaults: documentDefaults,
    }), constructor);
  }
}
