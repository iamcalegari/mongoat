import { Document } from 'mongodb';
import { beforeEach, describe, expect, it } from 'vitest';

import { Database } from '@/database';
import { MongoatValidationError } from '@/errors';
import { Model, kResetPlugins } from '@/model';
import type { Plugin } from '@/types';
import { ModelValidationSchema } from '@/types';
import { METHODS } from '@/utils/enums';

/**
 * `Model.plugin()` chamado DEPOIS que o primeiro
 * model já foi construído lança `PLUGIN_REGISTERED_TOO_LATE` — a trava
 * (`kPluginsLocked`, setada pelo construtor) fixa a ordem de
 * aplicação de globais assim que qualquer model real existe. Cobre também
 * o caso-limite: um `new Model(mesmaConfig)` repetido, que cai no
 * early-return de reuso de config idêntica, JÁ trava o registro global.
 */
interface Doc extends Document {
  name: string;
}

const schema: ModelValidationSchema = {
  bsonType: 'object',
  properties: { name: { bsonType: 'string' } },
  required: ['name'],
};

describe('Model.plugin() — enforcement de ordem fail-loud', () => {
  beforeEach(() => {
    Database.resetRegistry();
    Model[kResetPlugins]();

    if (!Model.hasDatabase()) {
      new Database({
        uri: process.env.MONGODB_URI,
        dbName: process.env.MONGODB_DB_NAME,
      });
    }
  });

  it('Model.plugin() chamado ANTES de qualquer new Model(...) registra o global sem lançar', () => {
    const globalPlugin: Plugin<Doc> = {
      name: 'global-marker',
      setup: () => {},
    };

    expect(() => Model.plugin(globalPlugin)).not.toThrow();
  });

  it('Model.plugin() chamado DEPOIS da 1ª construção bem-sucedida lança PLUGIN_REGISTERED_TOO_LATE', () => {
    new Model<Doc>({
      collectionName: 'plugins_global_lock_after_construct',
      allowedMethods: [METHODS.FIND],
      schema,
    });

    const lateGlobalPlugin: Plugin<Doc> = {
      name: 'late-global',
      setup: () => {},
    };

    let caughtError: unknown;

    try {
      Model.plugin(lateGlobalPlugin);
    } catch (err) {
      caughtError = err;
    }

    expect(caughtError).toBeInstanceOf(MongoatValidationError);
    expect((caughtError as MongoatValidationError).code).toBe(
      'PLUGIN_REGISTERED_TOO_LATE'
    );
  });

  // O early-return de reuso de config idêntica (`isSameConfig`)
  // TAMBÉM seta a trava — um segundo `new Model(mesmaConfig)` que reusa a
  // instância já registrada é, ainda assim, uma construção "bem-sucedida"
  // que fixa a ordem de globais.
  it('Model.plugin() chamado após reuso de config idêntica (early-return) TAMBÉM lança PLUGIN_REGISTERED_TOO_LATE', () => {
    const props = {
      collectionName: 'plugins_global_lock_reuse_config',
      allowedMethods: [METHODS.FIND],
      schema,
    };

    const first = new Model<Doc>(props);
    const second = new Model<Doc>(props);

    expect(second).toBe(first);

    const lateGlobalPlugin: Plugin<Doc> = {
      name: 'late-global-after-reuse',
      setup: () => {},
    };

    let caughtError: unknown;

    try {
      Model.plugin(lateGlobalPlugin);
    } catch (err) {
      caughtError = err;
    }

    expect(caughtError).toBeInstanceOf(MongoatValidationError);
    expect((caughtError as MongoatValidationError).code).toBe(
      'PLUGIN_REGISTERED_TOO_LATE'
    );
  });
});
