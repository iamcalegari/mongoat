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
import { MongoatConnectionError } from '@/errors';
import { runMigrations } from '@/migrate/runner';
import { assertReplicaSetOrThrow } from '@/migrate/topology';
import type { MigrationRecord } from '@/types/migrate';
import setupStandaloneContainer from '@test/setup/testcontainer-standalone';

/**
 * @internal
 *
 * Builds a `Database` instance pointed at the STANDALONE test container.
 * `Database`'s URL/dbName resolution reads `MONGODB_URI`/`MONGODB_DB_NAME`
 * from the environment EVERY time `connect()` runs (not just once at
 * construction) — since the shared replica-set container's `globalSetup`
 * sets both globally for every other test file, a synchronous env-var
 * swap around only the constructor call is not enough (the `await` for
 * `connect()` would observe the RESTORED, wrong values).
 *
 * Instead, this bypasses `Database`'s own connection resolution entirely
 * by pre-supplying an already-connected `MongoClient`/`Db` pair (the
 * constructor's optional 2nd/3rd args) — `isConnected()` is then already
 * `true`, `connect()` becomes a no-op, and no env var is ever read.
 */
async function newStandaloneDatabase(): Promise<Database> {
  const rawClient = new MongoClient(
    process.env.MONGODB_STANDALONE_URI as string
  );

  await rawClient.connect();

  const rawDb = rawClient.db('mongoat_test_standalone');

  return new Database({}, rawClient, rawDb);
}

/**
 * Proves `assertReplicaSetOrThrow` against a GENUINE
 * standalone MongoDB — not the shared replica-set container used by every
 * other test file (`test/setup/testcontainer.ts`'s `globalSetup`), which
 * would make this test pass even if the detection logic were broken.
 *
 * Wired via a per-file `beforeAll`/`afterAll` (NOT the shared vitest
 * `globalSetup`), so only this file pays the cost of a second Docker
 * container.
 *
 * Connects via a raw native `MongoClient` (not the `Database` class) —
 * `Database`'s constructor deliberately prioritizes the `MONGODB_URI` env
 * var (already set globally by the shared replica-set container's own
 * `globalSetup`) over `config.uri`, which would silently point this test at
 * the WRONG (replica-set) server. The native driver has no such env-var
 * precedence, matching the "escape hatch, no ODM abstraction" philosophy
 * `assertReplicaSetOrThrow` itself is built on (it takes a raw `Db`).
 */
describe('assertReplicaSetOrThrow — standalone MongoDB', () => {
  let teardown: () => Promise<void>;
  let client: MongoClient;
  let nativeDb: Db;

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

  it('rejeita com MongoatConnectionError(REPLICA_SET_REQUIRED) por padrão contra standalone', async () => {
    await expect(assertReplicaSetOrThrow(nativeDb)).rejects.toMatchObject({
      code: 'REPLICA_SET_REQUIRED',
    });

    await expect(assertReplicaSetOrThrow(nativeDb)).rejects.toBeInstanceOf(
      MongoatConnectionError
    );
  });

  it('resolve com hasReplicaSet=false quando allowNoTransaction=true (opt-in explícito)', async () => {
    const result = await assertReplicaSetOrThrow(nativeDb, {
      allowNoTransaction: true,
    });

    expect(result).toEqual({ hasReplicaSet: false });
  });

  /**
   * Regression — proves the topology precondition failure is NOT
   * misclassified as a migration failure: `runMigrations` against this
   * GENUINE standalone container, with at least one pending migration and
   * NO `allowNoTransaction`, must reject with the original
   * `REPLICA_SET_REQUIRED` error (never re-wrapped as `MIGRATION_FAILED`),
   * and must NOT persist any record — `failed` or otherwise — to the
   * control collection for the migration that never ran.
   */
  describe('runMigrations — Regression (topology precondition is not a migration failure)', () => {
    let dir: string;
    const collection = '_migrations_cr01_test';

    beforeEach(async () => {
      dir = await mkdtemp(path.join(tmpdir(), 'mongoat-cr01-'));

      await writeFile(
        path.join(dir, '20260101130000_cr01_pending.ts'),
        `import type { MigrationContext } from '@/types/migrate';

export async function up({ db, session }: MigrationContext): Promise<void> {
  await db.collection('cr01_marker').insertOne({ ran: true }, { session });
}
`
      );
    });

    afterEach(async () => {
      await rm(dir, { recursive: true, force: true });
      await nativeDb.collection(collection).deleteMany({});
      await nativeDb.collection('cr01_marker').deleteMany({});
    });

    it('propaga REPLICA_SET_REQUIRED (não MIGRATION_FAILED) e não grava nenhum registro quando standalone sem allowNoTransaction', async () => {
      const database = await newStandaloneDatabase();

      try {
        await expect(
          runMigrations(database, { dir, collection })
        ).rejects.toMatchObject({ code: 'REPLICA_SET_REQUIRED' });

        await expect(
          runMigrations(database, { dir, collection })
        ).rejects.toBeInstanceOf(MongoatConnectionError);

        const records = await nativeDb
          .collection<MigrationRecord>(collection)
          .find()
          .toArray();

        // No record at all — not "applied", not a bogus "failed" record
        // for a migration that never ran.
        expect(records).toHaveLength(0);

        const markerCount = await nativeDb
          .collection('cr01_marker')
          .countDocuments();
        expect(markerCount).toBe(0);
      } finally {
        await database.disconnect();
      }
    });

    it('aplica a migração normalmente quando allowNoTransaction=true, mesmo em standalone', async () => {
      const database = await newStandaloneDatabase();

      try {
        await runMigrations(database, {
          dir,
          collection,
          allowNoTransaction: true,
        });

        const records = await nativeDb
          .collection<MigrationRecord>(collection)
          .find()
          .toArray();

        expect(records).toHaveLength(1);
        expect(records[0]).toMatchObject({
          version: '20260101130000',
          name: 'cr01_pending',
          status: 'applied',
        });

        const markerCount = await nativeDb
          .collection('cr01_marker')
          .countDocuments();
        expect(markerCount).toBe(1);
      } finally {
        await database.disconnect();
      }
    });
  });
});
