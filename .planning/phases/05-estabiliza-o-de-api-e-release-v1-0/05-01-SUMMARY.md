---
phase: 05-estabiliza-o-de-api-e-release-v1-0
plan: 01
subsystem: api
tags: [semver, changelog, migration-guide, deprecation, release-engineering]

# Dependency graph
requires:
  - phase: 04-documenta-o-e-publica-o-do-core
    provides: CHANGELOG.md/MIGRATION.md (fonte editável) + docs/migration.md (cópia publicada) já escritos como base da auditoria
provides:
  - API pública congelável (sem @deprecated pendentes) — barrel sem Database.defineModel/Model.create
  - Diff alpha→1.1.0 registrado em CHANGELOG.md (seção [1.1.0]) e MIGRATION.md/docs/migration.md (seção 5 — API surface)
  - Toda menção textual "v1.0.0"/"v1.0.0-rc" reconciliada para "1.1.0"/"1.1.0-rc.0" em CHANGELOG/MIGRATION/docs/ROADMAP (Fase 5)
affects: [05-02-pipeline-changesets, 05-03-rc-publish, 05-04-bump-estavel, 05-05-publish-gated]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Remoção de API deprecated delega ao construtor canônico (new Model(...)); testes deprecated removidos em vez de reescritos quando a semântica já está coberta pelo caso canônico equivalente"

key-files:
  created: []
  modified:
    - src/database/index.ts
    - src/model/index.ts
    - test/database/proxy-binding.test.ts
    - test/model/registry-config.test.ts
    - CHANGELOG.md
    - MIGRATION.md
    - docs/migration.md
    - .planning/ROADMAP.md

key-decisions:
  - "Database.defineModel e Model.create removidos por completo (não apenas documentados) — D-06 + research A4: breaking aceitável na primeira estável, zero consumidores externos"
  - "Import órfão ModelSetup removido de src/database/index.ts; o type ModelSetup em si permanece no barrel público (fora do escopo dos files_modified do plano — não é um bug, é um type exportado que consumidores podem usar independentemente)"
  - "Testes deprecated removidos (não reescritos) — a semântica que cobriam (config divergente lança MongoatError, mesma config reusa instância, gating de método) já está coberta pelos casos equivalentes via new Model(...) nos mesmos arquivos"
  - "CHANGELOG [Unreleased] renomeado para [1.1.0] - 2026-07-10 com link de comparação apontando para a tag v1.1.0 (ainda não publicada — será criada nas waves seguintes)"
  - "Nova seção 5 (API surface) adicionada a MIGRATION.md e docs/migration.md com before/after documentando new Model(...) como substituto de defineModel/Model.create"

patterns-established:
  - "Reconciliação de versão-alvo escopada por seção: o 'v1.0' conceitual do milestone (Overview do ROADMAP) permanece intacto — só o goal/success-criteria da seção Fase 5 muda para 1.1.0"

requirements-completed: [REL-03]

coverage:
  - id: D1
    description: "Database.defineModel e Model.create removidos do barrel público; construtor new Model(...) permanece como única via de registro/gating"
    requirement: "REL-03"
    verification:
      - kind: unit
        ref: "npm test (122 testes, 34 arquivos) — nenhum referencia as APIs removidas"
        status: pass
      - kind: other
        ref: "grep -rnE 'static +defineModel|static +create\\b' src/ (sem matches)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Diff alpha→1.1.0 registrado (entrada BREAKING no CHANGELOG e seção 5 em MIGRATION.md/docs/migration.md) e strings de versão-alvo reconciliadas para 1.1.0 em CHANGELOG/MIGRATION/docs/ROADMAP (Fase 5)"
    requirement: "REL-03"
    verification:
      - kind: other
        ref: "grep -rnE 'v?1\\.0\\.0([^0-9]|$)' CHANGELOG.md MIGRATION.md docs/migration.md (sem matches) + grep na seção Fase 5 do ROADMAP.md"
        status: pass
      - kind: other
        ref: "npm run docs:build (0 errors, 3 warnings pré-existentes não relacionados)"
        status: pass
    human_judgment: false

duration: 20min
completed: 2026-07-10
status: complete
---

# Phase 5 Plan 1: Auditoria/congelamento da API + reconciliação de versão Summary

**Remoção definitiva de `Database.defineModel`/`Model.create` (2 `@deprecated`) do barrel público, com diff alpha→1.1.0 registrado no CHANGELOG/MIGRATION e toda menção textual "v1.0.0" reconciliada para "1.1.0" em CHANGELOG.md, MIGRATION.md, docs/migration.md e na seção Fase 5 do ROADMAP.md.**

