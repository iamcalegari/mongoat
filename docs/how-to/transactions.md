# Use transactions & sessions

This guide shows how to run several Mongoat writes inside a single MongoDB
transaction. Mongoat has no transaction API of its own — staying thin, it
leans on the driver's session, reached through the escape hatch — and every
`Model` method forwards its `options` to the driver, so threading a write into
a transaction is just passing `{ session }`.

> **Requires a replica set or a sharded cluster.** MongoDB transactions are
> not available on a standalone `mongod`. A single-node replica set is enough
> for local development.

## Start a session and run a transaction

Get a session from the native `MongoClient` via `database.getClient()`, then
use the driver's `withTransaction` helper — it starts the transaction, commits
on success, and aborts (with automatic retries on transient errors) if the
callback throws:

```ts
const client = database.getClient(); // MongoClient | undefined — native driver object

if (!client) {
  throw new Error('Not connected — call database.connect() first');
}

const session = client.startSession();

try {
  await session.withTransaction(async () => {
    // pass { session } to every write that must be part of the transaction
    await Account.update(
      { _id: fromId },
      { $inc: { balance: -amount } },
      { session }
    );
    await Account.update(
      { _id: toId },
      { $inc: { balance: amount } },
      { session }
    );
    await Ledger.insert({ fromId, toId, amount }, { session });
  });
} finally {
  await session.endSession();
}
```

If any operation inside the callback rejects, `withTransaction` aborts the
whole transaction — none of the three writes are applied.

## `{ session }` threads any method into the transaction

Because `Model` methods pass their `options` straight through to the driver,
`{ session }` works uniformly across the API — writes **and** reads:

```ts
const current = await Account.findById(fromId, { session }); // read within the transaction
await Account.update({ _id: fromId }, { $set: { seen: true } }, { session });
await Account.bulkWrite(ops, { session });
```

A method call **without** `{ session }` inside the callback runs outside the
transaction — it won't be rolled back if the transaction aborts. Pass the
session to every operation that must participate.

## Hooks, validation and gating still apply

Reaching for a session is not the same as reaching past Mongoat. Unlike
[`getCollection()`](/how-to/escape-hatch), which hands you the raw collection,
here you still call `Model` methods — so your `pre`/`post` hooks, the `$where`
guard, and `allowedMethods` gating all run normally. Only the _session_ comes
from the driver; the operations themselves stay on the typed, guarded surface.

## See also

- [Use the native escape hatch](/how-to/escape-hatch) — `getClient()`, the
  source of the session.
- [Batch writes with `bulkWrite`](/how-to/bulk-write) — often paired with a
  session for atomic multi-write batches.
- [Reference](/api/) — `Database.getClient`.
