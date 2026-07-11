import { Document } from 'mongodb';
import { beforeEach, describe, expect, it } from 'vitest';

import { Database } from '@/database';
import { MongoatError } from '@/errors';
import { Model } from '@/model';
import { ModelValidationSchema } from '@/types';
import { METHODS } from '@/utils/enums';

/**
 * Regressão de D-06 (Plan 05, Task 3).
 *
 * Bug original: `if (!!model) return model;` ignorava silenciosamente uma
 * segunda `new Model(props)` para a mesma collection com config DIVERGENTE
 * (schema/allowedMethods diferentes) — as novas props eram descartadas sem
 * qualquer aviso. Fix: `isSameConfig()` compara a config recebida com a
 * registrada; se igual, reaproveita a instância existente; se divergente,
 * lança `MongoatError` (sem despejar o schema na mensagem — Information
 * Disclosure, T-01-05-01).
 *
 * Usa `Database.resetRegistry()` (D-09, plan 04) para isolar cada caso.
 */
interface Doc extends Document {
  name: string;
}

const schema: ModelValidationSchema = {
  bsonType: 'object',
  properties: { name: { bsonType: 'string' } },
  required: ['name'],
};

describe('Model — registro atômico com detecção de config divergente (D-06)', () => {
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

  // Regressão de WR-05 (Code Review da Fase 01): a comparação usava
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

  // Regressão de WR-04 (Code Review da Fase 01): `isSameConfig` comparava
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

});
