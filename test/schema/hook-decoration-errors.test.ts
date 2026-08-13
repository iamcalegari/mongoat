import { Document } from 'mongodb';
import { beforeEach, describe, expect, it } from 'vitest';

import { Database } from '@/database';
import { MongoatError, MongoatValidationError } from '@/errors';
import { Model } from '@/model';
import { Post, Pre, Prop, Schema } from '@/schema';
import { CreateModelProps } from '@/types';
import { METHODS } from '@/utils/enums';

/**
 * `@Pre('metodoInexistente', fn)`/`@Post('metodoInexistente', fn)`
 * estouram `MongoatValidationError` com `code: 'INVALID_HOOK_METHOD'` já na
 * DECORAÇÃO (avaliação da classe), não no `compile`/construção do `Model`.
 *
 * `@Post` aplicado a um CAMPO (em vez de classe) lança
 * `MongoatValidationError` — post por campo não tem semântica clara.
 *
 * Re-registrar uma classe decorada com
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

describe('Erros de decoração de hooks', () => {
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

  it('@Post aplicado a um CAMPO lança MongoatValidationError (post por campo não tem semântica clara)', () => {
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

  describe('hook decorado (@Pre) em re-registração do mesmo collectionName', () => {
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

    it('re-registrar a MESMA referência de classe decorada com @Pre, resto idêntico, devolve a instância existente sem duplicar o hook', () => {
      @Schema()
      class DecoratedWithHookReused {
        @Pre(METHODS.INSERT, () => {})
        @Prop({ bsonType: 'string' })
        name?: string;
      }

      const first = new Model<Doc>({
        collectionName: 'hook_decoration_errors_reuse_same_class',
        allowedMethods: [METHODS.FIND],
        schema: DecoratedWithHookReused,
      } as unknown as CreateModelProps<Doc>);

      const hookCountAfterFirstConstruction =
        first.hooks[METHODS.INSERT].pre.length;

      const second = new Model<Doc>({
        collectionName: 'hook_decoration_errors_reuse_same_class',
        allowedMethods: [METHODS.FIND],
        schema: DecoratedWithHookReused,
      } as unknown as CreateModelProps<Doc>);

      expect(second).toBe(first);
      // O hook decorado não foi re-registrado numa segunda passagem pelo
      // construtor — o comprimento do array continua o mesmo de depois da
      // primeira construção.
      expect(second.hooks[METHODS.INSERT].pre).toHaveLength(
        hookCountAfterFirstConstruction
      );
    });

    it('re-registrar com uma classe decorada DIFERENTE (mesmo corpo de hook, mesmo shape de schema) continua lançando MODEL_CONFIG_CONFLICT', () => {
      @Schema()
      class DecoratedWithHookA {
        @Pre(METHODS.INSERT, () => {})
        @Prop({ bsonType: 'string' })
        name?: string;
      }

      @Schema()
      class DecoratedWithHookB {
        @Pre(METHODS.INSERT, () => {})
        @Prop({ bsonType: 'string' })
        name?: string;
      }

      new Model<Doc>({
        collectionName: 'hook_decoration_errors_distinct_classes',
        allowedMethods: [METHODS.FIND],
        schema: DecoratedWithHookA,
      } as unknown as CreateModelProps<Doc>);

      let caughtError: unknown;

      try {
        new Model<Doc>({
          collectionName: 'hook_decoration_errors_distinct_classes',
          allowedMethods: [METHODS.FIND],
          schema: DecoratedWithHookB,
        } as unknown as CreateModelProps<Doc>);
      } catch (err) {
        caughtError = err;
      }

      expect(caughtError).toBeInstanceOf(MongoatError);
      expect((caughtError as MongoatError).code).toBe('MODEL_CONFIG_CONFLICT');
    });

    it('re-registrar a MESMA classe decorada, mas com props.hooks também declarado na segunda construção, continua lançando MODEL_CONFIG_CONFLICT', () => {
      @Schema()
      class DecoratedWithHookAndPropsHooks {
        @Pre(METHODS.INSERT, () => {})
        @Prop({ bsonType: 'string' })
        name?: string;
      }

      new Model<Doc>({
        collectionName: 'hook_decoration_errors_props_hooks_asymmetry',
        allowedMethods: [METHODS.FIND],
        schema: DecoratedWithHookAndPropsHooks,
      } as unknown as CreateModelProps<Doc>);

      let caughtError: unknown;

      try {
        new Model<Doc>({
          collectionName: 'hook_decoration_errors_props_hooks_asymmetry',
          allowedMethods: [METHODS.FIND],
          schema: DecoratedWithHookAndPropsHooks,
          hooks: {
            [METHODS.FIND]: {
              pre: [() => {}],
            },
          },
        } as unknown as CreateModelProps<Doc>);
      } catch (err) {
        caughtError = err;
      }

      // A liberação por identidade de classe (caso anterior) não alcança
      // `props.hooks` — a mesma referência de classe decorada não basta
      // quando o candidato TAMBÉM declara hooks pela via de config.
      expect(caughtError).toBeInstanceOf(MongoatError);
      expect((caughtError as MongoatError).code).toBe('MODEL_CONFIG_CONFLICT');
    });
  });
});
