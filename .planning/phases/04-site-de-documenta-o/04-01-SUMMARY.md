---
phase: 04-site-de-documenta-o
plan: 01
subsystem: docs
tags: [vitepress, typedoc, typedoc-plugin-markdown, typedoc-vitepress-theme, diataxis, ssg]

# Dependency graph
requires: []
provides:
  - Stack de documentação instalado (VitePress + TypeDoc + typedoc-plugin-markdown + typedoc-vitepress-theme) buildando verde
  - typedoc.json na raiz gerando Reference de src/index.ts sem símbolos internos/externos vazados
  - docs/.vitepress/config.mts com base '/mongoat/', busca local, nav/sidebar dos 4 quadrantes Diátaxis + Home + Migration + Reference
  - Home real (docs/index.md) e 10 stubs de conteúdo prontos para as Waves 2 preencherem
  - Scripts npm docs:dev/build/preview + predocs:dev/build
affects: [04-02, 04-03, 04-04, 04-05, 04-06]

# Tech tracking
tech-stack:
  added: [vitepress@1.6.4, typedoc@0.28.19, typedoc-plugin-markdown@4.12.0, typedoc-vitepress-theme@1.1.3]
  patterns:
    - "typedoc.json na raiz do repo com docsRoot apontando para docs/ (TypeDoc roda fora da raiz do projeto VitePress)"
    - "predocs:*/docs:* via npm pre* hooks para garantir ordem TypeDoc→VitePress"
    - "excludeExternals: true — Reference cobre só a API própria (barrel raiz), nunca tipos vendorizados de deps externas"

key-files:
  created:
    - typedoc.json
    - docs/.vitepress/config.mts
    - docs/index.md
    - docs/tutorials/getting-started.md
    - docs/how-to/hooks.md
    - docs/how-to/sanitize-filters.md
    - docs/how-to/handle-errors.md
    - docs/how-to/escape-hatch.md
    - docs/how-to/indexes-validation.md
    - docs/explanation/thin-odm-philosophy.md
    - docs/explanation/proxy-gating.md
    - docs/explanation/server-side-validation.md
    - docs/migration.md
    - test/index.test.ts
  modified:
    - package.json
    - package-lock.json
    - .gitignore
    - src/index.ts

key-decisions:
  - "Pinar typedoc@^0.28.19 (não 0.28.20, flagged SUS/too-new no Package Legitimacy Audit) — npm sobrescreveu automaticamente o pin para ^0.28.20 durante o install conjunto; corrigido com um segundo install explícito da versão exata"
  - "excludeExternals: true adicionado ao typedoc.json (não estava no plano original) para impedir que JSDoc herdado de tipos do driver mongodb (contendo sintaxe tipo <string|buffer>) quebrasse o parser Vue do VitePress"
  - "toObjectId (função pública com JSDoc @public completo) não estava re-exportada de src/index.ts — corrigido para que a Reference cubra a API pública real conforme D-04"

patterns-established:
  - "Reference TypeDoc cobre exclusivamente src/index.ts + tipos próprios do projeto (excludeProtected + excludeExternals), nunca internos Symbol-keyed nem tipos vendorizados de dependências"

requirements-completed: [DOCS-01, DOCS-02]

