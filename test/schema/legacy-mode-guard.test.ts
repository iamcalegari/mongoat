import { describe, expect, it } from 'vitest';

import { MongoatValidationError } from '@/errors';
import { Prop, Schema } from '@/schema';

/**
 * Guard de modo legado: com `experimentalDecorators: true` o decorator é
 * chamado com a assinatura antiga `(target, propertyKey, descriptor)` — sem
 * o objeto de contexto TC39 com `.kind`. O guard falha alto e cedo
 * (LEGACY_DECORATORS_MODE) em vez de produzir um schema vazio/quebrado em
 * silêncio.
 */

function expectLegacyModeError(fn: () => void): void {
  try {
    fn();
    expect.unreachable('decorator deveria ter lançado LEGACY_DECORATORS_MODE');
  } catch (err) {
    expect(err).toBeInstanceOf(MongoatValidationError);
    expect((err as MongoatValidationError).code).toBe('LEGACY_DECORATORS_MODE');
  }
}

describe('guard de modo legado (LEGACY_DECORATORS_MODE)', () => {
  it('Prop chamado com a assinatura legada (target, propertyKey) lança', () => {
    const decorator = Prop({ bsonType: 'string' }) as unknown as (
      target: unknown,
      propertyKey: unknown
    ) => void;

    expectLegacyModeError(() => decorator('target', 'propertyKey'));
  });

  it('Prop chamado com contexto objeto sem .kind também lança', () => {
    const decorator = Prop({ bsonType: 'string' }) as unknown as (
      value: unknown,
      context: unknown
    ) => void;

    expectLegacyModeError(() => decorator(undefined, {}));
  });

  it('Schema chamado com a assinatura legada (só target) lança', () => {
    const decorator = Schema('users') as unknown as (
      target: unknown,
      context?: unknown
    ) => void;

    expectLegacyModeError(() => decorator(class {}));
  });
});
