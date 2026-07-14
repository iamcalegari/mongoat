import { describe, expect, it } from 'vitest';

import { MongoatValidationError } from '@/errors';
import { Prop, Schema } from '@/schema';
import { ModelValidationSchema } from '@/types';

/**
 * Equivalência DECO-03: `Schema.compile(ClasseDecorada)` produz um
 * `ModelValidationSchema` byte-a-byte igual (via stableStringify) ao objeto
 * plano equivalente escrito à mão — as duas APIs (decorators e objetos)
 * compilam para exatamente o mesmo validator.
 *
 * Testes puros de unidade (sem Mongo real): o compile é uma transformação
 * pura de metadata → schema. Rodam sob vitest/esbuild, que lowera
 * decorators TC39 nativamente — a cadeia de BUILD de produção é coberta à
 * parte por scripts/smoke-decorators.mjs.
 */

/**
 * Mesmo algoritmo do stableStringify interno de src/model/index.ts (WR-05):
 * chaves de objetos planos ordenadas, arrays preservados. Reimplementado
 * localmente porque o original é privado do módulo model — e o teste quer
 * exatamente a comparação estrutural byte-a-byte, não `toEqual`.
 */
function stableStringify(value: unknown): string {
  return JSON.stringify(value, (_key, val) =>
    val && typeof val === 'object' && !Array.isArray(val)
      ? Object.keys(val as Record<string, unknown>)
          .sort()
          .reduce((acc: Record<string, unknown>, key) => {
            acc[key] = (val as Record<string, unknown>)[key];
            return acc;
          }, {})
      : val
  );
}

describe('Schema.compile — equivalência com a API de objetos (DECO-03)', () => {
  it('produz um ModelValidationSchema byte-a-byte igual ao objeto plano equivalente', () => {
    @Schema('users')
    class UserSchema {
      @Prop({ bsonType: 'string', description: 'Username of the user' })
      username?: string;

      @Prop({
        bsonType: 'string',
        pattern: '^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\\.[a-zA-Z0-9-.]+$',
      })
      mail?: string;

      @Prop({ bsonType: ['int', 'null'] })
      age?: number;
    }

    const plainEquivalent: ModelValidationSchema = {
      bsonType: 'object',
      properties: {
        username: { bsonType: 'string', description: 'Username of the user' },
        mail: {
          bsonType: 'string',
          pattern: '^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\\.[a-zA-Z0-9-.]+$',
        },
        age: { bsonType: ['int', 'null'] },
      },
      required: ['username', 'mail', 'age'],
    };

    expect(stableStringify(Schema.compile(UserSchema))).toBe(
      stableStringify(plainEquivalent)
    );
  });

  it('campo com @Prop entra em required; campo sem decorator fica fora do schema', () => {
    @Schema('partial')
    class PartialSchema {
      @Prop({ bsonType: 'string' })
      decorated?: string;

      undecorated?: string;
    }

    const compiled = Schema.compile(PartialSchema);

    expect(Object.keys(compiled.properties ?? {})).toEqual(['decorated']);
    expect(compiled.required).toEqual(['decorated']);
    expect(compiled.properties).not.toHaveProperty('undecorated');
  });

  it('@Prop sem bsonType produz property sem bsonType (sem default mágico)', () => {
    @Schema('loose')
    class LooseSchema {
      @Prop({ description: 'x' })
      free?: unknown;
    }

    const compiled = Schema.compile(LooseSchema);
    const freeProperty = (
      compiled.properties as unknown as Record<string, Record<string, unknown>>
    ).free;

    expect(freeProperty).toEqual({ description: 'x' });
    expect(freeProperty).not.toHaveProperty('bsonType');
  });

  it('classe sem @Schema/sem metadata lança INVALID_DECORATED_CLASS', () => {
    class NotDecorated {
      name?: string;
    }

    try {
      Schema.compile(NotDecorated);
      expect.unreachable('Schema.compile deveria ter lançado');
    } catch (err) {
      expect(err).toBeInstanceOf(MongoatValidationError);
      expect((err as MongoatValidationError).code).toBe(
        'INVALID_DECORATED_CLASS'
      );
    }
  });

  it('mutar o schema compilado não contamina compilações seguintes (clone do metadata)', () => {
    @Schema('cloned')
    class ClonedSchema {
      @Prop({ bsonType: 'string' })
      name?: string;
    }

    const first = Schema.compile(ClonedSchema);
    (first.properties as unknown as Record<string, Record<string, unknown>>).name.mutated =
      true;
    first.required?.push('injected' as never);

    const second = Schema.compile(ClonedSchema);

    expect(
      (second.properties as unknown as Record<string, Record<string, unknown>>).name
    ).toEqual({ bsonType: 'string' });
    expect(second.required).toEqual(['name']);
  });
});
