import type { ClientSession, Db } from 'mongodb';
import { pathToFileURL } from 'node:url';

import { Database } from '@/database';
import {
  MongoatConnectionError,
  MongoatError,
  MongoatValidationError,
} from '@/errors';
import { computeChecksum } from '@/migrate/checksum';
import { discoverMigrations } from '@/migrate/discover';
import { MIGRATION_ERROR_CODES } from '@/migrate/errors';
import { createMigrationSchemaHelpers } from '@/migrate/schema-helpers';
import { assertReplicaSetOrThrow } from '@/migrate/topology';
import type {
  MigrateConfig,
  MigrationContext,
  MigrationModule,
  MigrationRecord,
  MigrationStatusRow,
} from '@/types/migrate';

type DiscoveredMigration = {
  filePath: string;
  name: string;
  version: string;
};

/**
 * @internal
 *
 * Same "fail loud before touching the driver" precondition guard already
 * established by `Database#withTransaction` — a migration operation
 * attempted against a disconnected `Database` must never silently no-op.
 */
function getNativeDbOrThrow(database: Database): Db {
  const nativeDb = database.getDb();

  if (!nativeDb) {
    throw new MongoatConnectionError(
      'Database not connected — call db.connect() first'
    );
  }

  return nativeDb;
}

/**
 * @internal
 *
 * Loads a migration file's `up`/`down` exports via a `file://` URL
 * (cross-platform safe, unlike a raw absolute path on Windows).
 */
async function importMigrationModule(
  filePath: string
): Promise<MigrationModule> {
  const moduleUrl = pathToFileURL(filePath).href;

  return (await import(/* @vite-ignore */ moduleUrl)) as MigrationModule;
}

/**
 * @internal
 *
 * Pitfall 4 — re-verifies the checksum of every ALREADY-applied migration
 * still present on disk, not just the migration about to run. Any drift
 * (a retroactive edit to an already-applied file) refuses to apply anything
 * pending until resolved.
 */
async function assertNoChecksumDrift(
  discovered: DiscoveredMigration[],
  appliedRecords: MigrationRecord[]
): Promise<void> {
  const discoveredByVersion = new Map(
    discovered.map((entry) => [entry.version, entry])
  );

  for (const record of appliedRecords) {
    const onDisk = discoveredByVersion.get(record.version);

    if (!onDisk) continue;

    const currentChecksum = await computeChecksum(onDisk.filePath);

    if (currentChecksum !== record.checksum) {
      throw new MongoatValidationError(
        `Migration "${record.version}_${record.name}" was modified after being applied — ` +
          'its checksum no longer matches the value recorded when it ran. Refusing to apply ' +
          'any pending migrations until this is resolved.',
        { code: MIGRATION_ERROR_CODES.MIGRATION_CHECKSUM_MISMATCH }
      );
    }
  }
}

/**
 * @internal
 *
 * Discovers pending migrations (discovered minus applied, in lexicographic
 * order, bounded by `toVersion` for `runTo`) — but only AFTER the drift
 * guard above has cleared the whole historical set.
 */
async function collectPending(
  nativeDb: Db,
  config: MigrateConfig,
  toVersion?: string
): Promise<DiscoveredMigration[]> {
  const discovered = await discoverMigrations(config.dir);
  const appliedRecords = await nativeDb
    .collection<MigrationRecord>(config.collection)
    .find({ status: 'applied' })
    .toArray();

  await assertNoChecksumDrift(discovered, appliedRecords);

  const appliedVersions = new Set(
    appliedRecords.map((record) => record.version)
  );

  return discovered.filter((entry) => {
    if (appliedVersions.has(entry.version)) return false;
    if (toVersion !== undefined && entry.version > toVersion) return false;

    return true;
  });
}

/**
 * @internal
 *
 * Runs `fn` with a bound `ClientSession` — inside `Database#withTransaction`
 * when the topology supports it (the default, fail-loud path), or against a
 * plain (non-transactional) session when the caller explicitly opted into
 * `allowNoTransaction` against a standalone server. `assertReplicaSetOrThrow`
 * itself never silently degrades — it is the caller's explicit config that
 * allows the non-transactional branch to run at all.
 */
async function runInSessionOrTransaction(
  database: Database,
  nativeDb: Db,
  config: MigrateConfig,
  fn: (session: ClientSession) => Promise<void>
): Promise<void> {
  const { hasReplicaSet } = await assertReplicaSetOrThrow(nativeDb, {
    allowNoTransaction: config.allowNoTransaction,
  });

  if (hasReplicaSet) {
    await database.withTransaction(fn);

    return;
  }

  const client = database.getClient();

  if (!client) {
    throw new MongoatConnectionError(
      'Database not connected — call db.connect() first'
    );
  }

  const session = client.startSession();

  try {
    await fn(session);
  } finally {
    await session.endSession();
  }
}

