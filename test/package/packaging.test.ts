import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const PROJECT_ROOT = path.resolve(__dirname, '../..');

/**
 * Proves the published tarball actually contains the license text, using the
 * same `npm pack --dry-run` command `check:package` already runs — this test
 * exercises the real packaging path, not a filesystem approximation of it.
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

  it('has the correct package description', () => {
    const packageJsonPath = path.join(PROJECT_ROOT, 'package.json');
    const packageJson = JSON.parse(
      readFileSync(packageJsonPath, 'utf8')
    ) as { description: string };

    expect(packageJson.description).toBe(
      'A lightweight ODM library for MongoDB'
    );
  });
});
