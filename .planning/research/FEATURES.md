# Feature Research

**Domain:** MongoDB ODM library (Node.js / TypeScript) — thin, fast, native-driver-friendly
**Researched:** 2026-07-03
**Confidence:** MEDIUM (context7 + websearch; official docs cross-checked)

---

## Feature Landscape

### Table Stakes (Users Expect These)

Features users assume exist. Missing these = product feels broken or incomplete.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| post hooks on all CRUD methods | Every ODM (Mongoose, MikroORM) has pre+post. Only pre = half a hook system; users can't do side-effects cleanly (audit, cache invalidation, event emission) | MEDIUM | Needs result/doc passed to handler; async-aware |
| Multiple handlers per event | Mongoose 5+ normalised this. A single-handler-per-event system forces users to compose manually in their own wrapper | LOW | Register in order, execute serially, halt on first rejection |
| Async-safe hook execution | Hooks that don't await async handlers silently swallow errors. Papr has no hooks; Mongoose awaits. Users expect awaited | LOW | Already partially broken in current insertMany pre — must fix |
| Native driver options passthrough | Any "thin" ODM that swallows driver options is not actually thin. Users expect `find(filter, findOptions)` where `findOptions` is the driver's `FindOptions` | MEDIUM | Type-level + runtime: each method needs a typed options param wired through to the driver call |
| Exposed Collection / Db / MongoClient | The "escape hatch". Papr makes native access inherent; any lib positioning as "thin" that hides the collection is leaking its abstraction. Users hit this within days of adopting a new ODM | LOW | `model.collection`, `model.db`, `model.client` properties — expose from existing `MongoConnection` singleton |
| TypeScript return type accuracy | Typed results for every method — `find()` returns `T[]` not `any[]`, `findById()` returns `T \| null` not `Document`. Already partially done; must be complete and consistent | MEDIUM | Fix existing `find()` return-type inconsistency (noted in CONCERNS.md) |
| Test suite with CI | npm packages without tests are a liability signal. Users check for a CI badge before adopting a library into production | HIGH | Zero tests today; needs unit + integration (MongoDB Memory Server); CI via GitHub Actions |
| CHANGELOG / release notes | Post-v1.0, users need a machine-readable change log to evaluate upgrade risk. No changelog = no trust in semver discipline | LOW | `CHANGELOG.md`, conventional commits, or GitHub releases |
| Semver discipline (no breaking changes in patch/minor) | Publishing `1.0.0` is a contract. Users pin `^1.0.0` and expect safety. Currently in alpha with no stated policy | LOW | Needs a public API surface definition and deprecation-before-removal policy |
| Documented public API | At minimum a comprehensive README API reference; ideally a dedicated docs site. README marked WIP today | MEDIUM | Every exported method, type, and option must be documented |

---

### Differentiators (Competitive Advantage)

Features that set Mongoat apart from both Mongoose (heavy) and Papr (no hooks, no plugins).

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Standard-decorator schema API (TS5, no `reflect-metadata`) | Typegoose requires legacy `experimentalDecorators` + `emitDecoratorMetadata` + `reflect-metadata`. Mongoat can use TC39 Stage 3 standard decorators (no extra deps, no tsconfig flags) with explicit `@Prop({ type: 'string' })` annotations. Competitive: no comparable ODM does this yet | HIGH | Standard decorators = `(value, context)` signature; no runtime type inference from TS types — type must be explicit in decorator arg. Coexistence with plain-object schema API is essential (decorator is sugar, not replacement). See Decorator Decision note below. |
| Dual schema API: decorator + plain object, same runtime | Users can use `@Schema` decorator classes OR plain schema objects interchangeably. Papr is object-only; Typegoose is class-only. Having both without forcing a migration is a meaningful DX win | MEDIUM | Decorators compile down to the same internal schema object representation; the Proxy model wraps both identically |
| Plugin system (method extensions + reusable hooks) | Papr has no plugin system. Mongoose plugins are schema-level only (must be applied before model() compile). Mongoat's Proxy-based model can support model-level plugins applied at registration time — more ergonomic. Enables ecosystem: `mongoat-soft-delete`, `mongoat-audit-trail` | MEDIUM | Plugin fn receives model reference + options; can register hooks and attach methods. Must enforce registration-before-use ordering. |
| Hooks that compose with transactions | Transactional writes need hooks to run within the session. The current `withTransaction` wrapper should pass session context to pre/post hooks so plugins can participate | HIGH | Requires threading `session` option through hook context object |
| Dedicated docs site (VitePress) | VitePress is the de-facto standard for TS-first libraries (Vue 3, Vite, Vitest all use it). ~2M weekly downloads, static search built-in, zero React dependency. A docs site is the single strongest quality signal for a published library | LOW | Content work is high; build infra is low. Quick start + API reference + examples + migration guide |
| Bug-free, audited core | CONCERNS.md lists 4 known bugs (unheld pre-hooks in insertMany, proxy handler binding loss, find() return type, CUSTOM_VALIDATION.UNIQUE unimplemented) and 3 security gaps (toObjectId without validation, error detail exposure, unvalidated filters). Fixing all before v1.0 is a differentiator vs. shipping known-broken features | MEDIUM | Security gaps especially differentiate from hobbyist libs; reference MongoDB security guidelines |
| npm package hygiene: exports map, CJS+ESM, types field | Modern packages ship with `"exports"` in package.json, dual CJS/ESM builds, and `"types"` field. Missing these causes resolution issues with bundlers and tsc. Users notice immediately | MEDIUM | Verify current tsconfig/build output; likely needs `esbuild` or `tsup` for dual build |

