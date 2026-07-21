# Define indexes & validation

This guide shows how to declare indexes and server-side schema validation on
a `Model`.

## Indexes

Pass an array of `CreateIndexProps` (a MongoDB `key` spec plus the native
`CreateIndexesOptions`) to the model constructor:

```ts
import { CreateIndexProps, Model } from '@iamcalegari/mongoat';

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
});
```

Indexes declared this way are applied when you call
`database.setupCollections()` (or `database.setupCollection(model)` for a
single model). This is **idempotent** — `createIndex` is a no-op for a spec
identical to what's already on the collection, so it's safe to run on every
boot. If a managed index's spec changed (same name or same key pattern, but
different options), Mongoat drops and recreates only that specific index —
it never runs an unconditional `dropIndexes()` that would also remove
indexes created outside Mongoat (by DBAs or migrations, for example).

## Schema validation

Pass a schema as `schema` and set `validity: true` to enable it. The schema
can be a plain `ModelValidationSchema` — a `$jsonSchema`-shaped object using
`bsonType`, `properties`, `required` and `pattern` — or a class decorated
with `@Schema`/`@Prop`; both compile to the same validator:

::: code-group

```ts [Decorators]
import { Model, Prop, Schema } from '@iamcalegari/mongoat';

@Schema('users')
class UserSchema {
  @Prop({ bsonType: 'string', description: 'Username of the user' })
  username!: string;

  @Prop({
    bsonType: 'string',
    description: 'Mail of the user',
    pattern: '^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\\.[a-zA-Z0-9-.]+$',
  })
  mail!: string;
}

export const User = new Model<UserSchema>({
  schema: UserSchema,
  validity: true,
});
```

```ts [Object]
import { ModelValidationSchema, SchemaWithDefaults } from '@iamcalegari/mongoat';

const schema: ModelValidationSchema<SchemaWithDefaults<UserSchema>> = {
  bsonType: 'object',
  properties: {
    username: { bsonType: 'string', description: 'Username of the user' },
    mail: {
      bsonType: 'string',
      description: 'Mail of the user',
      pattern: '^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\\.[a-zA-Z0-9-.]+$',
    },
  },
  required: ['username', 'mail'],
};

export const User = new Model<UserSchema>({
  collectionName: 'users',
  schema,
  validity: true,
});
```

:::

The two tabs are equivalent: every `@Prop` field is required unless marked
`@Optional()`, so the class above produces `required: ['username', 'mail']`,
and `@Schema('users')` supplies the default collection name the object form
passes explicitly — see
[Define a schema with decorators](/how-to/decorators) for the full mapping.

Validation is applied **server-side**: `setupCollections()` runs a `collMod`
command with the built `$jsonSchema` validator — MongoDB itself rejects
documents that don't conform, not a client-side check performed by Mongoat
before the write. `validity: true` also restricts the model to the standard
CRUD methods (`insert`, `find`, `findById`, `findMany`, `update`,
`updateMany`, `delete`, `total`) via the same mechanism used for
[method gating](/explanation/proxy-gating).

## See also

- [Getting started](/tutorials/getting-started) — schema + indexes in the
  full connect → CRUD walkthrough.
- [Define a schema with decorators](/how-to/decorators) — the decorator form
  in depth, and how it maps to the object form.
- [Server-side validation](/explanation/server-side-validation) — why
  validation happens on the MongoDB server, not in the ODM.
- [Reference](/api/) — `CreateIndexProps` and `ModelValidationSchema`.
