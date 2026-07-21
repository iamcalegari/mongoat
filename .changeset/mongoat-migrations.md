---
"@iamcalegari/mongoat": minor
---

Add a production-ready versioned migrations system.

**Authoring and running.** `up`/`down` migration files (schema and/or data), applied in order and tracked idempotently in a control collection, driven by a `mongoat` CLI (`create`/`up`/`down`/`to`/`status`/`unlock`) shipped as a package `bin`. `tsx` is an optional peer dependency for loading `.ts` migration files — no new runtime dependency is added.

**Safe under concurrent deploys.** A distributed run lock (atomic `findOneAndUpdate` on a dedicated collection) prevents two instances from migrating at once; a second runner fails loudly with `MIGRATION_LOCK_HELD` instead of racing. A lock orphaned by a crash recovers on its own through TTL staleness, so a killed process never blocks migrations permanently. Release is fail-safe and never masks the migration's own error, and `SIGINT`/`SIGTERM` release the lock on interrupt.

**Configurable.** `mongoat.config.ts`/`.js`/`.json` configures the migrations scope (`dir`, `collection`, `lockTtlMs`, `allowNoTransaction`) with a `flag > env > config > default` precedence chain. Connection credentials stay in environment variables.

**Built for CI.** `up`/`to` accept `--dry-run`, which lists pending migrations and runs the real validations (checksum drift, topology precondition) without acquiring the lock, opening a transaction, or executing any migration body. `status --json` emits a stable-shaped envelope on stdout with human output kept on stderr, and exit codes are tiered so a pipeline can gate on them: `0` up to date, `2` pending, `3` failed or drifted.
