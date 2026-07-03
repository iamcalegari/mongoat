# Stack Research

**Domain:** TypeScript npm library — MongoDB ODM (brownfield, adding decorator API, test suite, docs, CI/CD)
**Researched:** 2026-07-03
**Confidence:** HIGH (verified against official sources, npm registry, and community benchmarks)

---

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| TypeScript | `^5.9` | Language | TS 5.9 stabilizes TC39 decorator metadata (`Symbol.metadata`) — no `experimentalDecorators` flag needed; works with tsdown natively |
| tsdown | `latest (~0.12)` | Library bundler | Spiritual successor to tsup (tsup author recommends migrating); powered by Rolldown; ESM-first; trivial config; drop-in tsup replacement |
| mongodb | `^7` | Peer dependency | Already the project's base driver; v7 is current stable. Keep as `peerDependency` |
| bson | `^6` | BSON type helpers | Already in use for ObjectId handling; keep |

### Testing Stack

| Library | Version | Purpose | Why |
|---------|---------|---------|-----|
| vitest | `^4.1` | Unit + integration test runner | 5–10x faster than Jest; native TypeScript + ESM; Jest-compatible API (minimal migration effort); `vi.mock` built-in; no separate transform config |
| mongodb-memory-server | `^11` | In-memory MongoDB for integration tests | Spins up a real `mongod` binary in process; zero Docker requirement in CI; works on any Node.js CI runner; v11 is current (v10 is EOL) |
| @vitest/coverage-v8 | `^4.1` | Code coverage | V8-native, no instrumentation overhead; ships with vitest |

### Docs Stack

| Library | Version | Purpose | Why |
|---------|---------|---------|-----|
| vitepress | `^1.6` | Static docs site | Markdown-first, Vite-powered, sub-second HMR; used by Vite, Vue 3, Vitest, Pinia — proven for TypeScript library docs; lighter than Docusaurus |
| typedoc | `^0.28` | API reference extraction | Best-in-class TSDoc → structured output; reads source + types |
| typedoc-plugin-markdown | `^4` | TypeDoc → Markdown | Outputs TypeDoc to `.md` files consumable by VitePress; `vitepress` plugin available at `typedoc-plugin-markdown.org/plugins/vitepress` |

### CI/CD & Release

| Library | Version | Purpose | Why |
|---------|---------|---------|-----|
| @changesets/cli | `^2` | Versioning + CHANGELOG | PR-based workflow: devs add changeset files, bot opens version PR, human merges → publish. Better than semantic-release for a solo/small OSS library: deliberate, auditable, no accidental bumps |
| @changesets/action | `^1` | GitHub Actions bot for changesets | Opens + maintains the "Version Packages" PR automatically |

### Development Tooling

| Tool | Purpose | Notes |
|------|---------|-------|
| `@arethetypeswrong/cli` | Lint package.json exports field | Catches wrong `.d.ts` paths, missing CJS/ESM conditions; run in CI before publish |
| `tsx` | Run TypeScript files in scripts | Faster than `ts-node`; used for build scripts, migration helpers |

---

## The Decorator Decision (KEY QUESTION)

### Recommendation: TC39 Standard Decorators, Coexisting with Plain-Object Schema API
**Confidence: HIGH**

**What to use:**
- `"experimentalDecorators": false` (default; just omit the flag)
- `"emitDecoratorMetadata": false` (default; do not add it)
- No `reflect-metadata` runtime dependency
- Decorator arguments carry all type information explicitly: `@Field({ type: 'string', required: true })`
- `context.metadata` (Symbol.metadata, stable since TS 5.9) for storing schema metadata per class

**Why NOT the legacy stack (experimentalDecorators + reflect-metadata):**

Typegoose is the clearest cautionary tale. As of mid-2026, typegoose still requires `experimentalDecorators: true` and `reflect-metadata` because it auto-infers field types from TypeScript's `emitDecoratorMetadata` output. The TC39 standard decorator proposal intentionally excludes `emitDecoratorMetadata` support (it was a TypeScript-only hack). Typegoose has explicitly documented that it does NOT support TC39 decorators and cannot migrate without a complete redesign. This approach:

