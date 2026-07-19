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
import { computeChecksum } from '@/migrate/checksum';
import { revertMigration, runMigrations } from '@/migrate/runner';
import { MigrateConfig, MigrationRecord } from '@/types/migrate';

/**
 * Proves that a control-collection write that fails AFTER a migration's
 * primary outcome (failure or success) is already decided never masks that
 * outcome: the original error always wins (IN-01/HARD-01), and a write
 * failure after a SUCCESSFUL up()/down() surfaces via its own dedicated,
 * discriminable code (D-08) instead of being silently swallowed. Every
 * failure here is forced against a real MongoDB (the shared container from
 * `test/setup/testcontainer.ts`) via standard driver mechanisms — a hostile
 * `$jsonSchema` validator for blocked inserts/upserts, and a capped
 * collection for a blocked delete — never a seam in production code.
 */
describe('runner robustness — suppressed secondary write failures', () => {
  let db: Database;
  let nativeDb: Db;

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

  /**
   * Rejects ANY insert/upsert into `collectionName` — requires a field the
   * runner never writes. A single universal validator covers both
   * write-failure scenarios below (recording `failed`, recording `applied`)
   * regardless of which `status` value is being written.
   */
  async function applyHostileValidator(collectionName: string): Promise<void> {
    await nativeDb.createCollection(collectionName, {
      validator: {
        $jsonSchema: {
          bsonType: 'object',
          required: ['__mongoat_test_block_writes__'],
        },
      },
      validationAction: 'error',
      validationLevel: 'strict',
    });
  }

  describe('applyOne catch — up() fails AND the "failed" write also fails (IN-01/HARD-01)', () => {
    let dir: string;
    let config: MigrateConfig;

    beforeEach(async () => {
      dir = await mkdtemp(path.join(tmpdir(), 'mongoat-runner-suppression-'));
      config = { dir, collection: '_migrations_suppression_boom_test' };

      await writeFile(
        path.join(dir, '20260301090000_will_fail.ts'),
        `export async function up(): Promise<void> {
  throw new Error('boom — intentional failure for suppression test');
}
`
      );

      await applyHostileValidator(config.collection);
    });

    afterEach(async () => {
      await rm(dir, { recursive: true, force: true });
      await nativeDb.collection(config.collection).drop();
    });

    it('propagates the ORIGINAL migration error as .cause and suppresses the write failure', async () => {
      const warnings: Error[] = [];
      const onWarning = (warning: Error): void => {
        warnings.push(warning);
      };

      process.on('warning', onWarning);

      let caughtError: unknown;

      try {
        await runMigrations(db, config);
      } catch (err) {
        caughtError = err;
      }

      // `process.emitWarning` dispatches the `warning` event asynchronously
      // (on a later tick) — give it a chance to fire before asserting.
      await new Promise((resolve) => setImmediate(resolve));
      process.off('warning', onWarning);

      expect(caughtError).toBeInstanceOf(MongoatError);
      const err = caughtError as MongoatError;

      expect(err.code).toBe('MIGRATION_FAILED');
      expect(err.cause).toBeInstanceOf(Error);
      expect((err.cause as Error).message).toBe(
        'boom — intentional failure for suppression test'
      );
      expect(err.suppressed).toBeInstanceOf(Array);
      expect((err.suppressed as unknown[]).length).toBeGreaterThanOrEqual(1);
      // The record could not be persisted — status will show as pending,
      // never silently claim the record was recorded (D-06 non-persisted
      // branch).
      expect(err.message.toLowerCase()).toContain('pending');
      expect(err.message).not.toMatch(/\bD-\d/);

      const suppressionWarning = warnings.find(
        (warning) => warning.name === 'MongoatSuppressedError'
      );

      expect(suppressionWarning).toBeDefined();
    });
  });

  describe('applyOne catch — up() fails but the "failed" write SUCCEEDS (D-06 dynamic message)', () => {
    let dir: string;
    let config: MigrateConfig;

    beforeEach(async () => {
      dir = await mkdtemp(path.join(tmpdir(), 'mongoat-runner-suppression-'));
      config = { dir, collection: '_migrations_suppression_recorded_test' };

      await writeFile(
        path.join(dir, '20260301090100_will_fail.ts'),
        `export async function up(): Promise<void> {
  throw new Error('boom — intentional failure, write succeeds');
}
`
      );
    });

    afterEach(async () => {
      await rm(dir, { recursive: true, force: true });
      await nativeDb.collection(config.collection).deleteMany({});
    });

    it('rejects with MIGRATION_FAILED, no .suppressed, and a message with no planning IDs', async () => {
      let caughtError: unknown;

      try {
        await runMigrations(db, config);
      } catch (err) {
        caughtError = err;
      }

      expect(caughtError).toBeInstanceOf(MongoatError);
      const err = caughtError as MongoatError;

      expect(err.code).toBe('MIGRATION_FAILED');
      expect(err.suppressed).toBeUndefined();
      expect(err.message).toContain('recorded as "failed"');
      expect(err.message).not.toMatch(/\bD-\d/);

      const record = await nativeDb
        .collection<MigrationRecord>(config.collection)
        .findOne({ version: '20260301090100' });

      expect(record).toMatchObject({ status: 'failed' });
    });
  });

  describe('applyOne — up() SUCCEEDS but recording "applied" fails (D-08 mirror 1)', () => {
    let dir: string;
    let config: MigrateConfig;
    const markerCollection = 'suppression_applied_marker';

    beforeEach(async () => {
      dir = await mkdtemp(path.join(tmpdir(), 'mongoat-runner-suppression-'));
      config = { dir, collection: '_migrations_suppression_applied_test' };

      await writeFile(
        path.join(dir, '20260301090200_add_marker.ts'),
        `import type { MigrationContext } from '@/types/migrate';

export async function up({ db, session }: MigrationContext): Promise<void> {
  await db.collection('${markerCollection}').insertOne({ marker: true }, { session });
}
`
      );

      await applyHostileValidator(config.collection);
    });

    afterEach(async () => {
      await rm(dir, { recursive: true, force: true });
      await nativeDb.collection(config.collection).drop();
      await nativeDb.collection(markerCollection).deleteMany({});
    });

    it('rejects with MIGRATION_STATE_WRITE_FAILED and orients not to re-run', async () => {
      let caughtError: unknown;

      try {
        await runMigrations(db, config);
      } catch (err) {
        caughtError = err;
      }

      expect(caughtError).toBeInstanceOf(MongoatError);
      const err = caughtError as MongoatError;

      expect(err.code).toBe('MIGRATION_STATE_WRITE_FAILED');
      expect(err.cause).toBeInstanceOf(Error);
      expect(err.message.toLowerCase()).toContain('do not re-run');
      expect(err.message).not.toMatch(/\bD-\d/);

      // up() itself DID run and was not rolled back.
      const markerCount = await nativeDb
        .collection(markerCollection)
        .countDocuments();

      expect(markerCount).toBe(1);
    });
  });

  describe('revertMigration — down() SUCCEEDS but removing the record fails (D-08 mirror 2)', () => {
    let dir: string;
    let config: MigrateConfig;
    const markerCollection = 'suppression_reverted_marker';
    const sourceCollection = '_migrations_suppression_view_src_test';
    const version = '20260301090300';

    beforeEach(async () => {
      dir = await mkdtemp(path.join(tmpdir(), 'mongoat-runner-suppression-'));
      config = { dir, collection: '_migrations_suppression_view_test' };

      const migrationFilePath = path.join(dir, `${version}_bump_marker.ts`);

      await writeFile(
        migrationFilePath,
        `import type { MigrationContext } from '@/types/migrate';

export async function up({ db, session }: MigrationContext): Promise<void> {
  await db.collection('${markerCollection}').insertOne({ marker: true }, { session });
}

export async function down({ db, session }: MigrationContext): Promise<void> {
  await db.collection('${markerCollection}').deleteMany({}, { session });
}
`
      );

      const checksum = await computeChecksum(migrationFilePath);

      // A read-only VIEW still allows find/findOne — it rejects ANY write
      // (insert/update/delete) with a dedicated server error ("is a view,
      // not a collection"), which is exactly what we need to force the
      // post-down() deleteOne to fail deterministically, without touching
      // production code (D-10). The applied record lives in the underlying
      // source collection; `config.collection` (the view) is what the
      // runner actually reads/writes.
      await nativeDb.collection<MigrationRecord>(sourceCollection).insertOne({
        version,
        name: 'bump_marker',
        checksum,
        appliedAt: new Date(),
        status: 'applied',
      });
      await nativeDb.createCollection(config.collection, {
        viewOn: sourceCollection,
        pipeline: [],
      });
      await nativeDb.collection(markerCollection).insertOne({ marker: true });
    });

    afterEach(async () => {
      await rm(dir, { recursive: true, force: true });
      await nativeDb.collection(config.collection).drop();
      await nativeDb.collection(sourceCollection).deleteMany({});
      await nativeDb.collection(markerCollection).deleteMany({});
    });

    it('rejects with MIGRATION_STATE_WRITE_FAILED after down() already ran', async () => {
      let caughtError: unknown;

      try {
        await revertMigration(db, version, config);
      } catch (err) {
        caughtError = err;
      }

      expect(caughtError).toBeInstanceOf(MongoatError);
      const err = caughtError as MongoatError;

      expect(err.code).toBe('MIGRATION_STATE_WRITE_FAILED');
      expect(err.cause).toBeInstanceOf(Error);
      expect(err.message.toLowerCase()).toContain('do not');

      // down() itself DID run despite the record removal failing.
      const markerCount = await nativeDb
        .collection(markerCollection)
        .countDocuments();

      expect(markerCount).toBe(0);
    });
  });
});
