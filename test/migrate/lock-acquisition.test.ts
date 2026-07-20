import { randomUUID } from 'node:crypto';

import { Db } from 'mongodb';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { Database } from '@/database';
import { MongoatError } from '@/errors';
import { acquireLock, getLockStatus, lockCollectionName } from '@/migrate/lock';
import type { MigrateConfig } from '@/types/migrate';

/**
 * Proves LOCK-01's core acquisition behavior against a real MongoDB: a free
 * lock is acquired successfully, and a SEQUENTIAL attempt (no concurrency
 * involved) against an already-active lock also fails loud with
 * `MIGRATION_LOCK_HELD` — the E11000 signal is deterministic whenever the
 * filter does not match an existing `_id`, not only under a genuine race
 * (10-RESEARCH.md Open Question 1).
 */
describe('lock — acquisition (LOCK-01)', () => {
  let db: Database;
  let nativeDb: Db;
  const config: MigrateConfig = { dir: '.', collection: '_lock_acq_test' };

  beforeAll(async () => {
    db = new Database({
      uri: process.env.MONGODB_URI,
      dbName: process.env.MONGODB_DB_NAME,
    });

    await db.connect();
    nativeDb = db.getDb() as Db;
  });

  // WR-05: the sibling suites in this phase (lock-release.test.ts,
  // graceful-stop.test.ts) already disconnect in afterAll — without it here,
  // this suite's `MongoClient` keeps sockets/monitors open past the last
  // test, which can hang the vitest worker process.
  afterAll(async () => {
    await db.disconnect();
  });

  afterEach(async () => {
    await nativeDb.collection(lockCollectionName(config)).deleteMany({});
  });

  it('acquires a free lock and getLockStatus reflects the new owner', async () => {
    const ownerId = randomUUID();

    await expect(
      acquireLock(nativeDb, config, ownerId, {
        hostname: 'ci-runner-1',
        pid: 1111,
        operation: 'up',
      })
    ).resolves.toBeUndefined();

    const status = await getLockStatus(db, config);

    expect(status.held).toBe(true);
    if (status.held) {
      expect(status.lock.ownerId).toBe(ownerId);
      expect(status.lock.hostname).toBe('ci-runner-1');
      expect(status.lock.pid).toBe(1111);
      expect(status.lock.operation).toBe('up');
    }
  });

  it('rejects a sequential acquisition attempt against an already-active lock', async () => {
    const firstOwner = randomUUID();
    const secondOwner = randomUUID();

    await acquireLock(nativeDb, config, firstOwner, {
      hostname: 'ci-runner-1',
      pid: 1111,
      operation: 'up',
    });

    let caught: unknown;

    try {
      await acquireLock(nativeDb, config, secondOwner, {
        hostname: 'ci-runner-2',
        pid: 2222,
        operation: 'down',
      });
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(MongoatError);
    const err = caught as MongoatError;

    expect(err.code).toBe('MIGRATION_LOCK_HELD');
    expect(err.message).toContain('held by');
    expect(err.message).toContain('mongoat unlock');
  });

  it('the MIGRATION_LOCK_HELD message never cites internal planning IDs', async () => {
    const firstOwner = randomUUID();
    const secondOwner = randomUUID();

    await acquireLock(nativeDb, config, firstOwner, {
      hostname: 'ci-runner-1',
      pid: 1111,
      operation: 'up',
    });

    let caught: unknown;

    try {
      await acquireLock(nativeDb, config, secondOwner, {
        hostname: 'ci-runner-2',
        pid: 2222,
        operation: 'up',
      });
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(MongoatError);
    const err = caught as MongoatError;

    expect(err.message).not.toMatch(/\bD-\d/);
    expect(err.message).not.toMatch(/\bLOCK-\d/);
    expect(err.message).not.toMatch(/Fase 10/);
  });
});
