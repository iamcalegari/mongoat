<!-- refreshed: 2026-07-03 -->
# Architecture

**Analysis Date:** 2026-07-03

## System Overview

Mongoat is a lightweight ODM (Object Document Mapper) library for MongoDB that provides a type-safe abstraction layer over the native MongoDB Node.js driver. It implements a two-tier pattern: a Database singleton that manages connection lifecycle and Model instances that represent collections with schema validation, indexes, and method authorization.

```text
┌─────────────────────────────────────────────────────────────────┐
│                     Application Code                             │
│            (Creates Database, instantiates Models)               │
└────────────────────────┬────────────────────────────────────────┘
                         │
┌─────────────────────────▼────────────────────────────────────────┐
│                     Database Layer                                │
│  `src/database/index.ts`                                          │
│  - Manages MongoClient connection                                │
│  - Registers and retrieves Models                                │
│  - Sets up collections and validates schemas                     │
│  - Uses Proxy pattern for method authorization                   │
└────────┬─────────────────────────────────────────────────────────┘
         │
         │ getCollection()
         │
┌────────▼──────────────────────────────────────────────────────────┐
│                    Model Layer                                     │
│  `src/model/index.ts`                                              │
│  - Encapsulates collection operations                              │
│  - Enforces schema validation                                      │
│  - Applies indexes                                                 │
│  - Executes pre-method hooks                                       │
│  - Manages document defaults                                       │
└────────┬──────────────────────────────────────────────────────────┘
         │
         │ collection.<method>()
         │
┌────────▼──────────────────────────────────────────────────────────┐
│               MongoDB Driver Layer                                 │
│  - Native mongodb@7.0.0 Collection operations                     │
│  - BSON encoding/decoding                                         │
│  - Network protocol to MongoDB server                             │
└─────────────────────────────────────────────────────────────────┘
```

## Component Responsibilities

| Component | Responsibility | File |
|-----------|----------------|------|
| Database | Connection lifecycle, model registration, collection setup | `src/database/index.ts` |
| Model | Collection abstraction, document operations, hooks | `src/model/index.ts` |
| Types | Type definitions and interfaces | `src/types/` |
| Utils | Enums, conversion helpers | `src/utils/` |
| Index | Public API exports | `src/index.ts` |

## Pattern Overview

**Overall:** Singleton Database with Registry Pattern for Models + Proxy Pattern for Authorization

**Key Characteristics:**
- **Single Database Instance:** Manages all database connections and models globally
- **Symbol-Based Encapsulation:** Private fields use Symbol keys (e.g., `kClient`, `kDb`) to prevent accidental access
- **Proxy Authorization:** Model methods are wrapped with Proxy to enforce `allowedMethods` restrictions
- **Schema Validation:** JSON Schema validation applied at collection creation time
- **Pre-Method Hooks:** Middleware pattern via `pre()` method allows transforming data before operations
- **Environment-Driven Config:** Connection details default to env vars (MONGODB_URI, MONGODB_USERNAME, MONGODB_PASSWORD, MONGODB_DB_NAME)
- **Document Defaults:** Each model can specify default values applied to all inserted documents

## Layers

**Database Layer:**
- Purpose: Manage MongoDB connections and model lifecycle
- Location: `src/database/index.ts`
- Contains: MongoClient management, model registry, collection initialization
- Depends on: mongodb@7.0.0, Model class
- Used by: Application code (bootstrapping phase)

**Model Layer:**
- Purpose: Provide typed collection operations with validation and middleware
- Location: `src/model/index.ts`
- Contains: CRUD methods (insert, find, update, delete), aggregation, bulk operations
- Depends on: MongoDB Collection, Types, METHODS enum
- Used by: Application code (query phase)

**Type Layer:**
- Purpose: Provide TypeScript definitions for configuration and constraints
- Location: `src/types/`
- Contains: DatabaseConfig, CreateModelProps, ModelValidationSchema, CreateIndexProps
- Depends on: json-schema@0.4.0, mongodb types
- Used by: Database, Model, and user code

