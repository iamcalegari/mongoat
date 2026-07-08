---
phase: 04-site-de-documenta-o
verified: 2026-07-08T13:52:00-03:00
status: passed
score: 16/16 must-haves verificados
behavior_unverified: 0
overrides_applied: 0
re_verification:
  previous_status: gaps_found
  previous_score: 15/16
  gaps_closed:
    - "A Reference de API gerada por TypeDoc NÃO expõe membros protected/Symbol internos (kClient/kDb/etc.)"
  gaps_remaining: []
  regressions: []
---

# Fase 4: Site de documentação — Relatório de Verificação (Re-verificação)

**Goal da fase:** A lib entra na v1.0 bem documentada: site VitePress publicado + README renovado cobrindo o core estável (conexão, models, CRUD, hooks pre/post, validação `$jsonSchema`, segurança, escape hatch), referência de API TypeDoc e guia de migração alpha→v1.0. Documentar o core primeiro também audita a API antes de congelá-la no release.

**Verificado em:** 2026-07-08T13:52:00-03:00
**Status:** passed
**Re-verificação:** Sim — após fechamento do gap único (vazamento de Symbols internos na Reference), commits `8e0a9cc` (fix) + `68706ca` (artes oficiais, fora de escopo do gap mas verificado por regressão).

## O que mudou desde a verificação anterior

A verificação anterior (15/16) reportou UM gap: a Reference TypeDoc vazava dois membros Symbol-keyed internos do mecanismo de Proxy-gating — `Database.[KModelProxyHandler]()` e `Model.[kDatabase]` — porque nenhum dos dois tinha modificador de acesso (`protected`/`private`), então `excludeProtected: true` não os capturava.

**Correção aplicada e verificada independentemente nesta re-verificação:**

1. `@internal` JSDoc adicionado a `static [KModelProxyHandler]()` (`src/database/index.ts:402`) e a `static [kDatabase]` (`src/model/index.ts:285`).
2. `excludeInternal: true` adicionado ao `typedoc.json` (confirmado por leitura direta — presente junto de `excludeProtected: true` e `excludeExternals: true`).
3. Menção textual a `KModelProxyHandler` no JSDoc de `getCollection()` generalizada para "Proxy de gating de métodos" (não referencia mais o símbolo interno pelo nome).
4. `eslint.config.mjs` passou a ignorar `docs/.vitepress/dist/**`, `docs/.vitepress/cache/**` e `docs/api/**` (artefatos gerados) — confirmado, e `npm run lint` roda limpo.
5. Adicional (fora do gap, pedido do autor): artes oficiais do Mongoat — banner na home via slot `home-hero-before` (`docs/.vitepress/theme/index.mts` + `custom.css`), favicon (`config.mts`), README `<img>` corrigido de blob URL (não renderiza) para `raw.githubusercontent.com` (renderiza). Verificado por regressão — não tocou nenhuma página de conteúdo Diátaxis.

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidência |
|---|-------|--------|-----------|
| 1 | `npm run docs:build` completa verde | ✓ VERIFIED | Rodado independentemente nesta re-verificação: TypeDoc "Found 0 errors and 9 warnings" (mesmos 9 warnings pré-existentes não-bloqueantes, inalterados) + VitePress "build complete in 4.69s". |
| 2 | Reference NÃO expõe membros protected/Symbol internos (kClient/kDb/etc.) | ✓ VERIFIED (gap fechado) | `grep -rlE "KModelProxyHandler\|kDatabase\|kClient\|kDb\|kConnecting\|kHookContext" docs/api/` → **vazio** (exit code 1, 0 matches). Confirmado adicionalmente por leitura direta: `grep -n "KModelProxyHandler\|KModelMap" docs/api/classes/Database.md` → vazio; `grep -n "kDatabase" docs/api/classes/Model.md` → vazio. Root cause corrigida: `@internal` + `excludeInternal: true` (`typedoc.json:8`) confirmados no código-fonte via leitura direta (`src/database/index.ts:402`, `src/model/index.ts:285`). |
| 3 | Site serve sob `base: '/mongoat/'`, busca local, nav 4 quadrantes + Home + Migration | ✓ VERIFIED | Regressão confirmada — `docs/.vitepress/config.mts` inalterado nessa parte (apenas `head` com favicon adicionado); `base`, `search.provider: local`, nav completa presentes no HTML gerado (`docs/.vitepress/dist/index.html`). |
| 4 | Tutorial getting-started cobre connect→schema→CRUD com API real v1.0 | ✓ VERIFIED | Regressão — arquivo não tocado pelos commits de correção (`git diff --stat 6f80f26 68706ca` confirma), 177 linhas mantidas. |
| 5 | How-to hooks mostra `ctx`, acumulação, `fireAndForget` | ✓ VERIFIED | Regressão — arquivo não tocado. |
| 6 | How-to indexes/validation mostra `CreateIndexProps` + `$jsonSchema` | ✓ VERIFIED | Regressão — arquivo não tocado. |
| 7 | How-to sanitize-filters mostra `sanitizeFilter` opt-in + guard `$where` incondicional | ✓ VERIFIED | Regressão — arquivo não tocado. |
| 8 | How-to handle-errors mostra discriminação por `instanceof`/`.code` | ✓ VERIFIED | Regressão — arquivo não tocado. |
| 9 | How-to escape-hatch mostra `getCollection`/`getClient`/`getDb` + bypass deliberado | ✓ VERIFIED | Regressão — arquivo de conteúdo não tocado; apenas o JSDoc-fonte de `getCollection()` teve a menção a `KModelProxyHandler` generalizada (não afeta a página, que já não citava o símbolo pelo nome). |
| 10 | Explanation thin-odm-philosophy articula a filosofia thin | ✓ VERIFIED | Regressão — arquivo não tocado. |
| 11 | Explanation proxy-gating explica o mecanismo Proxy/`allowedMethods` | ✓ VERIFIED | Regressão — arquivo não tocado. |
| 12 | Explanation server-side-validation explica `$jsonSchema` server-side | ✓ VERIFIED | Regressão — arquivo não tocado. |
| 13 | `docs/migration.md` consolida CHANGELOG+MIGRATION, cobre breaking changes | ✓ VERIFIED | Regressão — arquivo não tocado. |
| 14 | README renovado, sem "work in progress", quick start funcional, link para o site | ✓ VERIFIED | `grep -i "work in progress" README.md` → vazio. Único diff desde a última verificação foi a correção do `<img>` do topo (blob URL → raw URL), confirmada por `git show 68706ca -- README.md`; conteúdo/estrutura do resto inalterados. |
| 15 | `docs.yml` válido, permissions minimais, separado do `ci.yml` | ✓ VERIFIED | Regressão — `git diff --stat 6f80f26 68706ca` não lista `.github/workflows/docs.yml` nem `ci.yml`; ambos intactos. |
| 16 | `package.json` tem `homepage` apontando para o site | ✓ VERIFIED | `node -e "require('./package.json').homepage"` → `https://iamcalegari.github.io/mongoat/`. |

