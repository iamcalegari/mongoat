# Codebase Concerns

**Analysis Date:** 2026-07-03

## Tech Debt

### Alpha Status and Incomplete Documentation

- Issue: Project is released as v1.0.34-alpha, indicating incomplete development and API stability
- Files: `package.json`, `README.md`
- Impact: Breaking changes may occur in minor versions; users relying on this library face potential upgrade risks
- Fix approach: Release v1.0.0 stable after comprehensive testing and API stabilization

### Disabled TypeScript Type Safety Feature

- Issue: `useUnknownInCatchVariables` is disabled in `tsconfig.json` (line 39), with a TODO comment indicating this should be enabled
- Files: `tsconfig.json`, `src/model/index.ts` (line 294, 317, 380)
- Impact: Catch block error variables are typed as `any`, allowing unsafe operations on errors without type checking; errors are stringified and re-wrapped as MongoError without preserving original error details
- Fix approach: Enable `useUnknownInCatchVariables: true` and add proper error type assertions in catch blocks (lines 294, 317, 380)

### Incomplete README and Feature Documentation

- Issue: README header states "_🚧 This documentation is a work in progress so it may be incomplete or incorrect._"
- Files: `README.md` (line 14)
- Impact: Users cannot rely on documentation for implementation guidance; API usage examples may be incomplete or incorrect
- Fix approach: Complete README with all features, API documentation, advanced usage patterns, and error handling guidelines

## Known Bugs

### Pre-hooks Not Awaited in insertMany

- Symptoms: When inserting multiple documents, pre-method hooks are called with `forEach` and `async/await` but the promises are not awaited, causing hooks to execute after the insert operation begins
- Files: `src/model/index.ts` (line 303-305)
- Trigger: Call `insertMany()` with documents that rely on pre-hook transformations
- Workaround: Use `insert()` in a loop instead of `insertMany()` to ensure pre-hooks execute before insert

### Method Binding Not Applied

- Symptoms: In database proxy handler (line 324), method is bound but the binding is not returned or used; the original unbound method is returned instead
- Files: `src/database/index.ts` (line 324)
- Trigger: Call a model method through the proxy handler when `typeof originalMethod === 'function'`
- Workaround: Methods may lose `this` context in edge cases if called in certain patterns

### find() Method Returns Inconsistent Types

- Symptoms: `find()` method signature indicates it returns `Promise<WithId<ModelType> | null> | null`, mixing Promise and non-Promise return types
- Files: `src/model/index.ts` (line 325-331)
- Trigger: Call `find()` and try to use result as sync value
- Workaround: Always await result; the actual behavior is async despite type signature

## Security Considerations

### Unvalidated ObjectId Creation

- Risk: `toObjectId()` function creates new ObjectId without validation; invalid string formats could throw uncaught errors or create unintended IDs
- Files: `src/utils/database.ts` (line 14), called from `src/model/index.ts` (line 335)
- Current mitigation: None; MongoDB driver will throw if invalid format provided
- Recommendations: Add try-catch wrapper around `toObjectId()` calls, validate input format before conversion, or document that invalid IDs will throw

### Error Messages Exposed in JSON Stringify

- Risk: Catch blocks stringify entire error objects without filtering, potentially exposing internal stack traces or sensitive data
- Files: `src/model/index.ts` (lines 295, 318, 381)
- Current mitigation: None; errors are converted to JSON strings and re-thrown as MongoError
- Recommendations: Implement error sanitization to exclude stack traces in production; log full errors server-side but return sanitized messages to clients

### No Input Sanitization for Filters and Updates

- Risk: User-provided filters and updates are passed directly to MongoDB without validation; users could inadvertently inject malicious operators
- Files: `src/model/index.ts` (update method on line 204, updateMany on line 232, deleteMany on line 266, etc.)
- Current mitigation: MongoDB JSON Schema validator provides some protection, but only if validation is enabled
- Recommendations: Add input validation helpers; document that schema validation should always be enabled in production

