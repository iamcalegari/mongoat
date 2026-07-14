---
phase: 06-api-de-schema-com-decorators-tc39
reviewed: 2026-07-14T03:03:56Z
depth: standard
files_reviewed: 23
files_reviewed_list:
  - scripts/smoke-decorators.mjs
  - src/errors/index.ts
  - src/index.ts
  - src/model/index.ts
  - src/schema/compile.ts
  - src/schema/decorators.ts
  - src/schema/guards.ts
  - src/schema/index.ts
  - src/schema/polyfill.ts
  - src/schema/sugars.ts
  - src/types/index.ts
  - src/types/model.ts
  - src/types/schema.ts
  - test/model/registry-config.test.ts
  - test/schema/compile-equivalence.test.ts
  - test/schema/decorated-vs-plain-parity.test.ts
  - test/schema/hook-decoration-errors.test.ts
  - test/schema/hooks-decorator-order.test.ts
  - test/schema/legacy-mode-guard.test.ts
  - test/schema/nested-compile.test.ts
  - test/schema/per-insert-defaults.test.ts
  - test/schema/schema-class-or-plain.test.ts
  - test/schema/sugars.test.ts
findings:
  critical: 1
  warning: 9
  info: 5
  total: 15
status: issues_found
---

# Phase 6: Code Review Report

**Reviewed:** 2026-07-14T03:03:56Z
**Depth:** standard
**Files Reviewed:** 23
**Status:** issues_found

## Summary

Reviewed the TC39 decorator schema API (decorators, sugars, compile, guards, polyfill), the `Model` constructor integration (decorated-class resolution, per-insert defaults, decorated hook wiring), types, the production smoke script, and 10 test files. Cross-referenced against `src/model/hooks.ts` (hook pipeline) and `src/utils/enums.ts` to verify hook-dispatch semantics.

The core compile path (metadata → `ModelValidationSchema`) is solid: clone discipline is respected at compile time, `@Optional` ordering idempotence is correctly implemented via `optionalFields`, and the legacy-mode guard fails loud on both legacy signatures. However, the field-level `@Pre` wrapper has a correctness bug with async transforms (the canonical password-hashing use case), and there is a cluster of silent-masking gaps in the re-registration comparison and in class-inheritance metadata semantics — the exact defect class (WR-04 from the Phase 5 review) this phase claims to have closed.

## Narrative Findings (AI reviewer)

## Critical Issues

### CR-01: Async field `@Pre` hook stores a pending Promise as the document field value

**File:** `src/schema/compile.ts:205-221`
**Issue:** The field-hook wrapper built by `extractDecoratorHooks` assigns the return of the dev's transform synchronously:

```typescript
fn: (ctx: unknown) => {
  const document = (ctx as { document?: Record<string, unknown> }).document;
  if (document) {
    document[field] = fn(document[field], ctx);
  }
},
```

`runPreHooks` (`src/model/hooks.ts:31-38`) awaits each *wrapper*, but by then the assignment has already happened with the raw return value. If the dev's transform is `async` — and the canonical example in the `@Pre` JSDoc is password hashing, where every mainstream implementation (`bcrypt.hash`, `argon2.hash`, `crypto.subtle`) is async — `document.password` becomes a **pending Promise**. The BSON serializer then either serializes it as an empty object `{}` (failing `$jsonSchema` with a misleading `bsonType` error) or, on a schema without `bsonType`, silently persists `{}` — the password is never stored. Class-level `@Pre` hooks support async correctly (awaited by `runPreHooks`), so the asymmetry is silent and undocumented. The only test (`hooks-decorator-order.test.ts:41-44`) uses a sync transform, so this is untested and broken.
**Fix:**
```typescript
fn: async (ctx: unknown) => {
  const document = (ctx as { document?: Record<string, unknown> }).document;
  if (document) {
    document[field] = await fn(document[field], ctx);
  }
},
```
`runPreHooks` already awaits each hook sequentially, so making the wrapper async preserves the D-11 ordering guarantee. Add a regression test with an async field transform.

## Warnings

### WR-01: Class inheritance produces inconsistent, silently-wrong schemas for subclasses