coverage:
  - id: D1
    description: "npm run docs:build completa verde (VitePress builda o site estático sem erro)"
    requirement: "DOCS-01"
    verification:
      - kind: other
        ref: "npm run docs:build (predocs:build + vitepress build docs) — build complete in 3.60s"
        status: pass
    human_judgment: false
  - id: D2
    description: "Reference de API gerada de src/index.ts sem membros protected/Symbol internos (kClient/kDb/kConnecting/kConnectionUrl)"
    requirement: "DOCS-02"
    verification:
      - kind: other
        ref: "grep -rlE 'kClient|kConnecting|kConnectionUrl|kDb' docs/api docs/.vitepress/dist — vazio"
        status: pass
    human_judgment: false
  - id: D3
    description: "Site serve sob base '/mongoat/' com busca local (minisearch) e nav dos 4 quadrantes Diátaxis + Home + Migration"
    requirement: "DOCS-01"
    verification: []
    human_judgment: true
    rationale: "Renderização visual da nav/sidebar/hero e comportamento da busca local exigem inspeção humana do site buildado (npm run docs:preview) — build verde não garante correção visual/UX"
  - id: D4
    description: "toObjectId re-exportado do barrel raiz (bug encontrado durante a Task 2) e coberto pela Reference"
    requirement: "DOCS-02"
    verification:
      - kind: unit
        ref: "test/index.test.ts#exporta toObjectId (SEC-02/D-02/D-04)"
        status: pass
      - kind: other
        ref: "grep toObjectId docs/api/index.md docs/api/functions/ — presente"
        status: pass
    human_judgment: false

duration: 6min
completed: 2026-07-08
status: complete
---

# Phase 4 Plan 1: Fundação buildável do site de documentação Summary

**Stack VitePress+TypeDoc instalado e integrado — site builda verde com Home real, Reference de API sem vazamento de internos, e o esqueleto navegável dos 4 quadrantes Diátaxis pronto para conteúdo.**

## Performance

- **Duration:** ~6 min (entre o primeiro e o último commit de task)
- **Started:** 2026-07-08T12:40:40-03:00
- **Completed:** 2026-07-08T12:46:28-03:00
- **Tasks:** 3/3
- **Files modified:** 17 (4 modificados + 13 criados, incluindo o teste de regressão)

## Accomplishments
- 4 devDeps de documentação instaladas (vitepress, typedoc, typedoc-plugin-markdown, typedoc-vitepress-theme), com `typedoc` pinado deliberadamente em `^0.28.19` para evitar a versão `0.28.20` sinalizada `SUS`/"too-new" no Package Legitimacy Audit
- `typedoc.json` na raiz gerando a Reference de `src/index.ts` — cobre `Database`, `Model`, as 4 classes de erro (`MongoatError` + subclasses), `toObjectId`, `sanitizeFilter`, `METHODS`, `CUSTOM_VALIDATION` e os tipos públicos, sem vazar `kClient`/`kDb`/`kConnecting`/`kConnectionUrl` nem tipos herdados vendorizados do driver `mongodb`
- `docs/.vitepress/config.mts` com `base: '/mongoat/'`, busca local (minisearch), nav/sidebar completos dos 4 quadrantes Diátaxis (Tutorials/How-to/Reference/Explanation) + Home + Migration
- Home real (`docs/index.md`, hero + 6 features) e 10 páginas-stub de conteúdo prontas para as Waves 2 preencherem sem tocar `config.mts`/`typedoc.json`
- `npm run docs:build` completa verde (typedoc → vitepress build), gerando `docs/.vitepress/dist`

## Task Commits

Cada task foi committed atomicamente:

1. **Task 1: Instalar devDeps de docs + scripts npm + gitignore** - `9d57817` (chore)
2. **Task 2: typedoc.json na raiz (Reference sem internos vazados)** - `42faf2b` (feat)
3. **Task 3: config.mts + Home + scaffold Diátaxis (build verde)** - `56c28bf` (feat)

**Plan metadata:** (pendente — commit final de docs após este SUMMARY)

