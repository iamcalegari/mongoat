import { Document } from 'mongodb';

import type { Model } from '@/model';
import { HookContextMap, HookFn, PostHookEntry } from '@/types/hooks';
import { METHODS } from '@/utils/enums';

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
 * Runs `post` hooks in registration order, `for...of` + `await`.
 *
 * Transform-via-return (D-04): a hook that returns a value `!==
 * undefined` becomes the new `ctx.result`; a hook that returns `undefined`
 * (no `return`, or explicit `return undefined`) only observes — the
 * previous `ctx.result` is kept.
 *
 * Deliberately does NOT branch on `fireAndForget` and does NOT accept an
 * `onHookError` callback yet — that is Plan 02's single addition point
 * (HOOK-04/D-06), kept isolated so this runner stays a plain sequential
 * loop for now.
 */
export async function runPostHooks<Ctx extends { result?: unknown }>(
  hooks: PostHookEntry<Ctx>[],
  ctx: Ctx
): Promise<void> {
  for (const { fn } of hooks) {
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
