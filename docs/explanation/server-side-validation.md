# Server-side validation

## Why server-side, not client-side

Mongoat validates documents by handing MongoDB a `$jsonSchema` validator,
applied to the collection itself — it does not run its own client-side
validation pass before a write. That's a deliberate choice, not a missing
feature. Client-side validation only protects writes that happen to go
through Mongoat; a `$jsonSchema` validator attached to the collection is
enforced by the MongoDB server itself, for **every** write from **any**
client — another service, a migration script, `mongosh`, a teammate's ad hoc
tool. Server-side validation is the single source of truth for what a
document in that collection is allowed to look like, independent of which
code path produced the write.

This also keeps Mongoat's dependency footprint minimal: no client-side
schema-validation library to bundle, version and keep in sync with what the
server actually enforces — one schema, enforced in one place.

## How Mongoat builds the validator

When you construct a `Model` with a `schema`, `schemaValidatorBuilder`
(private to `Model`) turns it into the shape MongoDB's `$jsonSchema`
validator expects:

1. **Clone the schema.** The schema object is `structuredClone`d before
   anything else touches it. Schemas are often declared once and reused
   across models or modules; mutating the caller's own object in place would
   leak changes back to code that never asked for them.
2. **Inject `_id`.** Every validator gets an `_id: { bsonType: 'objectId' }`
   property and `_id` added to `required`, so the schema you write only
   needs to describe your own fields.
3. **Force `additionalProperties: false`, recursively.** MongoDB does not
   default to rejecting unknown properties — a schema without
   `additionalProperties: false` would silently accept extra fields nobody
   declared. Mongoat walks the schema (including nested `properties` and
   array `items`) and sets `additionalProperties: false` at every object
   level that doesn't already specify it, so an unlisted field is rejected
   wherever it appears in the document, not just at the top level.
4. **Merge in `validationQueryExpressions`**, if provided, alongside the
   `$jsonSchema` key — for validation rules expressed as MongoDB query
   operators rather than JSON Schema keywords.

The result — `{ validationAction: 'error', validationLevel: 'strict',
validator: { $jsonSchema: {...} } }` — is stored on the `Model` instance and
applied by `Database`, never evaluated in application code.

## How it's applied: `collMod`, not an in-process check

`Database.setupCollection()` (invoked by `setupCollections()` for every
registered model) calls `setupValidators()`, which runs:

```ts
await this[kDb]?.command({
  collMod: model.collectionName,
  validator: model.validator,
  validationAction: model.validationAction,
  validationLevel: model.validationLevel,
});
```

`collMod` is a MongoDB administrative command that attaches the validator to
the collection itself, at the database level. From that point on, `insert`,
`update`, `insertMany`, `bulkWrite` — issued by Mongoat, by the raw driver
through the [escape hatch](/how-to/escape-hatch), or by anything else
talking to that collection — are checked by the MongoDB server against the
same schema. Mongoat's CRUD methods never run a parallel "does this match
the schema" check in JavaScript before calling the driver; the server is the
only validator, which is exactly why the guarantee holds regardless of which
client made the write.

## Trade-off vs. client-side validation

Client-side validation libraries (e.g. `class-validator`-style decorators)
are explicitly out of scope for Mongoat. The trade-off:

- **No duplicated logic.** The schema is defined once, as `$jsonSchema`, and
  is the same artifact enforced by the server — there's no second
  client-side copy of the rules that can drift out of sync with it.
- **No extra dependency.** Consistent with the thin-ODM
  [minimal-dependencies philosophy](/explanation/thin-odm-philosophy) — no
  validation engine bundled beyond what the MongoDB driver already ships.
- **Coverage that isn't tied to the ODM.** Because enforcement lives on the
  collection, it protects every write path, not only the ones that happen
  to go through a `Model` method.
- **What you give up:** validation errors surface as a MongoDB server error
  on write (wrapped by Mongoat's error hierarchy — see
  [Handle errors](/how-to/handle-errors)) rather than as an immediate,
  synchronous, field-level client-side error before any network round-trip.
  For an app that wants pre-submission form validation, that's a
  complementary concern layered on top of — not a replacement for — the
  server-side guarantee Mongoat provides.

## See also

- [Define indexes & validation](/how-to/indexes-validation) — the
  how-to for declaring a `schema` and enabling `validity: true`.
- [Why Proxy gating](/explanation/proxy-gating) — the other mechanism
  `validity: true` also configures (`allowedMethods`).
- [Handle errors](/how-to/handle-errors) — how validation failures surface
  through the `MongoatError` hierarchy.
- [Reference](/api/) — `ModelValidationSchema`, `ModelDbValidationProps`.
