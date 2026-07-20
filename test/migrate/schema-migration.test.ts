import { CollectionInfo, Db, Document } from 'mongodb';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { Database } from '@/database';
import { MongoatValidationError } from '@/errors';
import { createMigrationSchemaHelpers } from '@/migrate/schema-helpers';
import { Model } from '@/model';
import { ModelValidationSchema, ValidationQueryExpressions } from '@/types';
import { METHODS } from '@/utils/enums';

/**
 * Proves a migration applying a validator/index set via
 * `ctx.schema.*` produces the SAME `$jsonSchema`/managed indexes `Model`
 * itself applies — for all three target shapes (`Model` instance, raw
 * `ModelValidationSchema` object; the decorated-class shape is exercised by
 * the same `Schema.compile` -> `buildJsonSchemaValidator` code path, already
 * unit-proven at the `Model` constructor level).
 */
interface Doc extends Document {
  email: string;
  name: string;
}

const schema: ModelValidationSchema = {
  bsonType: 'object',
  properties: {
    email: { bsonType: 'string' },
    name: { bsonType: 'string' },
  },
  required: ['name', 'email'],
};

async function getCollectionOptions(
  db: Db,
  collectionName: string
): Promise<Document | undefined> {
  const [info] = await db
    .listCollections<CollectionInfo>({ name: collectionName })
    .toArray();

  return info?.options;
}

describe('createMigrationSchemaHelpers — validator/index parity with Model', () => {
  let db: Database;
  let nativeDb: Db;
  let model: Model<Doc>;

  beforeAll(async () => {
    db = new Database({
      uri: process.env.MONGODB_URI,
      dbName: process.env.MONGODB_DB_NAME,
    });

    await db.connect();
    Model.setDatabase(db);

    model = new Model<Doc>({
      collectionName: 'schema_migration_model',
      allowedMethods: [METHODS.FIND],
      indexes: [{ key: { email: 1 }, name: 'email_idx', unique: true }],
      schema,
    });

    await db.setupCollection(model as unknown as Model);

    nativeDb = db.getDb() as Db;
  });

  afterAll(async () => {
    Database.resetRegistry();
    await db.disconnect();
  });

  it('applyValidator(collectionName, model) applies a byte-identical $jsonSchema to the Model-applied one', async () => {
    await nativeDb.createCollection('schema_migration_other');

    const helpers = createMigrationSchemaHelpers(nativeDb);
    await helpers.applyValidator(
      'schema_migration_other',
      model as unknown as Model
    );

    const modelOptions = await getCollectionOptions(
      nativeDb,
      'schema_migration_model'
    );
    const migrationOptions = await getCollectionOptions(
      nativeDb,
      'schema_migration_other'
    );

    expect(migrationOptions?.validator).toEqual(modelOptions?.validator);
    expect(migrationOptions?.validationAction).toEqual(
      modelOptions?.validationAction
    );
    expect(migrationOptions?.validationLevel).toEqual(
      modelOptions?.validationLevel
    );
  });

  it('applyValidator(collectionName, rawSchema) augments _id/additionalProperties/required exactly like Model', async () => {
    await nativeDb.createCollection('schema_migration_raw');

    const helpers = createMigrationSchemaHelpers(nativeDb);
    await helpers.applyValidator('schema_migration_raw', schema);

    const rawOptions = await getCollectionOptions(
      nativeDb,
      'schema_migration_raw'
    );
    const jsonSchema = rawOptions?.validator?.$jsonSchema;

    expect(jsonSchema.additionalProperties).toBe(false);
    expect(jsonSchema.properties._id).toBeDefined();
    expect(jsonSchema.required).toContain('_id');

    // The raw-schema target and the Model target share the same underlying
    // schema content — their fully-applied validators must be identical.
    const modelOptions = await getCollectionOptions(
      nativeDb,
      'schema_migration_model'
    );
    expect(rawOptions?.validator).toEqual(modelOptions?.validator);
  });

  it('applyIndexes(collectionName, model) creates the declared managed index', async () => {
    await nativeDb.createCollection('schema_migration_indexes');

    const helpers = createMigrationSchemaHelpers(nativeDb);
    await helpers.applyIndexes(
      'schema_migration_indexes',
      model as unknown as Model
    );

    const indexes = await nativeDb
      .collection('schema_migration_indexes')
      .listIndexes()
      .toArray();

    const emailIndex = indexes.find((index) => index.name === 'email_idx');

    expect(emailIndex).toBeDefined();
    expect(emailIndex?.unique).toBe(true);
  });

  it('applyValidator(collectionName, rawSchema, { validationQueryExpressions }) has real parity with an equivalent Model', async () => {
    const validationQueryExpressions: ValidationQueryExpressions = {
      $or: [{ email: { $exists: true } }, { name: { $exists: true } }],
    };

    const modelWithExpressions = new Model<Doc>({
      collectionName: 'schema_migration_model_expr',
      allowedMethods: [METHODS.FIND],
      schema,
      validationQueryExpressions,
    });

    await db.setupCollection(modelWithExpressions as unknown as Model);

    await nativeDb.createCollection('schema_migration_raw_expr');

    const helpers = createMigrationSchemaHelpers(nativeDb);
    await helpers.applyValidator('schema_migration_raw_expr', schema, {
      validationQueryExpressions,
    });

    const modelOptions = await getCollectionOptions(
      nativeDb,
      'schema_migration_model_expr'
    );
    const rawOptions = await getCollectionOptions(
      nativeDb,
      'schema_migration_raw_expr'
    );

    // The expression key is present at the top level, alongside $jsonSchema —
    // proves is closed (no longer silently dropped).
    expect(rawOptions?.validator?.$or).toBeDefined();

    // Byte-for-byte parity with the Model-applied validator.
    expect(rawOptions?.validator).toEqual(modelOptions?.validator);
  });

  it('applyValidator(collectionName, model, { validationQueryExpressions }) fails loud with MIGRATION_VALIDATOR_OPTIONS_CONFLICT', async () => {
    const helpers = createMigrationSchemaHelpers(nativeDb);

    await expect(
      helpers.applyValidator(
        'schema_migration_model',
        model as unknown as Model,
        {
          validationQueryExpressions: { $or: [{ email: { $exists: true } }] },
        }
      )
    ).rejects.toMatchObject({
      code: 'MIGRATION_VALIDATOR_OPTIONS_CONFLICT',
    });

    await expect(
      helpers.applyValidator(
        'schema_migration_model',
        model as unknown as Model,
        {
          validationQueryExpressions: { $or: [{ email: { $exists: true } }] },
        }
      )
    ).rejects.toBeInstanceOf(MongoatValidationError);
  });

  it('applyIndexes(collectionName, rawSchema) is a documented no-op — no index metadata to derive', async () => {
    await nativeDb.createCollection('schema_migration_raw_indexes');

    const helpers = createMigrationSchemaHelpers(nativeDb);
    await helpers.applyIndexes('schema_migration_raw_indexes', schema);

    const indexes = await nativeDb
      .collection('schema_migration_raw_indexes')
      .listIndexes()
      .toArray();

    // Only the implicit `_id_` index survives — no managed index was applied.
    expect(indexes.map((index) => index.name)).toEqual(['_id_']);
  });
});