1. Adds `reflect-metadata` as a runtime dependency (mongoat's constraint: minimal runtime deps — violated)
2. Forces consumers to add `"experimentalDecorators": true` + `"emitDecoratorMetadata": true` to their own tsconfig (DX friction)
3. Relies on TypeScript emitting class constructor metadata that esbuild/tsdown does NOT emit by default (build tooling incompatibility)
4. Uses a dead decorator API path — TC39 finalized the standard in 2025; experimental decorators are legacy

**Why explicit decorator args are not a problem:**
mongoat's schema is JSON Schema (not Mongoose's OO schema). The decorator just needs to know `type`, `required`, `pattern`, `description`. These are always explicit in JSON Schema anyway — no auto-inference from TS types reduces the "magic" surface and makes the schema predictable and portable.

**Decorator API design (how it maps to internal schema):**

```typescript
// Plain-object API (keep, no changes)
const UserSchema = schema({
  name: { bsonType: 'string', description: 'User name' },
  age:  { bsonType: 'int', minimum: 0 },
});

// Decorator API (new, builds same schema object internally)
@Schema('users')
class User {
  @Description('User name')
  @Pattern('^[a-z]+$')
  name!: string;

  @Optional()
  age?: number;
}
// → internally emits the same JSON Schema object; no magic
```

Decorators call `context.metadata` to register field definitions; a `buildSchema(User)` helper reads them and returns the plain schema object. Both APIs are first-class citizens.

**Why coexist (not replace):**
The plain-object API:
- Zero build-step dependency (works if you strip all decorators)
- Easier to extend programmatically (plugins, dynamic schemas)
- papr proves this model works: type-safe, decorator-free, 2800 ops/sec

The decorator API:
- Better DX for class-oriented consumers
- Mirrors the existing `src/schema/index.ts` draft
- Enables `@Pre` hooks collocated with the model class

Both should compile to the same internal schema representation. Make decorators a thin syntax sugar layer, not the canonical runtime path.

---

## Runtime Dependency Cleanup

### Drop `json-schema` 0.4.0 — Confidence: HIGH

`json-schema` at version 0.4.0 is a 2013-era package (last meaningful update ~2021). It provides a `validate()` function for JSON Schema draft-04. In mongoat's current code, it is used to validate the schema object that is then pushed to MongoDB via `$jsonSchema` in `collMod`.

**Recommendation: remove it entirely.**

Rationale:
- MongoDB's own `$jsonSchema` validator handles all schema validation at insert/update time server-side. If the schema is malformed, MongoDB returns a driver error with a clear message.
- There is no user-visible benefit to pre-validating the schema object on the client — it doubles the validation and adds a stale dep.
- If client-side schema pre-validation is ever needed (e.g., to give better error messages), use `ajv` as a `devDependency` in tests only — not a runtime dep.
- Zero runtime deps for schema handling aligns with the project's stated constraint.

**Do not replace with Ajv as a runtime dep.** MongoDB is the validator. Ajv belongs only in tests.

---

## Installation

```bash
# Runtime deps (keep minimal — only what ships to consumers)
npm install mongodb bson
# (drop json-schema)

# Dev dependencies
npm install -D typescript tsdown vitest @vitest/coverage-v8 mongodb-memory-server \
  vitepress typedoc typedoc-plugin-markdown \
  @changesets/cli @changesets/action \
  @arethetypeswrong/cli tsx

# No reflect-metadata. No ts-jest. No ts-node needed.
```

---

## Alternatives Considered

