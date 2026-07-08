# Migration Guide — alpha → v1.0

Mongoat is currently published as **`1.0.34-alpha`**. The road to **v1.0.0**
intentionally introduces a number of breaking changes to stabilize the public API
before it is frozen under semantic versioning.

> **Status: living document.** v1.0.0 is not released yet. Sections tagged
> _(in progress)_ describe changes that are still landing and may shift slightly
> before the `v1.0.0-rc`. This guide is finalized before the RC. See
> [CHANGELOG.md](./CHANGELOG.md) for the full list of changes.

Each entry follows the same shape: **what changed**, **before**, **after**, and
**how to migrate**.

## Table of contents

1. [Hooks](#1-hooks)
2. [Errors](#2-errors)
3. [Input validation _(in progress)_](#3-input-validation-in-progress)
4. [Environment & build](#4-environment--build)

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
`this` with `ctx.document` (and read/mutate `ctx.options`, `ctx.filter`, etc.).

### 1.3 `post` hooks (new, non-breaking)

`post` hooks run after the driver call and receive the result via `ctx.result`.
They **observe** by default; returning a value transforms `ctx.result`.

```ts
User.post(METHODS.FIND, (ctx) => {
  // ctx.result is the found document (or null)
});
// opt-in fire-and-forget (errors go to onHookError, never propagate):
User.post(METHODS.INSERT, sendWelcomeEmail, { fireAndForget: true });
```

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
via `err.cause`) — do not parse it out of `.message`.

### 2.2 Read methods reject instead of throwing synchronously — **BREAKING**

Calling a read method before `db.connect()` now rejects the returned Promise
instead of throwing synchronously.

**How to migrate:** wrap `await` calls in `try/catch` (or `.catch()`); a synchronous
`try/catch` around the un-awaited call will no longer capture the error.

---

## 3. Input validation _(in progress)_

> Landing in Phase 3 (Blindagem). Documented here ahead of the RC; verify against
> your installed version.

### 3.1 `toObjectId` / `findById` throw on invalid input — **BREAKING** _(planned)_

`toObjectId(value)` will validate with `ObjectId.isValid` and throw
`MongoatValidationError` (`code: INVALID_OBJECT_ID`) for malformed input (bad
string, number, array). `findById` propagates this (it no longer silently searches
for a random/derived id). Calling `toObjectId()` with **no argument** still
generates a fresh `ObjectId` (unchanged).

**How to migrate:** validate/normalize ids at your input boundary, or catch
`MongoatValidationError` around `findById`.

### 3.2 `$where` is rejected unconditionally — **BREAKING** _(planned)_

Any filter containing `$where` (at any depth) is rejected with
`MongoatValidationError` (`code: FORBIDDEN_OPERATOR`) — it enables arbitrary
server-side JS execution. An opt-in `sanitizeFilter(filter)` utility is provided to
neutralize code-execution operators in untrusted input while preserving normal query
operators (`$gt`, `$in`, …).

**How to migrate:** stop passing `$where`; express the predicate with standard query
operators or `aggregate()`. For untrusted input, wrap it with `sanitizeFilter`.

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

### 4.3 `json-schema` runtime dependency removed (non-breaking)

Validation is server-side via `$jsonSchema`; the old `json-schema` runtime
dependency is gone. No action needed unless you imported it transitively.
