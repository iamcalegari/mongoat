---
phase: 07-sistema-de-plugins
plan: 02
subsystem: api
tags: [typescript, plugin-system, model, hooks, proxy]

# Dependency graph
requires:
  - phase: 07-01
    provides: Módulo puro src/model/plugins.ts (applyPlugins/buildPluginContext/registerPluginStatic), tipos Plugin/PluginContext, campo CreateModelProps.plugins?
provides:
  - "new Model({ plugins }) aplica plugins locais DENTRO do construtor, ANTES do wrap do Proxy (PLUG-01)"
  - "Symbols module-private kGlobalPlugins (lista global, vazia até o Plano 03) e kPluginsLocked (trava de ordem)"
  - "candidateHasPlugins: guarda de re-registro do mesmo collectionName com plugins declarado (MODEL_CONFIG_CONFLICT)"
  - "kPluginsLocked setada true na 1ª construção bem-sucedida, inclusive no early-return de reuso de config idêntica"
affects: [07-03-model-plugin-global, 07-04-docs-plugins]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Ponto de integração único de plugins no construtor: entre o loop decoratedHooks.post e o bloco if (props.hooks) — mesmo slot documentado em 07-RESEARCH.md/07-CONTEXT.md (D-06)"
    - "applyPlugins (Plano 01) envolve QUALQUER erro síncrono de setup() — inclusive um STATIC_COLLISION disparado por ctx.static() dentro do próprio setup() — em PLUGIN_SETUP_FAILED com .cause preservado"

key-files:
  created:
    - test/model/plugins-application-order.test.ts
    - test/model/plugins-fail-loud.test.ts
    - test/model/plugins-context-seal.test.ts
    - test/model/plugins-static-collision.test.ts
  modified:
    - src/model/index.ts

key-decisions:
  - "STATIC_COLLISION disparado por ctx.static() dentro de setup() chega ao chamador de new Model(...) já envolto em PLUGIN_SETUP_FAILED (comportamento de applyPlugins do Plano 01, não modificado aqui) — os testes de plugins-static-collision.test.ts verificam a colisão via topError.code === 'PLUGIN_SETUP_FAILED' + topError.cause.code === 'STATIC_COLLISION', não via topError.code === 'STATIC_COLLISION' direto como o texto literal do plano sugeria"
  - "candidateHasPlugins segue o MESMO padrão de candidateHasHooks: falha alto com MODEL_CONFIG_CONFLICT no branch if (existing), nunca tenta comparar plugins estruturalmente"
  - "kPluginsLocked = true é setada em AMBOS os caminhos de sucesso do construtor: o early-return de reuso de config idêntica e o caminho normal antes de registerModel — cobrindo o Pitfall 5 do 07-RESEARCH.md"

requirements-completed: [PLUG-01, PLUG-03]

