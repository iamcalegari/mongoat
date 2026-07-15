---
phase: 07-sistema-de-plugins
plan: 03
subsystem: api
tags: [typescript, plugin-system, model, hooks, global-registry]

# Dependency graph
requires:
  - phase: 07-02
    provides: "Symbols module-private kGlobalPlugins/kPluginsLocked, applyPlugins conectado no construtor no slot D-06, kPluginsLocked setada true na 1ª construção bem-sucedida (inclusive early-return de reuso de config idêntica)"
provides:
  - "Model.plugin(g) — registro global de plugins, aplicados ANTES dos plugins[] locais (D-05)"
  - "Enforcement de ordem fail-loud: Model.plugin() chamado após a 1ª construção bem-sucedida lança MongoatValidationError code PLUGIN_REGISTERED_TOO_LATE (PLUG-02)"
  - "Model[kResetPlugins]() — reset interno (esvazia kGlobalPlugins + destrava kPluginsLocked), Symbol exportado do módulo @/model fora do barrel público (D-11)"
  - "Ordem determinística completa provada de ponta a ponta: global → local → props.hooks → encadeável"
  - "Dedup por referência global+local provado de ponta a ponta (D-07), agora que Model.plugin() existe para popular a lista global de fato"
affects: [07-04-docs-plugins]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Model.plugin() guarda Model[kPluginsLocked] (setada pelo construtor no Plano 02) — enforcement de ordem sem nenhum estado novo além do Symbol de reset"
    - "kResetPlugins segue o MESMO idioma de Database.resetRegistry(): JSDoc @internal, 'não faz parte da API pública', uso documentado em beforeEach/afterEach de teste"

key-files:
  created:
    - test/model/plugins-global-lock.test.ts
    - test/model/plugins-reset.test.ts
    - test/model/plugins-order.test.ts
    - test/model/plugins-dedup.test.ts
  modified:
    - src/model/index.ts

key-decisions:
  - "test/model/plugins-order.test.ts usa um schema PLANO (não decorado) em vez de exercitar @Pre de campo/classe (Fase 6) — o plugin babel do vitest.config.ts só transforma decorators sob (src|test)/schema/**, e o arquivo precisa viver em test/model/ (path exato do artifact do plano); a ordem @Pre campo→@Pre classe já está coberta contra Mongo real por test/schema/hooks-decorator-order.test.ts (Plano 06-04). Este arquivo prova o elo restante da cadeia completa: global → local → props.hooks → encadeável, que é o mínimo exigido pelos acceptance_criteria do plano."
  - "plugins-global-lock.test.ts e plugins-dedup.test.ts precisaram de beforeEach/afterEach chamando Model[kResetPlugins]() entre casos — sem isso, o primeiro new Model(...) de um teste travaria (kPluginsLocked) o registro global do teste seguinte na MESMA suíte, mascarando o cenário sob teste com um PLUGIN_REGISTERED_TOO_LATE falso."

requirements-completed: [PLUG-02]

