import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { Database } from '@/database';
import { MongoatError, MongoatValidationError } from '@/errors';
import { revertMigration } from '@/migrate/runner';
import { MigrateConfig } from '@/types/migrate';

const FIXTURES_DIR = path.resolve(__dirname, '../fixtures/migrations');

/**
 * Proves reverting a migration with no `down` export throws
 * `MIGRATION_IRREVERSIBLE` — and does so BEFORE the control collection or
 * the database connection is ever touched (guard-precondition-first).
 *
 * `db` is deliberately never connected here — a fast, module-shape-only
 * check, no testcontainer round-trip required.
 */
describe('revertMigration — MIGRATION_IRREVERSIBLE', () => {
  it('throws MIGRATION_IRREVERSIBLE for a migration with no down() export, before touching the DB', async () => {
    const db = new Database({
      uri: process.env.MONGODB_URI,
      dbName: process.env.MONGODB_DB_NAME,
    });
    // Deliberately NOT connected — proves the down-export check runs before
    // any DB access (getNativeDbOrThrow would throw NOT_CONNECTED instead
    // if the guard order were wrong).

    const config: MigrateConfig = {
      dir: FIXTURES_DIR,
      collection: '_migrations_irreversible_test',
    };

    let caughtError: unknown;

    try {
      await revertMigration(db, '20260101110000', config);
    } catch (err) {
      caughtError = err;
    }

    expect(caughtError).toBeInstanceOf(MongoatValidationError);
    expect(caughtError).toBeInstanceOf(MongoatError);
    expect((caughtError as MongoatValidationError).code).toBe(
      'MIGRATION_IRREVERSIBLE'
    );
  });

  it('throws MIGRATION_NOT_FOUND for a version with no migration file on disk', async () => {
    const db = new Database({
      uri: process.env.MONGODB_URI,
      dbName: process.env.MONGODB_DB_NAME,
    });

    const config: MigrateConfig = {
      dir: FIXTURES_DIR,
      collection: '_migrations_irreversible_test',
    };

    await expect(
      revertMigration(db, '19990101000000', config)
    ).rejects.toMatchObject({ code: 'MIGRATION_NOT_FOUND' });
  });
});
