# Technology Stack

**Analysis Date:** 2026-07-03

## Languages

**Primary:**
- TypeScript 5.9.3 - Entire codebase with strict mode enabled, ES2022 target compilation

**Secondary:**
- JavaScript - Configuration files (eslint.config.js)

## Runtime

**Environment:**
- Node.js >=16.20.1
- ES2022 target (modern JavaScript features supported)

**Package Manager:**
- npm (no lockfile present - likely auto-generated at install)

## Frameworks

**Core:**
- MongoDB Driver 7.0.0 - Database connectivity and operations
- BSON 7.0.0 - Binary JSON serialization for MongoDB communication

**Development & Build:**
- TypeScript 5.9.3 - Language and compilation
- ts-node-dev 2.0.0 - Development server with hot reloading
- ts-jest 29.4.6 - Jest test runner with TypeScript support
- tsc-alias 1.8.16 - Path alias resolution in compiled output
- tsconfig-paths 4.2.0 - Path aliasing support for imports

**Linting & Code Quality:**
- ESLint 9.39.2 - Code linting and standards
- @typescript-eslint/parser 8.50.0 - TypeScript parsing for ESLint
- @typescript-eslint/eslint-plugin 8.50.0 - TypeScript-specific ESLint rules
- typescript-eslint 8.50.0 - Combined ESLint/TypeScript tooling

**Formatting:**
- Prettier 3.7.4 - Code formatting (2-space tabs, trailing commas, single quotes)

**Build & Utilities:**
- rimraf 6.1.2 - Cross-platform file/directory deletion
- tslib 2.8.1 - TypeScript helper library
- typescript-cached-transpile 0.0.6 - Optimized TypeScript transpilation caching

## Key Dependencies

**Critical:**
- mongodb 7.0.0 - Connects to and queries MongoDB databases; enables all ODM functionality
- bson 7.0.0 - Serializes/deserializes BSON data; essential for MongoDB communication
- json-schema 0.4.0 - Validates documents against JSON Schema specifications

**Infrastructure:**
- tslib 2.8.1 - Reduces compiled code size by reusing TypeScript helpers
- tsc-alias 1.8.16 - Ensures path aliases (`@/*`, `@utils/*`, etc.) work in compiled JavaScript

## Configuration

**Environment:**
- Connection managed via environment variables:
  - `MONGODB_URI` - MongoDB connection string
  - `MONGODB_USERNAME` - Database username
  - `MONGODB_PASSWORD` - Database password
  - `MONGODB_DB_NAME` - Default database name
  - `NODE_ENV` - Enables production optimizations (API versioning, strict mode)

**Build:**
- `tsconfig.json` - TypeScript compilation with ES2022 target, module: "NodeNext"
- `tsconfig.build.json` - Build-specific config, includes only `src/**/*`
- `eslint.config.js` - ESLint with TypeScript support, recommended rules
- `.prettierrc` - Prettier formatting (2-space indent, trailing commas, semicolons, single quotes)

## Platform Requirements

**Development:**
- Node.js 16.20.1 or higher
- npm or yarn or pnpm (package manager)

**Production:**
- Node.js 16.20.1 or higher
- MongoDB server (local or remote)
- No explicit deployment platform specified; library is framework-agnostic

## Build & Distribution

**Build Process:**
```bash
npm run build        # Compiles TypeScript, runs tsc-alias for path resolution
npm run prebuild     # Cleans lib/ directory before build
npm run example      # Runs TypeScript files directly via ts-node
```

**Outputs:**
- `lib/` - Compiled JavaScript and type declarations
- Source maps included (separate `.map` files)
- TypeScript declaration files (`.d.ts`)

**Package Exports:**
- Main: `lib/index.js`
- Module: `lib/index.js` (dual export)
- Types: `lib/index.d.ts`
- Subpath exports: `./database`, `./model`, `./utils`, `./types` with separate entry points

---

*Stack analysis: 2026-07-03*
