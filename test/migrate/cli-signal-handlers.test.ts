import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { runWithSignalHandling } from '@/bin/mongoat';
import { MongoatError } from '@/errors';
import { MIGRATION_ERROR_CODES } from '@/migrate/errors';

/**
 * LOCK-03/D-33 — SIGINT/SIGTERM wiring is proved by invoking
 * `runWithSignalHandling` directly and simulating a signal via
 * `process.emit('SIGINT'|'SIGTERM')` — this only calls the JS listeners this
 * helper itself installs (never a real signal delivered to a child
 * process), matching the "no real signals to child processes" test strategy.
 */
describe('runWithSignalHandling (mongoat CLI signal wiring)', () => {
  let stderrSpy: ReturnType<typeof vi.spyOn>;
  let originalExitCode: number | string | null | undefined;

  beforeEach(() => {
    stderrSpy = vi
      .spyOn(process.stderr, 'write')
      .mockImplementation(() => true);
    originalExitCode = process.exitCode;
  });

  afterEach(() => {
    stderrSpy.mockRestore();
    process.exitCode = originalExitCode;
  });

  function stderr(): string {
    return stderrSpy.mock.calls.map((call: unknown[]) => call[0]).join('');
  }

  it('removes SIGINT/SIGTERM listeners after run settles, even without any signal', async () => {
    const sigintBaseline = process.listenerCount('SIGINT');
    const sigtermBaseline = process.listenerCount('SIGTERM');

    const result = await runWithSignalHandling(async () => {});

    expect(result).toBe(0);
    expect(process.listenerCount('SIGINT')).toBe(sigintBaseline);
    expect(process.listenerCount('SIGTERM')).toBe(sigtermBaseline);
  });

  it('the first signal aborts the controller and writes the actionable warning to stderr', async () => {
    const sigintBaseline = process.listenerCount('SIGINT');
    let observedAborted = false;

    const result = await runWithSignalHandling(async (signal) => {
      process.emit('SIGINT');
      observedAborted = signal.aborted;
    });

    expect(observedAborted).toBe(true);
    expect(result).toBe(0);
    expect(stderr()).toContain('Interrupt received');
    expect(stderr()).toContain('Press Ctrl+C again to force exit');
    expect(process.listenerCount('SIGINT')).toBe(sigintBaseline);
  });

  it('a second SIGINT forces an immediate exit with code 130', async () => {
    const exitSpy = vi
      .spyOn(process, 'exit')
      .mockImplementation(() => undefined as never);
    const sigintBaseline = process.listenerCount('SIGINT');

    await runWithSignalHandling(async () => {
      process.emit('SIGINT');
      process.emit('SIGINT');
    });

    expect(exitSpy).toHaveBeenCalledWith(130);
    expect(process.listenerCount('SIGINT')).toBe(sigintBaseline);
    exitSpy.mockRestore();
  });

  it('a second SIGTERM forces an immediate exit with code 143', async () => {
    const exitSpy = vi
      .spyOn(process, 'exit')
      .mockImplementation(() => undefined as never);
    const sigtermBaseline = process.listenerCount('SIGTERM');

    await runWithSignalHandling(async () => {
      process.emit('SIGTERM');
      process.emit('SIGTERM');
    });

    expect(exitSpy).toHaveBeenCalledWith(143);
    expect(process.listenerCount('SIGTERM')).toBe(sigtermBaseline);
    exitSpy.mockRestore();
  });

  it('maps a MIGRATION_ABORTED rejection to exit code 130 under SIGINT', async () => {
    const result = await runWithSignalHandling(async (signal) => {
      process.emit('SIGINT');
      expect(signal.aborted).toBe(true);

      throw new MongoatError(
        'Migration run aborted before applying "x" — 2 migration(s) still pending.',
        { code: MIGRATION_ERROR_CODES.MIGRATION_ABORTED }
      );
    });

    expect(result).toBe(130);
    expect(stderr()).toContain('still pending');
  });

  it('maps a MIGRATION_ABORTED rejection to exit code 143 under SIGTERM', async () => {
    const result = await runWithSignalHandling(async (signal) => {
      process.emit('SIGTERM');
      expect(signal.aborted).toBe(true);

      throw new MongoatError(
        'Migration run aborted before applying "x" — 1 migration(s) still pending.',
        { code: MIGRATION_ERROR_CODES.MIGRATION_ABORTED }
      );
    });

    expect(result).toBe(143);
    expect(stderr()).toContain('still pending');
  });

  it('a non-abort error is rethrown unchanged, left to the normal error boundary', async () => {
    const err = new Error('boom');

    await expect(
      runWithSignalHandling(async () => {
        throw err;
      })
    ).rejects.toBe(err);
  });

  it('listeners are removed even when run rejects', async () => {
    const sigintBaseline = process.listenerCount('SIGINT');
    const sigtermBaseline = process.listenerCount('SIGTERM');

    await expect(
      runWithSignalHandling(async () => {
        throw new Error('boom');
      })
    ).rejects.toThrow('boom');

    expect(process.listenerCount('SIGINT')).toBe(sigintBaseline);
    expect(process.listenerCount('SIGTERM')).toBe(sigtermBaseline);
  });
});
