import type { Document } from 'mongodb';

import type { HookContextMap, HookFn } from '@/types/hooks';
import type { ModelValidationSchema } from '@/types/model';
import type { METHODS } from '@/utils/enums';

/**
 * The sealed surface a plugin's `setup()` receives. Reading `schema`/
 * `allowedMethods` never exposes the live model reference — both are
 * disconnected copies, so mutating them has no effect on the model being
 * built. The only way a plugin can affect the model is through the three
 * registration methods below (`pre`/`post`/`static`).
 */
export interface PluginContext<ModelType extends Document = Document> {
  readonly collectionName: string;
  readonly allowedMethods: readonly METHODS[];
  readonly schema: Readonly<ModelValidationSchema>;

  /**
   * Registers a pre hook for `method`, appended after any hook already
   * registered for the same method (declaration order is preserved across
   * plugins and across the model's own config).
   */
  pre<M extends METHODS>(
    method: M,
    fn: HookFn<HookContextMap<ModelType>[M]>
  ): void;
  /**
   * Registers a post hook for `method`. `fireAndForget` follows the same
   * semantics as the model's own `.post()` — the hook dispatch is not
   * awaited and any rejection is routed to the model's `onHookError`
   * instead of propagating to the caller.
   */
  post<M extends METHODS>(
    method: M,
    fn: HookFn<HookContextMap<ModelType>[M]>,
    options?: { fireAndForget?: boolean }
  ): void;
  /**
   * Attaches `fn` as a method on the model under `name`. `this` inside `fn`
   * is bound to the model instance, so escape-hatch/native methods
   * (`this.getCollection()`, `this.find()`, ...) are available from within
   * it. Colliding with a native model member — or with a static already
   * registered by a different plugin — is rejected instead of silently
   * overwritten.
   */
  static(name: string, fn: (...args: never[]) => unknown): void;
}

/**
 * A plugin expressed as a plain setup function. The function's own `.name`
 * (or `'<anonymous>'` when unavailable) becomes the plugin's identity for
 * deduplication and error messages.
 */
export type PluginSetup<ModelType extends Document = Document> = (
  ctx: PluginContext<ModelType>
) => void;

/**
 * A plugin expressed as an object with an explicit `name` — preferred when
 * the identity needs to be stable independent of the setup function's own
 * name (e.g. a setup function returned by a factory).
 */
export interface PluginObject<ModelType extends Document = Document> {
  name?: string;
  setup: PluginSetup<ModelType>;
}

/**
 * A model plugin: either a bare setup function or an object carrying an
 * explicit `name` alongside its `setup`. Parametrizable plugins are plain
 * factory functions that return one of these two shapes — no extra API is
 * needed to support options.
 */
export type Plugin<ModelType extends Document = Document> =
  | PluginSetup<ModelType>
  | PluginObject<ModelType>;
