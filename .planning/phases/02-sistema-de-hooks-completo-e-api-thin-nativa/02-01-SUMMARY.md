---
phase: 02-sistema-de-hooks-completo-e-api-thin-nativa
plan: 01
subsystem: database
tags: [odm, mongodb, hooks, async_hooks, typescript]

# Dependency graph
requires:
  - phase: 01-funda-o-core-sem-bugs-e-build-moderno
    provides: MongoatError, getCollectionOrThrow, cloneDocumentDefaults, wrapDriverError, Proxy binding fix (QUAL-01), Vitest + testcontainers infra
provides:
  - HookRegistry pipeline replacing preMethod (múltiplos pre/post hooks, ordem de registro, ctx explícito)
  - AsyncLocalStorage per-model reentrancy guard (kHookContext)
  - Todos os 12 métodos CRUD do Model roteados pelo pipeline pre → driver → post
affects: [02-02, 02-03, phase-05-decorators, phase-06-plugins]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "HookRegistry<ModelType> — Record<METHODS, {pre: HookFn[]; post: PostHookEntry[]}> substituindo preMethod"
    - "ctx explícito por método via HookContextMap<ModelType> (lookup type indexado por METHODS)"
    - "AsyncLocalStorage por instância de Model para guard de recursão (D-07)"
    - "runHooked/executeHooked: dispatch genérico pre→driver→post reutilizado por 11 dos 12 métodos"
    - "raw*() variants lêem de ctx (pós-mutação de pre-hook), nunca dos parâmetros originais"

key-files:
  created:
    - src/types/hooks.ts
    - src/model/hooks.ts
    - test/model/hooks-pre-order.test.ts
    - test/model/hooks-post-order.test.ts
    - test/model/hooks-recursion-guard.test.ts
  modified:
    - src/model/index.ts
    - src/types/model.ts
    - src/index.ts
    - src/types/index.ts
    - examples/model/model.ts
    - examples/model/usage.ts
    - test/model/insertmany-hooks.test.ts
    - test/model/insert-input-isolation.test.ts
    - test/model/connection-required.test.ts

key-decisions:
  - "INSERT_MANY ctx usa `document` (singular, por-documento) além de `documents` (batch) — desvio deliberado de RESEARCH Pattern 3, necessário porque pre hooks rodam por documento (Pitfall 1) enquanto post hooks rodam uma vez para o batch inteiro"
  - "Todos os 12 métodos passam a ser roteados pelo pipeline assíncrono — total()/find()/etc. deixam de lançar MongoatError sincronamente quando desconectados; agora rejeitam a Promise"
  - "pre()/post() acumulam (push) em vez de sobrescrever (D-01) — quebra o padrão antigo de 'resetar' hooks chamando pre() de novo com no-op"

patterns-established:
  - "Pattern: runHooked(method, ctx, rawFn) — dispatch de reentrância genérico via AsyncLocalStorage, usado por 11/12 métodos; insertMany é o único caso especial (pre por documento)"
  - "Pattern: toda variante raw*() só lê de ctx.*, nunca dos parâmetros da função pública — garante que mutação de pre-hook chega ao driver"

requirements-completed: [HOOK-01, HOOK-02, HOOK-05]

