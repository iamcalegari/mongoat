import type { MigrationContext } from '@/types/migrate';

/**
 * Fixture migration (checksum/discover tests) — reversible, with both `up`
 * and `down` exports.
 */
export async function up({ db }: MigrationContext): Promise<void> {
  await db.collection('first_fixture').findOne({});
}

export async function down({ db }: MigrationContext): Promise<void> {
  await db.collection('first_fixture').findOne({});
}
