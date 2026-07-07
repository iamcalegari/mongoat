---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: "**Goal**: A API do alpha é auditada e estabilizada deliberadamente, e então publicada como v1.0.0 com semver disciplinado e um pipeline de release automatizado."
current_phase: 01
current_phase_name: funda-o-core-sem-bugs-e-build-moderno
status: executing
stopped_at: Completed 01-02-PLAN.md
last_updated: "2026-07-07T04:46:07.089Z"
last_activity: 2026-07-07
last_activity_desc: Phase 01 execution started
progress:
  total_phases: 7
  completed_phases: 0
  total_plans: 5
  completed_plans: 3
  percent: 0
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-07-03)

**Core value:** Ser um ODM fino e extensível — produtividade de ODM sem abrir mão do controle e do acesso direto ao driver nativo do MongoDB.
**Current focus:** Phase 01 — funda-o-core-sem-bugs-e-build-moderno

## Current Position

Phase: 01 (funda-o-core-sem-bugs-e-build-moderno) — EXECUTING
Plan: 4 of 5
Status: Ready to execute
Last activity: 2026-07-07 — Phase 01 execution started

Progress: [░░░░░░░░░░] 0%

## Performance Metrics

**Velocity:**

- Total plans completed: 0
- Average duration: — min
- Total execution time: 0.0 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| - | - | - | - |

**Recent Trend:**

- Last 5 plans: —
- Trend: —

*Updated after each plan completion*
| Phase 01 P01 | 25min | 3 tasks | 4 files |
| Phase 01 P02 | 30min | 3 tasks | 5 files |
| Phase 01 P03 | 20min | 2 tasks | 4 files |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- [Pesquisa]: Decorators serão TC39 padrão (sem `reflect-metadata`, sem flags experimentais), coexistindo com a API de objetos.
- [Roadmap]: Bugs conhecidos (QUAL-01) e build tooling precedem a expansão de hooks; v1.0 (Phase 4) gateia em blindagem (testes + segurança, Phase 3).
- [Phase 01]: Checkpoint de supply-chain (T-01-01-SC) aprovado: 7 pacotes [SUS] instalados com as versoes exatas verificadas no npm registry (tsdown 0.22.3, vitest 4.1.10, @testcontainers/mongodb 12.0.4, testcontainers 12.0.4, @arethetypeswrong/cli 0.18.4, tsx 4.23.0, @vitest/coverage-v8 4.1.10).
- [Phase 01]: Subpath exports (./database, ./model, ./utils, ./types) removidos do package.json — barrel raiz ja cobre tudo, evita quadruplicar o exports map dual.
- [Phase 01-02]: tsdown resolve aliases nativamente sem config extra de alias — Confirma Open Question 1 do RESEARCH.md; nenhum alias explicito necessario no tsdown.config.ts
- [Phase 01-02]: json-schema vendorizado como JSONSchema4Subset em vez de mantido como devDependency — attw nao detectava o vazamento localmente, mas grep no .d.ts revelava import externo; vendorizar fecha QUAL-04 por completo
- [Phase 01-03]: vite-tsconfig-paths respeita include/exclude do tsconfig.json — test/**/* precisou ser adicionado ao include para os aliases resolverem em arquivos de teste
- [Phase 01-03]: resolve.tsconfigPaths nativo do Vite 8 habilitado como fallback junto do plugin vite-tsconfig-paths (o plugin sozinho não resolveu os aliases nesta combinação de versões)
- [Phase 01-03]: URI de conexão do testcontainers/mongodb ganha directConnection=true para evitar reconexão pelo hostname interno do container (replica set de nó único)

### Pending Todos

[From .planning/todos/pending/ — ideas captured during sessions]

None yet.

### Blockers/Concerns

[Issues that affect future work]

- REL-02 (build dual CJS/ESM) é entregue na Phase 1, mas o gate `are-the-types-wrong` em CI só é automatizado quando a CI existir (Phase 3) — validar localmente até lá.
- Gaps de pesquisa a decidir no planning: versão mínima de MongoDB (Phase 3), `Schema.compile()` público vs interno (Phase 5), `Object.freeze` do validator pós-setup (Phase 6).

## Deferred Items

Items acknowledged and carried forward from previous milestone close:

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| *(none)* | | | |

## Session Continuity

Last session: 2026-07-07T04:44:44.927Z
Stopped at: Completed 01-02-PLAN.md
Resume file: None
