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
  vi,
} from 'vitest';

import type { CliDeps } from '@/bin/mongoat';
import { handleTo, handleUp } from '@/bin/mongoat';
import { Database } from '@/database';
import { lockCollectionName } from '@/migrate/lock';
import type {
  MigrateConfig,
  MigrationPlanJson,
  MigrationRecord,
} from '@/types/migrate';
import setupStandaloneContainer from '@test/setup/testcontainer-standalone';

/**
 * @internal
 *
 * Plain CommonJS `.js` fixture content — deliberately NOT `.ts` like the
 * sibling `planMigrations`-level fixtures in `plan-migrations.test.ts`. This
 * file drives `planMigrations` through the CLI layer (`handleUp`/`handleTo`),
 * which runs `ensureTsCapableRuntimeForMigrations` before ever reaching the
 * dry-run branch — a `.ts` migration would make that checkpoint spawn a real
 * `tsx` re-exec of the whole test process. A `.js` migration keeps
 * `hasTsMigrations` false, so the checkpoint stays a no-op, exactly as it
 * would for any real project with JavaScript-only migrations.
 */
function migrationContent(collectionName: string): string {
  return `module.exports.up = async function up({ db, session }) {
  await db.collection('${collectionName}').insertOne({ ok: true }, { session });
};
`;
}

/**
 * End-to-end proof that the CLI `--dry-run` branch (not `planMigrations` in
 * isolation, but the actual `handleUp`/`handleTo` path — flag parsing, config
 * resolution, the re-exec checkpoints, the gated warning, and the plan
 * serializer) refuses on exactly the gates a real run refuses on, lists
 * exactly what a real run would apply, and mutates nothing.
 */
