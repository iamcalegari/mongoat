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
import { runMigrations } from '@/migrate/runner';
import { MigrateConfig, MigrationRecord } from '@/types/migrate';

/**
 * Proves when a pending migration's `up()` throws, the runner (a)
 * records `{ status: 'failed' }` for THAT migration, (b) stops the loop —
 * a later pending migration is NOT applied, and (c) rejects with a
 * `MongoatError` whose `.code === 'MIGRATION_FAILED'` and `.cause` is the
 * original error.
 */
describe('runMigrations — mid-migration failure recording', () => {
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
    dir = await mkdtemp(path.join(tmpdir(), 'mongoat-mid-failure-'));
    config = { dir, collection: '_migrations_mid_failure_test' };

    await writeFile(
      path.join(dir, '20260201090000_will_fail.ts'),
      `export async function up(): Promise<void> {
  throw new Error('boom — intentional failure for test');
}
`
    );

    await writeFile(
      path.join(dir, '20260201100000_should_not_run.ts'),
      `import type { MigrationContext } from '@/types/migrate';

export async function up({ db, session }: MigrationContext): Promise<void> {
  await db.collection('mid_failure_marker').insertOne({ ran: true }, { session });
}
`
    );
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
    await nativeDb.collection(config.collection).deleteMany({});
    await nativeDb.collection('mid_failure_marker').deleteMany({});
  });

  it('records the failing migration as failed, stops the loop, and rejects with MIGRATION_FAILED', async () => {
    let caughtError: unknown;

    try {
      await runMigrations(db, config);
    } catch (err) {
      caughtError = err;
    }

    expect(caughtError).toBeInstanceOf(MongoatError);
    expect((caughtError as MongoatError).code).toBe('MIGRATION_FAILED');
    expect((caughtError as MongoatError).cause).toBeInstanceOf(Error);
    expect(((caughtError as MongoatError).cause as Error).message).toBe(
      'boom — intentional failure for test'
    );

    const records = await nativeDb
      .collection<MigrationRecord>(config.collection)
      .find()
      .toArray();

    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      version: '20260201090000',
      name: 'will_fail',
      status: 'failed',
    });

    const markerCount = await nativeDb
      .collection('mid_failure_marker')
      .countDocuments();

    // The later migration must NOT have run.
    expect(markerCount).toBe(0);
  });
});
