# Write and run migrations

This guide covers the `mongoat` CLI's migration runner: scaffolding a
migration file, writing `up`/`down`, applying and reverting migrations,
checking status, and the failure modes you'll hit along the way. Reach for it
once your schema or data needs a change that has to run once, in order,
against every environment.

## Install and prerequisites

Migrations ship with the package — no extra install for `.js` migrations.

`.ts` migrations need [`tsx`](https://github.com/privatenumber/tsx), an
optional peer dependency:

```bash
npm install -D tsx
```

`mongoat` re-execs itself under `tsx` automatically whenever it discovers a
`.ts` migration file. If your migrations directory is `.js`-only, you never
need `tsx` at all.

Every migration runs inside a MongoDB transaction, which requires a replica
set (or a `mongos` router) — a standalone `mongod` doesn't support
transactions. A single-node replica set is enough for local development. See
[No replica set](#no-replica-set) below for the escape hatch.

## Create a migration

```bash
mongoat create backfill-user-status
```

Writes `migrations/<YYYYMMDDHHMMSS>_backfill-user-status.ts`, where the
timestamp prefix is the current date/time to the second. Pass `--js` to
generate a `.js` stub instead, and `--dir <path>` to write somewhere other
than the default `migrations` directory.

The name must match `^[A-Za-z0-9_-]+$` — letters, digits, `_` and `-` only.

## Write `up` and `down`

The generated stub uses `defineMigration` and named exports:

```ts
import { defineMigration } from '@iamcalegari/mongoat';
import type { MigrationContext } from '@iamcalegari/mongoat';

export const { up, down } = defineMigration({
  async up(ctx: MigrationContext): Promise<void> {
    // TODO: implement
  },

  async down(ctx: MigrationContext): Promise<void> {
    // TODO: implement (optional — delete this to make the migration irreversible)
  },
});
```

A plain named function export works too — `defineMigration` is a convenience
wrapper, not a requirement. The runner only cares about the named `up`/`down`
exports on the module:

```ts
export async function up(ctx: MigrationContext): Promise<void> {
  // ...
}
```

`up` is required. `down` is optional — see
[Reverting a migration that has no `down`](#reverting-a-migration-that-has-no-down)
for what that means.

`ctx` (`MigrationContext`) has three fields:

- `ctx.db` — the native driver `Db`, no ODM wrapper.
- `ctx.session` — the native `ClientSession`, already attached to the
  migration's transaction. Pass it to any driver call that accepts a
  `session` option so the operation is part of the transaction.
- `ctx.schema` — helpers for applying a validator or index set (below).

Here's a realistic pair — backfilling a field on an existing collection, and
undoing it:

```ts
export const { up, down } = defineMigration({
  async up(ctx: MigrationContext): Promise<void> {
    await ctx.db
      .collection('users')
      .updateMany(
        { status: { $exists: false } },
        { $set: { status: 'active' } },
        { session: ctx.session }
      );
  },

  async down(ctx: MigrationContext): Promise<void> {
    await ctx.db
      .collection('users')
      .updateMany({}, { $unset: { status: '' } }, { session: ctx.session });
  },
});
```

### `ctx.schema` helpers

`ctx.schema.applyValidator(collectionName, target, options?)` and
`ctx.schema.applyIndexes(collectionName, target)` apply the exact same
validator/index-application logic `Model`/`Database` use internally, so a
migration never risks producing a weaker validator than the ODM would. `target`
accepts one of three shapes:

- an already-registered `Model` instance — its built validator and indexes
  are read straight off the instance;
- a class decorated with `@Schema`/`@Prop`;
- a plain `ModelValidationSchema` object.

`applyIndexes` only has indexes to apply for a `Model` target — indexes are
declared on `CreateModelProps`, not on the schema itself, so passing a
decorated class or a plain schema object to `applyIndexes` is a no-op.

```ts
await ctx.schema.applyValidator('users', User);
await ctx.schema.applyIndexes('users', User);
```

## Run pending migrations

```bash
mongoat up
```

Applies every pending migration in ascending version order and prints
`Migrations applied.`. It's safe to re-run: a migration whose version is
already recorded as applied is never re-run.

Before running for real, `--dry-run` previews the same pending set without
applying anything, without acquiring the run lock, and without opening a
session — see [Dry-run](/cli/#_5-dry-run) in the [CLI reference](/cli/) for
exactly what it checks and what it deliberately skips. For every other flag
`up` accepts, see [`mongoat up`](/cli/#mongoat-up).

## Check status

```bash
mongoat status
```

```
version | name | applied
20260101090000 | backfill-user-status | applied
20260102103000 | add-loyalty-tier | pending
```

Each row shows one of four labels:

- **`pending`** — discovered on disk, not yet applied.
- **`applied`** — recorded as applied, and its file's checksum still matches
  what was recorded when it ran.
- **`applied (DRIFTED)`** — recorded as applied, but the file has been edited
  since — its checksum no longer matches. Drift blocks `mongoat up`/`mongoat
to` until resolved.
- **`failed`** — the most recent attempt to apply it failed; it is never
  reported as applied.

The exit code reflects **migration state only** — it never reflects the run
lock, so a fully applied repository whose lock is still held by a crashed
runner can still exit successfully, and the very next `mongoat up` can still
fail with `MIGRATION_LOCK_HELD`. See
[`mongoat status`](/cli/#mongoat-status) and
[Exit codes](/cli/#_6-exit-codes) in the [CLI reference](/cli/) for the
exact codes and the `--json` payload shape, including how to read the lock
separately from the exit code.

## Revert a migration

```bash
mongoat down 20260101090000
```

Runs the migration's `down(ctx)` and, on success, removes its record and
prints `Reverted migration 20260101090000.`. There is no dry-run for
reverting — see [`mongoat down <version>`](/cli/#mongoat-down-version) in
the [CLI reference](/cli/) for the full set of flags it accepts.

## Migrate to a specific version

```bash
mongoat to 20260101090000
```

Applies every pending migration up to and including the given version, in
order, and prints `Migrated to 20260101090000.`. It accepts the same flags
as `up`, including `--dry-run` — see
[`mongoat to <version>`](/cli/#mongoat-to-version) in the
[CLI reference](/cli/) for the full list.

## Configuration

`mongoat` can be configured through a CLI flag, an environment variable, or
a config file — each setting resolves independently, and exactly one
source wins when more than one supplies a value. See
[Environment variables](/cli/#_2-environment-variables) and
[Config file](/cli/#_3-config-file) in the [CLI reference](/cli/) for every
flag, variable, and key, and the [CLI reference](/cli/) itself for the
exact order sources are checked in.

## Run migrations programmatically

The runner is also available as five exported functions, for wiring into
application code instead of (or alongside) the CLI:

```ts
import { runMigrations } from '@iamcalegari/mongoat';
import { database } from './database'; // your connected Database instance

await runMigrations(database, {
  dir: 'migrations',
  collection: '_migrations',
});
```

- `runMigrations(database, config)` — applies every pending migration.
- `runTo(database, version, config)` — applies pending migrations up to and
  including `version`.
- `revertMigration(database, version, config)` — reverts one applied
  migration.
- `getStatus(database, config)` — returns the same rows `mongoat status`
  prints, as data.
- `defineMigration(module)` — the convenience wrapper used by the generated
  stub.

The first argument to `runMigrations`, `runTo`, `revertMigration` and
`getStatus` is a connected `Database` instance — not a raw driver `Db`.
`config` is `{ dir, collection, allowNoTransaction? }`.

## When something goes wrong

### TypeScript migrations without `tsx`

**Symptom:**

```
Error [TSX_NOT_AVAILABLE]: .ts migrations were found but tsx is not installed. Install it as a devDependency ("npm install -D tsx") or compile your migrations to .js.
```

**Cause:** a `.ts` migration was discovered, but `tsx` isn't resolvable from
the project.

**Fix:** `npm install -D tsx`, or compile your migrations to `.js`. A
`.js`-only migration set never hits this check.

### No replica set

**Symptom:**

```
Error [REPLICA_SET_REQUIRED]: Migrations run inside a MongoDB transaction, which requires a replica set (or mongos). Standalone MongoDB does not support transactions (driver error 20, IllegalOperation). Start MongoDB as a single-node replica set for local development, or pass --allow-no-transaction to run this migration WITHOUT atomicity (not recommended outside local dev).
```

**Cause:** every migration runs inside a transaction, and this check runs
before any migration in the run is applied — before any `up`/`down` code
executes.

**Fix:** run against a replica set (a single-node replica set is enough
locally), or opt out with `--allow-no-transaction`.

::: warning
`--allow-no-transaction` runs migrations **without** atomicity — a failed
migration can leave data partially applied, with no automatic rollback. It
prints a warning to stderr on every single invocation, and that warning
cannot be silenced. Use it only against a standalone MongoDB in local
development — never as a production option.
:::

### Reverting a migration that has no `down`

**Symptom:**

```
Error [MIGRATION_IRREVERSIBLE]: Migration "<version>_<name>" has no down() export — it is irreversible by design.
```

**Cause:** the migration file has no `down` export.

**Fix:** there is no automated way around this — a migration with no `down`
is irreversible by design, not a silent no-op. Undo the change by hand, or
write a new forward migration that reverses the effect.

### A migration that fails mid-run

**Symptom:**

```
Error [MIGRATION_FAILED]: Migration "<version>_<name>" failed — recorded as "failed" in "<collection>" and stopped (no automatic DDL rollback). Resolve the cause and re-run, or revert via down().
```

**Cause:** the migration's `up` (or `down`) threw. There is no automatic DDL
rollback — the migration is recorded with status `failed` and the run stops.

**Fix:** run `mongoat status` to find the stuck version, resolve the
underlying cause, then re-run `mongoat up` (only pending migrations run) or
revert it once it's safe to do so.

### The migration lock is already held

**Symptom:**

```
Error [MIGRATION_LOCK_HELD]: Migration lock is held by <host> (pid <pid>, <operation>) since <timestamp>, expires <timestamp>. Wait for it to expire, or if the owning process died, run `mongoat unlock`.
```

**Cause:** another `mongoat up`, `down`, or `to` — a concurrent CI job, a
second instance of a rolling deploy, or a crashed run whose lease hasn't
expired yet — already holds the exclusive run lock every one of those
commands acquires before touching migration state. See
[Why the migration lock exists](/explanation/migration-lock) for what the
lock guarantees and why a crashed holder recovers on its own once its lease
lapses.

**Fix:** wait for the lease to expire, or — once you're certain nothing is
actually running — release it with `mongoat unlock --force`. See
[`mongoat unlock`](/cli/#mongoat-unlock) in the [CLI reference](/cli/) for
its flags and exit codes.

### Version and name validation errors

- `mongoat to <version>` and `mongoat down <version>` require a 14-digit
  version (`YYYYMMDDHHMMSS`) — anything else fails with
  `Error [INVALID_MIGRATION_VERSION]: ...`.
- `mongoat create <name>` requires a name matching `^[A-Za-z0-9_-]+$` —
  anything else fails with `Error [INVALID_MIGRATION_NAME]: ...`.

Every CLI error prints as `Error [CODE]: message` to stderr.

## See also

- [Your first migration](/tutorials/first-migration) — a guided walkthrough
  from scaffold to applied and reverted.
- [Handle errors](/how-to/handle-errors) — the `MongoatError` hierarchy and
  `.code` values.
- [Use transactions & sessions](/how-to/transactions) — more on sessions and
  `{ session }` threading, which the migration runner uses internally.
- [CLI reference](/cli/) — every flag, environment variable, config file
  key, and exit code for `create`, `up`, `down`, `to`, `status`, and
  `unlock`.
- [Why the migration lock exists](/explanation/migration-lock) — the
  concurrency model behind `MIGRATION_LOCK_HELD` and the lock's state
  machine.
- [Reference](/api/) — `MigrationContext`, `MigrationModule`, `runMigrations`,
  `runTo`, `revertMigration`, `getStatus`, `defineMigration`.
