import type { ClientSession, Db } from 'mongodb';
import { randomUUID } from 'node:crypto';
import { hostname } from 'node:os';
import { pathToFileURL } from 'node:url';

import { Database } from '@/database';
import {
  MongoatConnectionError,
  MongoatError,
  MongoatValidationError,
} from '@/errors';
import { attachSuppressed, runBestEffort } from '@/errors/suppress';
import { computeChecksum } from '@/migrate/checksum';
// WR-02: moved to its own leaf module — `getNativeDbOrThrow` used to live
// here and be imported by `@/migrate/lock`, which THIS module also imports
// from (`acquireLock`/`releaseIfOwner` below): a real `runner.ts ↔ lock.ts`
// import cycle, despite a since-removed comment here claiming otherwise.
// Re-exported for backward-compatible internal call sites.
import { getNativeDbOrThrow } from '@/migrate/db';
import { discoverMigrations } from '@/migrate/discover';
import { MIGRATION_ERROR_CODES } from '@/migrate/errors';
import { acquireLock, releaseIfOwner } from '@/migrate/lock';
import { createMigrationSchemaHelpers } from '@/migrate/schema-helpers';
import { assertReplicaSetOrThrow } from '@/migrate/topology';
import type {
  MigrateConfig,
  MigrationContext,
  MigrationModule,
  MigrationRecord,
  MigrationStatusRow,
} from '@/types/migrate';

export { getNativeDbOrThrow } from '@/migrate/db';

type DiscoveredMigration = {
  filePath: string;
  name: string;
  version: string;
};

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
 * `allowNoTransaction` against a standalone server.
 *
 * CR-01 fix: `hasReplicaSet` is now RESOLVED ONCE by the caller (via
 * `assertReplicaSetOrThrow`, called before the apply loop and outside any
 * failure-recording `try`) and threaded down here — this function no longer
 * re-probes the topology per migration, and a `REPLICA_SET_REQUIRED` failure
 * can never originate from inside this function anymore, so it can never be
 * misclassified as a migration failure by `applyOne`'s catch block.
 */
async function runInSessionOrTransaction(
  database: Database,
  hasReplicaSet: boolean,
  fn: (session: ClientSession) => Promise<void>
): Promise<void> {
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
 *
 * `hasReplicaSet` is the ALREADY-RESOLVED topology decision from the caller
 * (`runMigrations`/`runTo`) — CR-01 fix: the topology precondition itself
 * never runs inside this function's `try`, so a `REPLICA_SET_REQUIRED`
 * failure can never be caught here and misrecorded as a `failed` migration.
 */
async function applyOne(
  database: Database,
  nativeDb: Db,
  entry: DiscoveredMigration,
  config: MigrateConfig,
  hasReplicaSet: boolean
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
    await runInSessionOrTransaction(database, hasReplicaSet, runUp);
  } catch (err: unknown) {
    const writeResult = await runBestEffort(() =>
      upsertRecord(nativeDb, config, {
        version: entry.version,
        name: entry.name,
        checksum,
        appliedAt: new Date(),
        status: 'failed',
      })
    );

    const wrapped = new MongoatError(
      writeResult.ok
        ? `Migration "${entry.version}_${entry.name}" failed — recorded as "failed" in ` +
            `"${config.collection}" and stopped (no automatic DDL rollback). Resolve the cause ` +
            'and re-run, or revert via down().'
        : `Migration "${entry.version}_${entry.name}" failed AND its "failed" status could ` +
            `NOT be persisted to "${config.collection}" — mongoat status will show it as ` +
            'pending. Resolve the underlying cause (see the original error) before re-running.',
      { cause: err, code: MIGRATION_ERROR_CODES.MIGRATION_FAILED }
    );

    if (!writeResult.ok) attachSuppressed(wrapped, writeResult.error);

    throw wrapped;
  }

  try {
    await upsertRecord(nativeDb, config, {
      version: entry.version,
      name: entry.name,
      checksum,
      appliedAt: new Date(),
      status: 'applied',
    });
  } catch (writeErr: unknown) {
    throw new MongoatError(
      `Migration "${entry.version}_${entry.name}" ran successfully, but its "applied" ` +
        `status could NOT be persisted to "${config.collection}" — the runner will treat it ` +
        'as pending on the next run. Do NOT re-run without first verifying the effects of ' +
        'this migration manually.',
      {
        cause: writeErr,
        code: MIGRATION_ERROR_CODES.MIGRATION_STATE_WRITE_FAILED,
      }
    );
  }
}

