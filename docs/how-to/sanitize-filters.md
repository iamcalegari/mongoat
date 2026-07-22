# Sanitize untrusted filters

This guide shows how to defend against MongoDB query injection when a filter
comes from untrusted input (an HTTP query string, a request body, …) — and how
that's different from the unconditional `$where` guard that's always on.

## `sanitizeFilter` is opt-in

`sanitizeFilter(filter)` is **not** called automatically by any `Model`
method. You apply it explicitly to untrusted input before passing the result
to a query method:

```ts
import { sanitizeFilter } from '@iamcalegari/mongoat';

const safeFilter = sanitizeFilter(req.query); // opt-in — no Model method calls this on its own
const users = await User.findMany(safeFilter);
```

It's opt-in on purpose: automatic, aggressive sanitization of every filter
would break legitimate queries built from trusted, in-code operators. Reach
for `sanitizeFilter` specifically at the boundary where a filter originates
from data you don't control.

## What it neutralizes

`sanitizeFilter` always strips the operators that execute arbitrary
JavaScript on the MongoDB server — `$where`, `$function`, `$accumulator` — at
**any depth** in the filter (including nested inside `$and`/`$or`/`$nor`,
arrays, or `$expr`). Normal query operators are preserved unchanged, at any
depth: `$gt`, `$in`, `$and`, `$or`, and so on — so the result is still a
usable filter, not an empty object.

By default (`stripUnknownTopLevel: true`) it also removes any **top-level**
key starting with `$` that isn't a known query operator (`$and`, `$or`,
`$nor`, `$expr`, `$text`, `$comment`, `$jsonSchema`) — this catches classic
query-selector injection, e.g. a field value maliciously replaced with
`{ $ne: null }` at the top level. Disable this specific check via
`{ stripUnknownTopLevel: false }` if you need to allow other top-level `$`
keys; the code-execution operators above are still removed unconditionally
either way.

`sanitizeFilter` never mutates the filter you pass in — it always returns a
new, sanitized object.

## The `$where` guard is unconditional and separate

Independently of whether you called `sanitizeFilter`, every `Model` method
that accepts a `filter` (`find`, `findMany`, `update`, `updateMany`, `delete`,
`deleteMany`, `total`) rejects any filter containing `$where` — at any
depth — with a `MongoatValidationError` whose `.code` is `FORBIDDEN_OPERATOR`:

```ts
import { MongoatValidationError } from '@iamcalegari/mongoat';

try {
  await User.findMany({ $where: 'this.password.length > 0' });
} catch (err) {
  if (
    err instanceof MongoatValidationError &&
    err.code === 'FORBIDDEN_OPERATOR'
  ) {
    // $where is rejected unconditionally — this can't be turned off
  }
}
```

This guard is **always on and cannot be disabled** — there is no option to
allow `$where` through. `$where` executes arbitrary JavaScript on the server
and has no defensible legitimate use in a data-access library. This is why
`sanitizeFilter` also strips `$where` on its own: the two checks overlap on
that one operator by design, but they're independent — the guard above
applies even if you skip `sanitizeFilter` entirely.

See [Handle errors](/how-to/handle-errors) for more on discriminating
`MongoatValidationError` and its `.code`.

## See also

- [Handle errors](/how-to/handle-errors) — the `MongoatError` hierarchy and
  `.code` values, including `FORBIDDEN_OPERATOR`.
- [Register pre/post hooks](/how-to/hooks) — transforming data before it
  reaches the driver.
- [Reference](/api/) — `sanitizeFilter`, `SanitizeFilterOptions`.
