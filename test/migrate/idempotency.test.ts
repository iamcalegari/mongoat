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
import { runMigrations } from '@/migrate/runner';
import { MigrateConfig, MigrationRecord } from '@/types/migrate';

/**
 * Proves MIG-02/D-02 idempotency: applying pending migrations twice records
 * each version exactly once in the control collection, and never re-runs
 * an already-applied migration's `up()`.
 */
describe('runMigrations — idempotency (MIG-02, D-02)', () => {
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
    dir = await mkdtemp(path.join(tmpdir(), 'mongoat-idempotency-'));
    config = { dir, collection: '_migrations_idempotency_test' };

    await writeFile(
      path.join(dir, '20260101120000_bump_counter.ts'),
      `import type { MigrationContext } from '@/types/migrate';

export async function up({ db, session }: MigrationContext): Promise<void> {
  await db.collection('idempotency_counter').insertOne({ tick: 1 }, { session });
}

export async function down({ db, session }: MigrationContext): Promise<void> {
  await db.collection('idempotency_counter').deleteMany({}, { session });
}
`
    );
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
    await nativeDb.collection(config.collection).deleteMany({});
    await nativeDb.collection('idempotency_counter').deleteMany({});
  });

  it('applies the pending migration once and records exactly one _migrations doc', async () => {
    await runMigrations(db, config);

    const records = await nativeDb
      .collection<MigrationRecord>(config.collection)
      .find()
      .toArray();

    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      version: '20260101120000',
      name: 'bump_counter',
      status: 'applied',
    });

    const counterDocs = await nativeDb
      .collection('idempotency_counter')
      .countDocuments();

    expect(counterDocs).toBe(1);
  });

  it('a second run is a no-op — the already-applied migration is never re-run', async () => {
    await runMigrations(db, config);
    await runMigrations(db, config);

    const records = await nativeDb
      .collection<MigrationRecord>(config.collection)
      .find()
      .toArray();

    expect(records).toHaveLength(1);

    const counterDocs = await nativeDb
      .collection('idempotency_counter')
      .countDocuments();

    // If the migration had re-run, this would be 2.
    expect(counterDocs).toBe(1);
  });
});
