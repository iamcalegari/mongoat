# The thin ODM philosophy

Mongoat's core value is to give you the productivity of an ODM **without**
giving up control of, or direct access to, the native MongoDB driver. Every
design decision in this library is a consequence of that one sentence — this
page is about the "why" behind it; the how-to guides and the reference cover
the "how".

## What "thin" means in practice

Most ODMs earn their productivity by hiding the underlying driver: they
introduce their own query language, their own connection abstraction, their
own options objects that only partially map to what the database actually
supports. That trade works, but it has a cost — the day you need a driver
feature the ODM didn't think to wrap, you're stuck, forking the library or
dropping down to raw queries anyway, in an API that's now unfamiliar because
you never needed it before.

Mongoat takes the opposite bet. Being "thin" means:

- **Minimal runtime dependencies.** The library depends on `mongodb` and
  `bson` — the official driver and its serialization layer — and nothing
  else. No query builder, no validation engine, no schema library
  reimplementing what MongoDB itself already does.
- **Native types and options everywhere.** `Model` methods accept and return
  the driver's own types (`FindOptions`, `UpdateFilter<ModelType>`,
  `BulkWriteOptions`, …). There's no Mongoat-specific options dialect to
  learn on top of the driver's — the options you pass to `Model.find()` are
  the same shape you'd pass to `Collection.findOne()`, because internally
  that's exactly where they end up.
- **Preferring driver-native features over reimplementing them.** Indexes,
  aggregation, bulk writes, sessions/transactions — Mongoat wires these
  through to the driver rather than growing parallel abstractions for
  concepts the driver already models well.

## The escape hatch as first-class citizen

The clearest expression of "thin" is that the driver is never locked away.
`Model.getCollection()` and `Database.getClient()`/`Database.getDb()` hand
back the driver's own `Collection`, `MongoClient` and `Db` objects, with no
asterisk — see [Use the native escape hatch](/how-to/escape-hatch) for the
full trade-off. These aren't a "backdoor" bolted on as an afterthought; they
are as much a part of the public API as `insert()` or `find()`. A Mongoat
user is never more than one method call away from the plain driver, for
whatever the typed surface doesn't (yet) cover — change streams, exotic
aggregation stages, raw sessions.

That single design choice is also why Mongoat can stay minimal elsewhere: it
doesn't need to anticipate and wrap every driver capability up front,
because falling back to the driver is always a legitimate, supported path —
not a failure of the abstraction.

## Thin, not thoughtless

"Thin" does not mean "no opinions". Mongoat still adds real value on top of
the driver — [pre/post hooks](/how-to/hooks),
[method gating via Proxy](/explanation/proxy-gating),
[server-side `$jsonSchema` validation](/explanation/server-side-validation),
and injection-safety guards
([`sanitizeFilter`](/how-to/sanitize-filters), the `$where` block, the
sanitized `MongoatError` hierarchy — see
[Handle errors](/how-to/handle-errors)). The distinction is _how_ that value
is added: as a layer that sits transparently on top of the driver and can
always be bypassed, never as a wall that replaces it.

## Contrast with "thick" ODMs

Heavier ODMs typically optimize for never having to look at the driver
again: they abstract away connections, sessions and even query semantics
behind their own vocabulary. That can be convenient for the common path, but
it makes the uncommon path — the driver feature the ODM didn't anticipate —
expensive or impossible. Mongoat optimizes for the opposite property: the
common path is still convenient (typed CRUD, hooks, validation, injection
guards), but the uncommon path is always exactly one native call away,
because the ODM was never interposed as a hard boundary in the first place.

## See also

- [Use the native escape hatch](/how-to/escape-hatch) — the concrete getters
  and what you give up when you use them.
- [Why Proxy gating](/explanation/proxy-gating) — how Mongoat restricts a
  model's surface without hiding the driver underneath it.
- [Reference](/api/) — `Model`, `Database`, and the native types threaded
  through the public API.
