# Pitfalls Research

**Domain:** MongoDB ODM Library (Node.js/TypeScript) — v1.0 Stabilization
**Researched:** 2026-07-03
**Confidence:** MEDIUM (cross-verified web sources; no single authoritative primary source exists for ODM design pitfalls)

---

## Critical Pitfalls

### Pitfall 1: Hook Chain Not Awaited — Silent Data Corruption

**What goes wrong:**
Pre-hooks called with `forEach(async fn)` or `Promise.all` without actually awaiting the full array before executing the target operation. Documents enter the database before transformations (default injection, normalization, computed fields) are applied. This is already confirmed in Mongoat's `insertMany` at `src/model/index.ts:303-305`.

**Why it happens:**
`array.forEach` ignores returned Promises. Developers write `docs.forEach(async doc => { await preHook(doc) })` and assume it is awaited because there is `await` inside — but forEach is not Promise-aware. The result is a fire-and-forget race.

**How to avoid:**
Replace all hook invocation loops with `await Promise.all(docs.map(async doc => preHook(doc)))` or a sequential `for...of` loop with `await`. Write a test that confirms the transformed value is present in the database, not the original.

**Warning signs:**
- Pre-hooks run in unit tests but transformed data is absent from the actual inserted document.
- Hooks that add audit timestamps or apply defaults produce inconsistent results on bulk inserts.
- `insertMany` and `insert` produce different document shapes for the same hook.

**Phase to address:**
Bug-fix phase (before any hook system expansion). Must be resolved before building post-hooks or plugin hooks, or the same bug propagates into every new hook site.

---

### Pitfall 2: Infinite Recursion via Hooks Calling Model Methods

**What goes wrong:**
A hook registered on method X internally calls the same model method X (or another method that triggers X). Example: a `pre('insert')` hook that calls `this.model.findOne()` to check for duplicates, where `findOne` itself has a `pre` hook that runs validation that calls `findOne` again. Alternatively: a `post('update')` hook that calls `update()` to write an audit record, which triggers the same `post('update')` hook. The result is a stack overflow or infinite Promise chain exhaustion.

**Why it happens:**
Hooks are registered globally on a model, not per-call-site. Any internal call to a model method inside a hook body re-enters the hook. This is the same reason `console.log()` inside Node.js async_hooks crashes the process — the act of calling the hooked operation re-triggers the hook.

**How to avoid:**
- Maintain a per-operation `inHook` boolean guard: set it before entering hook execution, clear it after; skip hooks if already inside.
- Alternatively, provide a "raw" escape hatch (already planned: native `Collection`/`Db` access) that bypasses the hook layer entirely. Hooks that need to query the database must use the raw driver, not the model's hooked methods.
- Document this constraint explicitly. Plugin authors must understand it.

**Warning signs:**
- Stack overflow in test or production when a hook performs any database read/write.
- Tests pass in isolation but hang or overflow when hooks that call model methods are registered.
- Any plugin that performs "cross-model" writes inside hooks.

**Phase to address:**
Hook system design phase. The guard mechanism must be in the core hook executor, not each individual hook. The native escape hatch must be built first so hooks have a safe way to access MongoDB.

---

### Pitfall 3: Post-Hook Errors Silently Swallowed

**What goes wrong:**
Post-hooks execute after the database operation already succeeded. If a post-hook throws or rejects, and the hook executor does not propagate the rejection back to the caller, the user sees a successful operation return value while the post-hook side-effect (audit log, cache invalidation, notification) silently fails.

**Why it happens:**
It is tempting to wrap post-hook execution in a try/catch that logs and swallows errors, to avoid failing a successful DB operation over a hook side-effect. But this makes bugs invisible and is almost always wrong for data-integrity hooks.

**How to avoid:**
Post-hooks must always propagate errors unless the hook is explicitly registered as "fire and forget" with a `{ fireAndForget: true }` option. Provide a distinct `postAsync` registration variant that makes the contract explicit. Never silently swallow in the default path.

