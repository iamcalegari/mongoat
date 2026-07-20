import { Document } from 'mongodb';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { Database } from '@/database';
import { Model } from '@/model';
import { ModelValidationSchema } from '@/types';
import { METHODS } from '@/utils/enums';

/**
 * Bug original: `setupIndexes` executava `dropIndexes()` INCONDICIONAL antes
 * de recriar os índices do model — destruindo índices criados fora do
 * Mongoat (DBAs/migrations) e abrindo uma janela sem unicidade entre o drop
 * e o recreate a cada boot (`setupCollections()` roda a cada deploy).
 *
 * Fix: diff — `createIndex` é idempotente para specs idênticas; apenas o
 * índice gerenciado específico cuja spec divergiu é derrubado e recriado.
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

describe('Database — setupIndexes sem dropIndexes incondicional', () => {
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
      collectionName: 'setup_indexes_diff',
      allowedMethods: [METHODS.FIND],
      indexes: [{ key: { name: 1 }, name: 'managed_name_idx' }],
      schema,
    });

    await db.setupCollection(model as unknown as Model);
  });

  afterAll(async () => {
    Database.resetRegistry();
    await db.disconnect();
  });

  it('índice externo (não gerenciado) sobrevive a um novo setupCollection', async () => {
    const rawCollection = db.getCollection('setup_indexes_diff');
    expect(rawCollection).toBeDefined();

    // Índice criado FORA do Mongoat (ex.: por um DBA/migration).
    await rawCollection!.createIndex({ external: 1 }, { name: 'external_idx' });

    // Simula um novo boot da aplicação.
    await db.setupCollection(model as unknown as Model);

    const indexNames = (await rawCollection!.listIndexes().toArray()).map(
      (index) => index.name
    );

    expect(indexNames).toContain('external_idx');
    expect(indexNames).toContain('managed_name_idx');
  });

  it('índice gerenciado com spec divergente é substituído (apenas ele)', async () => {
    const rawCollection = db.getCollection('setup_indexes_diff');

    // Mesma key e mesmo nome, opção nova — conflito de spec com o índice
    // existente `managed_name_idx`.
    (model as unknown as Model).indexes = [
      { key: { name: 1 }, name: 'managed_name_idx', unique: true },
    ];

    await db.setupCollection(model as unknown as Model);

    const indexes = await rawCollection!.listIndexes().toArray();
    const managed = indexes.find((index) => index.name === 'managed_name_idx');

    expect(managed?.unique).toBe(true);
    // O índice externo continua intacto.
    expect(indexes.map((index) => index.name)).toContain('external_idx');
  });
});
