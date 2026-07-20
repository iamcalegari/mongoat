import { randomUUID } from 'node:crypto';

import { Db } from 'mongodb';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { Database } from '@/database';
import { MongoatError } from '@/errors';
import { acquireLock, lockCollectionName } from '@/migrate/lock';
import type { MigrateConfig } from '@/types/migrate';

/**
 * Proves the N-way race guarantee: N parallel,
 * in-process `acquireLock` calls against MongoDB real — the atomicity that
 * matters is the server's `findOneAndUpdate`, not anything client-side.
 * Exactly one call wins; every other call rejects with `MIGRATION_LOCK_HELD`
 * — never a raw driver error.
 */
describe('lock — N-way race', () => {
  let db: Database;
  let nativeDb: Db;
  const config: MigrateConfig = { dir: '.', collection: '_lock_race_test' };
  const RACER_COUNT = 8;

  beforeAll(async () => {
    db = new Database({
      uri: process.env.MONGODB_URI,
      dbName: process.env.MONGODB_DB_NAME,
    });

    await db.connect();
    nativeDb = db.getDb() as Db;
  });

  // See lock-acquisition.test.ts — without this, MongoClient sockets/
  // monitors stay open past this suite's last test.
  afterAll(async () => {
    await db.disconnect();
  });

  afterEach(async () => {
    await nativeDb.collection(lockCollectionName(config)).deleteMany({});
  });

  it('exactly one of N parallel acquisitions wins; the rest reject with MIGRATION_LOCK_HELD', async () => {
    const racers = Array.from({ length: RACER_COUNT }, (_, index) =>
      acquireLock(nativeDb, config, randomUUID(), {
        hostname: 'ci-runner-race',
        pid: 3000 + index,
        operation: 'up',
      })
    );

    const results = await Promise.allSettled(racers);

    const fulfilled = results.filter((result) => result.status === 'fulfilled');
    const rejected = results.filter((result) => result.status === 'rejected');

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(RACER_COUNT - 1);

    for (const result of rejected) {
      const reason = (result as PromiseRejectedResult).reason;

      expect(reason).toBeInstanceOf(MongoatError);
      expect((reason as MongoatError).code).toBe('MIGRATION_LOCK_HELD');
    }
  });
});
