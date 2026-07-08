import { Document, ObjectId } from 'mongodb';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { Database } from '@/database';
import { MongoatValidationError } from '@/errors';
import { Model } from '@/model';
import { ModelValidationSchema } from '@/types';
import { METHODS } from '@/utils/enums';
import { toObjectId } from '@/utils';

/**
 * SEC-02/D-02 (03-02, Task 1).
 *
 * Cobre:
 * (a) `toObjectId` (unit, sem driver): sem argumento gera novo id; com
 *     argumento inválido (string malformada, número, array) lança
 *     `MongoatValidationError(INVALID_OBJECT_ID)`; com argumento válido
 *     retorna o ObjectId correspondente.
 * (b) `findById` (integração, testcontainer): id nullish rejeita
 *     explicitamente — NÃO gera _id aleatório nem retorna `null`
 *     silenciosamente (Pitfall 2); id malformado rejeita; id válido
 *     continua funcionando.
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

describe('toObjectId — fail-loud (unit, sem driver)', () => {
  it('sem argumento gera um novo ObjectId (comportamento preservado)', () => {
    const id = toObjectId();

    expect(id).toBeInstanceOf(ObjectId);
    expect(ObjectId.isValid(id)).toBe(true);
  });

  it('undefined explícito gera um novo ObjectId (comportamento preservado)', () => {
    const id = toObjectId(undefined);

    expect(id).toBeInstanceOf(ObjectId);
  });

  it('string malformada (!== 24 hex) lança MongoatValidationError(INVALID_OBJECT_ID)', () => {
    let caughtError: unknown;

    try {
      toObjectId('zzz');
    } catch (err) {
      caughtError = err;
    }

    expect(caughtError).toBeInstanceOf(MongoatValidationError);
    expect((caughtError as MongoatValidationError).code).toBe(
      'INVALID_OBJECT_ID'
    );
  });

  it('número lança MongoatValidationError(INVALID_OBJECT_ID)', () => {
    expect(() => toObjectId(123 as unknown as string)).toThrow(
      MongoatValidationError
    );
  });

  it('array lança MongoatValidationError(INVALID_OBJECT_ID)', () => {
    expect(() => toObjectId([] as unknown as string)).toThrow(
      MongoatValidationError
    );
  });

  it('string de 24 hex chars válida retorna o ObjectId correspondente', () => {
    const hex = '507f1f77bcf86cd799439011';
    const id = toObjectId(hex);

    expect(id.toHexString()).toBe(hex);
  });
});

describe('findById — nullish é erro explícito (integração, SEC-02/D-02)', () => {
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
      collectionName: 'object_id_validation_find_by_id',
      allowedMethods: [METHODS.INSERT, METHODS.FIND_BY_ID],
      schema,
    });

    await db.setupCollection(model as unknown as Model);
  });

  afterAll(async () => {
    Database.resetRegistry();
    await db.disconnect();
  });

  it('findById(undefinedVar) rejeita com MongoatValidationError — não retorna null', async () => {
    let undefinedVar: string | undefined;

    await expect(
      model.findById(undefinedVar as unknown as string)
    ).rejects.toMatchObject({
      code: 'INVALID_OBJECT_ID',
    });
  });

  it('findById(null) rejeita com MongoatValidationError', async () => {
    await expect(
      model.findById(null as unknown as string)
    ).rejects.toBeInstanceOf(MongoatValidationError);
  });

  it('findById(id malformado) rejeita com MongoatValidationError(INVALID_OBJECT_ID)', async () => {
    await expect(model.findById('malformado')).rejects.toMatchObject({
      code: 'INVALID_OBJECT_ID',
    });
  });

  it('findById(id válido) continua funcionando', async () => {
    const inserted = await model.insert({ name: 'valid-id-test' } as Doc);

    const found = await model.findById(inserted._id);
    expect(found?.name).toBe('valid-id-test');
  });
});
