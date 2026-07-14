import { Document } from 'mongodb';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { Database } from '@/database';
import { MongoatDriverError } from '@/errors';
import { Model } from '@/model';
import { Prop, Schema } from '@/schema';
import { CreateModelProps, ModelValidationSchema } from '@/types';
import { METHODS } from '@/utils/enums';

/**
 * Paridade DECO-03/DECO-04 contra MongoDB real: um Model construído com
 * classe decorada valida/rejeita documentos exatamente como o Model
 * equivalente construído com objeto plano — mesmo comportamento do
 * `$jsonSchema` do servidor para os dois caminhos.
 */
interface Doc extends Document {
  username?: string;
  age?: number;
}

@Schema('parity_decorated')
class UserSchema {
  @Prop({ bsonType: 'string' })
  username?: string;

  @Prop({ bsonType: 'int' })
  age?: number;
}

const plainSchema: ModelValidationSchema = {
  bsonType: 'object',
  properties: {
    username: { bsonType: 'string' },
    age: { bsonType: 'int' },
  },
  required: ['username', 'age'],
};

describe('Model — paridade classe decorada vs objeto plano contra MongoDB real (DECO-03/DECO-04)', () => {
  let db: Database;
  let decoratedModel: Model<Doc>;
  let plainModel: Model<Doc>;

  beforeAll(async () => {
    db = new Database({
      uri: process.env.MONGODB_URI,
      dbName: process.env.MONGODB_DB_NAME,
    });

    await db.connect();

    decoratedModel = new Model<Doc>({
      schema: UserSchema,
      allowedMethods: [METHODS.INSERT],
    } as unknown as CreateModelProps<Doc>);

    plainModel = new Model<Doc>({
      collectionName: 'parity_plain',
      schema: plainSchema,
      allowedMethods: [METHODS.INSERT],
    });

    await db.setupCollection(decoratedModel as unknown as Model);
    await db.setupCollection(plainModel as unknown as Model);
  });

  afterAll(async () => {
    Database.resetRegistry();
    await db.disconnect();
  });

  it('documento válido é aceito identicamente por ambos os models', async () => {
    const validDoc = { username: 'alice', age: 30 };

    const decoratedInserted = await decoratedModel.insert({ ...validDoc });
    const plainInserted = await plainModel.insert({ ...validDoc });

    expect(decoratedInserted.username).toBe('alice');
    expect(decoratedInserted.age).toBe(30);
    expect(plainInserted.username).toBe('alice');
    expect(plainInserted.age).toBe(30);
  });

  it('documento inválido (tipo errado) é rejeitado identicamente pelos dois — mesmo comportamento do $jsonSchema', async () => {
    const invalidDoc = { username: 'bob', age: 'not-a-number' };

    await expect(
      decoratedModel.insert(invalidDoc as unknown as Doc)
    ).rejects.toThrow(MongoatDriverError);

    await expect(
      plainModel.insert(invalidDoc as unknown as Doc)
    ).rejects.toThrow(MongoatDriverError);
  });

  it('documento inválido (campo required ausente) é rejeitado identicamente pelos dois', async () => {
    const missingRequiredDoc = { username: 'carol' };

    await expect(
      decoratedModel.insert(missingRequiredDoc as unknown as Doc)
    ).rejects.toThrow(MongoatDriverError);

    await expect(
      plainModel.insert(missingRequiredDoc as unknown as Doc)
    ).rejects.toThrow(MongoatDriverError);
  });
});