coverage:
  - id: D1
    description: "Múltiplos pre hooks no mesmo método (construtor + .pre() encadeável) executam TODOS em ordem de registro, aguardados sequencialmente, incl. insertMany (paralelo entre docs, sequencial dentro do doc)"
    requirement: "HOOK-01"
    verification:
      - kind: integration
        ref: "test/model/hooks-pre-order.test.ts#pre hook do construtor roda ANTES do pre hook encadeável, ambos executam"
        status: pass
      - kind: integration
        ref: "test/model/hooks-pre-order.test.ts#dois pre hooks assíncronos rodam sequencialmente"
        status: pass
      - kind: integration
        ref: "test/model/hooks-pre-order.test.ts#insertMany: múltiplos pre hooks rodam sequencialmente por documento"
        status: pass
    human_judgment: false
  - id: D2
    description: "Múltiplos post hooks recebem ctx.result; retorno de hook transforma o resultado entregue ao caller, undefined apenas observa (D-04)"
    requirement: "HOOK-02"
    verification:
      - kind: integration
        ref: "test/model/hooks-post-order.test.ts#dois post hooks rodam em ordem de registro, ambos recebem ctx.result"
        status: pass
      - kind: integration
        ref: "test/model/hooks-post-order.test.ts#post hook que RETORNA um valor transforma o resultado entregue ao caller (D-04)"
        status: pass
      - kind: integration
        ref: "test/model/hooks-post-order.test.ts#post hook que NÃO retorna nada apenas observa"
        status: pass
    human_judgment: false
  - id: D3
    description: "Guard de recursão via AsyncLocalStorage por instância — hook chamando método do próprio model roda em modo raw, sem re-disparar hooks nem estourar a pilha"
    requirement: "HOOK-05"
    verification:
      - kind: integration
        ref: "test/model/hooks-recursion-guard.test.ts#pre hook de insert chamando model.total() não re-dispara os hooks de total()"
        status: pass
      - kind: integration
        ref: "test/model/hooks-recursion-guard.test.ts#chamada aninhada a método sem hooks registrados também roda em modo raw"
        status: pass
    human_judgment: false
  - id: D4
    description: "Nenhuma regressão dos fixes da Fase 1 (Promise.all entre docs em insertMany, WR-02/WR-06 clone/isolation, proxy binding, connection-required)"
    verification:
      - kind: integration
        ref: "npm test (19 arquivos / 49 testes)"
        status: pass
    human_judgment: false

# Metrics
duration: 20min
completed: 2026-07-07
status: complete
---

# Phase 02 Plan 01: Pipeline de hooks pre/post + guard de recursão Summary

**Pipeline pre/post completo com ctx explícito e registro dual acumulativo substitui `preMethod`/`.bind()`, com guard de recursão via `AsyncLocalStorage` por instância de Model — todos os 12 métodos CRUD hookados.**

## Performance

- **Duration:** ~20 min
- **Started:** 2026-07-07T17:43:00Z
- **Completed:** 2026-07-07T18:01:43Z
- **Tasks:** 3
- **Files modified:** 14

## Accomplishments
- `src/types/hooks.ts`: contrato de tipos completo (`HookFn`, `PostHookEntry`, `HookConfig`, `HookRegistry`, `HookContextMap`) — `ctx` tipado por método via lookup type indexado por `METHODS`.
- `src/model/hooks.ts`: `runPreHooks`/`runPostHooks` (sequencial, `for...of` + `await`, transform-via-retorno) e `buildContext`.
- `src/model/index.ts`: os 12 métodos CRUD reescritos para o pipeline `pre → driver → post`, com `hooks: HookRegistry<ModelType>` substituindo `preMethod`, `pre()`/`post()` acumulativos e encadeáveis, e `kHookContext` (`AsyncLocalStorage`) como guard de recursão por instância.
- Três suítes de integração novas (RED → GREEN) cobrindo HOOK-01, HOOK-02 e HOOK-05 contra Mongo real (testcontainers).

## Task Commits

Each task was committed atomically:

1. **Task 1: Testes RED — ordem/sequencialidade de pre e post hooks + guard de recursão** - `3453627` (test)
2. **Task 2: Tipos de hook + runner do pipeline** - `ffdd453` (feat)
3. **Task 3: Reescrever os 12 métodos CRUD para o pipeline pre/post + registro dual + guard de recursão** - `106c6dc` (feat)

**Plan metadata:** commit pending (this SUMMARY + STATE/ROADMAP update)

_Note: Task 3's commit also folds in prettier formatting fixes for Task 2's files (line-wrapping only) and the RED→GREEN migration of three pre-existing Fase 1 regression tests that used the old `.bind(doc)`/`this`-based hook signature — see Deviations._

