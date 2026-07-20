import { Document } from 'mongodb';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { Database } from '@/database';
import { MongoatValidationError } from '@/errors';
import { Model } from '@/model';
import type { Plugin } from '@/types';
import { ModelValidationSchema } from '@/types';
import { METHODS } from '@/utils/enums';

/**
 * Static de plugin colidindo com um método nativo do
 * `Model` (público, escape hatch, ou privado de runtime) — ou com um
 * static já registrado por OUTRO plugin — lança `STATIC_COLLISION` na
 * construção. Sem mudança de código de produção: este arquivo só exercita,
 * via `new Model(...)`, apoiado na aplicação de plugins no construtor
 * (`registerPluginStatic`/`applyPlugins`).
 *
 * `applyPlugins` envolve QUALQUER erro síncrono lançado dentro
 * de `setup()` — inclusive o `STATIC_COLLISION` que `ctx.static()` lança
 * quando chamado DENTRO do próprio `setup()` — em `PLUGIN_SETUP_FAILED`,
 * preservando o erro original em `.cause`. Por isso, visto de
 * fora de `new Model(...)`, o `.code` observável é `PLUGIN_SETUP_FAILED`,
 * com `.cause` sendo o `MongoatValidationError`/`STATIC_COLLISION` real —
 * os testes abaixo verificam a colisão através de `.cause.code`, não do
 * `.code` do topo.
 */
interface Doc extends Document {
  name: string;
}

const schema: ModelValidationSchema = {
  bsonType: 'object',
  properties: { name: { bsonType: 'string' } },
  required: ['name'],
};

function expectStaticCollision(construct: () => unknown): void {
  expect(construct).toThrow(MongoatValidationError);

  let caught: unknown;

  try {
    construct();
  } catch (err) {
    caught = err;
  }

  expect(caught).toBeInstanceOf(MongoatValidationError);

  const topError = caught as MongoatValidationError;

  expect(topError.code).toBe('PLUGIN_SETUP_FAILED');
  expect(topError.cause).toBeInstanceOf(MongoatValidationError);
  expect((topError.cause as MongoatValidationError).code).toBe(
    'STATIC_COLLISION'
  );
}

