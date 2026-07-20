import { randomUUID } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { hostname, tmpdir } from 'node:os';
import path from 'node:path';

import { Db } from 'mongodb';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from 'vitest';

import { Database } from '@/database';
import {
  acquireLock,
  getLockStatus,
  LOCK_DOCUMENT_ID,
  lockCollectionName,
} from '@/migrate/lock';
import { runMigrations } from '@/migrate/runner';
import type { MigrateConfig, MigrationLockDocument } from '@/types/migrate';

/**
 * Polls the lock collection until a document exists — avoids racing real
 * wall-clock timers against `acquireLock`'s own async work (unreliable
 * under a busy shared test run, per the flake this replaced).
 */
async function waitForLockDocument(
  nativeDb: Db,
  config: MigrateConfig
): Promise<void> {
  const collection = nativeDb.collection<MigrationLockDocument>(
    lockCollectionName(config)
  );
  const deadline = Date.now() + 5_000;

  while (Date.now() < deadline) {
    const existing = await collection.findOne({ _id: LOCK_DOCUMENT_ID });

    if (existing) return;

    await new Promise((resolve) => setTimeout(resolve, 10));
  }

  throw new Error('timed out waiting for the lock document to appear');
}

/**
 * WR-04 — `releaseIfOwner`'s `deleteOne({ _id, ownerId })` matching ZERO
 * documents (`released: false`) is the only observable signal that this
 * run's lease expired mid-run and another runner has since acquired the
 * lock — a real LOCK-01 mutual-exclusion violation. Before the fix, the
 * runner silently discarded this signal and reported a plain success.
 *
 * Proves the full path against a real MongoDB: while a slow migration is
 * still in flight, the lock document's `expiresAt` is forced into the past
 * directly (deterministic — never a race against a short TTL and real
 * timers), then a second `acquireLock` call (simulating a second runner)
 * legitimately re-acquires the now-stale lock. The first run's own release
 * then matches nothing, and `runMigrations` — which still resolves
 * successfully, since the migration itself never failed — must emit
 * `MongoatLockLeaseExpiredWarning`.
 */
describe('runner — lock lease expiry during a run emits a warning (WR-04)', () => {
  let db: Database;
  let nativeDb: Db;
  let dir: string;
  let config: MigrateConfig;

  beforeAll(async () => {
    db = new Database({
      uri: process.env.MONGODB_URI,
      dbName: process.env.MONGODB_DB_NAME,
    });

    await db.connect();
    nativeDb = db.getDb() as Db;
  });

  afterAll(async () => {
    await db.disconnect();
  });

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'mongoat-lease-expiry-'));
    config = { dir, collection: '_migrations_lease_expiry_test' };
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
    await nativeDb.collection(config.collection).deleteMany({});
    await nativeDb.collection(lockCollectionName(config)).deleteMany({});
  });

  it('emits MongoatLockLeaseExpiredWarning when the lease is stolen mid-run, and the run still resolves', async () => {
    await writeFile(
      path.join(dir, '20260301120000_slow.ts'),
      `export async function up(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 500));
}
`
    );

    const warnings: Error[] = [];
    const onWarning = (warning: Error): void => {
      warnings.push(warning);
    };

    process.on('warning', onWarning);

    const runPromise = runMigrations(db, config);

    // Deterministic instead of racing a short TTL against real timers: wait
    // for the first runner's lock document to exist, then force it stale
    // directly — the exact staleness shape `acquireLock`'s own filter
    // (`expiresAt: { $lt: now }`) already re-evaluates on every attempt.
    await waitForLockDocument(nativeDb, config);
    await nativeDb
      .collection<MigrationLockDocument>(lockCollectionName(config))
      .updateOne(
        { _id: LOCK_DOCUMENT_ID },
        { $set: { expiresAt: new Date(Date.now() - 1_000) } }
      );

    // Long TTL for the SECOND runner's own lock — it must still be held by
    // the time this test's final assertions run, well after the first run's
    // still-in-flight migration finishes.
    await acquireLock(
      nativeDb,
      { ...config, lockTtlMs: 60_000 },
      randomUUID(),
      {
        hostname: hostname(),
        pid: process.pid,
        operation: 'up (second runner)',
      }
    );

    await expect(runPromise).resolves.toBeUndefined();

    // `process.emitWarning` dispatches the `warning` event asynchronously —
    // give it a chance to fire before asserting.
    await new Promise((resolve) => setImmediate(resolve));
    process.off('warning', onWarning);

    const leaseWarning = warnings.find(
      (warning) => warning.name === 'MongoatLockLeaseExpiredWarning'
    );

    expect(leaseWarning).toBeDefined();
    expect(leaseWarning?.message).not.toMatch(/\bD-\d/);
    expect(leaseWarning?.message).not.toMatch(/\bWR-\d/);

    // The lock is still held — by the second runner, never released by the
    // first run's now-mismatched ownerId.
    const status = await getLockStatus(db, config);

    expect(status.held).toBe(true);
    if (status.held) {
      expect(status.lock.operation).toBe('up (second runner)');
    }
  });
});