describe('CLI --dry-run honesty', () => {
  let db: Database;
  let nativeDb: Db;
  let dir: string;
  let config: MigrateConfig;
  let deps: CliDeps;
  let stdoutSpy: ReturnType<typeof vi.spyOn>;
  let stderrSpy: ReturnType<typeof vi.spyOn>;

  function stdout(): string {
    return stdoutSpy.mock.calls.map((call: unknown[]) => call[0]).join('');
  }

  function stderr(): string {
    return stderrSpy.mock.calls.map((call: unknown[]) => call[0]).join('');
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
    stdoutSpy = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => true);
    stderrSpy = vi
      .spyOn(process.stderr, 'write')
      .mockImplementation(() => true);

    dir = await mkdtemp(path.join(tmpdir(), 'mongoat-dry-run-honesty-'));
    config = { dir, collection: '_migrations_dry_run_honesty_test' };
    deps = {
      createDatabase: () =>
        new Database({
          uri: process.env.MONGODB_URI,
          dbName: process.env.MONGODB_DB_NAME,
        }),
    };
  });

  afterEach(async () => {
    stdoutSpy.mockRestore();
    stderrSpy.mockRestore();
    await rm(dir, { recursive: true, force: true });
    await nativeDb.collection(config.collection).deleteMany({});
    await nativeDb.collection(lockCollectionName(config)).deleteMany({});
    await nativeDb.collection('dry_run_honesty_marker').deleteMany({});
  });

  it('a clean up --dry-run exits 0, lists exactly the ordered pending set, and applies/locks nothing', async () => {
    const pendingVersion = '20260501090000';
    const laterVersion = '20260501100000';

    await writeFile(
      path.join(dir, `${pendingVersion}_pending.js`),
      migrationContent('dry_run_honesty_marker')
    );
    await writeFile(
      path.join(dir, `${laterVersion}_later.js`),
      migrationContent('dry_run_honesty_marker')
    );

    const exitCode = await handleUp(
      ['--dry-run', '--json', '--dir', dir, '--collection', config.collection],
      deps
    );

    expect(exitCode).toBe(0);

    const envelope = JSON.parse(stdout()) as MigrationPlanJson;
    expect(envelope.command).toBe('up');
    expect(envelope.migrations).toEqual([
      { version: pendingVersion, name: 'pending' },
      { version: laterVersion, name: 'later' },
    ]);

    // Zero side effects end to end: nothing applied, no lock document, and
    // the marker collection a real `up` would have written to stays empty.
    const records = await nativeDb
      .collection<MigrationRecord>(config.collection)
      .find()
      .toArray();
    expect(records).toHaveLength(0);

    const lockCount = await nativeDb
      .collection(lockCollectionName(config))
      .countDocuments();
    expect(lockCount).toBe(0);

    const markerCount = await nativeDb
      .collection('dry_run_honesty_marker')
      .countDocuments();
    expect(markerCount).toBe(0);
  });

  it('to <v> --dry-run lists only the pending slice up to and including the target version', async () => {
    const pendingVersion = '20260501110000';
    const laterVersion = '20260501120000';

    await writeFile(
      path.join(dir, `${pendingVersion}_pending.js`),
      migrationContent('dry_run_honesty_marker')
    );
    await writeFile(
      path.join(dir, `${laterVersion}_later.js`),
      migrationContent('dry_run_honesty_marker')
    );

    const exitCode = await handleTo(
      [
        pendingVersion,
        '--dry-run',
        '--json',
        '--dir',
        dir,
        '--collection',
        config.collection,
      ],
      deps
    );

    expect(exitCode).toBe(0);

    const envelope = JSON.parse(stdout()) as MigrationPlanJson;
    expect(envelope.command).toBe('to');
    expect(envelope.targetVersion).toBe(pendingVersion);
    expect(envelope.migrations).toEqual([
      { version: pendingVersion, name: 'pending' },
    ]);
  });

  it('up --dry-run against a retroactively edited applied migration exits 1 with the same MIGRATION_CHECKSUM_MISMATCH a real run would raise', async () => {
    const appliedVersion = '20260501130000';
    const appliedPath = path.join(dir, `${appliedVersion}_applied.js`);

    await writeFile(appliedPath, migrationContent('dry_run_honesty_marker'));

    // First, a real apply — establishes the checksum on record.
    const applyExitCode = await handleUp(
      ['--dir', dir, '--collection', config.collection],
      deps
    );
    expect(applyExitCode).toBe(0);

    // Only the DRY-RUN call's own stdout/stderr activity matters below —
    // clear what the real apply above already wrote.
    stdoutSpy.mockClear();
    stderrSpy.mockClear();

    // Retroactive edit to the already-applied migration.
    await writeFile(
      appliedPath,
      migrationContent('dry_run_honesty_marker') + '\n// tampered after apply\n'
    );
    await writeFile(
      path.join(dir, '20260501140000_pending.js'),
      migrationContent('dry_run_honesty_marker')
    );

    const exitCode = await handleUp(
      ['--dry-run', '--dir', dir, '--collection', config.collection],
      deps
    );

    expect(exitCode).toBe(1);
    expect(stderr()).toContain('MIGRATION_CHECKSUM_MISMATCH');
    expect(stdoutSpy).not.toHaveBeenCalled();

    // The dry-run itself applied nothing beyond the one real apply above,
    // and never touched the lock collection.
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
 * Proves the topology gate against a GENUINE standalone MongoDB — not the
 * shared replica-set container every other test in this file connects to,
 * which would make this pass even if the detection logic were broken.
 * Mirrors the same standalone-container wiring
 * `test/migrate/replica-set-required.test.ts` already uses.
 */
describe('CLI --dry-run honesty — standalone MongoDB', () => {
  let teardown: () => Promise<void>;
  let assertionClient: MongoClient;
  let nativeDb: Db;
  let dir: string;
  let stdoutSpy: ReturnType<typeof vi.spyOn>;
  let stderrSpy: ReturnType<typeof vi.spyOn>;
  const config: MigrateConfig = {
    dir: '',
    collection: '_migrations_dry_run_honesty_standalone_test',
  };

  function stderr(): string {
    return stderrSpy.mock.calls.map((call: unknown[]) => call[0]).join('');
  }

  async function newStandaloneDeps(): Promise<CliDeps> {
    const rawClient = new MongoClient(
      process.env.MONGODB_STANDALONE_URI as string
    );

    await rawClient.connect();

    const rawDb = rawClient.db('mongoat_test_standalone');
    const database = new Database({}, rawClient, rawDb);

    return { createDatabase: () => database };
  }

  beforeAll(async () => {
    teardown = await setupStandaloneContainer();

    assertionClient = new MongoClient(
      process.env.MONGODB_STANDALONE_URI as string
    );
    await assertionClient.connect();
    nativeDb = assertionClient.db('mongoat_test_standalone');
  });

  afterAll(async () => {
    await assertionClient.close();
    await teardown();
  });

  beforeEach(async () => {
    stdoutSpy = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => true);
    stderrSpy = vi
      .spyOn(process.stderr, 'write')
      .mockImplementation(() => true);

    dir = await mkdtemp(
      path.join(tmpdir(), 'mongoat-dry-run-honesty-standalone-')
    );
    config.dir = dir;

    await writeFile(
      path.join(dir, '20260501150000_standalone_pending.js'),
      migrationContent('dry_run_honesty_standalone_marker')
    );
  });

  afterEach(async () => {
    stdoutSpy.mockRestore();
    stderrSpy.mockRestore();
    await rm(dir, { recursive: true, force: true });
    await nativeDb.collection(config.collection).deleteMany({});
    await nativeDb.collection(lockCollectionName(config)).deleteMany({});
    await nativeDb
      .collection('dry_run_honesty_standalone_marker')
      .deleteMany({});
  });

  it('up --dry-run against a standalone topology without --allow-no-transaction exits 1 with the same REPLICA_SET_REQUIRED a real run would raise', async () => {
    const deps = await newStandaloneDeps();

    const exitCode = await handleUp(
      ['--dry-run', '--dir', dir, '--collection', config.collection],
      deps
    );

    expect(exitCode).toBe(1);
    expect(stderr()).toContain('REPLICA_SET_REQUIRED');
    expect(stdoutSpy).not.toHaveBeenCalled();

    const lockCount = await nativeDb
      .collection(lockCollectionName(config))
      .countDocuments();
    expect(lockCount).toBe(0);

    const markerCount = await nativeDb
      .collection('dry_run_honesty_standalone_marker')
      .countDocuments();
    expect(markerCount).toBe(0);
  });
});
