# Migration guide — alpha → 1.1.0

Mongoat **1.1.0** is the first stable release, published on npm under the
`latest` dist-tag. It introduces a number of breaking changes relative to the
`1.0.x-alpha` line (now deprecated on the registry) to stabilize the public API
under semantic versioning.

> **This page is the consolidated, published version of the migration guide.**
> It merges [`MIGRATION.md`](https://github.com/iamcalegari/mongoat/blob/main/MIGRATION.md)
> and the `[1.1.0]` section of
> [`CHANGELOG.md`](https://github.com/iamcalegari/mongoat/blob/main/CHANGELOG.md)
> from the repository root into a single, navigable guide. Those root files remain
> the editable source of truth during development — this site renders the
> up-to-date, publish-ready copy.

> **Status: final.** This guide covers the complete alpha → 1.1.0 migration.

Each entry follows the same shape: **what changed**, **before**, **after**, and
**how to migrate**.

## Table of contents

1. [Hooks](#1-hooks)
2. [Errors](#2-errors)
3. [Input validation](#3-input-validation)
4. [Environment & build](#4-environment-build)
5. [API surface](#5-api-surface)

---

## 1. Hooks

### 1.1 Hooks now accumulate instead of replacing — **BREAKING**

`pre()` and `post()` now **append** handlers. Registering a second hook for the
same method no longer overwrites the first — both run, in registration order.

**Before** (one handler per method; re-registering replaced it):

```ts
User.pre(METHODS.INSERT, addTimestamps); // replaced any previous INSERT pre-hook
```

**After** (handlers accumulate):

```ts
User.pre(METHODS.INSERT, addTimestamps);
User.pre(METHODS.INSERT, normalizeEmail); // BOTH run, in this order
```

**How to migrate:** remove duplicate registrations you previously relied on being
overwritten. There is no longer a "reset by registering a no-op" idiom — register
only the hooks you actually want.

### 1.2 Explicit `ctx` hook signature — **BREAKING**

Hook functions receive a single explicit **context object** instead of being bound
to the document via `this`.

**Before** (`this`-bound, options as argument):

```ts
User.pre(METHODS.INSERT, function (options) {
  this.createdAt = new Date(); // `this` was the document
});
```

**After** (`ctx` object):

```ts
User.pre(METHODS.INSERT, (ctx) => {
  ctx.document.createdAt = new Date();
  // ctx also exposes: ctx.options, ctx.filter, ctx.update, ctx.model, ctx.method
});
```

**How to migrate:** convert each hook to an arrow/one-arg function and replace
`this` with `ctx.document` (and read/mutate `ctx.options`, `ctx.filter`, etc.). See
the [hooks how-to guide](/how-to/hooks) for the full registration API.

### 1.3 `post` hooks and `fireAndForget` (new, non-breaking)

`post` hooks run after the driver call and receive the result via `ctx.result`.
They **observe** by default; returning a value transforms `ctx.result`. An opt-in
`fireAndForget` option runs a `post` hook without blocking the caller — its
rejections are routed to an optional `onHookError` callback instead of
propagating.

```ts
User.post(METHODS.FIND, (ctx) => {
  // ctx.result is the found document (or null)
});
// opt-in fire-and-forget (errors go to onHookError, never propagate):
User.post(METHODS.INSERT, sendWelcomeEmail, { fireAndForget: true });
```

Nothing to migrate here — this is additive. See the
[hooks how-to guide](/how-to/hooks) for details.

---

## 2. Errors

### 2.1 Typed error hierarchy — **BREAKING**

Errors raised by Mongoat are now instances of `MongoatError` or one of its
subclasses, each with a stable `.code` string and a preserved `.cause`. Previously
errors were re-thrown as the driver's `MongoError` with a `JSON.stringify(err)`
message (which lost the stack and, for generic errors, produced `"{}"`).

| Subclass | `.code` examples | Raised when |
|----------|------------------|-------------|
| `MongoatValidationError` | `INVALID_OBJECT_ID`, `FORBIDDEN_OPERATOR` | invalid input / forbidden query operator |
| `MongoatConnectionError` | `NOT_CONNECTED` | operation before `db.connect()` |
| `MongoatDriverError` | `DUPLICATE_KEY`, `DRIVER_ERROR` | wraps an error from the native driver |

**Before:**

```ts
try {
  await User.insert(doc);
} catch (err) {
  if (err.name === 'MongoError') { /* … */ }      // brittle
  console.error(JSON.parse(err.message));          // message was JSON
}
```

**After:**

```ts
import { MongoatDriverError, MongoatValidationError } from '@iamcalegari/mongoat';

try {
  await User.insert(doc);
} catch (err) {
  if (err instanceof MongoatDriverError && err.code === 'DUPLICATE_KEY') {
    // err.message is sanitized (no duplicated value, no stack)
    // err.cause is the original driver error, if you need the raw details
  }
}
```

**How to migrate:** replace `err.name === 'MongoError'` / message parsing with
`instanceof` checks against the exported subclasses, or switch on `err.code`.
Duplicate-key messages no longer include the duplicated **value** (it is available
via `err.cause`) — do not parse it out of `.message`. See the
[handle errors how-to guide](/how-to/handle-errors) for the full pattern.

### 2.2 Read methods reject instead of throwing synchronously — **BREAKING**

Calling a read method before `db.connect()` now rejects the returned Promise
instead of throwing synchronously.

**Before:**

```ts
try {
  const doc = User.findById(id); // threw synchronously if not connected
} catch (err) {
  /* … */
}
```

**After:**

```ts
try {
  const doc = await User.findById(id); // rejects the Promise instead
} catch (err) {
  /* … */
}
```

**How to migrate:** wrap `await` calls in `try/catch` (or `.catch()`); a synchronous
`try/catch` around the un-awaited call will no longer capture the error.

---

## 3. Input validation

### 3.1 `toObjectId` / `findById` throw on invalid input — **BREAKING**

`toObjectId(value)` will validate with `ObjectId.isValid` and throw
`MongoatValidationError` (`code: INVALID_OBJECT_ID`) for malformed input (bad
string, number, array). `findById` propagates this (it no longer silently searches
for a random/derived id). Calling `toObjectId()` with **no argument** still
generates a fresh `ObjectId` (unchanged).

**Before** (malformed id silently produced a fresh/derived `ObjectId`):

```ts
await User.findById('not-an-id'); // resolved with null (or unexpected doc)
```

**After** (malformed id rejects):

```ts
try {
  await User.findById('not-an-id');
} catch (err) {
  // err instanceof MongoatValidationError, err.code === 'INVALID_OBJECT_ID'
}
```

**How to migrate:** validate/normalize ids at your input boundary, or catch
`MongoatValidationError` around `findById`.

### 3.2 `$where` is rejected unconditionally + opt-in `sanitizeFilter` — **BREAKING**

Any filter containing `$where` (at any depth) is rejected with
`MongoatValidationError` (`code: FORBIDDEN_OPERATOR`) — it enables arbitrary
server-side JS execution. An opt-in `sanitizeFilter(filter)` utility is provided to
neutralize the code-execution operators (`$where`, `$function`, `$accumulator`) at
any depth in untrusted input — including nested inside `$expr`, `$and`/`$or`/`$nor`
or arrays — while preserving normal query operators (`$gt`, `$in`, …).

**Before:**

```ts
await User.findMany({ $where: 'this.age > 18' }); // executed server-side JS
```

**After:**

```ts
import { sanitizeFilter } from '@iamcalegari/mongoat';

await User.findMany({ $where: 'this.age > 18' }); // throws MongoatValidationError

// for untrusted input you still want to accept broadly, sanitize first:
await User.findMany(sanitizeFilter(untrustedFilter));
```

**How to migrate:** stop passing `$where`; express the predicate with standard query
operators or `aggregate()`. For untrusted input, wrap it with `sanitizeFilter`. See
the [sanitize untrusted filters how-to guide](/how-to/sanitize-filters).

---

## 4. Environment & build

### 4.1 Minimum Node.js 20.19 / 22.12 — **BREAKING**

`engines` is now `^20.19.0 || >=22.12.0` (was `>=16.20.1`). Node 16/18 are no longer
supported.

**How to migrate:** upgrade your runtime/CI to Node 20 or 22.

### 4.2 Subpath exports removed — **BREAKING**

Import everything from the package root; the `./database`, `./model`, `./utils`,
`./types` subpaths were removed.

**Before:** `import { Model } from '@iamcalegari/mongoat/model';`
**After:** `import { Model } from '@iamcalegari/mongoat';`

**How to migrate:** replace every subpath import with a root import. See the
[Reference](/api/) for the full list of exports available from the package root.

### 4.3 `json-schema` runtime dependency removed (non-breaking)

Validation is server-side via `$jsonSchema`; the old `json-schema` runtime
dependency is gone. No action needed unless you imported it transitively.

---

## 5. API surface

### 5.1 `Database.defineModel()` and `Model.create()` removed — **BREAKING**

The deprecated `Database.defineModel()` and `Model.create()` factory methods have
been removed. `new Model(...)` has been the canonical registration API since the
alpha line — it already covers the same behavior (config reuse for an identical
collection, `MongoatError` on divergent re-registration, `allowedMethods` Proxy
gating).

**Before:**

```ts
const User = Database.defineModel<User>({
  collectionName: 'users',
  schema,
  allowedMethods: [METHODS.FIND, METHODS.INSERT],
});

// or
const User = Model.create<User>({
  collectionName: 'users',
  schema,
  allowedMethods: [METHODS.FIND, METHODS.INSERT],
});
```

**After:**

```ts
const User = new Model<User>({
  collectionName: 'users',
  schema,
  allowedMethods: [METHODS.FIND, METHODS.INSERT],
});
```

**How to migrate:** replace every `Database.defineModel(...)`/`Model.create(...)`
call with `new Model(...)` passing the same properties object — the shape of the
config object is unchanged.
