# Document defaults & timestamps

This guide shows how `documentDefaults` fills in fields on inserted documents,
the one footgun to avoid with it, and how to add real per-operation timestamps
(which Mongoat deliberately does **not** manage for you).

## `documentDefaults` merges into every insert

Give a model a `documentDefaults` object and its fields are merged into every
document you insert — via `insert`, `insertMany`, and the `insertOne`
operations of `bulkWrite`. Each document gets a **deep clone** of the defaults,
so nested objects are never shared between documents or with the model:

```ts
const User = new Model<UserSchema>({
  collectionName: 'users',
  schema,
  validity: true,
  documentDefaults: {
    role: 'member',
    preferences: { newsletter: false },
  },
});

await User.insert({ username: 'a', mail: 'a@x.com' /* … */ });
// stored document also has role: 'member', preferences: { newsletter: false }
```

Fields you pass in the document **win** over the defaults — the defaults are
applied first, then your document is spread on top:

```ts
await User.insert({ username: 'b', role: 'admin' /* … */ });
// role: 'admin' — your value overrides the default
```

The merge happens **before** pre-hooks run, so a `METHODS.INSERT` pre-hook sees
`ctx.document` already merged with the defaults.

## The footgun: defaults are evaluated once, at construction

`documentDefaults` is a plain object, evaluated when you build it — **once**,
as the model is constructed. A value like `new Date()` is therefore frozen at
that single moment and reused for every insert:

```ts
// ⚠️ every inserted document gets the SAME insertedAt — the instant the
// model was constructed, not the instant of each insert
documentDefaults: {
  insertedAt: new Date(),
}
```

Use `documentDefaults` for **static** values (a default role, a feature flag, a
fixed nested shape). For anything that must be computed **per operation** — a
timestamp, a generated id, a value derived from the document — use a hook.

## Per-insert timestamps: use a pre-hook

A pre-hook runs on every call, so it produces a fresh value each time — the
correct way to stamp `insertedAt` per document.

One typing detail: `insertedAt`/`updatedAt` are **not** part of your model's
own interface — they live in `DefaultProperties`, surfaced through the
`SchemaWithDefaults<T>` helper. So `ctx.document`, typed to your own fields,
doesn't expose them directly; cast to `SchemaWithDefaults<YourSchema>` to set
them:

```ts
import { METHODS, SchemaWithDefaults } from '@iamcalegari/mongoat';

User.pre(METHODS.INSERT, (ctx) => {
  (ctx.document as SchemaWithDefaults<UserSchema>).insertedAt = new Date();
});
```

For `updatedAt` on writes, set it in the update itself (`$currentDate` stamps
it server-side), or in a `METHODS.UPDATE` pre-hook that mutates `ctx.update`:

```ts
await User.update(
  { _id: id },
  { $set: { firstName: 'John' }, $currentDate: { updatedAt: true } }
);
```

## Mongoat does not auto-manage timestamps

There is no hidden `insertedAt`/`updatedAt` injection: Mongoat never adds
timestamp fields you didn't ask for. The `DefaultProperties` type
(`insertedAt`/`updatedAt`) and the `SchemaWithDefaults<T>` helper only describe
these fields in the **types** — so the value returned by `insert()` is typed as
carrying them — they do not populate the values at runtime. You own that,
through `documentDefaults` (static) or hooks (dynamic). This is the thin-ODM
stance: no timestamp machinery you can't see or turn off — see
[The thin ODM philosophy](/explanation/thin-odm-philosophy).

If you list `insertedAt`/`updatedAt` in your `schema` with `validity: true`
server-side validation on, remember MongoDB will enforce them — so make sure a
default or a hook actually sets them, or inserts that omit them will be
rejected.

## See also

- [Register pre/post hooks](/how-to/hooks) — the per-operation hook the
  timestamp pattern relies on.
- [Define indexes & validation](/how-to/indexes-validation) — declaring
  `insertedAt`/`updatedAt` in the `$jsonSchema`.
- [Reference](/api/) — `CreateModelProps.documentDefaults`, `DefaultProperties`,
  `SchemaWithDefaults`.
