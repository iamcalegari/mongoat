import { Document } from 'mongodb';
import { beforeEach, describe, expect, it } from 'vitest';

import { Database } from '@/database';
import { MongoatValidationError } from '@/errors';
import { Model } from '@/model';
import type { Plugin } from '@/types';
import { ModelValidationSchema } from '@/types';
import { METHODS } from '@/utils/enums';

/**
 * Re-registrar o mesmo `collectionName` com um array de plugins libera o
 * caminho feliz (devolve a instância existente) apenas quando as
 * referências e a ordem são EXATAMENTE as mesmas da primeira construção —
 * qualquer troca, reordenação ou acréscimo continua lançando
 * `MODEL_CONFIG_CONFLICT`. `applyPlugins` nunca roda no caminho de reuso,
 * então nenhum efeito de plugin (hook, static) é duplicado.
 *
 * Usa `Database.resetRegistry()` para isolar cada caso.
 */
interface Doc extends Document {
  name: string;
}

const schema: ModelValidationSchema = {
  bsonType: 'object',
  properties: { name: { bsonType: 'string' } },
  required: ['name'],
};

describe('Model — re-registro com plugins', () => {
  beforeEach(() => {
    Database.resetRegistry();

    if (!Model.hasDatabase()) {
      new Database({
        uri: process.env.MONGODB_URI,
        dbName: process.env.MONGODB_DB_NAME,
      });
    }
  });

  it('re-registrar com o MESMO array de plugins (mesmas referências, mesma ordem) devolve a instância existente sem duplicar efeitos', () => {
    let setupCalls = 0;

    const trackingPlugin: Plugin<Doc> = {
      name: 'tracking-plugin',
      setup: (ctx) => {
        setupCalls += 1;
        ctx.pre(METHODS.INSERT, () => {});
      },
    };

    const first = new Model<Doc>({
      collectionName: 'plugins_reregistration_same_list',
      allowedMethods: [METHODS.INSERT],
      schema,
      plugins: [trackingPlugin],
    });

    const second = new Model<Doc>({
      collectionName: 'plugins_reregistration_same_list',
      allowedMethods: [METHODS.INSERT],
      schema,
      plugins: [trackingPlugin],
    });

    expect(second).toBe(first);
    // `setup()` rodou uma única vez — a segunda construção não re-aplicou
    // o plugin.
    expect(setupCalls).toBe(1);
    // O hook registrado por `setup()` não foi duplicado na instância
    // devolvida.
    expect(first.hooks[METHODS.INSERT].pre).toHaveLength(1);
  });

  it('re-registrar com uma referência de plugin DIFERENTE lança MODEL_CONFIG_CONFLICT', () => {
    const pluginA: Plugin<Doc> = {
      name: 'plugin-different-ref-a',
      setup: () => {},
    };
    const pluginB: Plugin<Doc> = {
      name: 'plugin-different-ref-b',
      setup: () => {},
    };

    new Model<Doc>({
      collectionName: 'plugins_reregistration_different_ref',
      allowedMethods: [METHODS.FIND],
      schema,
      plugins: [pluginA],
    });

    let caughtError: unknown;

    try {
      new Model<Doc>({
        collectionName: 'plugins_reregistration_different_ref',
        allowedMethods: [METHODS.FIND],
        schema,
        plugins: [pluginB],
      });
    } catch (err) {
      caughtError = err;
    }

    expect(caughtError).toBeInstanceOf(MongoatValidationError);
    expect((caughtError as MongoatValidationError).code).toBe(
      'MODEL_CONFIG_CONFLICT'
    );
  });

  it('re-registrar com as mesmas referências de plugin em ORDEM trocada lança MODEL_CONFIG_CONFLICT', () => {
    const pluginA: Plugin<Doc> = { name: 'plugin-order-a', setup: () => {} };
    const pluginB: Plugin<Doc> = { name: 'plugin-order-b', setup: () => {} };

    new Model<Doc>({
      collectionName: 'plugins_reregistration_reordered',
      allowedMethods: [METHODS.FIND],
      schema,
      plugins: [pluginA, pluginB],
    });

    let caughtError: unknown;

    try {
      new Model<Doc>({
        collectionName: 'plugins_reregistration_reordered',
        allowedMethods: [METHODS.FIND],
        schema,
        plugins: [pluginB, pluginA],
      });
    } catch (err) {
      caughtError = err;
    }

    expect(caughtError).toBeInstanceOf(MongoatValidationError);
    expect((caughtError as MongoatValidationError).code).toBe(
      'MODEL_CONFIG_CONFLICT'
    );
  });

  it('re-registrar com um plugin A MAIS no candidato lança MODEL_CONFIG_CONFLICT', () => {
    const pluginA: Plugin<Doc> = { name: 'plugin-extra-a', setup: () => {} };
    const pluginB: Plugin<Doc> = { name: 'plugin-extra-b', setup: () => {} };

    new Model<Doc>({
      collectionName: 'plugins_reregistration_extra',
      allowedMethods: [METHODS.FIND],
      schema,
      plugins: [pluginA],
    });

    let caughtError: unknown;

    try {
      new Model<Doc>({
        collectionName: 'plugins_reregistration_extra',
        allowedMethods: [METHODS.FIND],
        schema,
        plugins: [pluginA, pluginB],
      });
    } catch (err) {
      caughtError = err;
    }

    expect(caughtError).toBeInstanceOf(MongoatValidationError);
    expect((caughtError as MongoatValidationError).code).toBe(
      'MODEL_CONFIG_CONFLICT'
    );
  });

  it('re-registrar SEM plugins e config idêntica continua reusando a instância existente mesmo quando a primeira construção declarou plugins', () => {
    const pluginA: Plugin<Doc> = {
      name: 'plugin-thin-candidate',
      setup: () => {},
    };

    const first = new Model<Doc>({
      collectionName: 'plugins_reregistration_thin_candidate',
      allowedMethods: [METHODS.FIND],
      schema,
      plugins: [pluginA],
    });

    const second = new Model<Doc>({
      collectionName: 'plugins_reregistration_thin_candidate',
      allowedMethods: [METHODS.FIND],
      schema,
    });

    expect(second).toBe(first);
  });
});
