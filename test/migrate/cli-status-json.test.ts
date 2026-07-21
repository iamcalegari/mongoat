import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/migrate', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/migrate')>();

  return {
    ...actual,
    getStatus: vi.fn(),
    getLockStatus: vi.fn(),
  };
});

import type { CliDeps } from '@/bin/mongoat';
import { handleStatus } from '@/bin/mongoat';
import type { Database } from '@/database';
import { MongoatValidationError } from '@/errors';
import { getLockStatus, getStatus } from '@/migrate';
import type {
  MigrationLockDocument,
  MigrationStatusJson,
  MigrationStatusRow,
} from '@/types/migrate';

/**
 * `mongoat status --json` — the machine-readable envelope on stdout, and
 * the tiered exit code that fixes the previous always-0 bug (`handleStatus`
 * never returned a value, so `runWithErrorBoundary`'s `result ?? 0` always
 * resolved to 0 regardless of the real migration state). `getStatus`/
 * `getLockStatus` (and the `Database` connection) are mocked/faked — no
 * real DB round-trip needed for these behaviors.
 */
describe('mongoat status --json', () => {
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
    vi.mocked(getStatus).mockReset();
    vi.mocked(getLockStatus).mockReset();
  });

  it('emits exactly one stdout write of a single minified JSON envelope with schemaVersion, migrations, summary and lock', async () => {
    vi.mocked(getStatus).mockResolvedValue([
      {
        version: '20260101090000',
        name: 'first',
        applied: true,
        appliedAt: new Date('2026-01-01T09:00:00Z'),
      },
    ]);
    vi.mocked(getLockStatus).mockResolvedValue({ held: false });

    const exitCode = await handleStatus(['--json'], deps);

    expect(exitCode).toBe(0);
    expect(stdoutSpy).toHaveBeenCalledTimes(1);

    const payload = stdout();
    expect(payload.endsWith('\n')).toBe(true);
    // Minified — no indentation newline anywhere but the trailing one.
    expect(payload.slice(0, -1)).not.toContain('\n');

    const parsed = JSON.parse(payload) as MigrationStatusJson;
    expect(parsed.schemaVersion).toBe(1);
    expect(parsed).toHaveProperty('migrations');
    expect(parsed).toHaveProperty('summary');
    expect(parsed).toHaveProperty('lock');
    expect(parsed.migrations).toHaveLength(parsed.summary.total);
  });

  it('a pending row always carries an always-present, null appliedAt key and a boolean drifted key', async () => {
    vi.mocked(getStatus).mockResolvedValue([
      { version: '20260101090000', name: 'first', applied: false },
    ]);
    vi.mocked(getLockStatus).mockResolvedValue({ held: false });

    await handleStatus(['--json'], deps);

    const parsed = JSON.parse(stdout()) as MigrationStatusJson;
    const [row] = parsed.migrations;

    expect(Object.hasOwn(row, 'appliedAt')).toBe(true);
    expect(row.appliedAt).toBeNull();
    expect(typeof row.drifted).toBe('boolean');
  });

  it('a held lock with a corrupted expiresAt serializes to expiresAt: null without throwing', async () => {
    vi.mocked(getStatus).mockResolvedValue([]);
    vi.mocked(getLockStatus).mockResolvedValue({
      held: true,
      lock: {
        _id: 'lock',
        hostname: 'legacy-host',
        pid: 999,
        operation: 'up',
        ownerId: 'owner-legacy',
        // acquiredAt intentionally omitted; expiresAt is not a Date.
        expiresAt: 'not-a-date',
      } as unknown as MigrationLockDocument,
    });

    const exitCode = await handleStatus(['--json'], deps);

    expect(exitCode).toBe(0);

    const parsed = JSON.parse(stdout()) as MigrationStatusJson;
    expect(parsed.lock.held).toBe(true);
    expect(parsed.lock.expiresAt).toBeNull();
  });

  it.each([
    { rows: [], expected: 0, label: 'a clean set exits 0' },
    {
      rows: [{ version: '1', name: 'a', applied: false }],
      expected: 2,
      label: 'a pending-only set exits 2',
    },
    {
      rows: [{ version: '1', name: 'a', applied: false, failed: true }],
      expected: 3,
      label: 'a failed row exits 3 — the always-0 bug is fixed',
    },
    {
      rows: [
        {
          version: '1',
          name: 'a',
          applied: true,
          drifted: true,
          appliedAt: new Date('2026-01-01T00:00:00Z'),
        },
      ],
      expected: 3,
      label: 'a drifted row exits 3 — the always-0 bug is fixed',
    },
  ])('$label', async ({ rows, expected }) => {
    vi.mocked(getStatus).mockResolvedValue(rows as MigrationStatusRow[]);
    vi.mocked(getLockStatus).mockResolvedValue({ held: false });

    const exitCode = await handleStatus(['--json'], deps);

    expect(exitCode).toBe(expected);
  });

  it('the same regression fix holds on the text (non-JSON) path', async () => {
    vi.mocked(getStatus).mockResolvedValue([
      { version: '1', name: 'a', applied: false, failed: true },
    ]);
    vi.mocked(getLockStatus).mockResolvedValue({ held: false });

    const exitCode = await handleStatus([], deps);

    expect(exitCode).toBe(3);
  });

  it('an error under --json writes nothing to stdout and the error text lands on stderr, exiting 1', async () => {
    vi.mocked(getStatus).mockRejectedValue(
      new MongoatValidationError('boom', { code: 'INVALID_CONFIG_SHAPE' })
    );
    vi.mocked(getLockStatus).mockResolvedValue({ held: false });

    const exitCode = await handleStatus(['--json'], deps);

    expect(exitCode).toBe(1);
    expect(stdoutSpy).not.toHaveBeenCalled();
    expect(stderr()).toContain('Error [INVALID_CONFIG_SHAPE]: boom');
  });

  it('the error message on the --json error path satisfies the repo-wide guard against internal planning jargon', async () => {
    vi.mocked(getStatus).mockRejectedValue(
      new MongoatValidationError('boom', { code: 'INVALID_CONFIG_SHAPE' })
    );
    vi.mocked(getLockStatus).mockResolvedValue({ held: false });

    await handleStatus(['--json'], deps);

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
});