## Files Created/Modified
- `package.json` - 4 devDeps de docs (vitepress/typedoc/typedoc-plugin-markdown/typedoc-vitepress-theme) + scripts docs:dev/build/preview + predocs:dev/build
- `package-lock.json` - lockfile atualizado com as novas devDeps e transitivas
- `.gitignore` - `docs/api/`, `docs/.vitepress/cache/`, `docs/.vitepress/dist/` (artefatos de build)
- `typedoc.json` - config TypeDoc: entryPoints `src/index.ts`, out `docs/api`, docsRoot `./docs`, `excludeProtected: true`, `excludeExternals: true`, plugins markdown+vitepress-theme
- `src/index.ts` - adicionada re-export de `toObjectId` (bug encontrado — função pública sem re-export no barrel raiz)
- `test/index.test.ts` - guarda de regressão da superfície pública do barrel raiz (`toObjectId`, `sanitizeFilter`, `Database`, `Model`, `METHODS`, `CUSTOM_VALIDATION`, hierarquia de erros)
- `docs/.vitepress/config.mts` - nav/sidebar dos 4 quadrantes + Home + Migration + Reference, `base: '/mongoat/'`, busca local
- `docs/index.md` - Home/landing real (hero + features)
- `docs/tutorials/getting-started.md`, `docs/how-to/{hooks,sanitize-filters,handle-errors,escape-hatch,indexes-validation}.md`, `docs/explanation/{thin-odm-philosophy,proxy-gating,server-side-validation}.md`, `docs/migration.md` - stubs mínimos (conteúdo real é escopo das Waves 2)

## Decisions Made
- **Pin de `typedoc` reafirmado manualmente:** o `npm install` conjunto das 4 devDeps sobrescreveu o pin pretendido para `^0.28.20` (a versão flagged `SUS`/too-new pelo Package Legitimacy Audit do RESEARCH). Corrigido com `npm install -D typedoc@0.28.19` explícito, restaurando `^0.28.19` em `package.json` e a versão resolvida `0.28.19` em `package-lock.json` — mitigação T-04-01/T-04-SC do `<threat_model>` do plano permanece válida.
- **`excludeExternals: true` adicionado ao `typedoc.json`** (não estava explicitamente no plano) — necessário para o build da VitePress não quebrar (ver Deviations).
- **`toObjectId` corrigido no barrel raiz** — função pública com JSDoc `@public` completo, documentada em D-04/04-CONTEXT.md como parte da API a cobrir na Reference, mas ausente da re-export de `src/index.ts` (só existia em `src/utils/index.ts`).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `toObjectId` ausente do barrel público raiz**
- **Found during:** Task 2 (verificação da Reference gerada)
- **Issue:** `toObjectId` tem JSDoc `@public` completo em `src/utils/database.ts` e é citada explicitamente em D-04/04-CONTEXT.md como parte da API pública a documentar, mas `src/index.ts` não a re-exportava — a Reference TypeDoc (que usa `entryPoints: ["src/index.ts"]`) não a cobriria, violando a acceptance criteria da Task 2.
- **Fix:** Adicionada `toObjectId` à linha de re-export de `./utils` em `src/index.ts`.
- **Files modified:** `src/index.ts`, `test/index.test.ts` (novo, guarda de regressão)
- **Verification:** `npm run typecheck` e `npm run lint` verdes; `npm test` (126/126 testes, 34 arquivos) verde; `npm run build` (tsdown) verde; `docs/api/functions/toObjectId.md` gerado e listado em `docs/api/index.md`.
- **Committed in:** `42faf2b` (Task 2 commit)

**2. [Rule 3 - Blocking] `excludeExternals: true` necessário para `docs:build` não quebrar**
- **Found during:** Task 3 (`npm run docs:build`)
- **Issue:** `DatabaseConfig` estende `Partial<MongoClientOptions>` (driver `mongodb`); a Reference sem `excludeExternals` incluía membros herdados do driver cujo JSDoc (ex.: `checkServerIdentity`) contém sintaxe estilo Node.js docs `<string|buffer>` — o parser Vue do VitePress interpreta isso como tag HTML malformada e falha o build (`Element is missing end tag`, `docs/api/interfaces/DatabaseConfig.md:383`).
- **Fix:** Adicionada a opção `excludeExternals: true` ao `typedoc.json` (não estava no plano original, que só listava `excludeProtected`). Isso também alinha melhor com D-04 ("cobrir só a API pública exportada do barrel raiz") — `DatabaseConfig` agora documenta só seus 4 campos próprios (`uri`, `username`, `password`, `dbName`), não os ~40 campos herdados do driver.
- **Files modified:** `typedoc.json`
- **Verification:** `npm run docs:build` completa verde; `grep` por `<string|buffer>` em `docs/api/` retorna vazio.
- **Committed in:** `56c28bf` (Task 3 commit)

