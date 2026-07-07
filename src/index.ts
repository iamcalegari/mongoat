export { Database, type ObjectID } from './database';
export {
  MongoatConnectionError,
  MongoatDriverError,
  MongoatError,
  MongoatValidationError,
} from './errors';
export { Model } from './model';
export type {
  CreateIndexProps,
  CreateModelProps,
  DatabaseConfig,
  DefaultProperties,
  DocumentDefaults,
  HookConfig,
  HookContextMap,
  HookFn,
  ModelDbValidationProps,
  ModelSetup,
  ModelValidationSchema,
  OnHookError,
  PostHookEntry,
  SchemaWithDefaults,
  ValidationQueryExpressions,
} from './types';

export { CUSTOM_VALIDATION, METHODS } from './utils';
