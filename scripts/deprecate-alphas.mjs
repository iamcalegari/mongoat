// Deprecação das 34 versões `1.0.x-alpha` do npm por VERSÃO EXATA (D-05, REL-04).
//
// Pitfall crítico (05-RESEARCH.md Pitfall 1 / Open Question 2): `npm deprecate` por
// RANGE (`<1.1.0`, `1.0.x-alpha`, `1.x`) NÃO casa com nenhuma pre-release publicada
// — o comando não retorna erro, simplesmente marca zero versões silenciosamente.
// Por isso este script NUNCA usa range: ele obtém a lista real de versões via
// `npm view @iamcalegari/mongoat versions --json`, filtra as que terminam em
// `-alpha` (as 34 linhas 1.0.x-alpha) e roda um `npm deprecate` POR VERSÃO EXATA,
// em loop — nunca deprecia 1.1.0-rc.0 nem 1.1.0 (linha estável).
//
// `npm deprecate` exige ser owner autenticado do pacote no registry (V4 Access
// Control) — a execução real é feita pelo autor autenticado, este script apenas
// automatiza o loop.
//
// Uso:
//   node scripts/deprecate-alphas.mjs           # executa de verdade (IRREVERSÍVEL)
//   DRY_RUN=1 node scripts/deprecate-alphas.mjs  # apenas imprime os comandos, sem executar nada
import { execFileSync } from 'node:child_process';

const PACKAGE_NAME = '@iamcalegari/mongoat';
const DEPRECATION_MESSAGE =
  'The 1.0.x-alpha line is discontinued - upgrade to the stable release. Migration guide: https://iamcalegari.github.io/mongoat/migration';
const DRY_RUN = process.env.DRY_RUN === '1';

function getPublishedVersions() {
  const raw = execFileSync(
    'npm',
    ['view', PACKAGE_NAME, 'versions', '--json'],
    { encoding: 'utf8' }
  );
  return JSON.parse(raw);
}

function getAlphaVersions(versions) {
  // Filtra somente as versões 1.0.x-alpha — nunca 1.1.0-rc.0 nem 1.1.0.
  return versions.filter((v) => v.endsWith('-alpha'));
}

function deprecateVersion(version) {
  const spec = `${PACKAGE_NAME}@${version}`;
  const args = ['deprecate', spec, DEPRECATION_MESSAGE];

  if (DRY_RUN) {
    console.log(['npm', ...args].join(' '));
    return;
  }

  console.log(`[deprecate-alphas] deprecating ${spec}...`);
  execFileSync('npm', args, { stdio: 'inherit' });
  console.log(`[deprecate-alphas] done: ${spec}`);
}

function main() {
  const versions = getPublishedVersions();
  const alphaVersions = getAlphaVersions(versions);

  if (alphaVersions.length === 0) {
    console.error(
      '[deprecate-alphas] nenhuma versao -alpha encontrada — abortando (guarda contra Pitfall 1: matching zero silencioso)'
    );
    process.exitCode = 1;
    return;
  }

  console.log(
    `[deprecate-alphas] ${alphaVersions.length} versao(oes) -alpha encontradas${DRY_RUN ? ' (DRY_RUN=1 — nenhum comando sera executado)' : ''}`
  );

  for (const version of alphaVersions) {
    deprecateVersion(version);
  }

  console.log(
    `[deprecate-alphas] concluido — ${alphaVersions.length} versao(oes) processadas`
  );
}

main();
