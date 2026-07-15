import { Document } from 'mongodb';
import { describe, expect, it, vi } from 'vitest';

import { MongoatValidationError } from '@/errors';
import {
  applyPlugins,
  buildPluginContext,
  normalizePlugin,
  registerPluginStatic,
  resolvePluginList,
  type PluginTarget,
} from '@/model/plugins';
import type { Plugin, PluginContext } from '@/types/plugin';
import { METHODS } from '@/utils/enums';

/**
 * Cobertura unitária pura (sem `Database`/`Model`/testcontainers) do módulo
 * `src/model/plugins.ts` — normalização (D-01), dedup por referência +
 * colisão de nome (D-07), guarda de colisão de statics contra o conjunto
 * COMPLETO de nomes reservados (D-08), selo read-only via `structuredClone`
 * (D-03) e o orquestrador `applyPlugins` com fail-loud `PLUGIN_SETUP_FAILED`
 * (D-04/D-10).
 */

/**
 * Constrói um `PluginTarget` falso em memória — o mesmo shape estrutural
 * que o construtor do `Model` (Plano 02) vai passar como `this`, sem
 * depender da classe `Model` de verdade (nem de `Database`).
 */
function createFakeTarget(): PluginTarget {
  return {
    collectionName: 'fake_collection',
    allowedMethods: [METHODS.INSERT, METHODS.FIND],
    validator: {
      $jsonSchema: {
        bsonType: 'object',
        properties: {
          name: { bsonType: 'string' },
        },
        required: ['name'],
      },
    },
    hooks: Object.fromEntries(
      Object.values(METHODS).map((method) => [method, { pre: [], post: [] }])
    ) as PluginTarget['hooks'],
  };
}

describe('normalizePlugin (D-01)', () => {
  it('normaliza uma função nomeada para { name, setup }', () => {
    function myPlugin() {
      // no-op
    }

    const normalized = normalizePlugin(myPlugin as Plugin);

    expect(normalized).toEqual({ name: 'myPlugin', setup: myPlugin });
  });

  it('normaliza uma função anônima com name "<anonymous>"', () => {
    const anonymous = (() => () => {})();

    const normalized = normalizePlugin(anonymous as Plugin);

    expect(normalized.name).toBe('<anonymous>');
    expect(normalized.setup).toBe(anonymous);
  });

  it('devolve o próprio objeto quando o plugin já é { name, setup }', () => {
    const pluginObject = { name: 'timestamps', setup: () => {} };

    expect(normalizePlugin(pluginObject as Plugin)).toBe(pluginObject);
  });
});

describe('resolvePluginList (D-07)', () => {
  it('mesma referência repetida (global + local) é resolvida 1x', () => {
    const shared = vi.fn();

    const resolved = resolvePluginList([shared as Plugin], [shared as Plugin]);

    expect(resolved).toHaveLength(1);
    expect(resolved[0].original).toBe(shared);
  });

  it('mesma referência repetida 2x no mesmo array é resolvida 1x', () => {
    const shared = vi.fn();

    const resolved = resolvePluginList([], [shared as Plugin, shared as Plugin]);

    expect(resolved).toHaveLength(1);
  });

  it('concatena global-primeiro (ordem preservada)', () => {
    const globalPlugin = function globalOne() {};
    const localPlugin = function localOne() {};

    const resolved = resolvePluginList(
      [globalPlugin as Plugin],
      [localPlugin as Plugin]
    );

    expect(resolved.map((entry) => entry.original)).toEqual([
      globalPlugin,
      localPlugin,
    ]);
  });

  it('dois plugins com o MESMO name mas referências DIFERENTES lançam DUPLICATE_PLUGIN_NAME', () => {
    function timestamps() {}
    function timestampsCopy() {}
    Object.defineProperty(timestampsCopy, 'name', { value: 'timestamps' });

    expect(() =>
      resolvePluginList([], [timestamps as Plugin, timestampsCopy as Plugin])
    ).toThrow(MongoatValidationError);

    try {
      resolvePluginList([], [timestamps as Plugin, timestampsCopy as Plugin]);
    } catch (err) {
      expect(err).toBeInstanceOf(MongoatValidationError);
      expect((err as MongoatValidationError).code).toBe(
        'DUPLICATE_PLUGIN_NAME'
      );
    }
  });
});