coverage:
  - id: D1
    description: "new Model({ plugins }) aplica hook/static de plugin local ANTES do wrap do Proxy — já presentes/disponíveis na 1ª construção"
    requirement: "PLUG-01"
    verification:
      - kind: integration
        ref: "test/model/plugins-application-order.test.ts#hook de plugin local dispara em model.insert() já na 1ª construção"
        status: pass
      - kind: integration
        ref: "test/model/plugins-application-order.test.ts#ctx.static deixa model.<static> disponível imediatamente após new Model(...)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Ordem D-06: pre de plugin executa entre hooks decorados (vazios p/ schema plano) e o hook de props.hooks, antes do encadeável"
    requirement: "PLUG-01"
    verification:
      - kind: integration
        ref: "test/model/plugins-application-order.test.ts#ordem D-06: pre de plugin executa ANTES do hook declarado em props.hooks, e AMBOS antes do encadeável (.pre())"
        status: pass
    human_judgment: false
  - id: D3
    description: "setup() que lança aborta new Model(...) com PLUGIN_SETUP_FAILED, .cause preservado, e o model nunca é registrado (fail-loud, D-10)"
    requirement: "PLUG-01"
    verification:
      - kind: integration
        ref: "test/model/plugins-fail-loud.test.ts#setup() que lança aborta new Model(...) com PLUGIN_SETUP_FAILED, .cause preservado, e o model nunca é registrado"
        status: pass
    human_judgment: false
  - id: D4
    description: "candidateHasPlugins: re-registro do mesmo collectionName declarando plugins nunca é descartado em silêncio, falha com MODEL_CONFIG_CONFLICT"
    requirement: "PLUG-01"
    verification:
      - kind: unit
        ref: "npx tsc --noEmit (grep de candidateHasPlugins em src/model/index.ts) — cobertura de teste explícita fica para o Plano 03 quando Model.plugin() existir para exercitar re-registro com plugins"
        status: pass
    human_judgment: true
    rationale: "O guard candidateHasPlugins existe e compila, mas nenhum teste dedicado de re-registro-com-plugins foi escrito neste plano (não estava nos 4 arquivos de teste do escopo da Task 1/2) — sinalizado para confirmação humana/Plano 03."
  - id: D5
    description: "ctx.schema/ctx.allowedMethods são cópias — mutá-las dentro de setup() nunca altera model.validator/model.allowedMethods reais (PLUG-03/D-03)"
    requirement: "PLUG-03"
    verification:
      - kind: integration
        ref: "test/model/plugins-context-seal.test.ts#mutar ctx.schema dentro de setup() nunca altera model.validator.$jsonSchema"
        status: pass
      - kind: integration
        ref: "test/model/plugins-context-seal.test.ts#reatribuir/mutar ctx.allowedMethods dentro de setup() nunca altera model.allowedMethods (cópia congelada)"
        status: pass
      - kind: integration
        ref: "test/model/plugins-context-seal.test.ts#ctx.pre/ctx.post/ctx.static são os únicos canais de efeito — nenhuma propriedade de ctx expõe a referência viva de validator/hooks/allowedMethods do model"
        status: pass
    human_judgment: false
  - id: D6
    description: "Static de plugin colidindo com método nativo (find, getCollection, rawInsert) ou com static já registrado por outro plugin lança na construção (D-08)"
    requirement: "PLUG-03"
    verification:
      - kind: integration
        ref: "test/model/plugins-static-collision.test.ts (4 casos: find, getCollection, rawInsert, plugin↔plugin)"
        status: pass
    human_judgment: false

duration: 15min
completed: 2026-07-15
status: complete
---

# Phase 07 Plan 02: Conectar plugins locais ao construtor do Model Summary

**`new Model({ plugins })` aplica plugins locais no construtor, DENTRO do slot determinístico entre hooks decorados e `props.hooks` (D-06) — fail-loud com `PLUGIN_SETUP_FAILED`, selo read-only do `PluginContext` e colisão de statics contra o `Model.prototype` completo, tudo provado via 4 novos arquivos de teste (13 casos) contra `new Model(...)` real.**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-07-15T12:35:00Z (aprox.)
- **Completed:** 2026-07-15T12:50:00Z
- **Tasks:** 2 (Task 1 auto+tdd, Task 2 auto)
- **Files modified:** 5 (1 modificado, 4 novos)

## Accomplishments
- `src/model/index.ts`: `applyPlugins(this, Model[kGlobalPlugins], props.plugins ?? [])` inserido no slot ÚNICO entre o loop `decoratedHooks.post` e `if (props.hooks)` — plugins locais aplicados antes do wrap do Proxy, na 1ª construção.
- Symbols module-private `kGlobalPlugins` (lista global — vazia neste plano, a API que escreve nela é o Plano 03) e `kPluginsLocked` (trava de ordem, Pitfall 5) declarados como campos estáticos de `Model`.
- `candidateHasPlugins` adicionado ao lado de `candidateHasHooks`: re-registro do mesmo `collectionName` declarando `plugins` falha alto com `MODEL_CONFIG_CONFLICT`, nunca descarta em silêncio (Pitfall 4).
- `Model[kPluginsLocked] = true` setada em AMBOS os caminhos de sucesso — o early-return de reuso de config idêntica E o retorno normal (antes de `registerModel`) — cobrindo o Pitfall 5.
- 4 arquivos de teste novos (13 casos, todos contra `new Model(...)` real, sem mudança de código de produção na Task 2): `plugins-application-order.test.ts` (PLUG-01, 3 casos), `plugins-fail-loud.test.ts` (D-10, 1 caso), `plugins-context-seal.test.ts` (PLUG-03/D-03, 3 casos), `plugins-static-collision.test.ts` (D-08, 4 casos).

## Task Commits

Each task was committed atomically:

1. **Task 1: Aplicar plugins locais no construtor + trava/guarda + testes de ordem e fail-loud** - `fba4f78` (feat)
2. **Task 2: Testes do selo do contexto (PLUG-03/D-03) e colisão de statics (D-08) via construtor** - `6684b2d` (test)

**Plan metadata:** (commit a seguir) `docs: complete plan`

