---
phase: 04-site-de-documenta-o
plan: 05
subsystem: docs
tags: [vitepress, migration-guide, documentation, diataxis]

# Dependency graph
requires:
  - phase: 04-site-de-documenta-o (04-01)
    provides: scaffolding VitePress + stub docs/migration.md + entrada "Migration" na nav
provides:
  - "docs/migration.md consolidado: guia de migração alpha→v1.0 completo, cobrindo as 4 seções (Hooks, Errors, Input validation, Environment & build)"
  - "Cada breaking change do CHANGELOG.md [Unreleased] documentada com before/after/how-to-migrate"
affects: [05-release-v1, docs-manutencao-continua]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Página fora dos 4 quadrantes Diátaxis (guia de migração) consolida arquivos raiz (CHANGELOG.md/MIGRATION.md) mantendo-os como fonte editável"

key-files:
  created: []
  modified:
    - docs/migration.md

key-decisions:
  - "docs/migration.md é a versão publicada/consolidada; CHANGELOG.md e MIGRATION.md na raiz permanecem fonte editável (D-03/Claude's Discretion do 04-CONTEXT.md) — nota no topo da página explicita isso"
  - "Cross-links limitados a páginas já existentes na nav (how-to/hooks, how-to/handle-errors, how-to/sanitize-filters, /api/) — nenhum link para stub inexistente"

requirements-completed: [DOCS-03]

coverage:
  - id: D1
    description: "docs/migration.md consolida CHANGELOG.md + MIGRATION.md numa página do site, linkada em /migration na nav, cobrindo TODAS as breaking changes alpha→v1.0 (hooks, erros, input validation, env/build) com before/after/how-to-migrate"
    requirement: "DOCS-03"
    verification:
      - kind: automated_ui
        ref: "npm run docs:build (vitepress build docs) — build verde"
        status: pass
      - kind: other
        ref: "node -e coverage grep: ['Hooks','Errors','sanitizeFilter','20.19','subpath'] presentes em docs/migration.md"
        status: pass
    human_judgment: true
    rationale: "Cobertura textual e build verde são verificáveis automaticamente, mas a qualidade da consolidação (clareza dos exemplos before/after, fidelidade ao MIGRATION.md/CHANGELOG.md) e a navegação real da entrada 'Migration' no preview requerem revisão humana visual, conforme <human-check> do plano."

duration: 12min
completed: 2026-07-08
status: complete
---

# Phase 4 Plan 05: Guia de migração consolidado (alpha → v1.0) Summary

**docs/migration.md preenchido com o guia de migração alpha→v1.0 completo (4 seções, todas as breaking changes com before/after/how-to-migrate), substituindo o stub "Content coming soon."**

## Performance

- **Duration:** 12 min
- **Started:** 2026-07-08T16:02:00Z
- **Completed:** 2026-07-08T16:14:48Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments
- Consolidação de `MIGRATION.md` + `CHANGELOG.md` (raiz) em `docs/migration.md`, preservando a estrutura por seção (Hooks / Errors / Input validation / Environment & build) e o formato what changed / before / after / how to migrate
- Cobertura de todas as breaking changes listadas no `CHANGELOG.md [Unreleased]`: hooks acumulativos, `ctx` explícito, `post`/`fireAndForget`, hierarquia `MongoatError`, rejeição de Promise em vez de throw síncrono, `toObjectId`/`findById` fail-loud, `$where` bloqueado + `sanitizeFilter` opt-in, Node mínimo `^20.19.0 || >=22.12.0`, remoção de subpath exports, remoção do `json-schema` runtime
- Nota de topo explicando que a página é a versão consolidada/publicada e que os arquivos raiz permanecem fonte editável, com ToC no topo
- Cross-links adicionados para `how-to/hooks`, `how-to/handle-errors`, `how-to/sanitize-filters` e `/api/` (todas páginas já existentes na nav — nenhum link para stub inexistente)

## Task Commits

Each task was committed atomically:

1. **Task 1: Consolidar migration.md (alpha → v1.0)** - `7598567` (docs)

**Plan metadata:** (este commit, a seguir)

## Files Created/Modified
- `docs/migration.md` - Guia de migração alpha→v1.0 consolidado, 264 linhas, cobrindo as 4 seções com before/after/how-to-migrate para cada breaking change

## Decisions Made
- Mantida a estrutura de seções e numeração idêntica ao `MIGRATION.md` (1. Hooks, 2. Errors, 3. Input validation, 4. Environment & build) para não introduzir drift estrutural entre os arquivos-fonte e a página do site
- Adicionados exemplos before/after extras (2.2 Read methods, 3.1 toObjectId/findById) não presentes literalmente no `MIGRATION.md` original, para cumprir a exigência do plano de "cada mudança com before/after/how-to-migrate" de forma completa
- Seção 1.3 (`post` hooks/`fireAndForget`) marcada explicitamente como não-breaking/aditiva, sem "how to migrate" (nada a migrar)

## Deviations from Plan

None - plano executado exatamente como escrito. O `MIGRATION.md` já continha a maior parte do conteúdo; o trabalho foi consolidar e completar with before/after ausentes (itens 2.2 e 3.1 no MIGRATION.md original não tinham blocos de código before/after explícitos — adicionados para atender ao "cada uma com before/after/how-to-migrate" do plano, sob Rule 2 - funcionalidade crítica ausente/incompleta em relação ao critério de aceitação).

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Adicionados blocos before/after explícitos nas seções 2.2 e 3.1**
- **Found during:** Task 1
- **Issue:** O `MIGRATION.md` raiz descrevia "how to migrate" para os itens 2.2 (read methods rejeitam Promise) e 3.1 (toObjectId/findById fail-loud) sem exemplos de código before/after, mas o plano exige "cada mudança com before/after/how-to-migrate" (must_haves.truths)
- **Fix:** Adicionados blocos de código before/after ilustrando o comportamento antigo (throw síncrono; id malformado silenciosamente resolvido) vs. novo (Promise rejeitada; `MongoatValidationError` lançado)
- **Files modified:** docs/migration.md
- **Verification:** Revisão visual do conteúdo gerado; grep de cobertura (`Hooks`, `Errors`, `sanitizeFilter`, `20.19`, `subpath`) passou
- **Committed in:** 7598567 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 funcionalidade crítica ausente/incompleta)
**Impact on plan:** Ajuste necessário para cumprir literalmente o critério de aceitação do plano (before/after em toda mudança). Sem scope creep — mesmo escopo de conteúdo (MIGRATION.md + CHANGELOG.md), apenas completude de formato.

## Issues Encountered
None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- DOCS-03 satisfeito: guia de migração consolidado, completo, linkado na nav (`/migration`), buildando verde
- `config.mts`, `typedoc.json` e `package.json` não foram tocados — paralelismo da Wave 2 preservado (plano 04-06 pode prosseguir independentemente)
- Revisão humana visual do preview (`npm run docs:preview`) ainda recomendada antes do fechamento da fase, para confirmar navegação e legibilidade — marcado como `human_judgment: true` na coverage table

---
*Phase: 04-site-de-documenta-o*
*Completed: 2026-07-08*

## Self-Check: PASSED
- FOUND: docs/migration.md
- FOUND: 7598567 (git log)
- FOUND: .planning/phases/04-site-de-documenta-o/04-05-SUMMARY.md
