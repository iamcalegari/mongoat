import { Document } from 'mongodb';

import type { Model } from '@/model';
import {
  HookContextMap,
  HookFn,
  OnHookError,
  PostHookEntry,
} from '@/types/hooks';
import { METHODS } from '@/utils/enums';

/**
 * Fallback `onHookError` (D-06/HOOK-04) used when a model is not given one
 * via `CreateModelProps.onHookError` — a `fireAndForget` post-hook error
 * NEVER disappears in total silence (Pitfall 3). Logs only `err`, never the
 * full `ctx` (T-02-02 — `ctx.document`/`ctx.filter` may carry data the
 * caller does not want in logs; full sanitization is SEC-03, Fase 3).
 */
export function defaultOnHookError(err: unknown): void {
  console.error(err);
}

/**
 * Runs `pre` hooks in registration order, `for...of` + `await` — never
 * `Promise.all` for hooks of the SAME document/operation (Pitfall 1: that
 * would drop the ordering guarantee HOOK-01 requires). A throw here
 * propagates and ABORTS the pipeline before the driver call runs (D-05 —
 * error semantics tightened in Plan 02, this plan only needs the abort to
 * happen, not a specific wrapping).
 */
export async function runPreHooks<Ctx>(
  hooks: HookFn<Ctx>[],
  ctx: Ctx
): Promise<void> {
  for (const hook of hooks) {
    await hook(ctx);
  }
}

/**
 * Runs `post` hooks in registration order, `for...of` + `await` for the
 * normal (non-`fireAndForget`) path.
 *
 * Transform-via-return (D-04): a hook that returns a value `!==
 * undefined` becomes the new `ctx.result`; a hook that returns `undefined`
 * (no `return`, or explicit `return undefined`) only observes — the
 * previous `ctx.result` is kept.
 *
 * Error semantics (D-05/D-06/HOOK-03/HOOK-04):
 * - normal post hook throws → PROPAGATES to the caller (never a silent
 *   `.catch(() => {})` — Pitfall 3, T-02-05).
 * - `fireAndForget` post hook throws → does NOT propagate. Dispatch is
 *   truly non-awaited (`continue`s the loop immediately, does not delay
 *   the caller's return — A2/Open Question 1) and any rejection is routed
 *   to `onHookError(err, ctx)`, never swallowed in total silence.
 */
export async function runPostHooks<Ctx extends { result?: unknown }>(
  hooks: PostHookEntry<Ctx>[],
  ctx: Ctx,
  onHookError: OnHookError<Ctx> = defaultOnHookError
): Promise<void> {
  for (const { fn, fireAndForget } of hooks) {
    if (fireAndForget) {
      // Dispatch is NOT awaited — the loop (and the caller's return) never
      // waits on this hook. `.catch` is attached immediately so a
      // rejection is never an unhandled rejection AND never propagates —
      // it is always routed to `onHookError`/`defaultOnHookError`
      // (T-02-05: never an empty `.catch(() => {})`).
      Promise.resolve()
        .then(() => fn(ctx))
        .then((returned) => {
          if (returned !== undefined) {
            ctx.result = returned;
          }
        })
        .catch((err) => onHookError(err, ctx));

      continue;
    }

    // Normal path: propagates on throw (D-05) — deliberately no try/catch
    // here.
    const returned = await fn(ctx);

    if (returned !== undefined) {
      ctx.result = returned;
    }
  }
}

/**
 * Assembles the base `ctx` (`method` + `model`) with the method-specific
 * fields for a given `METHODS` value — a thin helper so every CRUD method
 * builds its `ctx` the same way instead of hand-rolling the merge.
 */
export function buildContext<ModelType extends Document, M extends METHODS>(
  method: M,
  model: Model<ModelType>,
  fields: Omit<HookContextMap<ModelType>[M], 'method' | 'model'>
): HookContextMap<ModelType>[M] {
  return {
    method,
    model,
    ...fields,
  } as HookContextMap<ModelType>[M];
}
