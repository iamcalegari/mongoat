import { Document } from 'mongodb';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { Database } from '@/database';
import { MongoatDriverError } from '@/errors';
import { Model } from '@/model';
import { Prop, Schema } from '@/schema';
import { CreateModelProps } from '@/types';
import { METHODS } from '@/utils/enums';

/**
 * Defaults por-insert de classe decorada (D-12/D-13) + filtragem de chaves
 * `undefined` (Pitfall 3) — contra MongoDB real.
 *
 * `ItemSchema.createdAt` tem inicializador (`new Date()`), colhido fresco a
 * cada insert (D-12). `requiredNoInit` é required (via @Prop) mas NÃO tem
 * inicializador — se a instância da classe fosse spreadada ingenuamente, a
 * chave entraria no documento com valor `undefined` e o driver a
 * serializaria como BSON `Undefined`; filtrada corretamente, a chave nem
 * aparece no documento e o servidor rejeita por `required` (não por
 * `bsonType`/serialização confusa).
 */
interface Doc extends Document {
  name?: string;
  createdAt?: Date;
  requiredNoInit?: string;
}

@Schema('per_insert_defaults')
class ItemSchema {
  @Prop({ bsonType: 'string' })
  name?: string;

  @Prop({ bsonType: 'date' })
  createdAt?: Date = new Date();

  @Prop({ bsonType: 'string' })
  requiredNoInit?: string;
}

describe('Model — defaults por-insert de classe decorada (D-12/D-13 + Pitfall 3)', () => {
  let db: Database;
  let model: Model<Doc>;

  beforeAll(async () => {
    db = new Database({
      uri: process.env.MONGODB_URI,
      dbName: process.env.MONGODB_DB_NAME,
    });

    await db.connect();

    model = new Model<Doc>({
      schema: ItemSchema,
      allowedMethods: [METHODS.INSERT],
    } as unknown as CreateModelProps<Doc>);

    await db.setupCollection(model as unknown as Model);
  });

  afterAll(async () => {
    Database.resetRegistry();
    await db.disconnect();
  });

  it('dois inserts consecutivos produzem createdAt DIFERENTES (fresco por insert, D-12)', async () => {
    const first = await model.insert({ name: 'a', requiredNoInit: 'x' });
    await new Promise((resolve) => setTimeout(resolve, 5));
    const second = await model.insert({ name: 'b', requiredNoInit: 'y' });

    expect(first.createdAt).toBeInstanceOf(Date);
    expect(second.createdAt).toBeInstanceOf(Date);
    expect(first.createdAt?.getTime()).not.toBe(second.createdAt?.getTime());
  });

  it('precedência D-13: doc do usuário sobrescreve o inicializador da classe', async () => {
    const overriddenByUser = new Date('2020-01-01T00:00:00.000Z');

    const insertedByUser = await model.insert({
      name: 'c',
      requiredNoInit: 'z',
      createdAt: overriddenByUser,
    });

    expect(insertedByUser.createdAt?.getTime()).toBe(
      overriddenByUser.getTime()
    );
  });

  it('precedência D-13: documentDefaults do config sobrescreve o inicializador da classe, mas não o doc do usuário', async () => {
    const configDefault = new Date('2021-01-01T00:00:00.000Z');

    const modelWithConfigDefault = new Model<Doc>({
      collectionName: 'per_insert_defaults_config_override',
      schema: ItemSchema,
      allowedMethods: [METHODS.INSERT],
      documentDefaults: { createdAt: configDefault },
    } as unknown as CreateModelProps<Doc>);

    await db.setupCollection(modelWithConfigDefault as unknown as Model);

    const insertedWithConfigDefault = await modelWithConfigDefault.insert({
      name: 'd',
      requiredNoInit: 'w',
    });

    expect(insertedWithConfigDefault.createdAt?.getTime()).toBe(
      configDefault.getTime()
    );

    const userOverride = new Date('2022-01-01T00:00:00.000Z');

    const insertedWithUserOverride = await modelWithConfigDefault.insert({
      name: 'e',
      requiredNoInit: 'v',
      createdAt: userOverride,
    });

    expect(insertedWithUserOverride.createdAt?.getTime()).toBe(
      userOverride.getTime()
    );
  });

  it('campo required sem inicializador nem valor do usuário falha por required — não por bsonType/serialização de BSON Undefined (Pitfall 3)', async () => {
    let caughtError: unknown;

    try {
      await model.insert({ name: 'missing-required' });
      expect.unreachable('deveria ter lançado');
    } catch (err) {
      caughtError = err;
    }

    expect(caughtError).toBeInstanceOf(MongoatDriverError);

    const cause = (caughtError as MongoatDriverError).cause as
      | {
          errInfo?: {
            details?: {
              schemaRulesNotSatisfied?: {
                operatorName?: string;
                missingProperties?: string[];
              }[];
            };
          };
        }
      | undefined;

    const requiredRule = cause?.errInfo?.details?.schemaRulesNotSatisfied?.find(
      (rule) => rule.operatorName === 'required'
    );

    expect(requiredRule?.missingProperties).toContain('requiredNoInit');
  });
});