describe('registerPluginStatic (D-08)', () => {
  it('lança STATIC_COLLISION contra um método nativo público (ex.: find)', () => {
    const target = createFakeTarget();
    const owners = new Map<string, string>();

    expect(() =>
      registerPluginStatic(target, 'find', () => {}, 'my-plugin', owners)
    ).toThrow(MongoatValidationError);

    try {
      registerPluginStatic(target, 'find', () => {}, 'my-plugin', owners);
    } catch (err) {
      expect((err as MongoatValidationError).code).toBe('STATIC_COLLISION');
    }
  });

  it('lança STATIC_COLLISION contra um privado de runtime (rawInsert)', () => {
    const target = createFakeTarget();
    const owners = new Map<string, string>();

    let caught: unknown;

    try {
      registerPluginStatic(target, 'rawInsert', () => {}, 'my-plugin', owners);
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(MongoatValidationError);
    expect((caught as MongoatValidationError).code).toBe('STATIC_COLLISION');
  });

  it('lança STATIC_COLLISION quando o nome já foi registrado por OUTRO plugin', () => {
    const target = createFakeTarget();
    const owners = new Map<string, string>();

    registerPluginStatic(target, 'paginate', () => {}, 'plugin-a', owners);

    expect(() =>
      registerPluginStatic(target, 'paginate', () => {}, 'plugin-b', owners)
    ).toThrow(MongoatValidationError);
  });

  it('anexa fn como propriedade de target sem bind quando não há colisão', () => {
    const target = createFakeTarget();
    const owners = new Map<string, string>();
    const fn = () => 'paginated';

    registerPluginStatic(target, 'paginate', fn, 'plugin-a', owners);

    expect(target.paginate).toBe(fn);
    expect(owners.get('paginate')).toBe('plugin-a');
  });
});

describe('buildPluginContext (D-03)', () => {
  it('ctx.allowedMethods é uma cópia congelada — mutar/tentar mutar não afeta target.allowedMethods', () => {
    const target = createFakeTarget();
    const owners = new Map<string, string>();

    const ctx = buildPluginContext(target, 'my-plugin', owners);

    expect(Object.isFrozen(ctx.allowedMethods)).toBe(true);
    expect(ctx.allowedMethods).toEqual([METHODS.INSERT, METHODS.FIND]);
    expect(ctx.allowedMethods).not.toBe(target.allowedMethods);
  });

  it('mutar ctx.schema NUNCA altera target.validator.$jsonSchema', () => {
    const target = createFakeTarget();
    const owners = new Map<string, string>();

    const ctx = buildPluginContext(target, 'my-plugin', owners);

    (
      ctx.schema as unknown as {
        properties: { name: { bsonType: string } };
      }
    ).properties.name.bsonType = 'int';

    expect(target.validator.$jsonSchema.properties?.name.bsonType).toBe(
      'string'
    );
  });

  it('ctx.pre empurra para target.hooks[method].pre', () => {
    const target = createFakeTarget();
    const owners = new Map<string, string>();
    const ctx = buildPluginContext(target, 'my-plugin', owners);
    const hookFn = () => {};

    ctx.pre(METHODS.INSERT, hookFn);

    expect(target.hooks[METHODS.INSERT].pre).toContain(hookFn);
  });

  it('ctx.post normaliza para { fn, fireAndForget } em target.hooks[method].post', () => {
    const target = createFakeTarget();
    const owners = new Map<string, string>();
    const ctx = buildPluginContext(target, 'my-plugin', owners);
    const hookFn = () => {};

    ctx.post(METHODS.INSERT, hookFn, { fireAndForget: true });

    expect(target.hooks[METHODS.INSERT].post).toEqual([
      { fn: hookFn, fireAndForget: true },
    ]);
  });

  it('ctx.static delega a registerPluginStatic (colisão e sucesso)', () => {
    const target = createFakeTarget();
    const owners = new Map<string, string>();
    const ctx = buildPluginContext(target, 'my-plugin', owners);

    expect(() => ctx.static('rawInsert', () => {})).toThrow(
      MongoatValidationError
    );

    ctx.static('paginate', () => 'ok');
    expect(target.paginate).toBeDefined();
  });
});

describe('applyPlugins (D-04/D-10)', () => {
  it('roda cada setup() síncronamente, globais antes de locais, na ordem de declaração', () => {
    const target = createFakeTarget();
    const order: string[] = [];

    const globalPlugin: Plugin = {
      name: 'global-one',
      setup: () => order.push('global-one'),
    };
    const localPluginA: Plugin = {
      name: 'local-a',
      setup: () => order.push('local-a'),
    };
    const localPluginB: Plugin = {
      name: 'local-b',
      setup: () => order.push('local-b'),
    };

    applyPlugins(target, [globalPlugin], [localPluginA, localPluginB]);

    expect(order).toEqual(['global-one', 'local-a', 'local-b']);
  });

  it('aplica o mesmo plugin (mesma referência) só 1x mesmo se estiver em global e local', () => {
    const target = createFakeTarget();
    const setupSpy = vi.fn();
    const shared: Plugin = { name: 'shared', setup: setupSpy };

    applyPlugins(target, [shared], [shared]);

    expect(setupSpy).toHaveBeenCalledTimes(1);
  });

  it('erro em setup() lança PLUGIN_SETUP_FAILED com o name do plugin culpado e .cause preservado', () => {
    const target = createFakeTarget();
    const originalError = new Error('boom');

    const failingPlugin: Plugin = {
      name: 'failing-plugin',
      setup: () => {
        throw originalError;
      },
    };

    let caught: unknown;

    try {
      applyPlugins(target, [], [failingPlugin]);
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(MongoatValidationError);
    expect((caught as MongoatValidationError).code).toBe(
      'PLUGIN_SETUP_FAILED'
    );
    expect((caught as MongoatValidationError).message).toContain(
      'failing-plugin'
    );
    expect((caught as MongoatValidationError).cause).toBe(originalError);
  });

  it('aborta imediatamente — plugins seguintes ao que falhou não são aplicados', () => {
    const target = createFakeTarget();
    const afterFailureSpy = vi.fn();

    const failingPlugin: Plugin = {
      name: 'failing-plugin',
      setup: () => {
        throw new Error('boom');
      },
    };
    const neverRunsPlugin: Plugin = {
      name: 'never-runs',
      setup: afterFailureSpy,
    };

    expect(() =>
      applyPlugins(target, [], [failingPlugin, neverRunsPlugin])
    ).toThrow(MongoatValidationError);

    expect(afterFailureSpy).not.toHaveBeenCalled();
  });

  it('setup() recebe um PluginContext funcional (pre/post/static operam sobre o target real)', () => {
    const target = createFakeTarget();

    const plugin: Plugin = {
      name: 'paginate-plugin',
      setup: (ctx: PluginContext) => {
        ctx.pre(METHODS.INSERT, () => {});
        ctx.static('paginate', () => 'ok');
      },
    };

    applyPlugins(target, [], [plugin]);

    expect(target.hooks[METHODS.INSERT].pre).toHaveLength(1);
    expect(target.paginate).toBeDefined();
  });
});
