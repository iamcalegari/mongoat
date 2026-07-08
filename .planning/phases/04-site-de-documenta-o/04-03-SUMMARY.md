---
phase: 04-site-de-documenta-o
plan: 03
subsystem: docs
tags: [vitepress, diataxis, security, sanitizeFilter, MongoatError, escape-hatch]

# Dependency graph
requires:
  - phase: 04-01
    provides: scaffold buildável do site VitePress (Diátaxis) com stubs de how-to
provides:
  - "docs/how-to/sanitize-filters.md real: sanitizeFilter opt-in vs guard $where incondicional"
  - "docs/how-to/handle-errors.md real: hierarquia MongoatError, tabela subclasse->.code, instanceof/.code"
  - "docs/how-to/escape-hatch.md real: getCollection/getClient/getDb, bypass deliberado de hooks/gating"
affects: [04-04, 04-05, 04-06]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "How-to guides Diátaxis com seção 'See also' cruzando para outros how-tos/reference/migration"
    - "Conteúdo de segurança sempre com contraste explícito opt-in vs incondicional (sanitizeFilter vs $where guard)"

key-files:
  created: []
  modified:
    - docs/how-to/sanitize-filters.md
    - docs/how-to/handle-errors.md
    - docs/how-to/escape-hatch.md

key-decisions:
  - "sanitize-filters.md contrasta explicitamente sanitizeFilter (opt-in, D-06) com o guard $where (incondicional, D-05) reaproveitando o mesmo scanner — evita o dev pensar que um substitui o outro"
  - "handle-errors.md reproduz a tabela subclasse->.code de MIGRATION.md §2.1 verbatim (INVALID_OBJECT_ID, FORBIDDEN_OPERATOR, NOT_CONNECTED, MISSING_DB_NAME, DUPLICATE_KEY, DRIVER_ERROR) para manter as duas fontes coerentes"
  - "escape-hatch.md documenta getCollection() com fail-loud (MongoatConnectionError) e getClient()/getDb() com undefined pré-conexão — comportamentos diferentes conforme o código real (Model vs Database)"

patterns-established:
  - "Cross-links bidirecionais entre sanitize-filters <-> handle-errors <-> hooks <-> escape-hatch no rodapé 'See also' de cada how-to"

requirements-completed: [DOCS-01]

coverage:
  - id: D1
    description: "How-to sanitize-filters.md: sanitizeFilter opt-in em input não-confiável + guard $where incondicional (FORBIDDEN_OPERATOR)"
    requirement: "DOCS-01"
    verification:
      - kind: other
        ref: "npm run docs:build (0 erros, build verde)"
        status: pass
    human_judgment: true
    rationale: "Conteúdo textual/didático — precisão técnica e clareza do contraste opt-in vs incondicional exigem revisão humana (docs:preview), build verde só garante ausência de erro de markdown/link"
  - id: D2
    description: "How-to handle-errors.md: hierarquia MongoatError, tabela subclasse->.code, discriminação por instanceof/.code, .cause preservado, reads que rejeitam Promise"
    requirement: "DOCS-01"
    verification:
      - kind: other
        ref: "npm run docs:build (0 erros, build verde)"
        status: pass
    human_judgment: true
    rationale: "Conteúdo textual/didático — corretude da tabela .code e do padrão instanceof exige revisão humana em docs:preview"
  - id: D3
    description: "How-to escape-hatch.md: getCollection/getClient/getDb, bypass deliberado de hooks/gating, trade-off explícito"
    requirement: "DOCS-01"
    verification:
      - kind: other
        ref: "npm run docs:build (0 erros, build verde)"
        status: pass
    human_judgment: true
    rationale: "Conteúdo textual/didático — precisão sobre fail-loud vs undefined pré-conexão exige revisão humana"

duration: 12min
completed: 2026-07-08
status: complete
---

# Phase 4 Plan 3: How-tos de segurança e acesso nativo Summary