coverage:
  - id: D1
    description: "Model.plugin(g) registra um plugin global antes de qualquer new Model(...), sem lançar"
    requirement: "PLUG-02"
    verification:
      - kind: integration
        ref: "test/model/plugins-global-lock.test.ts#Model.plugin() chamado ANTES de qualquer new Model(...) registra o global sem lançar"
        status: pass
    human_judgment: false
  - id: D2
    description: "Model.plugin() chamado DEPOIS da 1ª construção bem-sucedida (inclusive reuso de config idêntica, Pitfall 5) lança PLUGIN_REGISTERED_TOO_LATE"
    requirement: "PLUG-02"
    verification:
      - kind: integration
        ref: "test/model/plugins-global-lock.test.ts#Model.plugin() chamado DEPOIS da 1ª construção bem-sucedida lança PLUGIN_REGISTERED_TOO_LATE"
        status: pass
      - kind: integration
        ref: "test/model/plugins-global-lock.test.ts#Model.plugin() chamado após reuso de config idêntica (early-return) TAMBÉM lança PLUGIN_REGISTERED_TOO_LATE"
        status: pass
    human_judgment: false
  - id: D3
    description: "Model[kResetPlugins]() limpa a lista global e destrava o flag, permitindo Model.plugin() de novo (D-11)"
    verification:
      - kind: integration
        ref: "test/model/plugins-reset.test.ts#após Model[kResetPlugins](), Model.plugin() volta a funcionar mesmo depois de uma trava anterior"
        status: pass
      - kind: integration
        ref: "test/model/plugins-reset.test.ts#Model[kResetPlugins]() esvazia a lista global — um plugin registrado antes do reset não é mais aplicado depois"
        status: pass
    human_judgment: false
  - id: D4
    description: "Ordem determinística completa: PLUGINS(global→local) → props.hooks → .pre()/.post() encadeado"
    requirement: "PLUG-02"
    verification:
      - kind: integration
        ref: "test/model/plugins-order.test.ts#ordem no insert é global → local → config (props.hooks) → encadeado"
        status: pass
    human_judgment: false
  - id: D5
    description: "Mesmo plugin (mesma referência) registrado global E local aplica 1x; nomes iguais com refs diferentes lançam DUPLICATE_PLUGIN_NAME"
    requirement: "PLUG-02"
    verification:
      - kind: integration
        ref: "test/model/plugins-dedup.test.ts#a MESMA referência registrada global (Model.plugin()) E local (plugins[]) roda setup() 1x"
        status: pass
      - kind: integration
        ref: "test/model/plugins-dedup.test.ts#dois plugins (um global, um local) com o mesmo name mas referências diferentes lança DUPLICATE_PLUGIN_NAME"
        status: pass
    human_judgment: false

duration: 10min
completed: 2026-07-15
status: complete
---

# Phase 07 Plan 03: Registro global de plugins + enforcement de ordem Summary

**`Model.plugin()` registra plugins GLOBAIS aplicados antes dos locais, recusa registro tardio com `PLUGIN_REGISTERED_TOO_LATE` (fail-loud, cobrindo o Pitfall 5 do reuso de config idêntica), e `Model[kResetPlugins]()` isola esse estado estático entre suítes de teste — com a ordem determinística completa e o dedup global+local por referência provados contra `new Model(...)` real.**

## Performance

- **Duration:** ~10 min
- **Started:** 2026-07-15T09:44:32-03:00 (aprox., logo após 07-02)
- **Completed:** 2026-07-15T09:54:36-03:00
- **Tasks:** 2 (Task 1 auto+tdd, Task 2 auto)
- **Files modified:** 5 (1 modificado, 4 novos)

## Accomplishments
- `src/model/index.ts`: `static plugin(plugin)` — se `Model[kPluginsLocked]` for `true`, lança `MongoatValidationError` code `PLUGIN_REGISTERED_TOO_LATE`; caso contrário, empurra a referência ORIGINAL para `Model[kGlobalPlugins]` (preservando o dedup por referência de `resolvePluginList`).
- `static [kResetPlugins]()` — esvazia a lista global e destrava o flag; Symbol `kResetPlugins` exportado do MÓDULO `@/model` (named export), ausente do barrel público `src/index.ts`.
- JSDoc das duas fields estáticas (`kGlobalPlugins`/`kPluginsLocked`), escritas no Plano 02 referenciando "Plano 03" como trabalho futuro, atualizado para refletir que `Model.plugin()`/`Model[kResetPlugins]()` já existem.
- 4 arquivos de teste novos, todos contra `new Model(...)`/`Model.plugin()` reais:
  - `plugins-global-lock.test.ts` (PLUG-02, 3 casos: registro antes de construir, registro tardio após 1ª construção, registro tardio após reuso de config idêntica/Pitfall 5)
  - `plugins-reset.test.ts` (D-11, 2 casos: destrava após lock, esvazia a lista global de fato afetando o próximo model construído)
  - `plugins-order.test.ts` (D-05/D-06, 1 caso: ordem completa global→local→config→encadeável)
  - `plugins-dedup.test.ts` (D-07, 2 casos: mesma referência global+local roda 1x, nomes iguais/refs diferentes lançam `DUPLICATE_PLUGIN_NAME`)

## Task Commits

Each task was committed atomically:

