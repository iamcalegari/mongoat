import { Document } from 'mongodb';
import { beforeEach, describe, expect, it } from 'vitest';

import { Database } from '@/database';
import { MongoatError } from '@/errors';
import { Model } from '@/model';
import { ModelValidationSchema } from '@/types';
import { METHODS } from '@/utils/enums';

/**
 * Bug original: `if (!!model) return model;` ignorava silenciosamente uma
 * segunda `new Model(props)` para a mesma collection com config DIVERGENTE
 * (schema/allowedMethods diferentes) — as novas props eram descartadas sem
 * qualquer aviso. Fix: `isSameConfig()` compara a config recebida com a
 * registrada; se igual, reaproveita a instância existente; se divergente,
 * lança `MongoatError` (sem despejar o schema na mensagem — Information
 * Disclosure).
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

describe('Model — registro atômico com detecção de config divergente', () => {
  beforeEach(() => {
    Database.resetRegistry();

    if (!Model.hasDatabase()) {
      new Database({
        uri: process.env.MONGODB_URI,
        dbName: process.env.MONGODB_DB_NAME,
      });
    }
  });

  it('new Model() com a MESMA config para uma collection já registrada retorna a instância existente', () => {
    const first = new Model<Doc>({
      collectionName: 'registry_config_same',
      allowedMethods: [METHODS.FIND],
      schema,
    });

    const second = new Model<Doc>({
      collectionName: 'registry_config_same',
      allowedMethods: [METHODS.FIND],
      schema,
    });

    expect(second).toBe(first);
  });

  it('new Model() com config DIVERGENTE para uma collection já registrada lança MongoatError sem despejar o schema', () => {
    new Model<Doc>({
      collectionName: 'registry_config_divergent',
      allowedMethods: [METHODS.FIND],
      schema,
    });

    const divergentSchema: ModelValidationSchema = {
      bsonType: 'object',
      properties: {
        name: { bsonType: 'string' },
        extraDivergentField: { bsonType: 'string' },
      },
      required: ['name'],
    };

    let caughtError: unknown;

    try {
      new Model<Doc>({
        collectionName: 'registry_config_divergent',
        allowedMethods: [METHODS.FIND, METHODS.INSERT],
        schema: divergentSchema,
      });
    } catch (err) {
      caughtError = err;
    }

    expect(caughtError).toBeInstanceOf(MongoatError);
    expect((caughtError as Error).message).toContain(
      'registry_config_divergent'
    );
    expect((caughtError as Error).message).toContain(
      'different configuration'
    );
    expect((caughtError as Error).message).not.toContain(
      'extraDivergentField'
    );
  });

  // Regressão: a comparação usava
  // `JSON.stringify` puro, sensível à ordem de inserção das chaves — o mesmo
  // schema declarado com `properties` em ordem distinta gerava um falso
  // "already registered with a different configuration".
  it('new Model() com o MESMO schema declarado com chaves em ordem diferente reusa a instância', () => {
    const first = new Model<Doc>({
      collectionName: 'registry_config_key_order',
      allowedMethods: [METHODS.FIND],
      schema: {
        bsonType: 'object',
        properties: {
          name: { bsonType: 'string' },
          tag: { bsonType: 'string' },
        },
        required: ['name'],
      },
    });

    const second = new Model<Doc>({
      collectionName: 'registry_config_key_order',
      allowedMethods: [METHODS.FIND],
      schema: {
        properties: {
          tag: { bsonType: 'string' },
          name: { bsonType: 'string' },
        },
        required: ['name'],
        bsonType: 'object',
      },
    });

    expect(second).toBe(first);
  });

  // Regressão: `isSameConfig` comparava
  // apenas allowedMethods + validator — re-registração com mesmo schema mas
  // documentDefaults ou indexes diferentes retornava a primeira instância
  // silenciosamente, descartando os novos defaults/índices sem aviso.
  it('new Model() com mesmos schema/métodos mas documentDefaults DIVERGENTES lança MongoatError', () => {
    new Model<Doc>({
      collectionName: 'registry_config_defaults_divergent',
      allowedMethods: [METHODS.FIND],
      documentDefaults: { name: 'active' },
      schema,
    });

    expect(
      () =>
        new Model<Doc>({
          collectionName: 'registry_config_defaults_divergent',
          allowedMethods: [METHODS.FIND],
          documentDefaults: { name: 'draft' },
          schema,
        })
    ).toThrow(MongoatError);
  });

  it('new Model() com mesmos schema/métodos mas indexes DIVERGENTES lança MongoatError', () => {
    new Model<Doc>({
      collectionName: 'registry_config_indexes_divergent',
      allowedMethods: [METHODS.FIND],
      indexes: [{ key: { name: 1 } }],
      schema,
    });

    expect(
      () =>
        new Model<Doc>({
          collectionName: 'registry_config_indexes_divergent',
          allowedMethods: [METHODS.FIND],
          indexes: [{ key: { name: 1 }, unique: true }],
          schema,
        })
    ).toThrow(MongoatError);
  });

  // `isSameConfig` nunca
  // comparou `hooks` — funções não são comparáveis estruturalmente via
  // `stableStringify`. Uma re-registração do MESMO collectionName que
  // declara `props.hooks` costumava cair no early-return de config
  // "idêntica" (allowedMethods/validator/documentDefaults/indexes batiam) e
  // o hook era descartado em silêncio, sem nenhum aviso — o pior tipo de
  // bug para um hook de segurança (ex.: hash de senha). Fix: o branch de
  // re-registro agora falha alto com MODEL_CONFIG_CONFLICT sempre que o
  // candidato declara hooks para uma collectionName já registrada, em vez
  // de tentar comparar as funções.
  it('new Model() com props.hooks presente na re-registração da mesma collectionName lança MongoatError/MODEL_CONFIG_CONFLICT em vez de descartar o hook', () => {
    const first = new Model<Doc>({
      collectionName: 'registry_config_hooks_conflict',
      allowedMethods: [METHODS.FIND],
      schema,
    });

    let caughtError: unknown;

    try {
      new Model<Doc>({
        collectionName: 'registry_config_hooks_conflict',
        allowedMethods: [METHODS.FIND],
        schema,
        hooks: {
          [METHODS.FIND]: {
            pre: [() => {}],
          },
        },
      });
    } catch (err) {
      caughtError = err;
    }

    expect(caughtError).toBeInstanceOf(MongoatError);
    expect((caughtError as MongoatError).code).toBe('MODEL_CONFIG_CONFLICT');
    // O hook NÃO foi silenciosamente anexado à instância já registrada.
    expect(first.hooks[METHODS.FIND].pre).toHaveLength(0);
  });

  it('new Model() SEM hooks e config idêntica continua reusando a instância existente mesmo quando a primeira registração declarou hooks', () => {
    const first = new Model<Doc>({
      collectionName: 'registry_config_hooks_reuse',
      allowedMethods: [METHODS.FIND],
      schema,
      hooks: {
        [METHODS.FIND]: {
          pre: [() => {}],
        },
      },
    });

    const second = new Model<Doc>({
      collectionName: 'registry_config_hooks_reuse',
      allowedMethods: [METHODS.FIND],
      schema,
    });

    expect(second).toBe(first);
    // O hook declarado na primeira registração continua intacto.
    expect(first.hooks[METHODS.FIND].pre).toHaveLength(1);
  });
});
