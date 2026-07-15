#!/usr/bin/env node
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

import { Database } from '@/database';
import { MongoatError, MongoatValidationError } from '@/errors';
import { getStatus, revertMigration, runMigrations, runTo } from '@/migrate';
import {
  discoverMigrations,
  MIGRATION_VERSION_REGEX,
} from '@/migrate/discover';
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

function buildConfig(values: {
  'allow-no-transaction'?: boolean;
  'collection'?: string;
  'dir'?: string;
}): MigrateConfig {
  return {
    dir: resolveMigrationsDir(values.dir),
    collection: resolveMigrationsCollection(values.collection),
    allowNoTransaction: Boolean(values['allow-no-transaction']),
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
async function runWithErrorBoundary(fn: () => Promise<void>): Promise<number> {
  try {
    await fn();

    return 0;
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

export async function handleCreate(argv: string[]): Promise<number> {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      dir: { type: 'string' },
      js: { type: 'boolean', default: false },
    },
  });

  return runWithErrorBoundary(async () => {
    const [name] = positionals;

    if (!name) {
      throw new MongoatValidationError(
        'Usage: mongoat create <name> [--dir <path>] [--js]',
        { code: 'MISSING_MIGRATION_NAME' }
      );
    }

    const dir = resolveMigrationsDir(values.dir);
    const extension: 'js' | 'ts' = values.js ? 'js' : 'ts';
    const fileName = `${buildTimestampVersion()}_${name}.${extension}`;
    const filePath = path.join(dir, fileName);

    await mkdir(dir, { recursive: true });
    await writeFile(filePath, buildMigrationStub(extension));

    process.stdout.write(`Created ${filePath}\n`);
  });
}

export async function handleUp(
  argv: string[],
  deps: CliDeps = defaultDeps
): Promise<number> {
  const { values } = parseArgs({
    args: argv,
    options: {
      'dir': { type: 'string' },
      'collection': { type: 'string' },
      'allow-no-transaction': { type: 'boolean', default: false },
    },
  });

  const config = buildConfig(values);

  return runWithErrorBoundary(async () => {
    warnAllowNoTransaction(config.allowNoTransaction);
    await ensureTsCapableRuntime(config);
    await withConnectedDatabase(deps, (database) =>
      runMigrations(database, config)
    );
    process.stdout.write('Migrations applied.\n');
  });
}

export async function handleDown(
  argv: string[],
  deps: CliDeps = defaultDeps
): Promise<number> {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      'dir': { type: 'string' },
      'collection': { type: 'string' },
      'allow-no-transaction': { type: 'boolean', default: false },
    },
  });

  const config = buildConfig(values);

  return runWithErrorBoundary(async () => {
    const version = assertValidVersionArg(positionals[0], 'down');

    warnAllowNoTransaction(config.allowNoTransaction);
    await ensureTsCapableRuntime(config);
    await withConnectedDatabase(deps, (database) =>
      revertMigration(database, version, config)
    );
    process.stdout.write(`Reverted migration ${version}.\n`);
  });
}

export async function handleTo(
  argv: string[],
  deps: CliDeps = defaultDeps
): Promise<number> {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      'dir': { type: 'string' },
      'collection': { type: 'string' },
      'allow-no-transaction': { type: 'boolean', default: false },
    },
  });

  const config = buildConfig(values);

  return runWithErrorBoundary(async () => {
    const version = assertValidVersionArg(positionals[0], 'to');

    warnAllowNoTransaction(config.allowNoTransaction);
    await ensureTsCapableRuntime(config);
    await withConnectedDatabase(deps, (database) =>
      runTo(database, version, config)
    );
    process.stdout.write(`Migrated to ${version}.\n`);
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
  const { values } = parseArgs({
    args: argv,
    options: {
      dir: { type: 'string' },
      collection: { type: 'string' },
    },
  });

  const config = buildConfig(values);

  return runWithErrorBoundary(async () => {
    const rows = await withConnectedDatabase(deps, (database) =>
      getStatus(database, config)
    );

    process.stdout.write(formatStatusTable(rows));
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
  const handler = subcommand ? COMMANDS[subcommand] : undefined;

  if (!handler) {
    process.stderr.write(
      `Unknown command: "${subcommand ?? ''}". Available: ${Object.keys(COMMANDS).join(', ')}\n`
    );

    return 1;
  }

  return handler(rest, deps);
}

const isMainModule =
  process.argv[1] !== undefined &&
  pathToFileURL(__filename).href === pathToFileURL(process.argv[1]).href;

if (isMainModule) {
  dispatch(process.argv.slice(2)).then((code) => {
    process.exitCode = code;
  });
}
