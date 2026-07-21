import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const PROJECT_ROOT = path.resolve(__dirname, '../..');
const README_PATH = path.join(PROJECT_ROOT, 'README.md');
const VERSIONING_DOC_PATH = path.join(
  PROJECT_ROOT,
  'docs/explanation/versioning.md'
);

/**
 * Both files below describe behavior implemented elsewhere in the repo, and
 * prose drifts away from behavior silently. The README's license link is
 * shipped inside the published tarball, and the versioning page is the
 * project's stated policy — a stale claim in either misleads whoever reads
 * it. These assertions keep the corrected wording from silently regressing.
 */
describe('README license link', () => {
  const readme = readFileSync(README_PATH, 'utf8');

  it('points at the license file rather than the package manifest', () => {
    expect(readme).toContain(
      '[MIT](https://github.com/iamcalegari/mongoat/blob/main/LICENSE)'
    );
    expect(readme).not.toContain(
      '[MIT](https://github.com/iamcalegari/mongoat/blob/main/package.json)'
    );
  });

  it('links to a file that actually exists on disk', () => {
    expect(existsSync(path.join(PROJECT_ROOT, 'LICENSE'))).toBe(true);
  });
});

describe('versioning page deprecation wording', () => {
  const versioningDoc = readFileSync(VERSIONING_DOC_PATH, 'utf8');

  it('describes deprecation as covering exact versions, not a range', () => {
    expect(versioningDoc).toContain('each exact affected version');
    expect(versioningDoc).toContain('marks the exact versions as unsupported');
    expect(versioningDoc).not.toContain('affected version range');
    expect(versioningDoc).not.toContain('marks the range as unsupported');
  });
});
