import { Document } from 'mongodb';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { Database } from '@/database';
import { Model } from '@/model';
import type { Plugin } from '@/types';
import { ModelValidationSchema } from '@/types';
import { METHODS } from '@/utils/enums';

/**
 * PLUG-03/D-03 (Plano 07-02): o `PluginContext` recebido por `setup()`
 * nunca expõe a referência viva de schema/validator/allowedMethods do model
 * sendo construído — `ctx.schema` é um `structuredClone` desconectado,
 * `ctx.allowedMethods` é uma cópia congelada. Mutar (ou tentar mutar)
 * qualquer um dos dois dentro de `setup()` nunca alcança
 * `model.validator`/`model.allowedMethods` reais; `ctx.pre`/`ctx.post`/
 * `ctx.static` são os ÚNICOS canais de efeito de um plugin sobre o model.
 */
interface Doc extends Document {
  name: string;
}

const schema: ModelValidationSchema = {
  bsonType: 'object',
  properties: { name: { bsonType: 'string' } },
  required: ['name'],
};

describe('Model — selo read-only do PluginContext (PLUG-03/D-03)', () => {
  let db: Database;

  beforeAll(async () => {
    db = new Database({
      uri: process.env.MONGODB_URI,
      dbName: process.env.MONGODB_DB_NAME,
    });

    await db.connect();
  });

  afterAll(async () => {
    Database.resetRegistry();
    await db.disconnect();
  });

  it('mutar ctx.schema dentro de setup() nunca altera model.validator.$jsonSchema', () => {
    const plugin: Plugin<Doc> = {
      name: 'schema-mutator',
      setup: (ctx) => {
        const mutableSchema = ctx.schema as unknown as {
          properties: { name: { bsonType: string } };
        };

        mutableSchema.properties.name.bsonType = 'int';
      },
    };

    const model = new Model<Doc>({
      collectionName: 'plugins_context_seal_schema',
      allowedMethods: [METHODS.FIND],
      schema,
      plugins: [plugin],
    });

    expect(model.validator.$jsonSchema.properties?.name.bsonType).toBe(
      'string'
    );
  });

  it('reatribuir/mutar ctx.allowedMethods dentro de setup() nunca altera model.allowedMethods (cópia congelada)', () => {
    let ctxAllowedMethodsSeen: readonly METHODS[] = [];

    const plugin: Plugin<Doc> = {
      name: 'allowed-methods-mutator',
      setup: (ctx) => {
        ctxAllowedMethodsSeen = ctx.allowedMethods;

        // A cópia é congelada — mutar in-place lança (Array.prototype.push
        // em strict mode contra um array com length não-gravável).
        expect(() => {
          (ctx.allowedMethods as METHODS[]).push(METHODS.DELETE);
        }).toThrow();
      },
    };

    const model = new Model<Doc>({
      collectionName: 'plugins_context_seal_allowed_methods',
      allowedMethods: [METHODS.FIND],
      schema,
      plugins: [plugin],
    });

    expect(Object.isFrozen(ctxAllowedMethodsSeen)).toBe(true);
    expect(ctxAllowedMethodsSeen).not.toBe(model.allowedMethods);
    expect(model.allowedMethods).toEqual([METHODS.FIND]);
  });

  it('ctx.pre/ctx.post/ctx.static são os únicos canais de efeito — nenhuma propriedade de ctx expõe a referência viva de validator/hooks/allowedMethods do model', () => {
    let ctxKeysSeen: string[] = [];

    const plugin: Plugin<Doc> = {
      name: 'introspecting-plugin',
      setup: (ctx) => {
        ctxKeysSeen = Object.keys(ctx).sort();
      },
    };

    new Model<Doc>({
      collectionName: 'plugins_context_seal_surface',
      allowedMethods: [METHODS.FIND],
      schema,
      plugins: [plugin],
    });

    // Superfície exata: collectionName/allowedMethods/schema (dados
    // read-only) + pre/post/static (os 3 canais de efeito). Nada de
    // `validator`/`hooks`/uma referência ao model inteiro.
    expect(ctxKeysSeen).toEqual(
      ['allowedMethods', 'collectionName', 'post', 'pre', 'schema', 'static'].sort()
    );
  });
});
