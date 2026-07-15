export { Database, type ObjectID } from './database';
export {
  MongoatConnectionError,
  MongoatDriverError,
  MongoatError,
  MongoatValidationError,
} from './errors';
export {
  defineMigration,
  getStatus,
  revertMigration,
  runMigrations,
  runTo,
} from './migrate';
export { Model } from './model';
export { Optional, Post, Pre, Prop, Schema } from './schema';
export {
  BsonType,
  Description,
  Enum,
  Max,
  MaxLength,
  Min,
  MinLength,
  Pattern,
} from './schema';
export type {
  CreateIndexProps,
  CreateModelProps,
  DatabaseConfig,
  DefaultProperties,
  DocumentDefaults,
  HookConfig,
  HookContextMap,
  HookFn,
  MigrationContext,
  MigrationModule,
  ModelDbValidationProps,
  ModelSetup,
  ModelValidationSchema,
  OnHookError,
  Plugin,
  PluginContext,
  PluginObject,
  PluginSetup,
  PostHookEntry,
  SchemaClass,
  SchemaWithDefaults,
  ValidationQueryExpressions,
} from './types';

export {
  CUSTOM_VALIDATION,
  METHODS,
  sanitizeFilter,
  toObjectId,
} from './utils';
export type { SanitizeFilterOptions } from './utils';
