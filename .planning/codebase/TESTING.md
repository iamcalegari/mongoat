# Testing Patterns

**Analysis Date:** 2026-07-03

## Current State

**Status:** No tests currently implemented in this codebase.

- No test files (*.test.ts, *.test.tsx, *.spec.ts, *.spec.tsx)
- No test directory structure
- No test runner configured in package.json scripts
- No jest.config.js or vitest.config.js files

Despite no tests being present, the project has infrastructure in place for testing:

## Test Framework Setup

**Installed but Unconfigured:**
- Package: `ts-jest` version 29.4.6 (installed in devDependencies)
- Config file: Not present (needs to be created)
- Run command: Not present (needs to be added to package.json scripts)

**TypeScript Integration:**
- Path alias resolution available: `tsconfig.json:42-48` defines @/, @types/, @utils/, @test/
- ts-node available for running TypeScript directly
- ts-node configuration for transpile-only mode: `tsconfig.json:51-55`

## Recommended Testing Configuration

**To Enable Testing, Add to `package.json`:**

```json
{
  "scripts": {
    "test": "jest",
    "test:watch": "jest --watch",
    "test:coverage": "jest --coverage"
  },
  "devDependencies": {
    "jest": "^29.0.0",
    "@types/jest": "^29.0.0"
  }
}
```

**Create `jest.config.js` in project root:**

```javascript
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src', '<rootDir>/test'],
  testMatch: ['**/__tests__/**/*.ts', '**/?(*.)+(spec|test).ts'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@types/(.*)$': '<rootDir>/src/types/$1',
    '^@utils/(.*)$': '<rootDir>/src/utils/$1',
    '^@examples/(.*)$': '<rootDir>/examples/$1',
    '^@test/(.*)$': '<rootDir>/test/$1',
  },
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/index.ts',
  ],
  coveragePathIgnorePatterns: [
    '/node_modules/',
    '/lib/',
  ],
};
```

## Recommended Test File Organization

**Directory Structure:**

```
project-root/
├── src/                    # Source files
│   ├── database/
│   ├── model/
│   ├── types/
│   ├── utils/
│   └── index.ts
├── test/                   # Test files
│   ├── database/
│   │   └── database.test.ts
│   ├── model/
│   │   └── model.test.ts
│   ├── utils/
│   │   └── database.utils.test.ts
│   └── fixtures/
│       ├── test-data.ts
│       └── mock-db.ts
├── jest.config.js
└── package.json
```

**Naming Convention:**
- Test files: `.test.ts` suffix preferred
- Location: Co-located with source or in parallel `test/` directory
- One test file per source module
- Example: `src/model/index.ts` → `test/model/model.test.ts`

## Suggested Test Structure

**Test Suite Organization:**

```typescript
import { Database } from '@/database';
import { Model } from '@/model';
import type { CreateModelProps } from '@/types';

describe('Model', () => {
  let database: Database;
  let model: Model;

  beforeAll(async () => {
    // Setup database connection
    database = new Database({ dbName: 'mongoat-test' });
    await database.connect();
  });

  afterAll(async () => {
    // Cleanup database connection
    await database.disconnect();
  });

  beforeEach(async () => {
    // Setup for each test
    await database.cleanCollections();
  });

  describe('insert', () => {
    it('should insert a document and return it with an _id', async () => {
      // arrange
      const document = { name: 'Test User', email: 'test@example.com' };

      // act
      const result = await model.insert(document);

      // assert
      expect(result).toHaveProperty('_id');
      expect(result.name).toBe('Test User');
    });

    it('should throw MongoError when inserting invalid document', async () => {
      // arrange
      const invalidDocument = { invalid: 'data' };

      // act & assert
      await expect(model.insert(invalidDocument)).rejects.toThrow();
    });
  });

  describe('findMany', () => {
    it('should return empty array when no documents exist', async () => {
      // act
      const result = await model.findMany();

      // assert
      expect(result).toEqual([]);
    });

    it('should return all documents matching filter', async () => {
      // arrange
      await model.insert({ name: 'User 1' });
      await model.insert({ name: 'User 2' });

      // act
      const result = await model.findMany({ name: 'User 1' });

      // assert
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('User 1');
    });
  });

  describe('update', () => {
    it('should update document and return updated version', async () => {
      // arrange
      const inserted = await model.insert({ name: 'Original' });

      // act
      const updated = await model.update(
        { _id: inserted._id },
        { $set: { name: 'Updated' } }
      );

      // assert
      expect(updated.name).toBe('Updated');
      expect(updated._id).toEqual(inserted._id);
    });
  });

  describe('delete', () => {
    it('should delete document and return it', async () => {
      // arrange
      const inserted = await model.insert({ name: 'To Delete' });

      // act
      const deleted = await model.delete({ _id: inserted._id });

      // assert
      expect(deleted.name).toBe('To Delete');

      // verify deletion
      const found = await model.find({ _id: inserted._id });
      expect(found).toBeNull();
    });
  });
});
```

## Mocking Patterns (Recommended)

**Database Mocking:**

```typescript
import { jest } from '@jest/globals';
import type { Collection } from 'mongodb';

describe('Database with mocks', () => {
  it('should handle connection errors gracefully', async () => {
    // arrange
    const mockError = new Error('Connection failed');
    const mockConnect = jest.fn().mockRejectedValue(mockError);

    const db = new Database({ dbName: 'test' });
    db.connect = mockConnect;

    // act & assert
    await expect(db.connect()).rejects.toThrow('Connection failed');
  });
});
```

