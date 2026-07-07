---
phase: 02-sistema-de-hooks-completo-e-api-thin-nativa
plan: 02
subsystem: database
tags: [odm, mongodb, hooks, error_handling, typescript]

# Dependency graph
requires:
  - phase: 02-sistema-de-hooks-completo-e-api-thin-nativa
    plan: 01
    provides: HookRegistry pipeline (pre → driver → post), runPreHooks/runPostHooks, AsyncLocalStorage reentrancy guard, os 12 métodos CRUD roteados
provides:
  - Semântica de erro assimétrica fechada — pre aborta antes do driver, post normal propaga, post fireAndForget nunca propaga
  - runPostHooks com branch fireAndForget (dispatch não-aguardado + .catch → onHookError)
  - OnHookError<Ctx> type + CreateModelProps.onHookError + fallback console.error (Model.onHookError)
affects: [02-03, phase-03-seguranca-e-blindagem, phase-05-decorators, phase-06-plugins]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "runPostHooks(hooks, ctx, onHookError = defaultOnHookError) — branch fireAndForget dispara sem await, sempre com .catch(err => onHookError(err, ctx)), nunca .catch(() => {}) vazio"
    - "Model.onHookError resolvido uma única vez no construtor (props.onHookError ?? defaultOnHookError), threaded por um único ponto (executeHooked/insertMany) para runPostHooks"
    - "defaultOnHookError loga apenas err via console.error, nunca o ctx inteiro (T-02-02 — evita vazar document/filter em logs ingênuos)"

key-files:
  created:
    - test/model/hooks-error-propagation.test.ts
    - test/model/hooks-fire-and-forget.test.ts
  modified:
    - src/model/hooks.ts
    - src/model/index.ts
    - src/types/hooks.ts
    - src/types/model.ts
    - src/types/index.ts
    - src/index.ts

key-decisions:
  - "Task 1 (hooks-error-propagation) ficou GREEN desde o commit inicial — o pipeline pre→driver→post do Plan 01 já garantia abort-de-pre e propagação-de-post por construção (runPreHooks/runPostHooks sem try/catch). Mantido como suíte de regressão de HOOK-03/D-05, conforme a acceptance_criteria do PLAN previa explicitamente esse caminho."
  - "fireAndForget dispatch usa Promise.resolve().then(() => fn(ctx)).then(...).catch(onHookError) + continue — verdadeiramente não-aguardado (resolve A2/Open Question 1 do RESEARCH: fire-and-forget é dispatch, não await-com-erro-desviado)."
  - "defaultOnHookError(err) loga só err, nunca ctx — trade-off deliberado de T-02-02 (Information Disclosure), documentado no JSDoc; sanitização completa fica para SEC-03 (Fase 3)."

requirements-completed: [HOOK-03, HOOK-04]

coverage:
  - id: D5
    description: "Erro em pre-hook aborta a operação antes do driver — documento nunca é persistido; erro em post-hook normal (não fireAndForget) propaga ao caller por padrão, mesmo depois do driver já ter rodado"
    requirement: "HOOK-03"
    verification:
      - kind: integration
        ref: "test/model/hooks-error-propagation.test.ts#erro em pre-hook rejeita a operação e o driver NUNCA é chamado"
        status: pass
      - kind: integration
        ref: "test/model/hooks-error-propagation.test.ts#erro em post-hook normal propaga ao caller"
        status: pass
      - kind: integration
        ref: "test/model/hooks-error-propagation.test.ts#post-hook lançando ainda ocorre DEPOIS do insert no driver"
        status: pass
    human_judgment: false
  - id: D6
    description: "Post-hook fireAndForget opt-in não propaga erro nem bloqueia o retorno; erro é roteado a onHookError(err, ctx) configurado no model ou, na ausência, a console.error — nunca engolido em silêncio total"
    requirement: "HOOK-04"
    verification:
      - kind: integration
        ref: "test/model/hooks-fire-and-forget.test.ts#post-hook fireAndForget que lança NÃO propaga — insert resolve normalmente e onHookError recebe (err, ctx)"
        status: pass
      - kind: integration
        ref: "test/model/hooks-fire-and-forget.test.ts#post-hook fireAndForget sem onHookError configurado cai no fallback console.error"
        status: pass
      - kind: integration
        ref: "test/model/hooks-fire-and-forget.test.ts#post-hook fireAndForget NÃO bloqueia o retorno — insert resolve antes do hook lento completar"
        status: pass
    human_judgment: false
  - id: D7
    description: "Nenhuma regressão do Plan 01 (hooks-post-order.test.ts) nem da suíte completa da Fase 1/2"
    verification:
      - kind: integration
        ref: "npm test (21 arquivos / 55 testes)"
        status: pass
    human_judgment: false

