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
import { dispatch, handleStatus, handleTo } from '@/bin/mongoat';
import type { Database } from '@/database';
import { getLockStatus, getStatus } from '@/migrate';
import type { MigrationLockDocument } from '@/types/migrate';

/**
 * CLI subcommand dispatch, `status` table output, and
 * version-argument validation. `getStatus` (and the `Database` connection)
 * are mocked/faked — no real DB round-trip needed for these behaviors.
 */
describe('mongoat CLI dispatch', () => {
  let stdoutSpy: ReturnType<typeof vi.spyOn>;
  let stderrSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    stdoutSpy = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => true);
    stderrSpy = vi
      .spyOn(process.stderr, 'write')
      .mockImplementation(() => true);
  });

  afterEach(() => {
    stdoutSpy.mockRestore();
    stderrSpy.mockRestore();
    vi.mocked(getStatus).mockReset();
    vi.mocked(getLockStatus).mockReset();
  });

  it('an unknown subcommand exits non-zero and lists available commands on stderr', async () => {
    const exitCode = await dispatch(['bogus-subcommand']);

    expect(exitCode).not.toBe(0);

    const stderrOutput = stderrSpy.mock.calls
      .map((call: unknown[]) => call[0])
      .join('');
    expect(stderrOutput).toContain('Unknown command');
    expect(stderrOutput).toContain('create');
    expect(stderrOutput).toContain('status');
  });

  it.each([
    '__proto__',
    'toString',
    'constructor',
    'valueOf',
    'hasOwnProperty',
  ])(
    'a prototype-chain property name ("%s") is treated as an unknown command, not invoked',
    async (subcommand) => {
      const exitCode = await dispatch([subcommand]);

      expect(exitCode).toBe(1);

      const stderrOutput = stderrSpy.mock.calls
        .map((call: unknown[]) => call[0])
        .join('');
      expect(stderrOutput).toContain('Unknown command');
    }
  );

  it('a missing subcommand exits non-zero', async () => {
    const exitCode = await dispatch([]);

    expect(exitCode).not.toBe(0);
  });

  it('status invokes getStatus and prints a "version | name | applied" table', async () => {
    vi.mocked(getStatus).mockResolvedValue([
      {
        version: '20260101090000',
        name: 'first',
        applied: true,
        appliedAt: new Date('2026-01-01T09:00:00Z'),
      },
      { version: '20260101100000', name: 'second', applied: false },
    ]);
    vi.mocked(getLockStatus).mockResolvedValue({ held: false });

    const fakeDatabase = {
      connect: vi.fn().mockResolvedValue(undefined),
      disconnect: vi.fn().mockResolvedValue(undefined),
    } as unknown as Database;
    const deps: CliDeps = { createDatabase: () => fakeDatabase };

    const exitCode = await handleStatus([], deps);

    // The mocked set includes one still-pending row, so the tiered exit
    // code is 2 — this is the fixed behavior, not the historical always-0
    // bug the JSON contract work closed.
    expect(exitCode).toBe(2);
    expect(getStatus).toHaveBeenCalledTimes(1);
    expect(getLockStatus).toHaveBeenCalledTimes(1);
    expect(fakeDatabase.connect).toHaveBeenCalledTimes(1);
    expect(fakeDatabase.disconnect).toHaveBeenCalledTimes(1);

    const stdoutOutput = stdoutSpy.mock.calls
      .map((call: unknown[]) => call[0])
      .join('');
    expect(stdoutOutput).toContain('version | name | applied');
    expect(stdoutOutput).toContain('20260101090000 | first | applied');
    expect(stdoutOutput).toContain('20260101100000 | second | pending');
    expect(stdoutOutput).toContain('lock: free');
  });

  it('status renders a corrupted lock diagnostic without throwing', async () => {
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

    const fakeDatabase = {
      connect: vi.fn().mockResolvedValue(undefined),
      disconnect: vi.fn().mockResolvedValue(undefined),
    } as unknown as Database;
    const deps: CliDeps = { createDatabase: () => fakeDatabase };

    const exitCode = await handleStatus([], deps);

    expect(exitCode).toBe(0);

    const stdoutOutput = stdoutSpy.mock.calls
      .map((call: unknown[]) => call[0])
      .join('');
    expect(stdoutOutput).toContain('lock: held by legacy-host');
    expect(stdoutOutput).toContain('<invalid date>');
  });

  it('a malformed "to <version>" argument is rejected before touching the DB', async () => {
    const createDatabase = vi.fn();
    const deps: CliDeps = { createDatabase };

    const exitCode = await handleTo(['../../evil'], deps);

    expect(exitCode).toBe(1);
    expect(createDatabase).not.toHaveBeenCalled();

    const stderrOutput = stderrSpy.mock.calls
      .map((call: unknown[]) => call[0])
      .join('');
    expect(stderrOutput).toContain('INVALID_MIGRATION_VERSION');
  });

  it('a missing "to" version argument is rejected before touching the DB', async () => {
    const createDatabase = vi.fn();
    const deps: CliDeps = { createDatabase };

    const exitCode = await handleTo([], deps);

    expect(exitCode).toBe(1);
    expect(createDatabase).not.toHaveBeenCalled();
  });
});
