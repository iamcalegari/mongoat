import { Db, MongoClient } from 'mongodb';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { MongoatConnectionError } from '@/errors';
import { assertReplicaSetOrThrow } from '@/migrate/topology';
import setupStandaloneContainer from '@test/setup/testcontainer-standalone';

/**
 * Proves `assertReplicaSetOrThrow` (Pitfall 3 / D-03) against a GENUINE
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
describe('assertReplicaSetOrThrow — standalone MongoDB (Pitfall 3)', () => {
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
});