**File:** `src/schema/decorators.ts:26-39`, `src/schema/compile.ts:44-53`
**Issue:** `getOrInitMeta` correctly avoids mutating the parent's metadata via `Object.hasOwn`, but the fresh entry it creates is **empty** — it never copies the parent's fields. Meanwhile, reads (`compile`, `extractDecoratorHooks`, and the `kMongoatSchemaClass` marker in `getDefaultCollectionName`) use plain property access, which **does** walk the prototype chain. The result is three inconsistent behaviors for `class Child extends DecoratedParent`:
1. `Child` with its own decorated fields → compiled schema contains **only** `Child`'s fields; every inherited `@Prop` and every parent `@Pre`/`@Post` hook is silently dropped.
2. `Child` with no decorators → `Schema.compile(Child)` silently compiles the **parent's** full schema (inherited metadata found via prototype chain).
3. `Child` without its own `@Schema` inherits the parent's `collectionName` marker — `new Model({ schema: Child })` without an explicit `collectionName` silently targets the **parent's collection**.
None of this throws, none is documented, and no test covers subclassing.
**Fix:** Pick one semantic and enforce it. Either (a) seed the fresh entry from the inherited metadata (`structuredClone` of the parent's `FieldMeta`, minus hook fns which are copied by reference) so inheritance composes, or (b) reject inheritance explicitly — in `Schema`, detect an inherited `SCHEMA_METADATA_KEY`/marker and throw `MongoatValidationError` until inheritance is deliberately designed. Add tests either way.

### WR-02: `isSameConfig` never compares `schemaClass` — per-insert class defaults silently discarded on re-registration

**File:** `src/model/index.ts:233-267`, `src/model/index.ts:454-482`
**Issue:** The candidate's decorated class (which drives `buildClassDefaults()` — the D-12 per-insert defaults) is not part of the config comparison. A re-registration where the compiled validator, `allowedMethods`, `documentDefaults`, and `indexes` all match — but the schema *source* differs — hits the "identical config" early-return and silently discards the candidate's field initializers:

```typescript
new Model({ collectionName: 'x', schema: plainSchema });           // registered first
new Model({ collectionName: 'x', schema: DecoratedWithCreatedAt }); // same compiled schema,
// no hooks → returns the plain-schema model; `createdAt = new Date()` initializer never runs
```

This is exactly the "silently discarded behavioral config" masking class that WR-04 (Phase 5 review) closed for hooks/defaults/indexes — field initializers are behavioral config invisible to `stableStringify`.
**Fix:** In the `existing` branch, treat a mismatch of schema source as divergence: if `isDecoratedSchemaClass` and `existing.schemaClass !== schema` (or `!isDecoratedSchemaClass` but `existing.schemaClass !== undefined`), throw `MODEL_CONFIG_CONFLICT`. Reference equality on the class is the honest comparison (initializers, like hooks, have no structural equality).

### WR-03: Identical re-registration of a decorated class with `@Pre`/`@Post` always throws — false-positive `MODEL_CONFIG_CONFLICT`

**File:** `src/model/index.ts:443-463`
**Issue:** `candidateHasHooks` includes decorated hooks, and any candidate with hooks throws on re-registration — even when `schema` is the **same class reference** with an identical config. For plain schemas, `new Model(sameProps)` twice returns the same instance (tested contract, `registry-config.test.ts:45-59`); for a decorated class carrying `@Pre`, calling `new Model({ schema: UserSchema })` twice always throws. Any consumer whose model-construction code runs more than once per process (module re-evaluation, factory functions, serverless warm starts) is broken for hooked decorated classes specifically. The "functions have no structural equality" rationale does not apply here: same class reference ⇒ identical hooks by identity.
**Fix:** Before the `candidateHasHooks` throw, allow the reuse path when the decorated class is identical: `if (existing.schemaClass === schema && !propsDeclareOwnHooks && isSameConfig(...)) return existing;` — only `props.hooks` on a re-registration remains unconditionally fatal.

### WR-04: Missing `context.metadata` produces a cryptic `TypeError` instead of a Mongoat error

**File:** `src/schema/decorators.ts:26-39`, `src/schema/guards.ts:19-32`
**Issue:** `assertStandardDecoratorMode` only checks for `.kind`. TypeScript 5.0/5.1 (and other toolchains implementing TC39 decorators **without** the decorator-metadata proposal) pass a context with `.kind` but `metadata: undefined`. The guard passes, and `getOrInitMeta(undefined)` then throws `TypeError: Cannot convert undefined or null to object` from `Object.hasOwn` — deep inside the library, with no actionable message. The project's stated constraint is "TypeScript 5.x" compatibility, and the whole guard philosophy of this phase is fail-loud-with-a-code.
**Fix:** Extend the guard (or add a sibling) to check `context.metadata`:
```typescript
if (!(context as { metadata?: unknown }).metadata) {
  throw new MongoatValidationError(
    'Decorator context has no metadata — your toolchain implements TC39 decorators without the decorator-metadata proposal (TypeScript >= 5.2 required)',
    { code: 'LEGACY_DECORATORS_MODE' } // or a dedicated code, e.g. MISSING_DECORATOR_METADATA
  );
}
```

### WR-05: Field `@Pre` hook materializes absent fields — can mask `required` validation

**File:** `src/schema/compile.ts:214-219`
**Issue:** The wrapper unconditionally assigns `document[field] = fn(document[field], ctx)` whenever `ctx.document` exists — including when the field is **absent** from the document. `fn(undefined, ctx)` runs and its result is written, creating a key the caller never provided. With the JSDoc's own password example: `insert({ name })` without a password produces `password = hash(String(undefined))` — a syntactically valid hash of the literal string `"undefined"` — which then **passes** the server-side `required` check that should have rejected the document. A missing required credential silently becomes a stored (garbage) credential.
**Fix:** Skip absent fields so `required` semantics stay intact:
```typescript
if (document && Object.hasOwn(document, field)) {
  document[field] = await fn(document[field], ctx);
}
```
If default-materialization is a desired feature, it must be opt-in and documented — never the silent default.

### WR-06: Nested compile emits `required: []`, which MongoDB rejects at collection setup

**File:** `src/schema/compile.ts:76-92`
**Issue:** `compile` always emits a `required` array, even when empty (all fields `@Optional`). At the top level `schemaValidatorBuilder` appends `'_id'`, so the model path survives — but a **nested** all-optional decorated class (`@Prop({ type: AllOptionalNested })` or `items: AllOptionalNested`) embeds `required: []` verbatim into the validator. JSON Schema draft 4 (which MongoDB's `$jsonSchema` implements) requires `required` to be a non-empty array; `createCollection`/`collMod` fails with a server-side parse error at `setupCollection` — far from the decorated class that caused it, wrapped as an opaque driver error. The plain-object API avoids this because a dev simply omits `required`.
**Fix:** Omit the key when empty:
```typescript
const required = meta.required.filter((f) => !meta.optionalFields.includes(f));
return {
  bsonType: 'object',
  properties: ...,
  ...(required.length > 0 ? { required } : {}),
} as ModelValidationSchema;
```
Add a nested all-optional class to `nested-compile.test.ts` and an integration case against real MongoDB.

### WR-07: `@Prop` shallow-merge stores dev-owned nested references — documented decoupling not actually held

**File:** `src/schema/decorators.ts:84-88`, `src/schema/sugars.ts:44-46`
**Issue:** The comment claims "clone raso do fragmento recebido desacopla do objeto do dev (mutação futura do objeto original do dev não vaza para cá)" — but a shallow spread only decouples top-level keys. Nested values (`enum` arrays — stored by direct reference via `Enum(values)` → `Prop({ enum: values })` — inline `type`/`items` subschema objects, `properties` of an inline fragment) remain shared with the caller. A dev mutating `values.push('x')` after class definition changes the metadata for **every** subsequent `Schema.compile`/`new Model` of that class. `compileProperty`'s `structuredClone` at compile time snapshots whatever state the shared reference has *then* — it does not protect the decoration-to-compile window, and compiled-before/compiled-after results diverge.
**Fix:** Deep-clone the fragment at decoration time (the fragment is declarative data; classes only appear under `type`/`items`, so clone those keys' plain-object case and keep class references as-is):
```typescript
const { type, items, ...rest } = fragment;
meta.properties[fieldName] = {
  ...(meta.properties[fieldName] ?? {}),
  ...structuredClone(rest),
  ...(type !== undefined ? { type: typeof type === 'function' ? type : structuredClone(type) } : {}),
  ...(items !== undefined ? { items: typeof items === 'function' ? items : structuredClone(items) } : {}),
};
```

### WR-08: No `context.kind` validation — decorators misapplied to methods/getters are silently misregistered

**File:** `src/schema/decorators.ts:170-192`, `src/schema/decorators.ts:216-236`, `src/schema/decorators.ts:260-284`
**Issue:** Runtime `kind` handling is binary (`'field'` vs everything else), but TC39 decorators can land on `method`, `getter`, `setter`, `accessor`, and `class`:
- `@Pre('insert', fn)` on a **method/getter/accessor** falls into the `else` branch and is silently registered as a *class-level* hook (`meta.classPreHooks`) — `fn` written as `(value) => newValue` then corrupts nothing visibly but returns a transformed "value" that `runPreHooks` ignores, and the dev's intent (transform that member) is silently lost.
- `@Post` on a method is likewise silently accepted as class-level (its guard only rejects `kind === 'field'`).
- `@Schema('x')` on a field passes the standard-mode guard (field contexts have `.kind`), then either throws a misleading `INVALID_DECORATED_CLASS` or reaches `(value)[kMongoatSchemaClass] = ...` where `value` is `undefined` → cryptic `TypeError`.
TypeScript types prevent most of this for TS consumers, but this is a published library also consumed from JavaScript — the phase's own guard philosophy (fail loud with a stable `.code`) should apply.
**Fix:** Validate `context.kind` explicitly in each decorator: `Prop`/`Optional` require `'field'`; `Pre` requires `'field' | 'class'`; `Post` and `Schema` require `'class'`. Throw `MongoatValidationError` (e.g. code `INVALID_DECORATOR_TARGET`) otherwise.

### WR-09: Divergent `onHookError` silently discarded on re-registration

**File:** `src/model/index.ts:443-482`
**Issue:** `candidateHasHooks` covers `props.hooks` and decorated hooks, but not `props.onHookError`. A re-registration with an otherwise-identical config that supplies a **different** `onHookError` (a function, invisible to `stableStringify`, and materially behavioral — it decides where fireAndForget post-hook errors go) hits the "identical config" early-return and is silently dropped, keeping the first registration's handler. Same masking class as WR-04/WR-02.
**Fix:** Treat a candidate `props.onHookError` on a re-registration like hooks: include `props.onHookError !== undefined` in the fail-loud condition (or compare by reference against `existing.onHookError` and only throw on mismatch).

## Info

### IN-01: `Pre`/`Post` accept `method: string` — no compile-time `METHODS` checking

**File:** `src/schema/decorators.ts:170`, `src/schema/decorators.ts:216`
**Issue:** The runtime guard (`assertKnownHookMethod`) catches typos, but only when the class is evaluated. Typing the parameter as `METHODS | \`${METHODS}\`` gives editors/compilers the same guarantee for free, and `fn: (...args: unknown[]) => unknown` discards the `HookFn`/ctx typing that `.pre()`/`.post()` already provide.
**Fix:** Narrow `method` to `` METHODS | `${METHODS}` `` and consider typing `fn` per level (class: `(ctx) => unknown`; field: `(value, ctx) => unknown`) via overloads.

### IN-02: Smoke script leaves temp dirs on failure and is not Windows-safe

**File:** `scripts/smoke-decorators.mjs:78-206`
**Issue:** The `rmSync` cleanup at lines 205-206 only runs on success — any failing step leaves `scripts/.smoke-tmp/` and `scripts/.smoke-out/` behind (are they gitignored?). Also `execFileSync('npm', ...)` fails on Windows (`npm` is `npm.cmd`; `execFileSync` does not resolve it without `shell: true`).
**Fix:** Wrap steps 3's body in `try/finally` for the cleanup; use `process.platform === 'win32' ? 'npm.cmd' : 'npm'` or `{ shell: true }` if Windows contributors matter.

### IN-03: `PropFragment.type` shadows the standard `$jsonSchema` `type` keyword and `resolveNestedSchema` accepts garbage

**File:** `src/types/schema.ts:41-44`, `src/schema/compile.ts:134-140`
**Issue:** MongoDB's `$jsonSchema` supports the JSON Schema `type` keyword; Mongoat repurposes the key for nested classes (consistent with the vendored `ModelValidationSchema`, which also omits `type`, but worth documenting for devs migrating hand-written schemas). At runtime, a non-function/non-object forced through (`type: 'string'` from JS) reaches `Object.assign(compiled, structuredClone('string'))`, silently producing index-keyed garbage instead of an error.
**Fix:** In `resolveNestedSchema`, throw `MongoatValidationError` when `value` is neither a function nor a plain object; document the `type`-keyword shadowing in the `@Prop` JSDoc.

### IN-04: Tests still route decorated-class configs through `as unknown as CreateModelProps<Doc>`

**File:** `test/schema/schema-class-or-plain.test.ts:62-65`, `test/schema/decorated-vs-plain-parity.test.ts:53-56`, `test/schema/per-insert-defaults.test.ts:53-56`, `test/schema/hooks-decorator-order.test.ts:61-73`
**Issue:** `CreateModelProps.schema` now accepts `SchemaClass<ModelType>` and `collectionName` is optional, yet every test constructing a Model from a decorated class still double-casts. Either the cast is dead (then it hides future type regressions in the very API this phase ships) or it is still required (then the public typing forces `as unknown as` on every consumer — a DX bug worth fixing before release).
**Fix:** Remove the casts from at least one test; if `npm run typecheck` fails, fix the `SchemaClass<T>` assignability (likely the `Document` index-signature) instead of keeping the casts.

### IN-05: `buildClassDefaults` instantiates consumer classes with zero args — constructors requiring args fail at insert time

**File:** `src/model/index.ts:648-656`, `src/types/schema.ts:15-17`
**Issue:** `SchemaClass<T> = new (...args: never[]) => T` accepts constructors with required parameters (contravariance: `never` is assignable to every parameter type), so TS never flags a schema class whose constructor needs arguments — it then blows up (or silently produces wrong defaults) inside `insert`/`insertMany`/`bulkWrite`, per document, far from the registration site.
**Fix:** Probe once at Model construction (call `buildClassDefaults()` in the constructor and discard the result, or document that schema classes must be constructible with no args and wrap the instantiation error with a stable `.code`).

---

_Reviewed: 2026-07-14T03:03:56Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
