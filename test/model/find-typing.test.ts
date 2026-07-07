import { Document, Filter, FindOptions, WithId } from 'mongodb';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { Database } from '@/database';
import { Model } from '@/model';
import { ModelValidationSchema } from '@/types';
import { METHODS } from '@/utils/enums';

/**
 * Regressão do tipo de retorno de `find()` (QUAL-01 — Plan 05, Task 1).
 *
 * Bug original: `find()` declarava `Promise<WithId<ModelType> | null> |
 * null` (união síncrona externa à Promise) e fazia `return
 * collection.findOne(...) ?? null` — o `?? null` nunca dispara em tempo de
 * execução (uma Promise nunca é nullish), então o tipo apenas mentia sobre
 * uma possibilidade de retorno síncrono que nunca acontece. Fix: `find()`
 * declara `Promise<WithId<ModelType> | null>` — nunca `| null` fora da
 * Promise.
 */
interface Doc extends Document {
  name: string;
}

const schema: ModelValidationSchema = {
  bsonType: 'object',
  properties: { name: { bsonType: 'string' } },
  required: ['name'],
};

describe('Model — find() com tipo de retorno consistente (QUAL-01)', () => {
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
    Database.resetRegistry();
    await db.disconnect();
  });

  it('find() retorna um valor thenable (Promise)', () => {
    const model = new Model<Doc>({
      collectionName: 'find_typing_thenable',
      allowedMethods: [METHODS.FIND],
      schema,
    });

    const result = model.find({ name: 'nope' });

    expect(result).toBeInstanceOf(Promise);
  });

  it('await find() resolve para o documento quando existe, e null quando não existe', async () => {
    const model = new Model<Doc>({
      collectionName: 'find_typing_resolve',
      allowedMethods: [METHODS.FIND, METHODS.INSERT],
      schema,
    });

    await db.setupCollection(model as unknown as Model);

    const notFound = await model.find({ name: 'ghost' });
    expect(notFound).toBeNull();

    await model.insert({ name: 'mongoat' });

    const found = await model.find({ name: 'mongoat' });
    expect(found?.name).toBe('mongoat');
  });

  it('assinatura de tipo: find() nunca retorna `| null` fora da Promise (checado por tsc --noEmit)', () => {
    const model = new Model<Doc>({
      collectionName: 'find_typing_signature',
      allowedMethods: [METHODS.FIND],
      schema,
    });

    // Atribuir `model.find` (bound) a uma variável com o tipo-alvo exato
    // `(filter?, options?) => Promise<WithId<Doc> | null>` — se o tipo real
    // de `find()` for mais amplo (ex.: `Promise<WithId<Doc> | null> |
    // null`), esta atribuição falha em tempo de compilação porque `null`
    // não é atribuível a `Promise<WithId<Doc> | null>` sob `strict: true`.
    const boundFind: (
      filter?: Filter<Doc>,
      options?: FindOptions
    ) => Promise<WithId<Doc> | null> = model.find.bind(model);

    expect(typeof boundFind).toBe('function');
  });
});
