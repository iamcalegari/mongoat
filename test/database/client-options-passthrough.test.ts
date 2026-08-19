import { MongoClient, MongoClientOptions, ServerApiVersion } from 'mongodb';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Database } from '@/database';

/**
 * Dois defeitos que viviam no mesmo caminho de conexão.
 *
 * 1. `connect()` montava o objeto de opções do zero e descartava
 *    `this.config` inteiro — só `uri`/`username`/`password` eram lidos, e em
 *    outro ponto. Qualquer `MongoClientOptions` passada ao construtor era
 *    silenciosamente ignorada; `ignoreUndefined` só funcionava por acaso,
 *    porque o valor hardcoded coincidia com o que as aplicações passavam.
 *
 * 2. Com `NODE_ENV === 'production'`, `connect()` sintetizava
 *    `serverApi: { version: v1, strict: true, deprecationErrors: true }`. O
 *    modo estrito faz o servidor recusar todo comando fora da Stable API v1 —
 *    `$vectorSearch`, `createSearchIndex` e `listSearchIndexes` entre eles —
 *    então nenhuma aplicação com Atlas Vector Search podia rodar com o valor
 *    de ambiente que produção justamente carrega. Ligar a Stable API passou a
 *    ser escolha explícita de quem usa o ODM, via a opção do próprio driver.
 *
 * As asserções não se contentam com o argumento entregue ao driver: também
 * inspecionam `client.options` (o estado JÁ PARSEADO pelo driver) e, no caso
 * do modo estrito, o comportamento do servidor real de teste. Um comando fora
 * da Stable API v1 é executado de verdade nos dois sentidos — com o default
 * ele passa, com o opt-in explícito ele é recusado —, o que impede que o teste
 * do default passe por vacuidade.
 */

/**
 * Código que o servidor devolve quando `strict` barra um comando (o mesmo
 * `APIStrictError` que `$vectorSearch` produz). O comando usado aqui é
 * `dbStats`, disparado por `Database#info()` — está FORA da Stable API v1 e é
 * executável contra o servidor de teste, ao contrário de `$vectorSearch`, que
 * exige Atlas.
 */
const API_STRICT_ERROR_CODE = 323;

describe('Database — opções do construtor e Stable API', () => {
  const openDatabases: Database[] = [];
  const originalNodeEnv = process.env.NODE_ENV;

  afterEach(async () => {
    for (const db of openDatabases.splice(0)) {
      await db.disconnect();
    }

    vi.restoreAllMocks();

    if (originalNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = originalNodeEnv;
    }
  });

  /**
   * Conecta de verdade contra o MongoDB de teste e devolve tanto o objeto de
   * opções ENTREGUE a `MongoClient.connect` quanto a instância conectada.
   */
  async function connectCapturingOptions(
    config: ConstructorParameters<typeof Database>[0] = {}
  ): Promise<{ db: Database; options: MongoClientOptions | undefined }> {
    const connectSpy = vi.spyOn(MongoClient, 'connect');

    const db = new Database({
      uri: process.env.MONGODB_URI,
      dbName: process.env.MONGODB_DB_NAME,
      ...config,
    });
    openDatabases.push(db);

    await db.connect();

    return { db, options: connectSpy.mock.calls.at(-1)?.[1] };
  }

  it('as MongoClientOptions do construtor chegam ao MongoClient.connect', async () => {
    const { db, options } = await connectCapturingOptions({
      appName: 'mongoat-options-passthrough',
      maxPoolSize: 7,
    });

    expect(options?.appName).toBe('mongoat-options-passthrough');
    expect(options?.maxPoolSize).toBe(7);

    // E o driver de fato as absorveu — não basta terem sido passadas.
    expect(db.getClient()?.options.appName).toBe('mongoat-options-passthrough');
    expect(db.getClient()?.options.maxPoolSize).toBe(7);
  });

  it('o default ignoreUndefined continua ligado e é sobrescrevível pelo construtor', async () => {
    const { options: defaulted } = await connectCapturingOptions();
    expect(defaulted?.ignoreUndefined).toBe(true);

    const { options: overridden } = await connectCapturingOptions({
      ignoreUndefined: false,
    });

    // Precedência: o Mongoat fornece DEFAULTS, o construtor vence.
    expect(overridden?.ignoreUndefined).toBe(false);
  });

  it('as chaves específicas do Mongoat nunca são repassadas ao driver', async () => {
    // Repassar o config cru quebraria toda conexão: o driver recusa chave que
    // não conhece (`MongoParseError: option uri is not supported`), e `uri` é
    // justamente o caminho documentado de configuração.
    const { options } = await connectCapturingOptions({
      password: 'ignored-by-the-driver',
      username: 'ignored-by-the-driver',
    });

    expect(options).toBeDefined();
    expect(options).not.toHaveProperty('uri');
    expect(options).not.toHaveProperty('dbName');
    expect(options).not.toHaveProperty('username');
    expect(options).not.toHaveProperty('password');
  });

  it('NODE_ENV=production não liga a Stable API estrita', async () => {
    process.env.NODE_ENV = 'production';

    const { db, options } = await connectCapturingOptions();

    expect(options?.serverApi).toBeUndefined();
    expect(db.getClient()?.options.serverApi).toBeUndefined();

    // Prova de comportamento, não de constante em memória: um comando fora da
    // Stable API v1 roda contra o servidor real e é ACEITO.
    await expect(db.info()).resolves.toBeDefined();
  });

  it('strict só vale quando o consumidor pede explicitamente, e aí barra comando fora da API', async () => {
    const { db, options } = await connectCapturingOptions({
      serverApi: { strict: true, version: ServerApiVersion.v1 },
    });

    expect(options?.serverApi).toEqual({
      strict: true,
      version: ServerApiVersion.v1,
    });

    // O contraponto que impede o caso anterior de passar por vacuidade: o
    // MESMO comando, agora recusado pelo servidor.
    await expect(db.info()).rejects.toMatchObject({
      code: API_STRICT_ERROR_CODE,
    });
  });

  it('deprecationErrors não é ligado por padrão', async () => {
    process.env.NODE_ENV = 'production';

    const { db } = await connectCapturingOptions();

    expect(
      db.getClient()?.options.serverApi?.deprecationErrors
    ).toBeUndefined();
  });
});
