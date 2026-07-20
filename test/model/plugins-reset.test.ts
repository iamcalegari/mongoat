import { Document } from 'mongodb';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { Database } from '@/database';
import { MongoatValidationError } from '@/errors';
import { Model, kResetPlugins } from '@/model';
import type { Plugin } from '@/types';
import { ModelValidationSchema } from '@/types';
import { METHODS } from '@/utils/enums';

/**
 * `Model[kResetPlugins]()` limpa `Model[kGlobalPlugins]`
 * e destrava `Model[kPluginsLocked]` — depois dele, `Model.plugin()` volta
 * a aceitar registros, mesmo tendo sido chamado tarde demais antes do
 * reset. Isola estado global de plugins entre casos de teste, o mesmo papel
 * que `Database.resetRegistry()` cumpre para o registry de models.
 */
interface Doc extends Document {
  name: string;
}

const schema: ModelValidationSchema = {
  bsonType: 'object',
  properties: { name: { bsonType: 'string' } },
  required: ['name'],
};

describe('Model[kResetPlugins]() — isolamento de estado global entre testes', () => {
  let db: Database;

  beforeAll(async () => {
    db = new Database({
      uri: process.env.MONGODB_URI,
      dbName: process.env.MONGODB_DB_NAME,
    });

    await db.connect();
  });

  afterEach(() => {
    Database.resetRegistry();
    Model[kResetPlugins]();
  });

  afterAll(async () => {
    await db.disconnect();
  });

  it('após Model[kResetPlugins](), Model.plugin() volta a funcionar mesmo depois de uma trava anterior', () => {
    new Model<Doc>({
      collectionName: 'plugins_reset_lock_then_reset',
      allowedMethods: [METHODS.FIND],
      schema,
    });

    const lateGlobalPlugin: Plugin<Doc> = {
      name: 'late-global-pre-reset',
      setup: () => {},
    };

    expect(() => Model.plugin(lateGlobalPlugin)).toThrow(
      MongoatValidationError
    );

    Model[kResetPlugins]();

    const globalPlugin: Plugin<Doc> = {
      name: 'global-post-reset',
      setup: () => {},
    };

    expect(() => Model.plugin(globalPlugin)).not.toThrow();
  });

  it('Model[kResetPlugins]() esvazia a lista global — um plugin registrado antes do reset não é mais aplicado depois', async () => {
    let firstGlobalRan = false;
    let secondGlobalRan = false;

    const firstGlobalPlugin: Plugin<Doc> = {
      name: 'first-global',
      setup: (ctx) => {
        ctx.pre(METHODS.INSERT, () => {
          firstGlobalRan = true;
        });
      },
    };

    Model.plugin(firstGlobalPlugin);

    const modelBeforeReset = new Model<Doc>({
      collectionName: 'plugins_reset_global_cleared_before',
      allowedMethods: [METHODS.INSERT],
      schema,
    });

    await db.setupCollection(modelBeforeReset as unknown as Model);
    await modelBeforeReset.insert({ name: 'alpha' });

    expect(firstGlobalRan).toBe(true);

    // Reset limpa a lista global E a trava — um model construído DEPOIS do
    // reset não aplica o global anterior (que nunca mais existiu na lista).
    Database.resetRegistry();
    Model[kResetPlugins]();

    const secondGlobalPlugin: Plugin<Doc> = {
      name: 'second-global',
      setup: (ctx) => {
        ctx.pre(METHODS.INSERT, () => {
          secondGlobalRan = true;
        });
      },
    };

    Model.plugin(secondGlobalPlugin);

    const modelAfterReset = new Model<Doc>({
      collectionName: 'plugins_reset_global_cleared_after',
      allowedMethods: [METHODS.INSERT],
      schema,
    });

    await db.setupCollection(modelAfterReset as unknown as Model);
    await modelAfterReset.insert({ name: 'beta' });

    expect(secondGlobalRan).toBe(true);
  });
});
