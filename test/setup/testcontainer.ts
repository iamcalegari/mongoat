import { MongoDBContainer, StartedMongoDBContainer } from '@testcontainers/mongodb';

/**
 * globalSetup do vitest.
 *
 * Sobe um MongoDB real via Docker (@testcontainers/mongodb) — não usamos
 * nenhum servidor Mongo em memória. A tag da imagem é fixada em `mongo:7`
 * (versionada, nunca `latest`) para reprodutibilidade e integridade de
 * supply-chain.
 *
 * Expõe a connection string via `process.env.MONGODB_URI` /
 * `process.env.MONGODB_DB_NAME` para todos os testes, e retorna a função de
 * teardown que o vitest chama ao final da run — encerra o container e evita
 * containers órfãos.
 */
export default async function setup(): Promise<() => Promise<void>> {
  let container: StartedMongoDBContainer;

  try {
    container = await new MongoDBContainer('mongo:7').start();
  } catch (err) {
    throw new Error(
      'Não foi possível subir o container MongoDB de teste. Verifique se o Docker está instalado e em execução (docker info).\n' +
        `Causa original: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  // O container roda como replica set de nó único (exigência da imagem
  // oficial para health check/transações). Sem `directConnection=true`, o
  // driver faz SDAM discovery e tenta reconectar usando o hostname interno
  // do container (ex.: o container ID), que não é alcançável do host —
  // `directConnection` trata a URI como servidor único e evita esse hop.
  process.env.MONGODB_URI = `${container.getConnectionString()}?directConnection=true`;
  process.env.MONGODB_DB_NAME = 'mongoat_test';

  return async () => {
    await container.stop();
  };
}
