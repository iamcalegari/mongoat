import { describe, expect, it } from 'vitest';

import { Database } from '@/database';
import { Model } from '@/model';
import { ModelValidationSchema } from '@/types';
import { METHODS } from '@/utils/enums';

/**
 * D-09 (Plan 04, Task 2) — API mínima `@internal` de reset do registry
 * estático (`KModelMap`), destinada à suíte de testes (isola models
 * registrados entre casos/plans, ex.: Plan 05).
 */
describe('Database — resetRegistry (@internal, D-09)', () => {
  it('limpa o KModelMap: getModel retorna undefined para models registrados antes do reset', () => {
    const db = new Database({
      uri: process.env.MONGODB_URI,
      dbName: process.env.MONGODB_DB_NAME,
      username: 'mongoat',
      password: 'mongoat',
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
