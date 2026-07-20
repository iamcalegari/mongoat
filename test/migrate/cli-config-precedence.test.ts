import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/migrate', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/migrate')>();

  return {
    ...actual,
    runMigrations: vi.fn().mockResolvedValue(undefined),
    revertMigration: vi.fn().mockResolvedValue(undefined),
    runTo: vi.fn().mockResolvedValue(undefined),
    getStatus: vi.fn().mockResolvedValue([]),
    getLockStatus: vi.fn().mockResolvedValue({ held: false }),
    forceUnlock: vi.fn().mockResolvedValue({ removed: false }),
  };
});

import type { CliDeps } from '@/bin/mongoat';
import {
  handleCreate,
  handleDown,
  handleStatus,
  handleTo,
  handleUnlock,
  handleUp,
  mergeMigrateConfig,
  parseBooleanEnv,
  resolveMigrateConfig,
} from '@/bin/mongoat';
import type { Database } from '@/database';
import { getLockStatus, getStatus } from '@/migrate';
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
    expect(message).not.toMatch(
      /\b(Fase|Phase|Plano|Plan|Task|Wave|Pitfall|Pattern)\s+\d/i
    );
    expect(message).not.toMatch(/\b(phase|fase|pitfall)\b/i);
    expect(message).not.toMatch(/\b(RED|GREEN) note\b/i);
    expect(message).not.toMatch(/\bimplementation task\b/i);
  });
});

/**
 * Empty strings must never win a tier of the chain: a declared-but-empty env
 * var means "unset" and falls through; an empty flag/config value is an
 * explicit mistake and fails loud. Without this, an empty `dir` would make
 * discovery silently scan the process cwd and report a run against the wrong
 * directory as success.
 */
