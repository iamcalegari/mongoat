# External Integrations

**Analysis Date:** 2026-07-03

## APIs & External Services

**MongoDB:**
- Primary data service for all persistence operations
  - SDK/Client: `mongodb` 7.0.0
  - Connection: Via `MongoClient` in `src/database/index.ts`
  - Auth: Username/password via environment variables or DatabaseConfig

## Data Storage

**Databases:**
- MongoDB (required)
  - Connection: Configurable via `MONGODB_URI`, `MONGODB_USERNAME`, `MONGODB_PASSWORD` env vars
  - Client: MongoDB driver 7.0.0 (`MongoClient` class)
  - Default connection: `mongodb://127.0.0.1:27017/` (local development)
  - Database name: Configurable via `MONGODB_DB_NAME` env var or config object

**File Storage:**
- Local filesystem only - No cloud storage integration

**Caching:**
- None configured - All queries hit MongoDB directly

## Authentication & Identity

**Auth Provider:**
- Custom MongoDB authentication
  - Implementation: Credentials passed via config object or environment variables
  - Supported: Username/password authentication
  - Connection URL templating with credentials in `src/database/index.ts` (lines 63-71)

## Monitoring & Observability

**Error Tracking:**
- None detected - No external error tracking service configured

**Logs:**
- Console-based logging only (examples use `console.log()`)
- No structured logging framework integrated

## CI/CD & Deployment

**Hosting:**
- Not specified - Library is framework-agnostic and can be used in any Node.js environment

**CI Pipeline:**
- None configured - No GitHub Actions, CircleCI, or similar detected

## Environment Configuration

**Required env vars:**
- `MONGODB_URI` - MongoDB connection string (optional if using default local instance)
- `MONGODB_USERNAME` - Database authentication username (optional if not using credentials)
- `MONGODB_PASSWORD` - Database authentication password (optional if not using credentials)
- `MONGODB_DB_NAME` - Target database name (optional, defaults from config.dbName)
- `NODE_ENV` - Set to "production" to enable strict MongoDB API versioning and deprecation error handling

**Secrets location:**
- Environment variables only (via `.env` or shell environment)
- No secrets management system integrated (e.g., Vault, AWS Secrets Manager)

## Webhooks & Callbacks

**Incoming:**
- None - This is a library, not a server

**Outgoing:**
- None configured - All operations are synchronous queries/commands to MongoDB

## Validation

**Schema Validation:**
- Package: `json-schema` 0.4.0
- Purpose: Validates documents against JSON Schema specifications before storage
- Integration: Model validation in `src/model/index.ts`

## BSON Serialization

**Package:** `bson` 7.0.0
- Purpose: Handles BSON encoding/decoding for MongoDB wire protocol
- Automatic: Integrated into mongodb driver, transparent to library users

---

*Integration audit: 2026-07-03*
