import { Document } from 'mongodb';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { Database } from '@/database';
import { MongoatValidationError } from '@/errors';
import { Model } from '@/model';
import type { Plugin } from '@/types';
import { ModelValidationSchema } from '@/types';
import { METHODS } from '@/utils/enums';

/**
 * D-10 (Plano 07-02): erro no `setup()` de um plugin local aborta
 * `new Model(...)` ANTES de `registerModel` — o model nunca fica
 * meio-configurado no registry (`Database.getModel(name)` → `undefined`).
 */
interface Doc extends Document {
  name: string;
}

const schema: ModelValidationSchema = {
  bsonType: 'object',
  properties: { name: { bsonType: 'string' } },
  required: ['name'],
};

describe('Model — fail-loud de plugin (setup() lança) nunca registra o model (D-10)', () => {
  let db: Database;

  beforeAll(() => {
    db = new Database({
      uri: process.env.MONGODB_URI,
      dbName: process.env.MONGODB_DB_NAME,
    });
  });

  afterAll(() => {
    Database.resetRegistry();
  });

  it('setup() que lança aborta new Model(...) com PLUGIN_SETUP_FAILED, .cause preservado, e o model nunca é registrado', () => {
    const originalError = new Error('boom');
    const collectionName = 'plugins_fail_loud_setup';

    const failingPlugin: Plugin<Doc> = {
      name: 'failing-plugin',
      setup: () => {
        throw originalError;
      },
    };

    let caughtError: unknown;

    try {
      new Model<Doc>({
        collectionName,
        allowedMethods: [METHODS.INSERT],
        schema,
        plugins: [failingPlugin],
      });
    } catch (err) {
      caughtError = err;
    }

    expect(caughtError).toBeInstanceOf(MongoatValidationError);

    const validationError = caughtError as MongoatValidationError;

    expect(validationError.code).toBe('PLUGIN_SETUP_FAILED');
    expect(validationError.message).toContain('failing-plugin');
    expect(validationError.cause).toBe(originalError);

    expect(db.getModel(collectionName)).toBeUndefined();
  });
});
