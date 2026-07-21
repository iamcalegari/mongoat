import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/migrate', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/migrate')>();

  return {
    ...actual,
    planMigrations: vi.fn(),
    runMigrations: vi.fn(),
    runTo: vi.fn(),
  };
});

import type { CliDeps } from '@/bin/mongoat';
import { handleTo, handleUp } from '@/bin/mongoat';
import type { Database } from '@/database';
import { MongoatValidationError } from '@/errors';
import { planMigrations, runMigrations, runTo } from '@/migrate';
import type { MigrationPlanJson } from '@/types/migrate';

/**
 * `up`/`to --dry-run` — an honest, side-effect-free preview built on
 * `planMigrations`, plus its `--json` plan envelope and the
 * `--json`-without-`--dry-run` input guard. `planMigrations`/`runMigrations`/
 * `runTo` (and the `Database` connection) are mocked/faked — no real DB
 * round-trip needed for these behaviors.
 */
describe('mongoat up/to --dry-run', () => {
  let stdoutSpy: ReturnType<typeof vi.spyOn>;
  let stderrSpy: ReturnType<typeof vi.spyOn>;
  let fakeDatabase: Database;
  let deps: CliDeps;

  function stdout(): string {
    return stdoutSpy.mock.calls.map((call: unknown[]) => call[0]).join('');
  }

  function stderr(): string {
    return stderrSpy.mock.calls.map((call: unknown[]) => call[0]).join('');
  }

  beforeEach(() => {
    stdoutSpy = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => true);
    stderrSpy = vi
      .spyOn(process.stderr, 'write')
      .mockImplementation(() => true);
    fakeDatabase = {
      connect: vi.fn().mockResolvedValue(undefined),
      disconnect: vi.fn().mockResolvedValue(undefined),
    } as unknown as Database;
    deps = { createDatabase: () => fakeDatabase };
  });

  afterEach(() => {
    stdoutSpy.mockRestore();
    stderrSpy.mockRestore();
    vi.mocked(planMigrations).mockReset();
    vi.mocked(runMigrations).mockReset();
    vi.mocked(runTo).mockReset();
  });

  it('up --dry-run calls planMigrations once, never runMigrations/runTo, and exits 0 on a clean plan', async () => {
    vi.mocked(planMigrations).mockResolvedValue({
      migrations: [{ version: '20260101090000', name: 'first' }],
      hasReplicaSet: true,
    });

    const exitCode = await handleUp(['--dry-run'], deps);

    expect(exitCode).toBe(0);
    expect(planMigrations).toHaveBeenCalledTimes(1);
    expect(planMigrations).toHaveBeenCalledWith(
      fakeDatabase,
      expect.anything()
    );
    expect(runMigrations).not.toHaveBeenCalled();
    expect(runTo).not.toHaveBeenCalled();

    expect(stdout()).toContain('20260101090000');
    expect(stdout()).toContain('first');
  });

  it('to <v> --dry-run calls planMigrations with the target version', async () => {
    vi.mocked(planMigrations).mockResolvedValue({
      migrations: [{ version: '20260101090000', name: 'first' }],
      hasReplicaSet: true,
    });

    const exitCode = await handleTo(['20260101090000', '--dry-run'], deps);

    expect(exitCode).toBe(0);
    expect(planMigrations).toHaveBeenCalledWith(
      fakeDatabase,
      expect.anything(),
      '20260101090000'
    );
    expect(runMigrations).not.toHaveBeenCalled();
    expect(runTo).not.toHaveBeenCalled();
  });

  it('up --json without --dry-run rejects with JSON_REQUIRES_DRY_RUN, exits 1, and writes nothing to stdout', async () => {
    const exitCode = await handleUp(['--json'], deps);

    expect(exitCode).toBe(1);
    expect(stdoutSpy).not.toHaveBeenCalled();
    expect(planMigrations).not.toHaveBeenCalled();
    expect(runMigrations).not.toHaveBeenCalled();
    expect(stderr()).toContain('JSON_REQUIRES_DRY_RUN');
  });

  it('the JSON_REQUIRES_DRY_RUN guard is a MongoatValidationError, not a bare Error (formatted with its .code)', async () => {
    // `runWithErrorBoundary` only prefixes the "Error [<code>]:" bracketed
    // code for an `instanceof MongoatError` — a bare `throw new Error(...)`
    // would print as plain "Error: <message>" with no bracketed code at all.
    await handleUp(['--json'], deps);

    expect(stderr()).toMatch(/^Error \[JSON_REQUIRES_DRY_RUN\]:/);
  });

  it('up --dry-run against a rejecting planMigrations exits 1 with the error on stderr and nothing on stdout', async () => {
    vi.mocked(planMigrations).mockRejectedValue(
      new MongoatValidationError('checksum drifted', {
        code: 'MIGRATION_CHECKSUM_MISMATCH',
      })
    );

    const exitCode = await handleUp(['--dry-run'], deps);

    expect(exitCode).toBe(1);
    expect(stdoutSpy).not.toHaveBeenCalled();
    expect(stderr()).toContain('MIGRATION_CHECKSUM_MISMATCH');
  });

  it('up --dry-run --allow-no-transaction warns on stderr that a real run would skip the transaction, and threads allowNoTransaction into planMigrations', async () => {
    vi.mocked(planMigrations).mockResolvedValue({
      migrations: [],
      hasReplicaSet: false,
    });

    const exitCode = await handleUp(
      ['--dry-run', '--allow-no-transaction'],
      deps
    );

    expect(exitCode).toBe(0);
    expect(stderr()).toContain(
      'a real run of this plan would execute WITHOUT a MongoDB transaction'
    );
    // The preview wording replaces the mutating path's "will run WITHOUT"
    // text — a dry run applies nothing, so that sibling phrasing would be a
    // false statement here.
    expect(stderr()).not.toContain('will run WITHOUT');
    expect(planMigrations).toHaveBeenCalledWith(
      fakeDatabase,
      expect.objectContaining({ allowNoTransaction: true })
    );
  });

  it('up --dry-run reports the topology as bypassed, never OK, when the gate was only waived', async () => {
    vi.mocked(planMigrations).mockResolvedValue({
      migrations: [{ version: '20260101090000', name: 'first' }],
      hasReplicaSet: false,
    });

    await handleUp(['--dry-run', '--allow-no-transaction'], deps);

    expect(stdout()).toContain('topology BYPASSED (--allow-no-transaction)');
    expect(stdout()).not.toContain('topology OK');
  });

  it('up --dry-run reports topology OK when the gate was genuinely satisfied', async () => {
    vi.mocked(planMigrations).mockResolvedValue({
      migrations: [{ version: '20260101090000', name: 'first' }],
      hasReplicaSet: true,
    });

    await handleUp(['--dry-run'], deps);

    expect(stdout()).toContain('checksum OK, topology OK');
  });

  it('up --dry-run --json carries transactional: false when the topology gate was bypassed', async () => {
    vi.mocked(planMigrations).mockResolvedValue({
      migrations: [],
      hasReplicaSet: false,
    });

    await handleUp(['--dry-run', '--json', '--allow-no-transaction'], deps);

    const parsed = JSON.parse(stdout()) as MigrationPlanJson;
    expect(parsed.transactional).toBe(false);
  });

  it('up --dry-run --json emits exactly one stdout write parsing to a schemaVersion 1 "up" envelope', async () => {
    vi.mocked(planMigrations).mockResolvedValue({
      migrations: [{ version: '20260101090000', name: 'first' }],
      hasReplicaSet: true,
    });

    const exitCode = await handleUp(['--dry-run', '--json'], deps);

    expect(exitCode).toBe(0);
    expect(stdoutSpy).toHaveBeenCalledTimes(1);

    const parsed = JSON.parse(stdout()) as MigrationPlanJson;
    expect(parsed.schemaVersion).toBe(1);
    expect(parsed.command).toBe('up');
    expect(parsed.migrations).toEqual([
      { version: '20260101090000', name: 'first' },
    ]);
    expect(parsed.summary).toEqual({ count: 1 });
    expect(parsed.transactional).toBe(true);
    // Always present, never omitted: `up` has no target, but a consumer
    // must not have to special-case a missing key.
    expect(Object.hasOwn(parsed, 'targetVersion')).toBe(true);
    expect(parsed.targetVersion).toBeNull();
  });

  it('to <v> --dry-run --json carries command "to" and the requested targetVersion', async () => {
    vi.mocked(planMigrations).mockResolvedValue({
      migrations: [],
      hasReplicaSet: true,
    });

    const exitCode = await handleTo(
      ['20260101090000', '--dry-run', '--json'],
      deps
    );

    expect(exitCode).toBe(0);
    expect(stdoutSpy).toHaveBeenCalledTimes(1);

    const parsed = JSON.parse(stdout()) as MigrationPlanJson;
    expect(parsed.command).toBe('to');
    expect(parsed.targetVersion).toBe('20260101090000');
  });

  it('the JSON_REQUIRES_DRY_RUN message satisfies the repo-wide guard against internal planning jargon', async () => {
    await handleUp(['--json'], deps);

    const message = stderr();

    expect(message).not.toMatch(/\b[A-Z]{2,5}-\d{2}\b/);
    expect(message).not.toMatch(/\bD-\d{1,2}\b/);
    expect(message).not.toMatch(
      /\b(Fase|Phase|Plano|Plan|Task|Wave|Pitfall|Pattern)\s+\d/i
    );
    expect(message).not.toMatch(/\b(phase|fase|pitfall)\b/i);
    expect(message).not.toMatch(/\b(RED|GREEN) note\b/i);
    expect(message).not.toMatch(/\bimplementation task\b/i);
  });

  it('the dry-run header/summary text satisfies the repo-wide guard against internal planning jargon', async () => {
    vi.mocked(planMigrations).mockResolvedValue({
      migrations: [{ version: '20260101090000', name: 'first' }],
      hasReplicaSet: true,
    });

    await handleUp(['--dry-run'], deps);

    const message = stdout();

    expect(message).not.toMatch(/\b[A-Z]{2,5}-\d{2}\b/);
    expect(message).not.toMatch(/\bD-\d{1,2}\b/);
    expect(message).not.toMatch(
      /\b(Fase|Phase|Plano|Plan|Task|Wave|Pitfall|Pattern)\s+\d/i
    );
    expect(message).not.toMatch(/\b(phase|fase|pitfall)\b/i);
    expect(message).not.toMatch(/\b(RED|GREEN) note\b/i);
    expect(message).not.toMatch(/\bimplementation task\b/i);
  });
});
