import { Document } from 'mongodb';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import { Database } from '@/database';
import { MongoatValidationError } from '@/errors';
import { Model, kResetPlugins } from '@/model';
import type { Plugin } from '@/types';
import { ModelValidationSchema } from '@/types';
import { METHODS } from '@/utils/enums';

/**
 * D-07 (Plano 07-03): dedup por REFERÊNCIA entre plugins globais
 * (`Model.plugin()`) e locais (`plugins[]`) — o mesmo plugin registrado nos
 * dois grupos roda `setup()` UMA única vez; dois plugins com o mesmo `name`
 * mas referências diferentes lançam `DUPLICATE_PLUGIN_NAME`. Sem mudança de
 * código de produção — o comportamento já foi entregue por
 * `resolvePluginList` (Plano 01) e integrado ao construtor (Plano 02);
 * este arquivo prova o caminho GLOBAL+LOCAL de ponta a ponta, agora que
 * `Model.plugin()` (Plano 03) existe para popular a lista global de fato.
 */
interface Doc extends Document {
  name: string;
}

const schema: ModelValidationSchema = {
  bsonType: 'object',
  properties: { name: { bsonType: 'string' } },
  required: ['name'],
};

describe('Model — dedup por referência global+local e colisão de nome (D-07)', () => {
  let db: Database;

  beforeAll(async () => {
    Model[kResetPlugins]();

    db = new Database({
      uri: process.env.MONGODB_URI,
      dbName: process.env.MONGODB_DB_NAME,
    });

    await db.connect();
  });

  // Cada `it()` abaixo chama `Model.plugin()` — sem isolar entre casos, o
  // primeiro `new Model(...)` de um teste travaria (`kPluginsLocked`) o
  // registro global do teste seguinte, mascarando o cenário de dedup por
  // um falso `PLUGIN_REGISTERED_TOO_LATE`.
  beforeEach(() => {
    Database.resetRegistry();
    Model[kResetPlugins]();
  });

  afterAll(async () => {
    Database.resetRegistry();
    Model[kResetPlugins]();
    await db.disconnect();
  });

  it('a MESMA referência registrada global (Model.plugin()) E local (plugins[]) roda setup() 1x', async () => {
    const setupSpy = vi.fn();

    const sharedPlugin: Plugin<Doc> = {
      name: 'shared-plugin',
      setup: setupSpy,
    };

    Model.plugin(sharedPlugin);

    const model = new Model<Doc>({
      collectionName: 'plugins_dedup_global_local_same_ref',
      allowedMethods: [METHODS.INSERT],
      schema,
      plugins: [sharedPlugin],
    });

    await db.setupCollection(model as unknown as Model);

    expect(setupSpy).toHaveBeenCalledTimes(1);
  });

  it('dois plugins (um global, um local) com o mesmo name mas referências diferentes lança DUPLICATE_PLUGIN_NAME', () => {
    const globalPlugin: Plugin<Doc> = {
      name: 'duplicated-name',
      setup: () => {},
    };
    const localPlugin: Plugin<Doc> = {
      name: 'duplicated-name',
      setup: () => {},
    };

    Model.plugin(globalPlugin);

    let caughtError: unknown;

    try {
      new Model<Doc>({
        collectionName: 'plugins_dedup_name_collision',
        allowedMethods: [METHODS.INSERT],
        schema,
        plugins: [localPlugin],
      });
    } catch (err) {
      caughtError = err;
    }

    expect(caughtError).toBeInstanceOf(MongoatValidationError);
    expect((caughtError as MongoatValidationError).code).toBe(
      'DUPLICATE_PLUGIN_NAME'
    );
  });

  it('dois plugins anônimos distintos (bare functions) NÃO colidem com DUPLICATE_PLUGIN_NAME (WR-02)', async () => {
    const firstSpy = vi.fn();
    const secondSpy = vi.fn();

    // Duas bare functions anônimas distintas — declaradas inline para que
    // NÃO recebam nome inferido (uma atribuição a `const` daria `.name`),
    // ambas normalizam para o sentinela '<anonymous>', mas são plugins
    // genuinamente diferentes.
    const model = new Model<Doc>({
      collectionName: 'plugins_dedup_two_anonymous',
      allowedMethods: [METHODS.INSERT],
      schema,
      plugins: [
        (ctx) => {
          firstSpy(ctx.collectionName);
        },
        (ctx) => {
          secondSpy(ctx.collectionName);
        },
      ],
    });

    await db.setupCollection(model as unknown as Model);

    expect(firstSpy).toHaveBeenCalledTimes(1);
    expect(secondSpy).toHaveBeenCalledTimes(1);
  });
});