**Warning signs:**
- Hook registration that wraps user callback in `try/catch` without rethrowing.
- Post-hook test assertions that pass even when the hook throws.
- Any `.catch(() => {})` in the hook executor's post-hook dispatch loop.

**Phase to address:**
Hook system design phase. Define the error-propagation contract in the API spec before implementation.

---

### Pitfall 4: TypeScript Decorator API Choice Locks In the Wrong Compatibility Target

**What goes wrong:**
Choosing TC39 Stage 3 decorators (TypeScript 5.0+, no `experimentalDecorators` flag) makes it impossible to access runtime type metadata via `reflect-metadata` (`design:type`). This means you cannot auto-infer field types at runtime from TypeScript declarations — every field type must be declared explicitly or inferred by other means. Choosing legacy `experimentalDecorators` chains you to a deprecated system that esbuild, Vite's default mode, and tsx do not support without extra plugins.

**Why it happens:**
The two decorator APIs are mutually exclusive in a single tsconfig. TC39 Stage 3 was designed without `emitDecoratorMetadata` intentionally — the spec authors considered it out of scope. `reflect-metadata` was always a polyfill over a non-standard hole in the spec. As of mid-2026, the replacement (`Symbol.metadata`) has not reached Stage 3.

**How to avoid:**
- Design the decorator schema API so it does NOT rely on `design:type` runtime reflection. Require explicit type annotation in the decorator call: `@Field({ type: String })` instead of inferring `String` from the TypeScript type. This makes both decorator systems viable.
- If explicit type annotation is unacceptable UX, stay on `experimentalDecorators` + `emitDecoratorMetadata` for now, document the requirement, and document that esbuild-based bundlers need `@babel/plugin-proposal-decorators` or `swc` with decorator-metadata plugin.
- Never make `reflect-metadata` a hidden implicit dependency — list it as a `peerDependency` and document `import 'reflect-metadata'` at entrypoint.

**Warning signs:**
- Field type resolves to `Object` or `undefined` at runtime instead of `String`/`Number`.
- Tests pass in ts-jest but fail when built with tsup/esbuild.
- Users on Vite-based projects report schema decorators not working.

**Phase to address:**
Decorator API design phase. This decision is irreversible once the API is published. Decide before writing any decorator implementation code.

---

### Pitfall 5: MongoDB Operator Injection via User-Supplied Filters

**What goes wrong:**
An application passes unsanitized user input (e.g. HTTP query params parsed as JSON) directly to ODM filter arguments. A user-supplied filter `{ "username": { "$gt": "" } }` matches every document. More dangerous: `{ "password": { "$regex": ".*" } }` matches any password. The `$where` operator, if exposed, allows arbitrary JavaScript execution on the MongoDB server (CPU denial-of-service, data exfiltration).

**Why it happens:**
MongoDB driver accepts filter objects with operator keys (`$gt`, `$where`, `$regex`, etc.) as valid. An ODM that passes `filter` arguments through to the driver without stripping operator keys is transparently injectable. JSON Schema validation on the collection protects only insert/update payloads — not query filters.

**How to avoid:**
- Add a `sanitizeFilter` utility that recursively rejects keys beginning with `$` in user-provided filter objects (or delegates to `mongo-sanitize`). Expose it and call it in all query methods when filters originate from user input.
- Never allow `$where` in filters accepted by the ODM at the library layer. Strip it unconditionally.
- Type-cast expected scalar filter values before use (e.g., `String(userId)` before `findById`).
- Document in the security guide: "schema validation does not protect query filters."
- Fix the existing `toObjectId()` to validate format before conversion (known concern from CONCERNS.md).

**Warning signs:**
- Filter arguments typed as `Record<string, unknown>` or `any` with no validation before driver call.
- No test covering `{ field: { $gt: '' } }` as a filter input.
- No mention of operator injection in security documentation.

**Phase to address:**
Security hardening phase (before v1.0 release). Also relevant: expose the native `Collection` escape hatch so users doing raw queries can still work without routing through potentially unguarded ODM methods.

