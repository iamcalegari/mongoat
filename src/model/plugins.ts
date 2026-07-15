import type { Document } from 'mongodb';

import { MongoatValidationError } from '@/errors';
import type { HookRegistry } from '@/types/hooks';
import type { ModelValidationSchema } from '@/types/model';
import type { Plugin, PluginContext, PluginObject } from '@/types/plugin';
import { METHODS } from '@/utils/enums';

/**
 * A structural view of the model members a plugin can read/mutate. This
 * module never imports the `Model` class itself — it operates purely on
 * this shape so it stays free of any module cycle; the constructor (Plan
 * 02) passes `this` where a `PluginTarget` is expected. The index
 * signature is what allows a plugin `static` to be attached dynamically
 * without widening every other member's type.
 */
export interface PluginTarget {
  collectionName: string;
  allowedMethods: METHODS[];
  validator: { $jsonSchema: ModelValidationSchema };
  hooks: HookRegistry<Document>;
  [key: string]: unknown;
}

/**
 * The real members of `Model.prototype` (public and private, gated and
 * escape-hatch) — a plugin `static` colliding with ANY of these is
 * rejected, not just the 12 methods gated by the `METHODS` enum. `private`
 * in TypeScript is compile-time only: at runtime these are ordinary
 * prototype properties, overwritable by a plugin static of the same name
 * unless checked here.
 */
export const RESERVED_NAMES: ReadonlySet<string> = new Set([
  ...Object.values(METHODS),
  'getCollection',
  'pre',
  'post',
  'collectionName',
  'indexes',
  'validator',
  'validationAction',
  'validationLevel',
  'methods',
  'allowedMethods',
  'documentDefaults',
  'hooks',
  'onHookError',
  'schemaClass',
  'schemaValidatorBuilder',
  'includeAdditionalPropertiesFalse',
  'getCollectionOrThrow',
  'buildClassDefaults',
  'executeHooked',
  'runHooked',
  'rawAggregate',
  'rawUpdate',
  'rawUpdateMany',
  'rawFindMany',
  'rawDeleteMany',
  'rawInsert',
  'rawInsertMany',
  'rawFind',
  'rawFindById',
  'rawDelete',
  'rawTotal',
  'rawBulkWrite',
]);

/**
 * Normalizes a `Plugin` entry to its object form (D-01). A bare setup
 * function becomes `{ name: fn.name || '<anonymous>', setup: fn }`; an
 * object entry is returned as-is. Mirrors the boundary-normalization idiom
 * already used for post hook entries (`src/model/index.ts`).
 */
export function normalizePlugin<ModelType extends Document = Document>(
  plugin: Plugin<ModelType>
): PluginObject<ModelType> {
  return typeof plugin === 'function'
    ? { name: plugin.name || '<anonymous>', setup: plugin }
    : plugin;
}

/**
 * Resolves the final, ordered, deduplicated plugin list — global plugins
 * first, then local plugins, each group in declaration order (D-05).
 *
 * Dedup (D-07) is keyed by the ORIGINAL reference passed by the caller
 * (the function itself, or the literal `{ name, setup }` object) — never
 * by a freshly-created normalized object, which would never compare equal
 * across calls. The same reference appearing twice (global+local, or
 * twice in the same array) is silently skipped after its first
 * occurrence. Two different references that normalize to the same `name`
 * throw `DUPLICATE_PLUGIN_NAME` instead.
 */
export function resolvePluginList<ModelType extends Document = Document>(
  globalPlugins: Plugin<ModelType>[],
  localPlugins: Plugin<ModelType>[]
): { original: Plugin<ModelType>; normalized: PluginObject<ModelType> }[] {
  const seen = new Map<Plugin<ModelType>, PluginObject<ModelType>>();
  const byName = new Map<string, Plugin<ModelType>>();
  const ordered: {
    original: Plugin<ModelType>;
    normalized: PluginObject<ModelType>;
  }[] = [];

  for (const original of [...globalPlugins, ...localPlugins]) {
    if (seen.has(original)) {
      continue;
    }

    const normalized = normalizePlugin(original);
    const pluginName = normalized.name ?? '<anonymous>';
    const existingRefForName = byName.get(pluginName);

    if (existingRefForName && existingRefForName !== original) {
      throw new MongoatValidationError(
        `Plugin "${pluginName}" is already registered with a different reference`,
        { code: 'DUPLICATE_PLUGIN_NAME' }
      );
    }

    byName.set(pluginName, original);
    seen.set(original, normalized);
    ordered.push({ original, normalized });
  }

  return ordered;
}

