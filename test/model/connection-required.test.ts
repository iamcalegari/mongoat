import { Document } from 'mongodb';
import { describe, expect, it } from 'vitest';

import { Database } from '@/database';
import { MongoatError } from '@/errors';
import { Model } from '@/model';
import { ModelValidationSchema } from '@/types';
import { METHODS } from '@/utils/enums';

/**
 * Regressão de D-10 (Plan 05, Task 2).
 *
 * Bug original: métodos CRUD faziam
 * `Model[kDatabase]?.getCollection(...) as Collection<ModelType>` sem
 * nenhuma checagem — se o Database não estivesse conectado (`getCollection`
 * retorna `undefined`), o cast mentiroso deixava o driver lançar um
 * `TypeError` críptico na primeira chamada de método na collection
 * `undefined`, em vez de um erro claro. Fix: helper `getCollectionOrThrow()`
 * lança `MongoatError` descritivo.
 */
interface Doc extends Document {
  name: string;
}

const schema: ModelValidationSchema = {
  bsonType: 'object',
  properties: { name: { bsonType: 'string' } },
  required: ['name'],
};

describe('Model — getCollectionOrThrow lança MongoatError sem conexão (D-10)', () => {
  it('método CRUD antes de connect() lança MongoatError descritivo, não TypeError', () => {
    const db = new Database({
      uri: process.env.MONGODB_URI,
      dbName: process.env.MONGODB_DB_NAME,
      username: 'mongoat',
      password: 'mongoat',
    });
    // Apenas para satisfazer Model.hasDatabase() — NÃO chama db.connect().
    void db;

    const model = new Model<Doc>({
      collectionName: 'connection_required_total',
      allowedMethods: [METHODS.TOTAL],
      schema,
    });

    expect(() => model.total()).toThrow(MongoatError);
    expect(() => model.total()).toThrow(
      'Database not connected — call db.connect() first'
    );
  });
});
