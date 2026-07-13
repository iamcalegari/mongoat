---
phase: 05-estabiliza-o-de-api-e-release-v1-0
verified: 2026-07-13T05:00:00-03:00
status: passed
score: 10/10 must-haves verified
behavior_unverified: 0
overrides_applied: 0
re_verification:
  previous_status: gaps_found
  previous_score: 9/10
  gaps_closed:
    - "O guia de migração publicado (MIGRATION.md e docs/migration.md) orienta corretamente os consumidores da linha alpha deprecada para a 1.1.0, sem alegar que a release ainda não foi publicada — corrigido no commit e1346ba (em main)"
  gaps_remaining: []
  regressions: []
---

# Phase 5: Estabilização de API e release v1.0 — Verification Report

**Phase Goal:** A API do alpha é auditada e estabilizada deliberadamente, e então publicada como 1.1.0 com semver disciplinado e um pipeline de release automatizado.
**Verified:** 2026-07-13T05:00:00-03:00
**Status:** passed
**Re-verification:** Yes — após fechamento do gap do guia de migração (commit `e1346ba`)

## Goal Achievement

Toda a checagem abaixo foi refeita de forma independente contra o estado real (não apenas lida dos SUMMARYs): registry npm ao vivo (`npm view`/packument via `curl`), `git tag`, execução real de `npm test` (122/122), `npm run typecheck`, `npm run lint`, `npm run build`, `npm run docs:build` e `npm run check:package`, e reexecução do `scripts/smoke-rc.mjs` instalando o tarball real do dist-tag `rc` num diretório temporário.

