import {
  AggregateOptions,
  AnyBulkWriteOperation,
  BulkWriteOptions,
  BulkWriteResult,
  CountDocumentsOptions,
  DeleteOptions,
  DeleteResult,
  Document,
  Filter,
  FindOneAndDeleteOptions,
  FindOneAndUpdateOptions,
  FindOptions,
  InsertManyResult,
  InsertOneOptions,
  ObjectId,
  OptionalUnlessRequiredId,
  UpdateFilter,
  UpdateOptions,
  UpdateResult,
  WithId,
} from 'mongodb';

import type { Model } from '@/model';
import { DefaultProperties } from '@/types/model';
import { METHODS } from '@/utils/enums';

/**
 * A hook function invoked with an explicit `ctx` object (D-03 — replaces
 * the old `.bind(doc)(options)` `this`-magic). Sync or async; the return
 * value convention differs between pre and post hooks:
 * - pre hooks: return value is ignored (mutate `ctx` in place instead).
 * - post hooks: `undefined` observes only; any other value transforms
 *   `ctx.result` (D-04 — opt-in via return, see `runPostHooks`).
 */
export type HookFn<Ctx> = (
  ctx: Ctx
) => void | unknown | Promise<void | unknown>;

/**
 * Post-hook registration entry. `fireAndForget` (opt-in, D-06/HOOK-04) is
 * consumed by `runPostHooks` — when set, the hook dispatch is truly
 * non-awaited (does not delay the caller's return) and any rejection is
 * routed to `onHookError` instead of propagating to the caller.
 */
export interface PostHookEntry<Ctx> {
  fn: HookFn<Ctx>;
  fireAndForget?: boolean;
}

/**
 * Callback invoked when a `fireAndForget` post-hook rejects (D-06/HOOK-04).
 * `err` is typed `unknown` — third-party hooks can throw anything, not
 * necessarily a `MongoatError`/`Error`. Receives the SAME `ctx` the hook
 * itself received (result/document/filter included) — the consumer of
 * `onHookError` is responsible for not logging sensitive fields without
 * redaction (T-02-02; full sanitization is SEC-03, Fase 3).
 */
export type OnHookError<Ctx> = (err: unknown, ctx: Ctx) => void;

/**
 * Declarative per-method hook configuration accepted by
 * `CreateModelProps.hooks` (D-01 — construtor registration path).
 */
export interface HookConfig<Ctx> {
  pre?: HookFn<Ctx>[];
  post?: (HookFn<Ctx> | PostHookEntry<Ctx>)[];
}

interface BaseHookContext<ModelType extends Document> {
  method: METHODS;
  model: Model<ModelType>;
}

/**
 * `ctx` shape per `METHODS` value (D-03/Pattern 3) — a lookup type keyed
 * by the method literal so `pre<M extends METHODS>(method: M, fn: (ctx:
 * HookContextMap<ModelType>[M]) => ...)` infers the right ctx from `M`.
 *
 * `ctx.options`/`ctx.filter`/`ctx.document(s)` are the SAME reference used
 * in the driver call — a pre-hook mutation reaches the driver (API-01,
 * decorrência de D-09).
 *
 * `INSERT_MANY` deviates from a literal single-`documents` array: pre
 * hooks run PER DOCUMENT (Pitfall 1 — parallel across documents via
 * `Promise.all`, sequential across hooks of the SAME document via
 * `runPreHooks`), so `ctx.document` is the document currently being
 * processed while `ctx.documents` stays available as the full batch (e.g.
 * for cross-document checks). Post hooks run ONCE for the whole batch —
 * `ctx.document` is not meaningful there, only `ctx.documents`/`ctx.result`.
 */
export interface HookContextMap<ModelType extends Document> {
  [METHODS.INSERT]: BaseHookContext<ModelType> & {
    document: OptionalUnlessRequiredId<ModelType>;
    options: InsertOneOptions;
    result?: WithId<ModelType> & DefaultProperties;
  };
  [METHODS.INSERT_MANY]: BaseHookContext<ModelType> & {
    document?: OptionalUnlessRequiredId<ModelType>;
    documents: OptionalUnlessRequiredId<ModelType>[];
    options: BulkWriteOptions;
    result?: InsertManyResult<ModelType>;
  };
  [METHODS.FIND]: BaseHookContext<ModelType> & {
    filter: Filter<ModelType>;
    options?: FindOptions;
    result?: WithId<ModelType> | null;
  };
  [METHODS.FIND_MANY]: BaseHookContext<ModelType> & {
    filter: Filter<ModelType>;
    options: FindOptions;
    result?: WithId<ModelType>[];
  };
  [METHODS.FIND_BY_ID]: BaseHookContext<ModelType> & {
    documentId: ObjectId | string;
    options?: FindOptions;
    result?: WithId<ModelType> | null;
  };
  [METHODS.UPDATE]: BaseHookContext<ModelType> & {
    filter: Filter<ModelType>;
    update: UpdateFilter<ModelType>;
    options: FindOneAndUpdateOptions;
    result?: WithId<ModelType> | null;
  };
  [METHODS.UPDATE_MANY]: BaseHookContext<ModelType> & {
    filter: Filter<ModelType>;
    update: UpdateFilter<ModelType>;
    options: UpdateOptions;
    result?: UpdateResult;
  };
  [METHODS.DELETE]: BaseHookContext<ModelType> & {
    filter: Filter<ModelType>;
    options?: FindOneAndDeleteOptions;
    result?: WithId<ModelType> | null;
  };
  [METHODS.DELETE_MANY]: BaseHookContext<ModelType> & {
    filter: Filter<ModelType>;
    options: DeleteOptions;
    result?: DeleteResult;
  };
  [METHODS.TOTAL]: BaseHookContext<ModelType> & {
    filter: Filter<ModelType>;
    options: CountDocumentsOptions;
    result?: number;
  };
  [METHODS.AGGREGATE]: BaseHookContext<ModelType> & {
    pipeline: Document[];
    options: AggregateOptions;
    result?: Document[];
  };
  [METHODS.BULK_WRITE]: BaseHookContext<ModelType> & {
    operations: AnyBulkWriteOperation<ModelType>[];
    options?: BulkWriteOptions;
    result?: BulkWriteResult;
  };
}

/**
 * Internal per-model hook storage (replaces `preMethod: Record<METHODS,
 * Function>`) — one `{ pre; post }` array pair per `METHODS` value.
 */
export type HookRegistry<ModelType extends Document> = {
  [M in METHODS]: {
    pre: HookFn<HookContextMap<ModelType>[M]>[];
    post: PostHookEntry<HookContextMap<ModelType>[M]>[];
  };
};
