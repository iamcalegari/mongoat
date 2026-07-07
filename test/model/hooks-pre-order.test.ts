import { Document } from 'mongodb';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { Database } from '@/database';
import { Model } from '@/model';
import { ModelValidationSchema } from '@/types';
import { METHODS } from '@/utils/enums';

/**
 * HOOK-01 — múltiplos pre hooks no mesmo método, registrados tanto via
 * `hooks` declarativo do construtor quanto via `.pre()` encadeável,
 * executam TODOS em ordem de registro (construtor primeiro, depois
 * encadeáveis — D-02), aguardados sequencialmente — inclusive em
 * `insertMany` (paralelo ENTRE documentos, sequencial DENTRO de cada
 * documento).
 */
interface Doc extends Document {
  name: string;
  processedBy?: string;
}

const schema: ModelValidationSchema = {
  bsonType: 'object',
  properties: {
    name: { bsonType: 'string' },
    processedBy: { bsonType: 'string' },
  },
  required: ['name'],
};

describe('Model — pre hooks múltiplos, ordem de registro, sequenciais (HOOK-01)', () => {
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

  it('pre hook do construtor roda ANTES do pre hook encadeável, ambos executam', async () => {
    const executionOrder: string[] = [];

    const model = new Model<Doc>({
      collectionName: 'hooks_pre_order_construtor_encadeavel',
      allowedMethods: [METHODS.INSERT],
      schema,
      hooks: {
        [METHODS.INSERT]: {
          pre: [
            () => {
              executionOrder.push('construtor');
            },
          ],
        },
      },
    });

    await db.setupCollection(model as unknown as Model);

    model.pre(METHODS.INSERT, () => {
      executionOrder.push('encadeavel');
    });

    await model.insert({ name: 'alpha' });

    expect(executionOrder).toEqual(['construtor', 'encadeavel']);
  });

  it('dois pre hooks assíncronos rodam sequencialmente — o segundo lê a mutação do primeiro em ctx.document', async () => {
    const model = new Model<Doc>({
      collectionName: 'hooks_pre_order_sequencial_async',
      allowedMethods: [METHODS.INSERT, METHODS.FIND],
      schema,
    });

    await db.setupCollection(model as unknown as Model);

    model
      .pre(METHODS.INSERT, async (ctx) => {
        await new Promise((resolve) => setTimeout(resolve, 20));
        ctx.document.processedBy = 'first';
      })
      .pre(METHODS.INSERT, (ctx) => {
        // Prova de sequencialidade: se os hooks rodassem em paralelo, este
        // hook rodaria com processedBy ainda undefined.
        ctx.document.processedBy = `${ctx.document.processedBy}-second`;
      });

    const inserted = await model.insert({ name: 'beta' });

    expect(inserted.processedBy).toBe('first-second');

    const found = await model.find({ name: 'beta' });
    expect(found?.processedBy).toBe('first-second');
  });

  it('insertMany: múltiplos pre hooks rodam sequencialmente por documento, mutação de cada doc é independente', async () => {
    const model = new Model<Doc>({
      collectionName: 'hooks_pre_order_insertmany',
      allowedMethods: [METHODS.INSERT_MANY, METHODS.FIND_MANY],
      schema,
    });

    await db.setupCollection(model as unknown as Model);

    model
      .pre(METHODS.INSERT_MANY, async (ctx) => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        ctx.document!.processedBy = `first-${ctx.document!.name}`;
      })
      .pre(METHODS.INSERT_MANY, (ctx) => {
        ctx.document!.processedBy = `${ctx.document!.processedBy}-second`;
      });

    await model.insertMany([
      { name: 'doc-a' },
      { name: 'doc-b' },
      { name: 'doc-c' },
    ]);

    const persisted = await model.findMany({});

    expect(persisted).toHaveLength(3);
    persisted.forEach((doc) => {
      // Cada documento reflete AMBOS os hooks, e a mutação é independente
      // (carrega o próprio `name`, não o de um documento vizinho).
      expect(doc.processedBy).toBe(`first-${doc.name}-second`);
    });
  });
});