**Três how-tos reais (sanitize-filters, handle-errors, escape-hatch) documentando a superfície de segurança e o acesso nativo ao driver do Mongoat, substituindo os stubs do Plano 01**

## Performance

- **Duration:** ~12 min
- **Tasks:** 2 completas
- **Files modified:** 3

## Accomplishments
- `docs/how-to/sanitize-filters.md`: contraste explícito entre `sanitizeFilter` (opt-in, SEC-01/D-06/D-07) e o guard `$where` incondicional/não-desligável (D-05), com exemplo `sanitizeFilter(req.query)` e o erro `FORBIDDEN_OPERATOR`.
- `docs/how-to/handle-errors.md`: tabela subclasse→`.code` idêntica a MIGRATION.md §2.1, padrão `instanceof`/`.code`, `.cause` preservado, mensagens sanitizadas (E11000 sem valor duplicado) e nota sobre reads rejeitando a Promise em vez de lançar síncrono.
- `docs/how-to/escape-hatch.md`: os três getters (`getCollection`, `getClient`, `getDb`) com assinaturas reais, bypass deliberado e total de hooks/gating, fail-loud (`getCollection`) vs `undefined` pré-conexão (`getClient`/`getDb`), e exemplos de uso legítimo (change streams, agregações avançadas).

## Task Commits

Each task was committed atomically:

1. **Task 1: How-to sanitize-filters + how-to handle-errors** - `85bce35` (docs)
2. **Task 2: How-to escape-hatch (acesso nativo)** - `67549e5` (docs)

**Plan metadata:** commit pendente (docs: complete plan)

## Files Created/Modified
- `docs/how-to/sanitize-filters.md` - substitui stub; sanitizeFilter opt-in + guard $where incondicional
- `docs/how-to/handle-errors.md` - substitui stub; hierarquia MongoatError, tabela subclasse->.code
- `docs/how-to/escape-hatch.md` - substitui stub; getCollection/getClient/getDb, bypass deliberado

## Decisions Made
- Tabela de `.code` em handle-errors.md reproduz MIGRATION.md §2.1 verbatim (mesmos exemplos: `INVALID_OBJECT_ID`, `FORBIDDEN_OPERATOR`, `NOT_CONNECTED`, `MISSING_DB_NAME`, `DUPLICATE_KEY`, `DRIVER_ERROR`) para as duas fontes nunca divergirem silenciosamente.
- escape-hatch.md documenta a assimetria real de comportamento pré-conexão: `getCollection()` lança `MongoatConnectionError` (fail-loud, via `getCollectionOrThrow()`), enquanto `getClient()`/`getDb()` retornam `undefined` (sem guard — `Database` nunca é envolvida em Proxy).
- Cada how-to termina com "See also" cruzando para os outros dois how-tos de segurança/nativo, além de `/how-to/hooks`, `/migration` e `/api/`, coerente com o padrão já estabelecido em `hooks.md` (Plano 02).

## Deviations from Plan

None - plano executado exatamente como escrito. Nenhuma API inventada; todos os exemplos derivam de `src/utils/sanitize.ts`, `src/errors/index.ts`, `src/model/index.ts`, `src/database/index.ts` e `MIGRATION.md` §2.1/§3.2.

## Issues Encountered
None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Três how-tos de segurança/nativo completos e buildando — DOCS-01 avança.
- `config.mts`/`typedoc.json`/`package.json` não tocados — paralelismo da Wave 2 preservado para os planos 04-04/04-05/04-06.
- Nenhum bloqueio identificado.

---
*Phase: 04-site-de-documenta-o*
*Completed: 2026-07-08*

## Self-Check: PASSED

- FOUND: docs/how-to/sanitize-filters.md
- FOUND: docs/how-to/handle-errors.md
- FOUND: docs/how-to/escape-hatch.md
- FOUND: .planning/phases/04-site-de-documenta-o/04-03-SUMMARY.md
- FOUND commit: 85bce35
- FOUND commit: 67549e5