async function upsertRecord(
  nativeDb: Db,
  config: MigrateConfig,
  record: MigrationRecord
): Promise<void> {
  await nativeDb
    .collection<MigrationRecord>(config.collection)
    .updateOne({ version: record.version }, { $set: record }, { upsert: true });
}

/**
 * @internal
 *
 * Applies a single pending migration: builds `ctx` (native `db`, bound
 * `session`, `ctx.schema.*` helpers), runs `module.up(ctx)`, and records the
 * outcome. On success, upserts `{ status: 'applied' }` (D-02 idempotency —
 * `version` is the natural key, so a re-run of `runMigrations` never
 * duplicates the record). On failure, marks `{ status: 'failed' }` and
 * rethrows wrapped as `MIGRATION_FAILED` — D-03 fail-loud, no automatic DDL
 * rollback, the loop stops here.
 */
async function applyOne(
  database: Database,
  nativeDb: Db,
  entry: DiscoveredMigration,
  config: MigrateConfig
): Promise<void> {
  const migrationModule = await importMigrationModule(entry.filePath);
  const checksum = await computeChecksum(entry.filePath);

  const runUp = async (session: ClientSession): Promise<void> => {
    const ctx: MigrationContext = {
      db: nativeDb,
      schema: createMigrationSchemaHelpers(nativeDb),
      session,
    };

    return await migrationModule.up(ctx);
  };

  try {
    await runInSessionOrTransaction(database, nativeDb, config, runUp);
  } catch (err: unknown) {
    await upsertRecord(nativeDb, config, {
      version: entry.version,
      name: entry.name,
      checksum,
      appliedAt: new Date(),
      status: 'failed',
    });

    throw new MongoatError(
      `Migration "${entry.version}_${entry.name}" failed — recorded as "failed" in ` +
        `"${config.collection}" and stopped (no automatic DDL rollback, D-03). Resolve the ` +
        'cause and re-run, or revert via down().',
      { cause: err, code: MIGRATION_ERROR_CODES.MIGRATION_FAILED }
    );
  }

  await upsertRecord(nativeDb, config, {
    version: entry.version,
    name: entry.name,
    checksum,
    appliedAt: new Date(),
    status: 'applied',
  });
}

/**
 * @public
 *
 * Applies every pending migration found in `config.dir`, in ascending
 * lexicographic order, tracking applied state in `config.collection`
 * (default `_migrations`). Idempotent — a migration whose `version` is
 * already recorded as `applied` is never re-run. Before applying anything,
 * re-verifies the checksum of every already-applied migration still on disk
 * and refuses to proceed on any drift (`MIGRATION_CHECKSUM_MISMATCH`).
 *
 * Each migration's `up(ctx)` runs with a `ClientSession` bound to an active
 * MongoDB transaction (requires a replica set/mongos — see
 * `assertReplicaSetOrThrow`); `ctx.schema.*` calls never enlist that
 * session, so DDL (`collMod`/`createIndex`) is never part of the
 * transaction, per D-03. A failing migration is recorded `{ status: 'failed'
 * }` and the run stops — no automatic rollback of any DDL already applied.
 *
 * @param database - A connected `Database` instance.
 * @param config - Migration directory, control collection name, and the
 * `allowNoTransaction` opt-in.
 */
export async function runMigrations(
  database: Database,
  config: MigrateConfig
): Promise<void> {
  const nativeDb = getNativeDbOrThrow(database);
  const pending = await collectPending(nativeDb, config);

  for (const entry of pending) {
    await applyOne(database, nativeDb, entry, config);
  }
}

/**
 * @public
 *
 * Same as {@link runMigrations}, but only applies pending migrations whose
 * `version` is lexicographically `<= version` (D-01 ordering) — lets a
 * caller stop at a specific point in the migration history instead of
 * always applying everything pending.
 *
 * @param database - A connected `Database` instance.
 * @param version - The last version (inclusive) to apply, `YYYYMMDDHHMMSS`.
 * @param config - Migration directory, control collection name, and the
 * `allowNoTransaction` opt-in.
 */
export async function runTo(
  database: Database,
  version: string,
  config: MigrateConfig
): Promise<void> {
  const nativeDb = getNativeDbOrThrow(database);
  const pending = await collectPending(nativeDb, config, version);

  for (const entry of pending) {
    await applyOne(database, nativeDb, entry, config);
  }
}