---

### Pitfall 6: Breaking Semver on the Jump from Alpha to v1.0

**What goes wrong:**
The library has been alpha-tagged through many releases (`v1.0.34-alpha`). Users who adopted it in alpha have integrated against the current API. Releasing `v1.0.0` with renamed methods, changed return types, or removed constructor options is a silent breaking change that is not communicated by the version number alone (since consumers may pin `^1.0.0` and auto-update).

**Why it happens:**
During alpha, "anything can change" is true by convention but not by semver spec. When you publish `1.0.0`, npm consumers using `^1.0.0-alpha` will resolve to `1.0.0` automatically. If the 1.0.0 API differs from the latest alpha, they break silently on the next `npm install`.

**How to avoid:**
- Treat the alpha-to-v1.0 transition as a major version boundary: audit every public export for API drift.
- Publish `v1.0.0-rc.1` (release candidate) before final `v1.0.0` and announce it with a migration guide.
- Enumerate every change from `v1.0.34-alpha` to `v1.0.0` in a CHANGELOG. Identify any method renamed, signature changed, option removed.
- Use `npm deprecate @iamcalegari/mongoat@"<1.0.0" "Pre-release; upgrade to 1.0.0"` after stable is out.
- TypeScript type changes count as breaking changes: narrowing an input type, removing an overload, changing a return type generic are all major bumps post-v1.0.

**Warning signs:**
- No CHANGELOG exists.
- No explicit API compatibility audit between current alpha and planned v1.0 surface.
- Public methods with inconsistent return types (already flagged: `find()` mixing `Promise<T|null> | null`).

**Phase to address:**
API stabilization phase (explicit phase before the v1.0.0 tag). Should produce a diff document: "public API in alpha" vs "public API in v1.0.0."

---

### Pitfall 7: Dual ESM/CJS Export Misconfiguration Breaks TypeScript Consumers

**What goes wrong:**
Publishing a library with `"type": "module"` in `package.json` but without a proper `exports` field causes CJS consumers to get `ERR_REQUIRE_ESM`. Conversely, omitting `"type": "module"` but outputting `.mjs` files leaves the `main` field pointing to CJS while the actual ESM entry is invisible. Type declarations placed only at the root `"types"` field are not picked up correctly by TypeScript when using `"moduleResolution": "Node16"` or `"Bundler"` — TypeScript resolves types per-condition inside `exports`.

**Why it happens:**
The ESM/CJS dual-publish story requires coordinated changes across `package.json` (`exports`, `main`, `module`, `types`), `tsconfig.json` (`module`, `moduleResolution`), and the build tool output. Any mismatch silently produces wrong types or runtime errors. TypeScript will not warn about misconfigured `exports` — it just fails to find the types.

**How to avoid:**
- Use `tsup` (or `tsdown`) to emit both `.js`/`.d.ts` (CJS) and `.mjs`/`.d.mts` (ESM) from one source.
- Structure `exports` with `types` first in each condition: `{ "import": { "types": "...", "default": "..." }, "require": { "types": "...", "default": "..." } }`.
- Set `"files": ["dist"]` in `package.json` — do not rely on `.npmignore`. Verify with `npm pack --dry-run`.
- Run `npx @arethetypeswrong/cli` against the packed tarball before every release to catch types resolution failures before consumers see them.
- Do not use `"type": "module"` at the package root for a dual-publish library; use explicit `.mjs`/`.cjs` extensions instead.

**Warning signs:**
- `require('@iamcalegari/mongoat')` throws `ERR_REQUIRE_ESM`.
- TypeScript reports "Module has no exported member" despite the export existing at runtime.
- `"types"` field at root does not match the CJS entry point.
- `src/` directory is included in the published tarball.

**Phase to address:**
CI/CD and publish pipeline phase. Run `are-the-types-wrong` as a CI gate before every npm publish. Include a CJS and ESM consumer integration test in the CI matrix.

