import { Document } from 'mongodb';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { Database } from '@/database';
import { MongoatError } from '@/errors';
import { Model } from '@/model';
import { ModelValidationSchema } from '@/types';
import { METHODS } from '@/utils/enums';

/**
 * Bug original: com o banco desconectado, `this[kClient]?.startSession(...)`
 * retornava `undefined`, o optional chaining engolia tudo e `withTransaction`
 * resolvia com `undefined` SEM nunca executar o callback — uma transação que
 * "deu certo" mas jamais rodou (perda de escrita silenciosa).
 *
 * Fix: lançar `MongoatError` descritivo quando não conectado (mesmo padrão
 * de `getCollectionOrThrow`), aguardar `endSession()` num `finally`.
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

describe('Database — withTransaction', () => {
  it('lança MongoatError quando o banco não está conectado — nunca resolve como no-op', async () => {
    const db = new Database({
      uri: process.env.MONGODB_URI,
      dbName: process.env.MONGODB_DB_NAME,
    });

    let callbackRan = false;

    await expect(
      db.withTransaction(async () => {
        callbackRan = true;
      })
    ).rejects.toThrow(MongoatError);

    expect(callbackRan).toBe(false);
  });

  describe('conectado (container roda como replica set de nó único)', () => {
    let db: Database;
    let model: Model<Doc>;

    beforeAll(async () => {
      db = new Database({
        uri: process.env.MONGODB_URI,
        dbName: process.env.MONGODB_DB_NAME,
      });

      await db.connect();

      // `Model[kDatabase]` é first-wins: o teste anterior deste arquivo já
      // instanciou uma Database (desconectada). Rebind explícito para a
      // instância conectada (escape hatch documentado — Model.setDatabase).
      Model.setDatabase(db);

      model = new Model<Doc>({
        collectionName: 'with_transaction',
        allowedMethods: [METHODS.INSERT, METHODS.FIND],
        schema,
      });

      await db.setupCollection(model as unknown as Model);
    });

    afterAll(async () => {
      Database.resetRegistry();
      await db.disconnect();
    });

    it('executa o callback dentro da transação e retorna o resultado', async () => {
      const result = await db.withTransaction(async (session) => {
        expect(session).toBeDefined();

        const inserted = await model.insert({ name: 'tx-doc' }, { session });

        return inserted.name;
      });

      expect(result).toBe('tx-doc');

      const persisted = await model.find({ name: 'tx-doc' });
      expect(persisted?.name).toBe('tx-doc');
    });
  });
});
