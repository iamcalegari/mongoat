import type { MigrationContext } from '@/types/migrate';

/**
 * Fixture migration (checksum/discover tests) — reversible, with both `up`
 * and `down` exports. Different byte content from `20260101090000_first.ts`
 * on purpose, so checksum tests can assert two distinct hashes.
 */
export async function up({ db }: MigrationContext): Promise<void> {
  await db.collection('second_fixture').findOne({});
}

export async function down({ db }: MigrationContext): Promise<void> {
  await db.collection('second_fixture').findOne({});
}