---

## Moderate Pitfalls

### Pitfall 8: Plugin System API-Surface Creep

**What goes wrong:**
Plugins start as "add methods to a model." Over time, plugins need access to hooks, schema, collection options, connection, and lifecycle events. The plugin API expands to expose everything, becoming a second full SDK embedded inside the library. Breaking the plugin API becomes as costly as breaking the public API, and the surface is impossible to document completely.

**Why it happens:**
Each plugin author requests the thing they need right now. Without a principled API boundary, each request is individually reasonable and gets added. The plugin context object grows from `{ collection }` to `{ collection, hooks, schema, db, model, lifecycle, ... }`.

**How to avoid:**
- Define the plugin contract as a typed interface before accepting any plugins: `Plugin = (context: PluginContext) => void`. Make `PluginContext` a sealed interface — nothing outside it is accessible to plugins.
- Version the `PluginContext` interface explicitly. When a new field is needed, add it as a minor-version feature.
- The planned native escape hatch (`Collection`/`Db` access) is the right answer for "I need raw driver access in my plugin" — point plugins to it rather than expanding `PluginContext`.

**Warning signs:**
- Plugin examples that import internals directly instead of using the context parameter.
- Plugin context typed as `any` or `Record<string, unknown>`.
- Plugin API adding fields "temporarily" that never get removed.

**Phase to address:**
Plugin system design phase. Write the TypeScript interface first, before any implementation.

---

### Pitfall 9: Static Model Registry Race Condition at Startup

**What goes wrong:**
Two concurrent module initializations for the same collection name both pass the `if (!!model) return` guard in the Model constructor because the check and the set are not atomic. This is already documented in CONCERNS.md. In worker-thread or serverless environments where multiple model files are imported concurrently, duplicate model instances share the same collection reference but diverge on schema/hook state.

**Why it happens:**
JavaScript is single-threaded for synchronous code, but module loading is asynchronous in ESM (`import()`). Two parallel `import('./models/user')` calls can interleave at the await boundary inside the constructor if any async work happens before the registry write.

**How to avoid:**
- Use a synchronous Map with a double-checked lock pattern (not async) for the registry. Since model registration should be synchronous (just a Map.set), there is no await boundary to interleave at.
- If async initialization is required, use a `Map<string, Promise<Model>>` pattern: set the Promise atomically before awaiting, so concurrent callers get the same Promise.
- Add a test for concurrent model construction of the same collection name.

**Warning signs:**
- Model setup code contains `await` between the existence check and the registry write.
- No test for parallel model construction.

**Phase to address:**
Bug fix phase (concurrency hardening), before the test suite is considered complete.

---

### Pitfall 10: Reflect-Metadata as Hidden Runtime Dependency

**What goes wrong:**
The decorator system requires `import 'reflect-metadata'` at the application entrypoint. If this import is missing, decorators silently fail to register metadata — fields resolve to `undefined` type, hooks are not attached. The error message is cryptic: `Cannot read property of undefined` deep inside the ODM, not "reflect-metadata not loaded."

**Why it happens:**
`reflect-metadata` augments the global `Reflect` object as a side effect. If it is not imported before any decorated class is evaluated, `Reflect.metadata` is `undefined`. Many ODM users have seen this. Typegoose documents it explicitly; Mongoose avoids the problem by not using reflect-metadata.

**How to avoid:**
- If using `experimentalDecorators` + `emitDecoratorMetadata`, list `reflect-metadata` as a `peerDependency` (not `dependency`) and check at runtime that `Reflect.metadata` is defined. Throw a clear error: `"reflect-metadata must be imported before using mongoat decorators."`.
- Provide a single entrypoint import (`import '@iamcalegari/mongoat/register'`) that imports `reflect-metadata` internally, so users don't need to manage it.
- Consider designing the decorator API to not rely on runtime type reflection at all (see Pitfall 4).

