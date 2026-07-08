<!-- GSD:project-start source:PROJECT.md -->

## Project

**Mongoat**

Mongoat é um ODM (Object Document Mapper) leve, rápido e type-safe para MongoDB em Node.js/TypeScript, publicado no npm como `@iamcalegari/mongoat`. Oferece uma API moderna sobre o driver oficial sem escondê-lo: models com CRUD completo, validação server-side por JSON Schema, hooks de transformação e controle de métodos permitidos via Proxy — para desenvolvedores que querem produtividade de ODM mantendo controle total do MongoDB nativo.

**Core Value:** Ser um ODM fino e extensível: produtividade de ODM sem abrir mão do controle e do acesso direto ao driver nativo do MongoDB.

### Constraints

- **Arquitetura**: manter a arquitetura atual baseada em Proxy (gating de métodos e registro de models) — decisão do autor
- **Dependências**: mínimo possível de dependências de runtime; preferir recursos nativos do driver oficial
- **Segurança**: seguir as boas práticas de segurança e desenvolvimento recomendadas pelo MongoDB (validação server-side, credenciais via env vars, `serverApi` strict em produção, queries injection-safe)
- **Compatibilidade**: Node `^20.19.0 || >=22.12.0`; driver `mongodb` v7; TypeScript 5.x
- **Distribuição**: pacote npm público — mudanças de API exigem versionamento semântico disciplinado

<!-- GSD:project-end -->

<!-- GSD:stack-start source:codebase/STACK.md -->

## Technology Stack

## Languages

- TypeScript 5.9.3 - Entire codebase with strict mode enabled, ES2022 target compilation
- JavaScript - Configuration files (eslint.config.js)

## Runtime

- Node.js `^20.19.0 || >=22.12.0`
- ES2022 target (modern JavaScript features supported)
- npm (no lockfile present - likely auto-generated at install)

## Frameworks

- MongoDB Driver 7.0.0 - Database connectivity and operations
- BSON 7.0.0 - Binary JSON serialization for MongoDB communication
- TypeScript 5.9.3 - Language and compilation
- ts-node-dev 2.0.0 - Development server with hot reloading
- ts-jest 29.4.6 - Jest test runner with TypeScript support
- tsc-alias 1.8.16 - Path alias resolution in compiled output
- tsconfig-paths 4.2.0 - Path aliasing support for imports
- ESLint 9.39.2 - Code linting and standards
- @typescript-eslint/parser 8.50.0 - TypeScript parsing for ESLint
- @typescript-eslint/eslint-plugin 8.50.0 - TypeScript-specific ESLint rules
- typescript-eslint 8.50.0 - Combined ESLint/TypeScript tooling
- Prettier 3.7.4 - Code formatting (2-space tabs, trailing commas, single quotes)
- rimraf 6.1.2 - Cross-platform file/directory deletion
- tslib 2.8.1 - TypeScript helper library
- typescript-cached-transpile 0.0.6 - Optimized TypeScript transpilation caching

## Key Dependencies

- mongodb 7.0.0 - Connects to and queries MongoDB databases; enables all ODM functionality
- bson 7.0.0 - Serializes/deserializes BSON data; essential for MongoDB communication
- json-schema 0.4.0 - Validates documents against JSON Schema specifications
- tslib 2.8.1 - Reduces compiled code size by reusing TypeScript helpers
- tsc-alias 1.8.16 - Ensures path aliases (`@/*`, `@utils/*`, etc.) work in compiled JavaScript

## Configuration

- Connection managed via environment variables:
- `tsconfig.json` - TypeScript compilation with ES2022 target, module: "NodeNext"
- `tsconfig.build.json` - Build-specific config, includes only `src/**/*`
- `eslint.config.js` - ESLint with TypeScript support, recommended rules
- `.prettierrc` - Prettier formatting (2-space indent, trailing commas, semicolons, single quotes)

## Platform Requirements