**What to Mock:**
- MongoDB driver methods (for isolation testing)
- Environment variables (for testing different configs)
- External API calls (if added in future)

**What NOT to Mock:**
- Internal Model methods (test real behavior)
- Symbol-based private storage (can't mock)
- Database schema validation (test actual validation)
- Integration between Database and Model classes

## Fixtures and Test Data

**Location:** `test/fixtures/test-data.ts`

**Pattern:**

```typescript
import type { DocumentDefaults } from '@/types';

export const USER_FIXTURE = {
  username: 'testuser',
  email: 'test@example.com',
  firstName: 'Test',
  lastName: 'User',
};

export const createUserFixture = (overrides?: Partial<typeof USER_FIXTURE>) => ({
  ...USER_FIXTURE,
  ...overrides,
});
```

## Coverage

**Recommended Targets:**
- Line coverage: 80%
- Branch coverage: 75%
- Function coverage: 80%
- Statement coverage: 80%

**View Coverage:**
```bash
npm run test:coverage
```

**Output location:** `coverage/` directory (should be in .gitignore)

## Test Types

**Unit Tests:**
- Scope: Individual class methods (Model CRUD operations, Database connection methods)
- Approach: Mock MongoDB collections, test logic in isolation
- Location: `test/model/model.test.ts`, `test/database/database.test.ts`
- Example: Testing that `findMany()` returns correct filtered results

**Integration Tests:**
- Scope: Database + Model interaction, Schema validation
- Approach: Use real MongoDB test database, verify end-to-end flows
- Location: `test/integration/` (suggested)
- Example: Insert document → Verify schema validation → Retrieve → Verify data integrity

**Database Tests:**
- Scope: Connection, collection setup, transactions, cleanup
- Approach: Real database connection to test database
- Location: `test/database/database.test.ts`
- Example: Test that `setupCollections()` creates indexes correctly

**Validation Tests:**
- Scope: Schema validation and pre-method hooks
- Approach: Test Model with strict validation enabled
- Location: `test/model/validation.test.ts` (suggested)
- Example: Verify that invalid documents throw `MongoError`

## Async Testing Patterns

**Promise-based:**

```typescript
it('should handle async operations', async () => {
  const result = await model.insert({ name: 'Test' });
  expect(result).toHaveProperty('_id');
});
```

**Returning Promise:**

```typescript
it('should connect to database', () => {
  return database.connect();
});
```

**Manual timeout control:**

```typescript
it('should complete within timeout', async () => {
  jest.setTimeout(10000); // 10 second timeout
  await longRunningOperation();
}, 10000); // Jest also supports timeout as second parameter
```

## Error Testing Patterns

**Testing thrown errors:**

```typescript
it('should throw error for invalid method', async () => {
  const model = new Model({ collectionName: 'test', schema: {} });
  model.allowedMethods = []; // Method not allowed

  await expect(model.find()).rejects.toThrow(
    'The method "find" is not allowed'
  );
});
```

**Testing error types:**

```typescript
it('should throw MongoError on duplicate key', async () => {
  // Create unique index
  // Insert duplicate
  await expect(model.insert(duplicate)).rejects.toThrow(MongoError);
});
```

**Testing error messages:**

```typescript
it('should provide helpful error message', async () => {
  try {
    await model.insert(invalid);
  } catch (err: any) {
    expect(err.message).toContain('Database not found');
  }
});
```

## Pre-Method Testing

**Testing pre-hooks:**

```typescript
describe('Model.pre() hooks', () => {
  it('should execute pre-insert hook', async () => {
    const model = new Model(/* ... */);
    const transformFn = jest.fn();

    model.pre(METHODS.INSERT, transformFn);
    await model.insert({ name: 'Test' });

    expect(transformFn).toHaveBeenCalled();
  });

  it('should allow hook to modify data', async () => {
    model.pre<UserSchema>(METHODS.INSERT, function () {
      this.password = 'hashed';
    });

    const result = await model.insert({ password: 'plaintext' });

    expect(result.password).toBe('hashed');
  });
});
```

## Database Connection Testing

**Recommended approach:**

```typescript
describe('Database Connection', () => {
  let db: Database;

  beforeEach(() => {
    db = new Database({ dbName: 'mongoat-test' });
  });

  afterEach(async () => {
    await db.disconnect();
  });

  it('should connect to database', async () => {
    await expect(db.connect()).resolves.toBe('mongoat-test');
    expect(db.info()).toBeDefined();
  });

  it('should not reconnect if already connected', async () => {
    await db.connect();
    const result = db.connect();

    expect(result).toBeUndefined(); // No promise returned
  });

  it('should disconnect gracefully', async () => {
    await db.connect();
    await db.disconnect();

    // Connection should be closed
    expect(db.info()).toBeUndefined();
  });
});
```

## Running Tests

**Once configured, use:**

```bash
# Run all tests
npm test

# Run in watch mode
npm run test:watch

# Run with coverage report
npm run test:coverage

# Run specific test file
npm test -- test/model/model.test.ts

# Run tests matching pattern
npm test -- --testNamePattern="should insert"

# Run with verbose output
npm test -- --verbose
```

---

*Testing analysis: 2026-07-03*
