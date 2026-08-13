# Why Proxy gating

## The problem

Not every method makes sense for every model. A `logs` collection might only
ever need `insert` and `find` — allowing `delete` on it could be a bug
waiting to happen, or a capability you deliberately don't want a given part
of the codebase to reach for. Mongoat lets you restrict a model's method
surface via `allowedMethods` (or the `validity: true` shorthand, which
resolves to the standard CRUD subset — see
[Define indexes & validation](/how-to/indexes-validation)). The question this
page answers is: how is that restriction actually enforced, and why this
particular mechanism?

## The mechanism: `KModelProxyHandler`

Every `Model` instance is wrapped in a `Proxy` the moment it's constructed —
this happens once, inside `Database.registerModel()`, which every
`new Model(...)` call goes through. The handler's `get` trap runs on every
property access on that model:

```ts
static [KModelProxyHandler]() {
  return {
    get(target, prop, receiver) {
      if (
        target.methods.includes(prop) &&
        !target.allowedMethods.includes(prop)
      ) {
        throw new MongoatError(
          `The method "${prop}" is not allowed in "${target.collectionName}"`,
          { code: 'METHOD_NOT_ALLOWED' }
        );
      }

      const value = Reflect.get(target, prop, receiver);

      if (typeof value === 'function') {
        return value.bind(target);
      }

      return value;
    },
  };
}
```

`target.methods` is the full list of CRUD method names (every value of the
`METHODS` enum); `target.allowedMethods` is the subset a given model was
configured with. If the property being accessed is a gated method name that
isn't in `allowedMethods`, the trap throws before the method is even
reached — the caller never gets a reference to a function it isn't allowed
to call, let alone a chance to invoke it.

## Design detail: binding to `target`, never to `receiver`

Notice the trap binds the resolved function to `target` (the raw, unwrapped
`Model` instance) — never to `receiver` (the `Proxy` itself). This matters
more than it looks: `Model` methods call other methods and private helpers
on `this` internally (`findById` delegates to `find`, every public method
calls `getCollectionOrThrow`, hook dispatch reads `this.hooks`, …). If those
internal calls bound to `receiver`, each `this.xxx` access inside a method
would **re-enter the Proxy trap** — turning implementation details into
extra (and incorrect) gating checks, since internal helpers were never meant
to be checked against `allowedMethods` in the first place. Binding to
`target` keeps the trap's job scoped to exactly one thing: the boundary
between the outside caller and the model, checked exactly once.

## Hook calls go through the same gate

Binding to `target` (above) is about internal delegation — one method on a
`Model` calling another. A hook is different: it's dev-provided code that
runs mid-pipeline and receives `ctx.model` as one of the fields on `ctx`. Is
that a way around the gate?

It isn't. `ctx.model` holds the same registered `Proxy` an external caller
gets, not the raw `target`. A call made through it is checked by the exact
same `get` trap, so a hook reaching for a method outside `allowedMethods`
gets the same `METHOD_NOT_ALLOWED` error an external caller would:

```ts
User.pre(METHODS.INSERT, async (ctx) => {
  // Throws MongoatError({ code: 'METHOD_NOT_ALLOWED' }) if 'total' isn't
  // in this model's allowedMethods — same as calling User.total() from
  // outside.
  await ctx.model.total();
});
```

A call to a method that IS in `allowedMethods` still runs in "raw" mode: it
does not re-enter that method's own hook pipeline, the same recursion guard
that already applies to internal delegation (`findById` calling `find`, for
example). The gate and the recursion guard are two independent mechanisms
that happen to both apply to the same call.

**Known limit: plugin `setup()`.** The object a plugin's `setup()` function
receives is the raw, un-gated instance — not the registered `Proxy`. The
gated object is created during registration, and plugins run as part of
building a model, before that model is registered. A plugin that keeps a
reference to what `setup()` handed it, and calls a CRUD method on that
reference later, bypasses the gate the same way `ctx.model` used to. Closing
this would mean registering the model before applying its plugins — a
different construction order than the one in place today, out of scope for
the fix described here.

## Re-registering the same class is not the same as recompiling it

Re-registering a `collectionName` with a config that has drifted from what's
already stored is rejected — that's the model registry's own concern, not
this page's. What belongs here is a narrower case: a schema class decorated
with `@Pre`/`@Post` gets re-evaluated (a module re-imported, a test file
re-run) and constructs a `Model` again with the _same_ decorated class.

That case is accepted, and returns the already-registered instance, when the
candidate's decorated class is the exact same object reference as the one
first registered — proof that the hooks attached to it are the same
functions, not merely functions that look alike. A different class
reference is always rejected, even if it compiles to an identical validator
and declares hooks with an identical body: structural similarity is never
accepted as a substitute for reference identity, because two different
functions that happen to read the same source can still close over
different state.

This acceptance has a declared edge: it covers the class reference already
loaded in memory, not a module reevaluated from disk. Reloading the module
that defines the schema class produces a _new_ class object — a new
reference — even if every line of source is unchanged, and that new
reference is rejected exactly like any other divergent candidate.

The acceptance is also asymmetric. Hooks passed directly through
`props.hooks` — the plain-object registration form, not a decorated class —
always reject a re-registration, with no identity path that lets them
through. The registered instance's hook list is the already-merged union of
hooks from every origin (declared, decorated, plugin-registered); once
merged, there is no record of which hook came from which origin, so there is
nothing left to compare a `props.hooks` candidate against by reference.

## Why Proxy — and not subclasses or manual checks

An alternative design would be to check `allowedMethods` by hand at the top
of every CRUD method (`if (!this.allowedMethods.includes(METHODS.DELETE))
throw …`), or to generate a subclass per allowed-method configuration.
Mongoat uses a `Proxy` instead, for a few reasons:

- **One centralized check, not twelve duplicated ones.** Every gated method
  goes through the same `get` trap. Adding a thirteenth CRUD method later
  doesn't require remembering to add a new guard clause to it — the trap
  already covers it as long as it's registered in the `METHODS` enum.
- **Transparent to the caller.** From the outside, a gated `Model` still
  looks and behaves like a plain `Model` — same shape, same method names,
  same call syntax. The gating is enforced at the property-access boundary,
  not by presenting a visibly different type per configuration.
- **No pollution of method bodies.** CRUD methods stay focused on their own
  logic (hooks, validation, driver calls); authorization is a cross-cutting
  concern handled once, outside of them, which is exactly the problem
  `Proxy` traps are designed to solve.

This is a deliberate architectural choice (see the project's Proxy-based
architecture constraint) — the gating and the model registry are meant to
stay Proxy-based rather than migrate to per-configuration subclasses or
scattered manual checks.

## See also

- [Define indexes & validation](/how-to/indexes-validation) — configuring
  `allowedMethods` and `validity: true` on a model.
- [Register pre/post hooks](/how-to/hooks) — where `ctx.model` is
  introduced.
- [Handle errors](/how-to/handle-errors) — the `MongoatError` hierarchy,
  including `METHOD_NOT_ALLOWED`.
- [Reference](/api/) — `Model`, `METHODS`, `ModelSetup`.
