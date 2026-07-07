import { Document } from 'mongodb';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { Database } from '@/database';
import { MongoatError } from '@/errors';
import { Model } from '@/model';
import { ModelValidationSchema } from '@/types';
import { METHODS } from '@/utils/enums';

/**
 * HOOK-03/D-05 — semântica de erro assimétrica do pipeline pre/post.
 *
 * Caso 1: erro em pre-hook aborta a operação ANTES da chamada ao driver —
 * `model.insert(...)` rejeita com o erro do pre-hook, e o documento NUNCA
 * chega a ser persistido (prova indireta de que o driver não foi chamado).
 *
 * Caso 2: erro em post-hook NORMAL (não `fireAndForget`) propaga ao caller
 * por padrão — nunca é engolido em silêncio (Pitfall 3 do RESEARCH.md).
 *
 * Caso 3: mesmo com o post-hook lançando, o insert já ocorreu no driver — o
 * documento existe, deixando explícito que o post roda DEPOIS do driver.
 */
interface Doc extends Document {
  name: string;
}

const schema: ModelValidationSchema = {
  bsonType: 'object',
  properties: { name: { bsonType: 'string' } },
  required: ['name'],
};

describe('Model — semântica de erro pre aborta / post propaga (HOOK-03, D-05)', () => {
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

  it('erro em pre-hook rejeita a operação e o driver NUNCA é chamado — documento não é persistido', async () => {
    const model = new Model<Doc>({
      collectionName: 'hooks_error_propagation_pre_aborts',
      allowedMethods: [METHODS.INSERT, METHODS.FIND_MANY],
      schema,
    });

    await db.setupCollection(model as unknown as Model);

    model.pre(METHODS.INSERT, () => {
      throw new MongoatError('validação de negócio falhou');
    });

    await expect(model.insert({ name: 'nunca-persistido' })).rejects.toThrow(
      MongoatError
    );
    await expect(model.insert({ name: 'nunca-persistido' })).rejects.toThrow(
      'validação de negócio falhou'
    );

    const persisted = await model.findMany({});

    expect(persisted).toHaveLength(0);
  });

  it('erro em post-hook normal (não fireAndForget) propaga ao caller — não engole em silêncio', async () => {
    const model = new Model<Doc>({
      collectionName: 'hooks_error_propagation_post_propagates',
      allowedMethods: [METHODS.INSERT, METHODS.FIND_MANY],
      schema,
    });

    await db.setupCollection(model as unknown as Model);

    model.post(METHODS.INSERT, () => {
      throw new MongoatError('efeito colateral obrigatório falhou');
    });

    await expect(
      model.insert({ name: 'persistido-mesmo-assim' })
    ).rejects.toThrow(MongoatError);
    await expect(
      model.insert({ name: 'persistido-mesmo-assim-2' })
    ).rejects.toThrow('efeito colateral obrigatório falhou');
  });

  it('post-hook lançando ainda ocorre DEPOIS do insert no driver — o documento já existe', async () => {
    const model = new Model<Doc>({
      collectionName: 'hooks_error_propagation_post_after_driver',
      allowedMethods: [METHODS.INSERT, METHODS.FIND_MANY],
      schema,
    });

    await db.setupCollection(model as unknown as Model);

    model.post(METHODS.INSERT, () => {
      throw new MongoatError('post-hook falha depois do driver já ter rodado');
    });

    await expect(model.insert({ name: 'ja-no-banco' })).rejects.toThrow(
      MongoatError
    );

    const persisted = await model.findMany({});

    expect(persisted).toHaveLength(1);
    expect(persisted[0]?.name).toBe('ja-no-banco');
  });
});
