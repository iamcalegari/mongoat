import { describe, expect, it } from 'vitest';

import { BsonType, Description, Optional, Prop, Schema } from '@/schema';
import { ModelValidationSchema } from '@/types';

/**
 * `Schema.compile` recursa em `@Prop({ type: ClasseDecorada })`
 * (subschema aninhado) e `@Prop({ items: ClasseDecorada })` (schema de itens
 * de array), e aceita um subschema JSON Schema inline verbatim como escape
 * hatch — sem recompilar.
 */

/**
 * Mesmo algoritmo do stableStringify de test/schema/compile-equivalence.test.ts
 *.
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

describe('Compile recursivo de schemas aninhados/arrays', () => {
  it('@Prop({ type: NestedSchemaClass }) compila recursivamente o subschema aninhado', () => {
    @Schema('nested-address')
    class AddressSchema {
      @Prop({ bsonType: 'string' })
      street?: string;

      @Prop({ bsonType: 'string' })
      city?: string;
    }

    @Schema('nested-user-with-address')
    class UserWithAddress {
      @Prop({ bsonType: 'string' })
      name?: string;

      @Prop({ type: AddressSchema })
      address?: AddressSchema;
    }

    const compiled = Schema.compile(UserWithAddress);

    expect(compiled.properties?.address).toEqual({
      bsonType: 'object',
      properties: {
        street: { bsonType: 'string' },
        city: { bsonType: 'string' },
      },
      required: ['street', 'city'],
    });
  });

  it('@Prop({ items: NestedSchemaClass }) compila o schema de itens do array', () => {
    @Schema('nested-tag')
    class TagSchema {
      @Prop({ bsonType: 'string' })
      label?: string;
    }

    @Schema('nested-post-with-tags')
    class PostWithTags {
      @Prop({ bsonType: 'array', items: TagSchema })
      tags?: TagSchema[];
    }

    const compiled = Schema.compile(PostWithTags);

    expect(compiled.properties?.tags).toEqual({
      bsonType: 'array',
      items: {
        bsonType: 'object',
        properties: { label: { bsonType: 'string' } },
        required: ['label'],
      },
    });
  });

  it('subschema JSON Schema inline é aceito verbatim como escape hatch', () => {
    const inlineSubschema: ModelValidationSchema = {
      bsonType: 'object',
      properties: { x: { bsonType: 'int' } },
      required: ['x'],
    };

    @Schema('nested-inline-escape')
    class InlineEscapeSchema {
      @Prop({ type: inlineSubschema })
      point?: unknown;
    }

    const compiled = Schema.compile(InlineEscapeSchema);

    expect(compiled.properties?.point).toEqual(inlineSubschema);
    // Escape hatch verbatim: nenhuma recompilação — mutar o subschema
    // ORIGINAL após o compile não deveria alterar mais nada aqui (só
    // confirma que a referência não foi reaproveitada in-place).
    expect(compiled.properties?.point).not.toBe(inlineSubschema);
  });

  it('equivalência com aninhamento: Schema.compile é byte-a-byte igual ao objeto plano equivalente', () => {
    @Schema('nested-address-2')
    class Address {
      @Prop({ bsonType: 'string' })
      street?: string;
    }

    @Schema('nested-order')
    class Order {
      @Description('order id')
      @BsonType('string')
      id?: string;

      @Prop({ type: Address })
      shippingAddress?: Address;

      @Prop({ bsonType: 'array', items: Address })
      previousAddresses?: Address[];
    }

    const plainEquivalent: ModelValidationSchema = {
      bsonType: 'object',
      properties: {
        id: { bsonType: 'string', description: 'order id' },
        shippingAddress: {
          bsonType: 'object',
          properties: { street: { bsonType: 'string' } },
          required: ['street'],
        },
        previousAddresses: {
          bsonType: 'array',
          items: {
            bsonType: 'object',
            properties: { street: { bsonType: 'string' } },
            required: ['street'],
          },
        },
      },
      required: ['id', 'shippingAddress', 'previousAddresses'],
    };

    expect(stableStringify(Schema.compile(Order))).toBe(
      stableStringify(plainEquivalent)
    );
  });

  it('classe aninhada totalmente opcional via @Prop({ type }) OMITE a chave required (vazia)', () => {
    @Schema('nested-all-optional-type')
    class AllOptionalNested {
      @Optional()
      @Prop({ bsonType: 'string' })
      nickname?: string;

      @Optional()
      @Prop({ bsonType: 'int' })
      age?: number;
    }

    @Schema('nested-parent-all-optional-type')
    class ParentWithAllOptionalNested {
      @Prop({ type: AllOptionalNested })
      profile?: AllOptionalNested;
    }

    const compiled = Schema.compile(ParentWithAllOptionalNested);

    expect(compiled.properties?.profile).toEqual({
      bsonType: 'object',
      properties: {
        nickname: { bsonType: 'string' },
        age: { bsonType: 'int' },
      },
      // Nenhuma chave `required` — deep-equal ao objeto plano equivalente
      // que um dev escreveria à mão para um subschema totalmente opcional.
    });
    expect(compiled.properties?.profile).not.toHaveProperty('required');
  });

  it('classe aninhada totalmente opcional via @Prop({ items }) OMITE a chave required (vazia) em items', () => {
    @Schema('nested-all-optional-items')
    class AllOptionalItem {
      @Optional()
      @Prop({ bsonType: 'string' })
      label?: string;
    }

    @Schema('nested-parent-all-optional-items')
    class ParentWithAllOptionalItems {
      @Prop({ bsonType: 'array', items: AllOptionalItem })
      tags?: AllOptionalItem[];
    }

    const compiled = Schema.compile(ParentWithAllOptionalItems);

    expect(compiled.properties?.tags).toEqual({
      bsonType: 'array',
      items: {
        bsonType: 'object',
        properties: { label: { bsonType: 'string' } },
      },
    });
    expect(
      (compiled.properties?.tags as { items?: Record<string, unknown> })?.items
    ).not.toHaveProperty('required');
  });

  it('não-regressão: subschema aninhado com pelo menos um campo required continua emitindo required', () => {
    @Schema('nested-mixed-required')
    class MixedNested {
      @Prop({ bsonType: 'string' })
      mandatory?: string;

      @Optional()
      @Prop({ bsonType: 'string' })
      optionalField?: string;
    }

    @Schema('nested-parent-mixed-required')
    class ParentWithMixedNested {
      @Prop({ type: MixedNested })
      details?: MixedNested;
    }

    const compiled = Schema.compile(ParentWithMixedNested);

    expect(compiled.properties?.details).toEqual({
      bsonType: 'object',
      properties: {
        mandatory: { bsonType: 'string' },
        optionalField: { bsonType: 'string' },
      },
      required: ['mandatory'],
    });
  });
});
