# Your first migration

This tutorial walks you through the full lifecycle of a database migration
with Mongoat: scaffold a migration file, write `up` and `down`, apply it,
confirm it in the migration status, then revert and re-apply it. By the end
you'll have run the whole cycle once, end to end.

## Prerequisites

- Node.js `^20.19.0` or `>=22.12.0`
- MongoDB running as a **single-node replica set** — this tutorial takes the
  transactional path, which every migration uses by default, and that
  requires a replica set (a standalone `mongod` won't work here)
- `@iamcalegari/mongoat` installed (`npm install @iamcalegari/mongoat`)
- `tsx` installed as a dev dependency — this tutorial writes a TypeScript
  migration:

```bash
npm install -D tsx
```

- The connection env vars set: `MONGODB_URI` and `MONGODB_DB_NAME`

## 1. Scaffold the migration

```bash
mongoat create backfill-user-status
```

```
Created migrations/20260719120000_backfill-user-status.ts
```

The file that appears looks like this:

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

## 2. Fill in `up`

Backfill a `status` field onto every `users` document that doesn't have one
yet — a small, concrete change against a collection you can picture. Pass
`ctx.session` so the update runs inside the migration's transaction:

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

  // ...
});
```

## 3. Fill in `down`

The inverse: remove the field again.

```ts
export const { up, down } = defineMigration({
  // ...

  async down(ctx: MigrationContext): Promise<void> {
    await ctx.db
      .collection('users')
      .updateMany({}, { $unset: { status: '' } }, { session: ctx.session });
  },
});
```

Writing `down` now, while the change is fresh in your head, is much cheaper
than reconstructing it later under pressure — and it's what makes the revert
you'll run in step 5 possible at all.

## 4. Apply it

```bash
mongoat up
```

```
Migrations applied.
```

## 5. Confirm with status

```bash
mongoat status
```

```
version | name | applied
20260719120000 | backfill-user-status | applied
lock: free
```

## 6. Undo it, then re-apply

```bash
mongoat down 20260719120000
```

```
Reverted migration 20260719120000.
```

Run `status` again and watch the row flip back to pending:

```bash
mongoat status
```

```
version | name | applied
20260719120000 | backfill-user-status | pending
lock: free
```

Re-apply it to finish where you started:

```bash
mongoat up
```

```
Migrations applied.
```

You've now run the whole cycle: scaffold, apply, confirm, revert, and
re-apply. For every flag, the failure modes, the four status labels, running
migrations programmatically, and the `ctx.schema` helpers, see the how-to.

## Next steps

- [Write and run migrations](/how-to/migrations) — every flag, both env
  vars, the programmatic API, and how to recover when something goes wrong.
- [Use transactions & sessions](/how-to/transactions) — more on sessions and
  `{ session }`, which the migration runner uses under the hood.
- [Reference](/api/) — the full public API generated from the source.
