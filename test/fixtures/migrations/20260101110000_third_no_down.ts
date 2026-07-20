import type { MigrationContext } from '@/types/migrate';

/**
 * Fixture migration (checksum/discover tests) — irreversible: exports `up`
 * only, no `down`.
 */
export async function up({ db }: MigrationContext): Promise<void> {
  await db.collection('third_fixture').findOne({});
}
