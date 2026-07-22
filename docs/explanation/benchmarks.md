---
title: Benchmarks
---

<script setup>
// Data pinned to one full run — 2026-07-17, 5 rounds × 3s per case, mongo:7.
// See "Method" below for the environment and library versions.

// Throughput as a percentage of the native driver (native is the reference line
// at 100). Bars are ordered subject → peer → incumbent: mongoat, papr, mongoose.
// Split by operation type; `highlight`/`note` mark where mongoat holds native
// speed and Mongoose does not.
const writes = [
  { label: 'insertOne',        bars: [{ key: 'mongoat', value: 97 }, { key: 'papr', value: 98 }, { key: 'mongoose', value: 85 }] },
  { label: 'insertMany(1000)', highlight: true, note: '≈ native · ~3× Mongoose', bars: [{ key: 'mongoat', value: 87 }, { key: 'papr', value: 93 }, { key: 'mongoose', value: 31 }] },
  { label: 'findOneAndUpdate', bars: [{ key: 'mongoat', value: 96 }, { key: 'papr', value: 103 }, { key: 'mongoose', value: 92 }] },
  { label: 'updateMany',       bars: [{ key: 'mongoat', value: 98 }, { key: 'papr', value: 97 }, { key: 'mongoose', value: 91 }] },
  { label: 'findOneAndDelete', bars: [{ key: 'mongoat', value: 101 }, { key: 'papr', value: 97 }, { key: 'mongoose', value: 93 }] },
];

const reads = [
  { label: 'findOne',       bars: [{ key: 'mongoat', value: 82 }, { key: 'papr', value: 96 }, { key: 'mongoose', value: 96 }] },
  { label: 'findMany(100)', highlight: true, note: '≈ native · ~2× Mongoose', bars: [{ key: 'mongoat', value: 99 }, { key: 'papr', value: 98 }, { key: 'mongoose', value: 51 }] },
  { label: 'aggregate',     bars: [{ key: 'mongoat', value: 119 }, { key: 'papr', value: 105 }, { key: 'mongoose', value: 97 }] },
  { label: 'count',         bars: [{ key: 'mongoat', value: 104 }, { key: 'papr', value: 100 }, { key: 'mongoose', value: 98 }] },
];

// Install size on disk, per library's own package directory.
const size = [
  { label: 'papr',     bars: [{ key: 'papr', value: 0.12 }] },
  { label: 'mongoat',  bars: [{ key: 'mongoat', value: 0.15 }] },
  { label: 'mongodb (native)', bars: [{ key: 'native', value: 3.27 }] },
  { label: 'mongoose', bars: [{ key: 'mongoose', value: 7.42 }] },
];
</script>

# Benchmarks