# Metrics
duration: 10min
completed: 2026-07-07
status: complete
---

# Phase 02 Plan 02: Semântica de erro assimétrica do pipeline de hooks Summary

**`runPostHooks` ganha o branch `fireAndForget` (dispatch verdadeiramente não-aguardado, erro sempre roteado a `onHookError`/`console.error`, nunca `.catch(() => {})` vazio) e `Model.onHookError` configurável via `CreateModelProps` — fecha a semântica de erro assimétrica: pre aborta, post normal propaga, post fireAndForget nunca propaga.**

## Performance

- **Duration:** ~10 min
- **Started:** 2026-07-07T15:06:00Z (leitura de contexto)
- **Completed:** 2026-07-07T18:11:47Z
- **Tasks:** 3
- **Files modified:** 7 (2 novos, 5 modificados — hooks-error-propagation.test.ts conta como criado no Task 1 e reformatado no Task 3)

## Accomplishments
- `test/model/hooks-error-propagation.test.ts`: suíte de regressão de HOOK-03/D-05 contra Mongo real — pre-hook aborta antes do driver (documento nunca persistido), post-hook normal propaga (mesmo depois do driver já ter rodado).
- `test/model/hooks-fire-and-forget.test.ts`: suíte de HOOK-04/D-06 — fireAndForget não propaga, `onHookError(err, ctx)` recebe o erro, fallback `console.error` quando não configurado, dispatch não bloqueia o retorno do caller.
- `src/model/hooks.ts`: `runPostHooks` ganha o parâmetro `onHookError` (default `defaultOnHookError`) e o branch `fireAndForget` — dispatch não-aguardado via `Promise.resolve().then(...).catch(err => onHookError(err, ctx))`, `continue` imediato no loop.
- `src/types/hooks.ts`: `OnHookError<Ctx> = (err: unknown, ctx: Ctx) => void`.
- `src/types/model.ts`: `CreateModelProps.onHookError?: OnHookError<HookContextMap<ModelType>[METHODS]>`.
- `src/model/index.ts`: campo `Model.onHookError` resolvido uma única vez no construtor (`props.onHookError ?? defaultOnHookError`), passado a `runPostHooks` em `executeHooked` (11/12 métodos) e no bloco especial de `insertMany`.
- `src/types/index.ts` / `src/index.ts`: re-export de `OnHookError`.

## Task Commits

Each task was committed atomically:

1. **Task 1: Teste RED — erro pre-hook aborta / post-hook propaga (HOOK-03)** - `055c59d` (test)
2. **Task 2: Teste RED — fireAndForget não propaga e roteia para onHookError/console.error (HOOK-04)** - `78b2bf9` (test)
3. **Task 3: Implementar branch fireAndForget + config onHookError (GREEN)** - `234752d` (feat)

**Plan metadata:** commit pending (this SUMMARY + STATE/ROADMAP update)

_Note: Task 3's commit also folds in a prettier line-wrap-only reformat of Task 1's `hooks-error-propagation.test.ts` (no semantic change) — see Deviations._

## Files Created/Modified
- `test/model/hooks-error-propagation.test.ts` - HOOK-03 (novo — GREEN desde o Task 1, ver Deviations)
- `test/model/hooks-fire-and-forget.test.ts` - HOOK-04 (novo, RED→GREEN)
- `src/model/hooks.ts` - `runPostHooks` com branch `fireAndForget`, `defaultOnHookError`
- `src/model/index.ts` - campo `onHookError`, resolução no construtor, threading em `executeHooked`/`insertMany`
- `src/types/hooks.ts` - `OnHookError<Ctx>`
- `src/types/model.ts` - `CreateModelProps.onHookError?`
- `src/types/index.ts` / `src/index.ts` - re-export de `OnHookError`

