import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { handleCreate } from '@/bin/mongoat';
import { MIGRATION_VERSION_REGEX } from '@/migrate/discover';

/**
 * `mongoat create <name>` generates a correctly-named
 * `YYYYMMDDHHMMSS_name.ts` stub with `up`/`down` present. No DB
 * required — `create` is pure filesystem I/O.
 */
describe('handleCreate (mongoat create)', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'mongoat-cli-create-'));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('generates a YYYYMMDDHHMMSS_name.ts stub with up/down present', async () => {
    const exitCode = await handleCreate(['add_users', '--dir', dir]);

    expect(exitCode).toBe(0);

    const files = await readdir(dir);
    expect(files).toHaveLength(1);

    const [fileName] = files;
    const match = /^(\d{14})_add_users\.ts$/.exec(fileName);

    expect(match).not.toBeNull();
    expect(MIGRATION_VERSION_REGEX.test(match?.[1] ?? '')).toBe(true);

    const content = await readFile(path.join(dir, fileName), 'utf-8');

    expect(content).toContain('defineMigration');
    expect(content).toContain('async up(');
    expect(content).toContain('async down(');
  });

  it('generates a .js stub when --js is passed', async () => {
    const exitCode = await handleCreate(['add_orders', '--dir', dir, '--js']);

    expect(exitCode).toBe(0);

    const files = await readdir(dir);
    const [fileName] = files;

    expect(fileName).toMatch(/^\d{14}_add_orders\.js$/);

    const content = await readFile(path.join(dir, fileName), 'utf-8');

    expect(content).toContain('exports.up');
    expect(content).toContain('exports.down');
  });

  it('creates the migrations dir when it does not exist yet', async () => {
    const nestedDir = path.join(dir, 'nested', 'migrations');

    const exitCode = await handleCreate(['bootstrap', '--dir', nestedDir]);

    expect(exitCode).toBe(0);

    const files = await readdir(nestedDir);
    expect(files).toHaveLength(1);
    expect(files[0]).toMatch(/^\d{14}_bootstrap\.ts$/);
  });

  it('exits non-zero and writes no file when no name is given', async () => {
    const exitCode = await handleCreate(['--dir', dir]);

    expect(exitCode).toBe(1);

    const files = await readdir(dir);
    expect(files).toHaveLength(0);
  });
});
