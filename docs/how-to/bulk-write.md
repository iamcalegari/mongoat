# Batch writes with `bulkWrite`

This guide shows how to send a batch of mixed write operations in a single
round-trip with `Model.bulkWrite()`, and the two behaviors that are specific
to Mongoat: `documentDefaults` merging and top-level hooks.

## `Model.bulkWrite(operations, options)`

Pass an array of the driver's own bulk operations (`insertOne`, `updateOne`,
`updateMany`, `deleteOne`, `deleteMany`, `replaceOne`) plus optional
`BulkWriteOptions`. It returns the driver's `BulkWriteResult`:

```ts
import { METHODS, Model } from '@iamcalegari/mongoat';

const User = new Model<UserSchema>({
  collectionName: 'users',
  schema,
  // bulkWrite is NOT part of the validity: true subset — allow it explicitly
  allowedMethods: [METHODS.INSERT, METHODS.FIND_MANY, METHODS.BULK_WRITE],
});

const result = await User.bulkWrite([
  { insertOne: { document: { username: 'a', mail: 'a@x.com' /* … */ } } },
  {
    updateOne: {
      filter: { username: 'b' },
      update: { $set: { active: true } },
    },
  },
  { deleteOne: { filter: { username: 'c' } } },
]);

console.log(result.insertedCount, result.modifiedCount, result.deletedCount);
```

By default the driver runs operations **ordered** (stopping at the first
error); pass `{ ordered: false }` to keep going and collect all errors. A
driver failure (e.g. a duplicate key) is wrapped as a `MongoatDriverError` —
see [Handle errors](/how-to/handle-errors).

## `documentDefaults` applies to `insertOne` operations

The model's [`documentDefaults`](/how-to/document-defaults) are merged into the
document of every `insertOne` operation in the batch (deep-cloned per
operation, so nested defaults aren't shared between documents). The other
operation types — `updateOne`, `deleteOne`, `replaceOne`, … — pass through
unchanged; defaults only make sense for inserts.

## Hooks fire once, for `bulkWrite` — not per operation

`bulkWrite` runs the hook pipeline for `METHODS.BULK_WRITE` exactly once for
the whole batch. An `insertOne` inside the batch does **not** trigger your
`METHODS.INSERT` hooks, and an `updateOne` does not trigger your
`METHODS.UPDATE` hooks — hooks are keyed to the top-level method you called,
not to the individual operations inside it:

```ts
User.pre(METHODS.BULK_WRITE, (ctx) => {
  // ctx.operations is the full array; mutate it to affect the batch
  // ctx.options is the BulkWriteOptions
});
```

If you need per-document logic (validation, timestamps, transforms) to run for
each inserted document, either apply it yourself when building the operations
array, or use [`insertMany`](/tutorials/getting-started) — whose pre-hooks run
per document — for the insert-only portion.

## Method gating

Like `aggregate`, `bulkWrite` is **not** enabled by the `validity: true`
shorthand. Add `METHODS.BULK_WRITE` to an explicit `allowedMethods` list, or
calling it throws `METHOD_NOT_ALLOWED` — see
[Why Proxy gating](/explanation/proxy-gating).

## See also

- [Document defaults & timestamps](/how-to/document-defaults) — how defaults
  merge into inserted documents.
- [Run aggregation pipelines](/how-to/aggregation) — the other non-`validity`
  gated method.
- [Handle errors](/how-to/handle-errors) — `MongoatDriverError` and
  `DUPLICATE_KEY`.
- [Reference](/api/) — `Model.bulkWrite`, `METHODS`.
