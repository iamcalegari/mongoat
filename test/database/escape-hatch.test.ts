import { Db, MongoClient } from 'mongodb';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { Database } from '@/database';
import { METHODS } from '@/utils/enums';

/**
 * Escape hatch honesto de `Database.getClient()`/`getDb()` (D-08/API-03).
 *
 * `Database` nunca é envolvida em Proxy (só `Model` é) — `getClient()`/
 * `getDb()` já são "escape total" por natureza, sem gating nenhum a
 * contornar. Reforça também que o enum `METHODS` permanece com 12 membros
 * — o escape hatch (de Model E de Database) não poluiu o enum de gating.
 */
describe('Database — escape hatch getClient()/getDb() (D-08/API-03)', () => {
  let db: Database;

  beforeAll(async () => {
    db = new Database({
      uri: process.env.MONGODB_URI,
      dbName: process.env.MONGODB_DB_NAME,
    });
  });

  afterAll(async () => {
    Database.resetRegistry();
    await db.disconnect();
  });

  it('getClient()/getDb() retornam undefined antes de connect()', () => {
    expect(db.getClient()).toBeUndefined();
    expect(db.getDb()).toBeUndefined();
  });

  it('getClient() retorna a instância nativa de MongoClient após connect()', async () => {
    await db.connect();

    expect(db.getClient()).toBeInstanceOf(MongoClient);
  });

  it('getDb() retorna a instância nativa de Db conectado após connect()', () => {
    const nativeDb = db.getDb();

    expect(nativeDb).toBeInstanceOf(Db);
    expect(nativeDb?.databaseName).toBe(
      process.env.MONGODB_DB_NAME ?? nativeDb?.databaseName
    );
  });

  it('enum METHODS permanece com 12 membros — escape hatch fora do enum (D-08)', () => {
    expect(Object.values(METHODS)).toHaveLength(12);
    expect(Object.values(METHODS)).not.toContain('getCollection');
    expect(Object.values(METHODS)).not.toContain('getClient');
    expect(Object.values(METHODS)).not.toContain('getDb');
  });
});
