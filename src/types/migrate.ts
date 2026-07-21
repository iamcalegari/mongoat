import type { ClientSession, Db, Document } from 'mongodb';

import type { Model } from '@/model';
import type {
  ModelValidationSchema,
  ValidationQueryExpressions,
} from '@/types/model';
import type { SchemaClass } from '@/types/schema';

/**
 * @internal
 *
 * Anything a migration's schema helpers can apply a validator/index set
 * from: an already-registered `Model` instance (validator/indexes already
 * fully built), a class decorated with `@Schema`/`@Prop`, or a plain
 * `ModelValidationSchema` object — the same three shapes `CreateModelProps`
 * already accepts for `schema`.
 */
export type MigrationSchemaTarget =
  | Model<Document>
  | SchemaClass
  | ModelValidationSchema;

/**
 * @internal
 *
 * Schema helpers exposed on `MigrationContext.schema` — thin wrappers over
 * the same validator/index application code path used by `Model`/`Database`
 * (`src/utils/database.ts`), so a migration and the ODM itself always agree
 * on the resulting `$jsonSchema` validator and managed indexes.
 */
export interface MigrationSchemaHelpers {
  applyIndexes(
    collectionName: string,
    target: MigrationSchemaTarget
  ): Promise<void>;
  /**
   * `options.validationQueryExpressions` mirrors the sibling
   * `CreateModelProps.validationQueryExpressions` field — only meaningful
   * when `target` is a raw schema/decorated class (a registered `Model`
   * already embeds its own expressions in its built validator; combining
   * both is rejected as an ambiguous input, see the implementation).
   */
  applyValidator(
    collectionName: string,
    target: MigrationSchemaTarget,
    options?: { validationQueryExpressions?: ValidationQueryExpressions }
  ): Promise<void>;
}

/**
 * @public
 *
 * The object passed into a migration's `up`/`down` function.
 *
 * `db` and `session` are the native MongoDB driver types (no ODM wrapper) —
 * a migration author gets the exact same escape-hatch surface Mongoat
 * itself exposes via `Database#getDb`/`Database#getClient`, plus a running
 * `session` already attached to the migration's transaction. `schema`
 * offers convenience helpers for applying a validator or index set to a
 * collection from a `Model`, a decorated schema class, or a plain schema
 * object.
 */
export interface MigrationContext {
  db: Db;
  schema: MigrationSchemaHelpers;
  session: ClientSession;
}

/**
 * @public
 *
 * The shape a migration file must export. `up` is required; `down` is
 * optional — a migration with no `down` export is irreversible by design
 * (attempting to revert it is a fail-loud error, not a silent no-op).
 */
export interface MigrationModule {
  down?(ctx: MigrationContext): Promise<void>;
  up(ctx: MigrationContext): Promise<void>;
}

/**
 * @internal
 *
 * Persisted shape of an applied migration, stored one document per
 * migration in the control collection (default name `_migrations`).
 */
export interface MigrationRecord {
  appliedAt: Date;
  checksum: string;
  name: string;
  status?: 'applied' | 'failed';
  version: string;
}

/**
 * @internal
 *
 * A single row of `mongoat migrate status` output — pairs a discovered
 * migration file with whatever applied-state (if any) is known about it.
 */
export interface MigrationStatusRow {
  applied: boolean;
  appliedAt?: Date;
  drifted?: boolean;
  /** `true` when the most recent recorded attempt for this version has
   * `status: 'failed'` — distinct from `applied`: a failed record is
   * never rendered as `applied`. */
  failed?: boolean;
  name: string;
  version: string;
}

/**
 * @internal
 *
 * A single row of the machine-readable status envelope — the same fields
 * `MigrationStatusRow` carries, but every optional/undefined source field is
 * normalized to an always-present key so a downstream consumer (CI, `jq`)
 * never has to special-case a missing property.
 */
export interface MigrationStatusJsonRow {
  appliedAt: string | null;
  drifted: boolean;
  name: string;
  state: 'applied' | 'failed' | 'pending';
  version: string;
}

