import { Document } from 'mongodb';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { Database } from '@/database';
import { Model } from '@/model';
import type { Plugin } from '@/types';
import { ModelValidationSchema } from '@/types';
import { METHODS } from '@/utils/enums';

/**
 * `new Model({ plugins: [p] })` aplica plugins
 * locais DENTRO do construtor, ANTES do wrap do Proxy — hook/static de um
 * plugin já estão presentes/disponíveis na 1ª construção. O slot
 * determinístico é ENTRE os hooks decorados (`@Pre`/`@Post`, vazios para um
 * schema não-decorado) e o hook declarado em `props.hooks`: um
 * plugin registrando `pre` no mesmo método de um hook de `props.hooks`
 * sempre executa ANTES dele.
 */
interface Doc extends Document {
  name: string;
}

const schema: ModelValidationSchema = {
  bsonType: 'object',
  properties: { name: { bsonType: 'string' } },
  required: ['name'],
};

describe('Model — plugins locais aplicados no construtor, ANTES do wrap', () => {
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

  it('hook de plugin local dispara em model.insert() já na 1ª construção', async () => {
    let hookRan = false;

    const plugin: Plugin<Doc> = {
      name: 'insert-marker',
      setup: (ctx) => {
        ctx.pre(METHODS.INSERT, () => {
          hookRan = true;
        });
      },
    };

    const model = new Model<Doc>({
      collectionName: 'plugins_application_order_hook',
      allowedMethods: [METHODS.INSERT],
      schema,
      plugins: [plugin],
    });

    await db.setupCollection(model as unknown as Model);

    await model.insert({ name: 'alpha' });

    expect(hookRan).toBe(true);
  });

  it('ctx.static deixa model.<static> disponível imediatamente após new Model(...)', () => {
    const plugin: Plugin<Doc> = {
      name: 'paginate-plugin',
      setup: (ctx) => {
        ctx.static('paginate', function (this: { collectionName: string }) {
          return this.collectionName;
        });
      },
    };

    const model = new Model<Doc>({
      collectionName: 'plugins_application_order_static',
      allowedMethods: [METHODS.FIND],
      schema,
      plugins: [plugin],
    });

    const modelWithStatic = model as unknown as { paginate: () => string };

    expect(typeof modelWithStatic.paginate).toBe('function');
    expect(modelWithStatic.paginate()).toBe('plugins_application_order_static');
  });

  it('ordem: pre de plugin executa ANTES do hook declarado em props.hooks, e AMBOS antes do encadeável (.pre())', async () => {
    const executionOrder: string[] = [];

    const plugin: Plugin<Doc> = {
      name: 'order-plugin',
      setup: (ctx) => {
        ctx.pre(METHODS.INSERT, () => {
          executionOrder.push('plugin');
        });
      },
    };

    const model = new Model<Doc>({
      collectionName: 'plugins_application_order_slot',
      allowedMethods: [METHODS.INSERT],
      schema,
      plugins: [plugin],
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

    await db.setupCollection(model as unknown as Model);

    model.pre(METHODS.INSERT, () => {
      executionOrder.push('chained');
    });

    await model.insert({ name: 'alpha' });

    expect(executionOrder).toEqual(['plugin', 'config', 'chained']);
  });
});
