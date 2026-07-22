# Handle errors

This guide shows how to discriminate errors raised by Mongoat using the
`MongoatError` hierarchy, instead of matching on `.message` or `.name` of a
generic driver error.

## The error hierarchy

Every error Mongoat raises is an instance of `MongoatError`. Most are one of
its three subclasses — but a method-gating violation throws the base
`MongoatError` itself. Every one carries a stable `.code` string and
preserves the original error (if any) via `.cause`:

| Class                    | `.code` examples                                                   | Raised when                                                                                                                    |
| ------------------------ | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| `MongoatError` (base)    | `METHOD_NOT_ALLOWED`                                               | a method blocked by `allowedMethods`/`validity` was called — see [Why Proxy gating](/explanation/proxy-gating)                 |
| `MongoatValidationError` | `INVALID_OBJECT_ID`, `FORBIDDEN_OPERATOR`, `MODEL_CONFIG_CONFLICT` | invalid input (bad `ObjectId`), a forbidden query operator (`$where`), or a model re-registered with a different configuration |
| `MongoatConnectionError` | `NOT_CONNECTED`, `MISSING_DB_NAME`                                 | an operation was attempted before `db.connect()`, or no database name is configured                                            |
| `MongoatDriverError`     | `DUPLICATE_KEY`, `DRIVER_ERROR`                                    | wraps an error re-thrown by the native `mongodb` driver                                                                        |

Because the base class sits at the top of the hierarchy, an
`instanceof MongoatError` check catches **every** error above — subclasses
included — which is handy for a catch-all boundary.

## Discriminate by `instanceof` and `.code`

Import the subclass you care about and check it with `instanceof`; use
`.code` (not `.message`) to distinguish between specific cases within a
subclass — `.code` is stable across releases, `.message` is not:

```ts
import {
  MongoatDriverError,
  MongoatValidationError,
} from '@iamcalegari/mongoat';

try {
  await User.insert(doc);
} catch (err) {
  if (err instanceof MongoatDriverError && err.code === 'DUPLICATE_KEY') {
    // err.message is sanitized — no stack trace, no duplicated value
    // err.cause holds the original driver error, if you need to inspect it
  } else if (
    err instanceof MongoatValidationError &&
    err.code === 'INVALID_OBJECT_ID'
  ) {
    // malformed id passed to toObjectId()/findById()
  }
}
```

Never rely on `err.name === 'MongoError'` or on parsing `.message` as JSON —
that was the pre-v1.0 behavior and is no longer how Mongoat reports errors
(see the [migration guide](/migration) §2.1).

## Method-gating errors

A model restricted via `allowedMethods` (or the `validity: true` shorthand)
throws the base `MongoatError` with `code: 'METHOD_NOT_ALLOWED'` the moment a
blocked method is accessed — before the call even runs. Discriminate it on
the base class:

```ts
import { MongoatError } from '@iamcalegari/mongoat';

try {
  await Logs.delete({ _id: id }); // `delete` is not in this model's allowedMethods
} catch (err) {
  if (err instanceof MongoatError && err.code === 'METHOD_NOT_ALLOWED') {
    // this model is not allowed to run `delete`
  }
}
```

See [Why Proxy gating](/explanation/proxy-gating) for how the restriction is
enforced.

## `.cause` and sanitized messages

`MongoatDriverError.message` is always a short, stable string (e.g.
`"Duplicate key violation on index 'email_1'"`) — it never includes the
duplicated **value** or a raw stack trace. If you need the full original
driver error (including the duplicated value, when present), read
`err.cause`:

```ts
if (err instanceof MongoatDriverError) {
  console.error(err.message); // safe to log as-is
  console.error(err.cause); // original driver error, for debugging only
}
```

## Read methods reject — they don't throw synchronously

Calling a read method (`find`, `findMany`, `findById`, `total`, …) before
`db.connect()` **rejects** the returned `Promise` with a
`MongoatConnectionError` (`code: NOT_CONNECTED`) — it does not throw
synchronously. Always wrap the `await` in `try/catch` (or use `.catch()`):

```ts
try {
  const users = await User.findMany({});
} catch (err) {
  if (err instanceof MongoatConnectionError) {
    // db.connect() was never called, or the connection was closed
  }
}
```

A synchronous `try/catch` placed around an un-awaited call will not catch
this — the rejection only surfaces once the `Promise` is awaited or
`.catch()`'d.

## See also

- [Sanitize untrusted filters](/how-to/sanitize-filters) — where
  `FORBIDDEN_OPERATOR` comes from.
- [Why Proxy gating](/explanation/proxy-gating) — where `METHOD_NOT_ALLOWED`
  comes from.
- [Migration guide](/migration) §2.1, §2.2 — the alpha → v1.0 error-handling
  changes in full.
- [Reference](/api/) — `MongoatError`, `MongoatValidationError`,
  `MongoatConnectionError`, `MongoatDriverError`.
