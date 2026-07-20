import { Db, MongoServerError } from 'mongodb';

import { MongoatError } from '@/errors';
import { runBestEffort } from '@/errors/suppress';
import { MIGRATION_ERROR_CODES } from '@/migrate/errors';
import type { MigrateConfig, MigrationLockDocument } from '@/types/migrate';

/**
 * @internal
 *
 * Fixed `_id` of the singleton lock document. Exclusivity comes from
 * MongoDB's native `_id` index — no extra unique index is needed. This value
 * must stay stable forever: changing it would orphan any lock currently in
 * flight across a rolling deploy.
 */
export const LOCK_DOCUMENT_ID = 'lock';

/**
 * @internal
 *
 * Fallback lock TTL (30 minutes, in milliseconds) applied whenever a caller
 * does not set `config.lockTtlMs` — generous enough for long-running data
 * migrations without requiring a heartbeat/lease renewal mechanism.
 */
export const DEFAULT_LOCK_TTL_MS = 30 * 60 * 1000;

/**
 * @internal
 *
 * Derives the lock collection name from the control collection name
 * (`{collection}_lock`, e.g. the default `_migrations` becomes
 * `_migrations_lock`). An unusual control-collection name that already ends
 * in `_lock` simply yields a `_lock_lock` suffix here — there is no special
 * casing for that, it is not a realistic naming collision in practice.
 */
export function lockCollectionName(config: MigrateConfig): string {
  return `${config.collection}_lock`;
}

/**
 * @internal
 *
 * Formats the same "who holds the lock, since when, until when" diagnostic
 * line reused verbatim in three places: the `MIGRATION_LOCK_HELD` error
 * message, the dry-run output of the manual unlock command, and the lock row
 * of the status report.
 */
export function formatLockDiagnostic(lock: MigrationLockDocument): string {
  return (
    `held by ${lock.hostname} (pid ${lock.pid}, ${lock.operation}) ` +
    `since ${lock.acquiredAt.toISOString()}, expires ${lock.expiresAt.toISOString()}`
  );
}

/**
 * @internal
 *
 * A lock document read back from MongoDB is only trustworthy once its
 * `expiresAt` is confirmed to be an actual, valid `Date` — a document
 * written by hand, by a future/incompatible version, or otherwise corrupted
 * could carry a string, a missing field, or an invalid `Date`. Any acquire
 * or status-read decision that depends on `expiresAt` must go through this
 * check first, never trust the field's presence blindly.
 */
function hasValidExpiresAt(
  lock: MigrationLockDocument | null
): lock is MigrationLockDocument {
  return (
    lock !== null &&
    lock.expiresAt instanceof Date &&
    !Number.isNaN(lock.expiresAt.getTime())
  );
}

/**
 * @internal
 *
 * Acquires the exclusive migration run lock, atomically. Always the same
 * `findOneAndUpdate` upsert against the singleton document (`_id:
 * LOCK_DOCUMENT_ID`) with a staleness filter (`expiresAt: { $lt: now }`) —
 * there is no separate "lock never existed" vs. "lock expired" code path,
 * `upsert: true` covers both by inserting whenever nothing matches.
 *
 * When a document with `_id: LOCK_DOCUMENT_ID` already exists and does NOT
 * satisfy the staleness filter (i.e. it is actively held), the upsert falls
 * through to its insert path and collides on `_id`, and the driver throws
 * `MongoServerError` with `code: 11000`. This is the PRIMARY signal for
 * "lock held" under this filter shape — it happens deterministically
 * whenever an active lock is contended, not only under a genuine race — and
 * is always mapped to `MIGRATION_LOCK_HELD` here, never left to leak as a
 * raw driver error.
 *
 * Also lazily ensures an "expire at a specific clock time" TTL index on
 * `expiresAt` exists on the lock collection — purely a garbage-collection
 * backstop for an abandoned lock document that nobody ever tries to
 * re-acquire; the staleness filter above (re-evaluated on every attempt) is
 * always the real source of truth, never this index.
 *
 * @param nativeDb - The connected native `Db`.
 * @param config - Resolved migration config (collection name, lock TTL).
 * @param ownerId - Unique per-run identifier — the only proof of ownership
 * used by {@link releaseIfOwner}.
 * @param diagnostics - Non-authoritative metadata recorded on the lock
 * document purely for human diagnosis (`hostname`, `pid`, `operation`).
 * @throws {MongoatError} With `code: 'MIGRATION_LOCK_HELD'` when the lock is
 * already held by another run, or when the existing lock document cannot be
 * reliably parsed.
 */