## Performance Bottlenecks

### Index Recreation on Every Collection Setup

- Problem: `setupIndexes()` drops and recreates all indexes every time the collection is set up
- Files: `src/database/index.ts` (lines 360-374)
- Cause: Line 367 calls `dropIndexes()` unconditionally before creating indexes
- Improvement path: Check if indexes exist and match before dropping; only recreate if schema has changed

### No Connection Pooling Configuration Exposed

- Problem: MongoClient connection pooling options are not exposed via DatabaseConfig, defaulting to MongoDB driver settings
- Files: `src/types/database.ts`, `src/database/index.ts` (line 379)
- Cause: DatabaseConfig only extends MongoClientOptions but doesn't explicitly document or default pool size
- Improvement path: Document MongoClientOptions in DatabaseConfig, provide sensible defaults (maxPoolSize, minPoolSize), allow override

### Synchronous Model Lookup in Constructor

- Problem: Model constructor performs synchronous lookup in static map without debouncing; repeated instantiation of same model could be slow
- Files: `src/model/index.ts` (line 76-79)
- Cause: No caching strategy for duplicate model lookups
- Improvement path: Add simple Model instance cache to avoid repeated constructor calls for same collection

### Schema Validation Applied to Every Document

- Problem: If schema validation is enabled, every insert/update must pass through MongoDB validation, adding latency
- Files: `src/database/index.ts` (lines 252-264)
- Cause: Validation is performed server-side by default when enabled
- Improvement path: Document trade-offs; consider client-side pre-validation option to catch errors earlier

## Fragile Areas

### Static Model Registry with No Thread Safety

- Files: `src/database/index.ts` (line 34, 207-212)
- Why fragile: The static `KModelMap` is a mutable Map accessed from multiple places; in concurrent scenarios (worker threads, async operations), race conditions could occur during model registration
- Safe modification: Use a Promise-based registry pattern or lock mechanism for concurrent access
- Test coverage: No tests exist for concurrent model registration

### Type Casting Assumptions Throughout Model Class

- Files: `src/model/index.ts` (lines 197-199, 216-218, 242-245, 259-261, 267-269, 285-287, 312-314, 326-328, 341-343, 351-353, 375-377)
- Why fragile: Heavy use of `as Collection<ModelType>` without null checks; if `getCollection()` returns undefined (when DB not connected), subsequent calls will fail
- Safe modification: Add explicit null checks before collection operations; throw clear error if collection is unavailable
- Test coverage: No tests for operations when database is disconnected

### Schema Validator Builder Mutates Input

- Files: `src/model/index.ts` (lines 161-179)
- Why fragile: `includeAdditionalPropertiesFalse()` mutates the schema object in place; if schema is reused across models, changes will affect all models
- Safe modification: Clone schema before mutation or use immutable update pattern
- Test coverage: No tests for reused schemas

### Collection May Be Undefined

- Files: `src/model/index.ts` (lines 196-202, 258-264, 266-272, etc.)
- Why fragile: `getCollection()` can return undefined if database is not connected, but code assumes it's always present using the `as` operator
- Safe modification: Check for undefined collection before use; throw descriptive error if not found
- Test coverage: No error handling tests

### Model Initialization Race Condition

- Files: `src/model/index.ts` (lines 71-79)
- Why fragile: Constructor checks `if (!!model)` and returns early, but this check happens after acquiring reference; two concurrent constructor calls for same collection could both pass the check
- Safe modification: Use Promise.resolve() pattern or lock to ensure atomic check-and-set
- Test coverage: No concurrency tests exist

## Scaling Limits

### Static Global Model Map Never Garbage Collected

- Current capacity: Unbounded; models stay in memory for application lifetime
- Limit: Long-running applications with many dynamic collections will accumulate models in `KModelMap` with no cleanup
- Scaling path: Implement model eviction policy (TTL, LRU) or provide explicit `unregisterModel()` method

