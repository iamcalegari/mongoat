import { afterEach, describe, expect, it } from 'vitest';

import { Database } from '@/database';
import { MongoatError } from '@/errors';

/**
 * `kGetDbName` não deve mais cair num fallback silencioso ("mongoat-test" /
 * `${PACKAGE}-test-${JEST_WORKER_ID}`) quando nenhum nome de banco está
 * configurado — deve lançar `MongoatError` de forma explícita.
 *
 * `test/setup/testcontainer.ts` (globalSetup) já define
 * `process.env.MONGODB_DB_NAME = 'mongoat_test'` para toda a suíte — os
 * casos "sem env" abaixo removem essa variável temporariamente e a
 * restauram no `afterEach`, para não vazar estado para outros testes deste
 * arquivo.
 */
describe('Database — kGetDbName sem fallback de teste', () => {
  const originalEnvDbName = process.env.MONGODB_DB_NAME;
  const openDatabases: Database[] = [];

  afterEach(async () => {
    for (const db of openDatabases.splice(0)) {
      await db.disconnect();
    }

    if (originalEnvDbName === undefined) {
      delete process.env.MONGODB_DB_NAME;
    } else {
      process.env.MONGODB_DB_NAME = originalEnvDbName;
    }
  });

  it('usa MONGODB_DB_NAME do ambiente quando presente', async () => {
    const db = new Database({
      uri: process.env.MONGODB_URI,
    });
    openDatabases.push(db);

    const resolvedDbName = await db.connect();

    expect(resolvedDbName).toBe(process.env.MONGODB_DB_NAME);
  });

  it('usa config.dbName quando MONGODB_DB_NAME não está no ambiente', async () => {
    delete process.env.MONGODB_DB_NAME;

    const db = new Database({
      uri: process.env.MONGODB_URI,
      dbName: 'mongoat_dbname_config_test',
    });
    openDatabases.push(db);

    const resolvedDbName = await db.connect();

    expect(resolvedDbName).toBe('mongoat_dbname_config_test');
  });

  it('lança MongoatError descritivo quando nenhum dbName está configurado (sem fallback silencioso)', async () => {
    delete process.env.MONGODB_DB_NAME;

    const db = new Database({
      uri: process.env.MONGODB_URI,
    });
    openDatabases.push(db);

    await expect(db.connect()).rejects.toThrow(MongoatError);
    await expect(db.connect()).rejects.toThrow(/MONGODB_DB_NAME/);
    await expect(db.connect()).rejects.toThrow(/config\.dbName/);
  });
});