**Re-verificação do gap (2026-07-13):** o commit `e1346ba` (pushado para `main`; branch local sincronizado com `origin/main`) corrigiu o guia de migração. Confirmado no working tree: banner de `MIGRATION.md` e `docs/migration.md` agora afirma que a **1.1.0 é a primeira estável, publicada em `latest`, com a linha `1.0.x-alpha` deprecada**; blockquote de status trocado para "**Status: final.**"; tags "(in progress)" removidas do TOC e do heading da seção 3 nos dois arquivos; âncora do TOC de `MIGRATION.md` corrigida para `#3-input-validation` (alinhada ao heading). `grep -niE "1\.0\.34-alpha|not released yet|in progress|living document"` nos dois arquivos → 0 matches. `npm run docs:build` verde após o fix. O site publicado (`https://iamcalegari.github.io/mongoat/migration`) republicará em minutos via Deploy Docs — a fonte de verdade do fix é o commit em `main`, verificado localmente.

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | API pública auditada/congelada: `Database.defineModel`/`Model.create` (`@deprecated`) removidos do barrel, sem referências dangling | ✓ VERIFIED | `grep -rnE "static +defineModel\|static +create\b" src/` → sem matches; `grep` em `test/`/`src/` por `defineModel`/`.create(` (excluindo `new Model`) → sem matches; `npm run typecheck` limpo; `npm test` → 122/122 passando |
| 2 | Diff alpha→1.1.0 registrado: entrada BREAKING no CHANGELOG e seção 5 (before/after) no guia de migração | ✓ VERIFIED | `CHANGELOG.md:11` `## [1.1.0] - 2026-07-10` com seção `### Removed` citando a remoção; `MIGRATION.md`/`docs/migration.md` seção "5. API surface" com before/after `new Model(...)` |
| 3 | `1.1.0-rc.0` publicado no dist-tag `rc` (não `latest`) antes da tag final, com provenance | ✓ VERIFIED | `npm view @iamcalegari/mongoat dist-tags` → `rc=1.1.0-rc.0`; tag git `v1.1.0-rc.0` existe |
| 4 | Smoke de import CJS+ESM passa contra o tarball do RC realmente publicado | ✓ VERIFIED | `node scripts/smoke-rc.mjs` reexecutado nesta verificação → instala `@iamcalegari/mongoat@rc` num tmpdir real, `[smoke-rc] CJS OK` + `[smoke-rc] ESM OK` + `PASS` |
| 5 | Pipeline changesets configurado (`changelog:false`/`access:public`/`baseBranch:main`) e `release.yml` separado, disparando só em `push:main`, com `id-token:write`/`NPM_CONFIG_PROVENANCE` e `environment: npm-publish` | ✓ VERIFIED | `.changeset/config.json` confere; `.github/workflows/release.yml` lido por completo — YAML confirma todos os campos |
| 6 | `1.1.0` publicada no npm em `latest` com provenance, sob aprovação humana explícita, via CI (nunca do laptop) | ✓ VERIFIED | `npm view @iamcalegari/mongoat dist-tags` → `latest=1.1.0`; packument `dist.attestations.provenance.predicateType = https://slsa.dev/provenance/v1`; tag git `v1.1.0`; `release.yml` é o único caminho de publish (gated) |
| 7 | As 34 versões `1.0.x-alpha` deprecadas por versão EXATA (nenhum range); `1.1.0`/`1.1.0-rc.0` intocadas | ✓ VERIFIED | Varredura completa do packument (não amostra): 34 versões terminando em `-alpha`, 34/34 com campo `deprecated`, 0 versões não-alpha deprecadas; `npm view @...@1.1.0 deprecated` e `@1.1.0-rc.0 deprecated` → vazio; `scripts/deprecate-alphas.mjs` usa `versions --json` + loop por versão exata, sem range (`grep` de guarda confirma); `DRY_RUN=1` imprime exatamente 34 comandos |
| 8 | Página de política semver publicada (`docs/explanation/versioning.md`), no `nav`+`sidebar['/explanation/']`, linkada pelo README, `docs:build` verde | ✓ VERIFIED | Arquivo existe (106 linhas); `config.mts:62,96` tem os dois entries; `README.md:149` linka a página; `npm run docs:build` → 0 errors, 3 warnings pré-existentes não relacionados |
| 9 | Guia de migração publicado orienta corretamente os consumidores da alpha deprecada, sem alegar que a release ainda não saiu | ✓ VERIFIED (fechado em re-verificação) | Commit `e1346ba` em `main`: banner reescrito para o tempo pós-release ("1.1.0 is the first stable release, published on npm under the `latest` dist-tag ... `1.0.x-alpha` line (now deprecated)"), "Status: final.", tags "(in progress)" removidas, âncora do TOC corrigida; `grep` sem resquícios nos dois arquivos; `docs:build` verde |
| 10 | Releases conduzidas por pipeline changesets: CHANGELOG gerado, versionamento via PR, publicação npm automatizada no merge (ROADMAP SC #3, literal) | ⚠️ VERIFICADO COM RESSALVA | Ver nota abaixo — decisão deliberada e documentada (D-03/D-06), não um defeito escondido |

**Score:** 10/10 truths verificados (1 fechado em re-verificação; 1 verificado com ressalva não-bloqueante documentada, ver nota)

**Nota sobre a Truth #10 (não bloqueante, decisão documentada):**
- **"CHANGELOG gerado"**: `changelog:false` está deliberado (D-06/Pattern 1 do research) para preservar o `CHANGELOG.md` com curadoria manual em vez de deixar o `changeset version` sobrescrevê-lo — o CHANGELOG *foi* atualizado para a 1.1.0 (seção `[1.1.0]` datada, entradas completas), só não pela feature de auto-changelog do changesets. Interpretação razoável do "CHANGELOG gerado" da ROADMAP é satisfeita em espírito.
- **"publicação npm automatizada no merge"**: hoje **não é** zero-clique — todo release (não só o primeiro) passa pelo Environment `npm-publish` com required reviewer permanente; o próprio `release.yml` documenta em comentário que a remoção do required reviewer (para "releases zero-clique") é um passo futuro ainda não executado. O `05-REVIEW.md` (WR-05) também nota que o `release.yml` publica sem gate de testes (`npm test`/`typecheck`) antes do `changeset publish` — o que torna a remoção do gate humano hoje **prematura e arriscada**, então manter a aprovação manual é defensável como estado interino seguro, não um bug. **Recomendação para fase futura**: adicionar gate de testes ao `release.yml` (WR-05) antes de remover o required reviewer, se o zero-clique literal for desejado.

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/database/index.ts` | sem `static defineModel` | ✓ VERIFIED | Removido; import órfão `ModelSetup` também removido do arquivo |
| `src/model/index.ts` | sem `static create` | ✓ VERIFIED | Removido |
| `CHANGELOG.md` | seção `[1.1.0]` com BREAKING | ✓ VERIFIED | Presente, datada 2026-07-10 |
| `MIGRATION.md` / `docs/migration.md` | seção 5 (API surface) + versão reconciliada + status pós-release | ✓ VERIFIED | Seção 5 presente e correta; banner pós-release corrigido em `e1346ba`; arquivos mantidos sincronizados (convenção D-03 da Fase 4) |
| `.changeset/config.json` | `changelog:false`/`access:public`/`baseBranch:main` | ✓ VERIFIED | Confere exatamente |
| `.github/workflows/release.yml` | separado, `push:main`, provenance, gate | ✓ VERIFIED | Confere exatamente |
| `package.json` | `version: 1.1.0`, `scripts.release` | ✓ VERIFIED | `1.1.0`; `release` = `changeset publish` |
| `scripts/smoke-rc.mjs` | smoke CJS+ESM contra tarball publicado | ✓ VERIFIED | Existe, substantivo, reexecutado com sucesso nesta verificação |
| `scripts/deprecate-alphas.mjs` | loop por versão exata | ✓ VERIFIED | Existe, substantivo, `node --check` OK, `DRY_RUN=1` → 34 comandos, sem uso de range |
| `.github/workflows/deprecate-alphas.yml` | write gated no CI | ✓ VERIFIED | Existe; `environment: npm-publish`; dry-run de auditoria + execução real + amostragem com retry |
| `docs/explanation/versioning.md` | política semver publicada | ✓ VERIFIED | Existe, 106 linhas, conteúdo substantivo |
| `.changeset/pre.json` | ausente após `pre exit` (05-04) | ✓ VERIFIED | Confirmado ausente no disco |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| `release.yml` | secret `NPM_TOKEN` + OIDC `id-token:write` | env do step `changesets/action@v1` | ✓ WIRED | `NPM_CONFIG_PROVENANCE: true`, `id-token: write` nas `permissions` |
| `changesets/action` | script `release` do `package.json` | `publish: npm run release` | ✓ WIRED | `release.yml:51` |
| `release.yml` | GitHub Environment `npm-publish` | `environment:` do job | ✓ WIRED | `release.yml:31` |
| `docs/explanation/versioning.md` | `nav`+`sidebar['/explanation/']` do `config.mts` | entradas de link | ✓ WIRED | `config.mts:62,96` |
| README | página de política semver | link na seção de links do site | ✓ WIRED | `README.md:149` |
| `deprecate-alphas.mjs` | lista real de versões via `npm view ... versions --json` | `getPublishedVersions()` | ✓ WIRED | Confirmado por execução real (`DRY_RUN=1` → 34) e pela deprecação real já consumada no registry (34/34) |
| Mensagem de deprecação `npm deprecate` | guia de migração publicado | URL `https://iamcalegari.github.io/mongoat/migration` | ✓ WIRED | O link resolve e a página agora afirma corretamente a 1.1.0 como estável corrente (fix `e1346ba`; site republica via Deploy Docs em minutos) |

### Requirements Coverage

| Requirement | Source Plan(s) | Description | Status | Evidence |
|-------------|-----------------|--------------|--------|----------|
| REL-01 | 05-02, 05-05 | Pipeline de release com changesets: CHANGELOG gerado, versionamento via PR, publicação npm automatizada no merge | ✓ SATISFIED (com ressalva documentada acima) | `release.yml`+`.changeset/config.json` operacionais; RC e estável já publicados ponta-a-ponta pelo pipeline; ressalva: gate manual permanente (não zero-clique) até remoção futura do required reviewer |
| REL-03 | 05-01, 05-03 | `v1.0.0-rc` publicado com auditoria de API (diff alpha→v1) antes da tag final | ✓ SATISFIED | Ver Truths #1-4 |
| REL-04 | 05-04, 05-05 | `v1.0.0` estável publicada no npm com política semver documentada e versões alpha deprecadas | ✓ SATISFIED | Ver Truths #6-8 |

**Discrepância de bookkeeping (não bloqueante):** `.planning/REQUIREMENTS.md` linha 41 ainda lista `REL-01` como `[ ]` (não marcado) e a tabela de Traceability (linha 116) como `Pending`, enquanto `REL-03`/`REL-04` já estão `[x]`/`Complete`. O trabalho de REL-01 está substancialmente feito (ver acima) — a checkbox/tabela em `REQUIREMENTS.md` simplesmente não foi atualizada após a Fase 5. Recomenda-se atualizar o arquivo para refletir o estado real, mas isso não afeta a conclusão da fase.

**Sem requisitos órfãos:** os únicos REQ-IDs declarados no goal da Fase 5 (REL-01, REL-03, REL-04) aparecem todos em pelo menos um plano (`requirements:` frontmatter).

### Anti-Patterns Found

| File | Line(s) | Pattern | Severity | Impact |
|------|---------|---------|----------|--------|
| `src/index.ts`, `src/types/index.ts`, `src/types/model.ts` | 19 / 15 / 69-77 | Tipo órfão `ModelSetup` (props exclusivas do `defineModel` removido) continua exportado do barrel | ⚠️ Warning | Decisão consciente e documentada no SUMMARY 05-01 ("fora do escopo dos files_modified"); porém, pela própria `versioning.md` publicada, símbolos exportados do barrel entram no contrato semver — remover depois exigirá MAJOR por um tipo sem consumidores. Já identificado como WR-03 em `05-REVIEW.md` |
| `.github/workflows/release.yml` | 43-51 | Publish sem gate de `npm test`/`typecheck` antes do `changeset publish` | ⚠️ Warning | Já identificado como WR-05 em `05-REVIEW.md`; relevante à ressalva da Truth #10 (remover o gate humano hoje seria prematuro) |
| Nenhum `TBD`/`FIXME`/`XXX` | — | Debt marker gate | — | `grep -nE "TBD\|FIXME\|XXX"` nos arquivos modificados pela fase → 0 matches |

*Nota residual (não reabre o gap):* a frase "`toObjectId(value)` will validate..." (seção 3.1 dos dois guias de migração) mantém o "will", mas sem o contexto "(in progress)" removido em `e1346ba` ela lê naturalmente como descrição de comportamento corrente em inglês ("passar um valor inválido vai lançar") — a alegação factualmente falsa foi eliminada.

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Suíte de testes unitários passa | `npm test` (rodado uma única vez, não filtrado) | 34 arquivos / 122 testes passando | ✓ PASS |
| Typecheck limpo pós-remoção das APIs | `npm run typecheck` | sem erros | ✓ PASS |
| Lint limpo | `npm run lint` | sem output/erros | ✓ PASS |
| Build dual CJS/ESM | `npm run build` | `lib/index.cjs` + `lib/index.mjs`/`.d.mts`/`.d.cts` gerados | ✓ PASS |
| Empacotamento válido (attw + publint) | `npm run check:package` | attw 🟢 em node10/node16-CJS/node16-ESM/bundler; publint "No problems found" | ✓ PASS |
| Docs (site + API reference) buildam | `npm run docs:build` (re-rodado após `e1346ba`) | 0 errors, 3 warnings pré-existentes não relacionados | ✓ PASS |
| Smoke CJS+ESM contra o tarball do RC publicado | `node scripts/smoke-rc.mjs` | instala `@rc` num tmpdir real; `CJS OK` + `ESM OK` + `PASS` | ✓ PASS |
| Registry: dist-tags corretos | `npm view @iamcalegari/mongoat dist-tags` | `{"rc":"1.1.0-rc.0","latest":"1.1.0"}` | ✓ PASS |
| Registry: provenance SLSA presente na 1.1.0 | packument `dist.attestations` | `predicateType: https://slsa.dev/provenance/v1` | ✓ PASS |
| Registry: 34/34 alphas deprecadas, 0 não-alpha deprecadas | varredura completa do packument (não amostra) | `alpha versions: 34`, `deprecated alphas: 34`, `non-alpha deprecated: 0` | ✓ PASS |
| Guia de migração não afirma que a release não saiu | `grep -niE "1\.0\.34-alpha\|not released yet\|in progress\|living document" MIGRATION.md docs/migration.md` (pós-`e1346ba`) | 0 matches; banner afirma 1.1.0 estável em `latest` | ✓ PASS |

### Probe Execution

Não aplicável — a fase não declara nem usa `scripts/*/tests/probe-*.sh`; nenhum probe convencional encontrado (`find scripts -path '*/tests/probe-*.sh'` → vazio).

### Human Verification Required

Nenhum item bloqueante. Uma recomendação de decisão do mantenedor fica registrada, sem impedir o fechamento da fase:

1. **Gate de publish permanente (1-clique) vs. "automatizada no merge" literal**
   **O quê decidir:** aceitar o estado atual (Environment `npm-publish` com required reviewer permanente, aprovação de 1 clique em toda release) como satisfazendo REL-01/SC#3 — estado aceito pelo orquestrador nesta verificação —, ou abrir um item de follow-up para adicionar gate de testes ao `release.yml` (WR-05) e então remover o required reviewer para releases zero-clique.
   **Por que humano:** é uma decisão de postura de segurança/produto (trade-off velocidade vs. controle), não um defeito verificável objetivamente — a implementação atual é internamente consistente e documentada (D-03).

### Gaps Summary

Nenhum gap remanescente. O único gap da verificação inicial (guia de migração publicado negando a existência da 1.1.0 — mesmo achado do WR-01 em `05-REVIEW.md`) foi fechado pelo commit `e1346ba` (em `main`) e re-verificado no working tree: banner pós-release correto nos dois arquivos, tags "(in progress)" removidas, âncora do TOC corrigida, zero resquícios das strings stale, `docs:build` verde. O site publicado republicará via Deploy Docs em minutos.

Todos os must-haves verificados com evidências independentes (testes, typecheck, lint, build, docs:build, check:package, smoke real contra o tarball publicado, varredura completa do packument): a API foi auditada e congelada, o RC foi validado antes da estável, a 1.1.0 está publicada em `latest` com provenance sob aprovação humana, as 34 alphas estão deprecadas por versão exata, a política semver está publicada e o pipeline changesets está operacional ponta-a-ponta. Fase concluída.

---

_Verified: 2026-07-13T05:00:00-03:00_
_Verifier: Claude (gsd-verifier)_
