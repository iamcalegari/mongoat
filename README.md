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

Mongoat is a thin, extensible, and type-safe ODM (Object Document Mapper) for MongoDB in Node.js/TypeScript. It sits on top of the official `mongodb` driver **without hiding it**: full CRUD on typed models, server-side JSON Schema validation, pre/post transformation hooks, and Proxy-based method gating — productivity of an ODM while keeping full control of the native driver.

## Table of Contents

- [Features](#features)
- [Installation](#installation)
- [Quick Start](#quick-start)
  - [Connecting to MongoDB](#connecting-to-mongodb)
  - [Defining a Model](#defining-a-model)
  - [Basic CRUD Usage](#basic-crud-usage)
- [Full Documentation](#full-documentation)
- [Contributing](#contributing)
- [License](#license)

---

## Features

- **Thin ODM** — a typed layer over the official `mongodb` driver, not a replacement for it
- **Full CRUD** on typed models: `insert`/`insertMany`, `find`/`findById`/`findMany`, `update`/`updateMany`, `delete`/`deleteMany`, `total`, `aggregate`, `bulkWrite`
- **Pre/post hooks** for transforming documents and reacting to operation results
- **Server-side validation** via MongoDB `$jsonSchema` — enforced by the database, not just at the app layer
- **Injection-safe by design** — opt-in `sanitizeFilter` for untrusted input, sanitized error hierarchy (`MongoatError` and subclasses)
- **Native escape hatch** — `getCollection()`/`getClient()`/`getDb()` for direct, unrestricted access to the native driver whenever you need it
- **Type-safe** end to end, with generics tied to your document schema
- **Dual CJS/ESM** package, zero required runtime dependencies beyond `mongodb`/`bson`

## Installation

```bash
npm install @iamcalegari/mongoat

yarn add @iamcalegari/mongoat

pnpm add @iamcalegari/mongoat
```

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
import { Database, Model, METHODS } from '@iamcalegari/mongoat';
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
  documentDefaults: { insertedAt: new Date() },
});

// Pre-hook: runs before every insert
User.pre(METHODS.INSERT, (ctx) => {
  ctx.document.password = 'hashedPassword';
});
```

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

## Full Documentation

**Full documentation → [https://iamcalegari.github.io/mongoat/](https://iamcalegari.github.io/mongoat/)**

The site is the source of truth for guides, API reference, and the migration guide — this README only covers the essentials to get started:

- [Tutorials](https://iamcalegari.github.io/mongoat/tutorials/getting-started) — guided quick start
- [How-to guides](https://iamcalegari.github.io/mongoat/how-to/hooks) — hooks, sanitizing untrusted filters, error handling, the native escape hatch, indexes & validation
- [Reference](https://iamcalegari.github.io/mongoat/api/) — full public API, generated from source
- [Explanation](https://iamcalegari.github.io/mongoat/explanation/thin-odm-philosophy) — design philosophy, Proxy gating, server-side validation
- [Stability & versioning](https://iamcalegari.github.io/mongoat/explanation/versioning) — semver policy, what's covered by the public API contract
- [Migration guide](https://iamcalegari.github.io/mongoat/migration) — upgrading from the alpha line to v1.0

## Contributing

Issues and pull requests are welcome — see [open issues](https://github.com/iamcalegari/mongoat/issues) or open a new one before starting significant work.

## License

[MIT](https://github.com/iamcalegari/mongoat/blob/main/package.json)
