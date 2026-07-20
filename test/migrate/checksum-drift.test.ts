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
import { MongoatValidationError } from '@/errors';
import { runMigrations } from '@/migrate/runner';
import { MigrateConfig, MigrationRecord } from '@/types/migrate';

/**
 * Proves the drift guard covers ALL previously-applied
 * migrations, not just the next pending one — editing an already-applied
 * migration's file after the fact must be detected and refuse the whole
 * apply, even when there's a legitimately new pending migration too.
 */
describe('runMigrations — checksum drift', () => {
  let db: Database;
  let nativeDb: Db;
  let dir: string;
  let config: MigrateConfig;

  const migrationAFilename = '20260102090000_a.ts';
  const migrationBFilename = '20260102100000_b.ts';

  function migrationContent(collectionName: string): string {
    return `import type { MigrationContext } from '@/types/migrate';

export async function up({ db, session }: MigrationContext): Promise<void> {
  await db.collection('${collectionName}').insertOne({ ok: true }, { session });
}
`;
  }

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
    dir = await mkdtemp(path.join(tmpdir(), 'mongoat-checksum-drift-'));
    config = { dir, collection: '_migrations_checksum_drift_test' };
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
    await nativeDb.collection(config.collection).deleteMany({});
    await nativeDb.collection('checksum_drift_a').deleteMany({});
    await nativeDb.collection('checksum_drift_b').deleteMany({});
  });

  it('throws MIGRATION_CHECKSUM_MISMATCH when an already-applied migration was retroactively edited', async () => {
    const migrationAPath = path.join(dir, migrationAFilename);

    await writeFile(migrationAPath, migrationContent('checksum_drift_a'));

    // First run: applies migration A cleanly.
    await runMigrations(db, config);

    const recordsBeforeDrift = await nativeDb
      .collection<MigrationRecord>(config.collection)
      .find()
      .toArray();

    expect(recordsBeforeDrift).toHaveLength(1);
    expect(recordsBeforeDrift[0]?.status).toBe('applied');

    // Retroactive edit to the already-applied migration A — a purely
    // cosmetic change is enough since checksums are raw-byte, unnormalized.
    await writeFile(
      migrationAPath,
      migrationContent('checksum_drift_a') + '\n// tampered after apply\n'
    );

    // A brand new, legitimately pending migration B.
    await writeFile(
      path.join(dir, migrationBFilename),
      migrationContent('checksum_drift_b')
    );

    let caughtError: unknown;

    try {
      await runMigrations(db, config);
    } catch (err) {
      caughtError = err;
    }

    expect(caughtError).toBeInstanceOf(MongoatValidationError);
    expect((caughtError as MongoatValidationError).code).toBe(
      'MIGRATION_CHECKSUM_MISMATCH'
    );

    // Migration B must NOT have been applied — the drift guard blocks
    // everything, not just the drifted migration itself.
    const recordsAfterDrift = await nativeDb
      .collection<MigrationRecord>(config.collection)
      .find()
      .toArray();

    expect(recordsAfterDrift.map((record) => record.version)).toEqual([
      '20260102090000',
    ]);

    const bDocCount = await nativeDb
      .collection('checksum_drift_b')
      .countDocuments();

    expect(bDocCount).toBe(0);
  });
});
