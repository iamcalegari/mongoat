import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { Collection, Db } from 'mongodb';
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
import { MongoatError } from '@/errors';
import { getLockStatus, lockCollectionName } from '@/migrate/lock';
import { runMigrations } from '@/migrate/runner';
import type { MigrateConfig } from '@/types/migrate';

type DeleteOneFn = typeof Collection.prototype.deleteOne;

/**
 * Forces `Collection#deleteOne` to reject, but ONLY for the collection named
 * `targetCollectionName` — every other collection (the control collection,
 * any marker collection a test migration writes to) keeps its real driver
 * behavior. Restricted to this test file (never touches production code);
 * chosen over a read-only VIEW (the precedent from the runner-suppression
 * suite) because the lock collection itself must still accept the
 * `findOneAndUpdate` upsert `acquireLock` performs — a view would reject
 * that too, not just the `deleteOne` this test needs to fail.
 */
function patchDeleteOneToFailForCollection(
  targetCollectionName: string
): () => void {
  const original: DeleteOneFn = Collection.prototype.deleteOne;

  Collection.prototype.deleteOne = function (
    this: Collection,
    ...args: Parameters<DeleteOneFn>
  ): ReturnType<DeleteOneFn> {
    if (this.collectionName === targetCollectionName) {
      return Promise.reject(
        new Error(
          'simulated deleteOne failure — proves the release never masks the run result'
        )
      );
    }

    return original.apply(this, args);
  } as DeleteOneFn;

  return () => {
    Collection.prototype.deleteOne = original;
  };
}

/**
 * Proves the run lock is released in every exit path of
 * `runMigrations` — success, a failing migration, and a release that itself
 * fails best-effort — and a failed release never masks the run's primary
 * outcome. Every failure is forced against a real MongoDB (the shared
 * container from `test/setup/testcontainer.ts`), never a seam in production
 * code.
 */
describe('runner — lock release fail-safe', () => {
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
    dir = await mkdtemp(path.join(tmpdir(), 'mongoat-lock-release-'));
    config = { dir, collection: '_migrations_lock_release_test' };
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
    await nativeDb.collection(config.collection).deleteMany({});
    await nativeDb.collection(lockCollectionName(config)).deleteMany({});
  });

  it('releases the lock once a successful run finishes', async () => {
    await writeFile(
      path.join(dir, '20260301100000_noop.ts'),
      `export async function up(): Promise<void> {}\n`
    );

    await expect(runMigrations(db, config)).resolves.toBeUndefined();

    const status = await getLockStatus(db, config);

    expect(status.held).toBe(false);
  });

  it('releases the lock when a migration fails — the primary error still wins', async () => {
    await writeFile(
      path.join(dir, '20260301100100_boom.ts'),
      `export async function up(): Promise<void> {
  throw new Error('boom — release must still run');
}
`
    );

    let caught: unknown;

    try {
      await runMigrations(db, config);
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(MongoatError);
    const err = caught as MongoatError;

    expect(err.code).toBe('MIGRATION_FAILED');
    expect((err.cause as Error).message).toBe('boom — release must still run');
    expect(err.message).not.toMatch(/\bD-\d/);

    const status = await getLockStatus(db, config);

    expect(status.held).toBe(false);
  });

  describe('a best-effort release failure never fails an otherwise successful run', () => {
    let restoreDeleteOne: (() => void) | undefined;

    afterEach(() => {
      restoreDeleteOne?.();
      restoreDeleteOne = undefined;
    });

    it('resolves successfully and emits a non-fatal warning instead of throwing', async () => {
      await writeFile(
        path.join(dir, '20260301100200_noop.ts'),
        `export async function up(): Promise<void> {}\n`
      );

      restoreDeleteOne = patchDeleteOneToFailForCollection(
        lockCollectionName(config)
      );

      const warnings: Error[] = [];
      const onWarning = (warning: Error): void => {
        warnings.push(warning);
      };

      process.on('warning', onWarning);

      await expect(runMigrations(db, config)).resolves.toBeUndefined();

      // `process.emitWarning` dispatches the `warning` event asynchronously
      // (on a later tick) — give it a chance to fire before asserting.
      await new Promise((resolve) => setImmediate(resolve));
      process.off('warning', onWarning);

      const releaseWarning = warnings.find(
        (warning) => warning.name === 'MongoatLockReleaseWarning'
      );

      expect(releaseWarning).toBeDefined();
      expect(releaseWarning?.message).not.toMatch(/\bD-\d/);

      // The lock document itself is still there (the delete really failed) —
      // it self-heals once its TTL lapses, never by this run throwing.
      restoreDeleteOne();
      restoreDeleteOne = undefined;

      const status = await getLockStatus(db, config);

      expect(status.held).toBe(true);
    });
  });

  describe('a release failure alongside a non-MongoatError primary is never silently dropped', () => {
    let restoreDeleteOne: (() => void) | undefined;

    afterEach(() => {
      restoreDeleteOne?.();
      restoreDeleteOne = undefined;
    });

    it('still warns about the failed release even though the primary error cannot carry .suppressed', async () => {
      // A raw `fs` ENOENT (never wrapped as a MongoatError) from
      // `discoverMigrations` — a plausible primary failure that predates
      // `acquireLock` ever succeeding at reading migration state.
      const missingDir = path.join(dir, 'does-not-exist');

      restoreDeleteOne = patchDeleteOneToFailForCollection(
        lockCollectionName(config)
      );

      const warnings: Error[] = [];
      const onWarning = (warning: Error): void => {
        warnings.push(warning);
      };

      process.on('warning', onWarning);

      let caught: unknown;

      try {
        await runMigrations(db, { ...config, dir: missingDir });
      } catch (err) {
        caught = err;
      }

      await new Promise((resolve) => setImmediate(resolve));
      process.off('warning', onWarning);

      // The primary error propagates UNWRAPPED — never a MongoatError, and
      // never masked by the release failure.
      expect(caught).not.toBeInstanceOf(MongoatError);
      expect((caught as NodeJS.ErrnoException).code).toBe('ENOENT');

      const releaseWarning = warnings.find(
        (warning) => warning.name === 'MongoatLockReleaseWarning'
      );

      expect(releaseWarning).toBeDefined();
      expect(releaseWarning?.message).not.toMatch(/\bD-\d/);
      expect(releaseWarning?.message).not.toMatch(/\bWR-\d/);

      restoreDeleteOne();
      restoreDeleteOne = undefined;

      const status = await getLockStatus(db, config);

      expect(status.held).toBe(true);
    });
  });
});
