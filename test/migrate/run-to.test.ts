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
import { runTo } from '@/migrate/runner';
import { MigrateConfig, MigrationRecord } from '@/types/migrate';

/**
 * Proves the missing behavioral path of `runTo`: with several pending
 * migrations, `runTo(targetVersion)` applies pending migrations in order
 * up to and including the target version and NOT beyond it.
 */
describe('runTo — applies pending migrations up to and including the target version', () => {
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
    dir = await mkdtemp(path.join(tmpdir(), 'mongoat-run-to-'));
    config = { dir, collection: '_migrations_run_to_test' };

    for (const version of ['20260301090000', '20260301100000', '20260301110000']) {
      await writeFile(
        path.join(dir, `${version}_step_${version}.ts`),
        `import type { MigrationContext } from '@/types/migrate';

export async function up({ db, session }: MigrationContext): Promise<void> {
  await db.collection('run_to_marker').insertOne({ version: '${version}' }, { session });
}
`
      );
    }
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
    await nativeDb.collection(config.collection).deleteMany({});
    await nativeDb.collection('run_to_marker').deleteMany({});
  });

  it('stops applying at the target version, leaving later migrations pending', async () => {
    await runTo(db, '20260301100000', config);

    const records = await nativeDb
      .collection<MigrationRecord>(config.collection)
      .find()
      .sort({ version: 1 })
      .toArray();

    expect(records.map((r) => r.version)).toEqual([
      '20260301090000',
      '20260301100000',
    ]);
    expect(records.every((r) => r.status === 'applied')).toBe(true);

    const markers = await nativeDb
      .collection('run_to_marker')
      .find()
      .sort({ version: 1 })
      .toArray();

    expect(markers.map((m) => m.version)).toEqual([
      '20260301090000',
      '20260301100000',
    ]);
  });
});
