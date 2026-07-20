import { Document } from 'mongodb';
import { describe, expect, it } from 'vitest';

import { Database } from '@/database';
import { Model } from '@/model';
import { ModelValidationSchema } from '@/types';
import { METHODS } from '@/utils/enums';
import { buildJsonSchemaValidator } from '@utils/database';

/**
 * Prova de paridade: `buildJsonSchemaValidator` (extraído para
 * `@utils/database`) precisa produzir, para o MESMO schema
 * plano, um validador BYTE-IDÊNTICO ao que `new Model(...)` expõe em
 * `.validator` — a fundação para as migrations reusarem o
 * caminho de código exato, em vez de re-derivar um validador
 * potencialmente mais fraco.
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

describe('buildJsonSchemaValidator — paridade com Model#validator (unit, sem driver)', () => {
  it('injeta additionalProperties: false no topo do schema', () => {
    const { validator } = buildJsonSchemaValidator({ schema });

    expect(validator.$jsonSchema.additionalProperties).toBe(false);
  });

  it('injeta _id com bsonType objectId', () => {
    const { validator } = buildJsonSchemaValidator({ schema });

    expect(validator.$jsonSchema.properties?._id).toMatchObject({
      bsonType: 'objectId',
    });
  });

  it("inclui '_id' em required junto com os campos required originais", () => {
    const { validator } = buildJsonSchemaValidator({ schema });

    expect(validator.$jsonSchema.required).toEqual(
      expect.arrayContaining(['name', '_id'])
    );
  });

  it('não muta o schema original do chamador', () => {
    const original = structuredClone(schema);

    buildJsonSchemaValidator({ schema });

    expect(schema).toEqual(original);
  });

  it('produz um validador byte-idêntico ao exposto por Model#validator para o mesmo schema', () => {
    const db = new Database({
      uri: process.env.MONGODB_URI,
      dbName: process.env.MONGODB_DB_NAME,
    });
    // Apenas para satisfazer Model.hasDatabase() — NÃO precisa de connect()
    // para construir o validador (mesmo padrão de test/model/connection-required.test.ts).
    void db;

    const model = new Model<Doc>({
      collectionName: 'database_extraction_parity',
      allowedMethods: [METHODS.FIND],
      schema,
    });

    const { validationAction, validationLevel, validator } =
      buildJsonSchemaValidator({ schema });

    expect(model.validationAction).toBe(validationAction);
    expect(model.validationLevel).toBe(validationLevel);
    expect(model.validator).toEqual(validator);
  });
});