## Performance

- **Duration:** ~20 min
- **Completed:** 2026-07-10
- **Tasks:** 2/2 completos
- **Files modified:** 8

## Accomplishments
- `Database.defineModel()` (src/database/index.ts) e `Model.create()` (src/model/index.ts) removidos por completo — API pública congelada sem `@deprecated` pendentes; `new Model(...)` permanece como a única via de registro/gating
- Testes deprecated removidos de `test/database/proxy-binding.test.ts` e `test/model/registry-config.test.ts` — a semântica coberta (gating de método, config divergente, duplo-Proxy) já está coberta pelos casos equivalentes via `new Model(...)`
- CHANGELOG `## [Unreleased]` renomeado para `## [1.1.0] - 2026-07-10`, com entrada BREAKING nova para a remoção das 2 APIs e link de comparação do rodapé ajustado
- MIGRATION.md e docs/migration.md ganharam a seção "5. API surface" com before/after de `new Model(...)` como substituto, mantidos sincronizados (convenção D-03 da Fase 4)
- Todas as menções de versão-alvo "v1.0.0"/"v1.0.0-rc" substituídas por "1.1.0"/"1.1.0-rc.0" em CHANGELOG.md, MIGRATION.md, docs/migration.md e no goal/success-criteria da seção Fase 5 do ROADMAP.md (o "v1.0" conceitual do milestone no Overview permanece intacto)

## Task Commits

Each task was committed atomically:

1. **Task 1: Remover as 2 APIs @deprecated e atualizar os testes que as exercitavam** - `58a7861` (fix)
2. **Task 2: Registrar o diff alpha→1.1.0 e reconciliar as strings de versão** - `e1e92da` (docs)

_Note: um commit não relacionado a este plano (`5b2e6e8` — 4 how-tos de docs) aterrissou no histórico entre as duas tasks; foi feito por outra sessão/processo concorrente, não faz parte deste plano._

## Files Created/Modified
- `src/database/index.ts` - Remove `Database.defineModel` e o import órfão de `ModelSetup`
- `src/model/index.ts` - Remove `Model.create`
- `test/database/proxy-binding.test.ts` - Remove 2 casos que exercitavam `Database.defineModel`
- `test/model/registry-config.test.ts` - Remove 2 casos que exercitavam `Database.defineModel`
- `CHANGELOG.md` - Renomeia `[Unreleased]` → `[1.1.0]`, adiciona entrada BREAKING, ajusta link de comparação
- `MIGRATION.md` - Nova seção 5 (API surface); strings de versão reconciliadas
- `docs/migration.md` - Espelha MIGRATION.md (seção 5 + strings de versão)
- `.planning/ROADMAP.md` - Goal e success criteria da seção Fase 5 atualizados para 1.1.0

## Decisions Made
- `Database.defineModel`/`Model.create` removidos por completo (não deprecados-mantidos) — D-06 + research A4
- Import órfão `ModelSetup` removido de `src/database/index.ts`; o `type ModelSetup` em si permanece exportado no barrel (fora do escopo do plano — não é um bug, apenas deixou de ter uso interno)
- Testes deprecated removidos (não reescritos) por já terem cobertura equivalente via `new Model(...)`
- Nova seção "5. API surface" em MIGRATION.md/docs/migration.md (em vez de espremer a entrada em uma seção existente) — mantém o padrão de uma seção por área de breaking change

## Deviations from Plan

None - plano executado exatamente como escrito.

## Issues Encountered

Nenhum. Um commit de outra sessão/processo (`5b2e6e8` — 4 how-tos de docs) aterrissou no histórico entre a Task 1 e a Task 2 deste plano; não conflitou com os arquivos deste plano e não exigiu nenhuma ação.

## User Setup Required

None - nenhuma configuração de serviço externo necessária.

## Next Phase Readiness
- API pública congelável (sem `@deprecated` pendentes) — pronta para o RC (05-03) e a publicação estável (05-05)
- CHANGELOG/MIGRATION/docs/ROADMAP consistentes em `1.1.0` — nenhum bloqueio textual remanescente para os planos seguintes (05-02 pipeline changesets, 05-03 RC, 05-04 bump estável, 05-05 publish gated)
- Nenhum blocker novo identificado

---
*Phase: 05-estabiliza-o-de-api-e-release-v1-0*
*Completed: 2026-07-10*

## Self-Check: PASSED

Todos os arquivos criados/modificados encontrados no disco; ambos os commits de task (`58a7861`, `e1e92da`) confirmados em `git log`.
