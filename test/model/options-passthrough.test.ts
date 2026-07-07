import { Document, ObjectId } from 'mongodb';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { Database } from '@/database';
import { Model } from '@/model';
import { ModelValidationSchema } from '@/types';
import { METHODS } from '@/utils/enums';

/**
 * Options passthrough tipado (D-09/API-01).
 *
 * `ctx.options` é a MESMA referência usada na chamada ao driver — um
 * pre-hook que muta `ctx.options` afeta a chamada real (Pattern 3/Pitfall
 * 4). Cobre também o caso mais simples: options nativas passadas
 * diretamente na chamada pública têm efeito observável no driver, sem
 * nenhum hook envolvido.
 */
interface Doc extends Document {
  name: string;
  tag: string;
}

const schema: ModelValidationSchema = {
  bsonType: 'object',
  properties: {
    name: { bsonType: 'string' },
    tag: { bsonType: 'string' },
  },
  required: ['name', 'tag'],
};

describe('Model — options passthrough tipado (D-09/API-01)', () => {
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

  it('pre-hook que muta ctx.options.limit afeta a chamada real ao driver (findMany)', async () => {
    const model = new Model<Doc>({
      collectionName: 'options_passthrough_mutate_limit',
      allowedMethods: [METHODS.INSERT_MANY, METHODS.FIND_MANY],
      schema,
    });

    await db.setupCollection(model as unknown as Model);

    await model.insertMany([
      { name: 'a', tag: 'x' },
      { name: 'b', tag: 'x' },
      { name: 'c', tag: 'x' },
    ]);

    model.pre(METHODS.FIND_MANY, (ctx) => {
      // Caller não passou `limit` nenhum — o pre-hook injeta um.
      ctx.options.limit = 1;
    });

    const results = await model.findMany({ tag: 'x' });
    expect(results).toHaveLength(1);
  });

  it('pre-hook que muta ctx.options.projection afeta a chamada real ao driver (findMany)', async () => {
    const model = new Model<Doc>({
      collectionName: 'options_passthrough_mutate_projection',
      allowedMethods: [METHODS.INSERT_MANY, METHODS.FIND_MANY],
      schema,
    });

    await db.setupCollection(model as unknown as Model);

    await model.insertMany([{ name: 'projected', tag: 'y' }]);

    model.pre(METHODS.FIND_MANY, (ctx) => {
      ctx.options.projection = { name: 0 };
    });

    const [result] = await model.findMany({ tag: 'y' });
    expect(result?.name).toBeUndefined();
    expect(result?.tag).toBe('y');
  });

  it('options nativas passadas diretamente na chamada pública têm efeito observável (sem hook)', async () => {
    const model = new Model<Doc>({
      collectionName: 'options_passthrough_direct_call',
      allowedMethods: [METHODS.INSERT_MANY, METHODS.FIND_MANY],
      schema,
    });

    await db.setupCollection(model as unknown as Model);

    await model.insertMany([
      { name: 'd', tag: 'z' },
      { name: 'e', tag: 'z' },
    ]);

    const results = await model.findMany({ tag: 'z' }, { limit: 1 });
    expect(results).toHaveLength(1);
  });

  it('pre-hook que muta ctx.options em insertMany chega ao driver (Pitfall 4 fechado)', async () => {
    const model = new Model<Doc>({
      collectionName: 'options_passthrough_insertmany_options',
      allowedMethods: [METHODS.INSERT, METHODS.INSERT_MANY, METHODS.FIND_MANY],
      schema,
    });

    await db.setupCollection(model as unknown as Model);

    // Semeia um documento com um _id conhecido para forçar um conflito de
    // chave duplicada no meio do batch.
    const duplicateId = new ObjectId();
    await model.insert({ _id: duplicateId, name: 'seed', tag: 'w' } as Doc);

    // `ordered: false` (nativo do driver) só é observável se a MUTAÇÃO do
    // pre-hook — não o parâmetro `options` original, ainda `{}` na chamada
    // pública — chegar de fato em `collection.insertMany`: com
    // `ordered: true` (default do driver), o batch pararia no primeiro
    // erro e o terceiro documento NUNCA seria inserido; com `ordered:
    // false` de fato aplicado, o batch continua após o erro de duplicata.
    model.pre(METHODS.INSERT_MANY, (ctx) => {
      ctx.options.ordered = false;
    });

    await expect(
      model.insertMany([
        { _id: duplicateId, name: 'dup', tag: 'w' } as Doc, // colide, erra
        { name: 'after-duplicate', tag: 'w' }, // só sobrevive com ordered:false
      ])
    ).rejects.toThrow();

    const survivor = await model.findMany({ tag: 'w', name: 'after-duplicate' });
    expect(survivor).toHaveLength(1);
  });
});