- Node.js `^20.19.0 || >=22.12.0`
- npm or yarn or pnpm (package manager)
- Node.js `^20.19.0 || >=22.12.0`
- MongoDB server (local or remote)
- No explicit deployment platform specified; library is framework-agnostic

## Build & Distribution

- `lib/` - Compiled JavaScript and type declarations
- Source maps included (separate `.map` files)
- TypeScript declaration files (`.d.ts`)
- Main: `lib/index.js`
- Module: `lib/index.js` (dual export)
- Types: `lib/index.d.ts`
- Subpath exports: `./database`, `./model`, `./utils`, `./types` with separate entry points

<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->

## Conventions

## Naming Patterns

- PascalCase without prefix
- Examples: `Database`, `Model`
- Location: `src/database/index.ts`, `src/model/index.ts`
- camelCase for all function and method names
- Examples: `connect()`, `disconnect()`, `findMany()`, `updateMany()`, `setupCollections()`
- Verb-first pattern for action methods (find, insert, update, delete, total)
- Location: `src/database/index.ts:95-130`, `src/model/index.ts:204-256`
- UPPER_SNAKE_CASE for enum members
- Examples: `METHODS.UPDATE`, `METHODS.INSERT`, `METHODS.FIND_MANY`, `CUSTOM_VALIDATION.UNIQUE`
- Location: `src/utils/enums.ts`
- PascalCase without "I" prefix
- Props suffix for configuration/parameter objects: `CreateModelProps`, `CreateIndexProps`
- Schema suffix for validation schemas: `ModelValidationSchema`
- Config suffix for configuration types: `DatabaseConfig`
- Examples: `DatabaseConfig`, `CreateModelProps`, `ModelValidationSchema`, `DefaultProperties`
- Location: `src/types/database.ts`, `src/types/model.ts`
- camelCase for all instance properties and local variables
- Examples: `username`, `firstName`, `lastName`, `collectionName`, `documentDefaults`
- Location: `src/model/index.ts:38-67`, `examples/model/model.ts:20-26`
- Symbol-based with lowercase `k` prefix for private fields
- Pattern: `const kPrivateName = Symbol('kPrivateName');`
- Examples: `kClient`, `kDb`, `kConnectionUrl`, `kCreateClientConnection`, `kDatabase`
- Used with bracket notation: `this[kClient]`, `Model[kDatabase]`
- Location: `src/database/index.ts:15-22`, `src/model/index.ts:35`
- Rationale: Prevents accidental access and property enumeration
- PascalCase starting with T: `ModelType`, `T`
- Example: `Model<ModelType extends Document>`
- Location: `src/model/index.ts:37`

## Code Style