**Score:** 16/16 truths verificadas (gap único da verificação anterior fechado; nenhuma regressão nas 15 restantes)

### Required Artifacts

| Artefato | Esperado | Status | Detalhes |
|----------|----------|--------|----------|
| `typedoc.json` | `excludeProtected`, `excludeInternal`, `entryPoints: src/index.ts`, `out: docs/api` | ✓ VERIFIED | Confirmado por leitura direta: `excludeProtected: true`, `excludeInternal: true` (novo), `excludeExternals: true`, `entryPoints: ["src/index.ts"]`, `out: "docs/api"`. |
| `docs/api/**` (Reference TypeDoc gerada) | Cobre API pública do barrel, sem internos | ✓ VERIFIED (gap fechado) | Gerada localmente nesta re-verificação; grep de regressão para todos os Symbols internos conhecidos do projeto (`KModelProxyHandler`, `kDatabase`, `kClient`, `kDb`, `kConnecting`, `kHookContext`) retorna 0 matches em `docs/api/`. |
| `src/database/index.ts` | `@internal` em `[KModelProxyHandler]()` | ✓ VERIFIED | Linha 402: `@internal` no JSDoc imediatamente acima de `static [KModelProxyHandler]()`. |
| `src/model/index.ts` | `@internal` em `[kDatabase]` | ✓ VERIFIED | Linha 285: `@internal` no JSDoc imediatamente acima de `static [kDatabase]: Database \| undefined`. |
| `eslint.config.mjs` | Ignora artefatos gerados de docs | ✓ VERIFIED | `ignores` inclui `docs/.vitepress/dist/**`, `docs/.vitepress/cache/**`, `docs/api/**`; `npm run lint` roda limpo (0 erros). |
| `docs/.vitepress/theme/index.mts` | Banner oficial na home | ✓ VERIFIED | Slot `home-hero-before` com `<img>` via `withBase('/mongoat-cover-4_1-no-bg.png')`; classe `mongoat-banner`. |
| `docs/.vitepress/config.mts` | Favicon oficial | ✓ VERIFIED | `head: [['link', { rel: 'icon', ... href: '/mongoat/mongoat-cover-4_1-no-bg.png' }]]`. |
| `docs/public/mongoat-cover-4_1-no-bg.png` + `mongoat-cover-4_1.png` | Assets copiados para `docs/public/` | ✓ VERIFIED | `ls docs/public/` confirma os 2 arquivos (205327 e 464466 bytes, mesmo tamanho do `graphics/` original). |
| `README.md` | `<img>` funcional (não blob URL) | ✓ VERIFIED | Linha 2: `src="https://raw.githubusercontent.com/iamcalegari/mongoat/main/graphics/mongoat-cover-4_1-no-bg.png"`; arquivo `graphics/mongoat-cover-4_1-no-bg.png` confirmado rastreado no git (`git ls-files graphics/`). |