---

### Anti-Features (Deliberately NOT Build)

Features to explicitly exclude to stay lean and focused. Documenting the "no" prevents scope creep.

| Anti-Feature | Why Requested | Why Avoid | What to Do Instead |
|--------------|---------------|-----------|-------------------|
| Population / document references (`$lookup` sugar, `.populate()`) | Mongoose popularised it; users ask for it | Encourages relational patterns on a document DB; leads to N+1 queries; adds massive complexity (recursive fetch, circular refs, projection merging). Papr deliberately excludes it. Out of stated scope. | Use `aggregate()` with `$lookup` — already exposed. Document this pattern in the docs site. |
| Virtual fields / computed properties | Mongoose feature; useful for derived values | App-level concern. A getFullName() virtual belongs in the domain model layer, not the ODM. Encourages fat models. | Document pattern: derive in application code or add as a plain method via plugin |
| Query builder / chainable API (`.where().lt().gt()`) | Mongoose supports it; looks ergonomic | Adds a parallel query DSL that must stay in sync with driver filter types. Every new driver filter operator requires a new builder method. The native filter object is already composable and typed. | Use driver filter objects directly; type them with driver's `Filter<T>` |
| Schema migration tooling | Users coming from Prisma expect it | Different problem domain. Schema migration for MongoDB = a separate CLI tool, not part of an ODM. Would require a migration runner, state tracking, and rollback logic. | Recommend `migrate-mongo` or custom scripts for migrations |
| Multi-database / multi-tenant connection management | Useful for SaaS | Explicitly out of scope per PROJECT.md. Adds connection pooling complexity. | Users can instantiate separate `MongoConnection` instances per database |
| Mongoose-style global singleton (`mongoose.connect()`, `mongoose.model()`) | Familiar to Mongoose users | The current `MongoConnection` + model registry pattern is already better (explicit, testable). A global connection singleton couples all models to a single connection and makes testing painful. | Keep the explicit connection-first pattern |
| ORM-style validation with class-validator / decorators | NestJS users may expect it | Server-side JSON Schema validation (already implemented) is the correct MongoDB-native approach. Client-side class-validator adds a dependency and duplicates logic. | Keep `$jsonSchema` validation; document how to layer app-level validation on top |
| Discriminators / model inheritance hierarchy | Mongoose `discriminator()` pattern | Complex feature that maps poorly to MongoDB's document model. Adds type-union complexity in TS. | Document alternative: separate collections per type, or a `type` discriminator field with conditional schema in application code |
| Real-time change streams as first-class API | Useful; MongoDB has native change streams | Niche use case; the driver's `collection.watch()` is already ergonomic. Adding a high-level wrapper creates an abstraction that leaks on every edge case (resume tokens, pipeline, fullDocument). | Expose via the `model.collection` escape hatch; document pattern |

---

## Decorator Decision (Key Finding)

**Question from PROJECT.md:** Should decorators *replace* or *coexist* with the plain-object API?

