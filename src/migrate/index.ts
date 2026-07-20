import type { MigrationModule } from '@/types/migrate';

export { forceUnlock, getLockStatus } from './lock';
export { getStatus, revertMigration, runMigrations, runTo } from './runner';
export type { MigrationContext, MigrationModule } from '@/types/migrate';

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
