import type {
  MigrationModule,
  MongoatMigrationsConfig,
} from '@/types/migrate';

export { forceUnlock, getLockStatus } from './lock';
export { getStatus, revertMigration, runMigrations, runTo } from './runner';
export type {
  MigrationContext,
  MigrationModule,
  MongoatMigrationsConfig,
} from '@/types/migrate';

/**
 * @public
 *
 * Identity helper for authoring a migration file — takes the `up`/`down`
 * exports and returns them unchanged, giving the author full type inference
 * on `MigrationContext` without an explicit annotation on the exported
 * object.
 *
 * @example
 * ```typescript
 * import { defineMigration } from '@iamcalegari/mongoat';
 *
 * export default defineMigration({
 *   async up(ctx) {
 *     // ...
 *   },
 * });
 * ```
 *
 * @param migrationModule - The migration's `up` (required) and `down`
 * (optional) functions.
 * @returns The same `migrationModule`, unchanged.
 */
export function defineMigration(
  migrationModule: MigrationModule
): MigrationModule {
  return migrationModule;
}

/**
 * @public
 *
 * Identity helper for authoring a `mongoat.config.{json,js,ts}` file — takes
 * the migrations config knobs and returns them unchanged, giving the author
 * full type inference on `MongoatMigrationsConfig` without an explicit
 * annotation on the exported object. A plain object literal works the same
 * way without this helper — it exists purely for type-checking and
 * autocomplete, never as a runtime requirement (a `.json` config has no
 * code to call it from).
 *
 * The exported config must stay a static, side-effect-free object: when the
 * CLI needs to re-execute the process under a TypeScript-capable runtime,
 * the config module is evaluated once per process, so a top-level side
 * effect in it would run twice.
 *
 * @example
 * ```typescript
 * import { defineConfig } from '@iamcalegari/mongoat';
 *
 * export default defineConfig({
 *   dir: 'db/migrations',
 * });
 * ```
 *
 * @param config - The migrations config knobs (all optional).
 * @returns The same `config`, unchanged.
 */
export function defineConfig(
  config: MongoatMigrationsConfig
): MongoatMigrationsConfig {
  return config;
}
