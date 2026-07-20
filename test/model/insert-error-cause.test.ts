import { Document } from 'mongodb';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { Database } from '@/database';
import { MongoatError } from '@/errors';
import { Model } from '@/model';
import { ModelValidationSchema } from '@/types';
import { METHODS } from '@/utils/enums';

/**
 * Bug original: os catches de insert/insertMany/bulkWrite faziam `throw new
 * MongoError(JSON.stringify(err, null, 2))` — para `Error`s genéricos,
 * `JSON.stringify(err)` produz `'{}'` (`message`/`stack` são não-enumeráveis),
 * lançando um erro com mensagem `{}` e descartando completamente o erro
 * original e sua stack.
 *
 * Fix: `MongoatError` com a mensagem original preservada e o erro original
 * acessível via `cause`.
 */
interface Doc extends Document {
  name: string;
}

const schema: ModelValidationSchema = {
  bsonType: 'object',
  properties: {
    name: { bsonType: 'string' },
  },
  required: ['name'],
};

describe('Model — erros do driver preservam mensagem e cause', () => {
  let db: Database;
  let model: Model<Doc>;

  beforeAll(async () => {
    db = new Database({
      uri: process.env.MONGODB_URI,
      dbName: process.env.MONGODB_DB_NAME,
    });

    await db.connect();
    Model.setDatabase(db);

    model = new Model<Doc>({
      collectionName: 'insert_error_cause',
      allowedMethods: [METHODS.INSERT, METHODS.INSERT_MANY],
      schema,
    });

    // Aplica o validator ($jsonSchema, validationAction: 'error') — é ele
    // que faz o insert inválido abaixo ser rejeitado pelo servidor.
    await db.setupCollection(model as unknown as Model);
  });

  afterAll(async () => {
    Database.resetRegistry();
    await db.disconnect();
  });

  it('insert() inválido lança MongoatError com a mensagem do driver e cause preservado', async () => {
    let caughtError: unknown;

    try {
      // Viola o validator: `name` é required.
      await model.insert({} as Doc);
    } catch (err) {
      caughtError = err;
    }

    expect(caughtError).toBeInstanceOf(MongoatError);
    expect((caughtError as Error).message).toContain(
      'Document failed validation'
    );
    // O erro original do driver segue acessível (stack incluída).
    expect((caughtError as Error).cause).toBeInstanceOf(Error);
  });

  it('insertMany() inválido também passa pelo catch e preserva a causa', async () => {
    let caughtError: unknown;

    try {
      await model.insertMany([{ name: 'ok' }, {} as Doc]);
    } catch (err) {
      caughtError = err;
    }

    expect(caughtError).toBeInstanceOf(MongoatError);
    expect((caughtError as Error).cause).toBeInstanceOf(Error);
  });
});
