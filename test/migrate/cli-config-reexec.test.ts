import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeAll, describe, expect, it } from 'vitest';

const PROJECT_ROOT = path.resolve(__dirname, '../..');
const BUILT_BIN = path.join(PROJECT_ROOT, 'lib', 'mongoat.cjs');

// The exact warning text lives in `warnAllowNoTransaction` — a short,
// stable fragment is more robust to reformatting than the full multi-line
// message.
const ALLOW_NO_TRANSACTION_WARNING_FRAGMENT = '--allow-no-transaction is set';

// The exact transparency line lives in `loadConfigFile` — same reasoning
// for using a stable fragment instead of the whole line.
const CONFIG_LOADED_FRAGMENT = '[mongoat] loaded config from';

// A guaranteed-to-fail-fast target: an unroutable/refused port plus a short
// server-selection timeout, so every scenario reaches its own re-exec/warn
// assertions without waiting on this repo's real, testcontainers-provided
// MongoDB (which the surrounding vitest process already has connected via
// `MONGODB_URI` in its own environment — deliberately NOT inherited here).
const FAIL_FAST_MONGODB_URI =
  'mongodb://127.0.0.1:1/?serverSelectionTimeoutMS=200&connectTimeoutMS=200';

const SPAWN_TIMEOUT_MS = 10_000;

/**
 * Counts non-overlapping occurrences of `needle` in `haystack` — the
 * "exactly once" contract this file exists to prove cannot be satisfied by
 * a presence-only assertion (`toContain`), since a duplicated warning would
 * still contain the fragment.
 */
function countOccurrences(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

/**
 * Builds the child process environment from the CURRENT one, stripping
 * every env-var this module reads directly so a value already set in the
 * surrounding test process (including the marker that would mask a real
 * re-exec under test, and the real MongoDB URI the testcontainer-backed
 * suite already has connected) can never leak into a scenario.
 */
function buildChildEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };

  delete env.MONGOAT_TSX_ACTIVE;
  delete env.MONGOAT_MIGRATIONS_DIR;
  delete env.MONGOAT_MIGRATIONS_COLLECTION;
  delete env.MONGOAT_MIGRATIONS_LOCK_TTL;
  delete env.MONGOAT_MIGRATIONS_ALLOW_NO_TRANSACTION;
  delete env.MONGODB_DB_NAME;
  delete env.MONGODB_USERNAME;
  delete env.MONGODB_PASSWORD;

  env.MONGODB_URI = FAIL_FAST_MONGODB_URI;

  return env;
}

/**
 * Spawns the real compiled bin as a child process, with `cwd:` passed
 * EXPLICITLY — deliberately different from production `reExecUnderTsx`'s
 * own `spawnSync` call, which correctly relies on inheriting its parent's
 * cwd; the two solve different problems and this one is not "fixing"
 * production to match the test.
 */
function runBin(args: string[], cwd: string) {
  return spawnSync(process.execPath, [BUILT_BIN, ...args], {
    cwd,
    env: buildChildEnv(),
    encoding: 'utf-8',
    timeout: SPAWN_TIMEOUT_MS,
  });
}

const tempDirs: string[] = [];

