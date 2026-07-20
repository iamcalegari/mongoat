import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/migrate', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/migrate')>();

  return {
    ...actual,
    runMigrations: vi.fn().mockResolvedValue(undefined),
  };
});

import type { CliDeps } from '@/bin/mongoat';
import { handleUp, mergeMigrateConfig, parseBooleanEnv } from '@/bin/mongoat';
import type { Database } from '@/database';
import type { MongoatMigrationsConfig } from '@/types/migrate';

/**
 * Per-field precedence (flag > env > config file > default) for the four
 * migrations knobs, plus the explicit parsing contract for the new
 * `MONGOAT_MIGRATIONS_ALLOW_NO_TRANSACTION` env var. `mergeMigrateConfig`/
 * `parseBooleanEnv` are pure functions — no DB, no filesystem, no process
 * spawn — so every case here runs in-memory.
 */
describe('mergeMigrateConfig — per-field precedence matrix', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it.each([
    {
      case: 'flag wins over env and config',
      flag: 'from-flag',
      env: 'from-env',
      config: 'from-config',
      expected: 'from-flag',
    },
    {
      case: 'env wins when flag is absent',
      flag: undefined,
      env: 'from-env',
      config: 'from-config',
      expected: 'from-env',
    },
    {
      case: 'config wins when flag and env are absent',
      flag: undefined,
      env: undefined,
      config: 'from-config',
      expected: 'from-config',
    },
    {
      case: 'default wins when nothing is set',
      flag: undefined,
      env: undefined,
      config: undefined,
      expected: 'migrations',
    },
  ])('dir: $case', ({ flag, env, config, expected }) => {
    if (env !== undefined) vi.stubEnv('MONGOAT_MIGRATIONS_DIR', env);

    const fileConfig: MongoatMigrationsConfig | undefined =
      config === undefined ? undefined : { dir: config };

    const result = mergeMigrateConfig({ dir: flag }, fileConfig);

    expect(result.dir).toBe(expected);
  });

  it.each([
    {
      case: 'flag wins over env and config',
      flag: 'flag-collection',
      env: 'env-collection',
      config: 'config-collection',
      expected: 'flag-collection',
    },
    {
      case: 'env wins when flag is absent',
      flag: undefined,
      env: 'env-collection',
      config: 'config-collection',
      expected: 'env-collection',
    },
    {
      case: 'config wins when flag and env are absent',
      flag: undefined,
      env: undefined,
      config: 'config-collection',
      expected: 'config-collection',
    },
    {
      case: 'default wins when nothing is set',
      flag: undefined,
      env: undefined,
      config: undefined,
      expected: '_migrations',
    },
  ])('collection: $case', ({ flag, env, config, expected }) => {
    if (env !== undefined) vi.stubEnv('MONGOAT_MIGRATIONS_COLLECTION', env);

    const fileConfig: MongoatMigrationsConfig | undefined =
      config === undefined ? undefined : { collection: config };

    const result = mergeMigrateConfig({ collection: flag }, fileConfig);

    expect(result.collection).toBe(expected);
  });

  it.each([
    {
      case: 'flag wins over env and config',
      flag: '1000',
      env: '2000',
      config: 3000,
      expected: 1000,
    },
    {
      case: 'env wins when flag is absent',
      flag: undefined,
      env: '2000',
      config: 3000,
      expected: 2000,
    },
    {
      case: 'config wins when flag and env are absent',
      flag: undefined,
      env: undefined,
      config: 3000,
      expected: 3000,
    },
    {
      case: 'default wins when nothing is set',
      flag: undefined,
      env: undefined,
      config: undefined,
      expected: 30 * 60 * 1000,
    },
  ])('lockTtlMs: $case', ({ flag, env, config, expected }) => {
    if (env !== undefined) vi.stubEnv('MONGOAT_MIGRATIONS_LOCK_TTL', env);

    const fileConfig: MongoatMigrationsConfig | undefined =
      config === undefined ? undefined : { lockTtlMs: config };

    const result = mergeMigrateConfig({ 'lock-ttl': flag }, fileConfig);

    expect(result.lockTtlMs).toBe(expected);
  });

  it('an invalid "--lock-ttl" flag still fails loud with the existing code, even when a config file is present', () => {
    expect(() =>
      mergeMigrateConfig({ 'lock-ttl': 'not-a-number' }, { lockTtlMs: 5000 })
    ).toThrowError(expect.objectContaining({ code: 'INVALID_LOCK_TTL' }));
  });

  it.each([
    {
      case: 'flag wins over env and config',
      flag: true,
      env: 'false',
      config: false,
      expected: true,
    },
    {
      case: 'env wins when flag is absent',
      flag: undefined,
      env: 'true',
      config: false,
      expected: true,
    },
    {
      case: 'config wins when flag and env are absent',
      flag: undefined,
      env: undefined,
      config: true,
      expected: true,
    },
    {
      case: 'default wins when nothing is set',
      flag: undefined,
      env: undefined,
      config: undefined,
      expected: false,
    },
  ])('allowNoTransaction: $case', ({ flag, env, config, expected }) => {
    if (env !== undefined)
      vi.stubEnv('MONGOAT_MIGRATIONS_ALLOW_NO_TRANSACTION', env);

    const fileConfig: MongoatMigrationsConfig | undefined =
      config === undefined ? undefined : { allowNoTransaction: config };

    const result = mergeMigrateConfig(
      { 'allow-no-transaction': flag },
      fileConfig
    );

    expect(result.allowNoTransaction).toBe(expected);
  });

  it('a config file that only sets "dir" does not erase "collection" resolved from env or default', () => {
    vi.stubEnv('MONGOAT_MIGRATIONS_COLLECTION', 'env-only-collection');

    const result = mergeMigrateConfig({}, { dir: 'config-only-dir' });

    expect(result.dir).toBe('config-only-dir');
    expect(result.collection).toBe('env-only-collection');
  });

  it('an empty config object behaves exactly like an absent config', () => {
    const withEmptyConfig = mergeMigrateConfig({}, {});
    const withoutConfig = mergeMigrateConfig({});

    expect(withEmptyConfig).toEqual(withoutConfig);
  });
});

