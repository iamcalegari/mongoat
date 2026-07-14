import { Document } from 'mongodb';
import { beforeEach, describe, expect, it } from 'vitest';

import { Database } from '@/database';
import { MongoatError, MongoatValidationError } from '@/errors';
import { Model } from '@/model';
import { Post, Pre, Prop, Schema } from '@/schema';
import { CreateModelProps } from '@/types';
import { METHODS } from '@/utils/enums';

/**
 * D-14: `@Pre('metodoInexistente', fn)`/`@Post('metodoInexistente', fn)`
 * estouram `MongoatValidationError` com `code: 'INVALID_HOOK_METHOD'` já na
 * DECORAÇÃO (avaliação da classe), não no `compile`/construção do `Model`.
 *
 * D-10: `@Post` aplicado a um CAMPO (em vez de classe) lança
 * `MongoatValidationError` — post por campo não tem semântica clara.
 *
 * WR-04 (estendido do Plano 06-02): re-registrar uma classe decorada com
 * `@Pre` sobre um `collectionName` já registrado lança
 * `MODEL_CONFIG_CONFLICT` — o hook nunca é descartado em silêncio.
 */
interface Doc extends Document {
  name?: string;
}

function expectHookDecorationToThrow(declare: () => void): unknown {
  let caughtError: unknown;

  try {
    declare();
    expect.unreachable('a decoração deveria ter lançado');
  } catch (err) {
    caughtError = err;
  }

  return caughtError;
}

describe('Erros de decoração de hooks (D-14/D-10)', () => {
  it('@Pre com um método inexistente lança MongoatValidationError com code INVALID_HOOK_METHOD já na decoração', () => {
    const caughtError = expectHookDecorationToThrow(() => {
      @Schema('hook_decoration_errors_pre_invalid_method')
      class BadSchema {
        @Pre('metodoInexistente', () => {})
        @Prop({ bsonType: 'string' })
        name?: string;
      }

      void BadSchema;
    });

    expect(caughtError).toBeInstanceOf(MongoatValidationError);
    expect((caughtError as MongoatValidationError).code).toBe(
      'INVALID_HOOK_METHOD'
    );
  });

  it('@Post com um método inexistente lança MongoatValidationError com code INVALID_HOOK_METHOD já na decoração', () => {
    const caughtError = expectHookDecorationToThrow(() => {
      @Post('metodoInexistente', () => {})
      @Schema('hook_decoration_errors_post_invalid_method')
      class BadSchema {
        @Prop({ bsonType: 'string' })
        name?: string;
      }

      void BadSchema;
    });

    expect(caughtError).toBeInstanceOf(MongoatValidationError);
    expect((caughtError as MongoatValidationError).code).toBe(
      'INVALID_HOOK_METHOD'
    );
  });

  it('@Post aplicado a um CAMPO lança MongoatValidationError (post por campo não tem semântica clara — D-10)', () => {
    const caughtError = expectHookDecorationToThrow(() => {
      @Schema('hook_decoration_errors_post_on_field')
      class BadSchema {
        @Post(METHODS.INSERT, () => {})
        @Prop({ bsonType: 'string' })
        name?: string;
      }

      void BadSchema;
    });

    expect(caughtError).toBeInstanceOf(MongoatValidationError);
  });

  describe('WR-04 estendido: hook decorado (@Pre) em re-registração do mesmo collectionName', () => {
    beforeEach(() => {
      Database.resetRegistry();

      if (!Model.hasDatabase()) {
        new Database({
          uri: process.env.MONGODB_URI,
          dbName: process.env.MONGODB_DB_NAME,
        });
      }
    });

    it('re-registrar classe decorada com @Pre sobre collectionName existente lança MODEL_CONFIG_CONFLICT', () => {
      new Model<Doc>({
        collectionName: 'hook_decoration_errors_wr04',
        allowedMethods: [METHODS.FIND],
        schema: {
          bsonType: 'object',
          properties: { name: { bsonType: 'string' } },
          required: ['name'],
        },
      });

      @Schema()
      class DecoratedWithHook {
        @Pre(METHODS.INSERT, () => {})
        @Prop({ bsonType: 'string' })
        name?: string;
      }

      let caughtError: unknown;

      try {
        new Model<Doc>({
          collectionName: 'hook_decoration_errors_wr04',
          allowedMethods: [METHODS.FIND],
          schema: DecoratedWithHook,
        } as unknown as CreateModelProps<Doc>);
      } catch (err) {
        caughtError = err;
      }

      expect(caughtError).toBeInstanceOf(MongoatError);
      expect((caughtError as MongoatError).code).toBe('MODEL_CONFIG_CONFLICT');
    });
  });
});
