# Architecture Research

**Domain:** TypeScript ODM library (MongoDB, Node.js)
**Researched:** 2026-07-03
**Confidence:** MEDIUM (core codebase read directly; decorator/hook findings from official TS docs + Mongoose docs, cross-checked)

## Standard Architecture

### System Overview — Target State

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Application Layer                             │
│  import { User } from './models/user'                               │
│  await User.insert(doc)  |  const db = database.getDb()            │
└────────────────────┬────────────────────────┬───────────────────────┘
                     │                        │ escape hatch
┌────────────────────▼────────────────────────▼───────────────────────┐
│                        Schema Layer  (src/schema/)                   │
│  @Schema  @BsonType  @Description  @Required  @Optional  @Pre        │
│                                                                      │
│  TC39 Stage 3 decorators → context.metadata → Symbol.metadata       │
│  Schema.compile(cls) → ModelValidationSchema  (plain-object target)  │
└────────────────────┬────────────────────────────────────────────────┘
                     │ ModelValidationSchema (same as today)
┌────────────────────▼────────────────────────────────────────────────┐
│                        Model Layer  (src/model/)                     │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  Hook Pipeline  (preHooks: Record<METHODS, HookFn[]>        │    │
│  │                  postHooks: Record<METHODS, HookFn[]>)      │    │
│  ├─────────────────────────────────────────────────────────────┤    │
│  │  Plugin Registry  (plugins applied at construction)         │    │
│  ├─────────────────────────────────────────────────────────────┤    │
│  │  Schema Validator  ($jsonSchema builder, unchanged)         │    │
│  ├─────────────────────────────────────────────────────────────┤    │
│  │  CRUD Methods  (insert/find/update/delete/aggregate/…)      │    │
│  └─────────────────────────────────────────────────────────────┘    │
└────────────────────┬────────────────────────────────────────────────┘
                     │ Proxy.get() intercept
┌────────────────────▼────────────────────────────────────────────────┐
│                        Proxy Guard  (KModelProxyHandler)             │
│  allowedMethods check → throw | return bound method                 │
└────────────────────┬────────────────────────────────────────────────┘
                     │ bound method executes
┌────────────────────▼────────────────────────────────────────────────┐
│                        Database Layer  (src/database/)               │
│  MongoClient  |  Db  |  Model registry (KModelMap)                  │
│  setupCollections()  |  withTransaction()                           │
│  getClient()  |  getDb()  (new, for escape hatch)                   │
└────────────────────┬────────────────────────────────────────────────┘
                     │ collection.<method>()
┌────────────────────▼────────────────────────────────────────────────┐
│                        MongoDB Driver (mongodb@7)                    │
└─────────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Location |
|-----------|----------------|----------|
| Schema layer | Decorator metadata accumulation; compile to ModelValidationSchema | `src/schema/` |
| Model | CRUD, hook pipeline, plugin registry, schema builder | `src/model/index.ts` |
| Hook pipeline | Pre/post arrays per method; async sequential, error short-circuit | `src/model/hooks.ts` |
| Plugin registry | Apply (model, options) functions at construction time | `src/model/plugin.ts` |
| Proxy guard | Method gating via allowedMethods (unchanged structure) | `src/database/index.ts` |
| Database | Connection, model registry, collection setup, escape hatch | `src/database/index.ts` |
| Types | Public-facing interfaces including HookContext, PluginFn | `src/types/` |

## Recommended Project Structure

```
src/
├── database/
│   └── index.ts          # Database class (connection, registry, escape hatch)
├── model/
│   ├── index.ts          # Model class (CRUD, hooks, plugins)
│   ├── hooks.ts          # HookChain type, runHooks() helper
│   └── plugin.ts         # PluginFn type, applyPlugins() helper
├── schema/
│   ├── index.ts          # Decorator implementations (@Schema, @BsonType, …)
│   ├── compiler.ts       # Schema.compile(cls) → ModelValidationSchema
│   └── metadata.ts       # Metadata key constants + field metadata types
├── types/
│   ├── database.ts       # DatabaseConfig, ModelSetup
│   ├── model.ts          # CreateModelProps, ModelValidationSchema, HookContext, PluginFn
│   └── index.ts          # Re-exports
├── utils/
│   ├── enums.ts          # METHODS, CUSTOM_VALIDATION
│   ├── database.ts       # toObjectId, helpers
│   └── index.ts
└── index.ts              # Public API surface
```

