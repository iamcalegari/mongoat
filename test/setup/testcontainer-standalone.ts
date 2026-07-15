import { GenericContainer, StartedTestContainer } from 'testcontainers';

/**
 * Per-file test container setup (NOT the shared vitest `globalSetup`) — used
 * only by `test/migrate/replica-set-required.test.ts` via its own
 * `beforeAll`/`afterAll`, so it doesn't slow down every test run.
 *
 * Boots a genuine STANDALONE MongoDB (no replica-set initiation) via
 * `GenericContainer` directly — deliberately NOT the `@testcontainers/mongodb`
 * wrapper class (used by `test/setup/testcontainer.ts`), which always
 * provisions a single-node replica set. This is the only way to exercise the
 * `REPLICA_SET_REQUIRED` fail-loud path against a real, non-transaction-
 * capable server (Pitfall 3).
 *
 * The image tag is pinned (`mongo:7`, never `latest`) for reproducibility,
 * matching `test/setup/testcontainer.ts`'s own precedent.
 *
 * Exposes the connection string via `process.env.MONGODB_STANDALONE_URI`
 * and returns an async teardown fn — never leaks an orphan container.
 */
export default async function setup(): Promise<() => Promise<void>> {
  let container: StartedTestContainer;

  try {
    container = await new GenericContainer('mongo:7')
      .withExposedPorts(27017)
      .start();
  } catch (err) {
    throw new Error(
      'Não foi possível subir o container MongoDB standalone de teste. Verifique se o Docker está instalado e em execução (docker info).\n' +
        `Causa original: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  process.env.MONGODB_STANDALONE_URI = `mongodb://${container.getHost()}:${container.getMappedPort(27017)}/`;

  return async () => {
    await container.stop();
  };
}
