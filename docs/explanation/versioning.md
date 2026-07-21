# Stability & versioning

Mongoat follows [Semantic Versioning](https://semver.org/) starting with its
first stable release, `1.1.0`. This page defines exactly what that promise
covers: what counts as the public surface, what a MAJOR/MINOR/PATCH bump
means for it, and how release candidates and deprecated lines are handled.

## Why `1.1.0` and not `1.0.0`

Before the stable line, Mongoat was published under the `1.0.x-alpha`
pre-release identifier — dozens of iterations while the API was still being
shaped. A plain `1.0.0` would have been numerically *smaller* than the last
alpha (`1.0.x-alpha` is a pre-release of `1.0.x`, and pre-releases sort below
their release), which would have forced package managers to keep resolving
`latest` to the old alpha instead of the new stable build. Starting the
stable line at `1.1.0` avoids that: it's unambiguously newer than every
alpha, `npm`'s `latest` dist-tag updates naturally, and existing alpha
consumers pick up the stable release on their next `npm update`. `1.1.0` **is**
the first stable release — there is no separate, older `1.0.0` stable
version.

## What's covered by the contract

The public API is exactly what's exported from the package's root
entrypoint — the `src/index.ts` barrel (re-exported as `@iamcalegari/mongoat`
in the published package: `Database`, `Model`, the `Mongoat*Error` hierarchy,
`METHODS`, `CUSTOM_VALIDATION`, `sanitizeFilter`, `toObjectId`, the
migrations API (`runMigrations`, `runTo`, `revertMigration`, `getStatus`,
`defineMigration`, `defineConfig`), and the exported types). If a symbol is
exported from that barrel, it's part of the semver contract: renaming it,
changing its signature, or altering its runtime behavior in an incompatible
way is a breaking change.

Anything **not** re-exported from the root barrel — internal modules,
helpers marked `@internal` or `@private` in their JSDoc, and implementation
details reached only through deep imports (e.g. importing a file directly
from `lib/` instead of the package root) — is outside the contract. Those can
change shape between any two releases, including patch releases, without
that counting as a breaking change. Deep-importing internals is unsupported
and is done at your own risk.

The one deliberate exception is the [native escape
hatch](/how-to/escape-hatch) (`Model.getCollection()`,
`Database.getClient()`, `Database.getDb()`): it hands back the underlying
driver's own `Collection`, `MongoClient`, and `Db` objects. Mongoat's semver
promise covers the shape of *those getters* (their names and return types),
not the behavior of the driver objects they return — that surface is
governed by the `mongodb` driver's own versioning, which Mongoat pins as a
direct dependency.

## What counts as MAJOR, MINOR, and PATCH

- **MAJOR** — a breaking change to the public surface: removing or renaming
  an exported symbol, changing a method's required parameters or return
  type, changing the runtime behavior of an existing method in a way that
  isn't a bug fix (for example, `pre()`/`post()` switching from
  "replace the previous hook" to "accumulate hooks" — the kind of behavior
  change that requires a migration note), or raising the minimum supported
  Node.js or `mongodb` driver version.
- **MINOR** — backwards-compatible additions: a new exported method, class,
  or type; a new optional parameter with a default that preserves prior
  behavior; a new hook point. Existing code keeps working unchanged after a
  MINOR upgrade.
- **PATCH** — backwards-compatible bug fixes: correcting behavior that
  didn't match its documented contract (a mis-typed return value, an
  options object not being passed through to the driver, an error not being
  wrapped in the right `Mongoat*Error` subclass), performance improvements,
  and documentation-only changes. A PATCH release never changes the shape
  of the public surface.

When a fix and a breaking change are entangled (fixing a bug requires
changing a signature), the release is versioned as MAJOR and the change is
called out in the changelog and, where relevant, in the [migration
guide](/migration).

## Release candidates

Before a MINOR or MAJOR release goes out as `latest`, it's typically
published first as a release candidate on the `rc` npm dist-tag (for
example, `1.2.0-rc.0`), never as `latest`. Installing `@iamcalegari/mongoat`
normally never resolves to an RC — you only get one by installing the `rc`
tag explicitly (`npm install @iamcalegari/mongoat@rc`). RCs exist to validate
the packaged tarball (dual CJS/ESM build, type exports, the documented
quick-start) against a real install before the same code is promoted to
`latest` as the final release. An RC can be superseded by another RC
(`-rc.1`, `-rc.2`, …) if issues are found; only once one is promoted does it
become the stable release under its final version number.

## Deprecation policy

When a released line is discontinued — most notably the `1.0.x-alpha` line,
superseded by the `1.1.0` stable release — it's marked with [`npm
deprecate`](https://docs.npmjs.com/cli/v10/commands/npm-deprecate) against
each exact affected version. The deprecation message points to the
current stable release and to the [migration guide](/migration) so anyone
who installs a deprecated version (or sees the npm install warning) knows
exactly where to go next. Deprecation never unpublishes or breaks an
existing install — it only marks the exact versions as unsupported and
signals forward.

## See also

- [Migration guide](/migration) — concrete upgrade steps between the alpha
  line and the stable release, and between future MAJOR versions.
- [The thin ODM philosophy](/explanation/thin-odm-philosophy) — why the
  native escape hatch is treated as a first-class part of the public API.
- [Reference](/api/) — the generated documentation for every symbol covered
  by this contract.
