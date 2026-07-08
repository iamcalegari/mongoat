# Getting started

This tutorial walks you from an empty project to your first working model with
Mongoat: connect to MongoDB, define a schema-validated model, and run the core
CRUD operations. By the end you will have a `User` model backed by a real
MongoDB collection, with server-side validation and a unique index in place.

## Prerequisites

- Node.js `^20.19.0` or `>=22.12.0`
- A MongoDB instance reachable from your machine (local or remote)

## 1. Install

```bash
npm install @iamcalegari/mongoat
```

## 2. Connect

Create a `Database` instance and connect to it. The connection URL and
credentials can come from config or from environment variables
(`MONGODB_URI`, `MONGODB_USERNAME`, `MONGODB_PASSWORD`); the database name
comes from `MONGODB_DB_NAME` or `config.dbName`:

```ts
import { Database } from '@iamcalegari/mongoat';

export const database = new Database({
  dbName: 'mongoat-example',
});

await database.connect();
```

If neither `MONGODB_URI` nor `config.uri` is set, Mongoat falls back to
`mongodb://127.0.0.1:27017/` — handy for local development, but make sure a
real connection string is configured before you touch a shared environment.

## 3. Define a model

A `Model` is a typed wrapper around a MongoDB collection. It takes a
TypeScript interface for the document shape, a `ModelValidationSchema`
describing the same shape as a `$jsonSchema` (used for server-side
validation when `validity: true`), and an optional list of indexes:

```ts
import {
  CreateIndexProps,
  METHODS,
  Model,
  ModelValidationSchema,
  SchemaWithDefaults,
} from '@iamcalegari/mongoat';

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
    updatedAt: {
      bsonType: 'date',
      description: 'Date of last update of the user',
    },
  },
  required: ['firstName', 'lastName', 'mail', 'password', 'username'],
};

const indexes: CreateIndexProps[] = [
  {
    key: { username: 1, mail: 1 },
    name: 'unique_username_mail',
    unique: true,
  },
];

export const User = new Model<UserSchema>({
  collectionName: 'users',
  schema,
  indexes,
  validity: true,
  documentDefaults: {
    insertedAt: new Date(),
  },
});

// A pre-hook runs before every insert — see the "Register pre/post hooks"
// how-to for the full ctx signature.
User.pre(METHODS.INSERT, (ctx) => {
  ctx.document.password = 'hashedPassword';
});
```

`new Model(...)` must run **after** the owning `Database` instance has been
constructed — the constructor throws if no `Database` has been created yet.
`validity: true` restricts the model to the methods needed for typical CRUD
(`insert`, `find`, `findById`, `findMany`, `update`, `updateMany`, `delete`,
`total`); anything not in that list throws at call time.

## 4. Set up collections and run CRUD

Before using a model, apply its validator and indexes to the database with
`setupCollections()` — this is idempotent, so it's safe to run on every boot:

```ts
console.log('⚙️  Setting up collections...');
await database.setupCollections();

const document = await User.insert({
  username: 'foobar',
  mail: 'foo@bar.com',
  password: 'strongPassword',
  firstName: 'Foo',
  lastName: 'Bar',
});

console.log('DOCUMENT INSERTED: ', document.firstName); // Foo

const updatedDocument = await User.update(
  { _id: document._id },
  {
    $set: {
      firstName: 'John',
      lastName: 'Doe',
    },
  }
);

console.log('DOCUMENT UPDATED: ', updatedDocument?.firstName); // John

await User.insert({
  username: 'anotherUser',
  mail: 'another@user.com',
  password: 'strongPassword',
  firstName: 'Another',
  lastName: 'User',
});

const documents = await User.findMany();

console.log('ALL DOCUMENTS: ', documents.length); // 2

await User.delete({ username: 'foobar' });
const total = await User.total();

console.log('TOTAL DOCUMENTS: ', total); // 1

await database.disconnect();
```

`insert`, `update`, `findMany`, `delete` and `total` all accept the same
`filter`/`options` shapes as the underlying `mongodb` driver — Mongoat adds
validation, hooks and method gating on top, never a different API surface.

## Next steps

- [Register pre/post hooks](/how-to/hooks) — the `ctx`-based hook signature in
  depth, including `fireAndForget` post-hooks.
- [Define indexes & validation](/how-to/indexes-validation) — `CreateIndexProps`
  and server-side `$jsonSchema` validation.
- [Reference](/api/) — the full public API generated from the source.
