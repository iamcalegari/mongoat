import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  discoverMigrations,
  MIGRATION_VERSION_REGEX,
  parseMigrationFilename,
} from '@/migrate/discover';

const FIXTURES_DIR = path.resolve(__dirname, '../fixtures/migrations');

describe('MIGRATION_VERSION_REGEX (D-01 — single source of truth)', () => {
  it('matches a 14-digit version', () => {
    expect(MIGRATION_VERSION_REGEX.test('20260101090000')).toBe(true);
  });

  it('rejects anything not exactly 14 digits', () => {
    expect(MIGRATION_VERSION_REGEX.test('2026010109')).toBe(false);
    expect(MIGRATION_VERSION_REGEX.test('202601010900001')).toBe(false);
    expect(MIGRATION_VERSION_REGEX.test('../../etc')).toBe(false);
  });
});

describe('parseMigrationFilename', () => {
  it('parses a valid YYYYMMDDHHMMSS_name.ts filename', () => {
    expect(parseMigrationFilename('20260101090000_first.ts')).toEqual({
      version: '20260101090000',
      name: 'first',
    });
  });

  it('parses a valid .js filename', () => {
    expect(parseMigrationFilename('20260101090000_first.js')).toEqual({
      version: '20260101090000',
      name: 'first',
    });
  });

  it('rejects a version that is not 14 digits (path-traversal guard)', () => {
    expect(parseMigrationFilename('../../evil.ts')).toBeNull();
  });

  it('rejects a filename with no version prefix', () => {
    expect(parseMigrationFilename('readme.ts')).toBeNull();
  });

  it('rejects an unsupported extension', () => {
    expect(parseMigrationFilename('20260101090000_first.txt')).toBeNull();
  });
});

describe('discoverMigrations', () => {
  it('discovers the 3 fixture migrations in ascending lexicographic order', async () => {
    const entries = await discoverMigrations(FIXTURES_DIR);

    expect(entries).toHaveLength(3);
    expect(entries.map((entry) => entry.version)).toEqual([
      '20260101090000',
      '20260101100000',
      '20260101110000',
    ]);
    expect(entries[0]).toMatchObject({
      version: '20260101090000',
      name: 'first',
    });
    expect(entries[0].filePath).toContain('20260101090000_first.ts');
  });

  describe('directory with non-matching files', () => {
    let dir: string;

    beforeEach(async () => {
      dir = await mkdtemp(path.join(tmpdir(), 'mongoat-discover-'));
    });

    afterEach(async () => {
      await rm(dir, { recursive: true, force: true });
    });

    it('skips files that do not match the YYYYMMDDHHMMSS_name pattern', async () => {
      await writeFile(
        path.join(dir, '20260101090000_valid.ts'),
        'export async function up() {}\n'
      );
      await writeFile(path.join(dir, 'README.md'), '# not a migration\n');
      await writeFile(
        path.join(dir, 'not_a_migration.ts'),
        'export {};\n'
      );

      const entries = await discoverMigrations(dir);

      expect(entries).toHaveLength(1);
      expect(entries[0].name).toBe('valid');
    });
  });
});
