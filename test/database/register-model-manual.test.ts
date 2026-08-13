import { Document } from 'mongodb';
import { beforeEach, describe, expect, it } from 'vitest';

import { Database } from '@/database';
import { MongoatError } from '@/errors';
import { Model } from '@/model';
import type { Plugin } from '@/types';
import { ModelValidationSchema } from '@/types';
import { METHODS } from '@/utils/enums';

/**
 * `Database#registerModel()` é público e documentado como via de registro
 * manual, mas nunca teve cobertura própria — até esta suíte, a única
 * exercitação do método vinha indireta, pela chamada que o construtor de
 * `Model` faz. Estes casos chamam `registerModel()` diretamente para provar
 * que ele recusa uma config divergente e um model com hooks quando o nome já
 * está ocupado, devolve a instância existente quando a config coincide, e
 * deixa o caminho de nome livre intocado.
 *
 * Mecanismo de colisão: construir dois models com `new Model(...)` sobre
 * `collectionName` distintos (o construtor lançaria se os dois usassem o
 * MESMO nome com config divergente, então não dá para chegar ao estado
 * "nome ocupado + candidato divergente" por ele) e então ajustar o
 * `collectionName` do segundo para colidir com o primeiro antes de chamar
 * `registerModel()` à mão. `collectionName` é uma propriedade pública
 * gravável e o handler do Proxy de gating não declara `set` trap, então a
 * atribuição atravessa para a instância crua sem gating algum — o mesmo
 * caminho que qualquer escrita direta numa propriedade não-função do model
 * já usa hoje. Representa o uso manual real que o método documenta: montar
 * um `Model` e registrá-lo por fora do fluxo do construtor.
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

describe('Database — registerModel() manual', () => {
  let db: Database;

  beforeEach(() => {
    Database.resetRegistry();

    if (!Model.hasDatabase()) {
      new Database({
        uri: process.env.MONGODB_URI,
        dbName: process.env.MONGODB_DB_NAME,
      });
    }

    db = new Database({
      uri: process.env.MONGODB_URI,
      dbName: process.env.MONGODB_DB_NAME,
    });
  });

  it('nome livre: cria o Proxy, grava no registry e o gating funciona no objeto devolvido', () => {
    const model = new Model<Doc>({
      collectionName: 'register_model_manual_free',
      allowedMethods: [METHODS.FIND],
      schema,
    });

    // Reabre o nome sem descartar a instância já construída — simula
    // reconstruir o estado do registry a partir de um model que já existe,
    // sem reconstruir o `Model` do zero.
    Database.resetRegistry();

    const registered = db.registerModel(model as unknown as Model<Document>);

    expect(registered).not.toBe(model);
    expect(db.getModel('register_model_manual_free')).toBe(registered);

    expect(() =>
      (registered as unknown as Model<Doc>).insert({ name: 'x' })
    ).toThrow(/not allowed/);
  });

  it('mesma instância re-registrada: devolve a própria referência, sem guard algum', () => {
    new Model<Doc>({
      collectionName: 'register_model_manual_same_ref',
      allowedMethods: [METHODS.FIND],
      schema,
      hooks: { [METHODS.FIND]: { pre: [() => {}] } },
    });

    const existing = db.getModel(
      'register_model_manual_same_ref'
    ) as unknown as Model<Document>;

    expect(() => db.registerModel(existing)).not.toThrow();
    expect(db.registerModel(existing)).toBe(existing);
    expect(db.getModel('register_model_manual_same_ref')).toBe(existing);
  });

  it('config DIVERGENTE (documentDefaults) num nome ocupado lança MODEL_CONFIG_CONFLICT nomeando o campo', () => {
    new Model<Doc>({
      collectionName: 'register_model_manual_divergent',
      allowedMethods: [METHODS.FIND],
      schema,
      documentDefaults: { name: 'default-a' },
    });

    const candidate = new Model<Doc>({
      collectionName: 'register_model_manual_divergent_source',
      allowedMethods: [METHODS.FIND],
      schema,
      documentDefaults: { name: 'default-b' },
    }) as unknown as Model<Document>;

    candidate.collectionName = 'register_model_manual_divergent';

    let caught: unknown;

    try {
      db.registerModel(candidate);
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(MongoatError);
    expect((caught as MongoatError).code).toBe('MODEL_CONFIG_CONFLICT');
    expect((caught as MongoatError).message).toContain('documentDefaults');
  });

  it('config IDÊNTICA num nome ocupado devolve a instância já registrada, sem substituir a entrada', () => {
    const first = new Model<Doc>({
      collectionName: 'register_model_manual_identical',
      allowedMethods: [METHODS.FIND],
      schema,
      documentDefaults: { name: 'same-default' },
    });

    const candidate = new Model<Doc>({
      collectionName: 'register_model_manual_identical_source',
      allowedMethods: [METHODS.FIND],
      schema,
      documentDefaults: { name: 'same-default' },
    }) as unknown as Model<Document>;

    candidate.collectionName = 'register_model_manual_identical';

    const result = db.registerModel(candidate);

    expect(result).toBe(first);
    expect(db.getModel('register_model_manual_identical')).toBe(first);
  });

  it('model com hooks declarados num nome ocupado lança MODEL_CONFIG_CONFLICT mesmo com os 6 campos idênticos', () => {
    const first = new Model<Doc>({
      collectionName: 'register_model_manual_hooks_declared',
      allowedMethods: [METHODS.FIND],
      schema,
    });

    const candidate = new Model<Doc>({
      collectionName: 'register_model_manual_hooks_declared_source',
      allowedMethods: [METHODS.FIND],
      schema,
      hooks: { [METHODS.FIND]: { pre: [() => {}] } },
    }) as unknown as Model<Document>;

    candidate.collectionName = 'register_model_manual_hooks_declared';

    let caught: unknown;

    try {
      db.registerModel(candidate);
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(MongoatError);
    expect((caught as MongoatError).code).toBe('MODEL_CONFIG_CONFLICT');
    expect(db.getModel('register_model_manual_hooks_declared')).toBe(first);
  });

  it('model com hook registrado por plugin (origem diferente) num nome ocupado também lança MODEL_CONFIG_CONFLICT', () => {
    const first = new Model<Doc>({
      collectionName: 'register_model_manual_hooks_plugin',
      allowedMethods: [METHODS.FIND],
      schema,
    });

    const pluginWithHook: Plugin<Doc> = {
      name: 'register-model-manual-plugin',
      setup: (ctx) => {
        ctx.pre(METHODS.FIND, () => {});
      },
    };

    const candidate = new Model<Doc>({
      collectionName: 'register_model_manual_hooks_plugin_source',
      allowedMethods: [METHODS.FIND],
      schema,
      plugins: [pluginWithHook],
    }) as unknown as Model<Document>;

    candidate.collectionName = 'register_model_manual_hooks_plugin';

    let caught: unknown;

    try {
      db.registerModel(candidate);
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(MongoatError);
    expect((caught as MongoatError).code).toBe('MODEL_CONFIG_CONFLICT');
    expect(db.getModel('register_model_manual_hooks_plugin')).toBe(first);
  });

  // O guard de hooks acima cobre um plugin que registra `pre`/`post`, mas
  // um plugin pode contribuir SÓ um `static` (nenhum hook) — esse caso não
  // tem cobertura própria e passava batido por qualquer guard de hooks
  // (não há hook nenhum para detectar), então a lista de plugins do
  // candidato era descartada em silêncio na re-registração manual.
  it('model com plugin SEM hook (só static) num nome ocupado também lança MODEL_CONFIG_CONFLICT em vez de descartar o plugin em silêncio', () => {
    const first = new Model<Doc>({
      collectionName: 'register_model_manual_plugin_static_only',
      allowedMethods: [METHODS.FIND],
      schema,
    });

    const pluginWithStaticOnly: Plugin<Doc> = {
      name: 'register-model-manual-static-only-plugin',
      setup: (ctx) => {
        ctx.static('fooStatic', () => 'foo');
      },
    };

    const candidate = new Model<Doc>({
      collectionName: 'register_model_manual_plugin_static_only_source',
      allowedMethods: [METHODS.FIND],
      schema,
      plugins: [pluginWithStaticOnly],
    }) as unknown as Model<Document>;

    candidate.collectionName = 'register_model_manual_plugin_static_only';

    let caught: unknown;

    try {
      db.registerModel(candidate);
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(MongoatError);
    expect((caught as MongoatError).code).toBe('MODEL_CONFIG_CONFLICT');
    expect((caught as MongoatError).message).toContain('plugins');
    expect(db.getModel('register_model_manual_plugin_static_only')).toBe(first);
    // O `static` do plugin candidato nunca deve grudar silenciosamente na
    // instância já registrada.
    expect(
      (first as unknown as Record<string, unknown>).fooStatic
    ).toBeUndefined();
  });
});
