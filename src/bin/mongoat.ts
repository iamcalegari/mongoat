#!/usr/bin/env node
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';

import { Database } from '@/database';
import { MongoatError, MongoatValidationError } from '@/errors';
import {
  forceUnlock,
  getLockStatus,
  getStatus,
  planMigrations,
  revertMigration,
  runMigrations,
  runTo,
} from '@/migrate';
import { loadConfigFile, resolveConfigPath } from '@/migrate/config';
import {
  discoverMigrations,
  MIGRATION_VERSION_REGEX,
} from '@/migrate/discover';
import { MIGRATION_ERROR_CODES } from '@/migrate/errors';
import {
  DEFAULT_LOCK_TTL_MS,
  formatLockDiagnostic,
  safeIsoOrNull,
} from '@/migrate/lock';
import type {
  LockStatus,
  MigrateConfig,
  MigrationLockJson,
  MigrationPlanJson,
  MigrationStatusJson,
  MigrationStatusJsonRow,
  MigrationStatusRow,
  MigrationStatusSummary,
  MongoatMigrationsConfig,
} from '@/types/migrate';

const DEFAULT_MIGRATIONS_DIR = 'migrations';
const DEFAULT_MIGRATIONS_COLLECTION = '_migrations';

/**
 * @internal
 *
 * Treats an empty (or whitespace-only) string as "not set". A declared but
 * unpopulated env var — `MONGOAT_MIGRATIONS_DIR=` in a CI job, a Docker
 * Compose `environment:` entry, an unset `.env` key — arrives as `''`, which
 * is indistinguishable from absent for every configuration purpose. Without
 * this, `??` would treat `''` as an explicit value and, for `dir`, make
 * `path.resolve('')` silently point discovery at the process cwd.
 */
function emptyToUndefined(value: string | undefined): string | undefined {
  return value === undefined || value.trim() === '' ? undefined : value;
}

/**
 * @internal
 *
 * A value supplied EXPLICITLY (via flag or config file) that is empty is a
 * mistake worth surfacing, not silently ignoring — unlike an empty env var,
 * which is ambient and expected to mean "unset" (see `emptyToUndefined`).
 * Returns `undefined` for a genuinely absent value so the caller can still
 * fall through the precedence chain.
 */
function assertNonEmpty(
  value: string | undefined,
  label: string
): string | undefined {
  if (value === undefined) return undefined;

  if (value.trim() === '') {
    throw new MongoatValidationError(`"${label}" must not be empty`, {
      code: 'INVALID_CONFIG_SHAPE',
    });
  }

  return value;
}

/**
 * @internal
 *
 * Resolution precedence for the four migrations knobs (dir,
 * control-collection, lock TTL, whether transactions are required): CLI
 * flag, then env var, then config file, then a built-in fallback — applied
 * independently per field. `mergeMigrateConfig` is the single place this
 * four-tier chain is assembled into a `MigrateConfig`. Each string tier is
 * normalized so an empty value never wins the chain: an empty env var falls
 * through, an empty flag/config value fails loud.
 */
function resolveMigrationsDir(
  flagValue: string | undefined,
  configValue: string | undefined
): string {
  return (
    assertNonEmpty(flagValue, '--dir') ??
    emptyToUndefined(process.env.MONGOAT_MIGRATIONS_DIR) ??
    assertNonEmpty(configValue, 'dir') ??
    DEFAULT_MIGRATIONS_DIR
  );
}

function resolveMigrationsCollection(
  flagValue: string | undefined,
  configValue: string | undefined
): string {
  return (
    assertNonEmpty(flagValue, '--collection') ??
    emptyToUndefined(process.env.MONGOAT_MIGRATIONS_COLLECTION) ??
    assertNonEmpty(configValue, 'collection') ??
    DEFAULT_MIGRATIONS_COLLECTION
  );
}

/**
 * @internal
 *
 * Same flag → env var → config file → default precedence as
 * `resolveMigrationsDir`, but unlike that helper, a value supplied via flag
 * or env here is parsed and validated BEFORE it is ever returned — same
 * "validate before use" posture as `assertValidVersionArg`. Must be a
 * positive integer number of milliseconds; anything else (non-numeric,
 * fractional, zero, negative) fails loud here, before it can ever become an
 * invalid `expiresAt` in the driver. A value coming from the config file has
 * already been validated by the loader, so it is trusted as-is at this
 * final step.
 */
function resolveLockTtlMs(
  flagValue: string | undefined,
  configValue: number | undefined
): number {
  // An empty env var means "unset" and must fall through to the config
  // file/default, exactly as `parseBooleanEnv` treats its own empty input —
  // otherwise a declared-but-empty `MONGOAT_MIGRATIONS_LOCK_TTL` would make
  // `Number('')` be `0` and take the whole CLI down (including `create`/
  // `status`/`unlock`, which never acquire a lock at all).
  const fromFlag = flagValue !== undefined && flagValue.trim() !== '';
  const rawValue = fromFlag
    ? flagValue
    : emptyToUndefined(process.env.MONGOAT_MIGRATIONS_LOCK_TTL);

  if (rawValue === undefined) return configValue ?? DEFAULT_LOCK_TTL_MS;

  const raw = rawValue.trim();
  // Name the source so an operator who set the env var isn't sent hunting
  // for a `--lock-ttl` flag they never passed.
  const source = fromFlag ? '"--lock-ttl"' : '"MONGOAT_MIGRATIONS_LOCK_TTL"';

  // Decimal digits only — bare `Number()` would also accept hex (`0x1F`),
  // scientific notation (`1e3`) and surrounding whitespace, silently
  // honoring input the operator never meant.
  if (!/^\d+$/.test(raw)) {
    throw new MongoatValidationError(
      `${source} must be a positive integer number of milliseconds — ` +
        `received "${rawValue}"`,
      { code: 'INVALID_LOCK_TTL' }
    );
  }

  const parsed = Number(raw);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new MongoatValidationError(
      `${source} must be a positive integer number of milliseconds — ` +
        `received "${rawValue}"`,
      { code: 'INVALID_LOCK_TTL' }
    );
  }

  return parsed;
}

const BOOLEAN_ENV_TRUE_LITERALS = new Set(['true', '1', 'yes', 'on']);
const BOOLEAN_ENV_FALSE_LITERALS = new Set(['false', '0', 'no', 'off']);