/**
 * Attaches `fn` as a static under `name` on `target` (D-08). `name`
 * colliding with any real `Model.prototype` member (`RESERVED_NAMES`) or
 * with a static already claimed by a DIFFERENT plugin (tracked via the
 * shared `owners` map keyed by static name → owning plugin name) throws
 * `STATIC_COLLISION` instead of silently overwriting. No `.bind()` is
 * needed here (D-12) — any function read through the Model's gating Proxy
 * (`Database[KModelProxyHandler]`) is already bound to the target
 * instance on access.
 */
export function registerPluginStatic(
  target: PluginTarget,
  name: string,
  fn: (...args: never[]) => unknown,
  pluginName: string,
  owners: Map<string, string>
): void {
  if (RESERVED_NAMES.has(name)) {
    throw new MongoatValidationError(
      `Plugin "${pluginName}" cannot register static "${name}" — it collides with a native Model member`,
      { code: 'STATIC_COLLISION' }
    );
  }

  const owner = owners.get(name);

  if (owner && owner !== pluginName) {
    throw new MongoatValidationError(
      `Static "${name}" is already registered by plugin "${owner}" — plugin "${pluginName}" cannot overwrite it`,
      { code: 'STATIC_COLLISION' }
    );
  }

  owners.set(name, pluginName);
  target[name] = fn;
}

/**
 * Builds the sealed `PluginContext` a single plugin's `setup()` receives
 * (D-03). `allowedMethods` is a shallow-frozen copy (fine — an array of
 * primitive strings, no nesting to protect); `schema` is a
 * `structuredClone` of the live `$jsonSchema` — `Object.freeze` alone is
 * shallow and would NOT protect nested `properties`/`items`, so the
 * "never the live reference" guarantee comes from cloning, not freezing.
 * `pre`/`post`/`static` are the only effect channels, each operating
 * directly on `target`.
 */
export function buildPluginContext(
  target: PluginTarget,
  pluginName: string,
  owners: Map<string, string>
): PluginContext {
  return {
    collectionName: target.collectionName,
    allowedMethods: Object.freeze([...target.allowedMethods]),
    schema: structuredClone(target.validator.$jsonSchema),
    pre(method, fn) {
      target.hooks[method].pre.push(fn);
    },
    post(method, fn, options) {
      target.hooks[method].post.push({
        fn,
        fireAndForget: options?.fireAndForget,
      });
    },
    static(name, fn) {
      registerPluginStatic(target, name, fn, pluginName, owners);
    },
  };
}

/**
 * Resolves the global + local plugin lists and runs each unique plugin's
 * `setup()` SYNCHRONOUSLY, in order (global → local), inside a try/catch
 * (D-04/D-10). A shared `owners` map is created once per call so static
 * collisions are detected across the WHOLE resolved list, not just within
 * one group. Any thrown error aborts immediately — no further plugin in
 * the list is applied — wrapped in `MongoatValidationError` with code
 * `PLUGIN_SETUP_FAILED`, the offending plugin's name in the message, and
 * the original error preserved as `.cause`.
 */
export function applyPlugins<ModelType extends Document = Document>(
  target: PluginTarget,
  globalPlugins: Plugin<ModelType>[],
  localPlugins: Plugin<ModelType>[]
): void {
  const resolved = resolvePluginList(globalPlugins, localPlugins);
  const owners = new Map<string, string>();

  for (const { normalized } of resolved) {
    const pluginName = normalized.name ?? '<anonymous>';

    try {
      normalized.setup(buildPluginContext(target, pluginName, owners));
    } catch (err) {
      throw new MongoatValidationError(
        `Plugin "${pluginName}" failed during setup()`,
        { cause: err, code: 'PLUGIN_SETUP_FAILED' }
      );
    }
  }
}
