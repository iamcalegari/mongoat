import { MongoatError } from '@/errors';

/**
 * @internal
 *
 * Runs `action` best-effort — NEVER throws itself, sync or async. The
 * caller decides what to do with the outcome (e.g. thread the failure into
 * a primary error's `suppressed` field via `attachSuppressed`, or adjust a
 * dynamic error message).
 */
export async function runBestEffort(
  action: () => Promise<void>
): Promise<{ ok: true } | { ok: false; error: unknown }> {
  try {
    await action();

    return { ok: true };
  } catch (error) {
    return { ok: false, error };
  }
}

// Best-effort text for the warning message below. `String(secondary)` can
// itself throw (e.g. `Object.create(null)` has no reachable `toString`, or a
// `toString`/`Symbol.toPrimitive` implementation that throws) — this helper
// never propagates that, falling back to a fixed placeholder instead.
function describeSuppressed(secondary: unknown): string {
  try {
    return secondary instanceof Error ? secondary.message : String(secondary);
  } catch {
    return '[unstringifiable secondary error]';
  }
}

/**
 * @internal
 *
 * Attaches `secondary` to `primary.suppressed` (creating the array on
 * first use — a primary error can accumulate more than one suppressed
 * failure over its lifecycle) and emits a non-fatal process warning with a
 * stable, filterable `type`. Never throws, even if `secondary` is not an
 * `Error` instance and even if stringifying it throws.
 */
export function attachSuppressed(primary: MongoatError, secondary: unknown): void {
  (primary.suppressed ??= []).push(secondary);

  process.emitWarning(
    `[mongoat] A secondary operation failed while handling the error above and was ` +
      `suppressed: ${describeSuppressed(secondary)}`,
    { type: 'MongoatSuppressedError' }
  );
}
