// Smoke test do RC publicado: instala @iamcalegari/mongoat@rc num
// diretório temporário e confirma que o pacote importa nos DOIS formatos —
// `require(...)` (CJS) e `import ... from` (ESM) — expondo `Database` e `Model`.
// Roda contra o TARBALL realmente publicado no npm (não contra o working tree),
// então valida o exports map + provenance ponta-a-ponta. Sai != 0 em qualquer
// falha. Uso: `node scripts/smoke-rc.mjs` (após o RC estar no dist-tag `rc`).
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PKG = '@iamcalegari/mongoat@rc';
const dir = mkdtempSync(join(tmpdir(), 'mongoat-smoke-'));
const expectedVersion = process.argv[2];

function run(cmd, args) {
  execFileSync(cmd, args, { cwd: dir, stdio: 'inherit' });
}

try {
  console.log(`[smoke-rc] dir: ${dir}`);
  run('npm', ['init', '-y']);
  run('npm', ['install', PKG]);

  // A instalação já escreveu o manifesto localmente — ler dali evita uma
  // segunda ida ao registry só para descobrir qual versão a tag `rc`
  // resolveu no momento em que este smoke rodou.
  const installedManifestPath = join(
    dir,
    'node_modules/@iamcalegari/mongoat/package.json'
  );
  const installedManifest = JSON.parse(
    readFileSync(installedManifestPath, 'utf8')
  );
  const resolvedVersion = installedManifest.version;

  if (!resolvedVersion) {
    throw new Error('[smoke-rc] pacote instalado não reporta uma versão');
  }
  console.log(`[smoke-rc] versão resolvida: ${resolvedVersion}`);

  // Uma versão estável sob a tag `rc` significa que a tag nunca foi movida
  // para o candidato — o smoke inteiro validaria o artefato errado enquanto
  // reporta sucesso.
  if (!resolvedVersion.includes('-rc.')) {
    throw new Error(
      `[smoke-rc] versão resolvida '${resolvedVersion}' não é um release candidate (esperado algo como X.Y.Z-rc.N)`
    );
  }

  if (expectedVersion && resolvedVersion !== expectedVersion) {
    throw new Error(
      `[smoke-rc] versão resolvida '${resolvedVersion}' difere da esperada '${expectedVersion}'`
    );
  }

  // CJS: require deve expor Database e Model como funções (classes).
  writeFileSync(
    join(dir, 'cjs.cjs'),
    [
      "const m = require('@iamcalegari/mongoat');",
      "if (typeof m.Database !== 'function' || typeof m.Model !== 'function') {",
      "  throw new Error('CJS: Database/Model não são funções');",
      '}',
      "console.log('[smoke-rc] CJS OK');",
    ].join('\n')
  );
  run('node', ['cjs.cjs']);

  // ESM: import nomeado deve expor Database e Model como funções (classes).
  writeFileSync(
    join(dir, 'esm.mjs'),
    [
      "import { Database, Model } from '@iamcalegari/mongoat';",
      "if (typeof Database !== 'function' || typeof Model !== 'function') {",
      "  throw new Error('ESM: Database/Model não são funções');",
      '}',
      "console.log('[smoke-rc] ESM OK');",
    ].join('\n')
  );
  run('node', ['esm.mjs']);

  console.log(
    `[smoke-rc] PASS — ${resolvedVersion}: CJS + ESM importam Database/Model do tarball publicado`
  );
} finally {
  rmSync(dir, { recursive: true, force: true });
}
