import { Document } from 'mongodb';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { Database } from '@/database';
import { MongoatError } from '@/errors';
import { Model } from '@/model';
import { ModelValidationSchema } from '@/types';
import { METHODS } from '@/utils/enums';

/**
 * HOOK-04/D-06 — post-hook `fireAndForget` (opt-in explícito no registro) é
 * um dispatch VERDADEIRAMENTE não-aguardado (Open Question 1 resolvida
 * A2/RESEARCH.md): a operação retorna sem esperar o hook, e se a Promise do
 * hook rejeitar, o erro é roteado para `onHookError(err, ctx)` — com
 * fallback `console.error` quando nenhum callback é configurado. Nunca
 * engolido em silêncio total (Pitfall 3).
 *
 * O dispatch não-aguardado exige espera determinística (`vi.waitFor`) em vez
 * de assumir que o efeito colateral já rodou no momento em que
 * `model.insert(...)` resolve.
 */
interface Doc extends Document {
  name: string;
}

const schema: ModelValidationSchema = {
  bsonType: 'object',
  properties: { name: { bsonType: 'string' } },
  required: ['name'],
};

describe('Model — post-hook fireAndForget não propaga, roteia para onHookError/console.error (HOOK-04)', () => {
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

  it('post-hook fireAndForget que lança NÃO propaga — insert resolve normalmente e onHookError recebe (err, ctx)', async () => {
    const seen: Array<{ err: unknown; ctx: unknown }> = [];

    const model = new Model<Doc>({
      collectionName: 'hooks_fire_and_forget_not_propagate',
      allowedMethods: [METHODS.INSERT],
      schema,
      onHookError: (err, ctx) => {
        seen.push({ err, ctx });
      },
    });

    await db.setupCollection(model as unknown as Model);

    model.post(
      METHODS.INSERT,
      () => {
        throw new MongoatError('fire and forget falhou');
      },
      { fireAndForget: true }
    );

    const result = await model.insert({ name: 'nao-propaga' });

    expect(result.name).toBe('nao-propaga');

    await vi.waitFor(() => {
      expect(seen).toHaveLength(1);
    });

    expect(seen[0]?.err).toBeInstanceOf(MongoatError);
    expect((seen[0]?.err as MongoatError).message).toBe(
      'fire and forget falhou'
    );
    expect((seen[0]?.ctx as { method: METHODS }).method).toBe(METHODS.INSERT);
  });

  it('post-hook fireAndForget sem onHookError configurado cai no fallback console.error — nunca silêncio total', async () => {
    const consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);

    const model = new Model<Doc>({
      collectionName: 'hooks_fire_and_forget_console_fallback',
      allowedMethods: [METHODS.INSERT],
      schema,
    });

    await db.setupCollection(model as unknown as Model);

    model.post(
      METHODS.INSERT,
      () => {
        throw new MongoatError('sem callback configurado');
      },
      { fireAndForget: true }
    );

    const result = await model.insert({ name: 'fallback' });

    expect(result.name).toBe('fallback');

    await vi.waitFor(() => {
      expect(consoleErrorSpy).toHaveBeenCalled();
    });

    const [loggedErr] = consoleErrorSpy.mock.calls[0] ?? [];
    expect(loggedErr).toBeInstanceOf(MongoatError);
    expect((loggedErr as MongoatError).message).toBe(
      'sem callback configurado'
    );

    consoleErrorSpy.mockRestore();
  });

  it('post-hook fireAndForget NÃO bloqueia o retorno — insert resolve antes do hook lento completar', async () => {
    const events: string[] = [];

    const model = new Model<Doc>({
      collectionName: 'hooks_fire_and_forget_non_blocking',
      allowedMethods: [METHODS.INSERT],
      schema,
      onHookError: () => {
        // Este hook não lança — apenas mede o tempo de conclusão.
      },
    });

    await db.setupCollection(model as unknown as Model);

    model.post(
      METHODS.INSERT,
      async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
        events.push('hook-completed');
      },
      { fireAndForget: true }
    );

    await model.insert({ name: 'nao-bloqueia' });
    events.push('insert-returned');

    // Espera determinística até o hook lento (fireAndForget) terminar —
    // maior que o delay de 50ms do hook.
    await vi.waitFor(
      () => {
        expect(events).toContain('hook-completed');
      },
      { timeout: 500 }
    );

    expect(events).toEqual(['insert-returned', 'hook-completed']);
  });
});
