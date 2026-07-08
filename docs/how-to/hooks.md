# Register pre/post hooks

This guide shows how to register `pre` and `post` hooks on a `Model` to
transform data before a driver call and observe (or fire-and-forget side
effects) after it.

## The `ctx` signature

Hooks receive a single `ctx` object — they are **not** bound to the document
via `this`. `ctx` exposes different fields depending on the method being
hooked (`ctx.document` for `insert`, `ctx.filter`/`ctx.update` for `update`,
`ctx.result` for post-hooks, plus `ctx.options`, `ctx.model` and `ctx.method`
on every call):

```ts
import { METHODS } from '@iamcalegari/mongoat';

User.pre(METHODS.INSERT, (ctx) => {
  ctx.document.mail = ctx.document.mail.toLowerCase();
});
```

Mutating `ctx.document`/`ctx.filter`/`ctx.update`/`ctx.options` in a pre-hook
changes what actually reaches the driver — the pipeline reads its arguments
from `ctx`, not from the original method call.

## Hooks accumulate

Calling `.pre()`/`.post()` more than once for the same method **appends**
handlers — it does not replace a previously registered one. All of them run,
in registration order:

```ts
User.pre(METHODS.INSERT, addTimestamps);
User.pre(METHODS.INSERT, normalizeEmail); // both run, in this order
```

## Post-hooks and `fireAndForget`

`post` hooks run after the driver call and receive the result via
`ctx.result`. By default they **observe** — errors thrown inside a post-hook
propagate to the caller, same as a pre-hook:

```ts
User.post(METHODS.FIND, (ctx) => {
  console.log('Found:', ctx.result);
});
```

Opt in to `fireAndForget: true` for side effects (e.g. sending an email)
whose errors should never block or reject the original call. Rejections from
a `fireAndForget` hook are routed to `onHookError` instead of propagating:

```ts
User.post(
  METHODS.INSERT,
  async (ctx) => {
    await sendWelcomeEmail(ctx.result);
  },
  { fireAndForget: true }
);
```

`onHookError` can be configured per model via `new Model({ ..., onHookError })`;
when omitted it falls back to `console.error`, so a fire-and-forget failure is
never swallowed in total silence.

## Recursion guard

A hook that calls another method on the **same** model (or an internal
delegation, like `findById` calling `find` internally) does not re-enter that
method's own hook pipeline — Mongoat tracks this per model instance, so
hooks never loop back on themselves.

## See also

- [Getting started](/tutorials/getting-started) — where `User.pre(...)` is
  first introduced.
- [Reference](/api/) — `HookFn`, `HookConfig` and the full `Model` API.
