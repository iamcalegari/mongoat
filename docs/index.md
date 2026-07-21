---
layout: home

hero:
  name: Mongoat
  tagline: A lightweight, fast, type-safe MongoDB ODM for Node.js/TypeScript
  actions:
    - theme: brand
      text: Get started
      link: /tutorials/getting-started
    - theme: alt
      text: API Reference
      link: /api/
    - theme: alt
      text: Benchmarks
      link: /explanation/benchmarks

features:
  - icon:
      light: /icons/thin-light.svg
      dark: /icons/thin-dark.svg
      width: 26
      height: 26
    title: Thin by design
    details: A modern API layered on top of the official MongoDB driver — the driver is never hidden, always accessible.
    link: /explanation/thin-odm-philosophy
    linkText: The thin-ODM philosophy
  - icon:
      light: /icons/decorators-light.svg
      dark: /icons/decorators-dark.svg
      width: 26
      height: 26
    title: Schemas as objects or decorators
    details: Define validation as a plain object, or as a class with <code>@Schema</code>/<code>@Prop</code> — both compile to the same server-side validator.
    link: /how-to/decorators
    linkText: Schema with decorators
  - icon:
      light: /icons/migrations-light.svg
      dark: /icons/migrations-dark.svg
      width: 26
      height: 26
    title: Production-ready migrations
    details: Versioned migrations with a distributed lock, transactional runs, and a CLI built for CI — dry-run, <code>status --json</code>, tiered exit codes.
    link: /cli/
    linkText: CLI reference
  - icon:
      light: /icons/hooks-light.svg
      dark: /icons/hooks-dark.svg
      width: 26
      height: 26
    title: Pre/post hooks
    details: Transform documents before insert/update or react after any operation, with typed contexts per method.
    link: /how-to/hooks
    linkText: Using hooks
  - icon:
      light: /icons/validation-light.svg
      dark: /icons/validation-dark.svg
      width: 26
      height: 26
    title: Server-side validation
    details: JSON Schema (<code>$jsonSchema</code>) validation enforced by MongoDB itself at collection level, not just at the client.
    link: /explanation/server-side-validation
    linkText: Why server-side
  - icon:
      light: /icons/injection-light.svg
      dark: /icons/injection-dark.svg
      width: 26
      height: 26
    title: Injection-safe by default
    details: An always-on <code>$where</code> guard, opt-in filter sanitizing, a sanitized <code>MongoatError</code> hierarchy, and Proxy-gated method access.
    link: /how-to/sanitize-filters
    linkText: Sanitize untrusted filters
  - icon:
      light: /icons/escape-light.svg
      dark: /icons/escape-dark.svg
      width: 26
      height: 26
    title: Native escape hatch
    details: Drop down to the native <code>Collection</code>/<code>Db</code>/<code>MongoClient</code> any time — full control, no lock-in.
    link: /how-to/escape-hatch
    linkText: Using the escape hatch
  - icon:
      light: /icons/types-light.svg
      dark: /icons/types-dark.svg
      width: 26
      height: 26
    title: Type-safe end to end
    details: Generic models, typed hooks, and typed validation schemas throughout the public API.
    link: /tutorials/getting-started
    linkText: Get started
  - icon:
      light: /icons/gauge-light.svg
      dark: /icons/gauge-dark.svg
      width: 26
      height: 26
    title: Zero measured overhead
    details: Benchmarked against the raw driver on ten operations — mongoat's throughput sits within measurement noise of native on every one.
    link: /explanation/benchmarks
    linkText: See the benchmark
---

## What it looks like

One model, two equivalent ways to describe it — a decorated class or a plain
`$jsonSchema` object — and CRUD that stays on the driver's own filter and
options types.

::: code-group

```ts [Decorators]
import { Model, Optional, Prop, Schema } from '@iamcalegari/mongoat';

@Schema('users')
class UserSchema {
  @Prop({ bsonType: 'string', description: 'Username of the user' })
  username!: string;

  @Prop({
    bsonType: 'string',
    pattern: '^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\\.[a-zA-Z0-9-.]+$',
  })
  mail!: string;

  @Optional()
  @Prop({ bsonType: ['int', 'null'] })
  age?: number;
}

export const User = new Model<UserSchema>({
  schema: UserSchema,
  validity: true,
});
```

```ts [Object]
import { Model, ModelValidationSchema } from '@iamcalegari/mongoat';

const schema: ModelValidationSchema = {
  bsonType: 'object',
  required: ['username', 'mail'],
  properties: {
    username: { bsonType: 'string', description: 'Username of the user' },
    mail: {
      bsonType: 'string',
      pattern: '^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\\.[a-zA-Z0-9-.]+$',
    },
    age: { bsonType: ['int', 'null'] },
  },
};

export const User = new Model({
  collectionName: 'users',
  schema,
  validity: true,
});
```

```ts [Use it]
import { Database } from '@iamcalegari/mongoat';
import { User } from './user-model';

const database = new Database({ dbName: 'my-app' });
await database.connect();

// Idempotent: applies server-side validators and indexes for every model.
await database.setupCollections();

const doc = await User.insert({ username: 'foobar', mail: 'foo@bar.com' });
const adults = await User.findMany({ age: { $gte: 18 } });
```

:::

Both schema tabs produce the same server-side validator — MongoDB itself
rejects invalid writes, not just the client. Follow the
[getting started tutorial](/tutorials/getting-started) for the full walkthrough.

## Benchmarked, not assumed

Every figure below comes from a reproducible benchmark of `@iamcalegari/mongoat`
against the native MongoDB driver, [Mongoose](https://mongoosejs.com/), and
[Papr](https://github.com/plexinc/papr) — published npm releases at pinned
versions, all driving the same pinned `mongo:7` server, medians across rounds.

<div class="bench-kpis">
  <div class="bench-kpi">
    <div class="k-label">Dependencies over the driver</div>
    <div class="k-value">+0</div>
    <div class="k-note">Mongoat installs nothing beyond the mongodb driver you already pull in — 150 KB of its own code, zero extra packages to audit.</div>
  </div>
  <div class="bench-kpi">
    <div class="k-label">Runtime overhead vs. the driver</div>
    <div class="k-value">≈ 0</div>
    <div class="k-note">On all ten benchmarked operations, mongoat's throughput sits within measurement noise of the raw driver it wraps.</div>
  </div>
  <div class="bench-kpi">
    <div class="k-label">Batch writes vs. Mongoose</div>
    <div class="k-value">≈3× faster</div>
    <div class="k-note">insertMany(1000): mongoat holds native-level throughput while Mongoose drops to ~31% of the driver. findMany(100) tells the same story at ≈2×.</div>
  </div>
  <div class="bench-kpi">
    <div class="k-label">Blocks <code>$where</code> by default</div>
    <div class="k-value">1 of 4</div>
    <div class="k-note">Only mongoat stops server-side JavaScript injection out of the box. The native driver, Mongoose and Papr all run it.</div>
  </div>
</div>

[Read the full benchmark — method, noise floors, and raw numbers →](/explanation/benchmarks)
