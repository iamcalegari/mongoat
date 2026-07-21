import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

const PROJECT_ROOT = path.resolve(__dirname, '../..');
const WORKFLOWS_DIR = path.join(PROJECT_ROOT, '.github/workflows');

/** A `uses:` line that references a third-party action by an immutable commit,
 * with a same-line readable-version comment (owner/repo@40-hex-sha # vX.Y.Z). */
const PINNED_REF = /^[\w.-]+\/[\w.-]+@[0-9a-f]{40} # v\d+\.\d+\.\d+$/;

function discoverWorkflowFiles(): string[] {
  return readdirSync(WORKFLOWS_DIR).filter(
    (name) => name.endsWith('.yml') || name.endsWith('.yaml')
  );
}

function collectUsesLines(fileText: string): string[] {
  return fileText
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('uses:') || line.startsWith('- uses:'))
    .map((line) => line.replace(/^-\s*/, '').replace(/^uses:\s*/, ''));
}

/**
 * Two static invariants over the raw workflow text, kept in one file since
 * both scan the same directory and neither is large enough to earn its own.
 *
 * What this proves: every third-party action reference is commit-pinned, and
 * the release job's gate commands are wired in the right order ahead of the
 * publish step. What it does NOT prove: that a failing step actually halts
 * the steps after it — that is documented platform step-failure behavior,
 * exercised daily by the identical sequence already running on every push in
 * the build workflow, not something this suite can re-demonstrate from
 * inside the repository.
 */
describe('workflow action pins', () => {
  const workflowFiles = discoverWorkflowFiles();

  it('discovers the workflow directory without a hardcoded file list', () => {
    expect(workflowFiles.length).toBeGreaterThan(0);
    expect(workflowFiles.length).toBeGreaterThanOrEqual(4);
  });

  it.each(workflowFiles)(
    'every third-party action reference in %s is commit-pinned with a readable version',
    (file) => {
      const text = readFileSync(path.join(WORKFLOWS_DIR, file), 'utf8');
      const usesLines = collectUsesLines(text);

      for (const ref of usesLines) {
        expect(ref).toMatch(PINNED_REF);
      }
    }
  );

  it('collects at least one pinned reference per workflow, so a parsing mistake cannot pass vacuously', () => {
    const total = workflowFiles.reduce((sum, file) => {
      const text = readFileSync(path.join(WORKFLOWS_DIR, file), 'utf8');
      return sum + collectUsesLines(text).length;
    }, 0);

    expect(total).toBeGreaterThanOrEqual(12);
  });
});

describe('release workflow gate order', () => {
  const releaseText = readFileSync(
    path.join(WORKFLOWS_DIR, 'release.yml'),
    'utf8'
  );
  const stepLines = releaseText
    .split('\n')
    .map((line) => line.trim())
    .filter(
      (line) =>
        line.startsWith('- run:') ||
        line.startsWith('- uses:') ||
        line.startsWith('uses:')
    );

  it('runs lint, typecheck, build, the suite and the packaging check in order before publishing', () => {
    const gateCommands = [
      'npm ci',
      'npm run lint',
      'npm run typecheck',
      'npm run build',
      'npm test',
      'npm run check:package',
    ];

    const indices = gateCommands.map((command) => {
      const index = stepLines.findIndex((line) => line.includes(command));
      expect(index, `expected to find a step containing "${command}"`).toBeGreaterThanOrEqual(0);
      return index;
    });

    for (let i = 1; i < indices.length; i++) {
      expect(indices[i]).toBeGreaterThan(indices[i - 1]);
    }

    const publishIndices = stepLines
      .map((line, index) => ({ line, index }))
      .filter(({ line }) => line.includes('changesets/action'));

    expect(publishIndices).toHaveLength(1);
    const publishIndex = publishIndices[0].index;

    for (const gateIndex of indices) {
      expect(publishIndex).toBeGreaterThan(gateIndex);
    }
  });
});
