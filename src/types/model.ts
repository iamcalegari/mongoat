import { METHODS } from '@/utils/enums';
import { JSONSchema4 } from 'json-schema';
import {
  CreateIndexesOptions,
  Document,
  Filter,
  IndexSpecification,
  OptionalUnlessRequiredId,
} from 'mongodb';

export type CreateIndexProps = {
  key: IndexSpecification;
} & CreateIndexesOptions;

export interface ModelDbValidationProps {
  validationAction: string;
  validationLevel: string;
  validator: {
    $jsonSchema: ModelValidationSchema;
  };
}

export type DocumentDefaults<T extends Document> = OptionalUnlessRequiredId<T>;

export interface CreateModelProps<ModelType extends Document> {
  allowedMethods?: METHODS[];
  collectionName: string;
  documentDefaults?: DocumentDefaults<ModelType>;
  indexes?: CreateIndexProps[];
  schema: ModelValidationSchema;
  validationQueryExpressions?: ValidationQueryExpressions;
  validity?: boolean;
}

export interface ValidationQueryExpressions extends Filter<Document> {}

export interface ModelSetup {
  allowedMethods?: METHODS[];
  collectionName: string;
  documentDefaults?: DocumentDefaults<any>;
  indexes?: CreateIndexProps[];
  schema: ModelValidationSchema;
  validationQueryExpressions?: ValidationQueryExpressions;
  validity?: boolean;
}

export interface DefaultProperties {
  updatedAt: Date;
  insertedAt: Date;
}

export type SchemaWithDefaults<S> = S & DefaultProperties;

export interface ModelValidationSchema<T extends DefaultProperties = any>
  extends Omit<JSONSchema4, 'required'> {
  bsonType: string | string[];
  items?: ModelValidationSchema;
  properties?: {
    [k in keyof T]: ModelValidationSchema;
  };
  required?: (keyof T)[];
}
