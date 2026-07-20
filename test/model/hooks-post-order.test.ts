import { Document } from 'mongodb';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { Database } from '@/database';
import { Model } from '@/model';
import { ModelValidationSchema } from '@/types';
import { METHODS } from '@/utils/enums';

/**
 * Múltiplos post hooks no mesmo método, em ordem de registro,
 * recebendo `ctx.result`. Por padrão observam (retorno `undefined` não
 * altera o resultado entregue ao caller); um post hook que RETORNA um
 * valor transforma o resultado final (opt-in via retorno).
 */
interface Doc extends Document {
  name: string;
}

const schema: ModelValidationSchema = {
  bsonType: 'object',
  properties: { name: { bsonType: 'string' } },
  required: ['name'],
};

describe('Model — post hooks múltiplos, ctx.result, transform via retorno', () => {
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

  it('dois post hooks rodam em ordem de registro, ambos recebem ctx.result', async () => {
    const executionOrder: string[] = [];
    const seenResults: Array<string | undefined> = [];

    const model = new Model<Doc>({
      collectionName: 'hooks_post_order_dois_hooks',
      allowedMethods: [METHODS.INSERT],
      schema,
    });

    await db.setupCollection(model as unknown as Model);

    model
      .post(METHODS.INSERT, (ctx) => {
        executionOrder.push('first');
        seenResults.push(ctx.result?.name);
      })
      .post(METHODS.INSERT, (ctx) => {
        executionOrder.push('second');
        seenResults.push(ctx.result?.name);
      });

    await model.insert({ name: 'alpha' });

    expect(executionOrder).toEqual(['first', 'second']);
    expect(seenResults).toEqual(['alpha', 'alpha']);
  });

  it('post hook que RETORNA um valor transforma o resultado entregue ao caller', async () => {
    const model = new Model<Doc>({
      collectionName: 'hooks_post_order_transform',
      allowedMethods: [METHODS.INSERT],
      schema,
    });

    await db.setupCollection(model as unknown as Model);

    model.post(METHODS.INSERT, (ctx) => {
      return { transformed: true, originalName: ctx.result?.name };
    });

    const result = await model.insert({ name: 'beta' });

    expect(result).toEqual({ transformed: true, originalName: 'beta' });
  });

  it('post hook que NÃO retorna nada apenas observa — resultado permanece o cru do driver', async () => {
    const model = new Model<Doc>({
      collectionName: 'hooks_post_order_observe',
      allowedMethods: [METHODS.INSERT],
      schema,
    });

    await db.setupCollection(model as unknown as Model);

    let observed = false;

    model.post(METHODS.INSERT, () => {
      observed = true;
      // Sem `return` — apenas observa.
    });

    const result = await model.insert({ name: 'gamma' });

    expect(observed).toBe(true);
    expect(result.name).toBe('gamma');
  });
});