describe('Model — colisão de statics de plugin contra nativo/privado e plugin↔plugin', () => {
  let counter = 0;

  beforeAll(() => {
    // Apenas para satisfazer Model.hasDatabase() — não é lida depois.
    new Database({
      uri: process.env.MONGODB_URI,
      dbName: process.env.MONGODB_DB_NAME,
    });
  });

  afterAll(() => {
    Database.resetRegistry();
  });

  function uniqueCollectionName(base: string): string {
    counter += 1;

    return `${base}_${counter}`;
  }

  it('plugin registrando static "find" (método público nativo) colide', () => {
    const plugin: Plugin<Doc> = {
      name: 'find-collider',
      setup: (ctx) => {
        ctx.static('find', () => {});
      },
    };

    expectStaticCollision(
      () =>
        new Model<Doc>({
          collectionName: uniqueCollectionName(
            'plugins_static_collision_find'
          ),
          allowedMethods: [METHODS.FIND],
          schema,
          plugins: [plugin],
        })
    );
  });

  it('plugin registrando static "getCollection" (escape hatch) colide', () => {
    const plugin: Plugin<Doc> = {
      name: 'get-collection-collider',
      setup: (ctx) => {
        ctx.static('getCollection', () => {});
      },
    };

    expectStaticCollision(
      () =>
        new Model<Doc>({
          collectionName: uniqueCollectionName(
            'plugins_static_collision_getcollection'
          ),
          allowedMethods: [METHODS.FIND],
          schema,
          plugins: [plugin],
        })
    );
  });

  it('plugin registrando static "rawInsert" (privado de runtime) colide', () => {
    const plugin: Plugin<Doc> = {
      name: 'raw-insert-collider',
      setup: (ctx) => {
        ctx.static('rawInsert', () => {});
      },
    };

    expectStaticCollision(
      () =>
        new Model<Doc>({
          collectionName: uniqueCollectionName(
            'plugins_static_collision_rawinsert'
          ),
          allowedMethods: [METHODS.FIND],
          schema,
          plugins: [plugin],
        })
    );
  });

  it('plugin registrando static "__proto__" colide (prototype pollution) — protótipo intacto', () => {
    const plugin: Plugin<Doc> = {
      name: 'proto-polluter',
      setup: (ctx) => {
        ctx.static('__proto__', () => 'pwned');
      },
    };

    expectStaticCollision(
      () =>
        new Model<Doc>({
          collectionName: uniqueCollectionName(
            'plugins_static_collision_proto'
          ),
          allowedMethods: [METHODS.FIND],
          schema,
          plugins: [plugin],
        })
    );
  });

  it('plugin registrando static "constructor" colide', () => {
    const plugin: Plugin<Doc> = {
      name: 'constructor-polluter',
      setup: (ctx) => {
        ctx.static('constructor', () => 'pwned');
      },
    };

    expectStaticCollision(
      () =>
        new Model<Doc>({
          collectionName: uniqueCollectionName(
            'plugins_static_collision_constructor'
          ),
          allowedMethods: [METHODS.FIND],
          schema,
          plugins: [plugin],
        })
    );
  });

  it('plugin registrando static "prototype" colide', () => {
    const plugin: Plugin<Doc> = {
      name: 'prototype-polluter',
      setup: (ctx) => {
        ctx.static('prototype', () => 'pwned');
      },
    };

    expectStaticCollision(
      () =>
        new Model<Doc>({
          collectionName: uniqueCollectionName(
            'plugins_static_collision_prototype'
          ),
          allowedMethods: [METHODS.FIND],
          schema,
          plugins: [plugin],
        })
    );
  });

  it('após a tentativa de "__proto__", um model normal preserva os métodos nativos (find/insert)', () => {
    const polluter: Plugin<Doc> = {
      name: 'proto-polluter-2',
      setup: (ctx) => {
        ctx.static('__proto__', () => 'pwned');
      },
    };

    expect(
      () =>
        new Model<Doc>({
          collectionName: uniqueCollectionName(
            'plugins_static_collision_proto_survivor'
          ),
          allowedMethods: [METHODS.FIND, METHODS.INSERT],
          schema,
          plugins: [polluter],
        })
    ).toThrow(MongoatValidationError);

    const clean = new Model<Doc>({
      collectionName: uniqueCollectionName(
        'plugins_static_collision_proto_clean'
      ),
      allowedMethods: [METHODS.FIND, METHODS.INSERT],
      schema,
    });

    expect(typeof (clean as unknown as { find: unknown }).find).toBe(
      'function'
    );
    expect(typeof (clean as unknown as { insert: unknown }).insert).toBe(
      'function'
    );
  });

  it('dois plugins locais registrando o MESMO nome de static colidem, citando o dono anterior', () => {
    const firstOwner: Plugin<Doc> = {
      name: 'plugin-a',
      setup: (ctx) => {
        ctx.static('paginate', () => 'a');
      },
    };
    const secondOwner: Plugin<Doc> = {
      name: 'plugin-b',
      setup: (ctx) => {
        ctx.static('paginate', () => 'b');
      },
    };

    let caught: unknown;

    try {
      new Model<Doc>({
        collectionName: uniqueCollectionName(
          'plugins_static_collision_plugin_plugin'
        ),
        allowedMethods: [METHODS.FIND],
        schema,
        plugins: [firstOwner, secondOwner],
      });
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(MongoatValidationError);

    const topError = caught as MongoatValidationError;

    expect(topError.code).toBe('PLUGIN_SETUP_FAILED');
    expect(topError.message).toContain('plugin-b');

    const causeError = topError.cause as MongoatValidationError;

    expect(causeError).toBeInstanceOf(MongoatValidationError);
    expect(causeError.code).toBe('STATIC_COLLISION');
    expect(causeError.message).toContain('plugin-a');
  });
});
