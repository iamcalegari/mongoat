import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const PROJECT_ROOT = path.resolve(__dirname, '../..');
const BUILT_BIN = path.join(PROJECT_ROOT, 'lib', 'mongoat.cjs');

/**
 * Regression — empirically proves the PUBLISHED bin still runs
 * `dispatch()` when invoked through a symlink, the exact install shape npm
 * creates on Unix at `node_modules/.bin/mongoat` (a symlink pointing at
 * `lib/mongoat.cjs`).
 *
 * Before the fix: Node resolves `__filename` to the module's REAL path
 * (following the symlink) while `process.argv[1]` stays the symlink path
 * itself — the `pathToFileURL` comparison always diverged under this
 * install shape, `isMainModule` was `false`, and the CLI exited 0 without
 * `dispatch()` ever running (silent no-op for every command, including the
 * `unlock` break-glass path).
 *
 * Builds the real `lib/mongoat.cjs` artifact (never a source file directly)
 * and invokes it through a freshly created symlink — a pure source-level
 * assertion would not have caught the original defect, which only surfaced
 * against the compiled CJS output invoked via symlink.
 */
describe('CLI bin — npm symlink install shape', () => {
  it('runs dispatch() when invoked via a symlink to the built CJS bin', () => {
    execFileSync('npm', ['run', 'build'], {
      cwd: PROJECT_ROOT,
      stdio: 'ignore',
    });

    expect(existsSync(BUILT_BIN)).toBe(true);

    const binDir = mkdtempSync(path.join(tmpdir(), 'mongoat-bin-symlink-'));
    const symlinkPath = path.join(binDir, 'mongoat');

    try {
      symlinkSync(BUILT_BIN, symlinkPath);

      const result = spawnSync(
        process.execPath,
        [symlinkPath, 'bogus-subcommand'],
        { encoding: 'utf-8' }
      );

      // Before the fix, this invocation exited 0 with EMPTY stdout
      // and stderr — `dispatch()` never ran. `bogus-subcommand` is chosen
      // deliberately: it never touches the database, so a failure here can
      // only mean `isMainModule` resolved false again.
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain('Unknown command');
    } finally {
      rmSync(binDir, { recursive: true, force: true });
    }
  }, 60_000);
});
