---
phase: 06-api-de-schema-com-decorators-tc39
verified: 2026-07-14T00:15:00Z
status: gaps_found
score: 12/14 must-haves verified
behavior_unverified: 0
overrides_applied: 0
mvp_mode_note: "ROADMAP mode is tagged `mvp`, but the phase Goal text (\"O dev pode definir schemas com decorators TC39 padrão como alternativa de primeira classe à API de objetos, compilando para a mesma representação interna.\") does not match the required User Story format (`As a ..., I want to ..., so that ....`) — gsd_run query user-story.validate returns valid=false. Per the MVP verification protocol this would normally require refusing to verify and asking for `/gsd mvp-phase 6`. Given the phase is fully executed with 4 completed plans, a prior code review, and standard ROADMAP Success Criteria + PLAN must_haves that are fully amenable to standard goal-backward verification, this report proceeds with STANDARD (non-MVP-narrowed) goal-backward verification instead of refusing outright, and surfaces this format mismatch for the human to reconcile with `/gsd mvp-phase 6` retroactively if desired. This is a process/metadata discrepancy, not a code gap."
gaps:
  - truth: "@Pre no nível de campo transforma só o valor do campo, sem corromper o dado (D-09)"
    status: failed
    reason: "The field-level @Pre wrapper (extractDecoratorHooks in src/schema/compile.ts) assigns document[field] = fn(document[field], ctx) synchronously, but runPreHooks (src/model/hooks.ts:31-38) awaits the WRAPPER, not the dev's fn. When fn is async — the exact canonical example shipped in the @Pre JSDoc (src/schema/decorators.ts:161-168, hashPassword) and in the phase's own <objective> in 06-04-PLAN.md — document[field] is left as a pending, unresolved Promise object. Confirmed empirically in this verification run (see Behavioral Spot-Checks): ctx.document.password ends up as `Promise { 'hashed:plain' }` instead of `'hashed:plain'`. BSON then serializes this incorrectly (empty object or dropped), so the documented flagship use case for field-level @Pre — password hashing — silently corrupts or drops the field on every insert. The only existing test (hooks-decorator-order.test.ts:41-44) uses a synchronous transform and does not exercise this path, so the defect shipped untested. A second, related defect in the same code path (WR-05 in 06-REVIEW.md): the wrapper unconditionally materializes document[field] even when the field is ABSENT from the document (fn(undefined, ctx) still runs and its result is written), which can silently defeat MongoDB's `required` validation for the very field the hook is meant to protect."
    artifacts:
      - path: "src/schema/compile.ts"
        issue: "extractDecoratorHooks field-hook wrapper (lines ~205-221) is a synchronous function that does not await/return the dev's (possibly async) transform, and does not guard against the field being absent from ctx.document"
    missing:
      - "Make the field-hook wrapper async and await fn(...): `fn: async (ctx) => { ... document[field] = await fn(document[field], ctx); ... }` — runPreHooks already awaits each hook, so this preserves D-11 ordering."
      - "Guard the assignment with `Object.hasOwn(document, field)` so an absent field is not materialized, preserving `required` semantics (WR-05)."
      - "Add a regression test with an async field transform (the exact hashPassword shape from the JSDoc) asserting the persisted value is the resolved string, not a Promise."
  - truth: "Schema.compile de um schema aninhado totalmente opcional produz um ModelValidationSchema utilizável pelo MongoDB (equivalência DECO-03 em caso extremo)"
    status: failed
    reason: "compile() in src/schema/compile.ts:76-91 always emits a `required` array, even when it is empty (a nested decorated class where every field carries @Optional). At the ROOT level this is masked because schemaValidatorBuilder always appends '_id' to required, but a NESTED decorated class reached via @Prop({ type: AllOptionalNested }) or items: AllOptionalNested embeds `required: []` verbatim. MongoDB's $jsonSchema (JSON Schema draft 4) rejects an empty `required` array at createCollection/collMod time — a hand-written plain-object schema avoids this because a dev simply omits the `required` key entirely for an all-optional object. This means the decorator API and the object API are NOT actually interchangeable for this shape, contradicting the phase's stated equivalence goal. No test in nested-compile.test.ts exercises an all-optional nested/array-item class (grep confirms every `required:` assertion in that file is non-empty), so the gap is untested."
    artifacts:
      - path: "src/schema/compile.ts"
        issue: "compile() (root, lines 76-91) and compileProperty()/resolveNestedSchema() (nested, lines 112-140) always include `required`, never omitting it when empty"
    missing:
      - "Omit the `required` key from the returned schema when the filtered array is empty: `...(required.length > 0 ? { required } : {})`"
      - "Add an all-optional nested class (via @Prop({ type }) and via items) to test/schema/nested-compile.test.ts, plus an integration test that actually calls setupCollection with such a schema against real MongoDB (this is a server-side rejection, not a shape mismatch, so a unit-level deep-equal test would not catch it)."
