import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { Db, MongoClient } from 'mongodb';
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
import { MongoatConnectionError, MongoatValidationError } from '@/errors';
import { lockCollectionName } from '@/migrate/lock';
import { planMigrations, runMigrations } from '@/migrate/runner';
import type { MigrateConfig, MigrationRecord } from '@/types/migrate';
import setupStandaloneContainer from '@test/setup/testcontainer-standalone';

function migrationContent(collectionName: string): string {
  return `import type { MigrationContext } from '@/types/migrate';

export async function up({ db, session }: MigrationContext): Promise<void> {
  await db.collection('${collectionName}').insertOne({ ok: true }, { session });
}
`;
}

/**
 * Proves `planMigrations` answers "what would up()/to() apply" by running
 * the exact same read-only preconditions a real run runs (topology probe,
 * then the checksum-drift guard) — and that it never acquires the lock or
 * touches the control collection. A dry-run is only honest when it refuses
 * on the same conditions a real run refuses on, and changes nothing
 * otherwise.
 */
describe('planMigrations', () => {
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
    dir = await mkdtemp(path.join(tmpdir(), 'mongoat-plan-migrations-'));
    config = { dir, collection: '_migrations_plan_test' };
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
    await nativeDb.collection(config.collection).deleteMany({});
    await nativeDb.collection(lockCollectionName(config)).deleteMany({});
    await nativeDb.collection('plan_migrations_marker').deleteMany({});
  });

  it('lists only pending migrations up to the target version, leaving an already-applied one out, and mutates nothing', async () => {
    const appliedVersion = '20260401090000';
    const pendingVersion = '20260401100000';
    const laterVersion = '20260401110000';

    await writeFile(
      path.join(dir, `${appliedVersion}_applied.ts`),
      migrationContent('plan_migrations_marker')
    );

    await runMigrations(db, config);

    await writeFile(
      path.join(dir, `${pendingVersion}_pending.ts`),
      migrationContent('plan_migrations_marker')
    );
    await writeFile(
      path.join(dir, `${laterVersion}_later.ts`),
      migrationContent('plan_migrations_marker')
    );

    const fullPlan = await planMigrations(db, config);

    expect(fullPlan.migrations.map((m) => m.version)).toEqual([
      pendingVersion,
      laterVersion,
    ]);
    expect(fullPlan.hasReplicaSet).toBe(true);

    const boundedPlan = await planMigrations(db, config, pendingVersion);

    expect(boundedPlan.migrations.map((m) => m.version)).toEqual([
      pendingVersion,
    ]);

    // Zero side effects: only the migration actually applied via
    // runMigrations above is on record — planMigrations itself never wrote
    // anything, and never touched the lock collection.
    const records = await nativeDb
      .collection<MigrationRecord>(config.collection)
      .find()
      .toArray();

    expect(records.map((r) => r.version)).toEqual([appliedVersion]);

    const lockCount = await nativeDb
      .collection(lockCollectionName(config))
      .countDocuments();

    expect(lockCount).toBe(0);
  });

  it('propagates MIGRATION_CHECKSUM_MISMATCH, exactly like a real run, when an already-applied migration was retroactively edited', async () => {
    const appliedVersion = '20260401120000';
    const appliedPath = path.join(dir, `${appliedVersion}_applied.ts`);

    await writeFile(appliedPath, migrationContent('plan_migrations_marker'));

    await runMigrations(db, config);

    await writeFile(
      appliedPath,
      migrationContent('plan_migrations_marker') +
        '\n// tampered after apply\n'
    );

    await writeFile(
      path.join(dir, '20260401130000_pending.ts'),
      migrationContent('plan_migrations_marker')
    );

    let caughtError: unknown;

    try {
      await planMigrations(db, config);
    } catch (err) {
      caughtError = err;
    }

    expect(caughtError).toBeInstanceOf(MongoatValidationError);
    expect((caughtError as MongoatValidationError).code).toBe(
      'MIGRATION_CHECKSUM_MISMATCH'
    );

    const records = await nativeDb
      .collection<MigrationRecord>(config.collection)
      .find()
      .toArray();

    expect(records.map((r) => r.version)).toEqual([appliedVersion]);

    const lockCount = await nativeDb
      .collection(lockCollectionName(config))
      .countDocuments();

    expect(lockCount).toBe(0);
  });
});

/**
 * Proves the topology precondition against a GENUINE standalone MongoDB —
 * not the shared replica-set container every other test file connects to,
 * which would make this pass even if the detection logic were broken.
 * Mirrors the same standalone-container wiring `assertReplicaSetOrThrow`'s
 * own tests use.
 */
describe('planMigrations — standalone MongoDB', () => {
  let teardown: () => Promise<void>;
  let client: MongoClient;
  let nativeDb: Db;
  let dir: string;
  const config: MigrateConfig = {
    dir: '',
    collection: '_migrations_plan_standalone_test',
  };

  beforeAll(async () => {
    teardown = await setupStandaloneContainer();

    client = new MongoClient(process.env.MONGODB_STANDALONE_URI as string);
    await client.connect();
    nativeDb = client.db('mongoat_test_standalone');
  });

  afterAll(async () => {
    await client.close();
    await teardown();
  });

  beforeEach(async () => {
    dir = await mkdtemp(
      path.join(tmpdir(), 'mongoat-plan-migrations-standalone-')
    );
    config.dir = dir;

    await writeFile(
      path.join(dir, '20260401140000_standalone_pending.ts'),
      migrationContent('plan_migrations_standalone_marker')
    );
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
    await nativeDb.collection(config.collection).deleteMany({});
    await nativeDb.collection(lockCollectionName(config)).deleteMany({});
    await nativeDb
      .collection('plan_migrations_standalone_marker')
      .deleteMany({});
  });

  it('propagates REPLICA_SET_REQUIRED, exactly like a real run, without allowNoTransaction', async () => {
    const rawClient = new MongoClient(
      process.env.MONGODB_STANDALONE_URI as string
    );

    await rawClient.connect();

    const rawDb = rawClient.db('mongoat_test_standalone');
    const database = new Database({}, rawClient, rawDb);

    try {
      await expect(planMigrations(database, config)).rejects.toMatchObject({
        code: 'REPLICA_SET_REQUIRED',
      });

      await expect(planMigrations(database, config)).rejects.toBeInstanceOf(
        MongoatConnectionError
      );

      const lockCount = await nativeDb
        .collection(lockCollectionName(config))
        .countDocuments();

      expect(lockCount).toBe(0);
    } finally {
      await database.disconnect();
    }
  });
});
