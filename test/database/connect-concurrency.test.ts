import { afterAll, describe, expect, it } from 'vitest';

import { Database } from '@/database';

/**
 * Bug original: `isConnected()` só retorna `true` DEPOIS que
 * `kCreateClientConnection` conclui e atribui `kClient`/`kDb`. Duas chamadas
 * concorrentes a `connect()` (ex.: bootstrap de dois módulos em paralelo)
 * passavam ambas pelo guard, criavam DOIS `MongoClient`s e o primeiro era
 * sobrescrito sem `close()` — pool de conexões vazado até o processo morrer.
 *
 * Fix: a Promise de conexão em andamento é guardada e reutilizada.
 */
describe('Database — connect() concorrente', () => {
  const openDatabases: Database[] = [];

  afterAll(async () => {
    for (const db of openDatabases.splice(0)) {
      await db.disconnect();
    }
  });

  it('chamadas concorrentes a connect() reutilizam a mesma Promise (um único MongoClient)', async () => {
    const db = new Database({
      uri: process.env.MONGODB_URI,
      dbName: process.env.MONGODB_DB_NAME,
    });
    openDatabases.push(db);

    const first = db.connect();
    const second = db.connect();

    // Ambas ainda em voo — devem ser a MESMA Promise, não duas conexões.
    expect(first).toBeInstanceOf(Promise);
    expect(second).toBe(first);

    const resolvedDbName = await first;
    expect(resolvedDbName).toBe(process.env.MONGODB_DB_NAME);

    // Depois de conectado, connect() volta a ser no-op (retorna undefined).
    expect(db.connect()).toBeUndefined();
  });
});
