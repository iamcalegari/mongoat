# CLI reference

This page is the single source of truth for invoking the `mongoat` binary:
every flag, environment variable, config file key, and exit code it
recognizes. Each command below follows the same shape: what it does, which
flags it accepts, and what it deliberately never does.

## Table of contents

1. [Commands](#1-commands)
2. [Environment variables](#2-environment-variables)
3. [Config file](#3-config-file)
4. [Configuration precedence](#4-configuration-precedence)

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
- **Re-exec under `tsx`:** can happen up to twice — once if the resolved
  config file itself is `.ts`, and again if any discovered migration file is
  `.ts`. The second check still runs during `--dry-run`, so a dry run fails
  the same way a real run would if `tsx` isn't available.

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
nothing is currently running.
:::

Every error any of these commands reports prints as `Error [CODE]: message`
to stderr (occasionally followed by `(cause: ...)` when it wraps an
underlying failure). An unrecognized or missing subcommand skips that
format entirely and prints its own line instead — `Unknown command:
"<name>". Available: create, up, down, to, status, unlock` — also to
stderr.

## 2. Environment variables

The CLI reads eight environment variables in total: two for the MongoDB
connection, and four that resolve the migrations config fields covered in
[Configuration precedence](#4-configuration-precedence) below — each of
those four also has a `--flag` and a config-file key.

| Env var | Affects | Empty-string handling |
|---|---|---|
| `MONGODB_URI` | Connection string used to build the MongoDB client | Passed through as-is to the driver; not specially handled here |
| `MONGODB_DB_NAME` | Database name the client connects to | idem |
| `MONGOAT_MIGRATIONS_DIR` | `dir` — where migration files are discovered | Empty counts as unset, falls through to the next precedence tier |
| `MONGOAT_MIGRATIONS_COLLECTION` | `collection` — the collection tracking applied migration state | idem |
| `MONGOAT_MIGRATIONS_LOCK_TTL` | `lockTtlMs` — how long an acquired run lock stays valid before it's treated as stale | Empty counts as unset; a non-empty value that isn't a positive integer fails loud with `Error [INVALID_LOCK_TTL]` |
| `MONGOAT_MIGRATIONS_ALLOW_NO_TRANSACTION` | `allowNoTransaction` — whether migrations may run outside a transaction | Empty counts as unset; accepts `true`, `1`, `yes`, `on` and `false`, `0`, `no`, `off` (case-insensitive, surrounding whitespace trimmed) — anything else fails loud with `Error [INVALID_ALLOW_NO_TRANSACTION]` |

`MONGOAT_MIGRATIONS_LOCK_TTL` must be decimal digits only — no surrounding
whitespace, no hex, no scientific notation — and the parsed number must be a
positive integer. A value that fails either check is rejected with the same
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

The two connection variables from the previous section — `MONGODB_URI` and
`MONGODB_DB_NAME` — are not part of this chain: they have no `--flag` or
config-file equivalent.
