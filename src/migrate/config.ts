import { access, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { MongoatError, MongoatValidationError } from '@/errors';
import type { MongoatMigrationsConfig } from '@/types/migrate';

/**
 * @internal
 *
 * Leaf module (imports only `@/errors`, `@/types/migrate` and Node
 * builtins — never `@/bin/mongoat`, which imports this module) for
 * discovering, loading, normalizing and validating a
 * `mongoat.config.{json,js,ts}` file. Independently unit-testable without
 * spinning up the CLI, same discipline `src/migrate/db.ts` already
 * established for `getNativeDbOrThrow`.
 */
export const CONFIG_BASENAMES = [
  'mongoat.config.json',
  'mongoat.config.js',
  'mongoat.config.ts',
] as const;

/**
 * @internal
 *
 * Extensions accepted both by the cwd probe (`CONFIG_BASENAMES`) and by an
 * explicit `--config <path>` argument.
 */
export const ALLOWED_CONFIG_EXTENSIONS = new Set(
  CONFIG_BASENAMES.map((basename) => path.extname(basename))
);

const ALLOWED_CONFIG_KEYS: readonly string[] = [
  'allowNoTransaction',
  'collection',
  'dir',
  'lockTtlMs',
];

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function describeExportType(value: unknown): string {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (Array.isArray(value)) return 'an array';

  const type = typeof value;

  // Consistent article across every branch — otherwise the message reads
  // "received an array" next to "received function".
  return type === 'object' ? 'an object' : `a ${type}`;
}

/**
 * @internal
 *
 * Resolves the migrations config file path for a given `cwd`. `cwd` is
 * always an explicit parameter — this function never reads the process's
 * own working directory, which is global state and would tie any caller to
 * serial execution.
 *
 * SECURITY: a `.js`/`.ts` config file is CODE, executed by `loadConfigFile`
 * with the full privileges of whoever invoked the CLI. Two consequences
 * worth being explicit about: (1) the no-argument cwd probe below runs
 * `mongoat.config.js` AUTOMATICALLY, with no flag — cloning a repository and
 * running `mongoat status` in it is enough to execute third-party code, the
 * same trust model as `vite`/`jest`/`eslint` config files; (2) a relative
 * `--config` is confined to the working directory (a `../` escape fails
 * loud), since the one input that leads to executing code should not also be
 * the one that can reach outside the project — an absolute path stays
 * allowed as a deliberate, explicit escape hatch.
 *
 * With `explicitPath`: the extension is validated against
 * `ALLOWED_CONFIG_EXTENSIONS` BEFORE any filesystem access (same
 * "validate before use" posture already applied to the CLI's other
 * argument validators), then confined to `cwd` (relative only), resolved
 * and checked for readability — an unreadable/missing explicit path is a
 * fail-loud error, since it was an explicit request.
 *
 * Without `explicitPath`: probes all three known basenames in the cwd,
 * without short-circuiting on the first match — short-circuiting would
 * make detecting ambiguity impossible. Only a regular FILE counts (a
 * directory named `mongoat.config.js` is ignored). Zero matches resolves
 * silently to `undefined` (the file is optional); two or more matches fail
 * loud, listing every file found.
 */
export async function resolveConfigPath(
  cwd: string,
  explicitPath?: string
): Promise<string | undefined> {
  if (explicitPath !== undefined) {
    const ext = path.extname(explicitPath);

    if (!ALLOWED_CONFIG_EXTENSIONS.has(ext)) {
      throw new MongoatValidationError(
        `"--config" must point to one of ${[...ALLOWED_CONFIG_EXTENSIONS].join(', ')} — received "${explicitPath}"`,
        { code: 'INVALID_CONFIG_PATH' }
      );
    }

    const resolved = path.resolve(cwd, explicitPath);
    const resolvedCwd = path.resolve(cwd);

    // A relative `--config` must stay inside the working directory; an
    // absolute path is a deliberate escape hatch (see this function's
    // SECURITY note).
    if (
      !path.isAbsolute(explicitPath) &&
      resolved !== resolvedCwd &&
      !resolved.startsWith(resolvedCwd + path.sep)
    ) {
      throw new MongoatValidationError(
        `"--config" relative path "${explicitPath}" escapes the working directory`,
        { code: 'INVALID_CONFIG_PATH' }
      );
    }

    try {
      await access(resolved);
    } catch (err) {
      throw new MongoatValidationError(
        `Config file not found or unreadable at "${resolved}"`,
        { cause: err, code: 'CONFIG_NOT_FOUND' }
      );
    }

    return resolved;
  }

  const found: string[] = [];

  for (const basename of CONFIG_BASENAMES) {
    const candidate = path.join(cwd, basename);

    try {
      // `stat().isFile()`, not a bare `access()`: `access` succeeds for a
      // DIRECTORY named `mongoat.config.js`, which would then be pushed as a
      // phantom match (and could even trip the ambiguity error) despite not
      // being a loadable config file.
      const info = await stat(candidate);

      if (info.isFile()) found.push(candidate);
    } catch {
      // Basename not present in this cwd — keep probing the remaining
      // ones; a missing file here is expected, not an error.
    }
  }

  if (found.length === 0) return undefined;

  if (found.length > 1) {
    throw new MongoatValidationError(
      `Multiple migrations config files found in the same directory: ${found.join(', ')} — keep only one, or pass "--config" to pick one explicitly.`,
      { code: 'AMBIGUOUS_CONFIG' }
    );
  }

  return found[0];
}

/**
 * @internal
 *
 * Unwraps ESM/CJS module-namespace interop before the object reaches
 * validation. Two conditional unwrap steps:
 *
 * 1. If the value is an object with an own `default` key, descend into it
 *    — covers real ESM (`export default { ... }`) and plain CJS, where the
 *    dynamic-import namespace always carries the whole `module.exports`
 *    value under `default`.
 * 2. Descend again ONLY if the current value is also an object, carries
 *    the transpiler's `__esModule: true` interop marker, AND itself has an
 *    own `default` key — covers CJS compiled from ESM, whose exports
 *    object has its own nested `default`. Gating the second step on the
 *    marker is the critical part: without it, a config whose legitimate
 *    data happens to have a key literally named `default` would be
 *    corrupted by an unconditional second unwrap.
 */
export function normalizeConfigExport(mod: unknown): unknown {
  let current: unknown = mod;

  if (isPlainRecord(current) && Object.hasOwn(current, 'default')) {
    current = current.default;
  }

  if (
    isPlainRecord(current) &&
    current.__esModule === true &&
    Object.hasOwn(current, 'default')
  ) {
    current = current.default;
  }

  return current;
}

/**
 * @internal
 *
 * Loads and validates a migrations config file. `.json` is read and
 * parsed directly — deliberately never via `import()`, which would require
 * an import attribute whose mandatoriness differs across the Node range
 * this package supports; reading and parsing text has no such
 * version-dependence. `.js`/`.ts` go through
 * `import(pathToFileURL(absolutePath).href)` followed by
 * `normalizeConfigExport` — the file-URL conversion is required because a
 * raw absolute path is not a portable module specifier (it only works by
 * accident on POSIX and breaks with a drive letter on Windows).
 *
 * A failure anywhere in the load step is wrapped as a base `MongoatError`
 * with the original error preserved untouched in `.cause` — never
 * serialized. On success, writes exactly one informational line to
 * `process.stderr` (never `stdout`, which stays clean for machine
 * consumption) naming the file that was loaded — emitted only AFTER the
 * shape has validated, so the "loaded config" line always means "accepted",
 * never appearing right before a validation error.
 *
 * SECURITY: for a `.js`/`.ts` file this runs the config author's code with
 * the invoker's privileges (`.json` is only read and parsed, never
 * executed). KNOWN LIMITATION: when a `.js`/`.ts` config redirects `dir` to
 * a folder of `.ts` migrations, the re-exec checkpoint means the parent
 * loads the config once and then the tsx child loads it again — so such a
 * config module can be evaluated TWICE per invocation, the second time under
 * a different runtime. A config with side effects (reading a `.env`,
 * resolving a secret, opening a socket) should therefore be written to be
 * idempotent.
 */
export async function loadConfigFile(
  absolutePath: string
): Promise<MongoatMigrationsConfig> {
  const ext = path.extname(absolutePath);
  let raw: unknown;

  try {
    if (ext === '.json') {
      const content = await readFile(absolutePath, 'utf-8');
      raw = JSON.parse(content);
    } else {
      const mod: unknown = await import(pathToFileURL(absolutePath).href);
      raw = normalizeConfigExport(mod);
    }
  } catch (err) {
    throw new MongoatError(
      `Failed to load migrations config from "${absolutePath}"`,
      { cause: err, code: 'CONFIG_LOAD_FAILED' }
    );
  }

  const validated = validateConfigShape(raw, absolutePath);

  process.stderr.write(`[mongoat] loaded config from ${absolutePath}\n`);

  return validated;
}

/**
 * @internal
 *
 * Strict shape validation for an already-loaded config export. Rejects
 * `null`, non-objects and arrays outright. Enumerates keys exclusively via
 * `Object.keys` — never `for...in`, which would walk the prototype chain —
 * and rejects anything outside the four-field allow-list, citing the
 * offending key(s) and the allowed list. Each known field is then
 * validated and copied by literal name, one at a time — no generic
 * whole-object merge helper is ever run over the parsed input. Explicit
 * per-field assignment is what guarantees no generic merge operation ever
 * touches a key set an untrusted file's author controls; the allow-list
 * check above already rejects prototype-special keys as simply "unknown".
 */
export function validateConfigShape(
  raw: unknown,
  sourcePath: string
): MongoatMigrationsConfig {
  if (!isPlainRecord(raw)) {
    throw new MongoatValidationError(
      `Migrations config at "${sourcePath}" must export a plain object — received ${describeExportType(raw)}`,
      { code: 'INVALID_CONFIG_SHAPE' }
    );
  }

  const unknownKeys = Object.keys(raw).filter(
    (key) => !ALLOWED_CONFIG_KEYS.includes(key)
  );

  if (unknownKeys.length > 0) {
    throw new MongoatValidationError(
      `Migrations config at "${sourcePath}" has unknown key(s): ${unknownKeys.join(', ')} — allowed keys are: ${ALLOWED_CONFIG_KEYS.join(', ')}`,
      { code: 'INVALID_CONFIG_SHAPE' }
    );
  }

  const result: MongoatMigrationsConfig = {};

  if (Object.hasOwn(raw, 'dir')) {
    if (typeof raw.dir !== 'string' || raw.dir.trim() === '') {
      throw new MongoatValidationError(
        `"dir" in the migrations config at "${sourcePath}" must be a non-empty string`,
        { code: 'INVALID_CONFIG_SHAPE' }
      );
    }

    result.dir = raw.dir;
  }

  if (Object.hasOwn(raw, 'collection')) {
    if (typeof raw.collection !== 'string' || raw.collection.trim() === '') {
      throw new MongoatValidationError(
        `"collection" in the migrations config at "${sourcePath}" must be a non-empty string`,
        { code: 'INVALID_CONFIG_SHAPE' }
      );
    }

    // Reject names the MongoDB driver would only fail on obscurely later: a
    // "$", a NUL byte, or the reserved "system." prefix. Same "validate
    // before use, with a stable .code" posture the rest of this module keeps.
    if (
      raw.collection.includes('$') ||
      raw.collection.includes('\0') ||
      raw.collection.startsWith('system.')
    ) {
      throw new MongoatValidationError(
        `"collection" in the migrations config at "${sourcePath}" is not a valid MongoDB collection name`,
        { code: 'INVALID_CONFIG_SHAPE' }
      );
    }

    result.collection = raw.collection;
  }

  if (Object.hasOwn(raw, 'allowNoTransaction')) {
    if (typeof raw.allowNoTransaction !== 'boolean') {
      throw new MongoatValidationError(
        `"allowNoTransaction" in the migrations config at "${sourcePath}" must be a boolean`,
        { code: 'INVALID_CONFIG_SHAPE' }
      );
    }

    result.allowNoTransaction = raw.allowNoTransaction;
  }

  if (Object.hasOwn(raw, 'lockTtlMs')) {
    const lockTtlMs = raw.lockTtlMs;

    if (
      typeof lockTtlMs !== 'number' ||
      !Number.isInteger(lockTtlMs) ||
      lockTtlMs <= 0
    ) {
      throw new MongoatValidationError(
        `"lockTtlMs" in the migrations config at "${sourcePath}" must be a positive integer number of milliseconds`,
        { code: 'INVALID_CONFIG_SHAPE' }
      );
    }

    result.lockTtlMs = lockTtlMs;
  }

  return result;
}