/**
 * @internal
 *
 * Aggregate counts over a `MigrationStatusJsonRow[]` — `total` is the
 * discovered-file count; `applied`/`pending`/`failed` are mutually exclusive
 * partitions of it (mirroring `state`), while `drifted` is an orthogonal
 * count (a drifted migration is still `applied`).
 */
export interface MigrationStatusSummary {
  applied: number;
  drifted: number;
  failed: number;
  pending: number;
  total: number;
}

/**
 * @internal
 *
 * Machine-readable projection of `LockStatus` — `held: false` carries no
 * other field; the rest are only ever present when a lock is actually held,
 * and are individually optional because a corrupted lock document (see
 * `formatLockDiagnostic`) may be missing any of them.
 */
export interface MigrationLockJson {
  acquiredAt?: string | null;
  expiresAt?: string | null;
  held: boolean;
  hostname?: string;
  operation?: string;
  ownerId?: string;
  pid?: number;
}

/**
 * @internal
 *
 * The `mongoat status --json` machine-readable envelope. `schemaVersion` is
 * an integer bumped only on a breaking shape change (a field removed,
 * renamed, or whose meaning changed) — never on an additive field, so a
 * consumer pinned to a given `schemaVersion` can safely ignore fields it
 * does not recognize.
 */
export interface MigrationStatusJson {
  lock: MigrationLockJson;
  migrations: MigrationStatusJsonRow[];
  schemaVersion: 1;
  summary: MigrationStatusSummary;
}

/**
 * @internal
 *
 * The `--dry-run --json` machine-readable envelope produced from
 * `planMigrations`'s result. Its `schemaVersion` is an independent counter
 * from `MigrationStatusJson`'s own — the two payloads are structurally
 * different and evolve on separate timelines — bumped under the same
 * breaking-change-only rule.
 */
export interface MigrationPlanJson {
  command: 'to' | 'up';
  migrations: { name: string; version: string }[];
  schemaVersion: 1;
  summary: { count: number };
  targetVersion?: string;
}

/**
 * @internal
 *
 * Resolved configuration for a migration run: where migration files live,
 * which collection tracks applied state, and whether data-operation
 * migrations are allowed to proceed without a replica set (no
 * transactions).
 */
export interface MigrateConfig {
  allowNoTransaction?: boolean;
  collection: string;
  dir: string;
  /** TTL of the run lock, in milliseconds. When absent, the runner applies
   * its own default. */
  lockTtlMs?: number;
  /** Native graceful-stop channel — the runner checks `signal.aborted`
   * between migrations. The library never installs process signal handlers
   * itself. */
  signal?: AbortSignal;
}

/**
 * @public
 *
 * The authorable subset of `MigrateConfig` — the four migrations knobs a
 * `mongoat.config.{json,js,ts}` file may set. Every field is optional and
 * merges with CLI flags/env vars/defaults on a per-field basis.
 *
 * Deliberately excludes the runtime-only `AbortSignal` channel `MigrateConfig`
 * carries — the CLI attaches it while a run is already in progress, never a
 * value an author writes to a static file.
 */
export interface MongoatMigrationsConfig {
  allowNoTransaction?: boolean;
  collection?: string;
  dir?: string;
  lockTtlMs?: number;
}

/**
 * @internal
 *
 * Persisted shape of the singleton run-lock document held in the lock
 * collection while a migration run is in progress.
 */
export interface MigrationLockDocument {
  _id: string;
  acquiredAt: Date;
  expiresAt: Date;
  hostname: string;
  /** `'up'`/`'down'`/`'to'`, plus the target version when applicable. */
  operation: string;
  pid: number;
  /** Unique per run — proof of ownership over the lock document. */
  ownerId: string;
}

/**
 * @internal
 *
 * Return shape of the lock-status read: `lock` is present only when `held`
 * is `true`.
 */
export type LockStatus =
  | { held: false }
  | { held: true; lock: MigrationLockDocument };
