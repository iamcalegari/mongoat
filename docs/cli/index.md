# CLI reference

This page is the single source of truth for invoking the `mongoat` binary:
every flag, environment variable, config file key, and exit code it
recognizes. Each command below follows the same shape: what it does, which
flags it accepts, and what it deliberately never does.

## Table of contents

1. [Commands](#_1-commands)
2. [Environment variables](#_2-environment-variables)
3. [Config file](#_3-config-file)
4. [Configuration precedence](#_4-configuration-precedence)
5. [Dry-run](#_5-dry-run)
6. [Exit codes](#_6-exit-codes)
7. [CI examples](#_7-ci-examples)

---

## 1. Commands

Six subcommands make up the `mongoat` binary, documented here in the order
they're normally used: `create`, `up`, `down`, `to`, `status`, `unlock`.

### `mongoat create <name>`

Creates a new migration file on disk — it never touches MongoDB.

- **Positional:** `<name>` — must match `^[A-Za-z0-9_-]+$`. Anything else
  fails with `Error [INVALID_MIGRATION_NAME]: ...`.
- **Flags:**
  - `--dir <string>` — directory the new file is written into.
  - `--js` (boolean, default `false`) — write a `.js` stub instead of the
    default `.ts`.
  - `--config <string>` — path to an explicit config file.
- **Never:** connects to MongoDB. It also never imports an existing
  migration module — the only reason this command can still re-exec under
  `tsx` is a `.ts` config file, not a `.ts` migration.
- **On success:** prints `Created <path>` to stdout, where `<path>` is the
  file it just wrote.

### `mongoat up`

Applies every pending migration, in order, inside a MongoDB transaction
(unless bypassed).

- **Flags:**
  - `--dir <string>`
  - `--collection <string>`
  - `--allow-no-transaction` (boolean) — run without a transaction; see the
    warning below.
  - `--lock-ttl <string>` — override how long the acquired run lock is
    considered valid before it's treated as stale.
  - `--config <string>`
  - `--dry-run` (boolean) — preview instead of apply.
  - `--json` (boolean) — machine-readable output; **only accepted together
    with `--dry-run`.** Passed alone on a real run, it fails immediately
    with `Error [JSON_REQUIRES_DRY_RUN]: ...`, checked before any config
    file is even resolved.
- **With `--dry-run`:** reads the pending set and checks the replica-set
  topology and migration checksums, without acquiring the run lock, opening
  a session, or importing any migration module. Pending migrations are the
  expected, successful result of a dry run — never an error; only a genuine
  failure (no replica set without the bypass flag, or a checksum mismatch)
  is reported as one.

  `--dry-run --json` writes a single line of JSON shaped like:

  ```json
  {
    "schemaVersion": 1,
    "command": "up",
    "targetVersion": null,
    "migrations": [{ "version": "20260101090000", "name": "add_index" }],
    "transactional": true,
    "summary": { "count": 1 }
  }
  ```

  This is a description of the shape the command prints, not an importable
  TypeScript type — the entry point behind it is internal, not part of the
  published package. For the programmatic API instead of the CLI, see
  [Reference](/api/) and [Write and run migrations](/how-to/migrations).
- **Without `--dry-run`:** applies the pending migrations for real and
  prints `Migrations applied.` to stdout on success. Interrupting it
  (`Ctrl-C`, or a termination signal from an orchestrator) is reported as an
  interruption, distinct from an application error.
- **`--allow-no-transaction`:** whenever set, prints a warning to stderr on
  *every* invocation — worded for a preview during `--dry-run`, worded for a
  real run otherwise. The warning cannot be suppressed.
- **Re-exec under `tsx`:** two independent checkpoints can trigger it — one
  if the resolved config file itself is `.ts`, another if any discovered
  migration file is `.ts` — but there is only ever a single re-exec per
  invocation. Whichever checkpoint sees a `.ts` candidate first re-execs,
  and the replacement process finds both checkpoints already satisfied. The
  second checkpoint still runs during `--dry-run`, so a dry run fails the
  same way a real run would if `tsx` isn't available.

### `mongoat down <version>`

Reverts one already-applied migration.

- **Positional:** `<version>` — 14 digits, `YYYYMMDDHHMMSS`. Anything else
  fails with `Error [INVALID_MIGRATION_VERSION]: ...`.
- **Flags:** `--dir`, `--collection`, `--allow-no-transaction`,
  `--lock-ttl`, `--config` — the same shape as `up`, minus `--dry-run` and
  `--json`: **there is no dry-run for reverting.**
- **On success:** runs the migration's `down()`, removes its record, and
  prints `Reverted migration <version>.` to stdout.
- Shares `up`'s `--allow-no-transaction` warning and `tsx` re-exec behavior.

### `mongoat to <version>`

Applies every pending migration up to and including `<version>`, in order.

- **Positional:** `<version>` — same 14-digit validation as `down`.
- **Flags:** identical set to `up` (`--dir`, `--collection`,
  `--allow-no-transaction`, `--lock-ttl`, `--config`, `--dry-run`,
  `--json`), with the same `--json`-requires-`--dry-run` rule.
- **On success (real run):** prints `Migrated to <version>.` to stdout.
- **`--dry-run --json`:** the same envelope shape as `up`'s, except
  `targetVersion` carries the actual version instead of `null`.
- Shares `up`'s re-exec and `--allow-no-transaction` behavior.

### `mongoat status`

Reports the state of every migration, without changing anything.

- **Flags:** `--dir`, `--collection`, `--config`, `--json`.
- **Never:** imports a migration module, and never installs signal
  handlers — this command only reads.
- **Without `--json`:** prints a text table (`version | name | applied`,
  with `applied (DRIFTED)` for a migration whose file changed after it ran)
  followed by a `lock: ...` line.
- **With `--json`:** writes a single line of JSON shaped like:

  ```json
  {
    "schemaVersion": 1,
    "migrations": [
      {
        "version": "20260101090000",
        "name": "add_index",
        "state": "pending",
        "drifted": false,
        "appliedAt": null
      }
    ],
    "summary": { "applied": 0, "drifted": 0, "failed": 0, "pending": 1, "total": 1 },
    "lock": { "held": false }
  }
  ```

- The reported outcome is most-severe-wins across the whole set: a failed
  or drifted migration outranks any number of merely pending ones, which in
  turn outrank a fully applied, clean state. The run lock is never folded
  into that outcome — a clean repository whose lock is still held by a
  crashed runner still reports success, and the very next `up` can still
  fail on the lock. A caller that needs to know that must read `lock.held`
  from the JSON output separately.

### `mongoat unlock`

Inspects or removes the migration run lock — it never applies or reverts
anything itself.

- **Flags:** `--dir`, `--collection`, `--force` (boolean, default `false`),
  `--config`.
- **Without `--force`:** only reports. If a lock is currently held, prints
  its diagnostic to stdout and a separate warning to stderr advising against
  forcing unless you are certain nothing is actually running.
- **With `--force`:** removes the lock unconditionally — including one that
  has not expired yet.
- **Idempotent either way:** no lock present prints
  `No lock found — nothing to do.` and this always counts as success, never
  an error.

::: warning
Forcing an unlock while a migration is genuinely still running lets two
runners execute concurrently against the same data. This is also a
structural, permanent limit of the lock model in a **mixed rolling deploy**:
any `mongoat` binary older than `1.2.0` has no idea the lock collection
exists at all — the lock only protects a run once every writer talking to
the database is `1.2.0` or newer. Only pass `--force` when you are certain
nothing is currently running. See
[Why the migration lock exists](/explanation/migration-lock) for the full
concurrency model behind this warning.
:::

Every error any of these commands reports prints as `Error [CODE]: message`
to stderr (occasionally followed by `(cause: ...)` when it wraps an
underlying failure). An unrecognized or missing subcommand skips that
format entirely and prints its own line instead — `Unknown command:
"<name>". Available: create, up, down, to, status, unlock` — also to
stderr.

## 2. Environment variables

The CLI reads six environment variables in total: two for the MongoDB
connection, and four that resolve the migrations config fields covered in
[Configuration precedence](#_4-configuration-precedence) below — each of
those four also has a corresponding flag and a config-file key.

| Env var | Affects | Empty-string handling |
|---|---|---|
| `MONGODB_URI` | Connection string used to build the MongoDB client | Passed through as-is to the driver; not specially handled here |
| `MONGODB_DB_NAME` | Database name the client connects to | idem |
| `MONGOAT_MIGRATIONS_DIR` | `dir` — where migration files are discovered | Empty counts as unset, falls through to the next precedence tier |
| `MONGOAT_MIGRATIONS_COLLECTION` | `collection` — the collection tracking applied migration state | idem |
| `MONGOAT_MIGRATIONS_LOCK_TTL` | `lockTtlMs` — how long an acquired run lock stays valid before it's treated as stale | Empty counts as unset; a non-empty value that isn't a positive integer fails loud with `Error [INVALID_LOCK_TTL]` |
| `MONGOAT_MIGRATIONS_ALLOW_NO_TRANSACTION` | `allowNoTransaction` — whether migrations may run outside a transaction | Empty counts as unset; accepts `true`, `1`, `yes`, `on` and `false`, `0`, `no`, `off` (case-insensitive, surrounding whitespace trimmed) — anything else fails loud with `Error [INVALID_ALLOW_NO_TRANSACTION]` |

`MONGOAT_MIGRATIONS_LOCK_TTL` must be decimal digits only — no hex, no
scientific notation — and the parsed number must be a positive integer.
Surrounding whitespace is trimmed before the check, so `" 60000 "` is
accepted and resolves to `60000`. A value that fails either check is
rejected with the same
`INVALID_LOCK_TTL` code whether it came from `--lock-ttl` or from the env
var; the error message names whichever of the two actually supplied it.

`MONGOAT_MIGRATIONS_ALLOW_NO_TRANSACTION` recognizes exactly the eight
literals listed above — a generic `Boolean(str)` coercion is deliberately
not used, since it would make any non-empty string (including the literal
`"false"`) truthy.

## 3. Config file

`mongoat` optionally loads settings from a config file, either discovered
automatically or passed explicitly with `--config <path>`.

**Discovery (no `--config` flag):** the current working directory is probed
for three basenames, always all three, never short-circuiting on the first
match — short-circuiting would make detecting ambiguity impossible:

- `mongoat.config.json`
- `mongoat.config.js`
- `mongoat.config.ts`

Zero matches resolves silently to "no config file" — the file is optional.
Two or more matches in the same directory fails loud, listing every file
found, and points you to keep only one or pass `--config` to pick one
explicitly.

**Explicit `--config <path>`:** the extension is validated against the same
three, before anything touches the filesystem. A relative path is confined
to the working directory — a `../` escape fails loud with
`Error [INVALID_CONFIG_PATH]` — while an absolute path is a deliberate
escape hatch.

**Accepted keys:** exactly `dir`, `collection`, `allowNoTransaction` and
`lockTtlMs`. Any other key — misspelled or not — fails loud with
`Error [INVALID_CONFIG_SHAPE]`, naming the offending key(s) and the allowed
list.

::: warning
A `mongoat.config.js`/`.ts` file is **code**, executed with the same
privileges as whoever invokes the CLI — including during the automatic
working-directory probe above, with no flag involved at all. Cloning a
repository and running `mongoat status` inside it is enough to execute
third-party code — the same trust model already accepted for `vite`,
`jest`, or `eslint` config files. Only `mongoat.config.json` is read and
parsed as data; it is never executed.
:::

**Known limitation:** when a config file redirects `dir` to a folder of
TypeScript migrations, the config module can be evaluated **twice** in the
same invocation — once in the parent process, and again in the child
process re-executed under the `tsx` runtime. A config file with side
effects (reading a `.env` file, resolving a secret, opening a socket) needs
to be idempotent for that reason.

## 4. Configuration precedence

Four fields — `dir`, `collection`, `lockTtlMs` and `allowNoTransaction` —
are each resolved through the same four-tier chain, **independently per
field**. This is not "the flag wins for everything, or the config file wins
for everything": a single invocation can set `dir` and `collection` from a
config file while overriding just `lockTtlMs` with a flag.

| Flag | Env var | Config key | Default |
|---|---|---|---|
| `--dir` | `MONGOAT_MIGRATIONS_DIR` | `dir` | `"migrations"` |
| `--collection` | `MONGOAT_MIGRATIONS_COLLECTION` | `collection` | `"_migrations"` |
| `--lock-ttl` | `MONGOAT_MIGRATIONS_LOCK_TTL` | `lockTtlMs` | `1800000` (30 minutes) |
| `--allow-no-transaction` | `MONGOAT_MIGRATIONS_ALLOW_NO_TRANSACTION` | `allowNoTransaction` | `false` |

For each field, the first tier that supplies a value wins, in this order:
CLI flag, then environment variable, then config file, then the built-in
default.

**The empty-string handling is deliberately asymmetric between tiers.** An
empty environment variable (`MONGOAT_MIGRATIONS_DIR=` in a Docker Compose
`environment:` entry, or an unset `.env` key) is treated as **not set** and
falls through to the next tier — ambient, global env vars can arrive empty
without anyone intending it. A value supplied explicitly through a flag or a
config-file key that is empty, by contrast, is treated as a mistake worth
surfacing rather than silently ignored, and fails loud with
`Error [INVALID_CONFIG_SHAPE]` — an explicit `""` was a deliberate act by
whoever wrote the flag or the config, and falling back silently would only
delay the surprise.

`lockTtlMs` is the one exception to that second half: an explicitly empty
`--lock-ttl ""` falls through to the next tier instead of failing, the same
way an empty env var does. Pass a value you mean, or omit the flag — do not
rely on an empty one to signal anything.

The two connection variables from the previous section — `MONGODB_URI` and
`MONGODB_DB_NAME` — are not part of this chain: they have no flag or
config-file equivalent.

## 5. Dry-run

`--dry-run` (accepted by `up` and `to`) previews what a real run would do,
without applying anything. It runs the same internal, read-only entry
point either command's real run calls first — not a separate simulation
path re-implemented on the side.

**What it actually runs**, in order:

1. The same replica-set topology precondition a real run checks before
   anything else.
2. The same pending-migration collection a real run would apply, including
   a checksum-drift check across every migration already applied and still
   present on disk — not just the next pending one.

**What it never runs:** it never acquires the run lock, never opens a
session or a transaction, never executes a migration's `up()`/`down()`
body — and it never even imports a migration module. The list of pending
migrations comes entirely from scanning file names on disk and computing a
byte checksum for each; no migration code is ever loaded into the process.

**What it still does:** it connects for real to MongoDB and reads the
control collection. A dry run does not *mutate* the database — but it is
not an offline simulation, and it fails if the database is unreachable
exactly like a real run would. Treat "no pending migrations" as the
normal, successful outcome of a dry run, never an error; only a genuine
failure (no replica set without the bypass flag, or a checksum mismatch) is
reported as one.

**Topology reporting.** The plan reports exactly one of two states:

- `topology OK` (`"transactional": true` in JSON) — a replica set was
  found; a real run of this plan would execute inside a transaction.
- `topology BYPASSED (--allow-no-transaction)` (`"transactional": false` in
  JSON) — no replica set was found, and `--allow-no-transaction` let the
  check through anyway. This means the gate was **circumvented, not
  satisfied** — it is not a synonym for "OK". A successful dry run under
  this state carries **no atomicity guarantee** for the real run that
  would follow it; never read a clean dry run as a promise that the real
  run will be atomic, or even that it will succeed.

**`--json` requires `--dry-run`.** Passing `--json` on a real run fails
immediately with `Error [JSON_REQUIRES_DRY_RUN]: ...`, checked right after
argument parsing — before any config file is resolved — so a real,
database-mutating run can never hand back a machine-readable payload.

**Plan envelope** (`up`/`to --dry-run --json`):

```json
{
  "schemaVersion": 1,
  "command": "up",
  "targetVersion": null,
  "migrations": [{ "version": "20260102103000", "name": "add-loyalty-tier" }],
  "transactional": true,
  "summary": { "count": 1 }
}
```

`targetVersion` is the 14-digit version string for `to`, and `null` — never
omitted — for `up`, which has no target version.

**Status envelope** (`status --json`, shown here for comparison — it is
not itself a dry run, but the other machine-readable envelope this
reference covers):

```json
{
  "schemaVersion": 1,
  "migrations": [
    {
      "version": "20260101090000",
      "name": "backfill-user-status",
      "state": "applied",
      "drifted": false,
      "appliedAt": "2026-01-01T09:00:00.000Z"
    }
  ],
  "summary": { "applied": 1, "drifted": 0, "failed": 0, "pending": 0, "total": 1 },
  "lock": { "held": false }
}
```

Both envelopes are documented here **by shape, from concrete examples** —
neither is an importable TypeScript type today: the types behind them, and
the read-only entry point that produces the plan envelope, are internal
and are not part of the published package surface.

## 6. Exit codes

Every exit code below comes directly from `computeStatusExitCode`,
`runWithSignalHandling`'s interrupt mapping, and each handler's own return
path in `src/bin/mongoat.ts` — none of it is a number chosen by convention.

| Command | Exit code | Condition |
|---|---|---|
| `create` | `0` | The migration file was written successfully. |
| `create` | `1` | Any error — an invalid name, a missing/ambiguous/malformed config file, `tsx` unavailable or failing to re-exec, or the defensive path-escape guard. |
| `up`, `to` | `0` | A real run applied every targeted migration; or `--dry-run` completed — with or without pending migrations. Pending migrations are the expected, successful result of a dry run, never an error. |
| `up`, `to` | `130` | The process received `SIGINT` during a real (non-`--dry-run`) run; the in-flight migration finished before the process stopped. |
| `up`, `to` | `143` | The process received `SIGTERM` during a real run — same graceful-stop behavior as `SIGINT`, a different signal. |
| `up`, `to` | `1` | Any other error, on a real run or a `--dry-run` alike: no replica set without `--allow-no-transaction`, a checksum-drift failure, a held run lock, a migration failure, or `--json` passed without `--dry-run` (`JSON_REQUIRES_DRY_RUN`). |
| `down` | `0` | The migration was reverted successfully. |
| `down` | `130` | `SIGINT` during the revert. |
| `down` | `143` | `SIGTERM` during the revert. |
| `down` | `1` | Any other error — an unknown version, an irreversible migration, a held lock, or a revert failure. There is no `--dry-run` for `down`. |
| `status` | `0` | Every migration is applied — nothing pending, failed, or drifted. |
| `status` | `2` | At least one migration is pending, and nothing is failed or drifted. |
| `status` | `3` | At least one migration is failed or drifted — this outranks any number of pending migrations. |
| `status` | `1` | An error before a status could even be computed, for example a connection failure. |
| `unlock` | `0` | The operation completed, with or without `--force`, whether a lock was found, removed, or merely reported. Idempotent: no lock present is still `0`, never an error. |
| `unlock` | `1` | Any error. |
| *(unrecognized or missing subcommand)* | `1` | — |

`130` and `143` follow the Unix `128 + signal number` convention (`SIGINT`
is signal 2, `SIGTERM` is signal 15) and only ever apply to `up`, `down`,
and `to` — and only to their real, mutating run. Signal handlers are
installed for the duration of that run alone: they are never installed
around `create`, `status`, or `unlock`, and a `--dry-run` invocation of
`up`/`to` returns before they would ever be installed at all, so a dry run
itself can never produce `130`/`143`.

**The exit code of `status` reflects migration state only — it says
nothing about the run lock.** A repository that is fully applied but whose
lock is still held by a crashed runner still exits `0` here, and the very
next `mongoat up` still fails with `Error [MIGRATION_LOCK_HELD]`. A
pipeline that needs to know whether the next command can actually run has
to read the lock separately, from the `lock.held` field of the `--json`
envelope shown in [Dry-run](#_5-dry-run) — `$?` alone never answers that
question.

## 7. CI examples

The three examples below — one for GitHub Actions, one for GitLab CI, and
one plain shell script for anything else — exercise the exact **same
logical flow**. The only difference between them is CI syntax: whoever
edits the logic in one of them must edit the other two the same way, or
they silently drift apart.

That logical flow has five steps, in this order:

1. Run `status --json`, redirecting its output to a file and capturing
   `status`'s own exit code directly — never by reading the exit code at
   the end of a pipe. In a shell without pipe-failure propagation enabled,
   the code read after a pipe belongs to the last command in it (`jq`,
   here), not to `mongoat`. This is the easiest mistake to make in this
   section, and the reason the payload goes to a file instead of straight
   into a filter.
2. Abort on any exit code outside the three `status` actually reports.
   `status` answers with `0`, `2` or `3`; anything else means it never
   reached the point of computing an answer — a connection failure, a bad
   config, an interrupted process. That case needs its own branch, because
   the redirect still creates the output file and `jq` reads an empty file
   without complaint: with no explicit guard, a run that never reached the
   database falls through every later condition and the script exits `0`,
   reporting success for a check that did not happen.
3. Abort when the exit code indicates a failed or drifted migration — it
   is not safe to continue.
4. Check the run lock **separately**, by filtering the `lock.held` field
   out of the saved payload — the exit code never reflects the lock (see
   [Exit codes](#_6-exit-codes)).
5. Apply the pending migrations when the exit code indicates there are
   any.

Each example wraps the identical shell block in one job with one step —
no matrix, no cache, no extra conditionals — so the three stay easy to
read side by side and easy to copy.

### GitHub Actions

```yaml
name: Migration gate
on: [pull_request]
jobs:
  migration-gate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5
      - uses: actions/setup-node@v4
        with:
          node-version: '22.x'
      - run: npm ci
      - run: |
          set +e
          mongoat status --json > mongoat-status.json
          status_code=$?
          set -e

          if [ "$status_code" -ne 0 ] && [ "$status_code" -ne 2 ] && [ "$status_code" -ne 3 ]; then
            echo "mongoat status did not run (exit $status_code) — aborting" >&2
            exit 1
          fi

          if [ "$status_code" -eq 3 ]; then
            echo "Migrations failed or drifted — aborting" >&2
            exit 1
          fi

          lock_held=$(jq -r '.lock.held' mongoat-status.json)
          if [ "$lock_held" = "true" ]; then
            echo "Migration lock is held — aborting" >&2
            exit 1
          fi

          if [ "$status_code" -eq 2 ]; then
            mongoat up
          fi
        env:
          MONGODB_URI: ${{ secrets.MONGODB_URI }}
          MONGODB_DB_NAME: ${{ secrets.MONGODB_DB_NAME }}
```

GitHub Actions runs a `run:` step's default shell with `-e` already
enabled — the `set +e` / `set -e` pair around the first command is not
optional here: without it, a `status` exit code of `2` or `3` (both
non-zero) would end the step before `status_code=$?` ever ran.

### GitLab CI

```yaml
migration-gate:
  stage: deploy
  image: node:22
  script:
    - npm ci
    - |
      set +e
      mongoat status --json > mongoat-status.json
      status_code=$?
      set -e

      if [ "$status_code" -ne 0 ] && [ "$status_code" -ne 2 ] && [ "$status_code" -ne 3 ]; then
        echo "mongoat status did not run (exit $status_code) — aborting" >&2
        exit 1
      fi

      if [ "$status_code" -eq 3 ]; then
        echo "Migrations failed or drifted — aborting" >&2
        exit 1
      fi

      lock_held=$(jq -r '.lock.held' mongoat-status.json)
      if [ "$lock_held" = "true" ]; then
        echo "Migration lock is held — aborting" >&2
        exit 1
      fi

      if [ "$status_code" -eq 2 ]; then
        mongoat up
      fi
  variables:
    MONGODB_URI: $MONGODB_URI
    MONGODB_DB_NAME: $MONGODB_DB_NAME
```

Same block as the GitHub Actions step, unwrapped from a job's `run:` key
into a job's `script:` list instead — the same `set +e` / `set -e` guard
is kept even though GitLab's default runner shell does not enable `-e` on
its own, so the block stays byte-identical to the other two.

### Agnostic shell script

```bash
#!/usr/bin/env bash
set +e
mongoat status --json > mongoat-status.json
status_code=$?
set -e

if [ "$status_code" -ne 0 ] && [ "$status_code" -ne 2 ] && [ "$status_code" -ne 3 ]; then
  echo "mongoat status did not run (exit $status_code) — aborting" >&2
  exit 1
fi

if [ "$status_code" -eq 3 ]; then
  echo "Migrations failed or drifted — aborting" >&2
  exit 1
fi

lock_held=$(jq -r '.lock.held' mongoat-status.json)
if [ "$lock_held" = "true" ]; then
  echo "Migration lock is held — aborting" >&2
  exit 1
fi

if [ "$status_code" -eq 2 ]; then
  mongoat up
fi
```

The same five steps, with no CI-specific wrapping at all — run it from any
shell, in any pipeline system that can execute a script and read its exit
code.

## See also

- [Why the migration lock exists](/explanation/migration-lock) — the
  concurrency model behind `MIGRATION_LOCK_HELD`, the lock's state machine,
  and the mixed-deployment limit.
- [Write and run migrations](/how-to/migrations) — the day-to-day guide to
  authoring and running migrations.
- [Your first migration](/tutorials/first-migration) — a guided walkthrough
  from scaffold to applied and reverted.
- [Reference](/api/) — `runMigrations`, `runTo`, `revertMigration`,
  `getStatus`, `defineMigration`, `defineConfig`.
