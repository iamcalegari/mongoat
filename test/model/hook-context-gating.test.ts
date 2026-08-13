import { Document } from 'mongodb';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { Database } from '@/database';
import { MongoatError } from '@/errors';
import { Model } from '@/model';
import { ModelValidationSchema } from '@/types';
import { METHODS } from '@/utils/enums';

/**
 * `ctx.model` (montado por `buildContext`, `@/model/hooks`) entrega o Proxy
 * registrado, não a instância crua — um método chamado através dele de
 * dentro de um hook está sujeito ao mesmo gating de `allowedMethods` que uma
 * chamada externa.
 */
interface Doc extends Document {
  name: string;
}

const schema: ModelValidationSchema = {
  bsonType: 'object',
  properties: { name: { bsonType: 'string' } },
  required: ['name'],
};

describe('Model — gating de allowedMethods em ctx.model dentro de um hook', () => {
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

  it('pre hook chamando ctx.model.total() fora de allowedMethods recebe METHOD_NOT_ALLOWED', async () => {
    const model = new Model<Doc>({
      collectionName: 'hook_context_gating_not_allowed',
      allowedMethods: [METHODS.INSERT],
      schema,
    });

    await db.setupCollection(model as unknown as Model);

    model.pre(METHODS.INSERT, async (ctx) => {
      await ctx.model.total();
    });

    await expect(model.insert({ name: 'alpha' })).rejects.toMatchObject({
      code: 'METHOD_NOT_ALLOWED',
    });
  });

  it('pre hook chamando ctx.model.total() dentro de allowedMethods continua funcionando em modo raw', async () => {
    let totalHookCalls = 0;

    const model = new Model<Doc>({
      collectionName: 'hook_context_gating_allowed',
      allowedMethods: [METHODS.INSERT, METHODS.TOTAL],
      schema,
    });

    await db.setupCollection(model as unknown as Model);

    model.pre(METHODS.TOTAL, () => {
      totalHookCalls += 1;
    });

    model.pre(METHODS.INSERT, async (ctx) => {
      await ctx.model.total();
    });

    await expect(model.insert({ name: 'beta' })).resolves.toMatchObject({
      name: 'beta',
    });

    // Modo raw: a chamada aninhada não re-dispara o pipeline de hooks de
    // TOTAL — o mesmo guard de recursão via AsyncLocalStorage continua
    // coexistindo com o gating do Proxy.
    expect(totalHookCalls).toBe(0);
  });

  it('ctx.model não é a instância crua — chamar um método não permitido através dele ou diretamente no model produz o mesmo erro tipado', async () => {
    let capturedCtxModel: unknown;

    const model = new Model<Doc>({
      collectionName: 'hook_context_gating_same_error',
      allowedMethods: [METHODS.INSERT],
      schema,
    });

    await db.setupCollection(model as unknown as Model);

    model.pre(METHODS.INSERT, (ctx) => {
      capturedCtxModel = ctx.model;
    });

    await model.insert({ name: 'gamma' });

    // A checagem de `allowedMethods` no trap do Proxy lança na própria
    // LEITURA da propriedade (antes da chamada) — um `.catch()` encadeado
    // na expressão nunca chegaria a ser anexado, então cada via usa
    // try/catch em vez de encadeamento de Promise.
    let errorFromCtxModel: unknown;

    try {
      await (capturedCtxModel as { total: () => Promise<number> }).total();
    } catch (err) {
      errorFromCtxModel = err;
    }

    let errorFromDirectModel: unknown;

    try {
      await model.total();
    } catch (err) {
      errorFromDirectModel = err;
    }

    expect(errorFromCtxModel).toBeInstanceOf(MongoatError);
    expect(errorFromDirectModel).toBeInstanceOf(MongoatError);
    expect((errorFromCtxModel as MongoatError).code).toBe(
      'METHOD_NOT_ALLOWED'
    );
    expect((errorFromDirectModel as MongoatError).code).toBe(
      'METHOD_NOT_ALLOWED'
    );
  });
});
