import { Document } from 'mongodb';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { Database } from '@/database';
import { MongoatValidationError } from '@/errors';
import { Model } from '@/model';
import { ModelValidationSchema } from '@/types';
import { METHODS } from '@/utils/enums';

/**
 * Guard incondicional de `$where` embutido nos 7 métodos com `filter`
 * (find, findMany, update, updateMany, delete, deleteMany, total) — sempre
 * ativo, não-desligável. Rejeita `$where` em qualquer profundidade (topo e
 * aninhado em `$and`/`$or`), ANTES de tocar o driver (nada é
 * persistido/lido). Um filtro legítimo com `$gt` passa normalmente, e
 * `findById` (que monta `{ _id }` internamente) não é afetado.
 */
interface Doc extends Document {
  name: string;
  age: number;
}

const schema: ModelValidationSchema = {
  bsonType: 'object',
  properties: {
    name: { bsonType: 'string' },
    age: { bsonType: 'int' },
  },
  required: ['name', 'age'],
};

describe('Guard incondicional de $where nos 7 métodos com filter', () => {
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
      collectionName: 'where_rejection',
      allowedMethods: [
        METHODS.INSERT,
        METHODS.INSERT_MANY,
        METHODS.FIND,
        METHODS.FIND_BY_ID,
        METHODS.FIND_MANY,
        METHODS.UPDATE,
        METHODS.UPDATE_MANY,
        METHODS.DELETE,
        METHODS.DELETE_MANY,
        METHODS.TOTAL,
      ],
      schema,
    });

    await db.setupCollection(model as unknown as Model);

    await model.insertMany([
      { name: 'alice', age: 30 },
      { name: 'bob', age: 25 },
    ]);
  });

  afterAll(async () => {
    Database.resetRegistry();
    await db.disconnect();
  });

  const whereAtTop = { $where: 'this.age > 0' } as unknown as Record<
    string,
    unknown
  >;
  const whereNested = {
    $and: [{ $where: 'this.age > 0' }, { name: 'alice' }],
  } as unknown as Record<string, unknown>;

  it.each([
    ['find', whereAtTop],
    ['find (aninhado em $and)', whereNested],
  ])('find rejeita $where — %s', async (_label, filter) => {
    await expect(model.find(filter as Doc)).rejects.toMatchObject({
      code: 'FORBIDDEN_OPERATOR',
    });
  });

  it('findMany rejeita $where de topo e aninhado', async () => {
    await expect(
      model.findMany(whereAtTop as unknown as Doc)
    ).rejects.toBeInstanceOf(MongoatValidationError);
    await expect(
      model.findMany(whereNested as unknown as Doc)
    ).rejects.toMatchObject({ code: 'FORBIDDEN_OPERATOR' });
  });

  it('update rejeita $where — nenhum documento é modificado', async () => {
    await expect(
      model.update(whereAtTop as unknown as Doc, { $set: { age: 99 } })
    ).rejects.toMatchObject({ code: 'FORBIDDEN_OPERATOR' });

    const untouched = await model.findMany({ name: 'alice' } as Doc);
    expect(untouched[0]?.age).toBe(30);
  });

  it('updateMany rejeita $where — nenhum documento é modificado', async () => {
    await expect(
      model.updateMany(whereNested as unknown as Doc, { $set: { age: 99 } })
    ).rejects.toMatchObject({ code: 'FORBIDDEN_OPERATOR' });

    const untouched = await model.findMany({ name: 'alice' } as Doc);
    expect(untouched[0]?.age).toBe(30);
  });

  it('delete rejeita $where — nenhum documento é removido', async () => {
    await expect(
      model.delete(whereAtTop as unknown as Doc)
    ).rejects.toMatchObject({ code: 'FORBIDDEN_OPERATOR' });

    const total = await model.total();
    expect(total).toBe(2);
  });

  it('deleteMany rejeita $where — nenhum documento é removido', async () => {
    await expect(
      model.deleteMany(whereNested as unknown as Doc)
    ).rejects.toMatchObject({ code: 'FORBIDDEN_OPERATOR' });

    const total = await model.total();
    expect(total).toBe(2);
  });

  it('total rejeita $where', async () => {
    await expect(
      model.total(whereAtTop as unknown as Doc)
    ).rejects.toMatchObject({ code: 'FORBIDDEN_OPERATOR' });
  });

  it('filtro legítimo com $gt passa normalmente (não é falso positivo)', async () => {
    const results = await model.findMany({
      age: { $gt: 20 },
    } as unknown as Doc);
    expect(results).toHaveLength(2);
  });

  it('findById continua funcionando — o filtro { _id } interno não contém $where', async () => {
    const inserted = await model.insert({ name: 'carol', age: 40 } as Doc);
    const found = await model.findById(inserted._id);

    expect(found?.name).toBe('carol');
  });
});
