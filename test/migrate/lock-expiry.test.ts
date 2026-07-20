import { randomUUID } from 'node:crypto';

import { Db } from 'mongodb';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';

import { Database } from '@/database';
import { acquireLock, getLockStatus, lockCollectionName } from '@/migrate/lock';
import type { MigrateConfig } from '@/types/migrate';

/**
 * Proves LOCK-02: an orphaned lock self-heals via the staleness re-evaluated
 * inside the atomic acquisition filter (`expiresAt: { $lt: now }`), never by
 * waiting on the TTL index's ~60s monitor (10-RESEARCH.md D-32/Pitfall 2). A
 * short `lockTtlMs` proves the real, filter-based recovery path
 * deterministically; the TTL index itself is only checked structurally, as
 * a backstop, never by waiting for a real expiry.
 */
describe('lock — expiry (LOCK-02, D-32)', () => {
  let db: Database;
  let nativeDb: Db;
  const config: MigrateConfig = { dir: '.', collection: '_lock_expiry_test' };

  beforeAll(async () => {
    db = new Database({
      uri: process.env.MONGODB_URI,
      dbName: process.env.MONGODB_DB_NAME,
    });

    await db.connect();
    nativeDb = db.getDb() as Db;
  });

  afterEach(async () => {
    await nativeDb.collection(lockCollectionName(config)).deleteMany({});
  });

  it('a lock past its short TTL is re-acquired by the next run via the filter', async () => {
    const shortConfig: MigrateConfig = { ...config, lockTtlMs: 150 };
    const firstOwner = randomUUID();
    const secondOwner = randomUUID();

    await acquireLock(nativeDb, shortConfig, firstOwner, {
      hostname: 'ci-runner-1',
      pid: 1111,
      operation: 'up',
    });

    // Wait past the short TTL — self-healing must come from the filter
    // re-evaluating staleness on the next attempt, never from the Mongo TTL
    // monitor (which only sweeps every ~60s).
    await new Promise((resolve) => setTimeout(resolve, 250));

    await expect(
      acquireLock(nativeDb, shortConfig, secondOwner, {
        hostname: 'ci-runner-2',
        pid: 2222,
        operation: 'down',
      })
    ).resolves.toBeUndefined();

    const status = await getLockStatus(db, shortConfig);

    expect(status.held).toBe(true);
    if (status.held) {
      expect(status.lock.ownerId).toBe(secondOwner);
      expect(status.lock.operation).toBe('down');
    }
  });

  it('the TTL index exists on expiresAt with expireAfterSeconds set to zero', async () => {
    await acquireLock(nativeDb, config, randomUUID(), {
      hostname: 'ci-runner-1',
      pid: 1111,
      operation: 'up',
    });

    const indexes = await nativeDb
      .collection(lockCollectionName(config))
      .listIndexes()
      .toArray();

    const ttlIndex = indexes.find(
      (index) => index.key?.expiresAt === 1 && 'expireAfterSeconds' in index
    );

    expect(ttlIndex).toBeDefined();
    expect(ttlIndex?.expireAfterSeconds).toBe(0);
  });
});