**Utility Layer:**
- Purpose: Provide enums and helper functions
- Location: `src/utils/`
- Contains: METHODS enum (12 operations), CUSTOM_VALIDATION enum, toObjectId converter
- Depends on: bson library
- Used by: Database, Model, user code

## Data Flow

### Primary Request Path: Insert Document

1. **Application calls:** `await User.insert({ username: 'john', ... })` (application code)
2. **Model.insert() executes:** Merges documentDefaults with provided document (`src/model/index.ts:274-297`)
3. **Pre-method hook fires:** `this.preMethod[METHODS.INSERT]` is invoked if registered (`src/model/index.ts:283`)
4. **Get collection:** `Model[kDatabase].getCollection<ModelType>()` retrieves native MongoDB Collection (`src/model/index.ts:285-286`)
5. **Insert to MongoDB:** `collection.insertOne(_document, options)` sends to server (`src/model/index.ts:290`)
6. **Return result:** Merged with defaults, returns `WithId<ModelType>` with `_id` field (`src/model/index.ts:292-293`)

### Secondary Flow: Database Connection and Setup

1. **Create Database:** `new Database(config)` initializes MongoClient symbols and sets default URI (`src/database/index.ts:55-74`)
2. **Create Models:** `new Model({ schema, indexes, ... })` registers in Database static map (`src/model/index.ts:71-123`)
3. **Connect:** `await database.connect()` creates MongoClient and selects database (`src/database/index.ts:95-110`)
4. **Setup collections:** `await database.setupCollections()` iterates registered models (`src/database/index.ts:244-250`)
5. **For each model:** 
   - Check if collection exists (`src/database/index.ts:253`)
   - Create collection if missing (`src/database/index.ts:256`)
   - Apply JSON Schema validator if present (`src/database/index.ts:259-261`)
   - Drop old indexes and create new ones (`src/database/index.ts:360-373`)

### Authorization Flow: Method Restriction

1. **Model created with allowedMethods:** `new Model({ allowedMethods: [METHODS.FIND], ... })` (`src/model/index.ts:82-83`)
2. **Model wrapped in Proxy:** `registerModel()` wraps with `KModelProxyHandler` (`src/database/index.ts:233-238`)
3. **Method call intercepted:** Proxy `get` trap checks if method is in `allowedMethods` (`src/database/index.ts:309-330`)
4. **If not allowed:** Throws error `"The method "X" is not allowed in "collection-name"` (`src/database/index.ts:316-318`)
5. **If allowed:** Returns bound method for execution (`src/database/index.ts:324-327`)

**State Management:**
- **Database connection state:** Stored in private symbols `[kClient]` and `[kDb]` on Database instance
- **Model registry:** Static Map on Database class: `Database[KModelMap]`
- **Model state:** Each Model instance maintains `collectionName`, `indexes`, `validator`, `allowedMethods`, `documentDefaults`
- **Pre-method hooks:** Per-model storage in `Model.preMethod` Record (12 METHODS keys)

## Key Abstractions

**Database:**
- Purpose: Singleton connection manager and model registry
- Examples: `src/database/index.ts` (413 lines)
- Pattern: Static methods for model management, instance methods for connection lifecycle

**Model:**
- Purpose: Typed collection wrapper with middleware and validation
- Examples: `src/model/index.ts` (393 lines)
- Pattern: Instance methods for CRUD, static reference to Database via symbol

**ModelValidationSchema:**
- Purpose: JSON Schema extension for MongoDB document validation
- Examples: `src/types/model.ts:54-62`
- Pattern: Extended JSONSchema4 with `bsonType` field and MongoDB-specific constraints

**CreateIndexProps:**
- Purpose: Type-safe index definition matching MongoDB spec
- Examples: `src/types/model.ts:11-13`
- Pattern: Composition of IndexSpecification and CreateIndexesOptions

## Entry Points

**Library Export:**
- Location: `src/index.ts`
- Triggers: Import statement from consuming application
- Responsibilities: Export Database, Model, types, and utilities