## Decisions Made
- **Task 1 ficou GREEN, não RED, desde o primeiro commit:** o pipeline `runPreHooks`/`runPostHooks` do Plan 01 já não tinha `try/catch` nenhum ao redor da chamada de hook — um throw de pre-hook já propagava e abortava (o driver nunca era chamado por construção do `await runPreHooks(...)` antes de `rawFn()`), e um throw de post-hook normal já propagava (nenhum `.catch` genérico existia). O texto do próprio PLAN previa esse caminho ("Nota: a ordem do pipeline do Plan 01 já pode tornar alguns casos verdes; o gate aceita RED e a Task 3 confirma GREEN... prosseguir"). Mantida a suíte como rede de regressão explícita de HOOK-03/D-05.
- **`fireAndForget` verdadeiramente não-aguardado (não "aguardado com erro desviado"):** resolve a Open Question 1 do RESEARCH.md (Assumption A2) — `Promise.resolve().then(() => fn(ctx)).then(...).catch(err => onHookError(err, ctx))` seguido de `continue` no loop, sem nenhum `await`. Confirmado pelo teste de não-bloqueio (`insert-returned` antes de `hook-completed`).
- **`onHookError` resolvido uma única vez no construtor, não recalculado por chamada:** `this.onHookError = props.onHookError ?? defaultOnHookError` roda sincronamente junto dos outros campos do construtor (mesmo ponto onde `documentDefaults`/`validator` são resolvidos), preservando o construtor síncrono (D-07 da Fase 1).
- **`defaultOnHookError` loga apenas `err`, nunca `ctx`:** trade-off deliberado de T-02-02 (Information Disclosure) — o `ctx` completo (com `document`/`filter` do usuário) só é exposto ao callback `onHookError` explícito que o próprio dev configurou; o fallback automático nunca arrisca vazar dados de negócio em `console.error`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Style] `test/model/hooks-error-propagation.test.ts` reformatado pelo Prettier (Task 3)**
- **Found during:** Task 3 (`npx prettier --check` sobre os arquivos tocados no plano)
- **Issue:** O arquivo do Task 1 tinha duas linhas de asserção (`await expect(...).rejects.toThrow(...)`) que excediam o line-width configurado do Prettier.
- **Fix:** `npx prettier --write` — apenas quebra de linha, nenhuma mudança semântica.
- **Files modified:** `test/model/hooks-error-propagation.test.ts`
- **Verification:** `npx vitest run test/model/hooks-error-propagation.test.ts` — 3/3 verde antes e depois.
- **Committed in:** `234752d` (Task 3 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 — style, sem impacto semântico)
**Impact on plan:** Nenhum. O comportamento pretendido (pre aborta, post normal propaga, fireAndForget nunca propaga e roteia a onHookError/console.error) foi implementado exatamente como especificado pelo PLAN e pelas decisões D-05/D-06 do CONTEXT.md.

## Issues Encountered
None além do desvio de formatação documentado acima.

## User Setup Required
None - nenhuma configuração de serviço externo necessária.

## Next Phase Readiness
- A semântica de erro do pipeline de hooks está completa e travada por testes de regressão (HOOK-03/HOOK-04) — Plan 03 (API-01..API-04, options passthrough e escape hatch) não depende de nenhuma mudança adicional neste ponto.
- `Model.onHookError` está disponível como ponto de extensão único para futuras integrações (auditoria/observabilidade) sem precisar tocar em `executeHooked`/`insertMany` novamente.
- Nenhum bloqueador conhecido para o Plan 03 desta fase.

---
*Phase: 02-sistema-de-hooks-completo-e-api-thin-nativa*
*Completed: 2026-07-07*

## Self-Check: PASSED
- FOUND: test/model/hooks-error-propagation.test.ts, test/model/hooks-fire-and-forget.test.ts, src/model/hooks.ts, src/model/index.ts, src/types/hooks.ts, src/types/model.ts
- FOUND commits: 055c59d (test), 78b2bf9 (test), 234752d (feat)
