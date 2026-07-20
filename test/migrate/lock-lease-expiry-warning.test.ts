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
import { acquireLock, getLockStatus, lockCollectionName } from '@/migrate/lock';
import { runMigrations } from '@/migrate/runner';
import type { MigrateConfig } from '@/types/migrate';

/**
 * WR-04 — `releaseIfOwner`'s `deleteOne({ _id, ownerId })` matching ZERO
 * documents (`released: false`) is the only observable signal that this
 * run's lease expired mid-run and another runner has since acquired the
 * lock — a real LOCK-01 mutual-exclusion violation. Before the fix, the
 * runner silently discarded this signal and reported a plain success.
 *
 * Proves the full path against a real MongoDB: a slow migration outlives a
 * deliberately short `lockTtlMs`; while it is still in flight, a second
 * `acquireLock` call (simulating a second runner) legitimately re-acquires
 * the now-stale lock. The first run's own release then matches nothing, and
 * `runMigrations` — which still resolves successfully, since the migration
 * itself never failed — must emit `MongoatLockLeaseExpiredWarning`.
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
    config = {
      dir,
      collection: '_migrations_lease_expiry_test',
      lockTtlMs: 150,
    };
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
  await new Promise((resolve) => setTimeout(resolve, 400));
}
`
    );

    const warnings: Error[] = [];
    const onWarning = (warning: Error): void => {
      warnings.push(warning);
    };

    process.on('warning', onWarning);

    const runPromise = runMigrations(db, config);

    // Wait past the short TTL, then re-acquire the now-stale lock as a
    // second runner — the same filter-based staleness recovery LOCK-02
    // already proves, deliberately raced against the still-running
    // migration above.
    await new Promise((resolve) => setTimeout(resolve, 250));

    // Long TTL for the SECOND runner's own lock — it must still be held by
    // the time this test's final assertions run, well after the short-TTL
    // first run's migration finishes.
    await acquireLock(
      nativeDb,
      { ...config, lockTtlMs: 60_000 },
      randomUUID(),
      { hostname: hostname(), pid: process.pid, operation: 'up (second runner)' }
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
