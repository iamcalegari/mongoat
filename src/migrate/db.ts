import type { Db } from 'mongodb';

import type { Database } from '@/database';
import { MongoatConnectionError } from '@/errors';

/**
 * @internal
 *
 * Same "fail loud before touching the driver" precondition guard already
 * established by `Database#withTransaction` — a migration operation
 * attempted against a disconnected `Database` must never silently no-op.
 *
 * WR-02: lives in its own leaf module (imports nothing from `@/migrate`)
 * specifically so both `@/migrate/runner` and `@/migrate/lock` — which
 * already import from EACH OTHER (`runner` calls `acquireLock`/
 * `releaseIfOwner`; `lock` calls this function) — can depend on it without
 * adding a THIRD edge to that cycle. `runner.ts ↔ lock.ts` is a real,
 * currently-harmless import cycle (both sides only use the other's bindings
 * at call time, never at module-load time) — see the constraint recorded
 * next to `Model ↔ Database` in the project's own architecture notes for the
 * precedent of a deliberate, documented cycle.
 */
export function getNativeDbOrThrow(database: Database): Db {
  const nativeDb = database.getDb();

  if (!nativeDb) {
    throw new MongoatConnectionError(
      'Database not connected — call db.connect() first'
    );
  }

  return nativeDb;
}
