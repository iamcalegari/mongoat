import { describe, expect, it } from 'vitest';

import { BsonType, Description, Prop, Schema } from '@/schema';
import { ModelValidationSchema } from '@/types';

/**
 * D-05/DECO-03: `Schema.compile` recursa em `@Prop({ type: ClasseDecorada })`
 * (subschema aninhado) e `@Prop({ items: ClasseDecorada })` (schema de itens
 * de array), e aceita um subschema JSON Schema inline verbatim como escape
 * hatch — sem recompilar.
 */

/**
 * Mesmo algoritmo do stableStringify de test/schema/compile-equivalence.test.ts
 * (WR-05).
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

describe('Compile recursivo de schemas aninhados/arrays (D-05)', () => {
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

  it('subschema JSON Schema inline é aceito verbatim como escape hatch (D-05)', () => {
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

  it('equivalência DECO-03 com aninhamento: Schema.compile é byte-a-byte igual ao objeto plano equivalente', () => {
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
});