## Files Created/Modified
- `src/types/hooks.ts` - `HookFn`, `PostHookEntry`, `HookConfig`, `HookRegistry`, `BaseHookContext`, `HookContextMap<ModelType>`
- `src/model/hooks.ts` - `runPreHooks`, `runPostHooks`, `buildContext`
- `src/model/index.ts` - hooks registry, `kHookContext` (AsyncLocalStorage), `pre()`/`post()` acumulativos, `runHooked`/`executeHooked`, os 12 métodos + variantes `raw*()`
- `src/types/model.ts` - `CreateModelProps.hooks?`
- `src/index.ts` / `src/types/index.ts` - re-export dos tipos públicos de hooks
- `examples/model/model.ts` / `examples/model/usage.ts` - migrados para a nova assinatura ctx-based de `.pre()`
- `test/model/hooks-pre-order.test.ts` - HOOK-01 (novo, RED→GREEN)
- `test/model/hooks-post-order.test.ts` - HOOK-02 (novo, RED→GREEN)
- `test/model/hooks-recursion-guard.test.ts` - HOOK-05 (novo, RED→GREEN)
- `test/model/insertmany-hooks.test.ts` - migrado de `this`-bound para `ctx`-based
- `test/model/insert-input-isolation.test.ts` - migrado de `this`-bound para `ctx`-based; segunda asserção do teste WR-06 reescrita (ver Deviations)
- `test/model/connection-required.test.ts` - migrado de `toThrow()` síncrono para `rejects.toThrow()` assíncrono

## Decisions Made
- **INSERT_MANY ctx com `document` (singular) além de `documents` (batch):** RESEARCH Pattern 3 declarava só `documents: array` para o ctx de `insertMany`, mas o próprio texto do PLAN (Pitfall 1) exige que os pre hooks rodem POR DOCUMENTO (`Promise.all` entre docs, `for...of` sequencial dentro do doc) — o que exige um ctx com granularidade de documento. Resolvido com ambos os campos: `document` (presente durante pre, um por chamada de hook) e `documents`/`result` (presentes durante post, que roda uma única vez para o batch inteiro, já que `InsertManyResult` não decompõe por documento).
- **`insertMany` não usa o dispatcher genérico `runHooked`/`executeHooked`:** é o único método especial-casado, exatamente como o PLAN pede — os outros 11 métodos compartilham o mesmo dispatch de reentrância.
- **Todos os 12 métodos passam a ser assíncronos via o pipeline hookado** (antes, só `insert`/`insertMany`/`update`/`updateMany` chamavam `preMethod`; os outros 8 eram síncronos até a chamada ao driver). Consequência aceita e documentada: `getCollectionOrThrow()` deixa de lançar sincronamente para métodos como `total()`/`find()` — vira rejeição de Promise (ver Deviations).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug/Breaking consequence] `total()`/demais métodos de leitura deixam de lançar `MongoatError` sincronamente**
- **Found during:** Task 3 (`npm test` full-suite gate)
- **Issue:** Rotear TODOS os 12 métodos pelo pipeline `executeHooked` (uma função `async`) converte qualquer `throw` síncrono de `getCollectionOrThrow()` em uma rejeição de Promise — `test/model/connection-required.test.ts` esperava `expect(() => model.total()).toThrow(...)` (throw síncrono).
- **Fix:** Migrado para `await expect(model.total()).rejects.toThrow(MongoatError)` / `.rejects.toThrow('Database not connected...')`.
- **Files modified:** `test/model/connection-required.test.ts`
- **Verification:** `npm test` — 49/49 verde.
- **Committed in:** `106c6dc` (Task 3 commit)

**2. [Rule 1 - Bug/Breaking consequence] Hooks pré-existentes com assinatura `this`-bound quebravam com o novo `ctx` explícito**
- **Found during:** Task 3 (`npm test` full-suite gate)
- **Issue:** `test/model/insertmany-hooks.test.ts` e `test/model/insert-input-isolation.test.ts` (regressões da Fase 1) registravam hooks com `function (this: Doc) { this.campo = ... }`, o padrão `.bind(doc)(options)` antigo. Com `hook(ctx)` chamado como função plana (ES modules sempre em strict mode), `this` é `undefined` dentro do hook — `TypeError: Cannot set properties of undefined`.
- **Fix:** Migrados os dois arquivos para `(ctx) => { ctx.document.campo = ... }`, conforme D-03 (breaking change documentado em RESEARCH.md como intencional — "quebrar em alpha é barato").
- **Files modified:** `test/model/insertmany-hooks.test.ts`, `test/model/insert-input-isolation.test.ts`
- **Verification:** `npm test` — 49/49 verde.
- **Committed in:** `106c6dc` (Task 3 commit)

