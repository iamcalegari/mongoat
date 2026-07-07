---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: "**Goal**: A API do alpha é auditada e estabilizada deliberadamente, e então publicada como v1.0.0 com semver disciplinado e um pipeline de release automatizado."
current_phase: 2
current_phase_name: Sistema de hooks completo e API thin nativa
status: verifying
stopped_at: Phase 2 context gathered
last_updated: "2026-07-07T15:44:02.737Z"
last_activity: 2026-07-07
last_activity_desc: Phase 01 complete, transitioned to Phase 2
progress:
  total_phases: 7
  completed_phases: 1
  total_plans: 5
  completed_plans: 5
  percent: 14
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-07-03)

**Core value:** Ser um ODM fino e extensível — produtividade de ODM sem abrir mão do controle e do acesso direto ao driver nativo do MongoDB.
**Current focus:** Phase 01 — funda-o-core-sem-bugs-e-build-moderno

## Current Position

Phase: 2 — Sistema de hooks completo e API thin nativa
Plan: Not started
Status: Phase complete — ready for verification
Last activity: 2026-07-07 — Phase 01 complete, transitioned to Phase 2

Progress: [░░░░░░░░░░] 0%

## Performance Metrics

**Velocity:**

- Total plans completed: 5
- Average duration: — min
- Total execution time: 0.0 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01 | 5 | - | - |

**Recent Trend:**

- Last 5 plans: —
- Trend: —

*Updated after each plan completion*
| Phase 01 P01 | 25min | 3 tasks | 4 files |
| Phase 01 P02 | 30min | 3 tasks | 5 files |
| Phase 01 P03 | 20min | 2 tasks | 4 files |
| Phase 01 P04 | 12min | 2 tasks | 5 files |
| Phase 01 P05 | 35min | 3 tasks | 7 files |

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
- [Phase 01]: [Phase 01-04]: defineModel() teve o duplo-Proxy corrigido (nao apenas documentado) — reaproveita a instancia ja registrada em Database[KModelMap]
- [Phase 01]: [Phase 01-04]: Model constructor agora retorna a instancia registrada/proxied por registerModel() — bug de binding descoberto na Task 1 (new Model() na 1a chamada devolvia this cru sem guard)
- [Phase 01]: [Phase 01-04]: kGetUrlAndDbName deixou de ser async — sem await interno apos kGetDbName virar sincrono
- [Phase 01-05]: isSameConfig compara allowedMethods e o validator ja construido via JSON.stringify (sem lib de deep-equal) para detectar config divergente no registro de model (D-06)
- [Phase 01-05]: validator e construido no constructor ANTES do early-return de config existente, mantendo o constructor sincrono (D-07) enquanto isSameConfig ja tem os dados prontos para comparar
- [Phase 01-05]: delete() corrigido (Rule 1): mongodb@7 findOneAndDelete resolve o documento diretamente, sem o wrapper {value} de versoes antigas do driver — result?.value sempre retornava undefined

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

Last session: 2026-07-07T15:44:02.730Z
Stopped at: Phase 2 context gathered
Resume file: .planning/phases/02-sistema-de-hooks-completo-e-api-thin-nativa/02-CONTEXT.md