## Files Created/Modified
- `src/model/index.ts` - `applyPlugins` no slot D-06, `kGlobalPlugins`/`kPluginsLocked`, `candidateHasPlugins`, trava de ordem
- `test/model/plugins-application-order.test.ts` - PLUG-01 (aplicação antes do wrap + ordem D-06) (novo)
- `test/model/plugins-fail-loud.test.ts` - PLUG-01/D-10 (abort + não-registro) (novo)
- `test/model/plugins-context-seal.test.ts` - PLUG-03/D-03 (selo read-only) (novo)
- `test/model/plugins-static-collision.test.ts` - D-08 (colisão contra nativo/privado + plugin↔plugin) (novo)

## Decisions Made
- `applyPlugins` (código do Plano 01, não tocado aqui) envolve QUALQUER erro síncrono de `setup()` — inclusive um `STATIC_COLLISION` disparado por `ctx.static()` chamado DENTRO do próprio `setup()` — em `PLUGIN_SETUP_FAILED` com `.cause` preservado. Descoberto ao escrever `plugins-static-collision.test.ts`: o texto literal do plano pedia `expect(...).toBe('STATIC_COLLISION')` no topo, mas o comportamento real e já verificado do Plano 01 é `topError.code === 'PLUGIN_SETUP_FAILED'` com `topError.cause.code === 'STATIC_COLLISION'`. Os testes verificam a colisão via `.cause.code`, preservando o fail-loud contract do Plano 01 intacto (ver "Deviations" abaixo).
- `candidateHasPlugins`/trava de ordem seguem o MESMO idioma de `candidateHasHooks`/o branch `if (existing)` já existente — nenhuma estrutura nova introduzida.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug de expectativa de teste] `plugins-static-collision.test.ts` verifica STATIC_COLLISION via `.cause.code`, não via `.code` do topo**
- **Found during:** Task 2 (escrita de `plugins-static-collision.test.ts`)
- **Issue:** O texto do plano instruía `expect(() => new Model(...)).toThrow(MongoatValidationError)` e checar `.code === 'STATIC_COLLISION'` diretamente no erro capturado. Como `ctx.static()` só é chamável DENTRO do `setup()` de um plugin, e `applyPlugins` (Plano 01, já verificado/completo) envolve QUALQUER erro síncrono lançado dentro de `setup()` em `MongoatValidationError({ code: 'PLUGIN_SETUP_FAILED', cause: err })`, o `.code` observável em `new Model(...)` é sempre `PLUGIN_SETUP_FAILED` — nunca `STATIC_COLLISION` diretamente. Um teste escrito ao pé da letra do plano falharia contra o comportamento real e já testado do módulo `src/model/plugins.ts`.
- **Fix:** Os 4 casos de `plugins-static-collision.test.ts` verificam `topError.code === 'PLUGIN_SETUP_FAILED'` E `(topError.cause as MongoatValidationError).code === 'STATIC_COLLISION'` — a colisão real é confirmada via `.cause`, sem modificar `applyPlugins` (fora de escopo desta task, que é 100%-testes: "Sem mudança de código de produção").
- **Files modified:** `test/model/plugins-static-collision.test.ts` (nenhum arquivo de produção)
- **Verification:** `npx vitest run test/model/plugins-static-collision.test.ts` — 4/4 passam
- **Committed in:** `6684b2d` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 bug de expectativa de teste)
**Impact on plan:** Nenhuma mudança de código de produção; a asserção corrigida reflete com precisão o fail-loud contract já shipado/testado pelo Plano 01 (`applyPlugins`). Sem regressão em nenhum teste existente (200/200 passam).

## Issues Encountered
None além do documentado em Deviations acima.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- `Model[kGlobalPlugins]`/`Model[kPluginsLocked]` já existem como campos estáticos, prontos para o Plano 03 escrever `Model.plugin()` (que escreve em `kGlobalPlugins` e consulta `kPluginsLocked` para recusar registro tardio com `PLUGIN_REGISTERED_TOO_LATE`).
- `D4` (coverage acima) fica marcado `human_judgment: true` — nenhum teste dedicado de re-registro-com-`plugins` foi escrito neste plano (fora do escopo dos 4 arquivos listados); o Plano 03 deve confirmar/cobrir esse caminho quando `Model.plugin()` existir para popular plugins globais de fato.
- Nenhum bloqueio conhecido para o Plano 03.

---
*Phase: 07-sistema-de-plugins*
*Completed: 2026-07-15*
