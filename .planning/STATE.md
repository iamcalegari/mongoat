---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: "**Goal**: A API do alpha é auditada e estabilizada deliberadamente, e então publicada como 1.1.0 com semver disciplinado e um pipeline de release automatizado."
current_phase: 07
current_phase_name: sistema-de-plugins
status: verifying
stopped_at: Plano 07-04 completo (2/2 tasks) -- Fase 07 (4/4 planos) pronta para verificacao
last_updated: "2026-07-15T13:06:38.075Z"
last_activity: 2026-07-15
last_activity_desc: Phase 07 execution started
progress:
  total_phases: 8
  completed_phases: 7
  total_plans: 33
  completed_plans: 33
  percent: 88
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-07-03)

**Core value:** Ser um ODM fino e extensível — produtividade de ODM sem abrir mão do controle e do acesso direto ao driver nativo do MongoDB.
**Current focus:** Phase 07 — sistema-de-plugins

## Current Position

Phase: 07 (sistema-de-plugins) — EXECUTING
Plan: 4 of 4
Status: Phase complete — ready for verification
Last activity: 2026-07-15 — Phase 07 execution started

Progress: [░░░░░░░░░░] 0%

## Performance Metrics

**Velocity:**

- Total plans completed: 26
- Average duration: — min
- Total execution time: 0.0 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01 | 5 | - | - |
| 3 | 5 | - | - |
| 4 | 6 | - | - |
| 05 | 5 | - | - |
| 06 | 5 | - | - |

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
| Phase 05 P01 | 20min | 2 tasks | 8 files |
| Phase 05 P04 | 5min | 2 tasks | 3 files |
| Phase 06 P01 | 17min | 3 tasks | 18 files |
| Phase 06 P02 | 15min | 3 tasks | 6 files |
| Phase 06 P03 | 5min | 3 tasks | 8 files |
| Phase 06 P04 | 6min | 3 tasks | 10 files |
| Phase 06 P05 | 11min | 3 tasks | 4 files |
| Phase 07 P01 | 5min | 2 tasks | 8 files |
| Phase 07 P02 | 15min | 2 tasks | 5 files |
| Phase 07 P03 | 10min | 2 tasks | 5 files |
| Phase 07 P04 | 20min | 2 tasks | 4 files |

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
- [Phase ?]: Database.defineModel/Model.create removidos por completo (D-06); new Model(...) e a unica via de registro/gating
- [Phase ?]: CHANGELOG [Unreleased] renomeado para [1.1.0] - 2026-07-10; versao-alvo v1.0.0 reconciliada para 1.1.0 em CHANGELOG/MIGRATION/docs/ROADMAP (secao Fase 5)
- [Phase ?]: Task 1 (pre exit + version) ja havia sido executada fora do tracking GSD pelo commit 2d8f5d2 - tratada como concluida, apenas verificada, sem novo commit
- [Phase 06-01]: Vite 8 (rolldown-vite) transforma com Oxc, que nao lowera decorators stage-3 — vitest.config.ts registra o MESMO plugin babel do build de producao filtrado a (src|test)/schema/**
- [Phase 06-01]: arquivos decorados que passam pela cadeia babel->oxc usam ?: (nunca !:) — babel re-emite o ! junto do inicializador injetado e o Oxc rejeita no re-parse
- [Phase 06-01]: SCHEMA_METADATA_KEY+compile vivem em compile.ts e FieldMeta/SchemaClass em src/types/schema.ts — import unidirecional decorators->compile, sem ciclo de modulos
- [Phase ?]: [Phase 06-02]: Hidratação de defaults por-insert (D-12) escopada só no nível raiz — classes decoradas aninhadas não são instanciadas recursivamente para colher inicializadores; nested defaults seguem via documentDefaults do config
- [Phase ?]: [Phase 06-02]: candidateHasHooks deixado extensível — hoje só examina props.hooks, preparado para o Plano 06-04 também marcar true quando a classe decorada declarar @Pre/@Post
- [Phase ?]: [Phase 06-02]: WR-04 fechado com uma flag categórica (candidateHasHooks) em vez de tentar comparar hooks estruturalmente — funções não são comparáveis via stableStringify
- [Phase ?]: [Phase 06-03]: Prop() mudou de replace para merge em meta.properties[campo] — pré-requisito estrutural para composição de múltiplos açúcares no mesmo campo (D-02)
- [Phase ?]: [Phase 06-03]: @Optional() registra em meta.optionalFields (não remove de required no momento em que roda) — filtragem só no Schema.compile, idempotente independente da ordem textual do decorator no campo (D-04)
- [Phase ?]: [Phase 06-03]: detecção de classe decorada aninhada em type/items via typeof value === 'function' (sem kMongoatSchemaClass) — evita ciclo de import decorators<->compile
- [Phase ?]: [Phase 06-03]: JSONSchema4Subset (src/types/model.ts) estendido com minimum/maximum/minLength/maxLength — fora do files_modified original do plano, necessário para os açúcares de constraint tiparem corretamente (Rule 2)
- [Phase 06-04]: Pre/Post reaproveitam (...args: unknown[]) => unknown (mesmo shape de FieldMeta desde 06-01) em vez de overloads por posição — evita contravariância estrita do TS no call-site do decorator; dev tipa/faz cast dentro do corpo da função
- [Phase 06-04]: @Post em campo lança com o code default VALIDATION_FAILED (não um code dedicado) — plano só exige documentar INVALID_HOOK_METHOD, code extra seria escopo além do pedido
- [Phase 06-04]: extractDecoratorHooks nunca lança para classe sem metadata Mongoat (devolve {pre:[],post:[]}) — Model chama incondicionalmente para qualquer schema função, sem checar de antemão
- [Phase ?]: resolvePluginList/applyPlugins usam '<anonymous>' como fallback de nome tambem para objetos { setup } sem name explicito
- [Phase ?]: registerPluginStatic recebe owners: Map<string,string> por chamada de applyPlugins (nao module-level estatico) - evita colisoes vazando entre models
- [Phase 07]: [Phase 07-02]: applyPlugins (Plano 01) envolve QUALQUER erro de setup() -- inclusive STATIC_COLLISION disparado por ctx.static() -- em PLUGIN_SETUP_FAILED com .cause preservado; testes de colisao verificam via .cause.code
- [Phase 07]: [Phase 07-02]: candidateHasPlugins/kPluginsLocked seguem o mesmo idioma de candidateHasHooks -- plugins declarados em re-registro do mesmo collectionName falham alto (MODEL_CONFIG_CONFLICT), trava de ordem setada na 1a construcao bem-sucedida inclusive no early-return de reuso
- [Phase 07]: Model.plugin()/kResetPlugins() completam PLUG-02 (07-03); registro global fail-loud + reset de teste; ordem determinística e dedup global+local provados de ponta a ponta
- [Phase 07]: test/model/plugins-order.test.ts usa schema PLANO (nao decorado) em vez de @Pre de campo/classe -- babel do vitest so transforma decorators sob (src|test)/schema/**, e o artifact precisa viver em test/model/
- [Phase 07]: D-12 provado por integracao (testcontainers): static de plugin registrado via ctx.static herda o bind automatico do Proxy trap (value.bind(target)), sem nenhum .bind manual em registerPluginStatic
- [Phase 07]: D-09b confirmado na pratica: module augmentation (declare module '@/model') tipa .paginate() sem cast/any no call-site; inferencia-plena via new Model({ plugins }) documentada como inviavel (TS1093 + tipo de instancia fixo)

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

Last session: 2026-07-15T13:06:37.869Z
Stopped at: Plano 07-04 completo (2/2 tasks) -- Fase 07 (4/4 planos) pronta para verificacao
Resume file: 
