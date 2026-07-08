import { Document } from 'mongodb';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { Database } from '@/database';
import { Model } from '@/model';
import { ModelValidationSchema } from '@/types';
import { METHODS } from '@/utils/enums';

/**
 * Regressão de idempotência complementar a `setup-indexes.test.ts` (WR-10).
 *
 * O arquivo existente cobre "índice externo sobrevive" e "índice gerenciado
 * com spec divergente é substituído" — ambos rodando `setupCollection` UMA
 * vez e depois mudando algo (spec do model ou índice criado fora do
 * Mongoat) antes da 2ª chamada. Este arquivo cobre o caso que falta:
 * chamar `setupCollection` DUAS vezes com a MESMA spec de índice gerenciado
 * não deve dropar nem recriar NADA — nem o índice gerenciado (idêntico),
 * nem o índice externo (não-gerenciado). Prova SEC-04: `setupIndexes` só
 * toca o que de fato mudou.
 *
 * Usa `setup_indexes_regression` como nome de collection — não colide com
 * `setup_indexes_diff` do teste existente.
 */
interface Doc extends Document {
  name: string;
}

const schema: ModelValidationSchema = {
  bsonType: 'object',
  properties: {
    name: { bsonType: 'string' },
  },
  required: ['name'],
};

describe('Database — setupIndexes idempotente com spec idêntica (SEC-04, regressão)', () => {
  let db: Database;
  let model: Model<Doc>;

  beforeAll(async () => {
    db = new Database({
      uri: process.env.MONGODB_URI,
      dbName: process.env.MONGODB_DB_NAME,
    });

    await db.connect();
    Model.setDatabase(db);

    model = new Model<Doc>({
      collectionName: 'setup_indexes_regression',
      allowedMethods: [METHODS.FIND],
      indexes: [{ key: { name: 1 }, name: 'managed_name_idx' }],
      schema,
    });

    // 1ª chamada — cria a collection + o índice gerenciado.
    await db.setupCollection(model as unknown as Model);
  });

  afterAll(async () => {
    Database.resetRegistry();
    await db.disconnect();
  });

  it('2ª chamada com a MESMA spec não dropa nem recria índice gerenciado nem externo (idempotência)', async () => {
    const rawCollection = db.getCollection('setup_indexes_regression');
    expect(rawCollection).toBeDefined();

    // Índice criado FORA do Mongoat (ex.: por um DBA/migration) — deve
    // sobreviver a qualquer nova chamada de setupCollection.
    await rawCollection!.createIndex({ external: 1 }, { name: 'external_idx' });

    const indexesBefore = await rawCollection!.listIndexes().toArray();
    const indexNamesBefore = indexesBefore.map((index) => index.name).sort();
    const managedBefore = indexesBefore.find(
      (index) => index.name === 'managed_name_idx'
    );

    // 2ª chamada — MESMA spec de índice gerenciado (nenhuma mudança).
    // Simula um novo boot da aplicação sem nenhuma alteração de schema de
    // índice.
    await db.setupCollection(model as unknown as Model);

    const indexesAfter = await rawCollection!.listIndexes().toArray();
    const indexNamesAfter = indexesAfter.map((index) => index.name).sort();
    const managedAfter = indexesAfter.find(
      (index) => index.name === 'managed_name_idx'
    );

    // (a) mesmo conjunto de índices — nada foi dropado nem recriado.
    expect(indexNamesAfter).toEqual(indexNamesBefore);
    expect(indexesAfter).toHaveLength(indexesBefore.length);

    // (b) índice externo (não-gerenciado) continua presente.
    expect(indexNamesAfter).toContain('external_idx');

    // (c) índice gerenciado continua presente com a mesma spec (mesma
    // key e mesmas opções — não foi dropado/recriado com metadata nova).
    expect(managedAfter).toBeDefined();
    expect(managedAfter?.key).toEqual(managedBefore?.key);
    expect(managedAfter?.name).toBe(managedBefore?.name);
    expect(managedAfter?.unique).toBe(managedBefore?.unique);
  });
});
