import { Document, ObjectId } from 'mongodb';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { Database } from '@/database';
import { Model } from '@/model';
import { ModelValidationSchema } from '@/types';
import { METHODS } from '@/utils/enums';

/**
 * Happy-path CRUD por método público contra Mongo real (D-12, Plan 05,
 * Task 3).
 *
 * Cada método público do Model é exercitado uma vez, encadeado (insert →
 * find → findMany → findById → update → updateMany → total → aggregate →
 * bulkWrite → delete → deleteMany), assertando um resultado coerente.
 *
 * `insertMany` não é coberto aqui — já tem sua própria regressão em
 * `insertmany-hooks.test.ts`.
 */
interface Doc extends Document {
  name: string;
  tag: string;
}

const schema: ModelValidationSchema = {
  bsonType: 'object',
  properties: {
    name: { bsonType: 'string' },
    tag: { bsonType: 'string' },
  },
  required: ['name', 'tag'],
};

describe('Model — happy-path CRUD por método público (D-12)', () => {
  let db: Database;
  let model: Model<Doc>;

  beforeAll(async () => {
    db = new Database({
      uri: process.env.MONGODB_URI,
      dbName: process.env.MONGODB_DB_NAME,
      username: 'mongoat',
      password: 'mongoat',
    });

    await db.connect();

    model = new Model<Doc>({
      collectionName: 'crud_happy_path',
      allowedMethods: [
        METHODS.INSERT,
        METHODS.FIND,
        METHODS.FIND_MANY,
        METHODS.FIND_BY_ID,
        METHODS.UPDATE,
        METHODS.UPDATE_MANY,
        METHODS.DELETE,
        METHODS.DELETE_MANY,
        METHODS.TOTAL,
        METHODS.AGGREGATE,
        METHODS.BULK_WRITE,
      ],
      schema,
    });

    await db.setupCollection(model as unknown as Model);
  });

  afterAll(async () => {
    Database.resetRegistry();
    await db.disconnect();
  });

  it('encadeia insert → find → findMany → findById → update → updateMany → total → aggregate → bulkWrite → delete → deleteMany', async () => {
    const inserted = await model.insert({ name: 'alpha', tag: 'crud' });
    expect(inserted.name).toBe('alpha');
    expect(inserted._id).toBeInstanceOf(ObjectId);

    const found = await model.find({ name: 'alpha' });
    expect(found?.name).toBe('alpha');

    const many = await model.findMany({ tag: 'crud' });
    expect(many).toHaveLength(1);

    const byId = await model.findById(inserted._id);
    expect(byId?.name).toBe('alpha');

    const updated = await model.update(
      { _id: inserted._id },
      { $set: { name: 'alpha-updated' } }
    );
    expect(updated?.name).toBe('alpha-updated');

    const bulkInsert = await model.bulkWrite([
      { insertOne: { document: { name: 'beta', tag: 'crud' } } },
      { insertOne: { document: { name: 'gamma', tag: 'crud' } } },
    ]);
    expect(bulkInsert.insertedCount).toBe(2);

    const updatedManyResult = await model.updateMany(
      { tag: 'crud' },
      { $set: { tag: 'crud-updated' } }
    );
    expect(updatedManyResult.modifiedCount).toBe(3);

    const total = await model.total({ tag: 'crud-updated' });
    expect(total).toBe(3);

    const aggregated = await model.aggregate([
      { $match: { tag: 'crud-updated' } },
      { $count: 'total' },
    ]);
    expect(aggregated[0]?.total).toBe(3);

    const deleted = await model.delete({ name: 'alpha-updated' });
    expect(deleted?.name).toBe('alpha-updated');

    const deletedMany = await model.deleteMany({ tag: 'crud-updated' });
    expect(deletedMany.deletedCount).toBe(2);

    const finalTotal = await model.total({ tag: 'crud-updated' });
    expect(finalTotal).toBe(0);
  });
});
