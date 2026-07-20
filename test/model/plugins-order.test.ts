import { Document } from 'mongodb';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { Database } from '@/database';
import { Model, kResetPlugins } from '@/model';
import type { Plugin } from '@/types';
import { ModelValidationSchema } from '@/types';
import { METHODS } from '@/utils/enums';

/**
 * Ordem determinística COMPLETA de execução de hooks no insert, com o
 * sistema global (`Model.plugin()`) e local (`plugins[]`) integrados ao
 * pipeline de hooks:
 *
 *   @Pre de campo → @Pre de classe → PLUGINS (global → local) →
 *   props.hooks → .pre()/.post() encadeado
 *
 * A ordem `@Pre` de campo → `@Pre` de classe já está coberta contra
 * MongoDB real por `test/schema/hooks-decorator-order.test.ts` — este
 * arquivo, no diretório `test/model/` (fora do escopo de transform de
 * decorators do babel, restrito a `test/schema/**`), prova o elo restante
 * da cadeia com um schema PLANO: global → local → props.hooks →
 * encadeado.
 */
interface Doc extends Document {
  name: string;
}

const schema: ModelValidationSchema = {
  bsonType: 'object',
  properties: { name: { bsonType: 'string' } },
  required: ['name'],
};

describe('Model — ordem determinística global→local→config→encadeado', () => {
  let db: Database;
  let model: Model<Doc>;
  const executionOrder: string[] = [];

  beforeAll(async () => {
    Model[kResetPlugins]();

    db = new Database({
      uri: process.env.MONGODB_URI,
      dbName: process.env.MONGODB_DB_NAME,
    });

    await db.connect();

    const globalPlugin: Plugin<Doc> = {
      name: 'order-global-plugin',
      setup: (ctx) => {
        ctx.pre(METHODS.INSERT, () => {
          executionOrder.push('global');
        });
      },
    };

    Model.plugin(globalPlugin);

    const localPlugin: Plugin<Doc> = {
      name: 'order-local-plugin',
      setup: (ctx) => {
        ctx.pre(METHODS.INSERT, () => {
          executionOrder.push('local');
        });
      },
    };

    model = new Model<Doc>({
      collectionName: 'plugins_order_full_chain',
      allowedMethods: [METHODS.INSERT],
      schema,
      plugins: [localPlugin],
      hooks: {
        [METHODS.INSERT]: {
          pre: [
            () => {
              executionOrder.push('config');
            },
          ],
        },
      },
    });

    model.pre(METHODS.INSERT, () => {
      executionOrder.push('chained');
    });

    await db.setupCollection(model as unknown as Model);
  });

  afterAll(async () => {
    Database.resetRegistry();
    Model[kResetPlugins]();
    await db.disconnect();
  });

  it('ordem no insert é global → local → config (props.hooks) → encadeado', async () => {
    await model.insert({ name: 'alice' });

    expect(executionOrder).toEqual(['global', 'local', 'config', 'chained']);
  });
});