function makeTempDir(prefix: string): string {
  const dir = mkdtempSync(path.join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

/**
 * A 14-digit-prefixed migration filename `discoverMigrations` recognizes —
 * content is irrelevant here since these scenarios never reach the point
 * where a migration file is actually imported (the real MongoDB connection
 * fails first, by design — see `FAIL_FAST_MONGODB_URI`).
 */
function writeStubMigration(dir: string, extension: 'js' | 'ts'): void {
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    path.join(dir, `20260101000000_stub.${extension}`),
    extension === 'ts' ? 'export {};\n' : 'module.exports = {};\n'
  );
}

describe('CLI config resolution — re-exec ordering and warning-once contract', () => {
  // O bundle é construído uma única vez pelo globalSetup do vitest, antes de
  // qualquer arquivo de teste começar. Construir aqui apagaria `lib/` (via
  // `prebuild`/`rimraf`) no meio dos spawns de outros arquivos rodando em
  // paralelo. Só resta afirmar que o artefato está no lugar.
  beforeAll(() => {
    expect(existsSync(BUILT_BIN)).toBe(true);
  });

  // The count asserted below is exactly one — a warning printed twice would
  // still satisfy a mere presence check, so counting is what proves the
  // once-only contract. Wiring config resolution ahead of the warning and
  // behind the re-exec checkpoint is what makes the fragment appear once, no
  // matter which process (parent or re-executed child) ends up reading it.
  it(
    'prints the transaction warning exactly once when a TypeScript config triggers a re-exec',
    () => {
      const cwd = makeTempDir('mongoat-reexec-a-');

      writeFileSync(
        path.join(cwd, 'mongoat.config.ts'),
        'export default {\n  allowNoTransaction: true,\n};\n'
      );

      const result = runBin(['up'], cwd);
      const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;

      expect(
        countOccurrences(output, ALLOW_NO_TRANSACTION_WARNING_FRAGMENT)
      ).toBe(1);
    },
    SPAWN_TIMEOUT_MS + 5_000
  );

  it(
    'prints the transaction warning exactly once when no re-exec happens',
    () => {
      const cwd = makeTempDir('mongoat-reexec-b-');

      writeFileSync(path.join(cwd, 'mongoat.config.json'), '{}\n');

      const result = runBin(['up', '--allow-no-transaction'], cwd);
      const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;

      expect(
        countOccurrences(output, ALLOW_NO_TRANSACTION_WARNING_FRAGMENT)
      ).toBe(1);
    },
    SPAWN_TIMEOUT_MS + 5_000
  );

  it(
    'a TypeScript config alone triggers a re-exec even with no TypeScript migrations',
    () => {
      const cwd = makeTempDir('mongoat-reexec-c-');
      const migrationsDir = path.join(cwd, 'migrations');

      writeFileSync(
        path.join(cwd, 'mongoat.config.ts'),
        'export default {};\n'
      );
      writeStubMigration(migrationsDir, 'js');

      const result = runBin(['up'], cwd);
      const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;

      // The provenance line only appears once the config has actually been
      // `import()`-ed — which only a TS-capable process can do — so its
      // presence is direct evidence the re-exec happened and the child
      // proceeded to load the config.
      expect(output).toContain(CONFIG_LOADED_FRAGMENT);
      expect(output).toContain(path.join(cwd, 'mongoat.config.ts'));
    },
    SPAWN_TIMEOUT_MS + 5_000
  );

  it(
    'a JSON config redirecting the migrations dir to a TypeScript-only folder still re-execs after the merge',
    () => {
      const cwd = makeTempDir('mongoat-reexec-d-');
      const migrationsDir = path.join(cwd, 'redirected-migrations');

      writeStubMigration(migrationsDir, 'ts');
      writeFileSync(
        path.join(cwd, 'mongoat.config.json'),
        JSON.stringify({ dir: migrationsDir }) + '\n'
      );

      const result = runBin(['up'], cwd);
      const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;

      // Neither the "tsx is not installed" failure nor a raw ESM/CJS parse
      // error surfaces — the second checkpoint (against the MERGED dir)
      // caught the TypeScript migration and re-executed before either could
      // happen.
      expect(output).not.toContain('TSX_NOT_AVAILABLE');
      expect(output).not.toMatch(/Unexpected token ['"]export['"]/);

      // The config is loaded once in the parent (before the second
      // checkpoint can even be evaluated) and once again in the
      // re-executed child — two occurrences is direct evidence a re-exec
      // took place at the second checkpoint, against the already-merged
      // directory. This double load is a KNOWN, documented limitation (see
      // `defineConfig`/`loadConfigFile`): harmless for a `.json` config,
      // which is only read and parsed, but a `.js`/`.ts` config in this same
      // shape would have its code evaluated twice — hence the "keep it
      // idempotent" guidance in those docs, not a behavior to rely on.
      expect(countOccurrences(output, CONFIG_LOADED_FRAGMENT)).toBe(2);
    },
    SPAWN_TIMEOUT_MS + 5_000
  );

  it(
    'a TypeScript config file is evaluated exactly once per process',
    () => {
      const cwd = makeTempDir('mongoat-reexec-e-');
      const sideEffectMarker = 'MONGOAT_CONFIG_FIXTURE_EVALUATED';

      writeFileSync(
        path.join(cwd, 'mongoat.config.ts'),
        `process.stderr.write('${sideEffectMarker}\\n');\n\nexport default {};\n`
      );

      const result = runBin(['up'], cwd);
      const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;

      // The re-exec decision (checkpoint 1) is made from the config's PATH
      // alone, before any `import()` — the parent process never loads the
      // module, only the re-executed child does, so the side effect fires
      // exactly once across the whole invocation.
      expect(countOccurrences(output, sideEffectMarker)).toBe(1);
    },
    SPAWN_TIMEOUT_MS + 5_000
  );

  it(
    'an explicit --config path outside the cwd survives the re-exec boundary',
    () => {
      const cwd = makeTempDir('mongoat-reexec-f-cwd-');
      const configDir = makeTempDir('mongoat-reexec-f-config-');
      const configPath = path.join(configDir, 'somewhere.config.ts');

      writeFileSync(configPath, 'export default {};\n');

      const result = runBin(['up', '--config', configPath], cwd);
      const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;

      // Proves `--config` round-tripped through `process.argv` into the
      // re-executed child unchanged: the provenance line the CHILD prints
      // still names the path from OUTSIDE its cwd.
      expect(output).toContain(CONFIG_LOADED_FRAGMENT);
      expect(output).toContain(configPath);
    },
    SPAWN_TIMEOUT_MS + 5_000
  );

  it(
    "an explicit --dir flag wins over the config file's dir end-to-end",
    () => {
      const cwd = makeTempDir('mongoat-reexec-g-');
      const configDir = path.join(cwd, 'config-dir');
      const flagDir = path.join(cwd, 'flag-dir');

      // The config's own `dir` points at a folder WITH a TypeScript
      // migration — if it were ever honored over the flag, the merged dir
      // would trigger a second re-exec.
      writeStubMigration(configDir, 'ts');
      mkdirSync(flagDir, { recursive: true });

      writeFileSync(
        path.join(cwd, 'mongoat.config.json'),
        JSON.stringify({ dir: configDir }) + '\n'
      );

      const result = runBin(['up', '--dir', flagDir], cwd);
      const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;

      // A single occurrence means the config was loaded once and NO second
      // re-exec happened — proving the flag's (TypeScript-free) `flagDir`
      // was the directory actually checked, not the config's `configDir`.
      expect(countOccurrences(output, CONFIG_LOADED_FRAGMENT)).toBe(1);
    },
    SPAWN_TIMEOUT_MS + 5_000
  );
});
