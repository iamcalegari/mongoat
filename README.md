<p align="center">
  <img src="https://raw.githubusercontent.com/iamcalegari/mongoat/main/graphics/mongoat-cover-4_1.png" alt="Mongoat" width="640"/>
</p>

<h1 align="center">MONGOAT</h1>
<p align="center"><b>A lightweight, type-safe MongoDB ODM</b></p>

<p align="center">
  <a href="https://www.npmjs.com/package/@iamcalegari/mongoat">
    <img src="https://img.shields.io/npm/v/@iamcalegari/mongoat.svg" alt="NPM Version"/>
  </a>
</p>

---

Mongoat is a thin, extensible, and type-safe ODM (Object Document Mapper) for MongoDB in Node.js/TypeScript. It sits on top of the official `mongodb` driver **without hiding it**: full CRUD on typed models, schemas as plain objects or decorators, server-side JSON Schema validation, pre/post transformation hooks, versioned migrations with a CI-ready CLI, and Proxy-based method gating — productivity of an ODM while keeping full control of the native driver.

## Table of Contents

- [Features](#features)
- [Installation](#installation)
- [Quick Start](#quick-start)
  - [Connecting to MongoDB](#connecting-to-mongodb)
  - [Defining a Model](#defining-a-model)
  - [Basic CRUD Usage](#basic-crud-usage)
- [Migrations](#migrations)
- [Full Documentation](#full-documentation)
- [Contributing](#contributing)
- [License](#license)

---

## Features

- **Thin ODM** — a typed layer over the official `mongodb` driver, not a replacement for it
- **Full CRUD** on typed models: `insert`/`insertMany`, `find`/`findById`/`findMany`, `update`/`updateMany`, `delete`/`deleteMany`, `total`, `aggregate`, `bulkWrite`
- **Schemas as objects or decorators** — a plain `$jsonSchema`-shaped object, or a class with `@Schema`/`@Prop`; both compile to the same server-side validator
- **Pre/post hooks** for transforming documents and reacting to operation results
- **Server-side validation** via MongoDB `$jsonSchema` — enforced by the database, not just at the app layer
- **Production-ready migrations** — versioned `up`/`down` files, transactional runs, a distributed lock, and a CLI built for CI (`--dry-run`, `status --json`, tiered exit codes)
- **Injection-safe by design** — an always-on `$where` guard, opt-in `sanitizeFilter` for untrusted input, sanitized error hierarchy (`MongoatError` and subclasses)
- **Native escape hatch** — `getCollection()`/`getClient()`/`getDb()` for direct, unrestricted access to the native driver whenever you need it
- **Type-safe** end to end, with generics tied to your document schema
- **Dual CJS/ESM** package, zero required runtime dependencies beyond `mongodb`/`bson`

## Installation

```bash
npm install @iamcalegari/mongoat

yarn add @iamcalegari/mongoat

pnpm add @iamcalegari/mongoat
```

Requires Node.js `^20.19.0 || >=22.12.0`. The `mongodb` v7 driver comes along as a regular dependency — no separate install.

## Quick Start

### Connecting to MongoDB

```ts
import { Database } from '@iamcalegari/mongoat';

export const database = new Database({
  dbName: 'mongoat-example',
});

await database.connect();
```

### Defining a Model

```ts
import { Model, METHODS } from '@iamcalegari/mongoat';
import type { CreateIndexProps, ModelValidationSchema, SchemaWithDefaults } from '@iamcalegari/mongoat';

interface UserSchema {
  username: string;
  password: string;
  mail: string;
  firstName: string;
  lastName: string;
}

const schema: ModelValidationSchema<SchemaWithDefaults<UserSchema>> = {
  bsonType: 'object',
  properties: {
    username: { bsonType: 'string', description: 'Username of the user' },
    password: { bsonType: 'string', description: 'Password of the user' },
    mail: {
      bsonType: 'string',
      description: 'Mail of the user',
      pattern: '^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\\.[a-zA-Z0-9-.]+$',
    },
    firstName: { bsonType: 'string', description: 'First name of the user' },
    lastName: { bsonType: 'string', description: 'Last name of the user' },
    insertedAt: { bsonType: 'date', description: 'Date of the user creation' },
    updatedAt: { bsonType: 'date', description: 'Date of last update of the user' },
  },
  required: ['firstName', 'lastName', 'mail', 'password', 'username'],
};

const indexes: CreateIndexProps[] = [
  { key: { username: 1, mail: 1 }, name: 'unique_username_mail', unique: true },
];

export const User = new Model<UserSchema>({
  collectionName: 'users',
  schema,
  indexes,
  validity: true,
});

// Pre-hook: runs before every insert — a fresh timestamp per document.
User.pre(METHODS.INSERT, (ctx) => {
  ctx.document.password = 'hashedPassword';
  (ctx.document as SchemaWithDefaults<UserSchema>).insertedAt = new Date();
});
```

Prefer decorators? The same schema can be a class — every `@Prop` field is required unless marked `@Optional()`, and `@Schema('users')` supplies the collection name:

```ts
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

See [Define a schema with decorators](https://iamcalegari.github.io/mongoat/how-to/decorators) for the full mapping between the two forms.

### Basic CRUD Usage

```ts
await database.setupCollections();

const user = await User.insert({
  username: 'foobar',
  mail: 'foo@bar.com',
  password: 'strongPassword',
  firstName: 'Foo',
  lastName: 'Bar',
});

await User.update({ _id: user._id }, { $set: { firstName: 'John' } });

const users = await User.findMany();

await User.delete({ username: 'foobar' });

await database.disconnect();
```

## Migrations

The package ships a `mongoat` CLI for versioned, transactional migrations:

```bash
npx mongoat create backfill-user-status   # scaffold migrations/<timestamp>_backfill-user-status.ts
npx mongoat up                            # apply pending migrations, in order
npx mongoat status                        # applied/pending overview
```

Every run executes inside a MongoDB transaction (replica set required) under a distributed lock, so concurrent deploys can't double-apply. For CI there are `--dry-run`, `status --json`, and tiered exit codes. Migrations written in TypeScript need [`tsx`](https://github.com/privatenumber/tsx) as an optional peer dependency; `.js` migrations need nothing extra.

- [Your first migration](https://iamcalegari.github.io/mongoat/tutorials/first-migration) — guided walkthrough
- [Write and run migrations](https://iamcalegari.github.io/mongoat/how-to/migrations) — the full workflow, including failure modes
- [CLI reference](https://iamcalegari.github.io/mongoat/cli/) — every command, flag, env var, and exit code

## Full Documentation

**Full documentation → [https://iamcalegari.github.io/mongoat/](https://iamcalegari.github.io/mongoat/)**

The site is the source of truth for guides, API reference, and the migration guide — this README only covers the essentials to get started:

- [Tutorials](https://iamcalegari.github.io/mongoat/tutorials/getting-started) — guided quick start and your first migration
- [How-to guides](https://iamcalegari.github.io/mongoat/how-to/hooks) — decorators, hooks, migrations, sanitizing untrusted filters, error handling, the native escape hatch, indexes & validation
- [Reference](https://iamcalegari.github.io/mongoat/api/) — full public API, generated from source
- [CLI reference](https://iamcalegari.github.io/mongoat/cli/) — the `mongoat` migration CLI
- [Explanation](https://iamcalegari.github.io/mongoat/explanation/thin-odm-philosophy) — design philosophy, Proxy gating, server-side validation, the migration lock
- [Benchmarks](https://iamcalegari.github.io/mongoat/explanation/benchmarks) — measured against the native driver, Mongoose, and Papr
- [Stability & versioning](https://iamcalegari.github.io/mongoat/explanation/versioning) — semver policy, what's covered by the public API contract
- [Migration guide](https://iamcalegari.github.io/mongoat/migration) — upgrading from the alpha line to v1.0

## Contributing

Issues and pull requests are welcome — see [open issues](https://github.com/iamcalegari/mongoat/issues) or open a new one before starting significant work.

## License

[MIT](https://github.com/iamcalegari/mongoat/blob/main/LICENSE)
