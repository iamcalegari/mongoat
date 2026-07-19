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
   * `status: 'failed'` — distinct from `applied` (WR-01: a failed record is
   * never rendered as `applied`). */
  failed?: boolean;
  name: string;
  version: string;
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
}
