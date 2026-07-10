---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: "**Goal**: A API do alpha é auditada e estabilizada deliberadamente, e então publicada como v1.0.0 com semver disciplinado e um pipeline de release automatizado."
current_phase: 5
current_phase_name: Estabilização de API e release v1.0
status: verifying
stopped_at: Phase 5 context gathered
last_updated: "2026-07-08T18:18:27.074Z"
last_activity: 2026-07-08
last_activity_desc: Phase 4 complete, transitioned to Phase 5
progress:
  total_phases: 8
  completed_phases: 4
  total_plans: 19
  completed_plans: 19
  percent: 50
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-07-03)

**Core value:** Ser um ODM fino e extensível — produtividade de ODM sem abrir mão do controle e do acesso direto ao driver nativo do MongoDB.
**Current focus:** Phase 4 — site-de-documenta-o

## Current Position

Phase: 5 — Estabilização de API e release v1.0
Plan: Not started
Status: Phase complete — ready for verification
Last activity: 2026-07-10 — Completed quick task 260708-lt1: fix logo dark mode + paleta verde do logo

Progress: [░░░░░░░░░░] 0%

## Performance Metrics

**Velocity:**

- Total plans completed: 16
- Average duration: — min
- Total execution time: 0.0 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01 | 5 | - | - |
| 3 | 5 | - | - |
| 4 | 6 | - | - |

**Recent Trend:**

- Last 5 plans: —
- Trend: —

*Updated after each plan completion*
| Phase 01 P01 | 25min | 3 tasks | 4 files |
| Phase 01 P02 | 30min | 3 tasks | 5 files |
| Phase 01 P03 | 20min | 2 tasks | 4 files |
| Phase 01 P04 | 12min | 2 tasks | 5 files |
| Phase 01 P05 | 35min | 3 tasks | 7 files |
| Phase 02 P01 | 20min | 3 tasks | 14 files |
| Phase 02 P02 | 10min | 3 tasks | 7 files |
| Phase 02 P03 | 15min | 3 tasks | 5 files |
| Phase 03 P01 | 20min | 3 tasks | 13 files |
| Phase 03 P03 | 6min | 2 tasks | 3 files |
| Phase 03 P02 | 25min | 3 tasks | 8 files |
| Phase 03 P04 | 25min | 2 tasks | 4 files |
| Phase 03 P05 | 15min | 2 tasks | 3 files |
| Phase 04 P01 | 6min | 3 tasks | 17 files |
| Phase 04 P02 | 20min | 2 tasks | 3 files |
| Phase 04 P03 | 12min | 2 tasks | 3 files |
| Phase 04 P04 | 25min | 2 tasks | 3 files |
| Phase 04 P05 | 12min | 1 tasks | 1 files |
| Phase 04 P06 | 35min | 3 tasks | 3 files |

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
- [Phase 02-01]: INSERT_MANY ctx usa document (singular, por-doc) alem de documents (batch) - pre hooks rodam por documento, post hooks rodam uma vez para o batch inteiro
- [Phase 02-01]: Todos os 12 metodos CRUD agora passam pelo pipeline assincrono de hooks - metodos de leitura deixam de lancar MongoatError sincronamente quando desconectados, agora rejeitam a Promise
- [Phase 02-01]: pre()/post() acumulam (push) em vez de sobrescrever (D-01) - breaking change intencional em alpha, quebra o padrao antigo de resetar hooks com pre() no-op
- [Phase ?]: [Phase 02-02]: fireAndForget post-hook dispatch é Promise.resolve().then().catch(onHookError) + continue no loop — verdadeiramente não-aguardado, resolve Open Question 1/A2 do RESEARCH.md
- [Phase ?]: [Phase 02-02]: defaultOnHookError loga apenas err via console.error, nunca o ctx inteiro (T-02-02 — evita vazar document/filter em logs ingênuos)
- [Phase 02-03]: escape hatch honesto (getCollection/getClient/getDb) fora do enum METHODS — bypass total e deliberado de hooks e gating (D-08)
- [Phase 02-03]: insertMany era o único dos 12 métodos lendo o parâmetro options original em vez de ctx.options na chamada ao driver — fix de Pitfall 4 (D-09)
- [Phase 02-03]: os 12 métodos públicos já tinham retorno TS explícito e preciso desde a Wave 1 — Task 3 (API-04) confirmada sem necessidade de mudança de código
- [Phase ?]: [Phase 03-01]: @eslint/js instalado em ^9.39.4 (nao ^10.0.1 do RESEARCH) - @eslint/js@10 exige eslint ^10 como peer, incompativel com eslint@9.39.2 pinado
- [Phase ?]: [Phase 03-01]: eslint.config.js virou eslint.config.mjs (ESM) - evita globals extras (require/module/__dirname) so para o proprio arquivo de config
- [Phase ?]: [Phase 03-01]: ModelValidationSchema<T = any> manteve o any documentado - never/Record<string,unknown>&DefaultProperties quebram o mapped type homomorfico {[k in keyof T]}, mudanca estrutural fora do escopo do lint gate
- [Phase ?]: [Phase 03-01]: KModelProxyHandler 'method not allowed' permanece MongoatError base (nao subclasse) com code METHOD_NOT_ALLOWED - gating de Proxy nao e validacao/conexao/driver
- [Phase ?]: onHookError é void mas runtime pode devolver Promise — dispatchOnHookError faz cast via unknown antes de sondar .then()
- [Phase ?]: setupIndexes não foi reimplementado (já incremental desde WR-10/Fase 1) — apenas coberto por teste de regressão de idempotência
- [Phase 03-02]: toObjectId()/toObjectId(undefined) mantém geração de novo ObjectId (não-breaking) — valida e lança MongoatValidationError(INVALID_OBJECT_ID) somente quando um argumento é fornecido mas inválido
- [Phase 03-02]: findById trata documentId nullish como erro explícito via Promise.reject, em vez de delegar a toObjectId(undefined) que geraria _id aleatório mascarando o bug do caller
- [Phase 03-02]: sanitizeFilter permanece opt-in (D-06); guard $where (assertNoWhere) é o único automático/não-desligável (D-05); ambos reusam o mesmo scanner findForbiddenOperator
- [Phase ?]: aggregate/total/update/updateMany/delete/deleteMany não passam por wrapDriverError (herdado do Plano 01); testes de erro usam .rejects.toThrow() genérico em vez de instanceof MongoatDriverError
- [Phase ?]: options-passthrough-remaining.test.ts cobre só findById/bulkWrite — find/delete já cobertos desde o fix CR-01 (Fase 2)
- [Phase ?]: Thresholds de coverage (D-10) mantidos em 80/80/80/70 (ponto de partida), não elevados ao valor real observado (~94%/97%/94%/85%) — evita gate frágil
- [Phase ?]: [Phase 03-05]: Ambas as ocorrências de Error Handling no CLAUDE.md foram corrigidas (não só a primeira) — a segunda também violava D-03 (MongoError + JSON.stringify)
- [Phase ?]: [Phase 03-05]: Matriz de CI limitada a ['20.x','22.x'] (última patch de cada major), sem testar o piso exato do engines — YAGNI (Open Question 3)
- [Phase ?]: typedoc pinado em 0.28.19 (não 0.28.20, flagged too-new) — npm sobrescreveu o pin durante install conjunto, corrigido manualmente
- [Phase ?]: excludeExternals: true adicionado ao typedoc.json — necessário p/ docs:build não quebrar (JSDoc herdado do driver mongodb com sintaxe <string|buffer> quebrava o parser Vue)
- [Phase ?]: toObjectId corrigido para ser re-exportado de src/index.ts (bug de barrel — função pública sem re-export)
- [Phase 04]: Conteúdo dos guias 04-02 100% derivado de src/ e examples/ — nenhuma API inventada
- [Phase ?]: sanitize-filters.md contrasta sanitizeFilter opt-in vs guard $where incondicional reaproveitando o mesmo scanner
- [Phase ?]: handle-errors.md reproduz a tabela subclasse->.code de MIGRATION.md secao 2.1 verbatim
- [Phase ?]: escape-hatch.md documenta getCollection fail-loud vs getClient/getDb undefined pre-conexao (comportamentos reais diferentes)
- [Phase ?]: docs/migration.md é a versão publicada/consolidada; CHANGELOG.md e MIGRATION.md na raiz permanecem fonte editável (D-03) — Evita duplicação de manutenção; nota no topo da página explicita a relação
- [Phase ?]: docs.yml: deploy Pages via GitHub Actions (configure/upload/deploy-pages), separado do ci.yml, permissions minimais
- [Phase ?]: README enxuto em inglês apontando para o site (D-03); homepage no package.json → iamcalegari.github.io/mongoat

