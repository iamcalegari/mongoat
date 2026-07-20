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
  revertMigration,
  runMigrations,
  runTo,
} from '@/migrate';
import {
  discoverMigrations,
  MIGRATION_VERSION_REGEX,
} from '@/migrate/discover';
import { MIGRATION_ERROR_CODES } from '@/migrate/errors';
import { DEFAULT_LOCK_TTL_MS, formatLockDiagnostic } from '@/migrate/lock';
import type { MigrateConfig, MigrationStatusRow } from '@/types/migrate';

const DEFAULT_MIGRATIONS_DIR = 'migrations';
const DEFAULT_MIGRATIONS_COLLECTION = '_migrations';

/**
 * @internal
 *
 * Resolution precedence for the migrations dir/control-collection (Open
 * Question 1, RESEARCH.md): CLI flag → env var → default. Follows the
 * project's established "no config file" convention (`DatabaseConfig`
 * only ever reads env vars/constructor args).
 */
function resolveMigrationsDir(flagValue?: string): string {
  return (
    flagValue ?? process.env.MONGOAT_MIGRATIONS_DIR ?? DEFAULT_MIGRATIONS_DIR
  );
}

function resolveMigrationsCollection(flagValue?: string): string {
  return (
    flagValue ??
    process.env.MONGOAT_MIGRATIONS_COLLECTION ??
    DEFAULT_MIGRATIONS_COLLECTION
  );
}

/**
 * @internal
 *
 * Same flag → env var → default precedence as `resolveMigrationsDir`, but
 * unlike that helper, a value supplied here (flag or env) is parsed and
 * validated BEFORE it is ever returned — same "validate before use" posture
 * as `assertValidVersionArg`. Must be a positive integer number of
 * milliseconds; anything else (non-numeric, fractional, zero, negative)
 * fails loud here, before it can ever become an invalid `expiresAt` in the
 * driver.
 */
function resolveLockTtlMs(flagValue?: string): number {
  const raw = flagValue ?? process.env.MONGOAT_MIGRATIONS_LOCK_TTL;

  if (raw === undefined) return DEFAULT_LOCK_TTL_MS;

  const parsed = Number(raw);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new MongoatValidationError(
      '"--lock-ttl" (or its environment-variable equivalent) must be a positive integer ' +
        `number of milliseconds — received "${raw}"`,
      { code: 'INVALID_LOCK_TTL' }
    );
  }

  return parsed;
}

function buildConfig(values: {
  'allow-no-transaction'?: boolean;
  'collection'?: string;
  'dir'?: string;
  'lock-ttl'?: string;
}): MigrateConfig {
  return {
    dir: resolveMigrationsDir(values.dir),
    collection: resolveMigrationsCollection(values.collection),
    allowNoTransaction: Boolean(values['allow-no-transaction']),
    lockTtlMs: resolveLockTtlMs(values['lock-ttl']),
  };
}

/**
 * @internal
 *
 * T-08-01 — the `to <version>`/`down <version>` CLI argument MUST be
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
 * WR-03 — mirrors the same "validate before building any filesystem path"
 * posture `assertValidVersionArg`/T-08-01 already applies to the `to`/`down`
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
 * T-08-03 — writes a loud, non-suppressible warning to `process.stderr`
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
 * Builds a `YYYYMMDDHHMMSS` version string (D-01) from the given `date`
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

/**
 * @internal
 *
 * Pitfall 2 (RESEARCH.md) — `tsx` is a loader/binary, not a programmatic
 * "transform this .ts file on demand" API. Detects whether any DISCOVERED
 * migration is a `.ts` file, and if so, verifies the process is already
 * running under a TS-capable runtime (`tsx`, or re-execs itself under it
 * when the optional peer is resolvable) before the runner ever attempts a
 * dynamic `import()` of a `.ts` migration file. `.js`-only migration sets
 * never touch this path — no `tsx` required.
 */
async function ensureTsCapableRuntime(config: MigrateConfig): Promise<void> {
  const discovered = await discoverMigrations(config.dir).catch(() => []);
  const hasTsMigrations = discovered.some((entry) =>
    entry.filePath.endsWith('.ts')
  );

  if (!hasTsMigrations || isRunningUnderTsx()) return;

  const tsxCliPath = resolveTsxCliPath();

  if (!tsxCliPath) {
    throw new MongoatError(
      '.ts migrations were found but tsx is not installed. Install it as a devDependency ' +
        '("npm install -D tsx") or compile your migrations to .js.',
      { code: 'TSX_NOT_AVAILABLE' }
    );
  }

  reExecUnderTsx(tsxCliPath);
}

function isRunningUnderTsx(): boolean {
  if (process.env.MONGOAT_TSX_ACTIVE === '1') return true;
  if (process.execArgv.some((arg) => arg.includes('tsx'))) return true;
  if (process.env.NODE_OPTIONS?.includes('tsx')) return true;

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
  const result = spawnSync(
    process.execPath,
    [tsxCliPath, entryPath, ...process.argv.slice(2)],
    {
      stdio: 'inherit',
      env: { ...process.env, MONGOAT_TSX_ACTIVE: '1' },
    }
  );

  process.exit(result.status ?? 1);
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
      process.stderr.write(`Error [${err.code}]: ${err.message}\n`);
    } else {
      process.stderr.write(
        `Error: ${err instanceof Error ? err.message : String(err)}\n`
      );
    }

    return 1;
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
    // WR-02: `parseArgs` moved INSIDE the error boundary — `node:util`
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
      },
    });

    // WR-03: validated BEFORE any filesystem path is built from it — same
    // "validate before path.join" posture as `assertValidVersionArg`.
    const name = assertValidMigrationName(positionals[0]);

    const dir = resolveMigrationsDir(values.dir);
    const extension: 'js' | 'ts' = values.js ? 'js' : 'ts';
    const fileName = `${buildTimestampVersion()}_${name}.${extension}`;
    const filePath = path.join(dir, fileName);

    // Defense in depth — the same containment check `discoverMigrations`
    // already performs (T-08-01): even a name that passed the regex above
    // must resolve to a path that stays within `dir`.
    const resolvedDir = path.resolve(dir);
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

    await mkdir(dir, { recursive: true });
    await writeFile(filePath, buildMigrationStub(extension));

    process.stdout.write(`Created ${filePath}\n`);
  });
}

