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
 * Splits a workflow's `jobs:` section into a map of job name to that job's
 * raw body text. A job starts at a line indented exactly two spaces, holding
 * an identifier followed by a colon at end of line — a job's own steps and
 * nested keys sit deeper than that, and workflow-level keys sit above the
 * `jobs:` line entirely, so neither is mistaken for a job boundary.
 */
function readJobs(text: string): Record<string, string> {
  const lines = text.split('\n');
  const jobsLineIndex = lines.findIndex((line) => line === 'jobs:');
  if (jobsLineIndex === -1) return {};

  const jobKeyPattern = /^ {2}([\w-]+):$/;
  const starts: Array<{ name: string; index: number }> = [];
  for (let i = jobsLineIndex + 1; i < lines.length; i++) {
    const match = lines[i].match(jobKeyPattern);
    if (match) starts.push({ name: match[1], index: i });
  }

  const jobs: Record<string, string> = {};
  for (let i = 0; i < starts.length; i++) {
    const end = i + 1 < starts.length ? starts[i + 1].index : lines.length;
    jobs[starts[i].name] = lines.slice(starts[i].index, end).join('\n');
  }
  return jobs;
}

/** The workflow text preceding its `jobs:` section, for assertions about the
 * scope declared at workflow level rather than inside any one job. */
function readPreJobsSection(text: string): string {
  const lines = text.split('\n');
  const jobsLineIndex = lines.findIndex((line) => line === 'jobs:');
  return jobsLineIndex === -1 ? text : lines.slice(0, jobsLineIndex).join('\n');
}

/**
 * Static invariants over the raw workflow text.
 *
 * What this proves: every third-party action reference, in every workflow
 * file, is commit-pinned with a readable version, and no file silently
 * contributes zero references to that check; the release workflow separates
 * the job that verifies the codebase from the job that publishes it, with
 * the publish job wired to depend on the verification job rather than just
 * following it in file order; and neither job carries a bypass marker (a
 * conditional or a failure-tolerance flag) that would let the gate look
 * green without actually running.
 *
 * What it does NOT prove: that a failing step actually halts the steps
 * after it, or that a failed job actually blocks a dependent job from being
 * scheduled — both are documented platform behavior, exercised daily by
 * every push, not something this suite can re-demonstrate from inside the
 * repository.
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

      expect(
        usesLines.length,
        `${file} yielded no "uses:" lines — parser drift?`
      ).toBeGreaterThan(0);

      for (const ref of usesLines) {
        expect(ref).toMatch(PINNED_REF);
      }
    }
  );
});

describe('release workflow job separation', () => {
  const releaseText = readFileSync(
    path.join(WORKFLOWS_DIR, 'release.yml'),
    'utf8'
  );
  const jobs = readJobs(releaseText);
  const preJobsSection = readPreJobsSection(releaseText);

  it('splits verification from publication into exactly two jobs, in that order', () => {
    expect(Object.keys(jobs)).toEqual(['verify', 'release']);
  });

  it('the publishing job depends on the verification job', () => {
    expect(jobs.release).toMatch(/^\s*needs:\s*verify\s*$/m);
  });

  it('runs every gate command inside the verification job, in order', () => {
    const gateCommands = [
      'npm ci',
      'npm run lint',
      'npm run typecheck',
      'npm run build',
      'npm test',
      'npm run check:package',
    ];

    const indices = gateCommands.map((command) => {
      const index = jobs.verify.indexOf(command);
      expect(
        index,
        `expected to find "${command}" inside the verify job`
      ).toBeGreaterThanOrEqual(0);
      return index;
    });

    for (let i = 1; i < indices.length; i++) {
      expect(indices[i]).toBeGreaterThan(indices[i - 1]);
    }
  });

  it('keeps the verification job free of the publishing environment, the token names and the publish action', () => {
    expect(jobs.verify).not.toMatch(/^\s*environment:/m);
    expect(jobs.verify).not.toContain('NPM_TOKEN');
    expect(jobs.verify).not.toContain('NODE_AUTH_TOKEN');
    expect(jobs.verify).not.toContain('changesets/action');
  });

  it('the publish action reference appears exactly once, inside the publishing job', () => {
    const occurrences = releaseText.match(/changesets\/action@/g) ?? [];
    expect(occurrences).toHaveLength(1);
    expect(jobs.release).toContain('changesets/action@');
  });

  it('the publishing environment key appears exactly once, inside the publishing job', () => {
    const occurrences = releaseText.match(/^\s*environment:/gm) ?? [];
    expect(occurrences).toHaveLength(1);
    expect(jobs.release).toMatch(/^\s*environment:/m);
  });

  it('grants the identity-token permission only on the publishing job, never at workflow scope', () => {
    expect(jobs.release).toMatch(/^\s*id-token:\s*write/m);

    const permissionsIndex = preJobsSection.indexOf('permissions:');
    const topLevelPermissions =
      permissionsIndex === -1 ? '' : preJobsSection.slice(permissionsIndex);

    expect(topLevelPermissions).not.toContain('id-token');
    expect(topLevelPermissions).not.toContain('write');
  });
});

describe('release workflow install and gate integrity', () => {
  const releaseText = readFileSync(
    path.join(WORKFLOWS_DIR, 'release.yml'),
    'utf8'
  );
  const jobs = readJobs(releaseText);

  it('the publishing job installs dependencies without running their lifecycle scripts', () => {
    const installLines = jobs.release
      .split('\n')
      .filter((line) => /^\s*- run:\s*npm ci\b/.test(line));

    expect(installLines.length).toBeGreaterThan(0);
    for (const line of installLines) {
      expect(line).toContain('--ignore-scripts');
    }
  });

  it('carries no conditional or failure-tolerance marker on the verification job', () => {
    expect(jobs.verify).not.toMatch(/^\s*if\s*:/m);
    expect(jobs.verify).not.toMatch(/^\s*continue-on-error\s*:/m);
  });

  it('carries no conditional or failure-tolerance marker ahead of the publish step', () => {
    const publishIndex = jobs.release.indexOf('changesets/action');
    const preamble = jobs.release.slice(0, publishIndex);

    expect(preamble).not.toMatch(/^\s*if\s*:/m);
    expect(preamble).not.toMatch(/^\s*continue-on-error\s*:/m);
  });
});