**Warning signs:**
- Field type resolves to `undefined` or `Object` instead of the declared type.
- Errors inside ODM internals that are not attributable to user code.
- No documentation mentioning `reflect-metadata`.

**Phase to address:**
Decorator API design phase.

---

### Pitfall 11: Index Drop-and-Recreate on Every Startup

**What goes wrong:**
`setupIndexes()` drops all indexes unconditionally before recreating them. In production, this causes a full re-index on every application restart — for large collections this can take minutes, during which queries are unindexed and slow. Already documented in CONCERNS.md.

**Why it happens:**
It is simpler to drop-and-recreate than to diff existing indexes against desired state. The bug is invisible in development with small datasets.

**How to avoid:**
- Fetch existing index definitions with `collection.indexes()` and compare by key pattern and options before dropping.
- Only drop indexes that differ from the desired definition.
- Add a `{ force: true }` option to allow explicit full recreation when needed.

**Warning signs:**
- Application startup time scales with collection document count.
- Monitoring shows index builds during every deployment.

**Phase to address:**
Performance and correctness phase (can be deferred from v1.0 if documented as a known limitation, but must be addressed before GA).

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Typed as `any` in catch blocks (`useUnknownInCatchVariables: false`) | Avoids refactoring error handling | Stack traces and error types are cast to strings, losing information; reopens type-safety on error paths | Never post-v1.0 |
| Skip `await` on hook arrays (forEach+async) | Less code | Silent data corruption on bulk operations | Never |
| `as Collection<T>` without null check | Less boilerplate | Crashes with undefined reference when DB is not connected, surfacing as opaque error | Acceptable only with explicit pre-condition guard at method entry |
| `main` field only (no `exports`) | Simple package.json | TypeScript consumers with Node16/Bundler moduleResolution fail to resolve types | Never for new releases |
| Omit deprecation cycle, jump directly to rename | Cleaner API faster | Existing alpha users break silently on upgrade | Never post-v1.0 |
| Plugin context typed as `any` | Quick first implementation | Plugin API can never be documented or validated; becomes a maintenance black hole | Never |

---

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| MongoDB driver v7 | Assuming `Collection.find()` is synchronous or returns null | It returns a `FindCursor`; always call `.toArray()` or iterate; never coerce to `null` |
| mongodb-memory-server | Using same instance across parallel Jest workers | Use `--runInBand` or create one instance per worker via `globalSetup` / `@jest-environment` |
| reflect-metadata + esbuild | Assuming decorators work in Vite/esbuild builds without config | esbuild does not support `emitDecoratorMetadata`; requires `@babel/plugin-proposal-decorators` or SWC config |
| `$jsonSchema` validation | Assuming it sanitizes query filters | `$jsonSchema` only validates insert/update documents, not query filter shapes |
| `toObjectId()` | Passing unvalidated string from HTTP params | Validate ObjectId format with `ObjectId.isValid(str)` before conversion; throw a typed error if invalid |
| TypeScript `exports` field | Placing `types` inside `default` condition | `types` must be the first key inside `import` and `require` conditions for TS to find them |

---

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Index drop-and-recreate on every startup | Slow startup; unindexed queries during deployment | Diff existing vs desired indexes; only recreate on change | Collections > ~100k documents |
| Schema `additionalProperties:false` recursion on deeply nested schemas | Stack overflow or exponential setup time | Add recursion depth limit; validate schema depth at registration | Schemas with nesting > ~10 levels |
| Static `KModelMap` with no eviction | Memory growth in long-running processes with many dynamic collection names | Implement LRU or explicit `unregisterModel()` | Applications with > hundreds of unique model registrations |
| All hooks run serially (not in parallel) | Hook-heavy operations are slow | Allow parallel post-hooks via `Promise.all` where ordering does not matter; document the distinction | > 3 hooks per operation |
| No connection pool configuration exposed | Default pool (100 connections) may be too large or too small | Expose `maxPoolSize`/`minPoolSize` in `DatabaseConfig`; document defaults | High-throughput or resource-constrained environments |

