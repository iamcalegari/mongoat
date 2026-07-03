# Coding Conventions

**Analysis Date:** 2026-07-03

## Naming Patterns

**Classes:**
- PascalCase without prefix
- Examples: `Database`, `Model`
- Location: `src/database/index.ts`, `src/model/index.ts`

**Functions & Methods:**
- camelCase for all function and method names
- Examples: `connect()`, `disconnect()`, `findMany()`, `updateMany()`, `setupCollections()`
- Verb-first pattern for action methods (find, insert, update, delete, total)
- Location: `src/database/index.ts:95-130`, `src/model/index.ts:204-256`

**Constants & Enums:**
- UPPER_SNAKE_CASE for enum members
- Examples: `METHODS.UPDATE`, `METHODS.INSERT`, `METHODS.FIND_MANY`, `CUSTOM_VALIDATION.UNIQUE`
- Location: `src/utils/enums.ts`

**Interfaces & Types:**
- PascalCase without "I" prefix
- Props suffix for configuration/parameter objects: `CreateModelProps`, `CreateIndexProps`
- Schema suffix for validation schemas: `ModelValidationSchema`
- Config suffix for configuration types: `DatabaseConfig`
- Examples: `DatabaseConfig`, `CreateModelProps`, `ModelValidationSchema`, `DefaultProperties`
- Location: `src/types/database.ts`, `src/types/model.ts`

**Properties & Variables:**
- camelCase for all instance properties and local variables
- Examples: `username`, `firstName`, `lastName`, `collectionName`, `documentDefaults`
- Location: `src/model/index.ts:38-67`, `examples/model/model.ts:20-26`

**Private Fields:**
- Symbol-based with lowercase `k` prefix for private fields
- Pattern: `const kPrivateName = Symbol('kPrivateName');`
- Examples: `kClient`, `kDb`, `kConnectionUrl`, `kCreateClientConnection`, `kDatabase`
- Used with bracket notation: `this[kClient]`, `Model[kDatabase]`
- Location: `src/database/index.ts:15-22`, `src/model/index.ts:35`
- Rationale: Prevents accidental access and property enumeration

**Generic Type Parameters:**
- PascalCase starting with T: `ModelType`, `T`
- Example: `Model<ModelType extends Document>`
- Location: `src/model/index.ts:37`

## Code Style

