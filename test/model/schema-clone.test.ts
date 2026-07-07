import { Document } from 'mongodb';
import { describe, expect, it } from 'vitest';

import { Database } from '@/database';
import { Model } from '@/model';
import { ModelValidationSchema } from '@/types';
import { METHODS } from '@/utils/enums';

/**
 * Regressão da mutação de schema entre models (QUAL-01 — Plan 05, Task 2).
 *
 * Bug original: `includeAdditionalPropertiesFalse()` mutava in-place o
 * objeto `schema` recebido (`schema.additionalProperties = false`) — se o
 * mesmo objeto (por referência) fosse reusado em dois models, o segundo
 * model "vazava" a mutação de volta para o objeto do usuário. Fix:
 * `structuredClone(schema)` no início de `schemaValidatorBuilder`, clonando
 * antes de qualquer mutação.
 */
interface Doc extends Document {
  name: string;
  address?: { city: string };
}

describe('Model — schema compartilhado não é mutado entre models (QUAL-01)', () => {
  it('o mesmo objeto de schema usado em dois models permanece intacto após ambas as construções', () => {
    new Database({
      uri: process.env.MONGODB_URI,
      dbName: process.env.MONGODB_DB_NAME,
    });

    const sharedSchema: ModelValidationSchema = {
      bsonType: 'object',
      properties: {
        name: { bsonType: 'string' },
        address: {
          bsonType: 'object',
          properties: {
            city: { bsonType: 'string' },
          },
        },
      },
      required: ['name'],
    };

    new Model<Doc>({
      collectionName: 'schema_clone_model_a',
      allowedMethods: [METHODS.FIND],
      schema: sharedSchema,
    });

    new Model<Doc>({
      collectionName: 'schema_clone_model_b',
      allowedMethods: [METHODS.FIND],
      schema: sharedSchema,
    });

    expect(sharedSchema.additionalProperties).toBeUndefined();
    expect(
      sharedSchema.properties?.address?.additionalProperties
    ).toBeUndefined();
  });
});
