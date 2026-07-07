import { METHODS } from '@/utils/enums';
import {
  CreateIndexesOptions,
  Document,
  Filter,
  IndexSpecification,
  OptionalUnlessRequiredId,
} from 'mongodb';

import type { HookConfig, HookContextMap } from '@/types/hooks';

/**
 * Vendored subset of the JSON Schema Draft 4 `JSONSchema4` interface
 * (from the `json-schema` npm package), limited to the fields actually
 * used by Mongoat's `$jsonSchema` validators (`description`, `pattern`,
 * `enum`, `additionalProperties`).
 *
 * Vendoring avoids re-exporting a third-party type in the published
 * `.d.ts`/`.d.mts` — `json-schema` is not a runtime dependency (QUAL-04).
 * @see https://www.npmjs.com/package/json-schema
 */
export interface JSONSchema4Subset {
  additionalProperties?: boolean | JSONSchema4Subset;
  description?: string;
  enum?: unknown[];
  pattern?: string;
}

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

export type DocumentDefaults<T extends Document> =
  | Partial<OptionalUnlessRequiredId<T>>
  | Partial<SchemaWithDefaults<OptionalUnlessRequiredId<T>>>;

export interface CreateModelProps<ModelType extends Document> {
  allowedMethods?: METHODS[];
  collectionName: string;
  documentDefaults?: DocumentDefaults<ModelType>;
  /**
   * Declarative pre/post hook registration (D-01) — merged BEFORE any
   * later `.pre()`/`.post()` chainable calls (D-02: construtor primeiro).
   */
  hooks?: { [M in METHODS]?: HookConfig<HookContextMap<ModelType>[M]> };
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

export interface ModelValidationSchema<
  T extends DefaultProperties = any,
> extends JSONSchema4Subset {
  bsonType: string | string[];
  items?: ModelValidationSchema;
  properties?: {
    [k in keyof T]: ModelValidationSchema;
  };
  required?: (keyof T)[];
}
