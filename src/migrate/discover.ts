import { readdir } from 'node:fs/promises';
import path from 'node:path';

/**
 * The single source of truth for what counts as a valid migration version
 * (`YYYYMMDDHHMMSS`, 14 digits, D-01) — reused verbatim by the CLI (Plan
 * 08-06) when validating a `to <version>`/`down <version>` argument BEFORE
 * it is used to build any filesystem path or MongoDB filter (T-08-01).
 */
export const MIGRATION_VERSION_REGEX = /^\d{14}$/;

const MIGRATION_FILENAME_PATTERN = /^(\d+)_(.+)\.(?:ts|js)$/;

/**
 * Parses a migration filename into its `version`/`name` parts.
 *
 * Returns `null` for anything that does not match the
 * `YYYYMMDDHHMMSS_name.(ts|js)` shape, OR whose captured version is not
 * exactly 14 digits per {@link MIGRATION_VERSION_REGEX} — this second check
 * is what rejects a crafted filename like `../../evil.ts` (no digit prefix
 * at all) or a version of the wrong length before it is ever joined into a
 * filesystem path (T-08-01).
 *
 * @param filename - The bare filename (no directory component).
 * @returns The parsed `{ version, name }`, or `null` when the filename does
 * not match.
 */
export function parseMigrationFilename(
  filename: string
): { name: string; version: string } | null {
  const match = MIGRATION_FILENAME_PATTERN.exec(filename);

  if (!match) return null;

  const [, version, name] = match;

  if (!MIGRATION_VERSION_REGEX.test(version)) return null;

  return { name, version };
}

/**
 * Discovers migration files in `dir`, returning them ordered ascending by
 * `version` (lexicographic `String` comparison — D-01).
 *
 * Only files whose basename matches `YYYYMMDDHHMMSS_name.(ts|js)` (per
 * {@link parseMigrationFilename}) are included; anything else in the
 * directory (README, subdirectories, unrelated files) is silently skipped.
 * Every resolved `filePath` is asserted to stay within `dir` — defense in
 * depth alongside the version-regex check in {@link parseMigrationFilename}
 * (T-08-01): a filename can never resolve outside the migrations directory.
 *
 * @param dir - The migrations directory to scan.
 * @returns Discovered entries sorted ascending by version.
 */
export async function discoverMigrations(
  dir: string
): Promise<{ filePath: string; name: string; version: string }[]> {
  const resolvedDir = path.resolve(dir);
  const dirEntries = await readdir(resolvedDir, { withFileTypes: true });

  const migrations: { filePath: string; name: string; version: string }[] =
    [];

  for (const dirEntry of dirEntries) {
    if (!dirEntry.isFile()) continue;

    const parsed = parseMigrationFilename(dirEntry.name);
    if (!parsed) continue;

    const filePath = path.resolve(resolvedDir, dirEntry.name);

    // Prefix-containment assertion (T-08-01): even though
    // parseMigrationFilename already rejects a malformed version, this
    // guards against any resolved path escaping the migrations directory.
    if (filePath !== resolvedDir && !filePath.startsWith(resolvedDir + path.sep)) {
      continue;
    }

    migrations.push({ filePath, name: parsed.name, version: parsed.version });
  }

  return migrations.sort((a, b) => {
    if (a.version < b.version) return -1;
    if (a.version > b.version) return 1;
    return 0;
  });
}