- Tool: Prettier 3.7.4
- Config file: `.prettierrc`
- Indentation: 2 spaces
- Line endings: LF
- Quotes: Single quotes (')
- Semicolons: Required
- Trailing commas: ES5 style (objects and arrays, not function parameters)
- See: `.prettierrc`
- Tool: ESLint 9.39.2
- Parser: @typescript-eslint/parser 8.50.0
- Plugin: @typescript-eslint 8.50.0
- Configuration: ESLint recommended + TypeScript recommended rules
- Config file: `eslint.config.js`
- Applies to: .ts and .tsx files

## Import Organization

- `@/*` → `src/*` (main source)
- `@examples/*` → `examples/*` (example files)
- `@test/*` → `test/*` (test files)
- `@types/*` → `src/types/*` (type definitions)
- `@utils/*` → `src/utils/*` (utility functions)
- Defined in: `tsconfig.json:42-48`
- Modules export from index files to group related exports
- Examples: `src/index.ts`, `src/utils/index.ts`
- Location: `src/index.ts`, `src/utils/index.ts`

## Error Handling

- try-catch blocks for database operations that may throw
- Throw `MongoatError` or a subclass: `MongoatValidationError`, `MongoatConnectionError`, `MongoatDriverError`
- Errors are never serialized with `JSON.stringify()`; `.message` is stable and sanitized (no stack traces or internal details)
- `.cause` preserves the original driver/underlying error for deliberate inspection
- Consumers discriminate by `instanceof` and by the stable `.code` field (e.g. `INVALID_OBJECT_ID`)

## Logging

- Direct `console.log()` calls
- Emoji used in examples for visual clarity (🔌, ⚙️)
- Output comments show expected results
- Location: `examples/model/usage.ts:9-13`, `examples/connection.ts:48`

## Comments

- Used for public methods and exported functions
- Format: `/** @public */` for public API
- Format: `/** @private */` for internal implementation
- Format: `/** @deprecated */` for deprecated methods
- Include @see links to documentation when applicable
- Location: `src/database/index.ts:36-53`, `src/model/index.ts:181-191`
- Multi-line comments explain complex logic
- Comments above code blocks provide context
- Output examples shown in comments with `// Expected output`
- Location: `examples/connection.ts:8-27`, `examples/model/usage.ts:24`
- Use `@see` tag to link to GitHub documentation
- Location: `examples/model/model.ts:2`, `examples/model/usage.ts:2`

## TypeScript Strictness

- `strict: true` - Enables all strict type checking options
- `alwaysStrict: true` - Emit 'use strict' in output
- `noEmitOnError: true` - Never emit error-filled code
- `noImplicitReturns: true` - Error on functions missing return statements
- `noImplicitOverride: true` - Error on overridden methods without override keyword
- `forceConsistentCasingInFileNames: true` - Disallow inconsistent casing
- Location: `tsconfig.json:2-35`

## Function Design

- Single responsibility principle observed
- Methods focused on specific operations (CRUD operations)
- Average method length 15-30 lines (excluding JSDoc)
- Use destructuring for complex parameter objects
- Type all parameters explicitly
- Default values used for optional parameters
- Example: `async update(filter: Filter<ModelType>, update: UpdateFilter<ModelType>, options: FindOneAndUpdateOptions = {})`
- Location: `src/model/index.ts:204-207`
- Async functions return `Promise<T>` explicitly
- Void functions return nothing or `Promise<void>`
- Return type assertions used where needed: `as unknown as T`
- Null returns use `?? null` pattern
- Location: `src/model/index.ts:258-263`

## Module Design

- Barrel exports used to group related exports
- Re-export from sub-modules through index files
- Location: `src/index.ts`, `src/utils/index.ts`
- Single class per file with related symbols/types
- Static methods for factory or utility operations
- Symbol-based private storage for true encapsulation
- Private methods prefixed with underscore in documentation but using Symbols in code
- Location: `src/database/index.ts`, `src/model/index.ts`

## Proxy Pattern

- Proxy pattern used for method authorization
- Prevents calling disallowed methods on models
- Static method returns proxy handler
- Location: `src/database/index.ts:309-330`

## Pre-method Pattern

- Methods registered as `preMethod[METHODS.X]` for hooks
- Called with `.bind()` to set context
- Used for data transformation before database operations
- Location: `src/model/index.ts:54-67`, `src/model/index.ts:181-194`

<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->

## Architecture

## System Overview

```text

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

- **Single Database Instance:** Manages all database connections and models globally
- **Symbol-Based Encapsulation:** Private fields use Symbol keys (e.g., `kClient`, `kDb`) to prevent accidental access
- **Proxy Authorization:** Model methods are wrapped with Proxy to enforce `allowedMethods` restrictions
- **Schema Validation:** JSON Schema validation applied at collection creation time
- **Pre-Method Hooks:** Middleware pattern via `pre()` method allows transforming data before operations
- **Environment-Driven Config:** Connection details default to env vars (MONGODB_URI, MONGODB_USERNAME, MONGODB_PASSWORD, MONGODB_DB_NAME)
- **Document Defaults:** Each model can specify default values applied to all inserted documents

## Layers

- Purpose: Manage MongoDB connections and model lifecycle
- Location: `src/database/index.ts`
- Contains: MongoClient management, model registry, collection initialization
- Depends on: mongodb@7.0.0, Model class
- Used by: Application code (bootstrapping phase)
- Purpose: Provide typed collection operations with validation and middleware
- Location: `src/model/index.ts`
- Contains: CRUD methods (insert, find, update, delete), aggregation, bulk operations
- Depends on: MongoDB Collection, Types, METHODS enum
- Used by: Application code (query phase)
- Purpose: Provide TypeScript definitions for configuration and constraints
- Location: `src/types/`
- Contains: DatabaseConfig, CreateModelProps, ModelValidationSchema, CreateIndexProps
- Depends on: json-schema@0.4.0, mongodb types
- Used by: Database, Model, and user code
- Purpose: Provide enums and helper functions
- Location: `src/utils/`
- Contains: METHODS enum (12 operations), CUSTOM_VALIDATION enum, toObjectId converter
- Depends on: bson library
- Used by: Database, Model, user code

## Data Flow

### Primary Request Path: Insert Document

### Secondary Flow: Database Connection and Setup

### Authorization Flow: Method Restriction

- **Database connection state:** Stored in private symbols `[kClient]` and `[kDb]` on Database instance
- **Model registry:** Static Map on Database class: `Database[KModelMap]`
- **Model state:** Each Model instance maintains `collectionName`, `indexes`, `validator`, `allowedMethods`, `documentDefaults`
- **Pre-method hooks:** Per-model storage in `Model.preMethod` Record (12 METHODS keys)

## Key Abstractions

- Purpose: Singleton connection manager and model registry
- Examples: `src/database/index.ts` (413 lines)
- Pattern: Static methods for model management, instance methods for connection lifecycle
- Purpose: Typed collection wrapper with middleware and validation
- Examples: `src/model/index.ts` (393 lines)
- Pattern: Instance methods for CRUD, static reference to Database via symbol
- Purpose: JSON Schema extension for MongoDB document validation
- Examples: `src/types/model.ts:54-62`
- Pattern: Extended JSONSchema4 with `bsonType` field and MongoDB-specific constraints
- Purpose: Type-safe index definition matching MongoDB spec
- Examples: `src/types/model.ts:11-13`
- Pattern: Composition of IndexSpecification and CreateIndexesOptions

## Entry Points

- Location: `src/index.ts`
- Triggers: Import statement from consuming application
- Responsibilities: Export Database, Model, types, and utilities
- Location: User code (see `examples/model/usage.ts`)
- Triggers: Application startup
- Responsibilities:
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

### Blocking Document Defaults in insertMany

```typescript

```

```typescript

```

### Missing Null Checks on Collection

```typescript

```

## Error Handling

- Driver errors (insert/insertMany/etc.): wrapped as `MongoatDriverError` via `wrapDriverError`, preserving `.cause` and a stable `.code` (e.g. `DUPLICATE_KEY`) — never re-serialized with `JSON.stringify()` (`src/model/index.ts`)
- Validation errors (ObjectId inválido, schema, filtro proibido): thrown as `MongoatValidationError` with `.code` (e.g. `INVALID_OBJECT_ID`, `FORBIDDEN_OPERATOR`, `VALIDATION_FAILED`)
- Connection/config errors (sem conexão, dbName ausente): thrown as `MongoatConnectionError` with `.code` (e.g. `NOT_CONNECTED`)
- Method authorization errors: Throw custom Error with message including method name and collection name (`src/database/index.ts:316-318`)
- Validation errors: MongoDB server validates at collection update time via JSON Schema validator

## Cross-Cutting Concerns

<!-- GSD:architecture-end -->

<!-- GSD:skills-start source:skills/ -->

## Project Skills

No project skills found. Add skills to any of: `.claude/skills/`, `.agents/skills/`, `.cursor/skills/`, `.github/skills/`, or `.codex/skills/` with a `SKILL.md` index file.
<!-- GSD:skills-end -->

<!-- GSD:workflow-start source:GSD defaults -->

## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:

- `/gsd-quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd-debug` for investigation and bug fixing
- `/gsd-execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->

<!-- GSD:profile-start -->

## Developer Profile

> Profile not yet configured. Run `/gsd-profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->
