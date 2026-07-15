import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

/**
 * Computes a stable sha256 hex digest of a migration file's RAW bytes.
 *
 * The digest is over the file's raw contents — no whitespace/formatting
 * normalization — so a purely cosmetic edit to an already-applied migration
 * still changes the checksum. That is intentional: it is the integrity
 * anchor consumed by drift detection, and treating a whitespace-only edit as
 * "no change" would hide a legitimate signal that the applied file no
 * longer matches what actually ran.
 *
 * @param filePath - Absolute or relative path to the migration file.
 * @returns A 64-character lowercase hex sha256 digest of the file's bytes.
 */
export async function computeChecksum(filePath: string): Promise<string> {
  const contents = await readFile(filePath);

  return createHash('sha256').update(contents).digest('hex');
}
