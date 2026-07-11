# Run aggregation pipelines

This guide shows how to run a MongoDB aggregation pipeline through a `Model`
with `aggregate()`, and when to drop to the native cursor via the escape
hatch instead.

## `Model.aggregate(pipeline, options)`

Pass a pipeline (an array of stage objects) and, optionally, the driver's own
`AggregateOptions`. Mongoat runs the pipeline and returns the **materialized
result array** — it calls `.toArray()` for you, so you get `Document[]`, not a
cursor:

```ts
import { METHODS, Model } from '@iamcalegari/mongoat';

const Order = new Model<OrderSchema>({
  collectionName: 'orders',
  schema,
  // aggregate is NOT part of the validity: true subset — allow it explicitly
  allowedMethods: [METHODS.INSERT, METHODS.FIND_MANY, METHODS.AGGREGATE],
});

const revenueByCustomer = await Order.aggregate([
  { $match: { status: 'paid' } },
  { $group: { _id: '$customerId', total: { $sum: '$amount' } } },
  { $sort: { total: -1 } },
]);
```

The result is typed `Document[]`, not `OrderSchema[]` — a pipeline can reshape
documents into anything (`$group`, `$project`, `$lookup`), so Mongoat does not
pretend the output still matches the model's own type. Cast or validate the
shape yourself at the call site if you need a narrower type.

## Method gating

`aggregate` is a gated method. It is **not** included in the `validity: true`
shorthand (which covers only the standard single/many CRUD methods), so a
model created with `validity: true` and nothing else will throw
`METHOD_NOT_ALLOWED` on `aggregate()`. Add `METHODS.AGGREGATE` to an explicit
`allowedMethods` list to enable it — see [Why Proxy gating](/explanation/proxy-gating).

## Hooks run for `aggregate`

`aggregate` goes through the same hook pipeline as every other gated method.
Pre/post hooks registered for `METHODS.AGGREGATE` receive a `ctx` exposing
`ctx.pipeline`, `ctx.options` and (in post-hooks) `ctx.result`:

```ts
Order.pre(METHODS.AGGREGATE, (ctx) => {
  // e.g. force a tenant scope onto every pipeline
  ctx.pipeline.unshift({ $match: { tenantId: currentTenant } });
});
```

Mutating `ctx.pipeline` in a pre-hook changes what actually runs — the driver
call reads the pipeline from `ctx`, not from the original argument.

## When to use the escape hatch instead

`Model.aggregate()` always materializes the full result into memory. For a
**cursor** you want to stream or iterate lazily, or for aggregate options
Mongoat's typed surface doesn't expose, reach for the native collection:

```ts
const cursor = Order.getCollection().aggregate(pipeline, options); // native driver cursor
for await (const doc of cursor) {
  // stream results without loading them all at once
}
```

Calls made on that cursor bypass the hook pipeline and method gating — see
[Use the native escape hatch](/how-to/escape-hatch) for the full trade-off.

## See also

- [Use the native escape hatch](/how-to/escape-hatch) — the native cursor for
  streaming or unsupported options.
- [Batch writes with `bulkWrite`](/how-to/bulk-write) — the other non-`validity`
  gated method.
- [Reference](/api/) — `Model.aggregate`, `METHODS`.