/**
 * The single most important test in this file: a truthiness coercion over
 * the flag's raw value (`Boolean(values['allow-no-transaction'])`) collapses
 * "flag not passed" and "flag passed as false" into the exact same value,
 * which permanently defeats every lower rung of the precedence chain for
 * this field — no config-file or env-var value could ever win. Both halves
 * of the fix (dropping the flag's default value AND removing the coercion)
 * have to land together for these cases to pass.
 */
describe('allowNoTransaction — boolean precedence regression', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('no flag, no env, config true => resolves true', () => {
    const result = mergeMigrateConfig({}, { allowNoTransaction: true });

    expect(result.allowNoTransaction).toBe(true);
  });

  it('no flag, no env, config false => resolves false', () => {
    const result = mergeMigrateConfig({}, { allowNoTransaction: false });

    expect(result.allowNoTransaction).toBe(false);
  });

  it('flag true overrides a config false', () => {
    const result = mergeMigrateConfig(
      { 'allow-no-transaction': true },
      { allowNoTransaction: false }
    );

    expect(result.allowNoTransaction).toBe(true);
  });

  it('a negative env value wins over a positive config value, and is never read as truthy', () => {
    vi.stubEnv('MONGOAT_MIGRATIONS_ALLOW_NO_TRANSACTION', 'false');

    const result = mergeMigrateConfig({}, { allowNoTransaction: true });

    expect(result.allowNoTransaction).toBe(false);
  });

  it('nothing set anywhere resolves to false', () => {
    const result = mergeMigrateConfig({});

    expect(result.allowNoTransaction).toBe(false);
  });
});

describe('parseBooleanEnv', () => {
  it('undefined stays undefined — absent is distinct from false', () => {
    expect(parseBooleanEnv(undefined)).toBeUndefined();
  });

  it('an empty string is treated as absent', () => {
    expect(parseBooleanEnv('')).toBeUndefined();
  });

  it.each(['true', 'TRUE', 'True', '1', 'yes', 'YES', 'on', 'ON'])(
    'recognized truthy literal "%s" parses to true',
    (value) => {
      expect(parseBooleanEnv(value)).toBe(true);
    }
  );

  it.each(['false', 'FALSE', 'False', '0', 'no', 'NO', 'off', 'OFF'])(
    'recognized falsy literal "%s" parses to false',
    (value) => {
      expect(parseBooleanEnv(value)).toBe(false);
    }
  );

  it('an unrecognized value fails loud with a stable code and mentions the offending value', () => {
    let caught: unknown;

    try {
      parseBooleanEnv('maybe');
    } catch (err) {
      caught = err;
    }

    expect(caught).toEqual(
      expect.objectContaining({ code: 'INVALID_ALLOW_NO_TRANSACTION' })
    );
    expect((caught as Error).message).toContain('maybe');
  });

  it('the error message satisfies the repo-wide public-facing guard against internal planning jargon', () => {
    let caught: unknown;

    try {
      parseBooleanEnv('maybe');
    } catch (err) {
      caught = err;
    }

    const message = (caught as Error).message;

    expect(message).not.toMatch(/\b[A-Z]{2,5}-\d{2}\b/);
    expect(message).not.toMatch(/\bD-\d{1,2}\b/);
    expect(message).not.toMatch(/\b(Fase|Phase|Plano|Plan|Task|Wave)\s+\d/i);
  });
});

/**
 * The pure-function tests above call `mergeMigrateConfig` directly with an
 * already-built `values` object, so they can never observe whether the real
 * `parseArgs` option declaration still carries a default value — a passing
 * flag-value of `false` (not `undefined`) short-circuits the `??` chain
 * before the env var is ever consulted, silently reproducing the same bug
 * from a different half of the fix. Only a call through the actual CLI
 * handler proves that half is closed too.
 */
describe('allowNoTransaction — the env var reaches the real handler with no flag passed', () => {
  let stdoutSpy: ReturnType<typeof vi.spyOn>;
  let stderrSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    stdoutSpy = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => true);
    stderrSpy = vi
      .spyOn(process.stderr, 'write')
      .mockImplementation(() => true);
  });

  afterEach(() => {
    stdoutSpy.mockRestore();
    stderrSpy.mockRestore();
    vi.unstubAllEnvs();
  });

  it('handleUp prints the loud warning from an env value alone, with no --allow-no-transaction flag', async () => {
    vi.stubEnv('MONGOAT_MIGRATIONS_ALLOW_NO_TRANSACTION', 'true');

    const fakeDatabase = {
      connect: vi.fn().mockResolvedValue(undefined),
      disconnect: vi.fn().mockResolvedValue(undefined),
    } as unknown as Database;
    const deps: CliDeps = { createDatabase: () => fakeDatabase };

    const exitCode = await handleUp([], deps);

    expect(exitCode).toBe(0);

    const stderrOutput = stderrSpy.mock.calls
      .map((call: unknown[]) => call[0])
      .join('');
    expect(stderrOutput).toContain('--allow-no-transaction is set');
  });
});