/**
 * @internal
 *
 * Name of the env var that lets `allowNoTransaction` be set outside a CLI
 * flag or config file — the sole place this literal is spelled out in this
 * module; every other reference below goes through this constant.
 */
const ALLOW_NO_TRANSACTION_ENV_VAR = 'MONGOAT_MIGRATIONS_ALLOW_NO_TRANSACTION';

/**
 * @internal
 *
 * Explicit, fail-loud parser for boolean-shaped env vars — deliberately
 * NOT a generic `Boolean(str)` coercion, which would make any non-empty
 * string (including the literal `"false"`) truthy and could silently flip
 * on a mode the operator was trying to turn off. `undefined`/an empty
 * string means "not set" and is returned as `undefined`, kept distinct from
 * an explicit `false` so the caller can still fall through to a lower tier
 * of the precedence chain. A small, closed set of recognized true/false
 * literals (case-insensitive, surrounding whitespace trimmed) is accepted;
 * anything else throws rather than guessing.
 *
 * `varName`/`code` are parameters — not hardcoded — so that when a second
 * boolean env var is added, its error message and `.code` name the variable
 * the operator actually set instead of always citing
 * `allowNoTransaction`'s.
 */
export function parseBooleanEnv(
  value: string | undefined,
  varName: string = ALLOW_NO_TRANSACTION_ENV_VAR,
  code: string = 'INVALID_ALLOW_NO_TRANSACTION'
): boolean | undefined {
  if (value === undefined) return undefined;

  const normalized = value.trim().toLowerCase();

  if (normalized === '') return undefined;
  if (BOOLEAN_ENV_TRUE_LITERALS.has(normalized)) return true;
  if (BOOLEAN_ENV_FALSE_LITERALS.has(normalized)) return false;

  throw new MongoatValidationError(
    `"${varName}" must be one of ` +
      `${[...BOOLEAN_ENV_TRUE_LITERALS, ...BOOLEAN_ENV_FALSE_LITERALS].join(', ')} ` +
      `(case-insensitive) — received "${value}"`,
    { code }
  );
}

/**
 * @internal
 *
 * Same four-tier precedence as the other resolvers, but for a boolean
 * field: flag → env var (see `ALLOW_NO_TRANSACTION_ENV_VAR` above, parsed
 * by `parseBooleanEnv`) → config file → default (`false`). `undefined` must
 * flow through every tier untouched — only the final `?? false` may
 * materialize a concrete boolean — because `undefined` ("flag/env/config
 * not set") and `false` ("explicitly set to false") are not the same thing,
 * and collapsing them anywhere earlier in the chain would make a lower tier
 * unreachable.
 */
function resolveAllowNoTransaction(
  flagValue: boolean | undefined,
  configValue: boolean | undefined
): boolean {
  return (
    flagValue ??
    parseBooleanEnv(process.env[ALLOW_NO_TRANSACTION_ENV_VAR]) ??
    configValue ??
    false
  );
}

/**
 * @internal
 *
 * Single point where the four-tier flag → env → config file → default
 * chain is assembled into a resolved `MigrateConfig`. Each field is
 * constructed by explicit assignment from its own resolver — never a
 * generic spread/merge of the raw `fileConfig` object — so a config file
 * can never introduce a key outside the four known fields, even if the
 * loader's own validation were ever bypassed upstream.
 */
export function mergeMigrateConfig(
  values: {
    'allow-no-transaction'?: boolean;
    'collection'?: string;
    'dir'?: string;
    'lock-ttl'?: string;
  },
  fileConfig?: MongoatMigrationsConfig
): MigrateConfig {
  return {
    dir: resolveMigrationsDir(values.dir, fileConfig?.dir),
    collection: resolveMigrationsCollection(
      values.collection,
      fileConfig?.collection
    ),
    allowNoTransaction: resolveAllowNoTransaction(
      values['allow-no-transaction'],
      fileConfig?.allowNoTransaction
    ),
    lockTtlMs: resolveLockTtlMs(values['lock-ttl'], fileConfig?.lockTtlMs),
  };
}

/**
 * @internal
 *
 * The `to <version>`/`down <version>` CLI argument MUST be
 * regex-validated (reusing `MIGRATION_VERSION_REGEX`, the single source of
 * truth already established by `discover.ts`) BEFORE it is ever used to
 * build a filesystem path or a MongoDB filter — rejects anything that is
 * not exactly 14 digits (e.g. a path-traversal attempt like `../../evil`).
 */
function assertValidVersionArg(
  version: string | undefined,
  subcommand: string
): string {
  if (!version || !MIGRATION_VERSION_REGEX.test(version)) {
    throw new MongoatValidationError(
      `"mongoat ${subcommand}" requires a 14-digit version argument (YYYYMMDDHHMMSS) — ` +
        `received "${version ?? ''}"`,
      { code: 'INVALID_MIGRATION_VERSION' }
    );
  }

  return version;
}

/**
 * @internal
 *
 * Mirrors the same "validate before building any filesystem path"
 * posture `assertValidVersionArg` already applies to the `to`/`down`
 * version argument, now for `mongoat create <name>`. Rejects anything
 * outside `^[A-Za-z0-9_-]+$` (no `.`, so `..` can never appear; no path
 * separators, no whitespace) BEFORE `name` is ever interpolated into a
 * filename and joined into a path — a crafted name can neither escape the
 * migrations directory nor produce a filename `discoverMigrations`'s
 * `MIGRATION_FILENAME_PATTERN` would silently fail to find later.
 */
const MIGRATION_NAME_PATTERN = /^[A-Za-z0-9_-]+$/;

function assertValidMigrationName(name: string | undefined): string {
  if (!name || !MIGRATION_NAME_PATTERN.test(name)) {
    throw new MongoatValidationError(
      `"mongoat create" requires a name matching ${MIGRATION_NAME_PATTERN} — ` +
        `received "${name ?? ''}"`,
      { code: 'INVALID_MIGRATION_NAME' }
    );
  }

  return name;
}

/**
 * @internal
 *
 * Writes a loud, non-suppressible warning to `process.stderr`
 * whenever `--allow-no-transaction` is set, on EVERY invocation. Never
 * gated behind a `--quiet` flag or any other suppression mechanism.
 */
