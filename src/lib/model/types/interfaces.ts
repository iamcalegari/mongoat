import { Methods } from '@src/lib/types';
import { JSONSchema4 } from 'json-schema';
import {
  CreateIndexesOptions,
  Document,
  Filter,
  IndexSpecification,
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

export interface CreateModelProps {
  collectionName: string;
  schema: ModelValidationSchema;
  indexes: CreateIndexProps[];
  allowedMethods: Methods[];
  documentDefaults: Record<string, any>;
  validationQueryExpressions?: ValidationQueryExpressions;
  validity?: boolean;
}

export interface ValidationQueryExpressions extends Filter<Document> {}

export interface ModelSetup {
  allowedMethods?: Methods[];
  indexes?: CreateIndexProps[];
  schema: ModelValidationSchema;
  collectionName: string;
  documentDefaults?: Record<string, any>;
  validationQueryExpressions?: ValidationQueryExpressions;
  validity?: boolean;
}

export interface DefaultProperties {
  updatedAt: Date;
  insertedAt: Date;
}

export interface ModelValidationSchema<T extends DefaultProperties = any>
  extends Omit<JSONSchema4, 'required'> {
  bsonType: string | string[];
  items?: ModelValidationSchema;
  properties?: {
    [k in keyof T]: ModelValidationSchema;
  };
  required?: (keyof T)[];
}