### Key Link Verification

| From | To | Via | Status | Detalhes |
|------|-----|-----|--------|----------|
| `typedoc.json (excludeInternal)` | `src/database/index.ts` `@internal` + `src/model/index.ts` `@internal` | supressão de membros internos na Reference | ✓ WIRED | Confirmado: build local gera `docs/api/` sem os 2 símbolos; grep de regressão vazio. |
| `docs/.vitepress/theme/index.mts` | `docs/public/mongoat-cover-4_1-no-bg.png` | `withBase('/mongoat-cover-4_1-no-bg.png')` | ✓ WIRED | Confirmado no HTML gerado: `<div class="mongoat-banner"><img src="/mongoat/mongoat-cover-4_1-no-bg.png" alt="Mongoat — a lightweight, type-safe MongoDB ODM"></div>`. |
| `docs/.vitepress/config.mts (head)` | favicon | link tag com `base` explícito | ✓ WIRED | Confirmado no `<head>` do HTML gerado: `<link rel="icon" type="image/png" href="/mongoat/mongoat-cover-4_1-no-bg.png">`. |
| `README.md (img)` | `graphics/mongoat-cover-4_1-no-bg.png` | raw.githubusercontent.com | ✓ WIRED | Arquivo existe e está versionado no git; URL raw renderiza (não é blob URL). |
| `eslint.config.mjs (ignores)` | `docs/api/**`, `docs/.vitepress/dist\|cache/**` | lint não processa artefatos gerados | ✓ WIRED | `npm run lint` roda limpo mesmo após `docs/api` e `docs/.vitepress/dist` existirem no working tree (gerados por este build). |

### Behavioral Spot-Checks

| Comportamento | Comando | Resultado | Status |
|---------------|---------|-----------|--------|
| Build completo do site (TypeDoc→VitePress) | `npm run docs:build` | "Found 0 errors and 9 warnings" (TypeDoc) + "build complete in 4.69s" (VitePress) | ✓ PASS |
| Reference não vaza NENHUM Symbol interno conhecido | `grep -rlE "KModelProxyHandler\|kDatabase\|kClient\|kDb\|kConnecting\|kHookContext" docs/api/` | vazio (0 arquivos, 0 matches) | ✓ PASS (gap fechado) |
| `Database.md` sem `[KModelProxyHandler]`/`KModelMap` como membro | `grep -n "KModelProxyHandler\|KModelMap" docs/api/classes/Database.md` | vazio | ✓ PASS |
| `Model.md` sem `[kDatabase]` como membro | `grep -n "kDatabase" docs/api/classes/Model.md` | vazio | ✓ PASS |
| Lint completo do repo | `npm run lint` | 0 erros, 0 warnings, exit 0 | ✓ PASS |
| Typecheck completo | `npm run typecheck` (`tsc --noEmit`) | exit 0, sem output de erro | ✓ PASS |
| Build da lib | `npm run build` | tsdown: CJS+ESM+`.d.mts`/`.d.cts` gerados, "Build complete in 1232ms" | ✓ PASS |
| Suite de testes completa | `npm test` (`vitest run`) | 34 arquivos, 126 testes, todos passaram | ✓ PASS |
| Banner presente no HTML da home | `grep -o "mongoat-banner" docs/.vitepress/dist/index.html` | `mongoat-banner` encontrado, com `<img src="/mongoat/mongoat-cover-4_1-no-bg.png">` | ✓ PASS |
| Favicon no `<head>` do HTML | `grep -i favicon docs/.vitepress/dist/index.html` | `<link rel="icon" type="image/png" href="/mongoat/mongoat-cover-4_1-no-bg.png">` | ✓ PASS |
| README sem "work in progress" | `grep -i "work in progress" README.md` | vazio | ✓ PASS |
| Arquivos de conteúdo Diátaxis não regrediram | `git diff --stat 6f80f26 68706ca` | Apenas `README.md`, `docs/.vitepress/{config.mts,theme/*}`, `docs/public/*.png`, `eslint.config.mjs`, `src/{database,model}/index.ts`, `typedoc.json` — nenhuma página de conteúdo (tutorials/how-to/explanation/migration) na lista | ✓ PASS |
| Anti-pattern scan (TBD/FIXME/XXX/TODO/HACK/PLACEHOLDER) nos arquivos da correção | `grep -nE "TBD\|FIXME\|XXX\|TODO\|HACK\|PLACEHOLDER" src/database/index.ts src/model/index.ts typedoc.json eslint.config.mjs docs/.vitepress/theme/*.mts docs/.vitepress/theme/*.css docs/.vitepress/config.mts README.md` | 1 match: `src/database/index.ts:472` — falso-positivo, é a palavra portuguesa "TODOS" (contém substring "TODO") num comentário pré-existente sobre `dropIndexes()`, não um marcador de débito | ✓ PASS (sem débito real) |
| `ci.yml` intacto (deploy separado do CI) | `git diff --stat ced946d HEAD -- .github/workflows/docs.yml` (via `6f80f26..HEAD`) | `ci.yml` fora da lista de arquivos alterados desde o fim do Plano 06 | ✓ PASS |
| `package.json.homepage` | `node -e "require('./package.json').homepage"` | `https://iamcalegari.github.io/mongoat/` | ✓ PASS |