### Pending Todos

[From .planning/todos/pending/ — ideas captured during sessions]

None yet.

### Blockers/Concerns

[Issues that affect future work]

- REL-02 (build dual CJS/ESM) é entregue na Phase 1, mas o gate `are-the-types-wrong` em CI só é automatizado quando a CI existir (Phase 3) — validar localmente até lá.
- Gaps de pesquisa a decidir no planning: versão mínima de MongoDB (Phase 3), `Schema.compile()` público vs interno (Phase 5), `Object.freeze` do validator pós-setup (Phase 6).

### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 260707-mfp | Corrigir CR-01/API-01 (blocker Fase 2): options passthrough em find/findById/delete/bulkWrite | 2026-07-07 | b51c4c9 | [260707-mfp-corrigir-cr-01-api-01-blocker-fase-2-def](./quick/260707-mfp-corrigir-cr-01-api-01-blocker-fase-2-def/) |
| 260708-lt1 | Corrigir bug da logo no dark mode do site de docs + trocar paleta para os verdes do logo | 2026-07-10 | 56be2ef | [260708-lt1-corrigir-bug-da-logo-no-dark-mode-do-sit](./quick/260708-lt1-corrigir-bug-da-logo-no-dark-mode-do-sit/) |

## Deferred Items

Items acknowledged and carried forward from previous milestone close:

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| *(none)* | | | |

## Session Continuity

Last session: 2026-07-08T18:18:27.065Z
Stopped at: Phase 5 context gathered
Resume file: .planning/phases/05-estabiliza-o-de-api-e-release-v1-0/05-CONTEXT.md