export async function acquireLock(
  nativeDb: Db,
  config: MigrateConfig,
  ownerId: string,
  diagnostics: { hostname: string; pid: number; operation: string }
): Promise<void> {
  const lockCollection = nativeDb.collection<MigrationLockDocument>(
    lockCollectionName(config)
  );

  // GC backstop only — never the source of truth for staleness (that is
  // always re-evaluated in the filter below, on every acquisition attempt).
  // `createIndex` is idempotent for an identical spec, so calling it here on
  // every acquisition is a no-op after the first.
  await lockCollection.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });

  const now = new Date();
  const ttlMs = config.lockTtlMs ?? DEFAULT_LOCK_TTL_MS;
  const expiresAt = new Date(now.getTime() + ttlMs);

  try {
    await lockCollection.findOneAndUpdate(
      { _id: LOCK_DOCUMENT_ID, expiresAt: { $lt: now } },
      {
        $set: {
          ownerId,
          hostname: diagnostics.hostname,
          pid: diagnostics.pid,
          operation: diagnostics.operation,
          acquiredAt: now,
          expiresAt,
        },
      },
      { upsert: true, returnDocument: 'after' }
    );
  } catch (err: unknown) {
    if (err instanceof MongoServerError && err.code === 11000) {
      const existing = await lockCollection.findOne({
        _id: LOCK_DOCUMENT_ID,
      });

      if (existing === null) {
        // The other owner released the lock between our collision and this
        // reread — genuine contention, but nothing left to diagnose.
        throw new MongoatError(
          'The migration lock was held but was released before it could be inspected — retry ' +
            'the run.',
          { cause: err, code: MIGRATION_ERROR_CODES.MIGRATION_LOCK_HELD }
        );
      }

      if (!hasValidExpiresAt(existing)) {
        // Conservative posture: an unrecognizable lock document is treated
        // as held, never "stolen" — see hasValidExpiresAt above.
        throw new MongoatError(
          'The migration lock document could not be read (missing or invalid "expiresAt") — ' +
            'treating it as held rather than risk a concurrent run. If you are certain no ' +
            'migration is currently running, run `mongoat unlock`.',
          { cause: err, code: MIGRATION_ERROR_CODES.MIGRATION_LOCK_HELD }
        );
      }

      throw new MongoatError(
        `Migration lock is ${formatLockDiagnostic(existing)}. Wait for it to expire, or if ` +
          'the owning process died, run `mongoat unlock`.',
        { cause: err, code: MIGRATION_ERROR_CODES.MIGRATION_LOCK_HELD }
      );
    }

    throw err;
  }
}

/**
 * @internal
 *
 * Releases the lock, best-effort, only if `ownerId` still matches the
 * document currently on record — filtering by `ownerId` guarantees a run
 * whose own TTL already lapsed (and whose lock another runner has since
 * acquired) can never delete a lock it no longer owns. Never throws; the
 * caller decides what to do with a failed release (e.g. a loud warning —
 * this function itself never writes to stderr nor throws).
 */
export async function releaseIfOwner(
  nativeDb: Db,
  config: MigrateConfig,
  ownerId: string
): Promise<{ ok: true } | { ok: false; error: unknown }> {
  return runBestEffort(async () => {
    await nativeDb
      .collection<MigrationLockDocument>(lockCollectionName(config))
      .deleteOne({ _id: LOCK_DOCUMENT_ID, ownerId });
  });
}