### Requirements Coverage

| Requisito | Descrição | Status | Evidência |
|-----------|-----------|--------|-----------|
| DOCS-01 | Site VitePress publicado com quick start e guias do core v1.0 | ✓ SATISFIED | Build verde, 4 quadrantes + Home + Migration completos; deploy real já confirmado anteriormente (observabilidade tratada como satisfeita por instrução do coordenador nesta rodada). |
| DOCS-02 | Referência de API TypeDoc integrada ao site | ✓ SATISFIED (gap fechado) | Reference gerada, integrada via `typedoc-sidebar.json`, cobre a API pública do barrel e **não vaza mais nenhum Symbol interno conhecido** — `excludeInternal: true` + `@internal` nos 2 membros corrigiram a violação de D-04. |
| DOCS-03 | Guia de migração alpha→v1.0 | ✓ SATISFIED | Regressão — `docs/migration.md` não tocado pela correção, 263 linhas mantidas. |
| DOCS-04 | README renovado, sem WIP, quick start funcional | ✓ SATISFIED | Regressão + fix do `<img>` do topo (agora renderiza corretamente via raw URL). |

Nenhum requisito órfão encontrado.

### Anti-Patterns Found

Nenhum marcador de débito técnico real encontrado nos arquivos tocados por esta correção. Único match do scanner (`src/database/index.ts:472`, substring "TODO" dentro da palavra "TODOS") é falso-positivo — comentário existente em português sobre o comportamento de `dropIndexes()`, não um marcador de trabalho pendente.

### Human Verification Required

Nenhum item pendente. O gap único da verificação anterior era objetivamente verificável por grep/leitura de código-fonte e foi fechado e reconfirmado empiricamente nesta re-verificação (build local + grep de regressão + gate completo lint/typecheck/build/test). A observabilidade do re-deploy real (site já publicado e verificado anteriormente em HTTP 200; re-deploy das artes rodando após o push) é tratada como satisfeita por instrução explícita do coordenador — não foi checada nesta rodada.

### Gaps Summary

Nenhum gap remanescente. O único gap da verificação anterior — vazamento de 2 Symbols internos (`Database.[KModelProxyHandler]()`, `Model.[kDatabase]`) na Reference TypeDoc gerada — foi fechado com uma correção pequena e precisa: `@internal` JSDoc nos dois membros + `excludeInternal: true` no `typedoc.json`. A correção foi verificada de forma independente e empírica nesta re-verificação:

1. `npm run docs:build` reexecutado localmente — verde, mesmos warnings pré-existentes não-bloqueantes.
2. Grep de regressão ampliado (não mais restrito aos 4 tokens nominais da verificação anterior) sobre `docs/api/` para `KModelProxyHandler|kDatabase|kClient|kDb|kConnecting|kHookContext` — **0 matches**.
3. Leitura direta de `Database.md` e `Model.md` confirma que os dois membros não aparecem mais como membros documentados.
4. Gate completo (`lint`, `typecheck`, `build`, `test`) rodado e 100% verde — nenhuma regressão introduzida pela correção.
5. Trabalho adicional fora do escopo do gap (artes oficiais — banner, favicon, correção do `<img>` do README) verificado por regressão de diff: tocou apenas os arquivos esperados (`README.md`, `docs/.vitepress/config.mts`, `docs/.vitepress/theme/{index.mts,custom.css}`, `docs/public/*.png`) e não alterou nenhuma das 12 páginas de conteúdo Diátaxis já verificadas anteriormente.

Fase 4 agora com 16/16 must-haves verificados. Pronta para prosseguir (Fase 5 — Release v1.0.0).

---

*Verificado: 2026-07-08T13:52:00-03:00*
*Verificador: Claude (gsd-verifier)*