1. **Task 1: `Model.plugin()` global + enforcement de ordem + `Model[kResetPlugins]()`** - `c283a59` (feat)
2. **Task 2: Ordem determinística completa (D-05/D-06) + dedup global+local (D-07)** - `c46a475` (test)

**Plan metadata:** (commit a seguir) `docs: complete plan`

## Files Created/Modified
- `src/model/index.ts` - `static plugin()`, `static [kResetPlugins]()`, export do Symbol `kResetPlugins`, JSDoc de `kGlobalPlugins`/`kPluginsLocked` atualizado
- `test/model/plugins-global-lock.test.ts` - PLUG-02 (enforcement de ordem, incl. Pitfall 5) (novo)
- `test/model/plugins-reset.test.ts` - D-11 (reset de estado global) (novo)
- `test/model/plugins-order.test.ts` - D-05/D-06 (ordem completa) (novo)
- `test/model/plugins-dedup.test.ts` - D-07 (dedup global+local + colisão de nome) (novo)

## Decisions Made
- `test/model/plugins-order.test.ts` prova a ordem com um schema PLANO (sem `@Pre` de campo/classe) — ver "Deviations" abaixo para o porquê.
- `plugins-global-lock.test.ts`/`plugins-dedup.test.ts` isolam estado global entre `it()`s da mesma suíte via `Model[kResetPlugins]()` em `beforeEach`, já que múltiplas chamadas a `Model.plugin()` no mesmo arquivo de teste (módulo não recarregado entre `it()`s pelo Vitest) exigem reset explícito.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Ajuste de execução] `plugins-order.test.ts` não usa `@Pre` de campo/classe como o texto do plano sugeria ("se conveniente")**
- **Found during:** Task 2 (escrita de `plugins-order.test.ts`)
- **Issue:** O texto do plano propunha opcionalmente incluir "um `@Pre` de classe se conveniente" na cadeia de ordem. Uma primeira tentativa usando uma classe decorada (`@Schema`/`@Prop`/`@Pre`) falhou com `SyntaxError: Invalid or unexpected token` — o plugin babel do `vitest.config.ts` que faz lowering de decorators stage-3 só é aplicado a arquivos sob `(src|test)/schema/**` (`include: /(?:src|test)[\\/]schema[\\/].*\.ts$/`), e o artifact deste plano precisa viver em `test/model/plugins-order.test.ts` (path exato listado em `must_haves.artifacts`).
- **Fix:** Reescrito com um schema PLANO (`ModelValidationSchema` sem decorators), provando o elo `global → local → props.hooks → encadeável` — exatamente o mínimo exigido pelo `acceptance_criteria` ("No mínimo provar `global < local < props.hooks < encadeado`"). O elo `@Pre campo → @Pre classe` já está coberto contra MongoDB real por `test/schema/hooks-decorator-order.test.ts` (Plano 06-04), citado no comentário de topo do novo arquivo.
- **Files modified:** `test/model/plugins-order.test.ts` (nenhum arquivo de produção)
- **Verification:** `npx vitest run test/model/plugins-order.test.ts` — 1/1 passa
- **Committed in:** `c46a475` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 ajuste de execução por restrição de infraestrutura de teste)
**Impact on plan:** Nenhuma mudança de código de produção; a cobertura exigida pelos `acceptance_criteria` do plano está completa. Sem regressão em nenhum teste existente (208/208 passam).

## Issues Encountered
None além do documentado em Deviations acima.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- `Model.plugin()`/`Model[kResetPlugins]()` completos e testados; PLUG-02 fechado.
- Sistema de plugins (PLUG-01/02/03) está funcionalmente completo: tipos + módulo puro (Plano 01), integração local no construtor (Plano 02), registro global + enforcement de ordem + reset (Plano 03).
- Plano 04 (docs) pode documentar a API pública completa (`plugins[]`, `Model.plugin()`, `PluginContext`) sem nenhum gap de comportamento pendente.
- Nenhum bloqueio conhecido para o Plano 04.

---
*Phase: 07-sistema-de-plugins*
*Completed: 2026-07-15*

## Self-Check: PASSED

All created/modified files exist on disk; task commit hashes (`c283a59`, `c46a475`) found in `git log`.
