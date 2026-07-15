import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { computeChecksum } from '@/migrate/checksum';

const FIXTURES_DIR = path.resolve(__dirname, '../fixtures/migrations');

const FIRST = path.join(FIXTURES_DIR, '20260101090000_first.ts');
const SECOND = path.join(FIXTURES_DIR, '20260101100000_second.ts');

describe('computeChecksum (D-02 — sha256 of raw bytes)', () => {
  it('returns a 64-char lowercase hex string', async () => {
    const checksum = await computeChecksum(FIRST);

    expect(checksum).toMatch(/^[0-9a-f]{64}$/);
  });

  it('is stable across repeated reads of the same file', async () => {
    const first = await computeChecksum(FIRST);
    const second = await computeChecksum(FIRST);

    expect(first).toBe(second);
  });

  it('two fixtures with different bytes produce different checksums', async () => {
    const first = await computeChecksum(FIRST);
    const second = await computeChecksum(SECOND);

    expect(first).not.toBe(second);
  });

  describe('raw bytes, not normalized', () => {
    let dir: string;

    beforeEach(async () => {
      dir = await mkdtemp(path.join(tmpdir(), 'mongoat-checksum-'));
    });

    afterEach(async () => {
      await rm(dir, { recursive: true, force: true });
    });

    it('a whitespace-only edit changes the checksum (legitimate drift signal)', async () => {
      const original = path.join(dir, 'a.ts');
      const whitespaceEdited = path.join(dir, 'b.ts');

      await writeFile(original, 'export const value = 1;\n');
      await writeFile(whitespaceEdited, 'export const value = 1;\n\n');

      const originalChecksum = await computeChecksum(original);
      const editedChecksum = await computeChecksum(whitespaceEdited);

      expect(originalChecksum).not.toBe(editedChecksum);
    });

    it('byte-identical content produces the same checksum', async () => {
      const a = path.join(dir, 'a.ts');
      const b = path.join(dir, 'b.ts');
      const content = 'export const value = 1;\n';

      await writeFile(a, content);
      await writeFile(b, content);

      const checksumA = await computeChecksum(a);
      const checksumB = await computeChecksum(b);

      expect(checksumA).toBe(checksumB);
    });
  });
});