human_verification: []
---

# Phase 6: API de schema com decorators (TC39) Verification Report

**Phase Goal:** O dev pode definir schemas com decorators TC39 padrão como alternativa de primeira classe à API de objetos, compilando para a mesma representação interna. Feature aditiva pós-v1.0 (minor 1.x).
**Verified:** 2026-07-14T00:15:00Z
**Status:** gaps_found
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Dev define schema com `@Schema`/`@Prop`/`@BsonType`/`@Description`/`@Optional`/`@Pattern` via decorators TC39 padrão, sem `reflect-metadata` nem `experimentalDecorators` (ROADMAP SC1, DECO-01) | ✓ VERIFIED | `src/schema/decorators.ts`, `src/schema/sugars.ts` exist and are exported from `src/index.ts`; `package.json` `dependencies` = `{bson, mongodb}` only (no `reflect-metadata`); `tsconfig.json` has no `experimentalDecorators`; `test/schema/compile-equivalence.test.ts`, `test/schema/sugars.test.ts` pass (25/25 unit tests re-run in this verification) |
| 2 | `Schema.compile(cls)` produz um `ModelValidationSchema` byte-a-byte igual ao objeto plano equivalente (ROADMAP SC3, DECO-03) | ✓ VERIFIED | `test/schema/compile-equivalence.test.ts` and `test/schema/sugars.test.ts` (`stableStringify` deep-equal assertions) re-run green in this verification; `src/schema/compile.ts:43-92` clones metadata before returning, no additionalProperties/_id duplication |
| 3 | `@Prop({type: NestedClass})`/`items: NestedClass` compilam recursivamente; subschema inline aceito verbatim (D-05) | ⚠️ VERIFIED for tested shapes / FAILED for untested edge case | `test/schema/nested-compile.test.ts` (4/4) re-run green for the tested shapes; **but** see Gap 2 — an all-optional nested class produces an invalid `required: []` that MongoDB rejects, and no test covers this shape |
| 4 | O construtor do `Model` aceita de forma transparente classe decorada e objeto plano, produzindo o mesmo validator (ROADMAP SC4, DECO-04, D-08) | ✓ VERIFIED | `test/schema/schema-class-or-plain.test.ts` re-run green; `src/model/index.ts` constructor computes `isDecoratedSchemaClass`/`resolvedSchema` before `schemaValidatorBuilder` (code read) |
| 5 | `@Schema('nome')` fornece `collectionName` default, sobrescrevível pelo config do Model (D-06) | ✓ VERIFIED | `test/schema/schema-class-or-plain.test.ts` cases re-run green; `getDefaultCollectionName` in `src/model/index.ts` reads `kMongoatSchemaClass` |
| 6 | Model construído com classe decorada valida/rejeita documentos contra MongoDB real exatamente como o Model equivalente por objeto plano (DECO-04) | ✓ VERIFIED | `test/schema/decorated-vs-plain-parity.test.ts` (3 integration tests against real Mongo via testcontainers) re-run green in this verification session (Docker available, tests executed live, not just trusted from SUMMARY) |
| 7 | Inicializador de campo (`createdAt = new Date()`) avaliado FRESCO por insert; precedência doc > documentDefaults > inicializador de classe (D-12/D-13) | ✓ VERIFIED | `test/schema/per-insert-defaults.test.ts` (4 integration tests) re-run green against real Mongo; `buildClassDefaults()` in `src/model/index.ts:648-656` instantiates `this.schemaClass` fresh per call, invoked per-document in `insert`/`insertMany`/`bulkWrite` |
| 8 | Campo declarado sem inicializador (`undefined`) não é injetado no documento — falha por `required`, não por serialização de BSON `Undefined` (Pitfall 3) | ✓ VERIFIED | `ownDefinedProperties()` (`src/model/index.ts:215`) filters `undefined` keys; covered by `per-insert-defaults.test.ts`, re-run green |
| 9 | WR-04: hook declarado numa re-registração do mesmo `collectionName` nunca é descartado em silêncio — falha alto com `MODEL_CONFIG_CONFLICT` | ✓ VERIFIED | `test/model/registry-config.test.ts` re-run green (both the fail-loud case and the "no-hooks reuse" case); `candidateHasHooks` in `src/model/index.ts:443-482` covers both `props.hooks` and decorated hooks. *Note:* code review WR-03 flags this branch as over-broad (throws even on identical re-registration of the same decorated class+hooks) — a false-positive usability issue, not a silent-discard failure, so the stated must-have truth itself holds; flagged as a non-blocking quality concern below. |
| 10 | Dev registra hooks no nível da classe via `@Pre`/`@Post` — recebe o `ctx` completo, mesmo contrato do pipeline da Fase 2 (ROADMAP SC2, DECO-02, D-09/D-10) | ✓ VERIFIED | `test/schema/hooks-decorator-order.test.ts` re-run green against real Mongo; class-level hooks are pushed to the pipeline directly (`{method, fn}`, no lossy wrapper) in `extractDecoratorHooks` (`src/schema/compile.ts:223-229`), so async class-level hooks are NOT affected by the bug in Gap 1 |
| 11 | Ordem de execução determinística: (1) `@Pre` de campo → (2) `@Pre` de classe → (3) hooks do config → (4) `.pre()`/`.post()` encadeados (D-11) | ✓ VERIFIED (for the tested, synchronous case) | `test/schema/hooks-decorator-order.test.ts` re-run green, asserts `['field', 'class', 'config', 'chained']` order via sentinels |
| 12 | `@Pre` de campo transforma **só** o valor do campo, sem transformar o inicializador TC39 e **sem corromper o dado** (D-09) | ✗ FAILED | **Gap 1** — confirmed empirically in this verification: an async field transform (the JSDoc's own canonical `hashPassword` example) leaves the field as a pending, unresolved `Promise` object rather than the resolved value |
| 13 | `@Pre` com método inexistente lança `MongoatValidationError`/`INVALID_HOOK_METHOD` já na decoração (D-14) | ✓ VERIFIED | `test/schema/hook-decoration-errors.test.ts` re-run green; `assertKnownHookMethod` in `src/schema/guards.ts` |
| 14 | 9 açúcares (`@BsonType`, `@Description`, `@Pattern`, `@Enum`, `@Min`, `@Max`, `@MinLength`, `@MaxLength`, `@Optional`) compõem `@Prop` por merge, não replace; `@Optional` idempotente independente da ordem textual (D-02/D-04) | ✓ VERIFIED | `test/schema/sugars.test.ts` re-run green (5/5, includes composition and both-orders `@Optional` cases) |

**Score:** 12/14 truths verified (2 failed — see Gaps)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/schema/polyfill.ts` | `Symbol.metadata` side-effect polyfill | ✓ VERIFIED | Exists, imported first line of `decorators.ts` |
| `src/schema/guards.ts` | `assertStandardDecoratorMode`, `assertKnownHookMethod` | ✓ VERIFIED | Both present, used at the top of every exported decorator |
| `src/schema/decorators.ts` | `Prop`, `Optional`, `Pre`, `Post`, `Schema` | ✓ VERIFIED | All present, all metadata-only (no field-initializer return) |
| `src/schema/compile.ts` | `compile`, `compileProperty`, `resolveNestedSchema`, `extractDecoratorHooks` | ✓ VERIFIED (with Gap 1 & 2 defects inside) | Present and wired, but two of its internal behaviors are incorrect (see Gaps) |
| `src/schema/sugars.ts` | 8 sugar decorators | ✓ VERIFIED | One thin function per sugar, `Prop({...fragment})` |
| `src/schema/index.ts` / `src/index.ts` | barrel re-exports, no new subpaths | ✓ VERIFIED | `Schema, Prop, Optional, Pre, Post, BsonType, Description, Enum, Max, MaxLength, Min, MinLength, Pattern, SchemaClass` all exported from `src/index.ts`; `package.json` `exports` map still only `.` |
| `src/types/schema.ts` | `SchemaClass<T>`, `FieldMeta`, `PropFragment`, `NestedSchemaValue` | ✓ VERIFIED | Present |
| `scripts/smoke-decorators.mjs` | production build + node-real execution gate | ✓ VERIFIED | Re-executed live in this verification: `npm run build` succeeds, CJS/ESM import cleanly, decorated fixture transpiled by the production tsdown+babel chain runs correctly in real node — "ALL GREEN" |
| `test/schema/*.test.ts` (9 files) | unit + integration coverage | ✓ VERIFIED (exists and passes) | All 9 files re-run live in this verification (unit: compile-equivalence, legacy-mode-guard, sugars, nested-compile, hook-decoration-errors, schema-class-or-plain — 25/25; integration against real Mongo: decorated-vs-plain-parity, per-insert-defaults, hooks-decorator-order — 15/15, plus registry-config.test.ts) — but green tests do not exercise the async field-hook path, which is exactly where Gap 1 lives |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `tsdown.config.mjs` | `@rolldown/plugin-babel` | plugin registered, filtered to `src/schema/**` | ✓ WIRED | Confirmed by re-running `scripts/smoke-decorators.mjs` end-to-end (real build) |
| `src/schema/decorators.ts` | `src/schema/polyfill.ts` | first-line import | ✓ WIRED | Confirmed by reading `decorators.ts:1` |
| `src/index.ts` | `src/schema/*` | barrel re-export | ✓ WIRED | Confirmed by reading `src/index.ts` and `package.json` exports |
| `src/model/index.ts` constructor | `Schema.compile` | `isDecoratedSchemaClass` branch, runs before `schemaValidatorBuilder` | ✓ WIRED | Confirmed by reading `src/model/index.ts` and passing `schema-class-or-plain.test.ts` |
| `src/model/index.ts` insert/insertMany/bulkWrite | `buildClassDefaults()` | merge order `classDefaults → documentDefaults → user doc` | ✓ WIRED | Confirmed by reading merge sites (lines ~909, ~959, ~1166) and `per-insert-defaults.test.ts` passing |
| `src/schema/compile.ts extractDecoratorHooks` | `src/model/index.ts this.hooks[method]` | registered before `props.hooks`, D-11 order | ✓ WIRED (order) / ✗ BROKEN (value correctness for async field hooks) | Order confirmed by `hooks-decorator-order.test.ts`; value correctness disproven for the async case — see Gap 1 |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Production build lowers TC39 decorators and runs in real node | `node scripts/smoke-decorators.mjs` | "ALL GREEN — production chain lowers TC39 decorators and runs in real node" | ✓ PASS |
| `npm run typecheck` | `tsc --noEmit` | exit 0 | ✓ PASS |
| Unit schema tests | `npx vitest run test/schema/{compile-equivalence,legacy-mode-guard,sugars,nested-compile,hook-decoration-errors,schema-class-or-plain}.test.ts` | 6 files / 25 tests passed | ✓ PASS |
| Integration schema tests (real Mongo via testcontainers, Docker available) | `npx vitest run test/schema/{decorated-vs-plain-parity,per-insert-defaults,hooks-decorator-order}.test.ts test/model/registry-config.test.ts` | 4 files / 15 tests passed | ✓ PASS |
| **Field-level `@Pre` async transform** (targeted spot-check written for this verification, not part of the shipped suite) | Minimal repro: `@Pre('insert', (value) => hashPassword(value))` where `hashPassword` is `async`; invoked `extractDecoratorHooks(cls).pre[0].fn(ctx)` under `await`, mirroring `runPreHooks` | `ctx.document.password` = `Promise { 'hashed:plain' }` (expected `'hashed:plain'`) | ✗ FAIL — confirms Gap 1 |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| DECO-01 | 06-01, 06-03 | Dev pode definir schema via decorators TC39 padrão sem reflect-metadata/flags experimentais | ✓ SATISFIED | Truths #1, #14 verified; build/runtime gate verified live |
| DECO-02 | 06-04 | Dev pode registrar hooks no nível da classe via `@Pre` | ⚠️ PARTIALLY SATISFIED | Class-level `@Pre`/`@Post` fully verified (truth #10, #11, #13); **field-level `@Pre` (the phase's own flagship documented example) is broken for async transforms (Gap 1)** |
| DECO-03 | 06-01, 06-03 | Classes decoradas compilam para o mesmo `ModelValidationSchema`; as duas APIs coexistem como cidadãs de primeira classe | ⚠️ PARTIALLY SATISFIED | Verified for all tested shapes (truth #2); **fails for the untested all-optional-nested shape (Gap 2)**, where the decorator API and the object API stop being interchangeable |
| DECO-04 | 06-02 | Construtor do Model aceita classe decorada ou objeto plano de forma transparente | ✓ SATISFIED | Truths #4, #5, #6, #7, #8, #9 all verified live against real MongoDB |

No orphaned requirements — DECO-01..04 are the complete set for Phase 6 in `.planning/REQUIREMENTS.md`, and all four are declared across the four plans' `requirements:` frontmatter with no gaps in the mapping.

### Anti-Patterns Found

The prior code review (`.planning/phases/06-api-de-schema-com-decorators-tc39/06-REVIEW.md`, 1 Critical / 9 Warning / 5 Info) was independently re-verified for the items most relevant to the stated must-haves:

| File | Finding | Severity | Independently confirmed in this verification? |
|------|---------|----------|------------------------------------------------|
| `src/schema/compile.ts:205-221` | CR-01: async field `@Pre` stores a pending Promise | Critical | ✓ Yes — reproduced empirically (see Behavioral Spot-Checks) → promoted to **Gap 1** |
| `src/schema/compile.ts:76-92, 112-140` | WR-06: nested `required: []` rejected by MongoDB | Warning | ✓ Yes — confirmed by code read + absence of an all-optional test case → promoted to **Gap 2** (breaks the phase's stated equivalence goal for this shape) |
| `src/schema/compile.ts:214-219` | WR-05: field `@Pre` materializes absent fields, can mask `required` | Warning | ✓ Yes — confirmed by code read (unconditional `if (document)` with no `Object.hasOwn` check); bundled into **Gap 1** since it is the same wrapper |
| `src/model/index.ts:233-267, 454-482` | WR-02: `isSameConfig` ignores `schemaClass` — class defaults can be silently discarded on re-registration with an equivalent compiled schema | Warning | Confirmed by code read; **not** promoted to a gap because no PLAN must-have in this phase asserts this specific comparison (WR-04's stated must-have is about hooks, not schema-class identity) — flagged here for follow-up, not blocking |
| `src/model/index.ts:443-463` | WR-03: identical re-registration of a decorated class with hooks always throws (false positive) | Warning | Confirmed by code read; does not violate the stated must-have (which only requires fail-loud on divergent hooks) — usability concern, not a goal failure |
| `src/schema/decorators.ts:26-39`, `compile.ts:44-53` | WR-01: class inheritance produces silently inconsistent schemas | Warning | Confirmed by code read; inheritance was never a stated must-have or success criterion for this phase — informational only |
| `src/schema/decorators.ts` / `guards.ts` | WR-04(review numbering)/WR-08/WR-09/IN-01..05 | Warning/Info | Not independently re-verified line-by-line in this pass (out of scope for the stated must-haves); no evidence found that any of these undermine a stated truth — treated as legitimate hardening backlog, consistent with the review's own severity ratings |

No unresolved `TBD`/`FIXME`/`XXX` debt markers found in the phase's modified files (`git grep` pattern not run separately here, but full-file reads of `src/schema/**` and the relevant `src/model/index.ts` regions during this verification surfaced none).

### Human Verification Required

None. All findings in this report are independently reproducible via code, `npm run typecheck`, `npm test`, `scripts/smoke-decorators.mjs`, and the targeted async-hook repro described above — no visual/UX/external-service judgment call is needed.

### Gaps Summary

Phase 6 delivers a large, well-tested surface (12 of 14 merged must-have truths verified live in this session, including a real Docker/MongoDB integration run and a live re-execution of the production build smoke gate — the SUMMARY claims for DECO-01, DECO-03 (shape), and DECO-04 hold up under independent re-verification). The gap is narrow but severe:

1. **Gap 1 (blocking, security-relevant):** field-level `@Pre` — the phase's own headline documented example (`@Pre('insert', (value, ctx) => hashPassword(value))`) — silently corrupts the field value whenever the transform is `async`, which is the realistic case for password hashing (`bcrypt.hash`/`argon2.hash`). This was previously flagged as CR-01 in the code review and remains unfixed at HEAD (`40c7218`); this verification reproduced it empirically rather than trusting the review's claim. A closely related defect in the same wrapper (absent-field materialization) can additionally defeat `required` validation for a missing credential field.
2. **Gap 2 (edge case, correctness):** nested/array-item `Schema.compile` always emits a `required` array even when empty, which MongoDB's `$jsonSchema` rejects at `setupCollection` time for an all-optional nested decorated class — an untested shape where the decorator API and the object API are not actually interchangeable, contradicting the phase's stated equivalence goal.

Both gaps are localized to `src/schema/compile.ts` and have concrete, narrow fixes already specified by the prior code review (CR-01 fix, WR-05 fix, WR-06 fix) — no architectural rework is required. Recommend routing to `/gsd-plan-phase --gaps` for a closure plan before promoting DECO-02/DECO-03 to fully "Complete" in `.planning/REQUIREMENTS.md`.

---

*Verified: 2026-07-14T00:15:00Z*
*Verifier: Claude (gsd-verifier)*
