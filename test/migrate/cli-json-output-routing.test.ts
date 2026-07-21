import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
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

// The exact transparency line lives in `loadConfigFile` — a stable fragment
// is more robust to reformatting than the whole line.
const CONFIG_LOADED_FRAGMENT = '[mongoat] loaded config from';

const SPAWN_TIMEOUT_MS = 20_000;

/**
 * Counts non-overlapping occurrences of `needle` in `haystack`.
 */
function countOccurrences(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

/**
 * Builds the child process environment from the CURRENT one. Deliberately
 * KEEPS the real `MONGODB_URI`/`MONGODB_DB_NAME` the suite's global
 * testcontainer setup already exported — unlike the re-exec ordering
 * fixture, this test proves the routing contract against a genuinely
 * connectable database, not a fail-fast one. Only the migrations-specific
 * env vars are stripped, so nothing ambient can override the explicit
 * `mongoat.config.json` fixture each scenario writes.
 */
function buildChildEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };

  delete env.MONGOAT_TSX_ACTIVE;
  delete env.MONGOAT_MIGRATIONS_DIR;
  delete env.MONGOAT_MIGRATIONS_COLLECTION;
  delete env.MONGOAT_MIGRATIONS_LOCK_TTL;
  delete env.MONGOAT_MIGRATIONS_ALLOW_NO_TRANSACTION;

  return env;
}

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
 * A real-process proof that `mongoat status --json` puts JSON on stdout and
 * everything human (config provenance, warnings, errors) on stderr — a
 * same-process `process.stdout.write` spy cannot prove this, since it never
 * touches two genuinely separate OS streams.
 */
describe('mongoat status --json — real-process stdout/stderr stream separation', () => {
  // O bundle é construído uma única vez pelo globalSetup do vitest, antes de
  // qualquer arquivo de teste começar — construir aqui apagaria `lib/` (via
  // `prebuild`/`rimraf`) no meio dos spawns de outros arquivos em paralelo.
  beforeAll(() => {
    expect(existsSync(BUILT_BIN)).toBe(true);
  });

  it(
    'a clean status --json envelope lands only on stdout, with config provenance only on stderr',
    () => {
      const cwd = makeTempDir('mongoat-json-routing-ok-');
      const migrationsDir = path.join(cwd, 'migrations');
      const collection = `_migrations_json_routing_${randomUUID()}`;

      mkdirSync(migrationsDir, { recursive: true });

      const configPath = path.join(cwd, 'mongoat.config.json');
      writeFileSync(
        configPath,
        `${JSON.stringify({ dir: migrationsDir, collection })}\n`
      );

      const result = runBin(['status', '--json'], cwd);
      const stdout = result.stdout ?? '';
      const stderr = result.stderr ?? '';

      expect(result.status).toBe(0);

      // No human/config-provenance prefix ever reaches stdout.
      expect(countOccurrences(stdout, '[mongoat]')).toBe(0);

      // Exactly one non-empty stdout line, and it parses as the envelope.
      const lines = stdout.split('\n').filter((line) => line.length > 0);
      expect(lines).toHaveLength(1);

      const parsed = JSON.parse(lines[0]) as { schemaVersion: number };
      expect(parsed.schemaVersion).toBe(1);

      // The provenance line — and only it — appears on stderr.
      expect(stderr).toContain(CONFIG_LOADED_FRAGMENT);
      expect(stderr).toContain(configPath);
    },
    SPAWN_TIMEOUT_MS + 10_000
  );

  it(
    'a boundary failure after config resolution keeps stdout empty while stderr carries both the provenance line and the error',
    () => {
      const cwd = makeTempDir('mongoat-json-routing-err-');
      // Never created — `getStatus`'s discovery step fails against it,
      // after the config has already resolved (and its provenance line has
      // already fired) but before any JSON write.
      const missingDir = path.join(cwd, 'does-not-exist');
      const collection = `_migrations_json_routing_err_${randomUUID()}`;

      const configPath = path.join(cwd, 'mongoat.config.json');
      writeFileSync(
        configPath,
        `${JSON.stringify({ dir: missingDir, collection })}\n`
      );

      const result = runBin(['status', '--json'], cwd);

      expect(result.status).toBe(1);
      expect(result.stdout ?? '').toBe('');

      const stderr = result.stderr ?? '';
      expect(stderr).toContain(CONFIG_LOADED_FRAGMENT);
      expect(stderr).toContain('Error');
    },
    SPAWN_TIMEOUT_MS + 10_000
  );
});
