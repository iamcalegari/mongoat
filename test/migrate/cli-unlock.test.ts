import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/migrate', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/migrate')>();

  return {
    ...actual,
    forceUnlock: vi.fn(),
    getLockStatus: vi.fn(),
  };
});

import type { CliDeps } from '@/bin/mongoat';
import { dispatch, handleUnlock } from '@/bin/mongoat';
import type { Database } from '@/database';
import { forceUnlock, getLockStatus } from '@/migrate';
import type { MigrationLockDocument } from '@/types/migrate';

/**
 * LOCK-04 — `mongoat unlock` is dry by default (shows the diagnostic,
 * deletes nothing) and only deletes with an explicit `--force`; both paths
 * are idempotent (no lock present → "nothing to do", exit 0). `getLockStatus`
 * and `forceUnlock` (and the `Database` connection) are mocked/faked — no
 * real DB round-trip needed for these behaviors.
 */
describe('handleUnlock (mongoat unlock)', () => {
  let stdoutSpy: ReturnType<typeof vi.spyOn>;
  let stderrSpy: ReturnType<typeof vi.spyOn>;
  let fakeDatabase: Database;
  let deps: CliDeps;

  const sampleLock: MigrationLockDocument = {
    _id: 'lock',
    hostname: 'ci-runner-3',
    pid: 1234,
    operation: 'up',
    ownerId: 'owner-1',
    acquiredAt: new Date('2026-07-20T12:00:00Z'),
    expiresAt: new Date('2026-07-20T12:30:00Z'),
  };

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
    vi.mocked(getLockStatus).mockReset();
    vi.mocked(forceUnlock).mockReset();
  });

  function stdout(): string {
    return stdoutSpy.mock.calls.map((call: unknown[]) => call[0]).join('');
  }

  function stderr(): string {
    return stderrSpy.mock.calls.map((call: unknown[]) => call[0]).join('');
  }

  it('dry by default: a held lock is reported with its diagnostic and a risk warning, never deleted', async () => {
    vi.mocked(getLockStatus).mockResolvedValue({
      held: true,
      lock: sampleLock,
    });

    const exitCode = await handleUnlock([], deps);

    expect(exitCode).toBe(0);
    expect(getLockStatus).toHaveBeenCalledTimes(1);
    expect(forceUnlock).not.toHaveBeenCalled();
    expect(stdout()).toContain('held by ci-runner-3');
    expect(stderr()).toContain('--force');
  });

  it('dry by default, no lock present: reports "nothing to do", exit 0, idempotent', async () => {
    vi.mocked(getLockStatus).mockResolvedValue({ held: false });

    const exitCode = await handleUnlock([], deps);

    expect(exitCode).toBe(0);
    expect(forceUnlock).not.toHaveBeenCalled();
    expect(stdout()).toContain('nothing to do');
  });

  it('--force removes a held lock (including a non-expired one) and confirms the removal', async () => {
    vi.mocked(forceUnlock).mockResolvedValue({
      removed: true,
      lock: sampleLock,
    });

    const exitCode = await handleUnlock(['--force'], deps);

    expect(exitCode).toBe(0);
    expect(forceUnlock).toHaveBeenCalledTimes(1);
    expect(getLockStatus).not.toHaveBeenCalled();
    expect(stdout()).toContain('Removed migration lock');
    expect(stdout()).toContain('held by ci-runner-3');
  });

  it('--force with no lock present: reports "nothing to do", exit 0, idempotent', async () => {
    vi.mocked(forceUnlock).mockResolvedValue({ removed: false });

    const exitCode = await handleUnlock(['--force'], deps);

    expect(exitCode).toBe(0);
    expect(stdout()).toContain('nothing to do');
  });

  it('dispatch(["unlock", "--force"]) routes to handleUnlock', async () => {
    vi.mocked(forceUnlock).mockResolvedValue({ removed: false });

    const exitCode = await dispatch(['unlock', '--force'], deps);

    expect(exitCode).toBe(0);
    expect(forceUnlock).toHaveBeenCalledTimes(1);
  });

  // CR-02: a corrupted lock document (e.g. missing acquiredAt, or expiresAt
  // stored as a non-Date value) must never crash the dry-run/--force
  // diagnostic output — exactly the break-glass path the MIGRATION_LOCK_HELD
  // message itself tells an operator to use for a document it cannot fully
  // parse.
  describe('against a corrupted lock document (CR-02)', () => {
    const corruptedLock = {
      _id: 'lock',
      hostname: 'legacy-host',
      pid: 999,
      operation: 'up',
      ownerId: 'owner-legacy',
      // acquiredAt intentionally omitted; expiresAt is not a Date.
      expiresAt: 'not-a-date',
    } as unknown as MigrationLockDocument;

    it('dry by default: reports the diagnostic without throwing', async () => {
      vi.mocked(getLockStatus).mockResolvedValue({
        held: true,
        lock: corruptedLock,
      });

      const exitCode = await handleUnlock([], deps);

      expect(exitCode).toBe(0);
      expect(stdout()).toContain('held by legacy-host');
      expect(stdout()).toContain('<invalid date>');
      expect(stderr()).toContain('--force');
    });

    it('--force: removes the corrupted lock and reports the diagnostic without throwing', async () => {
      vi.mocked(forceUnlock).mockResolvedValue({
        removed: true,
        lock: corruptedLock,
      });

      const exitCode = await handleUnlock(['--force'], deps);

      expect(exitCode).toBe(0);
      expect(stdout()).toContain('Removed migration lock');
      expect(stdout()).toContain('held by legacy-host');
      expect(stdout()).toContain('<invalid date>');
    });
  });
});
