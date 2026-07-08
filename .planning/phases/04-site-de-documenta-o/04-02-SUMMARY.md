---
phase: 04-site-de-documenta-o
plan: 02
subsystem: docs
tags: [vitepress, diataxis, tutorial, how-to, hooks, indexes, jsonschema]

requires:
  - phase: 04-site-de-documenta-o (Plano 01)
    provides: "Fundação buildável do site (VitePress + TypeDoc + scaffold Diátaxis com stubs), nav/sidebar já apontando para os caminhos usados aqui"
provides:
  - "Tutorial getting-started real: connect → definir schema/model → CRUD (5 métodos), com outputs esperados"
  - "How-to hooks.md: pre/post ctx-based, acumulação em ordem, fireAndForget, guard de recursão"
  - "How-to indexes-validation.md: CreateIndexProps + aplicação idempotente + validação server-side \$jsonSchema"
affects: ["04-03 (segurança: sanitizeFilter/erros/escape-hatch)", "04-04/05/06 (demais páginas do site)"]

tech-stack:
  added: []
  patterns:
    - "Código dos guias reaproveitado literalmente de examples/model/model.ts e examples/model/usage.ts (nunca inventado) — mantém a doc sincronizada com exemplos type-checked no CI"
    - "How-to links apontam só para páginas já existentes na nav (mesmo que stub) — nunca dead-links"

key-files:
  created: []
  modified:
    - docs/tutorials/getting-started.md
    - docs/how-to/hooks.md
    - docs/how-to/indexes-validation.md

key-decisions:
  - "Conteúdo 100% derivado de src/model/index.ts, src/database/index.ts, MIGRATION.md §1 e examples/ — nenhuma API inventada"
  - "getting-started.md termina em 'Next steps' linkando hooks.md, indexes-validation.md e /api/ (Reference), sem apontar para stubs fora do escopo deste plano"

patterns-established:
  - "Diátaxis: Tutorials = caminho feliz único guiado; How-to = tarefa objetiva assumindo conhecimento básico — mantido estritamente nas 3 páginas"

requirements-completed: [DOCS-01]

coverage:
  - id: D1
    description: "Tutorial getting-started cobrindo connect → schema/model → CRUD (insert/update/findMany/delete/total) com API real v1.0"
    requirement: "DOCS-01"
    verification:
      - kind: other
        ref: "npm run docs:build (valida links internos; sem dead-link)"
        status: pass
    human_judgment: true
    rationale: "Qualidade pedagógica do passo-a-passo (clareza, ordem, se um dev novo consegue seguir) exige leitura humana no docs:preview — build verde só garante ausência de erros estruturais/links quebrados"
  - id: D2
    description: "How-to hooks.md documentando assinatura ctx, acumulação em ordem e fireAndForget"
    requirement: "DOCS-01"
    verification:
      - kind: other
        ref: "npm run docs:build"
        status: pass
    human_judgment: true
    rationale: "Precisão conceitual (ctx vs this-bound, ordem de acumulação) é melhor validada por revisão humana do conteúdo"
  - id: D3
    description: "How-to indexes-validation.md documentando CreateIndexProps e validação \$jsonSchema server-side"
    requirement: "DOCS-01"
    verification:
      - kind: other
        ref: "npm run docs:build"
        status: pass
    human_judgment: true
    rationale: "Mesma razão de D1/D2 — conteúdo autoral revisado por humano no preview"

duration: 20min
completed: 2026-07-08
status: complete
---

# Phase 04 Plan 02: Tutorial getting-started + how-tos de hooks e índices/validação Summary

**Tutorial getting-started (connect→schema→CRUD) e dois how-tos centrais (hooks pre/post ctx-based; índices+validação \$jsonSchema) preenchidos com código real extraído de `examples/` e `src/`, substituindo os stubs do Plano 01 — `npm run docs:build` verde.**

## Performance

- **Duration:** ~20 min
- **Started:** 2026-07-08T15:36:00Z (aprox.)
- **Completed:** 2026-07-08T15:56:36Z
- **Tasks:** 2/2
- **Files modified:** 3

## Accomplishments
- `docs/tutorials/getting-started.md`: quick start guiado — install, connect (`Database` + env vars `MONGODB_URI`/`MONGODB_USERNAME`/`MONGODB_PASSWORD`/`MONGODB_DB_NAME`), define model (`ModelValidationSchema` + `CreateIndexProps` + `new Model(...)`), CRUD completo (`insert`/`update`/`findMany`/`delete`/`total`) com outputs esperados nos comentários, e "Next steps" linkando hooks/indexes-validation/Reference.
- `docs/how-to/hooks.md`: assinatura `ctx` (não `this`-bound), acumulação de hooks em ordem de registro, `post` hooks observando por padrão + `fireAndForget` roteado a `onHookError`, nota sobre o guard de recursão.
- `docs/how-to/indexes-validation.md`: `CreateIndexProps` no construtor do Model, aplicação idempotente via `setupCollections()`/`setupIndexes()` (diff em vez de `dropIndexes()` incondicional), validação server-side via `$jsonSchema` (`collMod`) com `validity: true`.

## Task Commits

Each task was committed atomically:

1. **Task 1: Tutorial getting-started (connect → schema → CRUD)** - `017dbdd` (docs)
2. **Task 2: How-to hooks + how-to indexes/validation** - `803a0c7` (docs)

**Plan metadata:** (this commit)

## Files Created/Modified
- `docs/tutorials/getting-started.md` - Tutorial guiado connect→schema→CRUD com código real de examples/
- `docs/how-to/hooks.md` - How-to de hooks pre/post ctx-based, acumulação, fireAndForget
- `docs/how-to/indexes-validation.md` - How-to de CreateIndexProps + validação $jsonSchema server-side

## Decisions Made
- None - plano executado exatamente como escrito. Todo código reaproveitado literalmente de `examples/model/model.ts`/`examples/model/usage.ts` (nunca inventado), conforme instruído no plano.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- `npm run docs:build` verde (predocs:build/TypeDoc + vitepress build), sem dead-link introduzido pelas 3 páginas novas.
- Warnings pré-existentes do TypeDoc (params não usados em `Database.defineModel`, tipos internos não incluídos) são fora do escopo deste plano — não tocados (config.mts/typedoc.json são do Plano 01).
- Pronto para o Plano 03 (segurança: sanitizeFilter/erros/escape-hatch) preencher os how-tos restantes (`sanitize-filters.md`, `handle-errors.md`, `escape-hatch.md`), ainda stubs.

---
*Phase: 04-site-de-documenta-o*
*Completed: 2026-07-08*

## Self-Check: PASSED
All created/modified files and both task commit hashes (017dbdd, 803a0c7) verified present.