/**
 * @public
 *
 * Reverts a single applied migration via its `down(ctx)` export, removing
 * its record from the control collection on success (D-02).
 *
 * A migration with no `down` export is irreversible by design (D-04): this
 * is checked BEFORE the control collection or the database connection is
 * ever touched (guard-precondition-first) — `revertMigration` throws
 * `MIGRATION_IRREVERSIBLE` purely from the on-disk module shape.
 *
 * @param database - A `Database` instance (only required to be connected if
 * the target migration turns out to be reversible).
 * @param version - The version to revert, `YYYYMMDDHHMMSS`.
 * @param config - Migration directory, control collection name, and the
 * `allowNoTransaction` opt-in.
 * @throws {MongoatValidationError} `MIGRATION_NOT_FOUND` when no migration
 * file exists for `version`, or when it is not currently recorded as
 * applied.
 * @throws {MongoatValidationError} `MIGRATION_IRREVERSIBLE` when the
 * migration has no `down` export.
 */
export async function revertMigration(
  database: Database,
  version: string,
  config: MigrateConfig
): Promise<void> {
  const discovered = await discoverMigrations(config.dir);
  const onDisk = discovered.find((entry) => entry.version === version);

  if (!onDisk) {
    throw new MongoatValidationError(
      `No migration file found for version "${version}" in "${config.dir}"`,
      { code: MIGRATION_ERROR_CODES.MIGRATION_NOT_FOUND }
    );
  }

  const migrationModule = await importMigrationModule(onDisk.filePath);
  const migrationDown = migrationModule.down;

  // Guard-precondition-first (D-04): reject an irreversible migration
  // BEFORE the control collection or the connection is ever touched.
  if (typeof migrationDown !== 'function') {
    throw new MongoatValidationError(
      `Migration "${onDisk.version}_${onDisk.name}" has no down() export — it is ` +
        'irreversible by design.',
      { code: MIGRATION_ERROR_CODES.MIGRATION_IRREVERSIBLE }
    );
  }

  const nativeDb = getNativeDbOrThrow(database);
  const recordCollection = nativeDb.collection<MigrationRecord>(
    config.collection
  );
  const record = await recordCollection.findOne({ version });

  if (!record) {
    throw new MongoatValidationError(
      `Migration "${onDisk.version}_${onDisk.name}" is not currently applied — nothing to ` +
        'revert.',
      { code: MIGRATION_ERROR_CODES.MIGRATION_NOT_FOUND }
    );
  }

  const runDown = async (session: ClientSession): Promise<void> => {
    const ctx: MigrationContext = {
      db: nativeDb,
      schema: createMigrationSchemaHelpers(nativeDb),
      session,
    };

    return await migrationDown(ctx);
  };

  try {
    await runInSessionOrTransaction(database, nativeDb, config, runDown);
  } catch (err: unknown) {
    throw new MongoatError(
      `Reverting migration "${onDisk.version}_${onDisk.name}" failed.`,
      { cause: err, code: MIGRATION_ERROR_CODES.MIGRATION_FAILED }
    );
  }

  await recordCollection.deleteOne({ version });
}

/**
 * @public
 *
 * Read-only migration status report: one row per discovered migration file,
 * paired with whatever applied-state is known about it. Unlike
 * `runMigrations`/`revertMigration`, this NEVER throws on checksum drift —
 * it only flags it (`drifted: true`) so a caller (e.g. the CLI's `status`
 * command) can surface a warning without blocking.
 *
 * @param database - A connected `Database` instance.
 * @param config - Migration directory and control collection name.
 */
export async function getStatus(
  database: Database,
  config: MigrateConfig
): Promise<MigrationStatusRow[]> {
  const nativeDb = getNativeDbOrThrow(database);
  const discovered = await discoverMigrations(config.dir);
  const appliedRecords = await nativeDb
    .collection<MigrationRecord>(config.collection)
    .find()
    .toArray();

  const appliedByVersion = new Map(
    appliedRecords.map((record) => [record.version, record])
  );

  const rows: MigrationStatusRow[] = [];

  for (const entry of discovered) {
    const record = appliedByVersion.get(entry.version);
    const row: MigrationStatusRow = {
      version: entry.version,
      name: entry.name,
      applied: Boolean(record),
    };

    if (record) {
      row.appliedAt = record.appliedAt;
      row.drifted = (await computeChecksum(entry.filePath)) !== record.checksum;
    }

    rows.push(row);
  }

  return rows;
}
