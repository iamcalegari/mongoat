import { Document } from 'mongodb';
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import { Database } from '@/database';
import { MongoatError } from '@/errors';
import { Model } from '@/model';
import { ModelValidationSchema } from '@/types';
import { METHODS } from '@/utils/enums';

/**
 * Regressão de robustez complementar a
 * `hooks-fire-and-forget.test.ts`: aquele arquivo prova que um post-hook
 * `fireAndForget` que lança não propaga (é roteado a `onHookError`). Este
 * arquivo prova a camada seguinte — o PRÓPRIO `onHookError` fornecido pelo
 * dev pode lançar (síncrono) ou rejeitar (assíncrono), e mesmo assim NÃO
 * deve gerar `unhandledRejection` no processo. Sem o guard interno em
 * `dispatchOnHookError` (src/model/hooks.ts), o `.catch` que despacha para
 * `onHookError` propagaria a falha do próprio handler como uma rejeição
 * nova, sem ninguém para capturá-la.
 */
interface Doc extends Document {
  name: string;
}

const schema: ModelValidationSchema = {
  bsonType: 'object',
  properties: { name: { bsonType: 'string' } },
  required: ['name'],
};

describe('Model — onHookError que lança/rejeita não gera unhandledRejection', () => {
  let db: Database;
  const unhandled: unknown[] = [];

  const onUnhandledRejection = (reason: unknown) => {
    unhandled.push(reason);
  };

  beforeAll(async () => {
    db = new Database({
      uri: process.env.MONGODB_URI,
      dbName: process.env.MONGODB_DB_NAME,
    });

    await db.connect();
    process.on('unhandledRejection', onUnhandledRejection);
  });

  afterEach(() => {
    unhandled.length = 0;
  });

  afterAll(async () => {
    process.off('unhandledRejection', onUnhandledRejection);
    Database.resetRegistry();
    await db.disconnect();
  });

  it('onHookError SÍNCRONO que lança não gera unhandledRejection — insert resolve normalmente', async () => {
    const onHookErrorCalls: unknown[] = [];

    const model = new Model<Doc>({
      collectionName: 'hooks_onhookerror_throws_sync',
      allowedMethods: [METHODS.INSERT],
      schema,
      onHookError: (err) => {
        onHookErrorCalls.push(err);
        throw new MongoatError('onHookError síncrono também falhou');
      },
    });

    await db.setupCollection(model as unknown as Model);

    model.post(
      METHODS.INSERT,
      () => {
        throw new MongoatError('post-hook fireAndForget falhou');
      },
      { fireAndForget: true }
    );

    const result = await model.insert({ name: 'sync-onhookerror-throws' });
    expect(result.name).toBe('sync-onhookerror-throws');

    await vi.waitFor(() => {
      expect(onHookErrorCalls).toHaveLength(1);
    });

    // Flush de microtasks/timers para dar chance a um unhandledRejection
    // de ser emitido, caso o guard não estivesse contendo a falha.
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(unhandled).toHaveLength(0);
  });

  it('onHookError ASSÍNCRONO que rejeita não gera unhandledRejection — insert resolve normalmente', async () => {
    const onHookErrorCalls: unknown[] = [];

    const model = new Model<Doc>({
      collectionName: 'hooks_onhookerror_throws_async',
      allowedMethods: [METHODS.INSERT],
      schema,
      onHookError: (err) => {
        onHookErrorCalls.push(err);
        return Promise.reject(
          new MongoatError('onHookError assíncrono também rejeitou')
        );
      },
    });

    await db.setupCollection(model as unknown as Model);

    model.post(
      METHODS.INSERT,
      () => {
        throw new MongoatError('post-hook fireAndForget falhou (async)');
      },
      { fireAndForget: true }
    );

    const result = await model.insert({ name: 'async-onhookerror-rejects' });
    expect(result.name).toBe('async-onhookerror-rejects');

    await vi.waitFor(() => {
      expect(onHookErrorCalls).toHaveLength(1);
    });

    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(unhandled).toHaveLength(0);
  });

  it('caminho normal (post-hook NÃO-fireAndForget) continua propagando o erro ao caller', async () => {
    const model = new Model<Doc>({
      collectionName: 'hooks_onhookerror_throws_normal_path_still_propagates',
      allowedMethods: [METHODS.INSERT],
      schema,
    });

    await db.setupCollection(model as unknown as Model);

    model.post(METHODS.INSERT, () => {
      throw new MongoatError('post-hook normal deve propagar');
    });

    await expect(
      model.insert({ name: 'normal-path-propagates' })
    ).rejects.toThrow('post-hook normal deve propagar');
  });
});
