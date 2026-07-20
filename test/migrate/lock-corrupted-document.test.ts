import { randomUUID } from 'node:crypto';

import { Db } from 'mongodb';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';

import { Database } from '@/database';
import { MongoatError } from '@/errors';
import {
  acquireLock,
  formatLockDiagnostic,
  getLockStatus,
  lockCollectionName,
} from '@/migrate/lock';
import type { MigrateConfig, MigrationLockDocument } from '@/types/migrate';

/**
 * CR-02 — a lock document that is partially corrupted (missing `acquiredAt`,
 * or `expiresAt` stored as a non-`Date` value — "written by hand, by a
 * future/incompatible version, or otherwise corrupted", per `lock.ts`'s own
 * docstring) must never crash `formatLockDiagnostic` with a raw `TypeError`.
 * This is exactly the break-glass path (`mongoat unlock`) the
 * `MIGRATION_LOCK_HELD` message itself instructs an operator to use for
 * these documents — it must keep working against the real driver, not just
 * in a unit test of the formatter alone.
 */
describe('lock — corrupted lock document (CR-02)', () => {
  let db: Database;
  let nativeDb: Db;
  const config: MigrateConfig = { dir: '.', collection: '_lock_corrupt_test' };

  beforeAll(async () => {
    db = new Database({
      uri: process.env.MONGODB_URI,
      dbName: process.env.MONGODB_DB_NAME,
    });

    await db.connect();
    nativeDb = db.getDb() as Db;
  });

  afterEach(async () => {
    await nativeDb
      .collection<MigrationLockDocument>(lockCollectionName(config))
      .deleteMany({});
  });

  it('acquireLock rejects with MIGRATION_LOCK_HELD (never a raw TypeError) against a lock missing acquiredAt', async () => {
    const futureExpiry = new Date(Date.now() + 60_000);

    // Simulates a hand-written/corrupted document: valid expiresAt (so it is
    // NOT treated as stale by the acquisition filter — the collision path
    // below is guaranteed to run), but no acquiredAt field at all. Cast
    // rather than `any` — this is a deliberately malformed
    // `MigrationLockDocument`, the exact shape the docstrings above already
    // call out as a supported (if unfortunate) input.
    await nativeDb
      .collection<MigrationLockDocument>(lockCollectionName(config))
      .insertOne({
        _id: 'lock',
        hostname: 'legacy-host',
        pid: 999,
        operation: 'up',
        ownerId: randomUUID(),
        expiresAt: futureExpiry,
      } as unknown as MigrationLockDocument);

    let caught: unknown;

    try {
      await acquireLock(nativeDb, config, randomUUID(), {
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
    expect(err.message).toContain('held by legacy-host');
    expect(err.message).toContain('<invalid date>');
  });

  it('getLockStatus + formatLockDiagnostic never throw against a lock whose expiresAt is not a Date', async () => {
    await nativeDb
      .collection<MigrationLockDocument>(lockCollectionName(config))
      .insertOne({
        _id: 'lock',
        hostname: 'legacy-host',
        pid: 999,
        operation: 'up',
        ownerId: randomUUID(),
        acquiredAt: new Date(),
        expiresAt: 'not-a-date',
      } as unknown as MigrationLockDocument);

    const status = await getLockStatus(db, config);

    expect(status.held).toBe(true);

    if (status.held) {
      expect(() => formatLockDiagnostic(status.lock)).not.toThrow();
      expect(formatLockDiagnostic(status.lock)).toContain('<invalid date>');
    }
  });

  it('formatLockDiagnostic never throws against a completely empty document', () => {
    expect(() => formatLockDiagnostic({})).not.toThrow();
    expect(formatLockDiagnostic({})).toBe(
      'held by <unknown> (pid ?, ?) since <invalid date>, expires <invalid date>'
    );
  });
});
