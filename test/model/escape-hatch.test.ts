import { Collection, Document } from 'mongodb';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { Database } from '@/database';
import { Model } from '@/model';
import { ModelValidationSchema } from '@/types';
import { METHODS } from '@/utils/enums';

/**
 * Escape hatch honesto de `Model.getCollection()` (D-08/API-02).
 *
 * `getCollection()` devolve a `Collection<ModelType>` CRUA do driver —
 * bypass simultâneo de hooks (nunca dispara o pipeline pre/post) e de
 * gating de `allowedMethods` (não está no enum `METHODS`, então o
 * `KModelProxyHandler` já a deixa passar sem checagem).
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

describe('Model — escape hatch getCollection() (D-08/API-02)', () => {
  let db: Database;

  beforeAll(async () => {
    db = new Database({
      uri: process.env.MONGODB_URI,
      dbName: process.env.MONGODB_DB_NAME,
    });

    await db.connect();
  });

  afterAll(async () => {
    Database.resetRegistry();
    await db.disconnect();
  });

  it('getCollection() retorna a Collection nativa do driver', async () => {
    const model = new Model<Doc>({
      collectionName: 'escape_hatch_model_shape',
      allowedMethods: [METHODS.FIND],
      schema,
    });

    await db.setupCollection(model as unknown as Model);

    const collection = model.getCollection();

    expect(collection).toBeInstanceOf(Collection);
    expect(collection.collectionName).toBe('escape_hatch_model_shape');
  });

  it('bypassa o gating de allowedMethods: escrita direta na Collection funciona mesmo com INSERT fora de allowedMethods', async () => {
    const model = new Model<Doc>({
      collectionName: 'escape_hatch_model_gating',
      allowedMethods: [METHODS.FIND], // INSERT deliberadamente fora
      schema,
    });

    await db.setupCollection(model as unknown as Model);

    // Chamando model.insert() diretamente lançaria MongoatError (gating
    // normal do Proxy) — mas a Collection crua não passa pelo Proxy.
    expect(() => (model as unknown as Model<Doc>).insert({ name: 'x' })).toThrow(
      /not allowed/
    );

    const { insertedId } = await model.getCollection().insertOne({
      name: 'via-escape-hatch',
    } as Doc);

    expect(insertedId).toBeDefined();

    const found = await model.getCollection().findOne({ _id: insertedId });
    expect(found?.name).toBe('via-escape-hatch');
  });

  it('bypassa o pipeline de hooks: hook registrado em INSERT não dispara para insertOne via getCollection()', async () => {
    const model = new Model<Doc>({
      collectionName: 'escape_hatch_model_hooks',
      allowedMethods: [METHODS.INSERT],
      schema,
    });

    await db.setupCollection(model as unknown as Model);

    let hookFired = false;
    model.pre(METHODS.INSERT, () => {
      hookFired = true;
    });

    await model.getCollection().insertOne({ name: 'no-hooks' } as Doc);

    expect(hookFired).toBe(false);

    // Controle: o mesmo hook DISPARA quando passa pelo método público do
    // Model (prova que o hook está corretamente registrado — a ausência
    // acima é bypass, não um hook quebrado).
    await model.insert({ name: 'via-model-insert' });
    expect(hookFired).toBe(true);
  });

  it('getCollection() reaproveita getCollectionOrThrow() — fail-loud pré-conexão preservado', async () => {
    const isolatedModel = new Model<Doc>({
      collectionName: 'escape_hatch_model_disconnected_check',
      allowedMethods: [METHODS.FIND],
      schema,
    });

    await db.setupCollection(isolatedModel as unknown as Model);
    await db.disconnect();

    expect(() => isolatedModel.getCollection()).toThrow(
      'Database not connected — call db.connect() first'
    );

    // Reconecta para não vazar estado desconectado para os testes seguintes
    // (afterAll também chama disconnect(), mas idempotente).
    await db.connect();
  });
});
