---
phase: 07-sistema-de-plugins
plan: 01
subsystem: api
tags: [typescript, plugin-system, model, hooks, structuredClone]

# Dependency graph
requires:
  - phase: 06-decorators-tc39
    provides: HookRegistry/hooks pipeline, Model construtor ordem determinística (candidateHasHooks)
provides:
  - "Tipos públicos Plugin<ModelType>/PluginObject/PluginSetup/PluginContext, re-exportados do barrel"
  - "Campo CreateModelProps.plugins?"
  - "Módulo puro src/model/plugins.ts: normalizePlugin, resolvePluginList, RESERVED_NAMES, registerPluginStatic, buildPluginContext, applyPlugins"
  - "3 novos codes de MongoatValidationError: DUPLICATE_PLUGIN_NAME, STATIC_COLLISION, PLUGIN_SETUP_FAILED"
affects: [07-02-construtor-model, 07-03-model-plugin-global, 07-04-docs-plugins]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "PluginTarget: tipo estrutural que descreve os membros do Model que um plugin lê/muta, sem importar a classe Model — evita ciclo de módulos (Plano 02 conecta this)"
    - "Dedup de plugin por referência ORIGINAL (Map<Plugin, PluginObject>), não pelo objeto normalizado recém-criado"
    - "Selo read-only via structuredClone (nunca Object.freeze da referência viva) para estruturas aninhadas — mesmo idioma de schemaValidatorBuilder"

key-files:
  created:
    - src/types/plugin.ts
    - src/model/plugins.ts
    - test/model/plugins-resolve.test.ts
  modified:
    - src/types/model.ts
    - src/types/index.ts
    - src/index.ts
    - src/errors/index.ts

key-decisions:
  - "resolvePluginList usa '<anonymous>' como fallback de nome também para objetos { setup } sem name explícito (não só para funções) — evita comparação com undefined como chave de dedup"
  - "registerPluginStatic recebe um owners: Map<string,string> compartilhado por chamada de applyPlugins (não um Map module-level estático) — evita estado global vazando entre models distintos"
  - "RESERVED_NAMES enumera nomes reais do Model.prototype hoje (incl. privados de runtime como rawInsert/executeHooked), não só Object.values(METHODS)"

requirements-completed: [PLUG-01, PLUG-03]

coverage:
  - id: D1
    description: "Tipo Plugin<ModelType>/PluginContext<ModelType> exportado do barrel público e compilando"
    requirement: "PLUG-01"
    verification:
      - kind: unit
        ref: "npx tsc --noEmit (grep de export type Plugin/PluginContext no barrel)"
        status: pass
    human_judgment: false
  - id: D2
    description: "CreateModelProps aceita plugins?: Plugin<ModelType>[]"
    requirement: "PLUG-01"
    verification:
      - kind: unit
        ref: "npx tsc --noEmit"
        status: pass
    human_judgment: false
  - id: D3
    description: "normalizePlugin normaliza função OU objeto { name, setup } (D-01)"
    requirement: "PLUG-01"
    verification:
      - kind: unit
        ref: "test/model/plugins-resolve.test.ts#normalizePlugin (D-01)"
        status: pass
    human_judgment: false
  - id: D4
    description: "resolvePluginList dedup por referência + DUPLICATE_PLUGIN_NAME para nomes iguais/refs diferentes (D-07)"
    requirement: "PLUG-03"
    verification:
      - kind: unit
        ref: "test/model/plugins-resolve.test.ts#resolvePluginList (D-07)"
        status: pass
    human_judgment: false
  - id: D5
    description: "registerPluginStatic lança STATIC_COLLISION contra o conjunto COMPLETO de nomes reservados (incl. privados como rawInsert) e contra dono diferente (D-08)"
    requirement: "PLUG-03"
    verification:
      - kind: unit
        ref: "test/model/plugins-resolve.test.ts#registerPluginStatic (D-08)"
        status: pass
    human_judgment: false
  - id: D6
    description: "buildPluginContext expõe schema via structuredClone e allowedMethods congelado — mutar a cópia nunca alcança a referência viva (D-03)"
    requirement: "PLUG-03"
    verification:
      - kind: unit
        ref: "test/model/plugins-resolve.test.ts#buildPluginContext (D-03)"
        status: pass
    human_judgment: false
  - id: D7
    description: "applyPlugins roda cada setup() sincronamente em try/catch, envolve falha em PLUGIN_SETUP_FAILED com .cause preservado, aborta os seguintes (D-04/D-10)"
    requirement: "PLUG-01"
    verification:
      - kind: unit
        ref: "test/model/plugins-resolve.test.ts#applyPlugins (D-04/D-10)"
        status: pass
    human_judgment: false

duration: 5min
completed: 2026-07-15
status: complete
---

# Phase 07 Plan 01: Fundação de tipos + módulo puro de plugins Summary

**Tipos públicos `Plugin`/`PluginContext` + módulo `src/model/plugins.ts` com dedup por referência, colisão de statics contra o `Model.prototype` completo, selo read-only via `structuredClone` e `applyPlugins` fail-loud — tudo verificado por 21 testes unitários sem `Database`/`Model` real.**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-07-15T12:16:00Z (aprox.)
- **Completed:** 2026-07-15T12:24:00Z
- **Tasks:** 2 (Task 1 auto, Task 2 auto+tdd)
- **Files modified:** 8 (5 modificados, 3 novos)

