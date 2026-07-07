import { afterEach, describe, expect, it } from 'vitest';

import { Database } from '@/database';

/**
 * Regressão de CR-01 (Code Review da Fase 01).
 *
 * Bug original: a connection url só era atribuída dentro de
 * `if (config.uri && config.username && config.password)` — uma URI sem
 * credenciais (`new Database({ uri })`, auth embutida na connection string,
 * Atlas SRV, instância local sem auth) era silenciosamente descartada e a
 * conexão caía no default `mongodb://127.0.0.1:27017/`. A env var
 * `MONGODB_URI` também só era lida DENTRO desse branch, quebrando a
 * configuração puramente por ambiente (`MONGODB_URI` setada + `new
 * Database()` sem args).
 *
 * Fix: a URI é resolvida como `MONGODB_URI || config.uri` incondicionalmente;
 * credenciais são opcionais e, quando presentes, apenas substituem os
 * placeholders `<username>`/`<password>`.
 *
 * A url resolvida é inspecionada via `Object.getOwnPropertySymbols` (o campo
 * privado `kConnectionUrl` é um own property simbólico da instância) — isso
 * permite assertar a resolução sem abrir uma conexão em cada caso.
 */
function getConnectionUrl(db: Database): string {
  const kConnectionUrl = Object.getOwnPropertySymbols(db).find(
    (symbol) => symbol.description === 'kConnectionUrl'
  );

  expect(kConnectionUrl).toBeDefined();

  return (db as unknown as Record<symbol, string>)[kConnectionUrl!];
}

describe('Database — precedência de URI e credenciais opcionais (CR-01)', () => {
  const originalEnvUri = process.env.MONGODB_URI;

  afterEach(() => {
    if (originalEnvUri === undefined) {
      delete process.env.MONGODB_URI;
    } else {
      process.env.MONGODB_URI = originalEnvUri;
    }
  });

  it('config puramente por ambiente: new Database() sem args usa MONGODB_URI e conecta', async () => {
    const db = new Database();

    expect(getConnectionUrl(db)).toBe(process.env.MONGODB_URI);

    // Fim-a-fim: MONGODB_DB_NAME também vem do globalSetup.
    const resolvedDbName = await db.connect();
    expect(resolvedDbName).toBe(process.env.MONGODB_DB_NAME);

    await db.disconnect();
  });

  it('config.uri sem username/password é honrada (não cai no default localhost)', () => {
    delete process.env.MONGODB_URI;

    const uri = 'mongodb://some-host:27017/?directConnection=true';
    const db = new Database({ uri });

    expect(getConnectionUrl(db)).toBe(uri);
  });

  it('MONGODB_URI do ambiente tem precedência sobre config.uri', () => {
    process.env.MONGODB_URI = 'mongodb://env-host:27017/';

    const db = new Database({ uri: 'mongodb://config-host:27017/' });

    expect(getConnectionUrl(db)).toBe('mongodb://env-host:27017/');
  });

  it('sem MONGODB_URI e sem config.uri, mantém o default localhost', () => {
    delete process.env.MONGODB_URI;

    const db = new Database();

    expect(getConnectionUrl(db)).toBe('mongodb://127.0.0.1:27017/');
  });

  it('placeholders <username>/<password> são substituídos quando as credenciais existem', () => {
    delete process.env.MONGODB_URI;

    const db = new Database({
      uri: 'mongodb://<username>:<password>@some-host:27017/',
      username: 'user',
      password: 'pass',
    });

    expect(getConnectionUrl(db)).toBe('mongodb://user:pass@some-host:27017/');
  });

  // Regressão de WR-09 (Code Review da Fase 01): credenciais eram
  // interpoladas cruas na connection string — senhas com caracteres
  // reservados de URI (`@`, `/`, `:`, `?`, `#`) quebravam o parse ou
  // permitiam injetar opções de conexão via query string.
  it('credenciais com caracteres reservados de URI são percent-encoded (WR-09)', () => {
    delete process.env.MONGODB_URI;

    const db = new Database({
      uri: 'mongodb://<username>:<password>@some-host:27017/',
      username: 'user@corp',
      password: 'p@ss/w:rd?#',
    });

    expect(getConnectionUrl(db)).toBe(
      `mongodb://${encodeURIComponent('user@corp')}:${encodeURIComponent('p@ss/w:rd?#')}@some-host:27017/`
    );
  });
});