| Category | Recommended | Alternative | Why Not Alternative |
|----------|-------------|-------------|---------------------|
| Bundler | tsdown | tsup 8.5.1 | tsup author has stopped maintaining it; tsdown is the explicit successor and is ESM-first |
| Bundler | tsdown | tsc (raw) | Does not tree-shake, no CJS+ESM dual output in one step, cumbersome for dual publish |
| Test runner | vitest 4.x | jest + ts-jest | 5–10x slower; ESM requires `--experimental-vm-modules`; `ts-jest` transform config is brittle |
| MongoDB test env | mongodb-memory-server v11 | testcontainers | Testcontainers requires Docker in CI; adds complexity; only needed for replica-set-specific features (not in scope for v1.0) |
| MongoDB test env | mongodb-memory-server v11 | real MongoDB in CI | Requires `services:` in GH Actions workflow; slower spin-up; flaky on shared runners |
| Docs | VitePress | Docusaurus | Docusaurus is React-based, heavier, suited for larger ecosystems; VitePress is leaner and already used by the vitest/vite ecosystem that mongoat's users likely know |
| Release | changesets | semantic-release | semantic-release fully automates based on commit messages — one bad commit message can accidentally publish a major. Changesets requires a human to intentionally add a changeset file to a PR, which is the right default for a library with semver discipline as a stated constraint |
| Decorators | TC39 standard | experimentalDecorators + reflect-metadata | Adds runtime dep, forces consumer tsconfig changes, incompatible with tsdown/esbuild without extra transform plugin; dead-end API |
| Runtime validation | (none / MongoDB server-side) | ajv as runtime dep | MongoDB $jsonSchema is the canonical validator; adding Ajv doubles the validation surface and contradicts the minimal deps constraint |

---

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| `reflect-metadata` | Runtime dep, experimental decorator only, not needed for TC39 standard decorators | `context.metadata` (Symbol.metadata) — built into TC39 decorators since TS 5.2, stable since TS 5.9 |
| `ts-jest` | Slow, ESM config friction, requires separate transform config | `vitest` (native TS support, no transform needed) |
| `ts-node` | Slow for scripts, ESM issues | `tsx` (same DX, ESM-native, faster) |
| `json-schema` 0.4.0 | Outdated (draft-04), unmaintained, duplicates MongoDB server-side validation | Remove entirely; rely on MongoDB `$jsonSchema` |
| `mongoose` | Heavyweight, wraps its own BSON/driver layer, not compatible with mongodb v7 driver directly | mongodb v7 driver (already used) |
| `tsup` (for new work) | Author stopped maintaining; tsdown is the explicit successor | `tsdown` |
| `jest` | 5–10x slower than vitest; ESM requires `--experimental-vm-modules`; ts-jest is a maintenance burden | `vitest` |
| `semantic-release` | Fully automated; one wrong commit message triggers a publish; no PR-based review | `changesets` |
| Docusaurus | React-based, heavier setup, versioning plugin is complex for a single-package lib | VitePress |
| `emitDecoratorMetadata: true` | Only works with experimentalDecorators; breaks with esbuild/tsdown/rolldown | Explicit decorator arguments |

---

## Stack Patterns

**For the decorator system (no emitDecoratorMetadata):**
Use `context.metadata` to store a schema registry on the class. Each decorator writes to `context.metadata[SCHEMA_KEY]`. A `buildSchema(Class)` function reads `Symbol.metadata` after class definition to extract the full JSON Schema. This pattern works identically with TC39 standard decorators and needs zero runtime deps.

**For dual CJS + ESM output with tsdown:**
```ts
// tsdown.config.ts
import { defineConfig } from 'tsdown'
export default defineConfig({
  entry: ['src/index.ts'],
  format: ['cjs', 'esm'],
  dts: true,
  clean: true,
})
```
```json
// package.json excerpt
{
  "exports": {
    ".": {
      "import": { "types": "./dist/index.d.ts", "default": "./dist/index.mjs" },
      "require": { "types": "./dist/index.d.cts", "default": "./dist/index.cjs" }
    }
  },
  "main": "./dist/index.cjs",
  "module": "./dist/index.mjs",
  "types": "./dist/index.d.ts"
}
```

**For CI publish with changesets:**
1. Devs run `npx changeset` in their PR branch → adds a `.changeset/*.md` file describing the change + bump type
2. On merge to `main`, GitHub Actions bot opens a "Version Packages" PR with updated `CHANGELOG.md` and version bumps
3. Human reviews and merges the Version PR → Actions workflow runs `npm publish` automatically

---

## Version Compatibility

| Package | Compatible With | Notes |
|---------|-----------------|-------|
| `mongodb ^7` | `bson ^6` | mongodb v7 ships its own bson; avoid version mismatch |
| `vitest ^4` | `mongodb-memory-server ^11` | No conflicts; MMS v11 supports MongoDB 7+ binaries |
| `tsdown ^0.12` | `typescript ^5.9` | Rolldown requires TS 5.x; no issues |
| TC39 decorators | `typescript ^5.0` | Stable without flags since TS 5.0; `context.metadata` stable since TS 5.9 |
| `typedoc ^0.28` | `typedoc-plugin-markdown ^4` | Must pin major versions together; check typedoc-plugin-markdown release notes on upgrade |

