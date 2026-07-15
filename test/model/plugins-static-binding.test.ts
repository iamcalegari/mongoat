import { Document } from 'mongodb';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { Database } from '@/database';
import { Model, kResetPlugins } from '@/model';
import type { Plugin } from '@/types';
import { ModelValidationSchema } from '@/types';
import { METHODS } from '@/utils/enums';

/**
 * D-12 (Plano 07-04): prova de integração — o bind de um static registrado
 * por plugin (`ctx.static`) vem do MESMO Proxy trap que já faz o bind dos
 * 12 métodos nativos do `Model` (`value.bind(target)`,
 * `src/database/index.ts:357-358`). `registerPluginStatic`
 * (`src/model/plugins.ts`) não chama `.bind()` manualmente — a atribuição é
 * uma property simples (`target[name] = fn`); é o Proxy quem faz o bind na
 * LEITURA, para qualquer função (nativa ou de plugin).
 *
 * Este teste roda contra MongoDB real (testcontainers): o static `paginate`
 * usa `this.getCollection()` de dentro do corpo da função — se `this` não
 * estivesse bound ao model, a chamada explodiria em modo estrito (`this` é
 * `undefined`). Nenhuma mudança de código de produção — só exercita o
 * comportamento já existente.
 */
interface Doc extends Document {
  name: string;
  order: number;
}

const schema: ModelValidationSchema = {
  bsonType: 'object',
  properties: {
    name: { bsonType: 'string' },
    order: { bsonType: 'int' },
  },
  required: ['name', 'order'],
};

function paginatePlugin(): Plugin<Doc> {
  return {
    name: 'paginate',
    setup(ctx) {
      ctx.static(
        'paginate',
        async function (this: Model<Doc>, page: number, pageSize: number) {
          return this.getCollection()
            .find({})
            .sort({ order: 1 })
            .skip((page - 1) * pageSize)
            .limit(pageSize)
            .toArray();
        }
      );
    },
  };
}

describe('Model — bind de static de plugin via Proxy contra MongoDB real (D-12)', () => {
  let db: Database;
  let model: Model<Doc> & {
    paginate: (page: number, pageSize: number) => Promise<Doc[]>;
  };

  beforeAll(async () => {
    Model[kResetPlugins]();

    db = new Database({
      uri: process.env.MONGODB_URI,
      dbName: process.env.MONGODB_DB_NAME,
    });

    await db.connect();

    model = new Model<Doc>({
      collectionName: 'plugins_static_binding',
      allowedMethods: [METHODS.INSERT_MANY],
      schema,
      plugins: [paginatePlugin()],
    }) as typeof model;

    await db.setupCollection(model as unknown as Model);

    await model.insertMany([
      { name: 'alpha', order: 1 },
      { name: 'beta', order: 2 },
      { name: 'gamma', order: 3 },
      { name: 'delta', order: 4 },
      { name: 'epsilon', order: 5 },
    ]);
  });

  afterAll(async () => {
    Database.resetRegistry();
    Model[kResetPlugins]();
    await db.disconnect();
  });

  it('model.paginate() (static de plugin) tem `this` bound ao model — this.getCollection() funciona contra dados reais', async () => {
    const page1 = await model.paginate(1, 2);

    expect(page1).toHaveLength(2);
    expect(page1.map((doc) => doc.name)).toEqual(['alpha', 'beta']);

    const page2 = await model.paginate(2, 2);

    expect(page2).toHaveLength(2);
    expect(page2.map((doc) => doc.name)).toEqual(['gamma', 'delta']);

    const page3 = await model.paginate(3, 2);

    expect(page3).toHaveLength(1);
    expect(page3.map((doc) => doc.name)).toEqual(['epsilon']);
  });
});
