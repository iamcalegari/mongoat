# Handle errors

This guide shows how to discriminate errors raised by Mongoat using the
`MongoatError` hierarchy, instead of matching on `.message` or `.name` of a
generic driver error.

## The error hierarchy

Every error Mongoat raises is an instance of `MongoatError` or one of its
three subclasses. Each carries a stable `.code` string and preserves the
original error (if any) via `.cause`:

| Subclass | `.code` examples | Raised when |
|----------|-------------------|-------------|
| `MongoatValidationError` | `INVALID_OBJECT_ID`, `FORBIDDEN_OPERATOR` | invalid input (bad `ObjectId`) or a forbidden query operator (`$where`) |
| `MongoatConnectionError` | `NOT_CONNECTED`, `MISSING_DB_NAME` | an operation was attempted before `db.connect()`, or `dbName` is missing |
| `MongoatDriverError` | `DUPLICATE_KEY`, `DRIVER_ERROR` | wraps an error re-thrown by the native `mongodb` driver |

## Discriminate by `instanceof` and `.code`

Import the subclass you care about and check it with `instanceof`; use
`.code` (not `.message`) to distinguish between specific cases within a
subclass — `.code` is stable across releases, `.message` is not:

```ts
import { MongoatDriverError, MongoatValidationError } from '@iamcalegari/mongoat';

try {
  await User.insert(doc);
} catch (err) {
  if (err instanceof MongoatDriverError && err.code === 'DUPLICATE_KEY') {
    // err.message is sanitized — no stack trace, no duplicated value
    // err.cause holds the original driver error, if you need to inspect it
  } else if (err instanceof MongoatValidationError && err.code === 'INVALID_OBJECT_ID') {
    // malformed id passed to toObjectId()/findById()
  }
}
```

Never rely on `err.name === 'MongoError'` or on parsing `.message` as JSON —
that was the pre-v1.0 behavior and is no longer how Mongoat reports errors
(see the [migration guide](/migration) §2.1).

## `.cause` and sanitized messages

`MongoatDriverError.message` is always a short, stable string (e.g.
`"Duplicate key violation on index 'email_1'"`) — it never includes the
duplicated **value** or a raw stack trace. If you need the full original
driver error (including the duplicated value, when present), read
`err.cause`:

```ts
if (err instanceof MongoatDriverError) {
  console.error(err.message);      // safe to log as-is
  console.error(err.cause);        // original driver error, for debugging only
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
- [Migration guide](/migration) §2.1, §2.2 — the alpha → v1.0 error-handling
  changes in full.
- [Reference](/api/) — `MongoatError`, `MongoatValidationError`,
  `MongoatConnectionError`, `MongoatDriverError`.
