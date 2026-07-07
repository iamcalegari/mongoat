import { ObjectId } from 'mongodb';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { Database } from '@/database';
import { MongoatError } from '@/errors';
import { Model } from '@/model';
import { ModelValidationSchema } from '@/types';
import { METHODS } from '@/utils/enums';

/**
 * Regressão do bug de binding do `KModelProxyHandler` (QUAL-01 — Plan 04,
 * Task 1).
 *
 * Bug original: o trap `get` fazia `Reflect.get(target, prop,
 * receiver).bind(target)` e descartava o resultado do `.bind()`, retornando
 * em seguida um SEGUNDO `Reflect.get` sem bind nenhum. Como `model.metodo()`
 * (chamada via member access) sempre define `this` como o objeto de onde a
 * propriedade foi lida, o método acabava rodando com `this` = o próprio
 * Proxy (`receiver`), fazendo qualquer acesso interno a `this.outroMetodo()`
 * reentrar no trap — o que pode mascarar o guard de `allowedMethods` (ou
 * quebrar chamadas internas legítimas, como `findById` → `this.find`).
 */
interface Doc {
  name: string;
}

const schema: ModelValidationSchema = {
  bsonType: 'object',
  properties: {
    name: { bsonType: 'string' },
  },
  required: ['name'],
};

describe('Database — KModelProxyHandler binding (QUAL-01)', () => {
  let db: Database;

  beforeAll(async () => {
    db = new Database({
      uri: process.env.MONGODB_URI,
      dbName: process.env.MONGODB_DB_NAME,
      username: 'mongoat',
      password: 'mongoat',
    });

    await db.connect();
  });

  afterAll(async () => {
    await db.disconnect();
  });

  it('vincula métodos ao target: chamada interna (findById → this.find) não reentra no guard do Proxy', async () => {
    const model = new Model<Doc>({
      collectionName: 'proxy_binding_findbyid',
      allowedMethods: [METHODS.FIND_BY_ID],
      schema,
    });

    await db.setupCollection(model as unknown as Model);

    // findById chama internamente this.find(...). "find" NÃO está em
    // allowedMethods — se o bind fosse ao `receiver` (o Proxy), essa
    // chamada interna reentraria no trap e lançaria MongoatError. Com o
    // bind correto ao `target`, a chamada interna não passa pelo Proxy e
    // findById funciona normalmente.
    await expect(model.findById(new ObjectId())).resolves.toBeNull();
  });

  it('acessar diretamente um método fora de allowedMethods ainda lança MongoatError (guard preservado)', () => {
    const model = new Model<Doc>({
      collectionName: 'proxy_binding_guard_direct',
      allowedMethods: [METHODS.FIND],
      schema,
    });

    expect(() =>
      (model as unknown as Model<Doc>).insert({ name: 'x' })
    ).toThrow(MongoatError);
    expect(() =>
      (model as unknown as Model<Doc>).insert({ name: 'x' })
    ).toThrow(/not allowed/);
  });

  it('método não permitido lança MongoatError via new Model() direto', () => {
    const model = new Model<Doc>({
      collectionName: 'proxy_binding_guard_new_model',
      allowedMethods: [METHODS.FIND],
      schema,
    });

    expect(() => model.insert({ name: 'x' })).toThrow(MongoatError);
  });

  it('método não permitido lança MongoatError via Database.defineModel() (deprecated)', () => {
    const model = Database.defineModel<Doc>({
      collectionName: 'proxy_binding_guard_definemodel',
      allowedMethods: [METHODS.FIND],
      schema,
    });

    expect(() => model.insert({ name: 'x' })).toThrow(MongoatError);
  });

  it('defineModel() não produz duplo-Proxy — método permitido funciona com this correto', async () => {
    const model = Database.defineModel<Doc>({
      collectionName: 'proxy_binding_definemodel_ok',
      allowedMethods: [METHODS.INSERT, METHODS.FIND],
      schema,
    });

    expect(model.collectionName).toBe('proxy_binding_definemodel_ok');

    await db.setupCollection(model as unknown as Model);

    const inserted = await model.insert({ name: 'mongoat' });
    expect(inserted.name).toBe('mongoat');

    const found = await model.find({ name: 'mongoat' });
    expect(found?.name).toBe('mongoat');
  });

  it('propriedade não-função acessada via Proxy retorna o valor cru', () => {
    const model = new Model<Doc>({
      collectionName: 'proxy_binding_raw_prop',
      allowedMethods: [METHODS.FIND],
      schema,
    });

    expect(model.collectionName).toBe('proxy_binding_raw_prop');
    expect(Array.isArray(model.indexes)).toBe(true);
  });
});