### Structure Rationale

- **schema/**: Fully isolated from model internals. Knows nothing about Proxy, hooks, or Database. Outputs only `ModelValidationSchema`.
- **model/hooks.ts and model/plugin.ts**: Extracted from the Model class to keep `model/index.ts` readable; Model imports them.
- **types/model.ts**: Gets new exports (`HookContext<T>`, `HookFn<T>`, `PluginFn`) but the existing `ModelValidationSchema` type is not changed.

## Architectural Patterns

### Pattern 1: Decorator Schema as a Metadata Frontend

**What:** TC39 Stage 3 field and class decorators accumulate metadata into `context.metadata` (a plain object shared across all decorators on the same class). After all decorators run, `MyClass[Symbol.metadata]` holds the full field map. `Schema.compile()` reads that map and produces a `ModelValidationSchema` — the same type that the existing plain-object API already accepts.

**When to use:** When a user wants class-based schema authoring. The plain-object API remains fully supported; decorators are purely additive sugar.

**Why Stage 3 over experimentalDecorators:** No `reflect-metadata` runtime dependency (satisfies the "minimal deps" constraint). TS 5.x ships Stage 3 by default. `emitDecoratorMetadata` is not needed and is incompatible with Stage 3.

**Example:**
```typescript
// src/schema/index.ts

// Field decorator — writes into context.metadata
export function BsonType(type: string) {
  return function (_value: undefined, context: ClassFieldDecoratorContext) {
    const fields: FieldMetaMap = (context.metadata[FIELD_META_KEY] ??= {});
    (fields[String(context.name)] ??= {}).bsonType = type;
  };
}

// Class decorator — optional; the schema class is identified by Symbol.metadata presence
export function Schema(collectionName: string) {
  return function (_cls: unknown, context: ClassDecoratorContext) {
    context.metadata[COLLECTION_META_KEY] = collectionName;
  };
}

// compiler.ts
export function compile(cls: Function): ModelValidationSchema {
  const meta = cls[Symbol.metadata] as SchemaMetadata;
  // build properties map from meta[FIELD_META_KEY]
  // build required[] from non-optional fields
  // return ModelValidationSchema
}
```

**Coexistence contract:** `CreateModelProps.schema` accepts `ModelValidationSchema | Function`. When a class is passed, `Model` constructor calls `Schema.compile(schema)` automatically. Both forms produce identical internal state — the plain-object path is unchanged.

**Trade-offs:** Stage 3 does not support parameter decorators (not needed here). The `Symbol.metadata` polyfill is needed for runtimes below ES2022 — one tiny poly or a `Symbol.metadata ??= Symbol('metadata')` guard at startup.

---

### Pattern 2: Proxy as Gate Guard, Hooks Inside Method Body

**What:** The Proxy `get` trap is a pure access control boundary. It allows or denies access to a method by name; it does not participate in execution. All hook pipeline logic lives inside each CRUD method's body, called after the Proxy has returned the method reference.

**Execution order for any allowed method call:**

```
User.insert(doc)
    ↓
[Proxy.get("insert")]
    → "insert" in model.methods? Yes
    → "insert" in model.allowedMethods? Yes → return bound method
    ↓
[Model.insert(doc) body]
    1. Merge documentDefaults
    2. await runHooks(this.preHooks[METHODS.INSERT], ctx)
       → pre-hook 1 (may mutate ctx.args or ctx.document)
       → pre-hook 2 …  (if any pre-hook throws, abort — no driver call)
    3. collection = Database.getCollection()
    4. result = await collection.insertOne(ctx.document)
    5. ctx.result = result
    6. await runHooks(this.postHooks[METHODS.INSERT], ctx)
       → post-hook 1 (may read/transform ctx.result)
    7. return ctx.result
```

**Why this separation matters:** The Proxy must remain a synchronous `get` trap (it returns a value, not a Promise). Async pipeline execution belongs entirely inside the method body. Never put await inside the Proxy trap.

**HookFn type:**
```typescript
export interface HookContext<T extends Document = Document> {
  method: METHODS;
  args: unknown[];
  document?: T;
  filter?: Filter<T>;
  result?: unknown;
  error?: unknown;
}

export type HookFn<T extends Document = Document> =
  (ctx: HookContext<T>) => void | Promise<void>;
```

**Error short-circuit:** If any pre-hook throws, `runHooks` propagates the error immediately. No driver call occurs. Post-hooks do not run. This matches Mongoose's established behavior.

**Data structure change in Model:**
```typescript
// Replace:
preMethod: Record<METHODS, Function>

// With:
preHooks: Record<METHODS, HookFn[]>
postHooks: Record<METHODS, HookFn[]>

// Public API becomes additive:
model.pre(METHODS.INSERT, fn)   // appends to preHooks[INSERT]
model.post(METHODS.INSERT, fn)  // appends to postHooks[INSERT]
```

**Trade-offs:** Moving from one-function-per-method to an array requires initializing empty arrays for all 12 METHODS. This is a one-time schema migration of the Model constructor — not a breaking change if the old `.pre()` signature is kept and internally redirects to array push.

---

### Pattern 3: Plugin as a Model-Receiver Function

**What:** A plugin is `(model: Model<any>, options?: unknown) => void`. It receives a fully-constructed Model instance (after schema, hooks, and Proxy wrapping) and may add pre/post hooks or extend the model prototype.

**Registration:**
```typescript
// At construction time (preferred — hooks registered before first call)
const User = new Model({
  collectionName: 'users',
  schema: UserSchema,
  plugins: [timestampsPlugin, slugPlugin({ field: 'username' })],
});

// Or as global plugin applied to all future models
Model.plugin(auditLogPlugin);
```

**What plugins can touch:**
- `model.pre(method, fn)` / `model.post(method, fn)` — register hooks
- `model.statics.myMethod = fn` — add static methods exposed through model
- Should NOT touch: `model.collectionName`, `model.validator`, `model.allowedMethods` (schema-level concerns finalized at construction)

**What plugins must NOT do:**
- Wrap or replace the Proxy — they receive the post-Proxy model instance
- Modify `Model[kDatabase]` — global singleton, not per-model
- Add prototype methods that clash with METHODS enum names — would be gated by the Proxy

**Trade-offs:** Plugins applied via the constructor `plugins` array run before `registerModel()` wraps the model in a Proxy, so they correctly affect the underlying model. Global `Model.plugin()` must be called before any model is constructed.

---

### Pattern 4: Escape Hatch Without Breaking Gating

**What:** Expose raw MongoDB primitives via explicit, named methods that are not in the METHODS enum. Because the Proxy only gates methods whose names appear in `target.methods` (= `Object.values(METHODS)`), any method outside that enum passes through the Proxy unconditionally.

**Implementation:**
```typescript
// On Model (already safe — getCollection not in METHODS enum)
getCollection(): Collection<ModelType> {
  return Model[kDatabase]!.getCollection<ModelType>(this.collectionName)!;
}

// On Database (new methods)
getClient(): MongoClient { return this[kClient]!; }
getDb(): Db { return this[kDb]!; }
```

**Why this is safe:** The Proxy `get` trap currently checks `target.methods.includes(prop)` before gating. Since `getCollection`, `getClient`, `getDb` are not in `METHODS`, they are never gated. The user explicitly opts out of ODM guarantees when they call these.

**Documentation contract:** These methods carry a JSDoc `@unsafe` notice: calling them bypasses hooks, validators, and method gating. This is intentional. The user is dropping to the native driver layer.

**Note:** Do not expose `[kDatabase]`, `[kClient]`, or `[kDb]` symbol keys directly. The named methods provide a stable public API while keeping the internal Symbol-based encapsulation intact.

## Data Flow

### Decorated Schema Path

```
Class definition with decorators
    ↓ field decorators run first (bottom to top per property)
    ↓ class decorator (@Schema) runs last
context.metadata populated
    ↓
MyClass[Symbol.metadata] accessible on class
    ↓
Schema.compile(MyClass)
    ↓
ModelValidationSchema (plain object)
    ↓
new Model({ schema: compiledSchema, ... })
    ↓
schemaValidatorBuilder() — unchanged
    ↓
{ $jsonSchema: ... } stored on model instance
    ↓
database.setupCollections() → collMod command
```

### Hook Pipeline Execution

```
Application: await User.insert(doc)
    ↓
Proxy.get("insert") — gate check passes
    ↓
Model.insert(doc) body
    ↓
ctx = { method: INSERT, document: merged(defaults, doc) }
    ↓
for hookFn of preHooks[INSERT]:
  await hookFn(ctx)   ← throws = abort, no driver call
    ↓
collection.insertOne(ctx.document)
    ↓
ctx.result = insertedDoc
    ↓
for hookFn of postHooks[INSERT]:
  await hookFn(ctx)   ← can transform ctx.result
    ↓
return ctx.result
```

### Plugin Registration Flow

```
new Model({ plugins: [pluginA, pluginB] })
    ↓
constructor: schema validation + index setup
    ↓
for plugin of plugins: plugin(this, pluginOptions)
  → plugin may call model.pre() / model.post()
    ↓
Database.registerModel(this)
    ↓
Proxy wraps model instance → stored in KModelMap
    ↓
Model returned to application
```

### Key Data Flows

1. **Schema compilation:** Class-with-decorators → `Symbol.metadata` → `Schema.compile()` → `ModelValidationSchema` → unchanged internal validator path.
2. **Method call:** Application → Proxy gate → method body → pre-hooks → driver → post-hooks → return.
3. **Plugin registration:** `plugins[]` array processed during constructor, before Proxy wrapping — hooks are registered on the raw model, not the proxied one.
4. **Escape hatch:** Application calls `model.getCollection()` → Proxy passes through (not in METHODS) → returns native `Collection<T>` directly.

## Scaling Considerations

This is a library, not a deployed service. "Scaling" here means API surface and bundle maintainability.

| Scale | Architecture Adjustments |
|-------|--------------------------|
| Initial alpha → v1.0 | Keep all components in `src/` flat; no package splitting needed |
| Large monorepo consumers | Consider optional `@mongoat/decorators` peer package if decorator-less users want smaller bundle; not needed immediately |
| High plugin adoption | If global plugins become numerous, add plugin deduplication by identity check before push |

### Scaling Priorities

1. **First risk:** Global `Model.plugin()` applied after some models are constructed silently misses them — enforce call-order contract in docs and throw if called after first model construction.
2. **Second risk:** `Database[KModelMap]` is a static Map — in multi-database scenarios (multiple `new Database()` instances), models from different instances share the same map. This is a known design limitation; document it rather than fix in v1.0.

## Anti-Patterns

### Anti-Pattern 1: Async Logic Inside the Proxy Trap

**What people do:** Try to put middleware or validation inside the Proxy `get` or `apply` trap using async functions.

**Why it's wrong:** The Proxy `get` trap must return synchronously. An async trap would return a Promise where the caller expects a method — breaking the entire call chain silently.

**Do this instead:** Keep the Proxy trap as a synchronous gate (allow/deny only). Run all async pipeline logic inside the method body after the trap returns the method reference.

---

### Anti-Pattern 2: experimentalDecorators for the Schema Layer

**What people do:** Use `experimentalDecorators: true` + `emitDecoratorMetadata: true` + `reflect-metadata` import to read type information automatically.

**Why it's wrong:** Adds `reflect-metadata` as a runtime dependency (violates minimal-deps constraint). The experimental API is incompatible with TC39 Stage 3. You cannot mix both in the same project. TypeORM and typegoose are stuck on this path — not a model to follow for a new library in 2025+.

**Do this instead:** Use TC39 Stage 3 decorators (default in TS 5.x). Write field types explicitly via `@BsonType('string')` rather than relying on reflected types. Store field metadata in `context.metadata`; read it from `Symbol.metadata` at compile time. Zero new runtime dependencies.

---

### Anti-Pattern 3: Plugins Modifying Schema After Construction

**What people do:** A plugin adds a new field to `model.validator.$jsonSchema.properties` after the model is constructed and registered.

**Why it's wrong:** `setupCollections()` has already run (or will run) with the original schema. Runtime mutations to the validator object do not propagate to MongoDB's collection validator, causing validation mismatches between the ODM layer and the server.

**Do this instead:** Schema is frozen after `setupCollections()`. Plugins that need schema extensions must be applied before model construction using the `plugins[]` constructor option, which runs before `registerModel()`. Consider calling `Object.freeze(model.validator)` after setup to make the constraint explicit.

---

### Anti-Pattern 4: Replacing the Proxy Rather Than Extending It

**What people do:** A plugin or middleware layer wraps the model in a second Proxy to intercept additional behavior.

**Why it's wrong:** Double-Proxy creates ambiguous `this` binding, breaks the existing binding bug fix in `KModelProxyHandler`, and makes debugging nearly impossible.

**Do this instead:** All extension points (hooks, plugins, statics) operate on the underlying model instance before the single Proxy is applied. The Proxy is a sealed boundary — extend behind it, never around it.

---

### Anti-Pattern 5: One Hook Function Per Method (Current State)

**What the current code does:** `preMethod: Record<METHODS, Function>` — a single function per method, calling `.pre()` twice replaces the first handler silently.

**Why it's wrong:** Users cannot combine two plugins that each need a pre-hook on the same method.

**Do this instead:** Change to `preHooks: Record<METHODS, HookFn[]>` and `postHooks: Record<METHODS, HookFn[]>`. Both `.pre()` and `.post()` append to the arrays. `runHooks()` iterates them in registration order.

## Integration Points

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| Schema layer → Model | `Schema.compile(cls)` returns `ModelValidationSchema`; no other coupling | Schema layer has no import of Model or Database |
| Model → Database | `Model[kDatabase]` static symbol reference; `getCollection()` called per-operation | Circular import exists; is safe because Database is loaded first |
| Plugin → Model | Plugin receives Model instance; calls `model.pre/post/statics` | Plugin must not import Database directly |
| Escape hatch → Driver | `model.getCollection()` / `database.getDb()` bypass all ODM layers | Documented as unsafe; no hooks, no gating |
| Hook pipeline → Proxy | No coupling — hooks are in method bodies, Proxy is a wrapper on the outside | Proxy trap is synchronous; hook execution is after trap resolution |

## Build Order

These components have hard dependencies. Build in this order:

1. **Bug fixes** (insertMany forEach, Proxy binding return, find() return type) — unblock everything else; can be tested immediately.
2. **Hook pipeline** (replace `preMethod` Record with arrays; add `runHooks`; add `postHooks`) — every subsequent feature depends on a working hook system.
3. **Options passthrough** (`options?` param on all CRUD methods passed through to driver) — simple additive change; makes hooks more useful (hooks see native options).
4. **Escape hatch** (`model.getCollection()`, `database.getClient()`, `database.getDb()`) — additive; unblocks users who need native access; enables integration tests against real collections.
5. **Tests + CI baseline** — once hooks + options are stable, a test baseline before the schema layer lands.
6. **Schema layer — decorator compiler** (`src/schema/`) — purely additive; no Model internals change; compiles to existing `ModelValidationSchema`.
7. **Decorator integration in Model constructor** — detect class vs plain-object schema in `CreateModelProps`; call `Schema.compile()` transparently.
8. **Plugin system** — depends on hook pipeline arrays being in place (plugins register hooks); must test interactions with Proxy boundary.
9. **API stabilization** — audit all public exports, add JSDoc, deprecate `Model.create()` / `Database.defineModel()`, finalize semver contract for v1.0.

## Sources

- TypeScript 5.0 release notes — Stage 3 decorators: https://www.typescriptlang.org/docs/handbook/release-notes/typescript-5-0.html
- TypeScript 5.2 decorator metadata (Symbol.metadata): https://devblogs.microsoft.com/typescript/announcing-typescript-5-2/
- TC39 decorator-metadata proposal: https://github.com/tc39/proposal-decorator-metadata
- Mongoose middleware docs (pre/post hook ordering, async, error short-circuit): https://mongoosejs.com/docs/middleware.html
- FeathersJS hooks (async middleware context/next pattern): https://github.com/feathersjs/hooks
- TypeScript tsconfig — experimentalDecorators: https://www.typescriptlang.org/tsconfig/experimentalDecorators.html

---
*Architecture research for: @iamcalegari/mongoat — proxy-based thin ODM (Node.js/TypeScript)*
*Researched: 2026-07-03*