---

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Passing user filter objects directly to MongoDB driver without stripping `$` operators | Any document matched (`$gt: ''`, `$regex: '.*'`); NoSQL injection | Sanitize filter keys — reject or strip keys beginning with `$`; or enforce typed filter schemas |
| Exposing `$where` in ODM filter API | Arbitrary JS execution on MongoDB server; DoS via infinite loops | Unconditionally strip `$where` from any filter that passes through the ODM |
| Stringifying full Error objects in catch blocks | Stack traces and internal paths exposed to callers | Log full error server-side; surface only `error.message` (sanitized) to the caller |
| `toObjectId()` without input validation | Unhandled throw propagates as uncaught exception; can be used to probe internal error handling | Call `ObjectId.isValid(id)` before `new ObjectId(id)`; throw a typed, documented error |
| Schema mutation in `includeAdditionalPropertiesFalse()` | Shared schema objects contaminated; one model's validation affects all models sharing the schema | Clone the schema object before mutation (`structuredClone(schema)`) |
| TLS not enforced in production connection string | Man-in-the-middle risk on MongoDB traffic | Document: always use `tls=true` in production URI; optionally validate in `DatabaseConfig` |

---

## "Looks Done But Isn't" Checklist

- [ ] **Hook system:** Check that `insertMany` awaits all pre-hooks before calling the driver — not just that hooks are called. Verify with a test that transforms a field and confirms the transformed value is in the DB.
- [ ] **Post-hooks:** Verify that a throwing post-hook propagates the rejection to the caller, not just logs it.
- [ ] **Decorator schema:** Verify that field types resolve correctly at runtime (not `Object` or `undefined`) in an esbuild-built output, not just ts-jest.
- [ ] **ESM/CJS exports:** Run `npx @arethetypeswrong/cli ./dist` against the actual packed tarball — TypeScript types may resolve in `ts-jest` but fail under `moduleResolution: Node16`.
- [ ] **Security — operator injection:** Verify that `{ field: { $gt: '' } }` passed to `find()` throws or is stripped, not silently matched.
- [ ] **API surface for v1.0:** Verify that every public export from `v1.0.34-alpha` is either present with the same signature or has a CHANGELOG entry explaining the change.
- [ ] **Plugin system:** Verify that `PluginContext` is a sealed TypeScript interface — no `any`, no `[key: string]: unknown` escape hatch.
- [ ] **npm publish:** Run `npm pack --dry-run` and confirm `src/` is not in the tarball; `dist/` is; `README.md` and `package.json` are present.
- [ ] **Testing:** Confirm that tests use an isolated memory-server instance per suite, not a shared global instance; and that the server is stopped in `afterAll`.
- [ ] **Infinite recursion guard:** Confirm that registering a hook that calls a model method does not stack-overflow; add a test for it.

---

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Async hook not awaited (already in prod) | MEDIUM | Hotfix: replace forEach with `Promise.all(map)`. Identify which documents were corrupted (missing transformed fields). Re-run hook transformations over affected records via a migration script. |
| Wrong decorator API choice (experimentalDecorators locked in) | HIGH | Audit all decorator usages. If reflect-metadata inference is used pervasively, migration to TC39 requires explicit type annotation in every `@Field()` call. Cannot be done in a patch. |
| Broken ESM/CJS exports shipped to npm | LOW-MEDIUM | Unpublish within 72h (npm allows this once); republish with corrected `exports`. Notify users via GitHub issue. If >72h: publish `1.0.1` patch with fix. |
| SemVer violation (breaking change in minor/patch) | HIGH | Cannot un-publish reliably after 72h. Publish new major version. Add `npm deprecate` to the broken version. Write migration guide. User trust is damaged — invest in communication. |
| Operator injection vulnerability discovered | HIGH | Publish emergency patch with filter sanitization. Issue CVE via GitHub Security Advisory. Use `npm audit` integration to surface the advisory to downstream consumers. |
| mongodb-memory-server version mismatch found post-release | MEDIUM | Pin `mongod` binary version in test config to match production Atlas version. Add integration test job against real MongoDB Docker container to catch behavioral gaps. |

