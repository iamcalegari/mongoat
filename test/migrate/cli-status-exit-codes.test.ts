import { describe, expect, it } from 'vitest';

import {
  computeStatusExitCode,
  summarizeStatusRows,
  toLockJson,
  toStatusJsonRow,
} from '@/bin/mongoat';
import type {
  LockStatus,
  MigrationLockDocument,
  MigrationStatusRow,
  MigrationStatusSummary,
} from '@/types/migrate';

/**
 * Pure summary/exit-code and JSON-projection helpers behind `mongoat
 * status` — no database, no filesystem, no process spawn, so every case
 * here runs in-memory.
 */
describe('computeStatusExitCode', () => {
  it.each([
    {
      case: 'a clean summary exits 0',
      summary: { applied: 3, drifted: 0, failed: 0, pending: 0, total: 3 },
      expected: 0,
    },
    {
      case: 'a pending-only summary exits 2',
      summary: { applied: 1, drifted: 0, failed: 0, pending: 2, total: 3 },
      expected: 2,
    },
    {
      case: 'any failed migration exits 3, outranking pending',
      summary: { applied: 0, drifted: 0, failed: 1, pending: 5, total: 6 },
      expected: 3,
    },
    {
      case: 'drift alone exits 3, even with nothing pending or failed',
      summary: { applied: 4, drifted: 1, failed: 0, pending: 0, total: 4 },
      expected: 3,
    },
    {
      case: 'an empty (nothing discovered) summary exits 0',
      summary: { applied: 0, drifted: 0, failed: 0, pending: 0, total: 0 },
      expected: 0,
    },
  ])(
    '$case',
    ({
      summary,
      expected,
    }: {
      summary: MigrationStatusSummary;
      expected: number;
    }) => {
      expect(computeStatusExitCode(summary)).toBe(expected);
    }
  );

  it('never returns 1 — an operational failure is the error boundary’s job, not this pure function', () => {
    const permutations: MigrationStatusSummary[] = [
      { applied: 0, drifted: 0, failed: 0, pending: 0, total: 0 },
      { applied: 0, drifted: 0, failed: 0, pending: 9, total: 9 },
      { applied: 0, drifted: 0, failed: 9, pending: 0, total: 9 },
      { applied: 0, drifted: 9, failed: 0, pending: 0, total: 9 },
    ];

    for (const summary of permutations) {
      expect(computeStatusExitCode(summary)).not.toBe(1);
    }
  });
});

describe('summarizeStatusRows', () => {
  it('counts an applied+drifted row into BOTH the applied and drifted tallies', () => {
    const rows: MigrationStatusRow[] = [
      { version: '1', name: 'a', applied: true, drifted: true },
      { version: '2', name: 'b', applied: true, drifted: false },
      { version: '3', name: 'c', applied: false, failed: true },
      { version: '4', name: 'd', applied: false },
    ];

    expect(summarizeStatusRows(rows)).toEqual({
      applied: 2,
      drifted: 1,
      failed: 1,
      pending: 1,
      total: 4,
    });
  });

  it('total always equals the discovered row count, even for an empty set', () => {
    expect(summarizeStatusRows([]).total).toBe(0);
  });

  it('a failed row is never also counted as applied', () => {
    const rows: MigrationStatusRow[] = [
      { version: '1', name: 'a', applied: true, failed: true },
    ];

    const summary = summarizeStatusRows(rows);

    expect(summary.failed).toBe(1);
    expect(summary.applied).toBe(0);
  });
});

describe('toStatusJsonRow', () => {
  it('a failed row projects to state "failed"', () => {
    const row: MigrationStatusRow = {
      version: '1',
      name: 'a',
      applied: false,
      failed: true,
    };

    expect(toStatusJsonRow(row).state).toBe('failed');
  });

  it('an applied+drifted row projects state "applied", drifted true, and an ISO appliedAt', () => {
    const appliedAt = new Date('2026-01-01T00:00:00Z');
    const row: MigrationStatusRow = {
      version: '2',
      name: 'b',
      applied: true,
      drifted: true,
      appliedAt,
    };

    const jsonRow = toStatusJsonRow(row);

    expect(jsonRow.state).toBe('applied');
    expect(jsonRow.drifted).toBe(true);
    expect(jsonRow.appliedAt).toBe(appliedAt.toISOString());
  });

  it('a pending row projects state "pending", drifted false, and an always-present null appliedAt', () => {
    const row: MigrationStatusRow = { version: '3', name: 'c', applied: false };

    const jsonRow = toStatusJsonRow(row);

    expect(jsonRow.state).toBe('pending');
    expect(jsonRow.drifted).toBe(false);
    expect(Object.hasOwn(jsonRow, 'appliedAt')).toBe(true);
    expect(jsonRow.appliedAt).toBeNull();
  });

  it('an applied row with a non-Date appliedAt projects appliedAt to null without throwing', () => {
    // A control record is only ever trusted to hold a `Date` by convention:
    // a hand-written / legacy / future-version document can carry a string.
    const row = {
      version: '4',
      name: 'd',
      applied: true,
      appliedAt: 'not-a-date',
    } as unknown as MigrationStatusRow;

    expect(() => toStatusJsonRow(row)).not.toThrow();
    expect(toStatusJsonRow(row).appliedAt).toBeNull();
  });

  it('an applied row whose appliedAt is out of the JS Date range projects appliedAt to null without throwing', () => {
    // BSON stores an int64 millisecond value; JS `Date` caps at ±8.64e15, so
    // anything beyond that deserializes to an Invalid Date whose
    // `toISOString()` would throw `RangeError: Invalid time value`.
    const row: MigrationStatusRow = {
      version: '5',
      name: 'e',
      applied: true,
      appliedAt: new Date(8.64e15 + 1),
    };

    expect(() => toStatusJsonRow(row)).not.toThrow();
    expect(toStatusJsonRow(row).appliedAt).toBeNull();
  });
});

describe('toLockJson', () => {
  it('a free lock projects to exactly { held: false }', () => {
    const status: LockStatus = { held: false };

    expect(toLockJson(status)).toEqual({ held: false });
  });

  it('a held lock with a corrupted expiresAt projects expiresAt to null without throwing', () => {
    const lock = {
      _id: 'lock',
      hostname: 'host',
      pid: 1,
      operation: 'up',
      ownerId: 'owner',
      acquiredAt: new Date('2026-01-01T00:00:00Z'),
      expiresAt: 'not-a-date',
    } as unknown as MigrationLockDocument;
    const status: LockStatus = { held: true, lock };

    expect(() => toLockJson(status)).not.toThrow();

    const jsonLock = toLockJson(status);

    expect(jsonLock.held).toBe(true);
    expect(jsonLock.expiresAt).toBeNull();
  });
});