**3. [Rule 1 - Bug] `npm install` conjunto sobrescreveu o pin de `typedoc`**
- **Found during:** Task 1 (verificação pós-install)
- **Issue:** `npm install -D vitepress@^1.6.4 typedoc@^0.28.19 typedoc-plugin-markdown@^4.12.0 typedoc-vitepress-theme@^1.1.3` resultou em `"typedoc": "^0.28.20"` em `package.json` (não `^0.28.19` como especificado no comando) — resolvendo para a versão flagged `SUS` no Package Legitimacy Audit, contrariando a mitigação T-04-01/T-04-SC do `<threat_model>`.
- **Fix:** `npm install -D typedoc@0.28.19` (versão exata) para forçar o pin correto.
- **Files modified:** `package.json`, `package-lock.json`
- **Verification:** `grep '"typedoc"' package.json` → `"^0.28.19"`; `npm ls typedoc` → `typedoc@0.28.19` resolvido, sem peer conflict.
- **Committed in:** `9d57817` (Task 1 commit)

---

**Total deviations:** 3 auto-fixed (1 bug de barrel público, 1 blocking de build, 1 bug de supply-chain pin)
**Impact on plan:** Todos os 3 auto-fixes eram necessários para correção/segurança/funcionamento (Rules 1 e 3). Nenhum scope creep — nenhuma mudança arquitetural, nenhuma nova dependência além das 4 já aprovadas no plano.

## Issues Encountered
- `npm audit` reporta 3 vulnerabilidades (2 moderate, 1 high) no `esbuild`/`vite` internos ao `vitepress` (dev-server request forgery, `GHSA-67mh-4wv8-2f99`, sem fix disponível upstream). Afeta apenas `vitepress dev` (servidor de desenvolvimento local), não o output estático de `docs:build`/`docs:preview`, nem o pacote publicado do Mongoat (é devDependency transitiva). Não é um item deste plano corrigir — registrado aqui para visibilidade; reavaliar se o `vitepress` lançar uma versão com o `esbuild`/`vite` corrigidos.
- TypeDoc emite 9 warnings (não-bloqueantes) sobre `@param` não usados em `Database.defineModel` e alguns tipos internos (`HookRegistry`, `BaseHookContext`, `JSONSchema4Subset`) referenciados mas não incluídos na documentação — pré-existentes no JSDoc do código de fases anteriores, fora do escopo deste plano (SCOPE BOUNDARY); não bloqueiam o build nem vazam segurança.

## User Setup Required
None - nenhuma configuração de serviço externo necessária nesta task (o GitHub Pages "Source: GitHub Actions" é escopo de um plano posterior desta fase, quando o workflow de deploy for criado).

## Next Phase Readiness
- Fundação buildável pronta: `typedoc.json`/`config.mts` não devem mais ser tocados pelos planos de conteúdo (Wave 2) — evita conflito de arquivo em execução paralela.
- Os 10 stubs existem nos caminhos exatos referenciados pela nav/sidebar — os planos de conteúdo (04-02 a 04-05, presumivelmente) só precisam substituir o conteúdo desses arquivos.
- `docs/migration.md` ainda é stub — DOCS-03 (consolidação de CHANGELOG.md/MIGRATION.md) é escopo de plano posterior.
- Nenhum blocker.

---
*Phase: 04-site-de-documenta-o*
*Completed: 2026-07-08*

## Self-Check: PASSED

Todos os arquivos criados/modificados existem em disco; todos os 3 commits de task (`9d57817`, `42faf2b`, `56c28bf`) confirmados em `git log`.
