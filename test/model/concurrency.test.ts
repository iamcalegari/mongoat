import { Document } from 'mongodb';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { Database } from '@/database';
import { MongoatValidationError } from '@/errors';
import { Model } from '@/model';
import { ModelValidationSchema } from '@/types';
import { METHODS } from '@/utils/enums';

/**
 * Cobertura de concorrência em estado compartilhado: 2 `new Model()`
 * SIMULTÂNEOS (race), não só sequenciais — `registry-config.test.ts` já
 * cobre o caso sequencial.
 *
 * Duas frentes:
 * (a) registro concorrente do MESMO `collectionName` — 2 `new Model()`
 *     disparados via `Promise.all` (deferidos por um microtask cada, não
 *     síncronos em sequência direta) com config idêntica devolvem a MESMA
 *     instância registrada; com config divergente, um vence e o outro falha
 *     alto (nunca os dois "vencem" corrompendo o registry com config
 *     mista).
 * (b) operações CRUD paralelas no mesmo model — vários `insert`/`findMany`
 *     em `Promise.all` mantêm consistência (nenhum documento perdido/
 *     duplicado).
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

describe('Model — registro concorrente do mesmo collectionName', () => {
  let db: Database;

  beforeEach(() => {
    Database.resetRegistry();

    if (!Model.hasDatabase()) {
      db = new Database({
        uri: process.env.MONGODB_URI,
        dbName: process.env.MONGODB_DB_NAME,
      });
    }
  });

  it('2 new Model() disparados quase simultaneamente (Promise.all) com config IDÊNTICA resolvem para a MESMA instância registrada', async () => {
    const collectionName = 'concurrency_registry_same';

    const [first, second] = await Promise.all([
      Promise.resolve().then(
        () =>
          new Model<Doc>({
            collectionName,
            allowedMethods: [METHODS.FIND],
            schema,
          })
      ),
      Promise.resolve().then(
        () =>
          new Model<Doc>({
            collectionName,
            allowedMethods: [METHODS.FIND],
            schema,
          })
      ),
    ]);

    expect(second).toBe(first);

    // O registry não duplicou/corrompeu a entrada — a única entrada
    // registrada é a MESMA instância devolvida às duas chamadas
    // concorrentes.
    expect(db.getModel(collectionName)).toBe(first);
  });

  it('2 new Model() quase simultâneos com config DIVERGENTE — um resolve, o outro falha alto (MongoatValidationError), nunca os dois', async () => {
    const collectionName = 'concurrency_registry_divergent';

    const results = await Promise.allSettled([
      Promise.resolve().then(
        () =>
          new Model<Doc>({
            collectionName,
            allowedMethods: [METHODS.FIND],
            schema,
          })
      ),
      Promise.resolve().then(
        () =>
          new Model<Doc>({
            collectionName,
            allowedMethods: [METHODS.FIND, METHODS.INSERT],
            schema,
          })
      ),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(
      MongoatValidationError
    );
  });
});

describe('Model — operações CRUD paralelas no mesmo model', () => {
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
      collectionName: 'concurrency_crud_parallel',
      allowedMethods: [METHODS.INSERT, METHODS.FIND_MANY, METHODS.TOTAL],
      schema,
    });

    await db.setupCollection(model as unknown as Model);
  });

  afterAll(async () => {
    Database.resetRegistry();
    await db.disconnect();
  });

  it('N inserts paralelos (Promise.all) resultam em N documentos consistentes — nenhum se perde/duplica', async () => {
    const count = 20;

    const inserted = await Promise.all(
      Array.from({ length: count }, (_, i) =>
        model.insert({ name: `doc-${i}`, tag: 'parallel-insert' } as Doc)
      )
    );

    expect(inserted).toHaveLength(count);
    // Todos os _id gerados são únicos — nenhuma escrita paralela corrompeu
    // outra.
    expect(new Set(inserted.map((doc) => doc._id.toHexString())).size).toBe(
      count
    );

    const total = await model.total({ tag: 'parallel-insert' } as Doc);
    expect(total).toBe(count);
  });

  it('findMany paralelo (Promise.all) não corrompe o resultado — todas as leituras concorrentes veem o mesmo estado consistente', async () => {
    await model.insert({ name: 'seed', tag: 'parallel-read' } as Doc);

    const reads = await Promise.all(
      Array.from({ length: 10 }, () =>
        model.findMany({ tag: 'parallel-read' } as Doc)
      )
    );

    for (const result of reads) {
      expect(result).toHaveLength(1);
      expect(result[0]?.name).toBe('seed');
    }
  });
});