**Application Bootstrap (Typical):**
- Location: User code (see `examples/model/usage.ts`)
- Triggers: Application startup
- Responsibilities:
  1. Create Database instance with config
  2. Create Model instances with schema and options
  3. Call database.connect()
  4. Call database.setupCollections()
  5. Use models for operations

**Connection Entry:**
- Location: `src/database/index.ts:95-110` (Database.connect())
- Triggers: Explicit `await db.connect()` call
- Responsibilities: Create MongoClient, select database, validate connection

## Architectural Constraints

- **Threading:** Single-threaded event loop; MongoDB driver handles connection pooling internally. No worker threads used.
- **Global state:** Static `KModelMap` on Database class holds all registered models. Database instance is typically a singleton. Model static reference `[kDatabase]` points to the single Database instance.
- **Circular imports:** Model imports Database (`@/database`), Database imports Model (`@/model`), but Database is imported in Module context before Model uses it, so no circular import issue at runtime.
- **Private field encapsulation:** All internal state uses Symbol keys (`kClient`, `kDb`, `kDatabase`, `KModelMap`, etc.) to prevent external access.
- **Method authorization:** Proxy intercepts all property access on Model instances to enforce `allowedMethods` at runtime.
- **Connection required:** Model operations require Database.connect() to be called first; operations fail with "Database not found" error if Model[kDatabase] is undefined.

## Anti-Patterns

### Hidden Connection Dependency

**What happens:** Model methods silently fail if Database.connect() is never called, because operations try to getCollection() on an undefined `[kDb]`.

**Why it's wrong:** User receives cryptic errors instead of clear feedback about missing connection setup.

**Do this instead:** Add connection check at Model method entry point (`src/model/index.ts` CRUD methods) to throw clear error: `if (!Model[kDatabase]?.isConnected()) throw new Error('Database not connected')`

### Blocking Document Defaults in insertMany

**What happens:** `insertMany()` iterates documents with async/await in forEach, but forEach doesn't wait for promises (`src/model/index.ts:303-305`):
```typescript
documents.forEach(async (doc) => {
  await this.preMethod[METHODS.INSERT_MANY].bind(doc)(options);
});
```

**Why it's wrong:** Pre-method hooks may not complete before insertMany() is called; document transformations could be skipped.

**Do this instead:** Use Promise.all with map instead of forEach:
```typescript
await Promise.all(documents.map(doc => 
  this.preMethod[METHODS.INSERT_MANY].bind(doc)(options)
));
```

### Missing Null Checks on Collection

**What happens:** Model methods assume `collection` is always defined after calling `getCollection()`, but if db is disconnected, it could return undefined.

**Why it's wrong:** Code assumes Database is connected; null/undefined collection crashes with "Cannot read property 'insertOne' of undefined".

**Do this instead:** Check collection before use:
```typescript
const collection = Model[kDatabase]?.getCollection<ModelType>(this.collectionName);
if (!collection) throw new Error(`Collection not found: ${this.collectionName}`);
```

## Error Handling

**Strategy:** MongoDB errors wrapped in MongoError with JSON serialization for clarity.

**Patterns:**
- Insert/insertMany errors: Wrap with `throw new MongoError(JSON.stringify(err, null, 2))` (`src/model/index.ts:295, 318`)
- Connection errors: Let MongoClient.connect() throw native errors (unhandled in library)
- Method authorization errors: Throw custom Error with message including method name and collection name (`src/database/index.ts:316-318`)
- Validation errors: MongoDB server validates at collection update time via JSON Schema validator

## Cross-Cutting Concerns

**Logging:** None built-in; library is silent. Users must add logging at application layer.

**Validation:** JSON Schema validator applied at MongoDB server level during collection modification. Schema built by `schemaValidatorBuilder()` which adds `_id` field and `additionalProperties: false` recursively (`src/model/index.ts:132-179`).

**Authentication:** Connection authentication via URI or username/password config. Environment variables override config values in constructor (`src/database/index.ts:63-71`).

**Transaction Support:** Available via `withTransaction()` method which creates ClientSession and manages begin/commit/rollback (`src/database/index.ts:289-307`).

---

*Architecture analysis: 2026-07-03*
