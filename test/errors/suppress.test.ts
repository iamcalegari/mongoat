import { describe, expect, it } from 'vitest';

import { MongoatError } from '@/errors';
import { attachSuppressed, runBestEffort } from '@/errors/suppress';

describe('runBestEffort (unit, sem driver)', () => {
  it('resolve { ok: true } quando a action resolve normalmente', async () => {
    const result = await runBestEffort(async () => {
      // no-op
    });

    expect(result).toEqual({ ok: true });
  });

  it('resolve { ok: false, error } quando a action lança de forma síncrona, e nunca relança', async () => {
    const boom = new Error('boom sync');

    const result = await runBestEffort(() => {
      throw boom;
    });

    expect(result).toEqual({ ok: false, error: boom });
  });

  it('resolve { ok: false, error } quando a promise da action rejeita, e nunca relança', async () => {
    const boom = new Error('boom async');

    const result = await runBestEffort(() => Promise.reject(boom));

    expect(result).toEqual({ ok: false, error: boom });
  });
});

describe('attachSuppressed (unit, sem driver)', () => {
  it('cria o array `.suppressed` no primeiro uso, quando era undefined', () => {
    const primary = new MongoatError('primary failed');
    expect(primary.suppressed).toBeUndefined();

    const secondary = new Error('secondary failed');
    attachSuppressed(primary, secondary);

    expect(primary.suppressed).toEqual([secondary]);
  });

  it('acumula suprimidos em ordem quando chamado 2x no mesmo primary', () => {
    const primary = new MongoatError('primary failed');
    const first = new Error('first secondary');
    const second = new Error('second secondary');

    attachSuppressed(primary, first);
    attachSuppressed(primary, second);

    expect(primary.suppressed).toHaveLength(2);
    expect(primary.suppressed).toEqual([first, second]);
  });

  it('emite exatamente um process warning com `.name === "MongoatSuppressedError"`', async () => {
    const primary = new MongoatError('primary failed');
    const secondary = new Error('secondary failed');

    const warnings: Error[] = [];
    const handler = (warning: Error) => warnings.push(warning);
    process.once('warning', handler);

    attachSuppressed(primary, secondary);

    // process.emitWarning entrega o evento assincronamente (próximo tick).
    await new Promise((resolve) => setImmediate(resolve));

    process.removeListener('warning', handler);

    expect(warnings).toHaveLength(1);
    expect(warnings[0]?.name).toBe('MongoatSuppressedError');
  });

  it('nunca lança mesmo se secondary não for uma Error — usa String(secondary) no texto do warning', async () => {
    const primary = new MongoatError('primary failed');
    const secondary = { weird: 'object', not: 'an error' };

    const warnings: Error[] = [];
    const handler = (warning: Error) => warnings.push(warning);
    process.once('warning', handler);

    expect(() => attachSuppressed(primary, secondary)).not.toThrow();

    await new Promise((resolve) => setImmediate(resolve));

    process.removeListener('warning', handler);

    expect(primary.suppressed).toEqual([secondary]);
    expect(warnings[0]?.message).toContain(String(secondary));
  });
});
