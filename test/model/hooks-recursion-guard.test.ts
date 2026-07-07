import { Document } from 'mongodb';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { Database } from '@/database';
import { Model } from '@/model';
import { ModelValidationSchema } from '@/types';
import { METHODS } from '@/utils/enums';

/**
 * HOOK-05 — guard de recursão via `AsyncLocalStorage` por instância de
 * Model (D-07): quando um hook chama um método do próprio model, a
 * chamada aninhada roda em modo raw — não re-dispara os hooks do método
 * aninhado nem estoura a pilha.
 */
interface Doc extends Document {
  name: string;
}

const schema: ModelValidationSchema = {
  bsonType: 'object',
  properties: { name: { bsonType: 'string' } },
  required: ['name'],
};

describe('Model — guard de recursão via AsyncLocalStorage (HOOK-05)', () => {
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

  it('pre hook de insert chamando model.total() não re-dispara os hooks de total() nem estoura a pilha', async () => {
    let totalHookCalls = 0;

    const model = new Model<Doc>({
      collectionName: 'hooks_recursion_guard_total',
      allowedMethods: [METHODS.INSERT, METHODS.TOTAL],
      schema,
    });

    await db.setupCollection(model as unknown as Model);

    model.pre(METHODS.TOTAL, () => {
      totalHookCalls += 1;
    });

    model.pre(METHODS.INSERT, async (ctx) => {
      // Chama um método do próprio model dentro do hook — deve rodar em
      // modo raw (sem re-disparar o pre hook de TOTAL registrado acima).
      await ctx.model.total();
    });

    await expect(model.insert({ name: 'alpha' })).resolves.toMatchObject({
      name: 'alpha',
    });

    expect(totalHookCalls).toBe(0);
  });

  it('chamada aninhada a método sem hooks registrados também roda em modo raw sem travar', async () => {
    const model = new Model<Doc>({
      collectionName: 'hooks_recursion_guard_no_stack_overflow',
      allowedMethods: [METHODS.INSERT, METHODS.FIND],
      schema,
    });

    await db.setupCollection(model as unknown as Model);

    model.pre(METHODS.INSERT, async (ctx) => {
      await ctx.model.find({ name: 'nao-existe' });
    });

    await expect(model.insert({ name: 'beta' })).resolves.toMatchObject({
      name: 'beta',
    });
  });
});