export async function handleUp(
  argv: string[],
  deps: CliDeps = defaultDeps
): Promise<number> {
  // WR-02: `parseArgs`/`buildConfig` moved INSIDE the error boundary (see
  // `handleCreate`'s comment for the full rationale).
  return runWithErrorBoundary(async () => {
    const { values } = parseArgs({
      args: argv,
      options: {
        'dir': { type: 'string' },
        'collection': { type: 'string' },
        'allow-no-transaction': { type: 'boolean', default: false },
        'lock-ttl': { type: 'string' },
      },
    });

    const config = buildConfig(values);

    warnAllowNoTransaction(config.allowNoTransaction);
    await ensureTsCapableRuntime(config);

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
  // WR-02: `parseArgs`/`buildConfig` moved INSIDE the error boundary (see
  // `handleCreate`'s comment for the full rationale).
  return runWithErrorBoundary(async () => {
    const { values, positionals } = parseArgs({
      args: argv,
      allowPositionals: true,
      options: {
        'dir': { type: 'string' },
        'collection': { type: 'string' },
        'allow-no-transaction': { type: 'boolean', default: false },
        'lock-ttl': { type: 'string' },
      },
    });

    const config = buildConfig(values);
    const version = assertValidVersionArg(positionals[0], 'down');

    warnAllowNoTransaction(config.allowNoTransaction);
    await ensureTsCapableRuntime(config);

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
  // WR-02: `parseArgs`/`buildConfig` moved INSIDE the error boundary (see
  // `handleCreate`'s comment for the full rationale).
  return runWithErrorBoundary(async () => {
    const { values, positionals } = parseArgs({
      args: argv,
      allowPositionals: true,
      options: {
        'dir': { type: 'string' },
        'collection': { type: 'string' },
        'allow-no-transaction': { type: 'boolean', default: false },
        'lock-ttl': { type: 'string' },
      },
    });

    const config = buildConfig(values);
    const version = assertValidVersionArg(positionals[0], 'to');

    warnAllowNoTransaction(config.allowNoTransaction);
    await ensureTsCapableRuntime(config);

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
 * Dry by default, `--force` deletes (D-06): with no flag, reports the
 * current lock diagnostic (if any) and a risk warning on stderr, without
 * deleting anything; with `--force`, deletes the lock unconditionally
 * (including a non-expired one — that is its intended use case). Idempotent
 * either way — no lock present is reported as "nothing to do", exit 0, never
 * an error (D-07).
 */
export async function handleUnlock(
  argv: string[],
  deps: CliDeps = defaultDeps
): Promise<number> {
  // WR-02: `parseArgs`/`buildConfig` moved INSIDE the error boundary (see
  // `handleCreate`'s comment for the full rationale).
  return runWithErrorBoundary(async () => {
    const { values } = parseArgs({
      args: argv,
      options: {
        'dir': { type: 'string' },
        'collection': { type: 'string' },
        'force': { type: 'boolean', default: false },
      },
    });

    const config = buildConfig(values);

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

function formatStatusTable(rows: MigrationStatusRow[]): string {
  const lines = ['version | name | applied'];

  for (const row of rows) {
    // WR-01: a `status: 'failed'` record is surfaced as its own distinct
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
  // WR-02: `parseArgs`/`buildConfig` moved INSIDE the error boundary (see
  // `handleCreate`'s comment for the full rationale).
  return runWithErrorBoundary(async () => {
    const { values } = parseArgs({
      args: argv,
      options: {
        dir: { type: 'string' },
        collection: { type: 'string' },
      },
    });

    const config = buildConfig(values);
    const { rows, lockStatus } = await withConnectedDatabase(
      deps,
      async (database) => ({
        rows: await getStatus(database, config),
        lockStatus: await getLockStatus(database, config),
      })
    );

    process.stdout.write(formatStatusTable(rows));
    process.stdout.write(
      `lock: ${lockStatus.held ? formatLockDiagnostic(lockStatus.lock) : 'free'}\n`
    );
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
 * Pattern 4 (RESEARCH.md) — one `parseArgs` call per subcommand, each with
 * its own flag set; an unknown/missing subcommand prints the available
 * commands to stderr and reports a non-zero exit code. Returns the exit
 * code (never calls `process.exit()` itself) so it stays fully testable.
 */
export async function dispatch(
  argv: string[],
  deps: CliDeps = defaultDeps
): Promise<number> {
  const [subcommand, ...rest] = argv;
  // WR-01: `Object.hasOwn` — a plain `COMMANDS[subcommand]` lookup falls
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

// CR-01: the published bin (`lib/mongoat.cjs`) is invoked via the symlink
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
  // WR-02: defense-in-depth `.catch()` at the true top-level boundary — on
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
