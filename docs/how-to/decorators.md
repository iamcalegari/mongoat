# Define a schema with decorators

Mongoat accepts two ways to describe a model's schema, and they compile to
exactly the same thing. This guide shows both side by side so you can pick
one — or move between them — without guessing.

- The **object form** passes a `ModelValidationSchema`: a plain
  `$jsonSchema`-shaped object.
- The **decorator form** passes a class annotated with `@Schema` and `@Prop`.

Neither is a wrapper around the other at runtime. The model constructor
checks whether `schema` is a class and, if it is, compiles it down to the
same `ModelValidationSchema` the object form supplies directly. Everything
downstream — the server-side validator, indexes, hooks — is unaware of which
one you used.

## The same schema, both ways

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

:::

Two differences are worth naming, because they are easy to miss:

**`required` is inverted.** In the object form you list required fields
explicitly. In the decorator form every `@Prop` field is required by default
and you opt out with `@Optional()`. The example above produces
`required: ['username', 'mail']` either way.

**The collection name has a default.** `@Schema('users')` supplies a
*default* collection name, which is why the decorator example omits
`collectionName`. An explicit `collectionName` in the model config always
wins over the decorator's. Supply neither and the constructor throws
`MongoatValidationError` with code `VALIDATION_FAILED`.

## Field decorators

`@Prop` takes a schema fragment — any `$jsonSchema` keyword, plus `bsonType`.
For the common keywords there are shorter equivalents:

| Sugar | Equivalent `@Prop` fragment |
|---|---|
| `@BsonType('string')` | `@Prop({ bsonType: 'string' })` |
| `@Description('...')` | `@Prop({ description: '...' })` |
| `@Pattern('^a')` | `@Prop({ pattern: '^a' })` |
| `@Enum(['a', 'b'])` | `@Prop({ enum: ['a', 'b'] })` |
| `@Min(0)` / `@Max(10)` | `@Prop({ minimum: 0 })` / `@Prop({ maximum: 10 })` |
| `@MinLength(1)` / `@MaxLength(80)` | `@Prop({ minLength: 1 })` / `@Prop({ maxLength: 80 })` |

They stack, and they merge into one fragment per field:

```ts
import { BsonType, Description, MaxLength, Schema } from '@iamcalegari/mongoat';

@Schema('users')
class UserSchema {
  @BsonType('string')
  @MaxLength(80)
  @Description('Username of the user')
  username!: string;
}
```

`@Optional()` is the one field decorator that contributes no fragment — it
only removes the field from `required`. Its position relative to `@Prop` on
the same field does not matter, because the exclusion is applied when the
class is compiled rather than when the decorator runs.

## Nesting

A `@Prop` fragment's `type` (or `items`, for arrays) accepts another
decorated class, compiled recursively:

```ts
import { Prop, Schema } from '@iamcalegari/mongoat';

@Schema()
class AddressSchema {
  @Prop({ bsonType: 'string' })
  city!: string;
}

@Schema('users')
class UserSchema {
  @Prop({ type: AddressSchema })
  address!: AddressSchema;
}
```

`bsonType: 'object'` is not needed on that fragment — it comes from
compiling the nested class.

A nested class needs no collection name of its own — `@Schema()` with no
argument marks it as a schema without claiming a collection. You can also
pass a plain subschema object in the same position when a class would be
overkill.

## Hooks on the class

`@Pre` and `@Post` register the same hooks described in
[Register pre/post hooks](/how-to/hooks), declared next to the schema instead
of on the model. `@Pre` works at class level and at field level; `@Post` is
class level only — a per-field post hook has no clear semantics, so it is
rejected rather than quietly reinterpreted.

```ts
import { Post, Pre, Prop, Schema } from '@iamcalegari/mongoat';

@Schema('users')
@Post('insert', (ctx) => auditCreated(ctx))
class UserSchema {
  @Pre('insert', (value) => hashPassword(value))
  @Prop({ bsonType: 'string' })
  password!: string;
}
```

The hook method name is validated when the decorator runs, so a typo like
`@Pre('insrt', ...)` fails at class-definition time rather than silently
never firing.

## Which one to use

The object form has no build requirements at all and keeps the schema as
data — easy to generate, serialize, or assemble conditionally. Prefer it when
the schema is computed, shared across models, or read from somewhere else.

The decorator form keeps the field's type and its validation rule on the same
line, which is what makes drift between them visible. Prefer it when the
schema is hand-written and mirrors a TypeScript shape you already maintain.

Mixing is fine: nothing stops one model from using a class and another from
using an object.

## Requirements for decorators

These are the **standard** decorators from the ECMAScript proposal — not the
legacy TypeScript ones. That means:

- **No `experimentalDecorators`.** If your `tsconfig.json` sets it, turn it
  off. The legacy transform passes a different argument shape, and Mongoat
  detects it and throws `MongoatValidationError` with code
  `LEGACY_DECORATORS_MODE` rather than misreading the arguments.
- **No `reflect-metadata`.** Field metadata rides on the standard
  `context.metadata` object, so there is no polyfill to import and no extra
  runtime dependency.
- **A toolchain that lowers standard decorators.** TypeScript 5.x emits them
  natively. Bundlers vary — if your build reports a syntax error on `@Prop`,
  it is the bundler's decorator support, not Mongoat.

A class decorated with `@Schema` but containing no decorated field throws
`MongoatValidationError` with code `INVALID_DECORATED_CLASS` — an empty
schema is always a mistake, and failing at class-definition time is cheaper
than discovering it against the database.

## See also

- [Define indexes & validation](/how-to/indexes-validation) — how the
  compiled schema becomes a server-side validator, and how indexes are
  declared alongside it.
- [Register pre/post hooks](/how-to/hooks) — the full hook contract that
  `@Pre` and `@Post` feed into.
- [Server-side validation](/explanation/server-side-validation) — why the
  validator lives in MongoDB rather than in the client.
- [Reference](/api/) — `Schema`, `Prop`, `Optional`, `Pre`, `Post`, and the
  sugar decorators.