---

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Hook chain not awaited (Pitfall 1) | Phase 1 — Bug fixes | Test: `insertMany` with pre-hook that mutates a field; assert transformed value in DB |
| Infinite recursion via hook calling model method (Pitfall 2) | Phase 2 — Hook system design | Test: register hook that calls same model method; assert no stack overflow |
| Post-hook errors swallowed (Pitfall 3) | Phase 2 — Hook system design | Test: post-hook that throws; assert caller receives rejection |
| Wrong decorator API choice (Pitfall 4) | Phase 3 — Decorator API design | Decision documented in PROJECT.md before any implementation; tested in esbuild output |
| Operator injection via filters (Pitfall 5) | Phase 4 — Security hardening | Test: `{ field: { $gt: '' } }` input to all query methods; assert error or stripping |
| Breaking semver alpha-to-v1.0 (Pitfall 6) | Phase 5 — API stabilization | API compatibility audit document; RC period; CHANGELOG complete |
| Dual ESM/CJS misconfiguration (Pitfall 7) | Phase 6 — CI/CD pipeline | `are-the-types-wrong` runs as CI gate; CJS+ESM consumer smoke tests in CI |
| Plugin API-surface creep (Pitfall 8) | Phase 3 — Plugin system design | `PluginContext` TypeScript interface committed before implementation; reviewed in code review |
| Static registry race condition (Pitfall 9) | Phase 1 — Bug fixes | Test: concurrent model construction for same collection; assert single instance |
| reflect-metadata as hidden dependency (Pitfall 10) | Phase 3 — Decorator API design | Test: use decorators without importing reflect-metadata; assert clear error message |
| Index drop-recreate on startup (Pitfall 11) | Phase 1 or post-v1.0 | Document as known limitation if deferred; test: existing matching index is not dropped |

---

## Sources

- Mongoose middleware documentation — https://mongoosejs.com/docs/middleware.html (official)
- Mongoose Middleware Gripes — https://futurefoundry.co/blog/mongoose-middleware-gripes/
- Node.js async_hooks infinite recursion — https://nodejs.org/en/blog/vulnerability/january-2026-dos-mitigation-async-hooks
- TypeScript Stage 3 decorator challenges — https://medium.com/@aude.lellouche/typescript-decorators-stage-3-technical-challenges-and-tips-for-overcoming-them-8deed94a3de7
- Typegoose known issues (reflect-metadata, esbuild) — https://typegoose.github.io/typegoose/docs/guides/known-issues/
- Typegoose use without emitDecoratorMetadata — https://typegoose.github.io/typegoose/docs/guides/use-without-emitDecoratorMetadata/
- TypeScript issue #55788 — reflect-metadata not supported for TC39 decorators — https://github.com/microsoft/TypeScript/issues/55788
- Dual ESM/CJS publishing in 2025 — https://lirantal.com/blog/typescript-in-2025-with-esm-and-cjs-npm-publishing
- SemVer tricky parts — https://thoughtspile.github.io/2021/11/08/semver-challenges/
- Semantic Versioning spec — https://semver.org/
- OWASP NoSQL injection testing — https://owasp.org/www-project-web-security-testing-guide/latest/4-Web_Application_Security_Testing/07-Input_Validation_Testing/05.6-Testing_for_NoSQL_Injection
- MongoDB $where injection — https://www.invicti.com/web-application-vulnerabilities/mongodb-where-operator-javascript-injection
- mongodb-memory-server testing — https://blog.appsignal.com/2025/06/18/testing-mongodb-in-node-with-the-mongodb-memory-server.html
- Mongoat local concerns — .planning/codebase/CONCERNS.md (direct codebase analysis, HIGH confidence)

---

*Pitfalls research for: MongoDB ODM Library (mongoat) — v1.0 stabilization*
*Researched: 2026-07-03*
