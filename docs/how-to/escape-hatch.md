# Use the native escape hatch

This guide shows how to reach the raw `mongodb` driver objects underneath a
`Model` or `Database` — for operations Mongoat's typed API doesn't cover
(advanced aggregation pipelines, change streams, transactions on the raw
session, …) — and what you give up when you do.

Mongoat's core value is being a **thin** ODM: it never blocks access to the
native driver. These three getters are that promise made explicit.

## `model.getCollection()`

Returns the native `Collection<ModelType>` for a model, exactly as the
`mongodb` driver exposes it:

```ts
const rawCollection = User.getCollection(); // Collection<UserSchema> — native driver object

// e.g. a change stream, not covered by any Model method:
const changeStream = rawCollection.watch();
```

**This is a deliberate, total bypass**: calls made directly on the returned
`Collection` do **not** go through Mongoat's hook pipeline (`pre`/`post`
handlers registered via `User.pre(...)`/`User.post(...)` never fire for
them) and do **not** go through the `allowedMethods` Proxy gating — this
getter is never added to the `METHODS` enum, so there is no gate to pass in
the first place.

Fail-loud: calling `getCollection()` before `db.connect()` throws a
`MongoatConnectionError` (`"Database not connected — call db.connect()
first"`) — it never hands back an unusable `undefined`.

## `database.getClient()` and `database.getDb()`

`Database` itself is never wrapped in a Proxy (only `Model` instances are),
so these two getters are "escape total" by construction — there's no gating
to bypass, just raw driver objects:

```ts
const client = db.getClient(); // MongoClient | undefined — native driver object
const rawDb = db.getDb();      // Db | undefined — native driver object

const session = client?.startSession();
```

Both return `undefined` until `db.connect()` has resolved — check for that
before use, or rely on your own connection-lifecycle guard.

## The trade-off

Once you call any of these three getters, you've stepped outside the ODM's
safe zone: no hooks run, no method gating applies, no `$where` guard, no
`sanitizeFilter` — you're working directly against the driver, the same way
you would without Mongoat at all. That's intentional: Mongoat never wants to
be the reason an advanced driver feature is unreachable.

Legitimate reasons to reach for the escape hatch:

- Aggregation stages or options not exposed by `Model.aggregate()`.
- Change streams (`collection.watch()`).
- Raw driver operations outside the `METHODS` enum (e.g. `renameCollection`,
  `distinct`, bulk operations with driver-specific options).

If you find yourself reaching for it to bypass a hook or the method gating
on a *typed* Mongoat method just to get past a restriction, that's usually a
sign to reconsider the model's `allowedMethods` configuration instead of
reaching for the raw driver object every time.

## See also

- [Handle errors](/how-to/handle-errors) — `MongoatConnectionError` and the
  rest of the error hierarchy.
- [Register pre/post hooks](/how-to/hooks) — the pipeline that
  `getCollection()` bypasses.
- [Reference](/api/) — `Model.getCollection`, `Database.getClient`,
  `Database.getDb`.