**3. [Rule 1 - Bug/Breaking consequence] `insert-input-isolation.test.ts` (WR-06) dependia do `.pre()` sobrescrever para "resetar" um hook entre asserções**
- **Found during:** Task 3 (`npm test` full-suite gate)
- **Issue:** O teste registrava um hook mutador, inseria um doc, depois registrava `model.pre(METHOD, noop)` esperando que isso SUBSTITUÍSSE o hook mutador (comportamento antigo) antes de um segundo insert "limpo". Sob D-01 (`.pre()` agora ACUMULA), o hook mutador continua ativo — o segundo insert também sofre a mutação, e a asserção original (`second.meta?.source === 'api'`) deixou de ser observável pela saída do model.
- **Fix:** Reescrita a segunda metade do teste para verificar o invariante de WR-06 diretamente contra `model.documentDefaults` (o default interno compartilhado nunca é corrompido pela mutação do hook no clone por-insert), em vez de inferir isso pela saída de um segundo insert "sem hook".
- **Files modified:** `test/model/insert-input-isolation.test.ts`
- **Verification:** `npm test` — 49/49 verde.
- **Committed in:** `106c6dc` (Task 3 commit)

**4. [Rule 1 - Style] `examples/model/model.ts`/`usage.ts` migrados para a nova API de hooks**
- **Found during:** Task 3 (`npx tsc --noEmit` — `examples/` está incluído no `tsconfig.json`)
- **Issue:** O exemplo usava `User.pre<UserSchema>(METHODS.INSERT, function () { this.password = ... })` (assinatura antiga) e `updatedDocument.firstName` sem null-check (o retorno de `update()` é `WithId<ModelType> | null`, consistente com `HookContextMap`).
- **Fix:** `User.pre(METHODS.INSERT, (ctx) => { ctx.document.password = ... })`; `updatedDocument?.firstName`.
- **Files modified:** `examples/model/model.ts`, `examples/model/usage.ts`
- **Verification:** `npx tsc --noEmit` limpo.
- **Committed in:** `106c6dc` (Task 3 commit)

---

**Total deviations:** 4 auto-fixed (todos Rule 1 — consequências diretas e documentadas do breaking change intencional de D-01/D-03/D-07 desta fase; nenhum scope creep, nenhuma mudança arquitetural não prevista)
**Impact on plan:** Nenhum dos 4 desvios alterou o comportamento pretendido do pipeline de hooks — todos são adaptações de testes/exemplos pré-existentes ao contrato novo, já anunciado como breaking pelo RESEARCH.md e pelo CONTEXT.md ("quebrar em alpha é barato").

## Issues Encountered
None além dos desvios documentados acima.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- O pipeline pre/post está pronto para receber `fireAndForget`/`onHookError` (HOOK-04/D-06) no Plan 02, cujo texto do PLAN já isola esse ponto único de extensão em `runPostHooks`.
- `ctx.options`/`ctx.filter`/`ctx.document` são a mesma referência usada na chamada ao driver — base pronta para o passthrough de options do Plan 03 (API-01/D-09).
- Nenhum bloqueador conhecido para os Plans 02/03 desta fase.

---
*Phase: 02-sistema-de-hooks-completo-e-api-thin-nativa*
*Completed: 2026-07-07*

## Self-Check: PASSED
- FOUND: src/types/hooks.ts, src/model/hooks.ts, test/model/hooks-pre-order.test.ts, test/model/hooks-post-order.test.ts, test/model/hooks-recursion-guard.test.ts
- FOUND commits: 3453627 (test), ffdd453 (feat), 106c6dc (feat)