How well does Mongoat's thin-ODM bet hold up? This page answers with a
reproducible benchmark: `@iamcalegari/mongoat` measured against the native
MongoDB driver, [Mongoose](https://mongoosejs.com/), and
[Papr](https://github.com/plexinc/papr). Every library is installed from npm at a
pinned version, and all four drive the same MongoDB running in Docker.

<div class="bench-kpis">
  <div class="bench-kpi">
    <div class="k-label">Dependencies over the driver</div>
    <div class="k-value">+0</div>
    <div class="k-note">Mongoat installs nothing beyond the mongodb driver you already pull in. Papr is also +0; Mongoose adds 8 packages, including a second bundled copy of the driver.</div>
  </div>
  <div class="bench-kpi">
    <div class="k-label">Runtime overhead vs. the driver</div>
    <div class="k-value">≈ 0</div>
    <div class="k-note">On all ten operations mongoat's throughput sits within measurement noise of the raw driver it wraps. Zero overhead is the thin-ODM goal, and the benchmark confirms it.</div>
  </div>
  <div class="bench-kpi">
    <div class="k-label">Blocks <code>$where</code> by default</div>
    <div class="k-value">1 of 4</div>
    <div class="k-note">Only mongoat. The native driver, Mongoose and Papr all run attacker-supplied server-side JavaScript out of the box.</div>
  </div>
  <div class="bench-kpi">
    <div class="k-label">Mongoose on batch operations</div>
    <div class="k-value">≈3× slower</div>
    <div class="k-note">insertMany(1000) runs at 31% of native and findMany(100) at 51% — the paths where Mongoose hydrates and validates every document.</div>
  </div>
</div>

Two of those figures are where Mongoat pulls clearly ahead: zero added
dependencies, and the only default block on `$where` injection. The third — tying
the native driver on every operation — looks like a non-result until you recall
what a thin ODM is for. Zero measurable overhead _is_ the goal, and the benchmark
confirms you don't pay for the ergonomics at runtime. What the numbers can't do
is rank the thin libraries against each other on speed, because their gaps fall
below the noise floor of anything that talks to a database over a socket. So this
page leads with the two dimensions that genuinely separate the field, security
and footprint, and treats speed as what it is: a tie among the thin libraries,
with Mongoose the lone outlier on batch work.

## Security posture

This suite is not timed. It hands each library the kind of hostile payload that
arrives in an HTTP body and records what the library actually does with it,
observed rather than assumed. The `+ sanitizeFilter` column is mongoat with its
opt-in [`sanitizeFilter`](/how-to/sanitize-filters) applied at the call site.

<table class="bench-sec">
  <thead>
    <tr>
      <th>Hostile payload</th>
      <th>native</th>
      <th>mongoat</th>
      <th>+ sanitizeFilter</th>
      <th>mongoose</th>
      <th>papr</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <th><code>$where</code> (top level)</th>
      <td class="cell bad">✕ allowed</td>
      <td class="cell ok">✓ blocked</td>
      <td class="cell meh">· neutralised</td>
      <td class="cell bad">✕ allowed</td>
      <td class="cell bad">✕ allowed</td>
    </tr>
    <tr>
      <th><code>$where</code> (nested in <code>$and</code>)</th>
      <td class="cell bad">✕ allowed</td>
      <td class="cell ok">✓ blocked</td>
      <td class="cell meh">· neutralised</td>
      <td class="cell bad">✕ allowed</td>
      <td class="cell bad">✕ allowed</td>
    </tr>
    <tr>
      <th><code>$function</code> (inside <code>$expr</code>)</th>
      <td class="cell bad">✕ allowed</td>
      <td class="cell bad">✕ allowed</td>
      <td class="cell meh">· neutralised</td>
      <td class="cell bad">✕ allowed</td>
      <td class="cell bad">✕ allowed</td>
    </tr>
    <tr>
      <th>Operator injection (nested <code>$ne</code>)</th>
      <td class="cell bad">✕ allowed</td>
      <td class="cell bad">✕ allowed</td>
      <td class="cell bad">✕ allowed</td>
      <td class="cell bad">✕ allowed</td>
      <td class="cell bad">✕ allowed</td>
    </tr>
    <tr>
      <th>Operator injection (top-level <code>$ne</code>)</th>
      <td class="cell ok">✓ server-rejected</td>
      <td class="cell ok">✓ server-rejected</td>
      <td class="cell bad">✕ allowed</td>
      <td class="cell ok">✓ server-rejected</td>
      <td class="cell ok">✓ server-rejected</td>
    </tr>
    <tr>
      <th>Wrong type on insert</th>
      <td class="cell bad">✕ allowed</td>
      <td class="cell ok">✓ server-rejected</td>
      <td class="cell ok">✓ server-rejected</td>
      <td class="cell ok">✓ blocked</td>
      <td class="cell ok">✓ server-rejected</td>
    </tr>
    <tr>
      <th>Unknown field on insert</th>
      <td class="cell bad">✕ allowed</td>
      <td class="cell ok">✓ server-rejected</td>
      <td class="cell ok">✓ server-rejected</td>
      <td class="cell meh">· dropped</td>
      <td class="cell ok">✓ server-rejected</td>
    </tr>
  </tbody>
</table>

Reading the matrix:

- **Only mongoat blocks `$where` by default.** Its always-on
  [`$where` guard](/how-to/sanitize-filters) stops server-side code execution
  even when the operator is buried inside `$and`. The other three run the
  attacker's JavaScript.
- **Server-side `$jsonSchema` validation catches bad writes.** Mongoat and Papr
  push validation to the database, so a wrong-typed field or an undeclared
  property is rejected by MongoDB itself. Mongoose validates in the application
  process, blocking the wrong type and silently dropping the unknown field. The
  bare driver accepts both.
- **Two gaps stay open in mongoat's defaults, and they belong on this page.**
  `$function` inside `$expr` is a code-execution vector the always-on guard does
  not cover; only the opt-in `sanitizeFilter` does. And nested operator injection
  (`{ email, name: { $ne: … } }`, the classic auth bypass) slips past every
  library here, `sanitizeFilter` included, because the sanitiser only strips
  top-level `$`-keys.
- **`sanitizeFilter` has a sharp edge worth knowing.** It neutralises all three
  code-execution operators at any depth, which is why the `$where` rows read
  "neutralised". But look at the top-level `$ne` row: removing the operator turns
  `{ $ne: null }` into `{}`, which matches every document, a filter the server
  would otherwise have rejected outright. Stripping a key can make a filter more
  permissive, not less. Use it deliberately, on untrusted input, and back it with
  server-side validation.

No library here is invulnerable, mongoat included. What the matrix shows is that
mongoat ships the strongest default posture of the four — the only `$where` block,
plus server-side validation — while staying upfront about the input you still have
to sanitise yourself.

## Install footprint

This is the one section with no noise caveat: the numbers are static and exact.
What matters is how much each library adds on top of the mongodb driver, since
every one of them pulls the driver in anyway.

| Library          | Total deps | Added over driver | Own size |
| ---------------- | ---------: | ----------------: | -------: |
| mongodb (native) |         18 |      — (baseline) |  3.27 MB |
| **mongoat**      |         19 |            **+0** |  0.15 MB |
| papr             |         19 |                +0 |  0.12 MB |
| mongoose         |         25 |            **+8** |  7.42 MB |

Mongoat and Papr add nothing beyond the driver. Mongoat hard-depends on
`mongodb`, Papr peer-depends on it, and neither carries anything else. Mongoose
adds eight packages, among them its own bundled `mongodb@7.2.0` and `bson@7.3.1`,
a second copy of the driver sitting alongside the one already in your tree.

<BenchBars
  :groups="size"
  :max="8"
  unit=" MB"
  :decimals="2"
  hideLegend
/>

For a library whose [core value is staying thin](/explanation/thin-odm-philosophy),
this is the cleanest confirmation of the whole thesis: mongoat's own code is
150 KB, and it costs you zero extra transitive dependencies to audit.

## Throughput vs. the native driver

Now the speed picture, and the caveat that governs it. Every throughput result
carries a spread: how far the fastest and slowest of the five rounds fell from
the median. That spread is the benchmark's own noise floor, and on this hardware
it is wide. Re-run the same operation a few minutes later and it routinely moves
by 10 to 56%.

The spread is not sampling error. Within a single round, tinybench's margin of
error over ~700 samples has a median of 1.3%, so each measurement is tight. The
movement comes from host and container drift between rounds, which is why running
every case six times longer than the smoke test tightened nothing. The gate is
therefore the between-round spread: a gap narrower than the spread is not a
result, and naming a winner inside it would be inventing one.

Most operations here are noise-bound by construction. A round-trip to the server
costs a few milliseconds; the ODM's own work costs microseconds, comfortably
under 1% of what the clock sees. The ones that do resolve are the batch
operations, where per-document cost is amortised over a single round-trip and the
library's work finally rises above the I/O.

Each bar below is a library's median throughput as a percentage of the native
driver on the same operation. The shaded **tie zone** spans the baseline give or
take the run's median spread, so any bar inside it ties the raw driver. The two
operations where Mongoat's edge is real are the batch ones, marked in green:
Mongoat holds native-level throughput while Mongoose pays document by document.

### Writes

<BenchBars
  :groups="writes"
  :max="135"
  unit="%"
  :reference="100"
  reference-label="native driver = 100%"
  :band="[67, 133]"
  band-label="tie zone"
/>

### Reads

<BenchBars
  :groups="reads"
  :max="135"
  unit="%"
  :reference="100"
  reference-label="native driver = 100%"
  :band="[67, 133]"
  band-label="tie zone"
/>

Full numbers, each with its own spread and verdict:

| Operation                     | native (ops/s) | mongoat | papr | mongoose | Verdict                 |
| ----------------------------- | -------------: | ------: | ---: | -------: | ----------------------- |
| insertOne                     |            245 |     97% |  98% |      85% | tie                     |
| insertMany(1000)              |             30 |     87% |  93% |  **31%** | **Mongoose ≈3× slower** |
| findOne (indexed)             |           1093 |     82% |  96% |      96% | tie                     |
| findMany(100, indexed)        |            485 |     99% |  98% |  **51%** | **Mongoose ≈2× slower** |
| findOneAndUpdate              |            235 |     96% | 103% |      92% | tie                     |
| updateMany                    |            500 |     98% |  97% |      91% | tie                     |
| aggregate (group+sort)        |             81 |    119% | 105% |      97% | tie                     |
| count (indexed)               |            916 |    104% | 100% |      98% | tie                     |
| findOneAndDelete              |            231 |    101% |  97% |      93% | tie                     |
| transaction (commit, 10 docs) |            176 |     99% |  97% |      82% | tie                     |

Those two Mongoose results reproduce across every run so far — insertMany came in
at 26%, 37%, and 31% on three separate runs — so they are quoted as "≈3×" rather
than a single figure: the direction holds, the exact magnitude drifts. Everything
else is a tie. On all ten operations, neither mongoat nor Papr can be told apart
from the driver they sit on.

::: tip Why does an ODM sometimes read _above_ 100%?
Mongoat's `aggregate` shows 119% and its `count` 104%. An ODM calls the native
driver, so it cannot really outrun it; those are the noise band doing its job,
and both sit well inside the tie zone. An earlier, biased version of this harness
printed ODMs at 127% of native as a headline. That impossible number is what
exposed the measurement as bent and drove the fairness fixes under
[Method](#method).
:::

## Transactions

All four libraries commit at the same speed — the `transaction` row above is a tie
— and, the part that actually matters, all four roll back correctly. An aborted
transaction was verified to leave zero documents behind and to surface the error
to the caller, every time:

| Library  | Aborted transaction         | Error propagated |
| -------- | --------------------------- | ---------------- |
| native   | clean rollback (0 survived) | yes              |
| mongoat  | clean rollback (0 survived) | yes              |
| mongoose | clean rollback (0 survived) | yes              |
| papr     | clean rollback (0 survived) | yes              |

Rollback is pass/fail, not a stopwatch. A fast transaction that keeps its writes
after an abort is worse than a slow correct one, so correctness settles before
speed.

Mongoat's edge here is surface, not speed. Passing `{ session }` to a mongoat
write keeps it on the guarded API: server-side validation, the `$where` guard,
`allowedMethods` gating and your `pre`/`post` hooks all run inside the
transaction, exactly as they do outside it
([how-to](/how-to/transactions)). Drop to the native driver's raw session, as
native and Papr require, and those checks go with it; Mongoose keeps its own
client-side validation on that path.

## Method

The numbers are only worth as much as the method behind them, and a cross-ODM
benchmark is easy to get wrong. The first working version of this harness
reported ODMs at an impossible 127% of the native driver, which is what surfaced
the biases below.

### Environment

This run was executed on the setup below. Absolute throughput will differ on
other hardware; the percentages and the footprint numbers are what travel.

|          |                                                                    |
| -------- | ------------------------------------------------------------------ |
| Date     | 2026-07-17                                                         |
| Node.js  | v22.22.2                                                           |
| CPU      | AMD Ryzen 9 4900HS · 16 threads                                    |
| Memory   | 16 GB                                                              |
| MongoDB  | `mongo:7` (single-node replica set, via `@testcontainers/mongodb`) |
| Sampling | 5 rounds × 3s per case, medians reported                           |

### Versions under test

Every library is the published npm release, never a local build:

| Package                             | Version |
| ----------------------------------- | ------- |
| `@iamcalegari/mongoat`              | 1.1.0   |
| `mongodb` (shared driver)           | 7.0.0   |
| `mongoose`                          | 9.7.4   |
| `mongodb` bundled _inside_ mongoose | 7.2.0   |
| `papr`                              | 17.1.0  |

### How fairness is kept

Each of these is load-bearing; remove any one and the results bend:

- **One server for everyone.** A single pinned `mongo:7` container, so no result
  can be blamed on a different server version, storage engine, or host.
- **The server is warmed before anything is measured**, so whichever adapter runs
  first doesn't pay for a cold cache.
- **Every case gets a freshly dropped, re-seeded database.** Otherwise earlier
  insert cases grow the collection that later reads scan, and a faster adapter
  inserts more documents, leaving itself a bigger collection to read. Shared state
  would penalise exactly the adapters the benchmark should reward.
- **Adapter order rotates every round**, spreading any residual order effect
  evenly across all four instead of always favouring the same one.
- **Medians across rounds, not means**, so one container hiccup can't move a
  result, and every result carries its round-to-round spread.
- **Identical documents, indexes, and pipelines** for every library, drawn from a
  seeded PRNG: same fields, same BSON types, same values, every run.
- **Equivalent operations.** Mongoat's `update`/`delete` return the affected
  document, so every other adapter uses the returning variant too. Comparing
  `updateOne` against `findOneAndUpdate` would be comparing different work.

Each library otherwise runs with its idiomatic defaults, because that is what its
users actually get: Mongoose hydrates documents and validates client-side;
mongoat and Papr validate server-side; the native driver does neither.

### Where the comparison is still imperfect

No benchmark is neutral. These are the seams in this one:

- **Mongoose talks to the server through its own bundled driver copy** (`7.2.0`),
  while the other three share the top-level `7.0.0`. Both versions are recorded
  above.
- **The container shares a host with the benchmark process.** This is the main
  source of the between-round spread; a dedicated server would tighten it.
- **`insertOne` for Mongoose uses `create()`**, its idiomatic path, which does
  more than the driver's `insertOne` by design.

### Reproducing it

The harness lives in a companion project, `mongoat-benchmarks`, built so anyone
can clone it and re-run the whole thing:

```bash
npm install
npm run bench        # the full run above (~15 min); writes results/*.json
npm run bench:quick  # a ~3-min smoke test — never quote it as data
```

It needs only Docker running and a supported Node.js version. Each result is
written to a versioned JSON file recording the environment, the exact library
versions, every round, and the aggregated medians, so any number on this page can
be audited against the raw data that produced it.