**Formatting:**
- Tool: Prettier 3.7.4
- Config file: `.prettierrc`
- Indentation: 2 spaces
- Line endings: LF
- Quotes: Single quotes (')
- Semicolons: Required
- Trailing commas: ES5 style (objects and arrays, not function parameters)
- See: `.prettierrc`

**Linting:**
- Tool: ESLint 9.39.2
- Parser: @typescript-eslint/parser 8.50.0
- Plugin: @typescript-eslint 8.50.0
- Configuration: ESLint recommended + TypeScript recommended rules
- Config file: `eslint.config.js`
- Applies to: .ts and .tsx files

## Import Organization

**Order:**
1. External library imports (mongodb, bson, json-schema)
2. Internal path alias imports (@/, @types/, @utils/)
3. Type imports

**Example from `src/model/index.ts`:**
```typescript
import {
  AggregateOptions,
  AnyBulkWriteOperation,
  BulkWriteOptions,
  Document,
  Filter,
  // ... other MongoDB imports
} from 'mongodb';

import {
  CreateIndexProps,
  CreateModelProps,
  // ... other type imports
} from '@/types/model';
import { METHODS } from '@/utils/enums';
import { Database } from '@/database';
import { toObjectId } from '@/utils';
```

**Path Aliases:**
- `@/*` → `src/*` (main source)
- `@examples/*` → `examples/*` (example files)
- `@test/*` → `test/*` (test files)
- `@types/*` → `src/types/*` (type definitions)
- `@utils/*` → `src/utils/*` (utility functions)
- Defined in: `tsconfig.json:42-48`

**Barrel Exports:**
- Modules export from index files to group related exports
- Examples: `src/index.ts`, `src/utils/index.ts`
- Location: `src/index.ts`, `src/utils/index.ts`

## Error Handling

**Pattern:**
- try-catch blocks for database operations that may throw
- Throw `MongoError` for database errors
- Errors serialized with `JSON.stringify()` for clarity

**Example from `src/model/index.ts:289-296`:**
```typescript
try {
  const { insertedId } = await collection.insertOne(_document, options);
  return { _id: insertedId, ..._document } as unknown as WithId<ModelType> & DefaultProperties;
} catch (err: any) {
  throw new MongoError(JSON.stringify(err, null, 2));
}
```

## Logging

**Framework:** `console` (built-in)

**Patterns:**
- Direct `console.log()` calls
- Emoji used in examples for visual clarity (🔌, ⚙️)
- Output comments show expected results
- Location: `examples/model/usage.ts:9-13`, `examples/connection.ts:48`

**Example from `examples/model/usage.ts:9-13`:**
```typescript
console.log('🔌 Connecting to database...');
await database.connect();

console.log('⚙️  Setting up collections...');
await database.setupCollections();
```

## Comments

**JSDoc Documentation:**
- Used for public methods and exported functions
- Format: `/** @public */` for public API
- Format: `/** @private */` for internal implementation
- Format: `/** @deprecated */` for deprecated methods
- Include @see links to documentation when applicable
- Location: `src/database/index.ts:36-53`, `src/model/index.ts:181-191`

**Example from `src/database/index.ts:36-53`:**
```typescript
/**
 * @public
 *
 * Create a new instance of the Database class.
 * @param config An object with the configuration of the database.
 * @param client An instance of the MongoClient class.
 * @param db An instance of the Db class.
 *
 * If the config object has the uri, username and password properties...
 */
constructor(...)
```

**Inline Comments:**
- Multi-line comments explain complex logic
- Comments above code blocks provide context
- Output examples shown in comments with `// Expected output`
- Location: `examples/connection.ts:8-27`, `examples/model/usage.ts:24`

**Tagged Comments:**
- Use `@see` tag to link to GitHub documentation
- Location: `examples/model/model.ts:2`, `examples/model/usage.ts:2`

## TypeScript Strictness

**Configuration:**
- `strict: true` - Enables all strict type checking options
- `alwaysStrict: true` - Emit 'use strict' in output
- `noEmitOnError: true` - Never emit error-filled code
- `noImplicitReturns: true` - Error on functions missing return statements
- `noImplicitOverride: true` - Error on overridden methods without override keyword
- `forceConsistentCasingInFileNames: true` - Disallow inconsistent casing
- Location: `tsconfig.json:2-35`

## Function Design

**Size:**
- Single responsibility principle observed
- Methods focused on specific operations (CRUD operations)
- Average method length 15-30 lines (excluding JSDoc)

**Parameters:**
- Use destructuring for complex parameter objects
- Type all parameters explicitly
- Default values used for optional parameters
- Example: `async update(filter: Filter<ModelType>, update: UpdateFilter<ModelType>, options: FindOneAndUpdateOptions = {})`
- Location: `src/model/index.ts:204-207`

**Return Values:**
- Async functions return `Promise<T>` explicitly
- Void functions return nothing or `Promise<void>`
- Return type assertions used where needed: `as unknown as T`
- Null returns use `?? null` pattern
- Location: `src/model/index.ts:258-263`

**Example:**
```typescript
findMany(filter: Filter<ModelType> = {}, options: FindOptions = {}) {
  const collection = Model[kDatabase]?.getCollection<ModelType>(
    this.collectionName
  ) as Collection<ModelType>;

  return collection.find(filter, options).toArray() ?? [];
}
```

## Module Design

**Exports:**
- Barrel exports used to group related exports
- Re-export from sub-modules through index files
- Location: `src/index.ts`, `src/utils/index.ts`

**Class Structure:**
- Single class per file with related symbols/types
- Static methods for factory or utility operations
- Symbol-based private storage for true encapsulation
- Private methods prefixed with underscore in documentation but using Symbols in code
- Location: `src/database/index.ts`, `src/model/index.ts`

**Example from `src/index.ts`:**
```typescript
export { Database, ObjectID } from './database';
export { Model } from './model';
export {
  CreateIndexProps,
  CreateModelProps,
  // ... type exports
} from './types';

export { CUSTOM_VALIDATION, METHODS } from './utils';
```

## Proxy Pattern

**Usage:**
- Proxy pattern used for method authorization
- Prevents calling disallowed methods on models
- Static method returns proxy handler
- Location: `src/database/index.ts:309-330`

**Example:**
```typescript
static [KModelProxyHandler]() {
  return {
    get(target: Model<Document>, prop: METHODS, receiver: unknown) {
      if (
        target.methods.includes(prop) &&
        !target.allowedMethods.includes(prop)
      ) {
        throw new Error(
          `The method "${prop}" is not allowed in "${target.collectionName}"`
        );
      }
      return Reflect.get(target, prop, receiver);
    },
  };
}
```

## Pre-method Pattern

**Usage:**
- Methods registered as `preMethod[METHODS.X]` for hooks
- Called with `.bind()` to set context
- Used for data transformation before database operations
- Location: `src/model/index.ts:54-67`, `src/model/index.ts:181-194`

**Example from `examples/model/model.ts:68-70`:**
```typescript
User.pre<UserSchema>(METHODS.INSERT, function () {
  this.password = 'hashedPassword';
});
```

---

*Convention analysis: 2026-07-03*