function warnAllowNoTransaction(allowNoTransaction: boolean | undefined): void {
  if (!allowNoTransaction) return;

  process.stderr.write(
    '\n[mongoat] WARNING: --allow-no-transaction is set — data migrations will run WITHOUT ' +
      'a MongoDB transaction (no atomicity). Only use this against a standalone MongoDB in ' +
      'local development; a failed migration can leave data partially applied.\n\n'
  );
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

/**
 * @internal
 *
 * Builds a `YYYYMMDDHHMMSS` version string from the given `date`
 * (defaults to now) — the same 14-digit shape `MIGRATION_VERSION_REGEX`
 * validates.
 */
function buildTimestampVersion(date: Date = new Date()): string {
  return (
    `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}` +
    `${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
  );
}

function buildMigrationStub(extension: 'js' | 'ts'): string {
  if (extension === 'ts') {
    return (
      "import { defineMigration } from '@iamcalegari/mongoat';\n" +
      "import type { MigrationContext } from '@iamcalegari/mongoat';\n\n" +
      'export const { up, down } = defineMigration({\n' +
      '  async up(ctx: MigrationContext): Promise<void> {\n' +
      '    // TODO: implement\n' +
      '  },\n\n' +
      '  async down(ctx: MigrationContext): Promise<void> {\n' +
      '    // TODO: implement (optional — delete this to make the migration irreversible)\n' +
      '  },\n' +
      '});\n'
    );
  }

  return (
    "const { defineMigration } = require('@iamcalegari/mongoat');\n\n" +
    'const migration = defineMigration({\n' +
    '  async up(ctx) {\n' +
    '    // TODO: implement\n' +
    '  },\n\n' +
    '  async down(ctx) {\n' +
    '    // TODO: implement (optional — delete this to make the migration irreversible)\n' +
    '  },\n' +
    '});\n\n' +
    'exports.up = migration.up;\n' +
    'exports.down = migration.down;\n'
  );
}

/**
 * @internal
 *
 * Dependencies injected into the subcommand handlers — the seam that lets
 * `test/migrate/cli-dispatch.test.ts` exercise `status`/`to`/`up`/`down`
 * without a real `Database` connection.
 */
export type CliDeps = {
  createDatabase: () => Database;
};

const defaultDeps: CliDeps = {
  createDatabase: () =>
    new Database({
      uri: process.env.MONGODB_URI,
      dbName: process.env.MONGODB_DB_NAME,
    }),
};

async function withConnectedDatabase<T>(
  deps: CliDeps,
  fn: (database: Database) => Promise<T>
): Promise<T> {
  const database = deps.createDatabase();

  await database.connect();

  try {
    return await fn(database);
  } finally {
    await database.disconnect();
  }
}

type InterruptSignal = 'SIGINT' | 'SIGTERM';

/**
 * @internal
 *
 * Exit codes for an interrupted run — Unix 128+n convention (130 = SIGINT,
 * 143 = SIGTERM), distinct from a migration failure (1).
 */
const INTERRUPT_EXIT_CODES: Record<InterruptSignal, number> = {
  SIGINT: 130,
  SIGTERM: 143,
};

/**
 * @internal
 *
 * Matches `tsx` as a loader/import specifier — either as a path segment
 * (`.../tsx/...`, or a bare `tsx`/`tsx/esm` argv element) or as the value of
 * a `--import`/`--loader`/`--require` option. A loose `includes('tsx')`
 * substring test would false-positive on unrelated paths like
 * `/opt/tsx-utils/hook.js` and, worse, wrongly conclude the process is
 * already TS-capable — skipping a re-exec that was actually needed and
 * letting a later `import()` of a `.ts` file blow up with a raw parser error
 * instead of the actionable `TSX_NOT_AVAILABLE`.
 */
const TSX_LOADER_PATTERN =
  /(?:^|[/\\])tsx(?:[/\\]|$)|(?:^|\s)(?:--import|--loader|--require)[= ]['"]?tsx(?:[/\\]|['"]|\s|$)/;

function isRunningUnderTsx(): boolean {
  if (process.env.MONGOAT_TSX_ACTIVE === '1') return true;
  if (process.execArgv.some((arg) => TSX_LOADER_PATTERN.test(arg))) return true;
  if (TSX_LOADER_PATTERN.test(process.env.NODE_OPTIONS ?? '')) return true;

  return false;
}

function resolveTsxCliPath(): string | undefined {
  try {
    const requireFromHere = createRequire(__filename);

    return requireFromHere.resolve('tsx/cli');
  } catch {
    return undefined;
  }
}

/**
 * Re-execs the current invocation under `tsx`'s own CLI — never returns.
 */
function reExecUnderTsx(tsxCliPath: string): never {
  const entryPath = process.argv[1] ?? '';

  // While `spawnSync` blocks, the parent needs its own signal listeners.
  // Without them, a Ctrl+C (delivered to the whole process group) kills the
  // parent by the default SIGINT disposition and leaves the child — which by
  // then holds the migration lock and is applying DDL — orphaned against a
  // terminal that has already returned to the prompt. Ignoring in the parent
  // lets the child run its own two-stage graceful-stop handler and report
  // the real exit status back here.
  const ignore = (): void => {};
  let result!: ReturnType<typeof spawnSync>;

  process.on('SIGINT', ignore);
  process.on('SIGTERM', ignore);

  try {
    result = spawnSync(
      process.execPath,
      [tsxCliPath, entryPath, ...process.argv.slice(2)],
      {
        stdio: 'inherit',
        env: { ...process.env, MONGOAT_TSX_ACTIVE: '1' },
      }
    );
  } finally {
    process.off('SIGINT', ignore);
    process.off('SIGTERM', ignore);
  }

  // Spawn itself failed (`ENOENT`/`EACCES` on the runtime, `EAGAIN`,
  // `ENOMEM`): `status` is `null`. Surface the reason instead of exiting 1
  // with a silent stderr, which would be indistinguishable from a migration
  // that failed.
  if (result.error) {
    process.stderr.write(
      `Error [TSX_REEXEC_FAILED]: could not re-execute under tsx — ${result.error.message}\n`
    );
    process.exit(1);
  }

  // Child was killed by a signal (`status` is `null`, `signal` is set):
  // propagate the same 128+n convention the in-process handler uses, so a CI
  // wrapper can still tell an interrupt from a failure on the re-execed path.
  if (result.signal) {
    process.exit(INTERRUPT_EXIT_CODES[result.signal as InterruptSignal] ?? 1);
  }

  process.exit(result.status ?? 1);
}

/**
 * @internal
 *
 * `tsx` is a loader/binary, not a programmatic "transform this .ts file on
 * demand" API. Shared by both re-exec checkpoints (the config file's own
 * extension, and the migrations directory's discovered files): given
 * whether a `.ts` candidate is present, verifies the process is already
 * running under a TS-capable runtime and, if not, re-execs itself under
 * `tsx` (when the optional peer is resolvable) — never returns when it
 * does. Calling this from two different points in the same process is safe
 * specifically because it is a no-op whenever `isRunningUnderTsx()` is
 * already true: after a re-exec, the child re-enters both checkpoints and
 * finds each one a no-op, so there is still only ever one spawn per
 * process, not one per checkpoint.
 */
function reExecIfTsAndNotUnderTsx(hasTsCandidate: boolean): void {
  if (!hasTsCandidate || isRunningUnderTsx()) return;

  const tsxCliPath = resolveTsxCliPath();

  if (!tsxCliPath) {
    throw new MongoatError(
      '.ts files were found but tsx is not installed. Install it as a devDependency ' +
        '("npm install -D tsx") or compile to .js.',
      { code: 'TSX_NOT_AVAILABLE' }
    );
  }

  reExecUnderTsx(tsxCliPath);
}

/**
 * @internal
 *
 * Detects whether any DISCOVERED migration is a `.ts` file and, if so,
 * delegates to the shared re-exec guard before the runner ever attempts a
 * dynamic `import()` of a `.ts` migration file. `.js`-only migration sets
 * never trigger a re-exec — no `tsx` required. Only called by the three
 * subcommands that execute migration files (`up`/`down`/`to`); the others
 * never import a migration module and should not pay this cost.
 */
async function ensureTsCapableRuntimeForMigrations(
  config: MigrateConfig
): Promise<void> {
  const discovered = await discoverMigrations(config.dir).catch(
    (err: unknown) => {
      // A not-yet-created migrations directory is the one expected failure —
      // treat it as "no migrations". Any other error (`EACCES`, `ENOTDIR`
      // when `dir` points at a file, a transient `EMFILE`) is real: let it
      // propagate to the error boundary instead of being silently swallowed
      // into an empty list, which would skip the re-exec checkpoint and only
      // surface much later as a raw parser error from the runner's
      // `import()`.
      if ((err as NodeJS.ErrnoException | undefined)?.code === 'ENOENT') {
        return [];
      }

      throw err;
    }
  );
  const hasTsMigrations = discovered.some((entry) =>
    entry.filePath.endsWith('.ts')
  );

  reExecIfTsAndNotUnderTsx(hasTsMigrations);
}

/**
 * @internal
 *
 * Single entry point shared by all six subcommands: resolves the
 * migrations config in the order this always has to happen in, and only in
 * this order. Only `up`/`down`/`to` additionally run a second checkpoint
 * afterwards, against the discovered migration files — `create`/`status`/
 * `unlock` never import a migration file, so this is the only checkpoint
 * that can make any of them re-exec.
 *
 * The config file's PATH is resolved first — filesystem only, no
 * `import()` — because a `.ts` config file cannot be loaded by a process
 * that is not already TS-capable; deciding the re-exec before loading is
 * what makes a `.ts` config trigger a re-exec by itself, even when no
 * migration in the eventual directory is TypeScript. Only once that
 * decision is settled (and, if it re-execs, only in the child process that
 * survives it) is the file actually loaded and merged with the flag/env
 * values into the final `MigrateConfig` — whose `dir` is what the caller's
 * own second re-exec checkpoint, against the discovered migration files,
 * must check next (for `up`/`down`/`to` only). Checking the migrations
 * directory before this merge would inspect the wrong place whenever a
 * `.js`/`.json` config redirects `dir` to a folder of `.ts` migrations,
 * letting that case slip past un-re-execed until the runner's own
 * `import()` failed much later.
 *
 * Exported (rather than kept purely internal) so tests can exercise the
 * cwd-dependent discovery/ambiguity behavior with an explicit temporary
 * directory, without ever touching the real process working directory —
 * `cwd` is a parameter here, never read implicitly mid-function, the same
 * discipline `resolveConfigPath`/`loadConfigFile` already established.
 */
export async function resolveMigrateConfig(
  values: {
    'allow-no-transaction'?: boolean;
    'collection'?: string;
    'config'?: string;
    'dir'?: string;
    'lock-ttl'?: string;
  },
  cwd: string = process.cwd()
): Promise<MigrateConfig> {
  const configPath = await resolveConfigPath(cwd, values.config);

  reExecIfTsAndNotUnderTsx(
    configPath !== undefined && configPath.endsWith('.ts')
  );

  const fileConfig =
    configPath !== undefined ? await loadConfigFile(configPath) : undefined;

  return mergeMigrateConfig(values, fileConfig);
}

/**
 * @internal
 *
 * Catches any error at the CLI boundary and prints `.message`/`.code` for
 * a `MongoatError`, never `JSON.stringify`-ing the raw error (`.message`
 * is stable per `src/errors/index.ts`'s own discipline). Returns the exit
 * code instead of calling `process.exit()` directly, so handlers stay
 * testable without killing the test process.
 */
async function runWithErrorBoundary(
  fn: () => Promise<number | void>
): Promise<number> {
  try {
    const result = await fn();

    return result ?? 0;
  } catch (err: unknown) {
    if (err instanceof MongoatError) {
      // Append the underlying cause's `.message` (never its stack, never a
      // `JSON.stringify`) so a wrapper failure like `CONFIG_LOAD_FAILED` says
      // WHY — malformed JSON vs. an ESM `SyntaxError` vs. `EISDIR` — instead
      // of the same opaque line for every distinct root cause.
      const cause =
        err.cause instanceof Error ? ` (cause: ${err.cause.message})` : '';

      process.stderr.write(`Error [${err.code}]: ${err.message}${cause}\n`);
    } else {
      process.stderr.write(
        `Error: ${err instanceof Error ? err.message : String(err)}\n`
      );
    }

    return 1;
  }
}

/**
 * @internal
 *
 * Installs `SIGINT`/`SIGTERM` handlers ONLY for the duration of `run` — the
 * library itself never installs process signal handlers (that stays inside
 * `runMigrations`/`runTo`, reacting to `config.signal`); only the CLI does,
 * and only while an actual run (`up`/`down`/`to`) is in flight, never around
 * `create`/`status`/`unlock`.
 *
 * On the FIRST signal: writes an actionable warning to stderr and aborts the
 * `AbortController` threaded into `run` — the runner (already wired to
 * `config.signal`) stops gracefully between migrations. On the SECOND
 * signal: forces an immediate exit with the exit code matching the signal
 * received (130 for `SIGINT`, 143 for `SIGTERM`) — any in-flight best-effort
 * lock release either already completed or will not, and the lock
 * self-heals via its own TTL either way.
 *
 * If `run` rejects with a `MongoatError` whose `.code` is
 * `MIGRATION_ABORTED`, this maps that rejection to the exit code of the
 * signal that triggered it (130/143) — a mapping that does NOT belong in
 * `runWithErrorBoundary`'s generic catch (which always returns 1). Any other
 * error is rethrown unchanged and left to the normal error boundary (exit
 * 1). Both handlers are removed once `run` settles, so no listener leaks
 * across CLI invocations.
 */
export async function runWithSignalHandling(
  run: (signal: AbortSignal) => Promise<void>
): Promise<number> {
  const controller = new AbortController();
  let interruptCount = 0;
  let lastSignal: InterruptSignal | undefined;

  const onSignal = (signal: InterruptSignal): void => {
    interruptCount += 1;
    lastSignal = signal;

    if (interruptCount === 1) {
      process.stderr.write(
        '\n[mongoat] Interrupt received — finishing the current migration before stopping. ' +
          'Press Ctrl+C again to force exit (may leave partial DDL).\n\n'
      );
      controller.abort();

      return;
    }

    process.exitCode = INTERRUPT_EXIT_CODES[signal];
    process.exit(INTERRUPT_EXIT_CODES[signal]);
  };

  const onSigint = (): void => onSignal('SIGINT');
  const onSigterm = (): void => onSignal('SIGTERM');

  process.on('SIGINT', onSigint);
  process.on('SIGTERM', onSigterm);

  try {
    await run(controller.signal);

    return 0;
  } catch (err: unknown) {
    if (
      err instanceof MongoatError &&
      err.code === MIGRATION_ERROR_CODES.MIGRATION_ABORTED
    ) {
      process.stderr.write(`${err.message}\n`);

      return INTERRUPT_EXIT_CODES[lastSignal ?? 'SIGINT'];
    }

    throw err;
  } finally {
    process.off('SIGINT', onSigint);
    process.off('SIGTERM', onSigterm);
  }
}

export async function handleCreate(argv: string[]): Promise<number> {
  return runWithErrorBoundary(async () => {
    // `parseArgs` moved INSIDE the error boundary — `node:util`
    // `parseArgs` throws synchronously on an unknown/invalid flag
    // (`ERR_PARSE_ARGS_UNKNOWN_OPTION`); left outside, that throw becomes a
    // rejected promise with no `.catch()` at the top-level dispatch site,
    // crashing with an unhandled promise rejection instead of the clean
    // `Error [CODE]: message` this boundary is designed to produce.
    const { values, positionals } = parseArgs({
      args: argv,
      allowPositionals: true,
      options: {
        dir: { type: 'string' },
        js: { type: 'boolean', default: false },
        config: { type: 'string' },
      },
    });

    // Validated BEFORE any filesystem path is built from it — same
    // "validate before path.join" posture as `assertValidVersionArg`.
    const name = assertValidMigrationName(positionals[0]);

    // May re-exec — never returns if it does (see `resolveMigrateConfig`).
    // `create` never imports a migration FILE, so — unlike `up`/`down`/`to`
    // — it never runs the migrations-discovery checkpoint: a TypeScript
    // CONFIG file is the only reason this handler can still re-exec, and
    // that is already covered by resolving the config itself.
    const config = await resolveMigrateConfig(values);
    const extension: 'js' | 'ts' = values.js ? 'js' : 'ts';
    const fileName = `${buildTimestampVersion()}_${name}.${extension}`;
    const filePath = path.join(config.dir, fileName);

    // Defense in depth — the same containment check `discoverMigrations`
    // already performs: even a name that passed the regex above must
    // resolve to a path that stays within `dir`, now also guarding a
    // directory that may have come from a config file. Given `name` already
    // matched `^[A-Za-z0-9_-]+$` (no `.`, no separators) and `fileName` is
    // `${digits}_${name}.${ext}`, this branch is in practice unreachable — it
    // is kept deliberately, as a cheap backstop that documents the invariant
    // rather than one covering a currently-reachable escape.
    const resolvedDir = path.resolve(config.dir);
    const resolvedFilePath = path.resolve(filePath);

    if (
      resolvedFilePath !== resolvedDir &&
      !resolvedFilePath.startsWith(resolvedDir + path.sep)
    ) {
      throw new MongoatValidationError(
        `Resolved migration path "${resolvedFilePath}" escapes the migrations directory ` +
          `"${resolvedDir}"`,
        { code: 'INVALID_MIGRATION_NAME' }
      );
    }

    await mkdir(config.dir, { recursive: true });
    await writeFile(filePath, buildMigrationStub(extension));

    process.stdout.write(`Created ${filePath}\n`);
  });
}

/**
 * @internal
 *
 * `--json` only stands alone next to `--dry-run` — a real run's outcome is
 * an exit code plus a one-line human confirmation, never a parseable
 * envelope. Checked immediately after `parseArgs`, before any config
 * resolution or re-exec, so a CI author who mistypes the combination gets a
 * fast, fail-loud rejection instead of the flag being silently ignored on a
 * mutating run.
 */
function assertJsonRequiresDryRun(values: {
  'dry-run'?: boolean;
  'json'?: boolean;
}): void {
  if (values.json && !values['dry-run']) {
    throw new MongoatValidationError(
      '"--json" is only supported together with "--dry-run" on this command — ' +
        'a real run stays text-only.',
      { code: 'JSON_REQUIRES_DRY_RUN' }
    );
  }
}

/**
 * @internal
 *
 * Human-readable rendering of a dry-run plan — the ordered `version | name`
 * list `planMigrations` returned, or an explicit "nothing pending" line when
 * empty, followed by a summary line that AFFIRMS the gates already passed
 * (pending migrations are the expected dry-run result, never an error).
 */
function formatDryRunPlanText(
  command: 'to' | 'up',
  migrations: { name: string; version: string }[]
): string {
  const lines = [`Dry run: migrations "mongoat ${command}" would apply`];

  if (migrations.length === 0) {
    lines.push('(no pending migrations)');
  } else {
    for (const { version, name } of migrations) {
      lines.push(`${version} | ${name}`);
    }
  }

  lines.push(
    `checksum OK, topology OK — ${migrations.length} migration(s) would be applied`
  );

  return `${lines.join('\n')}\n`;
}

/**
 * @internal
 *
 * Shared by the `up`/`to` dry-run branches: writes exactly one plan output —
 * either the single-write minified `MigrationPlanJson` envelope (`--json`)
 * or the human-readable ordered list — never both, and never more than one
 * `process.stdout.write` call either way (mirrors `handleStatus`'s own
 * single-write JSON discipline).
 */
function writeDryRunPlan(
  command: 'to' | 'up',
  migrations: { name: string; version: string }[],
  targetVersion: string | undefined,
  asJson: boolean
): void {
  if (asJson) {
    const envelope: MigrationPlanJson = {
      schemaVersion: 1,
      command,
      targetVersion,
      migrations,
      summary: { count: migrations.length },
    };

    process.stdout.write(`${JSON.stringify(envelope)}\n`);

    return;
  }

  process.stdout.write(formatDryRunPlanText(command, migrations));
}

export async function handleUp(
  argv: string[],
  deps: CliDeps = defaultDeps
): Promise<number> {
  // `parseArgs`/`mergeMigrateConfig` moved INSIDE the error boundary (see
  // `handleCreate`'s comment for the full rationale).
  return runWithErrorBoundary(async () => {
    const { values } = parseArgs({
      args: argv,
      options: {
        'dir': { type: 'string' },
        'collection': { type: 'string' },
        'allow-no-transaction': { type: 'boolean' },
        'lock-ttl': { type: 'string' },
        'config': { type: 'string' },
        'dry-run': { type: 'boolean' },
        'json': { type: 'boolean' },
      },
    });

    assertJsonRequiresDryRun(values);

    // May re-exec — never returns if it does (see `resolveMigrateConfig`).
    const config = await resolveMigrateConfig(values);

    // May ALSO re-exec — never returns if it does. A dry-run imports
    // migration files too (it still has to plan against them), so it
    // participates in this checkpoint exactly like a real run.
    await ensureTsCapableRuntimeForMigrations(config);

    // Reached exactly once: both re-exec checkpoints above exit the
    // process whenever they trigger, so only the process that actually
    // proceeds past both of them ever reaches this line. Skipped entirely
    // during a dry-run — its literal "will run WITHOUT a transaction" text
    // would be false when nothing is about to run; the topology gate
    // inside `planMigrations` still honors `config.allowNoTransaction`.
    if (!values['dry-run']) warnAllowNoTransaction(config.allowNoTransaction);

    if (values['dry-run']) {
      // Shaped like `handleStatus`, NOT the mutating path below: a single
      // connected read, no lock, no signal handling, nothing to interrupt.
      const plan = await withConnectedDatabase(deps, (database) =>
        planMigrations(database, config)
      );

      writeDryRunPlan('up', plan.migrations, undefined, Boolean(values.json));

      // Pending migrations are the expected dry-run result, never an
      // error — contrast with `status`, which exits non-zero on pending.
      return 0;
    }

    const exitCode = await runWithSignalHandling((signal) =>
      withConnectedDatabase(deps, (database) =>
        runMigrations(database, { ...config, signal })
      )
    );

    if (exitCode === 0) process.stdout.write('Migrations applied.\n');

    return exitCode;
  });
}

export async function handleDown(
  argv: string[],
  deps: CliDeps = defaultDeps
): Promise<number> {
  // `parseArgs`/`mergeMigrateConfig` moved INSIDE the error boundary (see
  // `handleCreate`'s comment for the full rationale).
  return runWithErrorBoundary(async () => {
    const { values, positionals } = parseArgs({
      args: argv,
      allowPositionals: true,
      options: {
        'dir': { type: 'string' },
        'collection': { type: 'string' },
        'allow-no-transaction': { type: 'boolean' },
        'lock-ttl': { type: 'string' },
        'config': { type: 'string' },
      },
    });

    // May re-exec — never returns if it does (see `resolveMigrateConfig`).
    const config = await resolveMigrateConfig(values);
    const version = assertValidVersionArg(positionals[0], 'down');

    // May ALSO re-exec — never returns if it does.
    await ensureTsCapableRuntimeForMigrations(config);

    // Reached exactly once: both re-exec checkpoints above exit the
    // process whenever they trigger, so only the process that actually
    // proceeds past both of them ever reaches this line.
    warnAllowNoTransaction(config.allowNoTransaction);

    const exitCode = await runWithSignalHandling((signal) =>
      withConnectedDatabase(deps, (database) =>
        revertMigration(database, version, { ...config, signal })
      )
    );

    if (exitCode === 0) {
      process.stdout.write(`Reverted migration ${version}.\n`);
    }

    return exitCode;
  });
}

export async function handleTo(
  argv: string[],
  deps: CliDeps = defaultDeps
): Promise<number> {
  // `parseArgs`/`mergeMigrateConfig` moved INSIDE the error boundary (see
  // `handleCreate`'s comment for the full rationale).
  return runWithErrorBoundary(async () => {
    const { values, positionals } = parseArgs({
      args: argv,
      allowPositionals: true,
      options: {
        'dir': { type: 'string' },
        'collection': { type: 'string' },
        'allow-no-transaction': { type: 'boolean' },
        'lock-ttl': { type: 'string' },
        'config': { type: 'string' },
        'dry-run': { type: 'boolean' },
        'json': { type: 'boolean' },
      },
    });

    assertJsonRequiresDryRun(values);

    // May re-exec — never returns if it does (see `resolveMigrateConfig`).
    const config = await resolveMigrateConfig(values);
    const version = assertValidVersionArg(positionals[0], 'to');

    // May ALSO re-exec — never returns if it does. A dry-run imports
    // migration files too (it still has to plan against them), so it
    // participates in this checkpoint exactly like a real run.
    await ensureTsCapableRuntimeForMigrations(config);

    // Reached exactly once: both re-exec checkpoints above exit the
    // process whenever they trigger, so only the process that actually
    // proceeds past both of them ever reaches this line. Skipped entirely
    // during a dry-run — its literal "will run WITHOUT a transaction" text
    // would be false when nothing is about to run; the topology gate
    // inside `planMigrations` still honors `config.allowNoTransaction`.
    if (!values['dry-run']) warnAllowNoTransaction(config.allowNoTransaction);

    if (values['dry-run']) {
      // Shaped like `handleStatus`, NOT the mutating path below: a single
      // connected read, no lock, no signal handling, nothing to interrupt.
      const plan = await withConnectedDatabase(deps, (database) =>
        planMigrations(database, config, version)
      );

      writeDryRunPlan('to', plan.migrations, version, Boolean(values.json));

      // Pending migrations are the expected dry-run result, never an
      // error — contrast with `status`, which exits non-zero on pending.
      return 0;
    }

    const exitCode = await runWithSignalHandling((signal) =>
      withConnectedDatabase(deps, (database) =>
        runTo(database, version, { ...config, signal })
      )
    );

    if (exitCode === 0) process.stdout.write(`Migrated to ${version}.\n`);

    return exitCode;
  });
}

/**
 * @internal
 *
 * Dry by default, `--force` deletes: with no flag, reports the
 * current lock diagnostic (if any) and a risk warning on stderr, without
 * deleting anything; with `--force`, deletes the lock unconditionally
 * (including a non-expired one — that is its intended use case). Idempotent
 * either way — no lock present is reported as "nothing to do", exit 0, never
 * an error.
 */
export async function handleUnlock(
  argv: string[],
  deps: CliDeps = defaultDeps
): Promise<number> {
  // `parseArgs`/`mergeMigrateConfig` moved INSIDE the error boundary (see
  // `handleCreate`'s comment for the full rationale).
  return runWithErrorBoundary(async () => {
    const { values } = parseArgs({
      args: argv,
      options: {
        dir: { type: 'string' },
        collection: { type: 'string' },
        force: { type: 'boolean', default: false },
        config: { type: 'string' },
      },
    });

    // May re-exec — never returns if it does (see `resolveMigrateConfig`).
    // `unlock` never imports a migration file, so — like `create` and
    // `status` — it never runs the migrations-discovery checkpoint; only a
    // TypeScript config file can still trigger a re-exec here.
    const config = await resolveMigrateConfig(values);

    await withConnectedDatabase(deps, async (database) => {
      if (values.force) {
        const result = await forceUnlock(database, config);

        if (result.removed && result.lock) {
          process.stdout.write(
            `Removed migration lock (was ${formatLockDiagnostic(result.lock)}).\n`
          );
        } else {
          process.stdout.write('No lock found — nothing to do.\n');
        }

        return;
      }

      const status = await getLockStatus(database, config);

      if (status.held) {
        process.stdout.write(
          `Migration lock is ${formatLockDiagnostic(status.lock)}.\n`
        );
        process.stderr.write(
          '\n[mongoat] This lock was NOT removed. Run "mongoat unlock --force" only if you ' +
            'are certain no migration is currently running — forcing an unlock while a run is ' +
            'in progress can let two runners execute concurrently.\n\n'
        );
      } else {
        process.stdout.write('No lock found — nothing to do.\n');
      }
    });
  });
}

/**
 * @internal
 *
 * Single pass over the discovered rows building the JSON envelope's
 * aggregate counts. `applied`/`failed`/`pending` are a tri-state partition
 * over `total` (mirroring the same failed > applied > pending precedence
 * `formatStatusTable` uses to label a row) — a row is counted into exactly
 * one of the three. `drifted` is tallied INDEPENDENTLY of that partition: a
 * row that is both applied and drifted increments both counts, since drift
 * only ever applies to an already-applied migration.
 */
export function summarizeStatusRows(
  rows: MigrationStatusRow[]
): MigrationStatusSummary {
  const summary: MigrationStatusSummary = {
    applied: 0,
    drifted: 0,
    failed: 0,
    pending: 0,
    total: rows.length,
  };

  for (const row of rows) {
    if (row.failed) {
      summary.failed += 1;
    } else if (row.applied) {
      summary.applied += 1;
    } else {
      summary.pending += 1;
    }

    if (row.drifted) summary.drifted += 1;
  }

  return summary;
}

/**
 * @internal
 *
 * Derives the `status` exit code from the summary alone — never re-reading
 * the raw rows — so the exit code and the JSON payload (also built from this
 * same summary) can never disagree. Most-severe-wins: any failed or drifted
 * migration outranks any number of merely pending ones, and a pending
 * migration outranks a fully clean state.
 */
export function computeStatusExitCode(summary: MigrationStatusSummary): number {
  if (summary.failed > 0 || summary.drifted > 0) return 3;
  if (summary.pending > 0) return 2;

  return 0;
}

/**
 * @internal
 *
 * Projects one `MigrationStatusRow` into its always-present JSON shape.
 * Never spreads `row` itself — an optional/undefined source field would
 * silently vanish from the serialized object instead of surfacing as an
 * explicit `null`/`false`. `state` mirrors `formatStatusTable`'s own
 * failed > applied > pending label precedence.
 *
 * `appliedAt` goes through `safeIsoOrNull` for the same reason the sibling
 * lock projection does: it is copied straight out of the control collection
 * and is only TRUSTED to be a `Date` by convention. A record written by hand,
 * by a future/incompatible version, or carrying a BSON date outside the JS
 * `Date` range would otherwise take the whole command down with a raw
 * `RangeError`/`TypeError` that has no `.code` and is indistinguishable from
 * a connection failure.
 */
export function toStatusJsonRow(
  row: MigrationStatusRow
): MigrationStatusJsonRow {
  return {
    version: row.version,
    name: row.name,
    state: row.failed ? 'failed' : row.applied ? 'applied' : 'pending',
    drifted: row.drifted ?? false,
    appliedAt: safeIsoOrNull(row.appliedAt),
  };
}

/**
 * @internal
 *
 * Projects a `LockStatus` into its JSON shape. A free lock carries no other
 * field. A held lock's date fields go through `safeIsoOrNull` so a
 * corrupted `acquiredAt`/`expiresAt` degrades to `null` instead of leaking a
 * raw non-ISO value into a field a downstream script would parse as a date.
 */
export function toLockJson(status: LockStatus): MigrationLockJson {
  if (!status.held) return { held: false };

  return {
    held: true,
    hostname: status.lock.hostname,
    pid: status.lock.pid,
    operation: status.lock.operation,
    ownerId: status.lock.ownerId,
    acquiredAt: safeIsoOrNull(status.lock.acquiredAt),
    expiresAt: safeIsoOrNull(status.lock.expiresAt),
  };
}

function formatStatusTable(rows: MigrationStatusRow[]): string {
  const lines = ['version | name | applied'];

  for (const row of rows) {
    // A `status: 'failed'` record is surfaced as its own distinct
    // "failed" label — never as "applied" (a migration that failed, or
    // never ran at all, must not be reported as applied).
    const appliedLabel = row.applied
      ? row.drifted
        ? 'applied (DRIFTED)'
        : 'applied'
      : row.failed
        ? 'failed'
        : 'pending';

    lines.push(`${row.version} | ${row.name} | ${appliedLabel}`);
  }

  if (rows.length === 0) {
    lines.push('(no migrations found)');
  }

  return `${lines.join('\n')}\n`;
}

export async function handleStatus(
  argv: string[],
  deps: CliDeps = defaultDeps
): Promise<number> {
  // `parseArgs`/`mergeMigrateConfig` moved INSIDE the error boundary (see
  // `handleCreate`'s comment for the full rationale).
  return runWithErrorBoundary(async () => {
    const { values } = parseArgs({
      args: argv,
      options: {
        dir: { type: 'string' },
        collection: { type: 'string' },
        config: { type: 'string' },
        json: { type: 'boolean' },
      },
    });

    // May re-exec — never returns if it does (see `resolveMigrateConfig`).
    // `status` never imports a migration file, so it never runs the
    // migrations-discovery checkpoint either — same reasoning as `create`.
    const config = await resolveMigrateConfig(values);
    const { rows, lockStatus } = await withConnectedDatabase(
      deps,
      async (database) => ({
        rows: await getStatus(database, config),
        lockStatus: await getLockStatus(database, config),
      })
    );

    // Computed exactly once — the single source of truth both the JSON
    // envelope's `summary` field and the returned exit code read from below,
    // so `jq '.summary.failed'` and `$?` can never disagree.
    const summary = summarizeStatusRows(rows);

    if (values.json) {
      const envelope: MigrationStatusJson = {
        schemaVersion: 1,
        migrations: rows.map(toStatusJsonRow),
        summary,
        lock: toLockJson(lockStatus),
      };

      // Exactly one write of a fully-constructed, minified object — never
      // multiple `process.stdout.write` calls, and nothing else touches
      // stdout in this branch: a CI pipeline reading this stream must see
      // valid JSON or nothing, never interleaved human text.
      process.stdout.write(`${JSON.stringify(envelope)}\n`);
    } else {
      process.stdout.write(formatStatusTable(rows));
      process.stdout.write(
        `lock: ${lockStatus.held ? formatLockDiagnostic(lockStatus.lock) : 'free'}\n`
      );
    }

    // Replaces the previous implicit `undefined` return, which made
    // `runWithErrorBoundary`'s `result ?? 0` always resolve to 0 regardless
    // of the real migration state.
    return computeStatusExitCode(summary);
  });
}

const COMMANDS: Record<
  string,
  (argv: string[], deps?: CliDeps) => Promise<number>
> = {
  create: handleCreate,
  up: handleUp,
  down: handleDown,
  to: handleTo,
  status: handleStatus,
  unlock: handleUnlock,
};

/**
 * @internal
 *
 * One `parseArgs` call per subcommand, each with
 * its own flag set; an unknown/missing subcommand prints the available
 * commands to stderr and reports a non-zero exit code. Returns the exit
 * code (never calls `process.exit()` itself) so it stays fully testable.
 */
export async function dispatch(
  argv: string[],
  deps: CliDeps = defaultDeps
): Promise<number> {
  const [subcommand, ...rest] = argv;
  // `Object.hasOwn` — a plain `COMMANDS[subcommand]` lookup falls
  // through to `Object.prototype` for names like `toString`/`constructor`/
  // `__proto__`, either returning a truthy non-function (`handler is not a
  // function`) or silently INVOKING an inherited function (`toString`)
  // instead of ever reaching the "Unknown command" branch below.
  const handler =
    subcommand && Object.hasOwn(COMMANDS, subcommand)
      ? COMMANDS[subcommand]
      : undefined;

  if (!handler) {
    process.stderr.write(
      `Unknown command: "${subcommand ?? ''}". Available: ${Object.keys(COMMANDS).join(', ')}\n`
    );

    return 1;
  }

  return handler(rest, deps);
}

// The published bin (`lib/mongoat.cjs`) is invoked via the symlink
// npm creates at `node_modules/.bin/mongoat` on Unix. A `pathToFileURL`
// comparison between `__filename` (Node resolves the module's REAL path,
// following the symlink, by default) and `process.argv[1]` (the symlink
// path itself, left unresolved) always diverges under that install path —
// `dispatch()` would never run and the CLI would silently exit 0. Since the
// published bin is CJS, `require.main === module` is the canonical check:
// both sides are the same in-process object, immune to how the entry point
// was invoked (direct path, npm symlink, or `.cmd` shim on Windows).
const isMainModule = require.main === module;

if (isMainModule) {
  // Defense-in-depth `.catch()` at the true top-level boundary — on
  // top of moving `parseArgs` inside `runWithErrorBoundary` in every
  // handler above, this ensures ANY rejection that somehow escapes a
  // handler (present or future) still exits cleanly instead of surfacing
  // as an unhandled promise rejection / raw stack trace.
  dispatch(process.argv.slice(2))
    .then((code) => {
      process.exitCode = code;
    })
    .catch((err: unknown) => {
      process.stderr.write(
        `Error: ${err instanceof Error ? err.message : String(err)}\n`
      );
      process.exitCode = 1;
    });
}