describe('mergeMigrateConfig — empty values never win the chain', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('an empty MONGOAT_MIGRATIONS_DIR falls through to the default, not the cwd', () => {
    vi.stubEnv('MONGOAT_MIGRATIONS_DIR', '');

    expect(mergeMigrateConfig({}).dir).toBe('migrations');
  });

  it('an empty MONGOAT_MIGRATIONS_DIR falls through to the config file', () => {
    vi.stubEnv('MONGOAT_MIGRATIONS_DIR', '');

    expect(mergeMigrateConfig({}, { dir: 'db/migrations' }).dir).toBe(
      'db/migrations'
    );
  });

  it('an empty --dir flag fails loud instead of scanning the cwd', () => {
    expect(() => mergeMigrateConfig({ dir: '' })).toThrowError(
      expect.objectContaining({ code: 'INVALID_CONFIG_SHAPE' })
    );
  });

  it('an empty --collection flag fails loud', () => {
    expect(() => mergeMigrateConfig({ collection: '   ' })).toThrowError(
      expect.objectContaining({ code: 'INVALID_CONFIG_SHAPE' })
    );
  });

  it('an empty MONGOAT_MIGRATIONS_LOCK_TTL falls through instead of failing on Number("")', () => {
    vi.stubEnv('MONGOAT_MIGRATIONS_LOCK_TTL', '');

    expect(mergeMigrateConfig({}, { lockTtlMs: 5000 }).lockTtlMs).toBe(5000);
    expect(mergeMigrateConfig({}).lockTtlMs).toBe(30 * 60 * 1000);
  });

  it('a non-decimal MONGOAT_MIGRATIONS_LOCK_TTL fails loud and names the env var', () => {
    vi.stubEnv('MONGOAT_MIGRATIONS_LOCK_TTL', '0x1F');

    let caught: unknown;
    try {
      mergeMigrateConfig({});
    } catch (err) {
      caught = err;
    }

    expect(caught).toEqual(
      expect.objectContaining({ code: 'INVALID_LOCK_TTL' })
    );
    expect((caught as Error).message).toContain(
      'MONGOAT_MIGRATIONS_LOCK_TTL'
    );
  });

  it('an invalid --lock-ttl flag names the flag, not the env var', () => {
    let caught: unknown;
    try {
      mergeMigrateConfig({ 'lock-ttl': '1e3' });
    } catch (err) {
      caught = err;
    }

    expect((caught as Error).message).toContain('--lock-ttl');
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

/**
 * `create`/`status`/`unlock` gain the same `resolveMigrateConfig` chain
 * `up`/`down`/`to` already had — the fix for the "config that only works in
 * some handlers" inconsistency. `create` is exercised by real dispatch
 * against a real filesystem (it has no DB dependency); `status`/`unlock` are
 * exercised through the `CliDeps` seam, same idiom as `cli-dispatch.test.ts`,
 * with no real DB connection. The ambiguous-config scenario is the one
 * exception — it depends on a directory PROBE (no explicit "--config"), and
 * every real handler always resolves against the actual process cwd, so it
 * is exercised directly against `resolveMigrateConfig`'s own exported `cwd`
 * parameter instead, never by swapping the test process's real working
 * directory (that is shared, mutable, global state across every test file).
 */
describe('config chain wired into all six subcommands', () => {
  let stdoutSpy: ReturnType<typeof vi.spyOn>;
  let stderrSpy: ReturnType<typeof vi.spyOn>;
  let fakeDatabase: Database;
  let deps: CliDeps;

  function makeTmpDir(): string {
    return mkdtempSync(path.join(tmpdir(), 'mongoat-cli-config-chain-'));
  }

  function writeConfig(dir: string, contents: MongoatMigrationsConfig): string {
    const configPath = path.join(dir, 'mongoat.config.json');
    writeFileSync(configPath, JSON.stringify(contents), 'utf-8');

    return configPath;
  }

  function stderr(): string {
    return stderrSpy.mock.calls.map((call: unknown[]) => call[0]).join('');
  }

  beforeEach(() => {
    stdoutSpy = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => true);
    stderrSpy = vi
      .spyOn(process.stderr, 'write')
      .mockImplementation(() => true);
    fakeDatabase = {
      connect: vi.fn().mockResolvedValue(undefined),
      disconnect: vi.fn().mockResolvedValue(undefined),
    } as unknown as Database;
    deps = { createDatabase: () => fakeDatabase };
  });

  afterEach(() => {
    stdoutSpy.mockRestore();
    stderrSpy.mockRestore();
    vi.mocked(getStatus).mockClear();
    vi.mocked(getLockStatus).mockClear();
  });

  describe('--config is declared and accepted by every subcommand', () => {
    it('create accepts --config without an unknown-option error', async () => {
      const fixtureDir = makeTmpDir();
      const targetDir = makeTmpDir();
      try {
        const configPath = writeConfig(fixtureDir, {});

        const exitCode = await handleCreate([
          'add_users',
          '--dir',
          targetDir,
          '--config',
          configPath,
        ]);

        expect(exitCode).toBe(0);
        expect(stderr()).not.toContain("Unknown option '--config'");
      } finally {
        rmSync(fixtureDir, { recursive: true, force: true });
        rmSync(targetDir, { recursive: true, force: true });
      }
    });

    it('up accepts --config without an unknown-option error', async () => {
      const dir = makeTmpDir();
      try {
        const configPath = writeConfig(dir, {});

        const exitCode = await handleUp(['--config', configPath], deps);

        expect(exitCode).toBe(0);
        expect(stderr()).not.toContain("Unknown option '--config'");
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('down accepts --config without an unknown-option error', async () => {
      const dir = makeTmpDir();
      try {
        const configPath = writeConfig(dir, {});

        const exitCode = await handleDown(
          ['20260101000000', '--config', configPath],
          deps
        );

        expect(exitCode).toBe(0);
        expect(stderr()).not.toContain("Unknown option '--config'");
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('to accepts --config without an unknown-option error', async () => {
      const dir = makeTmpDir();
      try {
        const configPath = writeConfig(dir, {});

        const exitCode = await handleTo(
          ['20260101000000', '--config', configPath],
          deps
        );

        expect(exitCode).toBe(0);
        expect(stderr()).not.toContain("Unknown option '--config'");
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('status accepts --config without an unknown-option error', async () => {
      const dir = makeTmpDir();
      try {
        const configPath = writeConfig(dir, {});

        const exitCode = await handleStatus(['--config', configPath], deps);

        expect(exitCode).toBe(0);
        expect(stderr()).not.toContain("Unknown option '--config'");
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('unlock accepts --config without an unknown-option error', async () => {
      const dir = makeTmpDir();
      try {
        const configPath = writeConfig(dir, {});

        const exitCode = await handleUnlock(['--config', configPath], deps);

        expect(exitCode).toBe(0);
        expect(stderr()).not.toContain("Unknown option '--config'");
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });
  });

  it('create writes into the directory from a config file when no --dir flag and no env var are set', async () => {
    const fixtureDir = makeTmpDir();
    const targetDir = makeTmpDir();
    try {
      const configPath = writeConfig(fixtureDir, { dir: targetDir });

      const exitCode = await handleCreate([
        'from_config_dir',
        '--config',
        configPath,
      ]);

      expect(exitCode).toBe(0);

      const files = await readdir(targetDir);
      expect(files).toHaveLength(1);
      expect(files[0]).toMatch(/^\d{14}_from_config_dir\.ts$/);
    } finally {
      rmSync(fixtureDir, { recursive: true, force: true });
      rmSync(targetDir, { recursive: true, force: true });
    }
  });

  it('create --dir flag wins over the config file dir (precedence)', async () => {
    const fixtureDir = makeTmpDir();
    const configDir = makeTmpDir();
    const flagDir = makeTmpDir();
    try {
      const configPath = writeConfig(fixtureDir, { dir: configDir });

      const exitCode = await handleCreate([
        'from_flag_dir',
        '--dir',
        flagDir,
        '--config',
        configPath,
      ]);

      expect(exitCode).toBe(0);

      const flagFiles = await readdir(flagDir);
      expect(flagFiles).toHaveLength(1);

      const configFiles = await readdir(configDir);
      expect(configFiles).toHaveLength(0);
    } finally {
      rmSync(fixtureDir, { recursive: true, force: true });
      rmSync(configDir, { recursive: true, force: true });
      rmSync(flagDir, { recursive: true, force: true });
    }
  });

  it('status resolves against the control collection from a config file', async () => {
    const dir = makeTmpDir();
    try {
      const configPath = writeConfig(dir, {
        collection: 'custom_migrations',
      });

      const exitCode = await handleStatus(['--config', configPath], deps);

      expect(exitCode).toBe(0);
      expect(getStatus).toHaveBeenCalledWith(
        fakeDatabase,
        expect.objectContaining({ collection: 'custom_migrations' })
      );
      expect(getLockStatus).toHaveBeenCalledWith(
        fakeDatabase,
        expect.objectContaining({ collection: 'custom_migrations' })
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('unlock resolves against the control collection from a config file', async () => {
    const dir = makeTmpDir();
    try {
      const configPath = writeConfig(dir, {
        collection: 'custom_migrations',
      });

      const exitCode = await handleUnlock(['--config', configPath], deps);

      expect(exitCode).toBe(0);
      expect(getLockStatus).toHaveBeenCalledWith(
        fakeDatabase,
        expect.objectContaining({ collection: 'custom_migrations' })
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('create still rejects an invalid name before resolving any config, even with --config present', async () => {
    const dir = makeTmpDir();
    try {
      const configPath = writeConfig(dir, { dir });

      const exitCode = await handleCreate([
        'not a valid name!',
        '--config',
        configPath,
      ]);

      expect(exitCode).toBe(1);
      expect(stderr()).toContain('INVALID_MIGRATION_NAME');
      // A config resolvida nunca chega a ser lida — a validação do nome
      // acontece antes de qualquer resolução de config, então a linha de
      // transparência do loader (escrita só quando um config É carregado)
      // nunca aparece.
      expect(stderr()).not.toContain('loaded config from');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  describe('an ambiguous config in cwd fails loud for every subcommand', () => {
    // A ambiguidade só é detectável durante a SONDAGEM do cwd (sem
    // "--config" explícito) — os seis handlers de verdade sempre resolvem
    // contra o cwd real do processo, então este cenário chama
    // `resolveMigrateConfig` (exportada para isso) direto, com um `cwd` de
    // diretório temporário passado explicitamente, exatamente o mecanismo
    // que cada um dos seis handlers usa por baixo — nunca trocando o
    // diretório de trabalho real do processo de teste.
    const subcommandNames = [
      'create',
      'up',
      'down',
      'to',
      'status',
      'unlock',
    ] as const;

    it.each(subcommandNames)(
      '%s: fails with the stable AMBIGUOUS_CONFIG code',
      async () => {
        const dir = makeTmpDir();
        try {
          writeFileSync(path.join(dir, 'mongoat.config.json'), '{}', 'utf-8');
          writeFileSync(
            path.join(dir, 'mongoat.config.js'),
            'module.exports = {};',
            'utf-8'
          );

          let caught: unknown;
          try {
            await resolveMigrateConfig({}, dir);
          } catch (err) {
            caught = err;
          }

          expect(caught).toEqual(
            expect.objectContaining({ code: 'AMBIGUOUS_CONFIG' })
          );
        } finally {
          rmSync(dir, { recursive: true, force: true });
        }
      }
    );
  });
});
