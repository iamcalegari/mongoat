export { Database, type ObjectID } from './database';
export {
  MongoatConnectionError,
  MongoatDriverError,
  MongoatError,
  MongoatValidationError,
} from './errors';
export {
  defineConfig,
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
  MongoatMigrationsConfig,
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

/**
 * Re-exported straight from the `mongodb` driver so that opting into
 * MongoDB's Stable API (`new Database({ serverApi: { version:
 * ServerApiVersion.v1 } })`) does not force a direct `mongodb` install on the
 * consumer — Mongoat already depends on it.
 */
export { ServerApiVersion } from 'mongodb';
export type { ServerApi } from 'mongodb';

export {
  CUSTOM_VALIDATION,
  METHODS,
  sanitizeFilter,
  toObjectId,
} from './utils';
export type { SanitizeFilterOptions } from './utils';
