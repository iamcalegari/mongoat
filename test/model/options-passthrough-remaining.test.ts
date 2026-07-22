import { Document, ObjectId } from 'mongodb';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { Database } from '@/database';
import { Model } from '@/model';
import { ModelValidationSchema } from '@/types';
import { METHODS } from '@/utils/enums';

/**
 * Fecha a classe de regressão de `ctx.options` mutation para os 4 métodos
 * historicamente afetados (options `undefined` sem default `{}`). `find` e
 * `delete` já ganharam cobertura dedicada em `options-passthrough.test.ts`
 * (commit `b51c4c9`, mesmo fix); este arquivo cobre os 2 métodos que
 * ficavam sem teste: `findById` e `bulkWrite`.
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

describe('Model — options passthrough remanescente (findById/bulkWrite)', () => {
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

  it('pre-hook que muta ctx.options.projection afeta a chamada real ao driver (findById, sem options do caller)', async () => {
    const model = new Model<Doc>({
      collectionName: 'options_passthrough_findbyid_redact',
      allowedMethods: [METHODS.INSERT, METHODS.FIND_BY_ID],
      schema,
    });

    await db.setupCollection(model as unknown as Model);

    const inserted = await model.insert({
      name: 'sensitive',
      tag: 'findbyid-redact',
    } as Doc);

    model.pre(METHODS.FIND_BY_ID, (ctx) => {
      // Caller não passou options — o pre-hook injeta a projection que
      // redige o campo sensível.
      ctx.options.projection = { name: 0 };
    });

    // Chamada pública SEM options: prova que ctx.options tem default `{}`
    // e que a mutação chega ao driver via findById → find interno.
    const found = await model.findById(inserted._id);
    expect(found?.name).toBeUndefined();
    expect(found?.tag).toBe('findbyid-redact');
  });

  it('pre-hook que muta ctx.options em bulkWrite chega ao driver (ordered:false)', async () => {
    const model = new Model<Doc>({
      collectionName: 'options_passthrough_bulkwrite_ordered',
      allowedMethods: [METHODS.INSERT, METHODS.FIND_MANY, METHODS.BULK_WRITE],
      schema,
    });

    await db.setupCollection(model as unknown as Model);

    // Semeia um documento com _id conhecido para forçar um conflito de
    // chave duplicada no meio do batch.
    const duplicateId = new ObjectId();
    await model.insert({ _id: duplicateId, name: 'seed', tag: 'bw' } as Doc);

    // `ordered: false` (nativo do driver) só é observável se a MUTAÇÃO do
    // pre-hook — não o parâmetro `options` original, ainda `{}` na chamada
    // pública — chegar de fato em `collection.bulkWrite`: com `ordered:
    // true` (default do driver), o batch pararia no primeiro erro e a
    // segunda operação nunca seria aplicada; com `ordered: false` de fato
    // aplicado, o batch continua após o erro de duplicata.
    model.pre(METHODS.BULK_WRITE, (ctx) => {
      ctx.options.ordered = false;
    });

    await expect(
      model.bulkWrite([
        {
          insertOne: { document: { _id: duplicateId, name: 'dup', tag: 'bw' } },
        }, // colide, erra
        { insertOne: { document: { name: 'after-duplicate', tag: 'bw' } } }, // só sobrevive com ordered:false
      ])
    ).rejects.toThrow();

    const survivor = await model.findMany({
      tag: 'bw',
      name: 'after-duplicate',
    } as Doc);
    expect(survivor).toHaveLength(1);
  });
});
