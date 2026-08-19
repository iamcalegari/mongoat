# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Breaking changes are marked **BREAKING**. For step-by-step upgrade instructions
see [MIGRATION.md](./MIGRATION.md).

## [Unreleased]

### Changed

- **`Database` no longer configures MongoDB's Stable API on its own.** `connect()`
  used to inject `serverApi: { version: v1, strict: true, deprecationErrors: true }`
  whenever `process.env.NODE_ENV === 'production'`. `strict: true` makes the server
  reject every command outside Stable API v1, so any application using Atlas Vector
  Search failed with the exact value production is expected to carry:

  ```
  MongoServerError: $vectorSearch is not allowed with 'apiStrict: true' in API Version 1
  code: 323, codeName: APIStrictError
  ```

  `createSearchIndex` and `listSearchIndexes` are outside the Stable API too, so
  index-provisioning scripts broke the same way. Declaring the Stable API is the
  application's decision, not the ODM's — and tying it to an environment variable
  made it invisible: nothing in the application's own code revealed that `NODE_ENV`
  changed the driver's API contract. Mongoat now sets no `serverApi` at all; opt in
  explicitly through the constructor:

  ```ts
  import { Database, ServerApiVersion } from '@iamcalegari/mongoat';

  new Database({
    dbName: 'my-db',
    serverApi: { version: ServerApiVersion.v1, strict: true },
  });
  ```

  If you were relying on strict mode under `NODE_ENV=production`, add that option
  back explicitly. No default pins the version either: declaring `apiVersion: 1`
  unconditionally would change the wire contract for consumers that work today and
  would require server 5.0+.

### Fixed

- **`MongoClientOptions` passed to the `Database` constructor now reach the
  driver.** The constructor stored `config`, but `connect()` built the driver's
  options object from scratch and discarded it — only `uri`, `username` and
  `password` were read, elsewhere. Every other option (`maxPoolSize`, `appName`,
  `tls`, `compressors`, …) was silently dropped; `ignoreUndefined` only appeared to
  work because the value hardcoded in `connect()` matched what applications were
  passing. Precedence is now explicit and documented: **Mongoat supplies defaults,
  the constructor's config overrides them.** `ignoreUndefined: true` remains the
  only default and can now be turned off. The four Mongoat-specific fields (`uri`,
  `dbName`, `username`, `password`) are stripped before the rest is handed over —
  the driver rejects keys it does not know (`MongoParseError: option uri is not
supported`), and a compile-time exhaustiveness gate keeps that list in sync with
  `DatabaseConfig`.

### Added

- `ServerApiVersion` (value) and `ServerApi` (type) are re-exported from the
  package root, so opting into the Stable API does not require installing the
  `mongodb` driver directly.

## [1.1.0] - 2026-07-10

> Work toward the first stable **1.1.0**. Current published version: `1.0.34-alpha`.
> This section tracks every change made on the road out of the alpha line. Some
> items are still being implemented (marked _in progress_) and may shift before the
> `1.1.0-rc.0`.

### Added

- Complete **pre/post hook pipeline**: multiple handlers per CRUD method, executed
  in registration order, awaited sequentially; `post` hooks receive the operation
  result via `ctx.result`.
- `fireAndForget` post-hooks (opt-in) whose rejections are routed to an optional
  `onHookError` callback instead of propagating.
- Recursion guard so a hook that calls the model's own methods does not loop.
- **Native escape hatch**: `model.getCollection()`, `database.getClient()`,
  `database.getDb()` — direct access to the native driver (bypasses hooks/gating,
  documented as such).
- Native driver **options passthrough** on all CRUD methods, with the driver's own
  types (`FindOptions`, `AggregateOptions`, `BulkWriteOptions`, …).
- **Typed error hierarchy**: `MongoatError` plus `MongoatValidationError`,
  `MongoatConnectionError`, `MongoatDriverError`, each carrying a stable `.code`
  and a preserved `.cause`.
- Dual **CJS/ESM build** (tsdown) with an `exports` map validated by
  `are-the-types-wrong` + `publint`.
- Integration **test suite against a real MongoDB** (testcontainers).

### Changed

- **BREAKING** — Hooks now **accumulate**: `pre()`/`post()` append handlers instead
  of replacing the previous one.
- **BREAKING** — Hook functions now receive an explicit **`ctx` object** instead of
  being `this`-bound (`(ctx) => { ctx.document, ctx.options, ctx.filter, … }`).
- **BREAKING** — Errors thrown by the library are now `MongoatError`/subclasses
  (previously the driver's `MongoError`, with a `JSON.stringify(err)` message).
  Messages are sanitized; the original error is preserved in `.cause`; discriminate
  by `instanceof` or `.code`.
- **BREAKING** — Read methods (`find`, `findById`, …) **reject the returned Promise**
  when the database is not connected, instead of throwing synchronously.
- **BREAKING** — Minimum Node.js is now `^20.19.0 || >=22.12.0` (was `>=16.20.1`).
- **BREAKING** — **Subpath exports removed** (`./database`, `./model`, `./utils`,
  `./types`); import everything from the package root.

### Removed

- **BREAKING** — Runtime dependency `json-schema` removed (validation is server-side
  via `$jsonSchema`).
- **BREAKING** — Deprecated `Database.defineModel()` and `Model.create()` removed
  from the public API. Use `new Model(...)` instead — it has been the canonical
  registration API since the alpha line and covers the same behavior (config reuse,
  divergent-config detection, Proxy method gating).

### Fixed

- `insertMany` pre-hooks are now awaited before the insert (were not).
- `find()` has a consistent return type (`Promise<WithId<T> | null>`).
- `delete()` resolves the deleted document (mongodb@7 `findOneAndDelete`).
- Proxy method binding is preserved — the `allowedMethods` gate is no longer
  bypassed on first construction.
- Schema objects are no longer mutated in place; `documentDefaults` are deep-cloned
  per inserted document.

### Security

- Duplicate-key (**E11000**) error messages redact the duplicated value; the full
  value stays available via `.cause`.
- **BREAKING** — `$where` is rejected unconditionally on every method that takes a
  filter (at any depth), with `MongoatValidationError` (`code: FORBIDDEN_OPERATOR`).
- **BREAKING** — `toObjectId`/`findById` validate their input and throw
  `MongoatValidationError` (`code: INVALID_OBJECT_ID`) on malformed ids (calling
  `toObjectId()` with no argument still generates a fresh id).
- Added an opt-in `sanitizeFilter(filter)` utility that neutralizes code-execution
  operators (`$where`, `$function`, `$accumulator`, `$expr`+`$function`) in untrusted
  input while preserving normal query operators.

---

## [1.0.34-alpha] — pre-existing

Alpha line published to npm. See the git history for details. Versions `<= 1.0.34-alpha`
predate this changelog.

[1.1.0]: https://github.com/iamcalegari/mongoat/compare/v1.0.34-alpha...v1.1.0
[1.0.34-alpha]: https://github.com/iamcalegari/mongoat/releases/tag/v1.0.34-alpha
