---
'@iamcalegari/mongoat': minor
---

Close bypasses of the model registry's config guard and the `allowedMethods` gate — behaviors the documentation already described as guaranteed, so anyone relying on the old, unguarded paths was relying on a defect rather than a contract.

**Hook calls are gated too.** `ctx.model`, handed to every hook, is now the same registered object an external caller gets, not the raw instance. A hook that calls a method outside the model's `allowedMethods` now throws the exact same error an external call would: `The method "<method>" is not allowed in "<collectionName>"`, with `code: 'METHOD_NOT_ALLOWED'`. Code that relied on `ctx.model` silently bypassing this check will start seeing that throw.

**Divergence detection covers more of the config, and names what diverges.** Re-registering a `collectionName` with a different `onHookError` reference or a different decorated schema class now throws — both used to escape comparison entirely. The thrown error also names every divergent property instead of a generic message, without leaking either side's value.

**Re-registering the same reference is no longer rejected.** Re-registering the exact same decorated schema class, or the exact same plugin list in the exact same order, now reuses the existing model instead of throwing — the previous behavior forced workarounds to avoid constructing a model twice for an already-loaded class. This acceptance is by reference identity, not structural comparison: it covers the class or plugin references already loaded in memory, not a module re-evaluated from disk, and it does not extend to hooks passed directly via `props.hooks`, which still always throw on re-registration.

**The public `registerModel()` method is guarded too.** Calling `Database#registerModel()` manually with an occupied `collectionName` now refuses a candidate whose config diverges, or that carries any hook, instead of silently replacing the registered entry.
