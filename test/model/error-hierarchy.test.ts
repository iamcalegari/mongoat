import { Document, ObjectId } from 'mongodb';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { Database } from '@/database';
import {
  MongoatConnectionError,
  MongoatDriverError,
  MongoatError,
  MongoatValidationError,
} from '@/errors';
import { Model } from '@/model';
import { ModelValidationSchema } from '@/types';
import { METHODS } from '@/utils/enums';

/**
 * Cobre:
 * (a) E11000 real (via testcontainer) — `wrapDriverError` emite
 *     `MongoatDriverError` com `code: 'DUPLICATE_KEY'`, mensagem SEM o
 *     valor duplicado (só o nome do índice), e `.cause` preservado.
 * (b) Discriminação `instanceof`/`.code` das 3 subclasses (unit, sem
 *     driver).
 * (c) `MongoatConnectionError` ao operar desconectado.
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

describe('Hierarquia de erros — instanceof/code (unit, sem driver)', () => {
  it('MongoatValidationError: instanceof MongoatError, code default VALIDATION_FAILED', () => {
    const err = new MongoatValidationError('x');

    expect(err).toBeInstanceOf(MongoatValidationError);
    expect(err).toBeInstanceOf(MongoatError);
    expect(err.name).toBe('MongoatValidationError');
    expect(err.code).toBe('VALIDATION_FAILED');
  });

  it('MongoatValidationError: override pontual do code é respeitado', () => {
    const err = new MongoatValidationError('x', {
      code: 'INVALID_OBJECT_ID',
    });

    expect(err.code).toBe('INVALID_OBJECT_ID');
  });

  it('MongoatConnectionError: instanceof MongoatError, code default NOT_CONNECTED', () => {
    const err = new MongoatConnectionError('x');

    expect(err).toBeInstanceOf(MongoatConnectionError);
    expect(err).toBeInstanceOf(MongoatError);
    expect(err.code).toBe('NOT_CONNECTED');
  });

  it('MongoatDriverError: cause preservado, code aceita override explícito', () => {
    const cause = new Error('boom');
    const err = new MongoatDriverError('x', { cause, code: 'DUPLICATE_KEY' });

    expect(err).toBeInstanceOf(MongoatDriverError);
    expect(err).toBeInstanceOf(MongoatError);
    expect(err.code).toBe('DUPLICATE_KEY');
    expect(err.cause).toBe(cause);
  });

  it('MongoatError base: code default MONGOAT_ERROR, todas as subclasses continuam instanceof', () => {
    const base = new MongoatError('x');

    expect(base.code).toBe('MONGOAT_ERROR');
    expect(new MongoatValidationError('x')).toBeInstanceOf(MongoatError);
    expect(new MongoatConnectionError('x')).toBeInstanceOf(MongoatError);
    expect(new MongoatDriverError('x')).toBeInstanceOf(MongoatError);
  });
});

describe('Model — erro de conexão (MongoatConnectionError)', () => {
  it('método CRUD antes de connect() rejeita com MongoatConnectionError', async () => {
    const db = new Database({
      uri: process.env.MONGODB_URI,
      dbName: process.env.MONGODB_DB_NAME,
    });
    // Apenas para satisfazer Model.hasDatabase() — NÃO chama db.connect().
    void db;

    const model = new Model<Doc>({
      collectionName: 'error_hierarchy_connection_required',
      allowedMethods: [METHODS.TOTAL],
      schema,
    });

    await expect(model.total()).rejects.toThrow(MongoatConnectionError);
    await expect(model.total()).rejects.toMatchObject({
      code: 'NOT_CONNECTED',
    });
  });
});

describe('Model — wrapDriverError emite MongoatDriverError sanitizado (E11000)', () => {
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
      collectionName: 'error_hierarchy_duplicate_key',
      allowedMethods: [METHODS.INSERT],
      schema,
    });

    await db.setupCollection(model as unknown as Model);
  });

  afterAll(async () => {
    Database.resetRegistry();
    await db.disconnect();
  });

  it('colisão de _id vira MongoatDriverError com code DUPLICATE_KEY, sem o valor duplicado na mensagem', async () => {
    const duplicateId = new ObjectId();

    await model.insert({ _id: duplicateId, name: 'first' } as Doc);

    let caughtError: unknown;

    try {
      await model.insert({ _id: duplicateId, name: 'second' } as Doc);
    } catch (err) {
      caughtError = err;
    }

    expect(caughtError).toBeInstanceOf(MongoatDriverError);
    expect(caughtError).toBeInstanceOf(MongoatError);

    const driverError = caughtError as MongoatDriverError;

    expect(driverError.code).toBe('DUPLICATE_KEY');
    // Nunca o valor duplicado (o ObjectId inserido) na mensagem sanitizada.
    expect(driverError.message).not.toContain(duplicateId.toHexString());
    // O erro original do driver (com o valor completo) segue acessível.
    expect(driverError.cause).toBeInstanceOf(Error);
    expect((driverError.cause as Error).message).toContain(
      duplicateId.toHexString()
    );
  });
});
