import {
  MongoatConnectionError,
  MongoatError,
  MongoatValidationError,
} from '@/errors';

/**
 * @internal
 *
 * Stable `.code` catalogue for every error the migration runner/topology/CLI
 * can throw. This file defines NO new error subtype — every code below is
 * thrown via one of the three existing `@/errors` exports (re-exported here
 * for convenience), exactly as `src/database/index.ts`'s `METHOD_NOT_ALLOWED`
 * already does for a code that doesn't cleanly fit a subtype:
 *
 * - `REPLICA_SET_REQUIRED` → `MongoatConnectionError` (topology precondition
 *   failed before any data-transaction migration op).
 * - `MIGRATION_CHECKSUM_MISMATCH`, `MIGRATION_IRREVERSIBLE`,
 *   `MIGRATION_NOT_FOUND` → `MongoatValidationError` (invalid migration
 *   state/input, same family as `INVALID_OBJECT_ID`/`FORBIDDEN_OPERATOR`).
 * - `MIGRATION_FAILED` → base `MongoatError` (a migration ran and failed
 *   mid-way; not a validation problem, not a connection problem).
 */
export const MIGRATION_ERROR_CODES = Object.freeze({
  /** A data-transaction migration was attempted against a standalone
   * MongoDB (no replica set / mongos) without the explicit
   * `allowNoTransaction` opt-in. Thrown as `MongoatConnectionError`. */
  REPLICA_SET_REQUIRED: 'REPLICA_SET_REQUIRED',
  /** The recomputed checksum of an already-applied migration file no longer
   * matches the checksum recorded in the control collection at apply time —
   * the file was edited retroactively. Thrown as `MongoatValidationError`. */
  MIGRATION_CHECKSUM_MISMATCH: 'MIGRATION_CHECKSUM_MISMATCH',
  /** A `down` was requested for a migration that has no `down` export — it
   * is irreversible by design. Thrown as `MongoatValidationError`. */
  MIGRATION_IRREVERSIBLE: 'MIGRATION_IRREVERSIBLE',
  /** A requested migration version does not exist on disk/in the control
   * collection. Thrown as `MongoatValidationError`. */
  MIGRATION_NOT_FOUND: 'MIGRATION_NOT_FOUND',
  /** A migration's `up`/`down` threw mid-run; the control collection records
   * it as `failed` and the runner stops (no automatic DDL rollback, per
   * D-03). Thrown as base `MongoatError`. */
  MIGRATION_FAILED: 'MIGRATION_FAILED',
} as const);

export type MigrationErrorCode =
  (typeof MIGRATION_ERROR_CODES)[keyof typeof MIGRATION_ERROR_CODES];

export { MongoatConnectionError, MongoatError, MongoatValidationError };