---

## Confidence Assessment

| Area | Confidence | Basis |
|------|------------|-------|
| Decorator decision (TC39 vs experimental) | HIGH | TypeScript docs, TC39 proposal repo, typegoose known-issues page, TS 5.9 release notes all confirm |
| tsdown over tsup | HIGH | tsup author's own recommendation, tsdown.dev migration guide, community benchmarks |
| vitest over jest | HIGH | Multiple independent benchmarks (5–10x), Vitest docs, Angular/Nuxt/SvelteKit adoption |
| mongodb-memory-server v11 | HIGH | npm registry (latest), AppSignal blog June 2025 |
| VitePress + TypeDoc | HIGH | typedoc-plugin-markdown.org official VitePress plugin, active maintenance |
| Changesets over semantic-release | HIGH | pkgpulse comparison, download trends (3.1M vs 2.6M/wk), security model for OSS |
| Drop json-schema 0.4.0 | HIGH | Package is draft-04 era, MongoDB handles the validation server-side |

---

## Sources

- [TypeScript Decorators — TC39 Standard Guide (Stanza)](https://www.stanza.dev/concepts/typescript-decorators)
- [Decorator Metadata & Legacy Comparison (Stanza)](https://www.stanza.dev/courses/typescript-architecture/decorators/typescript-architecture-decorators-metadata)
- [typegoose Known Issues — TC39 decorator support](https://typegoose.github.io/typegoose/docs/guides/known-issues/)
- [TypeScript 5.9: Stable Decorator Metadata (SitePoint)](https://www.sitepoint.com/typescript-59-the-strictinference-flag-and-stable-decorator-metadata-that-actually-matter/)
- [TC39 proposal-decorator-metadata (GitHub)](https://github.com/tc39/proposal-decorator-metadata)
- [tsup vs tsdown vs unbuild 2026 (PkgPulse)](https://www.pkgpulse.com/guides/tsup-vs-tsdown-vs-unbuild-typescript-library-bundling-2026)
- [Migrate from tsup → tsdown (tsdown.dev)](https://tsdown.dev/guide/migrate-from-tsup)
- [Testing MongoDB in Node with mongodb-memory-server (AppSignal, June 2025)](https://blog.appsignal.com/2025/06/18/testing-mongodb-in-node-with-the-mongodb-memory-server.html)
- [mongodb-memory-server v11 (npm)](https://www.npmjs.com/package/mongodb-memory-server)
- [Vitest 4.1 release](https://vitest.dev/blog/vitest-4-1.html)
- [Vitest vs Jest 2026 — 5.6x speed gap (13labs)](https://www.13labs.au/compare/jest-vs-vitest)
- [typedoc-plugin-markdown VitePress quick start](https://typedoc-plugin-markdown.org/plugins/vitepress/quick-start)
- [VitePress 1.6.4 (npm)](https://www.npmjs.com/package/vitepress)
- [changesets vs semantic-release vs release-it 2026 (PkgPulse)](https://www.pkgpulse.com/guides/semantic-release-vs-changesets-vs-release-it-release-2026)
- [Intentional Releases: Changesets over Semantic-Release](https://xnok.github.io/infra-bootstrap-tools/blog/intentional-releases-changesets/)
- [Dual Publishing ESM and CJS with tsup / are-the-types-wrong (johnnyreilly)](https://johnnyreilly.com/dual-publishing-esm-cjs-modules-with-tsup-and-are-the-types-wrong)
- [papr — Type-safe Node.js models for MongoDB (Plex Labs)](https://medium.com/plexlabs/papr-type-safe-node-js-models-for-mongodb-c841e8b23429)
- [Ajv JSON schema validator (ajv.js.org)](https://ajv.js.org/)

---

*Stack research for: @iamcalegari/mongoat — TypeScript MongoDB ODM library*
*Researched: 2026-07-03*
