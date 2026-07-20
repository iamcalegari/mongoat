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
import { MigrateConfig } from '@/types/migrate';

/**
 * Proves a data-only migration's `up()` mutation, applied via
 * `ctx.db.collection(...).updateMany(..., { session: ctx.session })`, is
 * actually persisted by `runMigrations` (the transaction commits and the
 * write survives).
 */
describe('runMigrations — data migration persisted via transaction', () => {
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
    dir = await mkdtemp(path.join(tmpdir(), 'mongoat-data-migration-'));
    config = { dir, collection: '_migrations_data_migration_test' };

    await nativeDb
      .collection('data_migration_target')
      .insertMany([{ status: 'old' }, { status: 'old' }]);

    await writeFile(
      path.join(dir, '20260103090000_flip_status.ts'),
      `import type { MigrationContext } from '@/types/migrate';

export async function up({ db, session }: MigrationContext): Promise<void> {
  await db
    .collection('data_migration_target')
    .updateMany({}, { $set: { status: 'new' } }, { session });
}

export async function down({ db, session }: MigrationContext): Promise<void> {
  await db
    .collection('data_migration_target')
    .updateMany({}, { $set: { status: 'old' } }, { session });
}
`
    );
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
    await nativeDb.collection(config.collection).deleteMany({});
    await nativeDb.collection('data_migration_target').deleteMany({});
  });

  it('persists an up() data mutation made through ctx.session', async () => {
    await runMigrations(db, config);

    const remainingOld = await nativeDb
      .collection('data_migration_target')
      .countDocuments({ status: 'old' });
    const updatedToNew = await nativeDb
      .collection('data_migration_target')
      .countDocuments({ status: 'new' });

    expect(remainingOld).toBe(0);
    expect(updatedToNew).toBe(2);
  });
});
