import { describe, expect, it } from 'vitest';

import { Database } from '@/database';
import { Model } from '@/model';
import { ModelValidationSchema } from '@/types';
import { METHODS } from '@/utils/enums';

/**
 * API mínima `@internal` de reset do registry estático (`KModelMap`),
 * destinada à suíte de testes — isola os models registrados entre casos.
 */
describe('Database — resetRegistry (@internal)', () => {
  it('limpa o KModelMap: getModel retorna undefined para models registrados antes do reset', () => {
    const db = new Database({
      uri: process.env.MONGODB_URI,
      dbName: process.env.MONGODB_DB_NAME,
    });

    const schema: ModelValidationSchema = {
      bsonType: 'object',
      properties: { name: { bsonType: 'string' } },
      required: ['name'],
    };

    new Model({
      collectionName: 'registry_reset_target',
      allowedMethods: [METHODS.FIND],
      schema,
    });

    expect(db.getModel('registry_reset_target')).toBeDefined();

    Database.resetRegistry();

    expect(db.getModel('registry_reset_target')).toBeUndefined();
  });
});
