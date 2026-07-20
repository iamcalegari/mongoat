import { Document } from 'mongodb';
import { beforeEach, describe, expect, it } from 'vitest';

import { Database } from '@/database';
import { MongoatValidationError } from '@/errors';
import { Model } from '@/model';
import { Prop, Schema } from '@/schema';
import { CreateModelProps, ModelValidationSchema } from '@/types';
import { METHODS } from '@/utils/enums';

/**
 * Detecção classe-decorada vs objeto-plano no construtor do Model +
 * collectionName default de @Schema.
 *
 * Testes puros de unidade (sem Mongo real) — só o SHAPE do validator e o
 * collectionName resolvido importam aqui; a paridade de validação contra
 * MongoDB real fica em decorated-vs-plain-parity.test.ts.
 *
 * `as unknown as CreateModelProps<Doc>` é usado deliberadamente: o cast
 * mantém `npm run typecheck` verde independentemente de `schema` aceitar
 * ou não uma classe decorada em `CreateModelProps` (a asserção segue
 * válida mesmo quando o cast deixa de ser estritamente necessário).
 */
interface Doc extends Document {
  username?: string;
  age?: number;
}

describe('Model — construtor aceita classe decorada OU objeto plano', () => {
  beforeEach(() => {
    Database.resetRegistry();

    if (!Model.hasDatabase()) {
      new Database({
        uri: process.env.MONGODB_URI,
        dbName: process.env.MONGODB_DB_NAME,
      });
    }
  });

  it('classe decorada e objeto plano equivalente produzem o MESMO validator', () => {
    @Schema('parity_users')
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

    const decoratedModel = new Model<Doc>({
      schema: UserSchema,
      allowedMethods: [METHODS.FIND],
    } as unknown as CreateModelProps<Doc>);

    const plainModel = new Model<Doc>({
      collectionName: 'parity_users_plain',
      schema: plainSchema,
      allowedMethods: [METHODS.FIND],
    });

    expect(decoratedModel.validator).toEqual(plainModel.validator);
  });

  it('classe decorada sem collectionName no config herda o default de @Schema', () => {
    @Schema('parity_default_name')
    class DefaultNameSchema {
      @Prop({ bsonType: 'string' })
      name?: string;
    }

    const model = new Model<Doc>({
      schema: DefaultNameSchema,
      allowedMethods: [METHODS.FIND],
    } as unknown as CreateModelProps<Doc>);

    expect(model.collectionName).toBe('parity_default_name');
  });

  it('collectionName no config sobrescreve o default de @Schema', () => {
    @Schema('parity_overridden_default')
    class OverriddenSchema {
      @Prop({ bsonType: 'string' })
      name?: string;
    }

    const model = new Model<Doc>({
      collectionName: 'parity_override_wins',
      schema: OverriddenSchema,
      allowedMethods: [METHODS.FIND],
    } as unknown as CreateModelProps<Doc>);

    expect(model.collectionName).toBe('parity_override_wins');
  });

  it('classe decorada sem collectionName no config nem em @Schema lança MongoatValidationError', () => {
    @Schema()
    class UnnamedSchema {
      @Prop({ bsonType: 'string' })
      name?: string;
    }

    let caughtError: unknown;

    try {
      new Model<Doc>({
        schema: UnnamedSchema,
        allowedMethods: [METHODS.FIND],
      } as unknown as CreateModelProps<Doc>);
    } catch (err) {
      caughtError = err;
    }

    expect(caughtError).toBeInstanceOf(MongoatValidationError);
    expect((caughtError as Error).message).toMatch(/collectionName/);
  });
});
