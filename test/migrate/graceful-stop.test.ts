import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
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
import { MongoatError } from '@/errors';
import { getLockStatus } from '@/migrate/lock';
import { revertMigration, runMigrations } from '@/migrate/runner';
import type { MigrateConfig, MigrationRecord } from '@/types/migrate';

/**
 * A migration file is loaded via a fresh dynamic `import()` of a temp file
 * on disk — it cannot close over the `AbortController` instance a test
 * creates. Bridging through a dedicated `globalThis` slot (cleaned up in
 * `afterEach`) is the only in-process channel available, and keeps the
 * abort deterministic: the FIRST migration's own `up()` triggers it, so the
 * runner observes `signal.aborted` only on the loop's NEXT iteration —
 * never mid-`up()`.
 */
const ABORT_CONTROLLER_GLOBAL_KEY = '__mongoat_graceful_stop_controller__';

type GracefulStopGlobal = typeof globalThis & {
  [ABORT_CONTROLLER_GLOBAL_KEY]?: AbortController;
};

/**
 * Proves the graceful-stop half: an `AbortSignal` passed via
 * `config.signal` stops `runMigrations` BETWEEN migrations, never mid-DDL —
 * the in-flight migration always completes and is recorded, the run rejects
 * with `MIGRATION_ABORTED`, no further migration executes, and the run lock
 * is released regardless.
 */
describe('runner — graceful stop via AbortSignal', () => {
  let db: Database;
  let nativeDb: Db;
  let dir: string;
  let config: MigrateConfig;
  const markerCollection = 'graceful_stop_marker';

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
    dir = await mkdtemp(path.join(tmpdir(), 'mongoat-graceful-stop-'));
    config = { dir, collection: '_migrations_graceful_stop_test' };
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
    await nativeDb.collection(config.collection).deleteMany({});
    await nativeDb.collection(markerCollection).deleteMany({});
    delete (globalThis as GracefulStopGlobal)[ABORT_CONTROLLER_GLOBAL_KEY];
  });

  it('completes the in-flight migration, stops before the next, and rejects with MIGRATION_ABORTED', async () => {
    await writeFile(
      path.join(dir, '20260301110000_first.ts'),
      `import type { MigrationContext } from '@/types/migrate';

export async function up({ db, session }: MigrationContext): Promise<void> {
  await db.collection('${markerCollection}').insertOne({ step: 1 }, { session });

  const g = globalThis as unknown as {
    ${ABORT_CONTROLLER_GLOBAL_KEY}?: AbortController;
  };

  g.${ABORT_CONTROLLER_GLOBAL_KEY}?.abort();
}
`
    );
    await writeFile(
      path.join(dir, '20260301110100_second.ts'),
      `import type { MigrationContext } from '@/types/migrate';

export async function up({ db, session }: MigrationContext): Promise<void> {
  await db.collection('${markerCollection}').insertOne({ step: 2 }, { session });
}
`
    );

    const controller = new AbortController();

    (globalThis as GracefulStopGlobal)[ABORT_CONTROLLER_GLOBAL_KEY] =
      controller;

    let caught: unknown;

    try {
      await runMigrations(db, { ...config, signal: controller.signal });
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(MongoatError);
    const err = caught as MongoatError;

    expect(err.code).toBe('MIGRATION_ABORTED');
    expect(err.message.toLowerCase()).toContain('still pending');
    expect(err.message).not.toMatch(/\bD-\d/);

    // The first migration completed and is recorded as applied.
    const markerDocs = await nativeDb
      .collection(markerCollection)
      .find()
      .toArray();

    expect(markerDocs).toHaveLength(1);
    expect(markerDocs[0]).toMatchObject({ step: 1 });

    const records = await nativeDb
      .collection<MigrationRecord>(config.collection)
      .find()
      .toArray();

    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      version: '20260301110000',
      status: 'applied',
    });

    // The lock was released despite the abort.
    const status = await getLockStatus(db, config);

    expect(status.held).toBe(false);
  });

  it('rejects with MIGRATION_ABORTED before running anything when the signal is already aborted', async () => {
    await writeFile(
      path.join(dir, '20260301110200_never_runs.ts'),
      `import type { MigrationContext } from '@/types/migrate';

export async function up({ db, session }: MigrationContext): Promise<void> {
  await db.collection('${markerCollection}').insertOne({ step: 1 }, { session });
}
`
    );

    const controller = new AbortController();

    controller.abort();

    let caught: unknown;

    try {
      await runMigrations(db, { ...config, signal: controller.signal });
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(MongoatError);
    const err = caught as MongoatError;

    expect(err.code).toBe('MIGRATION_ABORTED');
    expect(err.message.toLowerCase()).toContain('still pending');

    const markerCount = await nativeDb
      .collection(markerCollection)
      .countDocuments();

    expect(markerCount).toBe(0);

    const recordCount = await nativeDb
      .collection(config.collection)
      .countDocuments();

    expect(recordCount).toBe(0);

    const status = await getLockStatus(db, config);

    expect(status.held).toBe(false);
  });

  it('revertMigration rejects with MIGRATION_ABORTED before running down() when the signal is already aborted', async () => {
    await writeFile(
      path.join(dir, '20260301110300_reversible.ts'),
      `import type { MigrationContext } from '@/types/migrate';

export async function up({ db, session }: MigrationContext): Promise<void> {
  await db.collection('${markerCollection}').insertOne({ step: 'up' }, { session });
}

export async function down({ db, session }: MigrationContext): Promise<void> {
  await db.collection('${markerCollection}').insertOne({ step: 'down' }, { session });
}
`
    );

    // Applies the migration first — revertMigration below requires an
    // applied record to revert.
    await runMigrations(db, config);

    const controller = new AbortController();

    controller.abort();

    let caught: unknown;

    try {
      await revertMigration(db, '20260301110300', {
        ...config,
        signal: controller.signal,
      });
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(MongoatError);
    const err = caught as MongoatError;

    expect(err.code).toBe('MIGRATION_ABORTED');
    expect(err.message).not.toMatch(/\bD-\d/);

    // down() never ran — only the "up" marker is present.
    const markerDocs = await nativeDb
      .collection(markerCollection)
      .find()
      .toArray();

    expect(markerDocs).toHaveLength(1);
    expect(markerDocs[0]).toMatchObject({ step: 'up' });

    // The migration is STILL recorded as applied — the revert never ran.
    const records = await nativeDb
      .collection<MigrationRecord>(config.collection)
      .find()
      .toArray();

    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      version: '20260301110300',
      status: 'applied',
    });

    // The lock acquired by revertMigration was released despite the abort.
    const status = await getLockStatus(db, config);

    expect(status.held).toBe(false);
  });
});
