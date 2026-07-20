import { AnyBulkWriteOperation, Document, UpdateFilter } from 'mongodb';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { Database } from '@/database';
import { MongoatDriverError } from '@/errors';
import { Model } from '@/model';
import { ModelValidationSchema } from '@/types';
import { METHODS } from '@/utils/enums';

/**
 * Cenários de ERRO por método: `aggregate`, `total`, `update`/`updateMany`,
 * `delete`/`deleteMany` e `bulkWrite` não tinham nenhum teste de erro
 * dedicado (só os happy paths, em `crud-happy-path.test.ts`).
 *
 * Só `insert`/`insertMany`/`bulkWrite` passam por `wrapDriverError`
 * (`src/model/index.ts`) — os demais (`aggregate`/`total`/`update`/
 * `updateMany`/`delete`/`deleteMany`) propagam o erro NATIVO do driver sem
 * wrap — decisão deliberada, não alterada aqui. Onde o erro de fato passa por
 * `wrapDriverError` (`bulkWrite`), o teste asserta `MongoatDriverError` com
 * `.cause` preservado, igual ao padrão já usado em `insert-error-cause.test.ts`.
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

describe('Model — gap-fill de cenários de erro por método', () => {
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
      collectionName: 'crud_error_coverage',
      allowedMethods: [
        METHODS.INSERT,
        METHODS.FIND_MANY,
        METHODS.UPDATE,
        METHODS.UPDATE_MANY,
        METHODS.DELETE,
        METHODS.DELETE_MANY,
        METHODS.TOTAL,
        METHODS.AGGREGATE,
        METHODS.BULK_WRITE,
      ],
      schema,
    });

    await db.setupCollection(model as unknown as Model);

    await model.insert({ name: 'seed', age: 10 } as Doc);
  });

  afterAll(async () => {
    Database.resetRegistry();
    await db.disconnect();
  });

  it('aggregate() com estágio de pipeline inválido rejeita com erro do driver — nenhum wrap, mas falha alto', async () => {
    await expect(
      model.aggregate([{ $notARealPipelineStage: {} }])
    ).rejects.toThrow();
  });

  it('total() com operador de filtro desconhecido rejeita com erro do driver', async () => {
    await expect(
      model.total({ $notARealOperator: 1 } as unknown as Doc)
    ).rejects.toThrow();
  });

  it('update() com modifier de update desconhecido rejeita com erro do driver — documento não é alterado', async () => {
    await expect(
      model.update(
        { name: 'seed' } as Doc,
        { $notARealModifier: { age: 1 } } as unknown as UpdateFilter<Doc>
      )
    ).rejects.toThrow();

    const [untouched] = await model.findMany({ name: 'seed' } as Doc);
    expect(untouched?.age).toBe(10);
  });

  it('updateMany() com modifier de update desconhecido rejeita com erro do driver', async () => {
    await expect(
      model.updateMany(
        { name: 'seed' } as Doc,
        { $notARealModifier: { age: 1 } } as unknown as UpdateFilter<Doc>
      )
    ).rejects.toThrow();
  });

  it('delete() com operador de filtro desconhecido rejeita com erro do driver — nenhum documento é removido', async () => {
    await expect(
      model.delete({ $notARealOperator: 1 } as unknown as Doc)
    ).rejects.toThrow();

    const total = await model.total();
    expect(total).toBe(1);
  });

  it('deleteMany() com operador de filtro desconhecido rejeita com erro do driver', async () => {
    await expect(
      model.deleteMany({ $notARealOperator: 1 } as unknown as Doc)
    ).rejects.toThrow();

    const total = await model.total();
    expect(total).toBe(1);
  });

  it('bulkWrite() com operação que viola o schema rejeita com MongoatDriverError (.cause preservado)', async () => {
    let caughtError: unknown;

    try {
      // `insertOne` com documento vazio viola o validator ($jsonSchema —
      // `name`/`age` required), igual ao cenário já usado em
      // insert-error-cause.test.ts, mas via bulkWrite.
      await model.bulkWrite([
        { insertOne: { document: {} } },
      ] as unknown as AnyBulkWriteOperation<Doc>[]);
    } catch (err) {
      caughtError = err;
    }

    expect(caughtError).toBeInstanceOf(MongoatDriverError);
    expect((caughtError as MongoatDriverError).cause).toBeInstanceOf(Error);
  });
});
