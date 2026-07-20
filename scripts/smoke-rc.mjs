// Smoke test do RC publicado: instala @iamcalegari/mongoat@rc num
// diretório temporário e confirma que o pacote importa nos DOIS formatos —
// `require(...)` (CJS) e `import ... from` (ESM) — expondo `Database` e `Model`.
// Roda contra o TARBALL realmente publicado no npm (não contra o working tree),
// então valida o exports map + provenance ponta-a-ponta. Sai != 0 em qualquer
// falha. Uso: `node scripts/smoke-rc.mjs` (após o RC estar no dist-tag `rc`).
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PKG = '@iamcalegari/mongoat@rc';
const dir = mkdtempSync(join(tmpdir(), 'mongoat-smoke-'));

function run(cmd, args) {
  execFileSync(cmd, args, { cwd: dir, stdio: 'inherit' });
}

try {
  console.log(`[smoke-rc] dir: ${dir}`);
  run('npm', ['init', '-y']);
  run('npm', ['install', PKG]);

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

  console.log('[smoke-rc] PASS — CJS + ESM importam Database/Model do tarball publicado');
} finally {
  rmSync(dir, { recursive: true, force: true });
}
