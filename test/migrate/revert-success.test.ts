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
import { revertMigration, runMigrations } from '@/migrate/runner';
import { MigrateConfig, MigrationRecord } from '@/types/migrate';

/**
 * Proves the missing SUCCESS path of `revertMigration`: applying a
 * migration with a real `down()`, then reverting it, must (a) reverse the
 * `down()` effect and (b) remove the control-collection record for that
 * version (untracked).
 */
describe('revertMigration — success path reverses down() and untracks the record', () => {
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
    dir = await mkdtemp(path.join(tmpdir(), 'mongoat-revert-success-'));
    config = { dir, collection: '_migrations_revert_success_test' };

    await writeFile(
      path.join(dir, '20260202090000_add_marker.ts'),
      `import type { MigrationContext } from '@/types/migrate';

export async function up({ db, session }: MigrationContext): Promise<void> {
  await db.collection('revert_success_marker').insertOne({ marker: true }, { session });
}

export async function down({ db, session }: MigrationContext): Promise<void> {
  await db.collection('revert_success_marker').deleteMany({}, { session });
}
`
    );
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
    await nativeDb.collection(config.collection).deleteMany({});
    await nativeDb.collection('revert_success_marker').deleteMany({});
  });

  it('reverses down() and removes the control-collection record', async () => {
    await runMigrations(db, config);

    const countBeforeRevert = await nativeDb
      .collection('revert_success_marker')
      .countDocuments();

    expect(countBeforeRevert).toBe(1);

    await revertMigration(db, '20260202090000', config);

    const countAfterRevert = await nativeDb
      .collection('revert_success_marker')
      .countDocuments();

    expect(countAfterRevert).toBe(0);

    const record = await nativeDb
      .collection<MigrationRecord>(config.collection)
      .findOne({ version: '20260202090000' });

    expect(record).toBeNull();
  });
});
