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
- [Handle errors](/how-to/handle-errors) — the `MongoatError` hierarchy,
  including `METHOD_NOT_ALLOWED`.
- [Reference](/api/) — `Model`, `METHODS`, `ModelSetup`.