### No Query Optimization Hints

- Current capacity: All queries execute as-is without hint optimization
- Limit: Complex queries may use inefficient execution plans even with indexes present
- Scaling path: Add `hint()` parameter support to query methods; document index strategy

### Schema Recursion Depth Not Limited

- Current capacity: Unbounded recursion in `includeAdditionalPropertiesFalse()`
- Limit: Deeply nested schemas could cause stack overflow or exponential complexity
- Scaling path: Add recursion depth limit; validate schema structure at setup time

## Dependencies at Risk

### json-schema v0.4.0 (Old and Unmaintained)

- Risk: Package is very old; newer versions of json-schema may have security patches or features that are unavailable
- Impact: JSON Schema validation may not support modern features; potential security vulnerabilities in schema parsing
- Migration plan: Upgrade to latest json-schema version or consider using ajv (more actively maintained JSON Schema validator)

### ts-jest 29.4.6 Installed but Unused

- Risk: Test framework is declared in devDependencies but no test files or test script exists
- Impact: Dead dependency increases bundle size; confuses developers about testing strategy
- Migration plan: Remove if testing is deferred; or implement test suite and activate test script

## Missing Critical Features

### No Unique Constraint Enforcement

- Problem: Schema supports `CUSTOM_VALIDATION.UNIQUE` enum (line 17 in enums.ts) but it's never implemented or used anywhere
- Blocks: Cannot enforce uniqueness at application level; only MongoDB validator enforces it if schema includes it
- Fix approach: Implement unique validation in schema builder or document that users must handle via MongoDB indexes

### No Transaction Rollback on Error

- Problem: `withTransaction()` method (lines 289-307) doesn't handle errors in pre-hooks or document processing before transaction begins
- Blocks: Multi-document transactions may be inconsistent if pre-hooks fail
- Fix approach: Add comprehensive try-catch in transaction wrapper; implement compensating transaction pattern

### No Audit/Change History Tracking

- Problem: No built-in support for tracking document changes over time
- Blocks: Applications requiring audit trails must implement custom solution
- Fix approach: Add optional `auditLog` option to model setup; automatically track changes via pre-hooks

### No Soft Delete Support

- Problem: `delete()` and `deleteMany()` permanently remove documents; no soft delete pattern built in
- Blocks: Applications needing soft deletes must implement custom approach
- Fix approach: Add optional `softDelete` flag to model setup; automatically add `deletedAt` field and filter queries

## Test Coverage Gaps

### No Unit Tests Exist

- What's not tested: All model methods (insert, find, update, delete, etc.), schema validation, index creation, error handling, concurrency
- Files: Entire `src/` directory
- Risk: Breaking changes go undetected; existing bugs may be introduced during refactoring
- Priority: High - This is a library used by other projects; test coverage is critical

### No Integration Tests

- What's not tested: Database connection, collection setup, validator application, transaction behavior, concurrent operations
- Files: `src/database/index.ts`, connection logic
- Risk: Database integration issues and race conditions discovered only in production
- Priority: High

### No Error Scenario Tests

- What's not tested: Invalid ObjectIds, missing collections, schema validation failures, concurrent model registration, connection drops
- Files: Error handling paths throughout `src/`
- Risk: Error messages may be unclear; error recovery may fail silently
- Priority: Medium

### No Performance Tests

- What's not tested: Bulk insert performance, large dataset queries, index effectiveness, connection pooling behavior
- Files: `src/model/index.ts`, `src/database/index.ts`
- Risk: Performance regressions introduced without detection; scaling issues discovered too late
- Priority: Medium

### No Concurrency/Async Tests

- What's not tested: Concurrent model instantiation, parallel database operations, transaction isolation, pre-hook timing
- Files: `src/model/index.ts`, `src/database/index.ts`
- Risk: Race conditions and timing bugs in concurrent scenarios
- Priority: High

---

*Concerns audit: 2026-07-03*
