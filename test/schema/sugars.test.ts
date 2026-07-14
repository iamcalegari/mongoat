import { describe, expect, it } from 'vitest';

import {
  BsonType,
  Description,
  Enum,
  Max,
  MaxLength,
  Min,
  MinLength,
  Optional,
  Pattern,
  Prop,
  Schema,
} from '@/schema';
import { ModelValidationSchema } from '@/types';

/**
 * D-02/DECO-01: cada açúcar (`@BsonType`, `@Description`, `@Pattern`,
 * `@Optional`, `@Enum`, `@Min`/`@Max`, `@MinLength`/`@MaxLength`) compõe
 * `@Prop` — uma função fina que retorna `Prop({ ...fragment })`. Testes
 * puros de unidade (sem Mongo real), rodam sob vitest/babel (mesma cadeia
 * do build de produção — ver vitest.config.ts).
 */

/**
 * Mesmo algoritmo do stableStringify de test/schema/compile-equivalence.test.ts
 * (WR-05) — reimplementado localmente por ser privado do módulo model.
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

describe('Açúcares compondo @Prop (D-02)', () => {
  it('@BsonType/@Description/@Pattern produzem o fragmento correto na property do campo', () => {
    @Schema('sugars-basic')
    class BasicSugars {
      @BsonType('string')
      name?: string;

      @Description('a description')
      @Prop({ bsonType: 'string' })
      described?: string;

      @Pattern('^abc')
      @Prop({ bsonType: 'string' })
      patterned?: string;
    }

    const compiled = Schema.compile(BasicSugars);

    expect(compiled.properties?.name).toEqual({ bsonType: 'string' });
    expect(compiled.properties?.described).toEqual({
      bsonType: 'string',
      description: 'a description',
    });
    expect(compiled.properties?.patterned).toEqual({
      bsonType: 'string',
      pattern: '^abc',
    });
  });

  it('@Optional() remove o campo de required; sem @Optional o campo permanece required', () => {
    @Schema('sugars-optional')
    class OptionalSugars {
      @Prop({ bsonType: 'string' })
      required1?: string;

      @Optional()
      @Prop({ bsonType: 'string' })
      optional1?: string;

      // Ordem inversa (@Prop antes de @Optional no mesmo campo) — a
      // remoção de `required` deve ser idempotente independentemente da
      // ordem textual dos decorators.
      @Prop({ bsonType: 'string' })
      @Optional()
      optional2?: string;
    }

    const compiled = Schema.compile(OptionalSugars);

    expect(compiled.required).toContain('required1');
    expect(compiled.required).not.toContain('optional1');
    expect(compiled.required).not.toContain('optional2');
  });

  it('@Enum/@Min/@Max/@MinLength/@MaxLength produzem enum/minimum/maximum/minLength/maxLength', () => {
    @Schema('sugars-constraints')
    class ConstraintSugars {
      @Enum(['a', 'b', 'c'])
      @Prop({ bsonType: 'string' })
      choice?: string;

      @Min(1)
      @Max(10)
      @Prop({ bsonType: 'int' })
      count?: number;

      @MinLength(2)
      @MaxLength(20)
      @Prop({ bsonType: 'string' })
      label?: string;
    }

    const compiled = Schema.compile(ConstraintSugars);

    expect(compiled.properties?.choice).toEqual({
      bsonType: 'string',
      enum: ['a', 'b', 'c'],
    });
    expect(compiled.properties?.count).toEqual({
      bsonType: 'int',
      minimum: 1,
      maximum: 10,
    });
    expect(compiled.properties?.label).toEqual({
      bsonType: 'string',
      minLength: 2,
      maxLength: 20,
    });
  });

  it('múltiplos açúcares no mesmo campo compõem um único fragmento agregado', () => {
    @Schema('sugars-compose')
    class ComposeSugars {
      @BsonType('string')
      @Pattern('^x')
      @Description('composed field')
      field?: string;
    }

    const compiled = Schema.compile(ComposeSugars);

    expect(compiled.properties?.field).toEqual({
      bsonType: 'string',
      pattern: '^x',
      description: 'composed field',
    });
  });

  it('equivalência DECO-03: Schema.compile com açúcares é byte-a-byte igual ao objeto plano equivalente', () => {
    @Schema('sugars-equivalence')
    class EquivalenceSchema {
      @BsonType('string')
      @Description('Username')
      username?: string;

      @Optional()
      @Pattern('^[a-z]+$')
      @BsonType('string')
      nickname?: string;

      @Enum(['admin', 'user'])
      @BsonType('string')
      role?: string;

      @Min(0)
      @Max(120)
      @BsonType('int')
      age?: number;
    }

    const plainEquivalent: ModelValidationSchema = {
      bsonType: 'object',
      properties: {
        username: { bsonType: 'string', description: 'Username' },
        nickname: { bsonType: 'string', pattern: '^[a-z]+$' },
        role: { bsonType: 'string', enum: ['admin', 'user'] },
        age: { bsonType: 'int', minimum: 0, maximum: 120 },
      },
      required: ['username', 'role', 'age'],
    };

    expect(stableStringify(Schema.compile(EquivalenceSchema))).toBe(
      stableStringify(plainEquivalent)
    );
  });
});