/**
 * @internal
 *
 * WR-04: `releaseIfOwner`'s `released: false` (with `ok: true`, i.e. the
 * delete itself did not error) is the ONLY observable signal that this
 * run's lease expired mid-run and another runner has since acquired the
 * lock — a real LOCK-01 mutual-exclusion violation, possibly still in
 * flight concurrently right now. Silently discarding it (as the pre-fix
 * code did) leaves an operator with zero indication anything went wrong.
 * Never called for a driver-error release failure (`ok: false`) — that case
 * already gets its own `MongoatLockReleaseWarning` at each call site.
 */
function warnIfLeaseExpiredDuringRun(
  releaseResult: { ok: true; released: boolean } | { ok: false; error: unknown },
  operation: 'run' | 'revert'
): void {
  if (!releaseResult.ok || releaseResult.released) return;

  process.emitWarning(
    `[mongoat] This migration ${operation}'s lock lease expired before it finished — another ` +
      'runner may have acquired the lock and executed concurrently while this run was still ' +
      'in flight. Consider a longer --lock-ttl if this recurs.',
    { type: 'MongoatLockLeaseExpiredWarning' }
  );
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
 * Acquires an exclusive run lock before reading any migration state and
 * releases it once the run finishes (successfully, on failure, or on
 * `config.signal` abort) — this guarantees two concurrent runs against the
 * same control collection can never act on the same snapshot of pending
 * migrations.
 *
 * Each migration's `up(ctx)` runs with a `ClientSession` bound to an active
 * MongoDB transaction (requires a replica set/mongos — see
 * `assertReplicaSetOrThrow`); `ctx.schema.*` calls never enlist that
 * session, so DDL (`collMod`/`createIndex`) is never part of the
 * transaction, per D-03. A failing migration is recorded `{ status: 'failed'
 * }` and the run stops — no automatic rollback of any DDL already applied.
 *
 * CR-01 fix: the topology precondition (`assertReplicaSetOrThrow`) runs
 * ONCE here, before the apply loop and OUTSIDE any failure-recording `try` —
 * a `REPLICA_SET_REQUIRED` failure propagates to the caller UNWRAPPED (own
 * `.code`, actionable message) and never persists a bogus `failed` record
 * for a migration that never ran.
 *
 * @param database - A connected `Database` instance.
 * @param config - Migration directory, control collection name, the
 * `allowNoTransaction` opt-in, an optional `lockTtlMs`, and an optional
 * graceful-stop `signal`.
 */
export async function runMigrations(
  database: Database,
  config: MigrateConfig
): Promise<void> {
  const nativeDb = getNativeDbOrThrow(database);
  // Precondition — never recorded as a migration failure (CR-01).
  const { hasReplicaSet } = await assertReplicaSetOrThrow(nativeDb, {
    allowNoTransaction: config.allowNoTransaction,
  });

  // Own lock ownership token for this run — the only proof `releaseIfOwner`
  // trusts, so a run whose TTL already lapsed can never delete a lock
  // another runner has since acquired.
  const ownerId = randomUUID();

  // Acquired BEFORE any state read (collectPending below) — reading state
  // first would reopen the TOCTOU window two concurrent runners could
  // exploit (D-13). No release needed here: if this throws, the lock was
  // never ours.
  await acquireLock(nativeDb, config, ownerId, {
    hostname: hostname(),
    pid: process.pid,
    operation: 'up',
  });

  try {
    const pending = await collectPending(nativeDb, config);

    for (const [index, entry] of pending.entries()) {
      // Checked ONLY between migrations, never mid-`applyOne` — an abort
      // must never interrupt DDL/a transaction halfway through.
      if (config.signal?.aborted) {
        throw new MongoatError(
          `Migration run aborted before applying "${entry.version}_${entry.name}" — ` +
            `${pending.length - index} migration(s) still pending.`,
          { code: MIGRATION_ERROR_CODES.MIGRATION_ABORTED }
        );
      }

      await applyOne(database, nativeDb, entry, config, hasReplicaSet);
    }
  } catch (primary: unknown) {
    const releaseResult = await releaseIfOwner(nativeDb, config, ownerId);

    // The primary error always wins — a failed release is threaded onto it
    // as a suppressed secondary, never thrown in its place.
    if (!releaseResult.ok && primary instanceof MongoatError) {
      attachSuppressed(primary, releaseResult.error);
    }

    warnIfLeaseExpiredDuringRun(releaseResult, 'run');

    throw primary;
  }

  const releaseResult = await releaseIfOwner(nativeDb, config, ownerId);

  if (!releaseResult.ok) {
    // The run itself succeeded — a failed release must never turn a
    // successful run into a rejection (the public return type stays
    // `Promise<void>`). Surfaced as a non-fatal process warning, the same
    // channel `attachSuppressed` uses; the lock self-heals on TTL expiry, or
    // `mongoat unlock` clears it immediately.
    process.emitWarning(
      '[mongoat] Migration run succeeded, but releasing the run lock afterwards failed — ' +
        'it remains held until its TTL expires. Run `mongoat unlock` if this recurs.',
      { type: 'MongoatLockReleaseWarning' }
    );
  }

  warnIfLeaseExpiredDuringRun(releaseResult, 'run');
}

/**
 * @public
 *
 * Same as {@link runMigrations}, but only applies pending migrations whose
 * `version` is lexicographically `<= version` (D-01 ordering) — lets a
 * caller stop at a specific point in the migration history instead of
 * always applying everything pending. Acquires and releases the same
 * exclusive run lock as {@link runMigrations}, under the same ordering
 * guarantees.
 *
 * CR-01 fix: same as {@link runMigrations} — the topology precondition runs
 * once, before the apply loop, and propagates `REPLICA_SET_REQUIRED`
 * unwrapped.
 *
 * @param database - A connected `Database` instance.
 * @param version - The last version (inclusive) to apply, `YYYYMMDDHHMMSS`.
 * @param config - Migration directory, control collection name, the
 * `allowNoTransaction` opt-in, an optional `lockTtlMs`, and an optional
 * graceful-stop `signal`.
 */
export async function runTo(
  database: Database,
  version: string,
  config: MigrateConfig
): Promise<void> {
  const nativeDb = getNativeDbOrThrow(database);
  // Precondition — never recorded as a migration failure (CR-01).
  const { hasReplicaSet } = await assertReplicaSetOrThrow(nativeDb, {
    allowNoTransaction: config.allowNoTransaction,
  });

  const ownerId = randomUUID();

  // Acquired BEFORE any state read (collectPending below) — same TOCTOU
  // guard as runMigrations (D-13).
  await acquireLock(nativeDb, config, ownerId, {
    hostname: hostname(),
    pid: process.pid,
    operation: `to ${version}`,
  });

  try {
    const pending = await collectPending(nativeDb, config, version);

    for (const [index, entry] of pending.entries()) {
      // Checked ONLY between migrations, never mid-`applyOne`.
      if (config.signal?.aborted) {
        throw new MongoatError(
          `Migration run aborted before applying "${entry.version}_${entry.name}" — ` +
            `${pending.length - index} migration(s) still pending.`,
          { code: MIGRATION_ERROR_CODES.MIGRATION_ABORTED }
        );
      }

      await applyOne(database, nativeDb, entry, config, hasReplicaSet);
    }
  } catch (primary: unknown) {
    const releaseResult = await releaseIfOwner(nativeDb, config, ownerId);

    if (!releaseResult.ok && primary instanceof MongoatError) {
      attachSuppressed(primary, releaseResult.error);
    }

    warnIfLeaseExpiredDuringRun(releaseResult, 'run');

    throw primary;
  }

  const releaseResult = await releaseIfOwner(nativeDb, config, ownerId);

  if (!releaseResult.ok) {
    // Same non-fatal warning channel as runMigrations — the run succeeded,
    // the release did not.
    process.emitWarning(
      '[mongoat] Migration run succeeded, but releasing the run lock afterwards failed — ' +
        'it remains held until its TTL expires. Run `mongoat unlock` if this recurs.',
      { type: 'MongoatLockReleaseWarning' }
    );
  }

  warnIfLeaseExpiredDuringRun(releaseResult, 'run');
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
 * Acquires the same exclusive run lock as {@link runMigrations}/{@link
 * runTo} once every precondition above has cleared, and releases it once the
 * revert finishes (successfully or on failure).
 *
 * @param database - A `Database` instance (only required to be connected if
 * the target migration turns out to be reversible).
 * @param version - The version to revert, `YYYYMMDDHHMMSS`.
 * @param config - Migration directory, control collection name, the
 * `allowNoTransaction` opt-in, and an optional `lockTtlMs`.
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

  // Precondition — CR-01 fix: resolved BEFORE the failure-recording `try`
  // below, so `REPLICA_SET_REQUIRED` propagates to the caller unwrapped
  // (own `.code`, actionable message) instead of being demoted to `.cause`
  // under `MIGRATION_FAILED`.
  const { hasReplicaSet } = await assertReplicaSetOrThrow(nativeDb, {
    allowNoTransaction: config.allowNoTransaction,
  });

  const ownerId = randomUUID();

  // Acquired AFTER every read-only precondition above (down-export guard,
  // connection, applied-record lookup, topology) and BEFORE any mutation —
  // same D-13 ordering as runMigrations/runTo.
  await acquireLock(nativeDb, config, ownerId, {
    hostname: hostname(),
    pid: process.pid,
    operation: `down ${version}`,
  });

  const runDown = async (session: ClientSession): Promise<void> => {
    const ctx: MigrationContext = {
      db: nativeDb,
      schema: createMigrationSchemaHelpers(nativeDb),
      session,
    };

    return await migrationDown(ctx);
  };

  try {
    // WR-03: mirrors the same signal guard `runMigrations`/`runTo` already
    // apply before their first migration — a signal already aborted by the
    // time the lock was acquired (e.g. a SIGINT received during `connect()`/
    // preconditions/lock acquisition itself) must not let `down()` run.
    // Checked ONLY here, never mid-`runInSessionOrTransaction` — an abort
    // must never interrupt DDL/a transaction halfway through.
    if (config.signal?.aborted) {
      throw new MongoatError(
        `Migration revert aborted before reverting "${onDisk.version}_${onDisk.name}".`,
        { code: MIGRATION_ERROR_CODES.MIGRATION_ABORTED }
      );
    }

    try {
      await runInSessionOrTransaction(database, hasReplicaSet, runDown);
    } catch (err: unknown) {
      throw new MongoatError(
        `Reverting migration "${onDisk.version}_${onDisk.name}" failed.`,
        { cause: err, code: MIGRATION_ERROR_CODES.MIGRATION_FAILED }
      );
    }

    try {
      await recordCollection.deleteOne({ version });
    } catch (writeErr: unknown) {
      throw new MongoatError(
        `Migration "${onDisk.version}_${onDisk.name}" was reverted successfully, but its ` +
          `record could NOT be removed from "${config.collection}" — it will continue to be ` +
          'tracked as applied. Do NOT re-run down() without first verifying the effects of ' +
          'this revert manually.',
        {
          cause: writeErr,
          code: MIGRATION_ERROR_CODES.MIGRATION_STATE_WRITE_FAILED,
        }
      );
    }
  } catch (primary: unknown) {
    const releaseResult = await releaseIfOwner(nativeDb, config, ownerId);

    if (!releaseResult.ok && primary instanceof MongoatError) {
      attachSuppressed(primary, releaseResult.error);
    }

    warnIfLeaseExpiredDuringRun(releaseResult, 'revert');

    throw primary;
  }

  const releaseResult = await releaseIfOwner(nativeDb, config, ownerId);

  if (!releaseResult.ok) {
    // Same non-fatal warning channel as runMigrations/runTo — the revert
    // succeeded, the release did not.
    process.emitWarning(
      '[mongoat] Migration revert succeeded, but releasing the run lock afterwards failed — ' +
        'it remains held until its TTL expires. Run `mongoat unlock` if this recurs.',
      { type: 'MongoatLockReleaseWarning' }
    );
  }

  warnIfLeaseExpiredDuringRun(releaseResult, 'revert');
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
 * WR-01 fix: `row.applied` is `true` only for a record whose
 * `status === 'applied'` — reconciled with `collectPending`'s own
 * `find({ status: 'applied' })`, so a migration is never simultaneously
 * "applied" in `status` and "pending" for `up`. A `status: 'failed'` record
 * is surfaced distinctly via `row.failed`, never rendered as `applied`.
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
    const isApplied = record?.status === 'applied';
    const row: MigrationStatusRow = {
      version: entry.version,
      name: entry.name,
      applied: isApplied,
    };

    if (record) {
      row.appliedAt = record.appliedAt;
      row.failed = record.status === 'failed';

      if (isApplied) {
        row.drifted =
          (await computeChecksum(entry.filePath)) !== record.checksum;
      }
    }

    rows.push(row);
  }

  return rows;
}