**Answer: Coexist. Decorators are sugar, not a replacement.**

Rationale:
- TS5 standard decorators have no runtime type metadata emission. An `@Prop()` decorator **cannot** auto-infer `String` from a TypeScript `string` property declaration without `emitDecoratorMetadata`. The type must be explicit: `@Prop({ type: 'string', required: true })`.
- This means decorators in Mongoat are *configuration decorators* (like `@Route` in Fastify plugins), not *type-inference decorators* (like Typegoose's `@prop`). They collect schema metadata and build the same schema object that the plain-object API produces.
- Users who prefer functional/object style should never be forced to adopt classes.
- The internal schema representation stays as a plain JSON Schema object. Decorators are a compile-time transformation into that representation.
- `@Schema` / `@Prop` / `@Optional` / `@Pre` / `@Pattern` / `@Description` are all viable as standard decorators with explicit metadata values.

**Implementation path:**
1. `@Schema(name, options)` → registers collection name + options
2. `@Prop({ type, required, ... })` → adds field to schema object (explicit, no metadata reflection)
3. `@Pre('insert', handler)` → attaches hook (decorator applies before model registration)
4. Plain-object `createModel(schema, config)` continues to work unchanged

---

## Feature Dependencies

```
post hooks
    └──requires──> async hook executor (currently sync/fire-and-forget in some paths)
                       └──requires──> hook context object (carries session, method, args)

plugin system
    └──requires──> post hooks (plugins need to register both pre and post)
    └──requires──> model registration timing (plugins applied at createModel time)

decorator schema API
    └──requires──> plain-object schema (decorators compile to it; must exist first)
    └──enhances──> plugin system (plugins can be attached via @Plugin decorator)

native options passthrough
    └──requires──> TS type audit of all method signatures (each needs driver Options type)

escape hatch (collection/db/client)
    └──requires──> MongoConnection to expose getters (low risk change)

test suite
    └──requires──> CI pipeline (tests without CI are useless for quality signalling)
    └──requires──> bug fixes in CONCERNS.md (can't test known-broken code to green)

docs site
    └──enhances──> all features (undocumented features don't exist for users)
    └──requires──> v1.0 API stabilization (docs for a moving API is wasted effort)

v1.0 API stabilization
    └──requires──> test suite (can't promise stability without tests proving it)
    └──requires──> bug fixes (can't call v1.0 stable with known bugs)
    └──requires──> options passthrough (incomplete API isn't stable)
    └──requires──> escape hatch (missing escape hatch will force a breaking change later)
```

### Dependency Notes

- **post hooks require async hook executor:** The current pre-hook path in `insertMany` doesn't await (noted in CONCERNS.md). Fix this first before adding post hooks — both share the same executor.
- **plugin system requires post hooks:** A plugin that can only register pre hooks is half a plugin system. Post hooks must land first.
- **v1.0 requires test suite:** Declaring a stable public API without tests is a trust problem with potential adopters. Tests must exist before `1.0.0` tag.
- **decorator API requires plain-object schema:** Decorators are a compile-time sugar layer over the existing schema object representation. The object API is the foundation; decorators cannot come first.
- **docs site requires v1.0 API stabilization:** Writing comprehensive docs against an unstable API wastes effort. The docs site should be built as part of the v1.0 hardening phase, not before.

---

## MVP Definition (v1.0 scope)

### Must Ship with v1.0

- [ ] Fix all known bugs from CONCERNS.md — cannot call a buggy release v1.0
- [ ] post hooks on all CRUD methods — table stakes; missing = feels alpha
- [ ] Multiple handlers per event, async-awaited, correct error propagation — standard expectation
- [ ] Native driver options passthrough on all methods — "thin" positioning requires it
- [ ] Exposed `model.collection` / `model.db` / `model.client` escape hatch — required for thin positioning
- [ ] Test suite (unit + integration) with CI — quality signal gating adoption
- [ ] CHANGELOG.md + semver discipline policy documented — v1.0 is a contract
- [ ] Comprehensive API reference (README or docs site) — undocumented = unusable

### Add After v1.0 Ships (v1.x)

- [ ] Plugin system — once hooks are solid; enables community ecosystem to form
- [ ] Decorator schema API (`@Schema`, `@Prop`, `@Pre`, `@Optional`, `@Pattern`) — DX differentiator; add after core is stable
- [ ] Dedicated VitePress docs site — quality signal amplifier; README sufficient for v1.0 launch
- [ ] npm package dual build (CJS + ESM, exports map) — important but not blocking initial stable release

### Future Consideration (v2+)

- [ ] Hooks composing with transaction session — complex threading; real use cases unclear until adoption
- [ ] Plugin ecosystem starter kit / example plugin — only valuable once there are plugin users
- [ ] TypeScript strict projection types (Papr v11 style) — high complexity, high value; scope for a major

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Bug fixes (CONCERNS.md) | HIGH | MEDIUM | P1 |
| post hooks + multiple handlers | HIGH | MEDIUM | P1 |
| Async hook executor fix | HIGH | LOW | P1 |
| Options passthrough | HIGH | MEDIUM | P1 |
| Escape hatch (collection/db/client) | HIGH | LOW | P1 |
| Test suite + CI | HIGH | HIGH | P1 |
| Semver policy + CHANGELOG | MEDIUM | LOW | P1 |
| API documentation | HIGH | MEDIUM | P1 |
| Plugin system | MEDIUM | MEDIUM | P2 |
| Decorator schema API | MEDIUM | HIGH | P2 |
| VitePress docs site | MEDIUM | MEDIUM | P2 |
| Dual CJS/ESM build | MEDIUM | MEDIUM | P2 |
| Hooks + transaction session integration | LOW | HIGH | P3 |
| Plugin ecosystem examples | LOW | LOW | P3 |

---

## Competitor Feature Analysis

| Feature | Mongoose | Papr | Typegoose | Mongoat v1.0 target |
|---------|----------|------|-----------|---------------------|
| pre hooks | Yes (all methods) | No | Via Mongoose | Yes (already exists, partial) |
| post hooks | Yes | No | Via Mongoose | Yes (to add) |
| Multiple handlers/event | Yes | No | Yes | Yes (to add) |
| Async-safe hooks | Yes | N/A | Yes | Needs fix (insertMany bug) |
| Plugin system | Yes (schema-level) | No | Via Mongoose | Yes, model-level (to add) |
| Schema definition style | Schema object | Builder functions | Decorators (legacy TS) | Both (object + standard decorators) |
| Native driver escape hatch | `Model.collection` (partial) | Inherent | Via Mongoose | Explicit `model.collection/db/client` |
| Options passthrough | Partial | Full (thin wrapper) | Via Mongoose | Full (to add) |
| TypeScript types | Good | Excellent (projection types) | Good (class-derived) | Good → needs consistency fixes |
| Server-side JSON Schema validation | No | Yes | No | Yes (already exists) |
| Dependencies | Heavy (many) | Minimal | Mongoose + reflect-metadata | Minimal (bson, mongodb) |
| Test coverage | High | High | High | Zero → CI target for v1.0 |
| Docs site | Yes (comprehensive) | Yes (Plex Labs) | Yes | No → VitePress target for v1.x |

---

## Sources

- [Mongoose Middleware Docs (v9.7.1)](https://mongoosejs.com/docs/middleware.html) — MEDIUM confidence (official)
- [Mongoose Plugins Docs](https://mongoosejs.com/docs/plugins.html) — MEDIUM confidence (official)
- [Typegoose @prop docs](https://typegoose.github.io/typegoose/docs/api/decorators/prop/) — MEDIUM confidence (official)
- [Papr v11 blog post — Plex Labs](https://medium.com/plexlabs/making-the-world-type-safe-for-mongodb-queries-papr-v11-46266bb87594) — MEDIUM confidence (official authors)
- [TypeScript 5.0 Release Notes — Decorators](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-5-0.html) — MEDIUM confidence (official)
- [Semantic Versioning 2.0.0](https://semver.org/) — HIGH confidence (spec)
- [LogRocket: Using modern decorators in TypeScript](https://blog.logrocket.com/using-modern-decorators-typescript/) — LOW confidence (blog)
- [Thecodebarbarian: What's new in Mongoose 5 post hooks](https://thecodebarbarian.com/whats-new-in-mongoose-5-improved-post-hooks.html) — LOW confidence (blog, cross-checks official docs)

---

*Feature research for: MongoDB ODM library (@iamcalegari/mongoat)*
*Researched: 2026-07-03*
