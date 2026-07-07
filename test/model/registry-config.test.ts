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

  // Regressão de WR-03 (Code Review da Fase 01): o caminho deprecated
  // `Database.defineModel()` tinha um early-return (`if (!!model) return
  // model;`) ANTES de qualquer comparação de config — o bug D-06 original
  // sobrevivia pela API deprecated. Agora delega ao construtor do Model.
  it('Database.defineModel() (deprecated) também lança MongoatError para config divergente', () => {
    Database.defineModel<Doc>({
      collectionName: 'registry_config_definemodel',
      allowedMethods: [METHODS.FIND],
      schema,
    });

    expect(() =>
      Database.defineModel<Doc>({
        collectionName: 'registry_config_definemodel',
        allowedMethods: [METHODS.FIND, METHODS.INSERT],
        schema,
      })
    ).toThrow(MongoatError);
  });

  it('Database.defineModel() (deprecated) com a MESMA config retorna a instância existente', () => {
    const first = Database.defineModel<Doc>({
      collectionName: 'registry_config_definemodel_same',
      allowedMethods: [METHODS.FIND],
      schema,
    });

    const second = Database.defineModel<Doc>({
      collectionName: 'registry_config_definemodel_same',
      allowedMethods: [METHODS.FIND],
      schema,
    });

    expect(second).toBe(first);
  });
});