## Accomplishments
- `src/types/plugin.ts` (novo): `Plugin<ModelType>`, `PluginObject<ModelType>`, `PluginSetup<ModelType>`, `PluginContext<ModelType>` — compostos sobre `HookFn`/`HookContextMap`/`METHODS` já existentes, sem tipo novo de hook.
- `CreateModelProps.plugins?: Plugin<ModelType>[]` — analog exato do campo `hooks?` existente, mesmo estilo de JSDoc.
- Re-export público de `Plugin`/`PluginObject`/`PluginSetup`/`PluginContext` em `src/types/index.ts` e `src/index.ts`.
- JSDoc `@public` de `MongoatValidationError` atualizado com os 4 novos codes em prosa (`DUPLICATE_PLUGIN_NAME`, `STATIC_COLLISION`, `PLUGIN_SETUP_FAILED`, `PLUGIN_REGISTERED_TOO_LATE`) — zero código executável novo.
- `src/model/plugins.ts` (novo): módulo 100% puro (sem `Database`, sem `Model`, sem I/O) com `normalizePlugin`, `resolvePluginList`, `RESERVED_NAMES`, `registerPluginStatic`, `buildPluginContext`, `applyPlugins` — opera sobre um `PluginTarget` estrutural para não criar ciclo de import.
- `test/model/plugins-resolve.test.ts` (novo): 21 testes cobrindo cada bullet do bloco `<behavior>` do plano (normalização, dedup por referência, colisão de nome, colisão de static contra nativos públicos E privados de runtime, colisão static↔static, selo read-only, ordem global→local, fail-loud com `.cause` e abort).

## Task Commits

Each task was committed atomically:

1. **Task 1: Tipos de plugin + campo `plugins?` + exports + JSDoc de erros** - `6d645df` (feat)
2. **Task 2 (RED): teste falhando do módulo puro de plugins** - `626e1f4` (test)
2. **Task 2 (GREEN): implementação do módulo puro `src/model/plugins.ts`** - `0a86bdb` (feat)

**Plan metadata:** (commit a seguir) `docs: complete plan`

_Task 2 é `tdd="true"` — RED (`test(...)`) → GREEN (`feat(...)`); nenhum REFACTOR foi necessário (implementação já ficou limpa na primeira passada)._

## Files Created/Modified
- `src/types/plugin.ts` - Tipos públicos `Plugin`/`PluginObject`/`PluginSetup`/`PluginContext` (novo)
- `src/types/model.ts` - Campo `plugins?: Plugin<ModelType>[]` em `CreateModelProps`
- `src/types/index.ts` - Re-export de tipos de plugin
- `src/index.ts` - Re-export de tipos de plugin no barrel raiz
- `src/errors/index.ts` - JSDoc de `MongoatValidationError` menciona os 4 novos codes (zero código novo)
- `src/model/plugins.ts` - Módulo puro: `normalizePlugin`, `resolvePluginList`, `RESERVED_NAMES`, `registerPluginStatic`, `buildPluginContext`, `applyPlugins` (novo)
- `test/model/plugins-resolve.test.ts` - 21 testes unitários da mecânica pura (novo)

## Decisions Made
- `resolvePluginList`/`applyPlugins` usam `normalized.name ?? '<anonymous>'` como chave de dedup por nome mesmo quando o plugin é um objeto `{ setup }` sem `name` explícito (o `RESEARCH.md` só cobria o fallback para a forma-função) — evita uma chave `undefined` ambígua no `Map` de nomes; documentado aqui pois não estava explícito no plano.
- `registerPluginStatic` recebe um `owners: Map<string, string>` como parâmetro (criado por chamada de `applyPlugins`), não um `Map` module-level estático como o pseudo-código do `07-RESEARCH.md` sugeria — evita colisões de static vazarem entre `Model`s distintos construídos em momentos diferentes; o plano já especificava essa assinatura de 5 parâmetros (`target, name, fn, pluginName, owners`), então esta é a implementação literal do `<behavior>`, não um desvio.
- `PluginTarget` (tipo estrutural interno, não exportado do barrel público) inclui uma index signature `[key: string]: unknown` para permitir a atribuição dinâmica de statics sem importar `Model` — cumpre a restrição do plano de módulo sem ciclo.

## Deviations from Plan

None - plano executado exatamente como escrito. As duas decisões acima são preenchimento de "Claude's Discretion" já previsto no `07-RESEARCH.md`/`07-CONTEXT.md`, não desvios de comportamento especificado.

## Issues Encountered
- Cast de teste (`Object.fromEntries(...) as PluginTarget['hooks']`) falhou no `tsc` por os dois shapes não terem overlap suficiente (`HookRegistry<Document>` tem chaves fixas do enum `METHODS`, o `Object.fromEntries` produz um `{ [k: string]: ... }` genérico) — corrigido com `as unknown as PluginTarget['hooks']` no arquivo de teste. Não afeta o módulo de produção, só a construção do fixture de teste.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- `applyPlugins`/`buildPluginContext` estão prontos para o Plano 02 conectar um único ponto no construtor do `Model` (entre `decoratedHooks.post` e `if (props.hooks)`, conforme `07-RESEARCH.md` §"Nota de ordem crítica").
- `Model.plugin()` (lista global + flag de trava PLUG-02, Symbols `kGlobalPlugins`/`kPluginsLocked`/`kResetPlugins`) permanece como trabalho do Plano 02/03 — nada disso foi tocado neste plano (por design, D-13/isolamento do módulo puro).
- Nenhum bloqueio conhecido para o Plano 02.

---
*Phase: 07-sistema-de-plugins*
*Completed: 2026-07-15*

## Self-Check: PASSED

All created files exist on disk; all task/summary commit hashes (`6d645df`, `626e1f4`, `0a86bdb`, `39d8019`) found in `git log`.
