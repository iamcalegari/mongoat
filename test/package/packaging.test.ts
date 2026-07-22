import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const PROJECT_ROOT = path.resolve(__dirname, '../..');

/**
 * Proves the published tarball actually contains the license text, using the
 * same `npm pack --dry-run` command `check:package` already runs — this test
 * exercises the real packaging path, not a filesystem approximation of it.
 * It also proves the shipped LICENSE file's content matches the identifier
 * the manifest declares, not just that a file with that name is present.
 */
describe('package contents', () => {
  it('includes LICENSE in the packed tarball', () => {
    const stdout = execFileSync('npm', ['pack', '--dry-run', '--json'], {
      cwd: PROJECT_ROOT,
      encoding: 'utf8',
      timeout: 30000,
    });
    const [{ files }] = JSON.parse(stdout) as [{ files: { path: string }[] }];

    expect(files.map((f) => f.path)).toContain('LICENSE');
  });

  it('ships a license whose text matches the identifier the manifest declares', () => {
    const packageJsonPath = path.join(PROJECT_ROOT, 'package.json');
    const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as {
      license: string;
    };
    expect(packageJson.license).toBe('MIT');

    const licenseText = readFileSync(
      path.join(PROJECT_ROOT, 'LICENSE'),
      'utf8'
    );

    // The header must name the same license the manifest declares, derived
    // from that field rather than hardcoded here a second time — a silent
    // swap of one without the other must fail this test.
    const headerPattern = new RegExp(`^${packageJson.license} License`);
    expect(licenseText).toMatch(headerPattern);

    // Distinguishes real license text from an empty file or a bare header.
    expect(licenseText).toMatch(/Permission is hereby granted, free of charge/);

    // Year range is intentionally left unpinned — it legitimately grows —
    // but the attribution itself must not drift silently.
    const copyrightMatch = licenseText.match(
      /Copyright \(c\) \d{4}(-\d{4})? (.+)/
    );
    expect(copyrightMatch).not.toBeNull();
    expect(copyrightMatch?.[2]).toBe('Alan Calegari');
  });

  it('has the correct package description', () => {
    const packageJsonPath = path.join(PROJECT_ROOT, 'package.json');
    const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as {
      description: string;
    };

    expect(packageJson.description).toBe(
      'A lightweight ODM library for MongoDB'
    );
  });
});
