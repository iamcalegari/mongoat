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
 * Fallback `onHookError` used when a model is not given one via
 * `CreateModelProps.onHookError` — a `fireAndForget` post-hook error
 * NEVER disappears in total silence. Logs only `err`, never the full
 * `ctx`: `ctx.document`/`ctx.filter` may carry data the caller does not
 * want in logs.
 */
export function defaultOnHookError(err: unknown): void {
  console.error(err);
}

/**
 * Runs `pre` hooks in registration order, `for...of` + `await` — never
 * `Promise.all` for hooks of the SAME document/operation, which would drop
 * the ordering guarantee. A throw here propagates and ABORTS the pipeline
 * before the driver call runs.
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
 * Invokes the dev-provided (or fallback) `onHookError` and CONTAINS any
 * failure it produces itself — synchronous throw or a returned Promise
 * that rejects. This is the last link in the
 * `fireAndForget` error chain: there is nowhere left to propagate to
 * without turning into an `unhandledRejection` in the consumer's process,
 * so a failing `onHookError` is swallowed here as a last resort. The
 * original hook error (`err`) was already delivered to `onHookError`
 * before it failed — only the SECOND failure (inside `onHookError`
 * itself) is contained by this guard.
 */
function dispatchOnHookError<Ctx>(
  onHookError: OnHookError<Ctx>,
  err: unknown,
  ctx: Ctx
): void {
  try {
    // `OnHookError` is typed `void`, but the dev-provided function is
    // arbitrary JS at runtime — it may still return a Promise (e.g. an
    // `async` function). Go through `unknown` before probing for
    // `.then()` since TS rejects a truthiness check directly on `void`.
    const returned = onHookError(err, ctx) as unknown;

    if (
      returned &&
      typeof (returned as { then?: unknown }).then === 'function'
    ) {
      (returned as Promise<unknown>).catch(() => {
        // Last resort: `onHookError` itself rejected — nothing left to
        // propagate to without becoming a new `unhandledRejection`.
      });
    }
  } catch {
    // Last resort: `onHookError` itself threw synchronously — nothing
    // left to propagate to without becoming a new `unhandledRejection`.
  }
}

/**
 * Runs `post` hooks in registration order, `for...of` + `await` for the
 * normal (non-`fireAndForget`) path.
 *
 * Transform-via-return: a hook that returns a value `!== undefined`
 * becomes the new `ctx.result`; a hook that returns `undefined` (no
 * `return`, or explicit `return undefined`) only observes — the previous
 * `ctx.result` is kept.
 *
 * Error semantics:
 * - normal post hook throws → PROPAGATES to the caller (never a silent
 *   `.catch(() => {})`).
 * - `fireAndForget` post hook throws → does NOT propagate. Dispatch is
 *   truly non-awaited (`continue`s the loop immediately, does not delay
 *   the caller's return) and any rejection is routed to
 *   `onHookError(err, ctx)`, never swallowed in total silence.
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
      // it is always routed to `onHookError`/`defaultOnHookError` —
      // never an empty `.catch(() => {})`.
      //
      // O `onHookError` é código do DEV — ele pode lançar
      // (síncrono) ou retornar uma Promise que rejeita. Sem este guard,
      // qualquer um dos dois casos escaparia do `.catch` acima como um
      // `unhandledRejection` novo, exatamente o cenário que este pipeline
      // existe para evitar. `dispatchOnHookError` contém os dois casos:
      // nunca há para onde propagar depois do handler do dev falhar.
      Promise.resolve()
        .then(() => fn(ctx))
        .then((returned) => {
          if (returned !== undefined) {
            ctx.result = returned;
          }
        })
        .catch((err) => dispatchOnHookError(onHookError, err, ctx));

      continue;
    }

    // Normal path: propagates on throw — deliberately no try/catch
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
