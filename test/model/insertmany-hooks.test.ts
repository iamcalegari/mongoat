import { Document } from 'mongodb';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { Database } from '@/database';
import { Model } from '@/model';
import { ModelValidationSchema } from '@/types';
import { METHODS } from '@/utils/enums';

/**
 * Regressão do bug de hooks não aguardados no `insertMany` (QUAL-01 — Plan
 * 05, Task 1).
 *
 * Bug original: `documents.forEach(async (doc) => { await
 * this.preMethod[...] })` não aguarda o callback assíncrono (`forEach`
 * ignora o retorno da função) — se o pre-hook fizer algo assíncrono (ex.:
 * uma consulta de rede), o insert prossegue sem esperar a mutação do doc
 * terminar. Fix: `Promise.all` sobre `documents.map(...)`, aguardado antes
 * de aplicar `documentDefaults` e inserir.
 */
interface Doc extends Document {
  name: string;
  processedAt?: string;
}

const schema: ModelValidationSchema = {
  bsonType: 'object',
  properties: {
    name: { bsonType: 'string' },
    processedAt: { bsonType: 'string' },
  },
  required: ['name'],
};

describe('Model — insertMany aguarda pre-hooks assíncronos (QUAL-01)', () => {
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

  it('aguarda pre-hook assíncrono antes de persistir — todos os documentos refletem a mutação', async () => {
    const model = new Model<Doc>({
      collectionName: 'insertmany_hooks_async',
      allowedMethods: [METHODS.INSERT_MANY, METHODS.FIND_MANY],
      schema,
    });

    await db.setupCollection(model as unknown as Model);

    model.pre(METHODS.INSERT_MANY, async function (this: Doc) {
      // Simula um pre-hook assíncrono real (ex.: uma consulta externa) — se
      // o insertMany não aguardar corretamente, o insert corre antes desta
      // linha rodar e o campo não é persistido.
      await new Promise((resolve) => setTimeout(resolve, 20));
      this.processedAt = 'hook-applied';
    });

    await model.insertMany([{ name: 'a' }, { name: 'b' }, { name: 'c' }]);

    const persisted = await model.findMany({});

    expect(persisted).toHaveLength(3);
    expect(persisted.every((doc) => doc.processedAt === 'hook-applied')).toBe(
      true
    );
  });
});
