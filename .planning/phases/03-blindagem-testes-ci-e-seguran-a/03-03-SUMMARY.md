---
phase: 03-blindagem-testes-ci-e-seguran-a
plan: 03
subsystem: testing
tags: [vitest, testcontainers, hooks, indexes, robustez, unhandledRejection]

# Dependency graph
requires:
  - phase: 01-funda-o-core-sem-bugs-e-build-moderno
    provides: "setupIndexes incremental (WR-10) — diff em vez de drop-recreate"
  - phase: 02-sistema-de-hooks-completo-e-api-thin-nativa
    provides: "runPostHooks fireAndForget + onHookError dispatch"
provides:
  - "Guard try/catch no dispatch de onHookError (fireAndForget) — nunca vira unhandledRejection"
  - "Teste de regressão de idempotência do setupIndexes (SEC-04 fechado)"
  - "Teste de robustez de onHookError que lança/rejeita (WR-02 fechado)"
affects: [03-01, 03-04, 03-05]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "dispatchOnHookError: helper interno que contém falha síncrona (throw) ou assíncrona (reject) do onHookError do dev, como último elo da cadeia de erro do fireAndForget"

key-files:
  created:
    - test/model/hooks-onhookerror-throws.test.ts
    - test/database/setup-indexes-regression.test.ts
  modified:
    - src/model/hooks.ts

key-decisions:
  - "onHookError é tipado void, mas runtime pode devolver Promise (dev usando async sem seguir o tipo) — dispatchOnHookError faz cast via unknown e sonda .then() antes de anexar .catch(() => {})"
  - "Não alterar o caminho normal (post-hook não-fireAndForget) — continua propagando ao caller, preservando D-05"
  - "setupIndexes NÃO foi reimplementado (já incremental desde WR-10/Fase 1) — apenas coberto por teste de regressão de idempotência que faltava"

patterns-established:
  - "dispatchOnHookError: guard de último recurso — quando o handler de erro do próprio dev falha, não há para onde propagar sem virar unhandledRejection; a falha é contida silenciosamente"

requirements-completed: [SEC-04]

coverage:
  - id: D1
    description: "onHookError que lança (síncrono) ou rejeita (assíncrono) não gera unhandledRejection no processo"
    verification:
      - kind: integration
        ref: "test/model/hooks-onhookerror-throws.test.ts#onHookError SÍNCRONO que lança não gera unhandledRejection"
        status: pass
      - kind: integration
        ref: "test/model/hooks-onhookerror-throws.test.ts#onHookError ASSÍNCRONO que rejeita não gera unhandledRejection"
        status: pass
      - kind: integration
        ref: "test/model/hooks-onhookerror-throws.test.ts#caminho normal continua propagando o erro ao caller"
        status: pass
    human_judgment: false
  - id: D2
    description: "setupIndexes chamado 2x com a MESMA spec é idempotente — não dropa nem recria índice gerenciado nem externo"
    requirement: SEC-04
    verification:
      - kind: integration
        ref: "test/database/setup-indexes-regression.test.ts#2ª chamada com a MESMA spec não dropa nem recria índice gerenciado nem externo"
        status: pass
    human_judgment: false

duration: 6min
completed: 2026-07-08
status: complete
---

# Phase 3 Plan 3: Robustez de hooks e regressão de idempotência de índices Summary

**Guard interno em `runPostHooks`/`dispatchOnHookError` que contém falhas do próprio `onHookError` do dev (síncronas ou assíncronas), eliminando o último caminho de `unhandledRejection` no pipeline de hooks, mais o teste de regressão de idempotência que faltava para `setupIndexes` (SEC-04).**

## Performance

- **Duration:** 6 min
- **Started:** 2026-07-08T00:22Z
- **Completed:** 2026-07-08T00:27Z
- **Tasks:** 2
- **Files modified:** 3 (1 modificado, 2 criados)

## Accomplishments

- `src/model/hooks.ts`: `runPostHooks` (ramo `fireAndForget`) agora despacha erros via `dispatchOnHookError`, um helper que contém qualquer falha do próprio `onHookError` do dev — throw síncrono ou Promise rejeitada — sem propagar como `unhandledRejection` novo (WR-02/T-03-07).
- `test/model/hooks-onhookerror-throws.test.ts`: prova os dois casos (síncrono e assíncrono) capturando `process.on('unhandledRejection')` durante o teste, e confirma que o caminho normal (post-hook não-fireAndForget) continua propagando ao caller sem regressão de D-05.
- `test/database/setup-indexes-regression.test.ts`: fecha SEC-04 com a prova de regressão que faltava — chamar `setupCollection` 2x com a MESMA spec de índice gerenciado não altera o conjunto de índices (nem dropa nem recria), e o índice externo (não-gerenciado) sobrevive.
- Suíte completa (`npm test`) permanece verde: 27 arquivos / 80 testes.

## Task Commits

Each task was committed atomically:

1. **Task 1: Blindar dispatch de onHookError contra unhandledRejection (WR-02)** - `3f92c0b` (feat)
2. **Task 2: Teste de regressão de idempotência do setupIndexes incremental (SEC-04)** - `c80c310` (test)

**Plan metadata:** (this commit)

## Files Created/Modified

- `src/model/hooks.ts` - Nova função `dispatchOnHookError` que contém falha síncrona/assíncrona do `onHookError` do dev; `runPostHooks` (fireAndForget) passa a usá-la em vez de chamar `onHookError` direto no `.catch`
- `test/model/hooks-onhookerror-throws.test.ts` - 3 testes: onHookError síncrono que lança, onHookError assíncrono que rejeita, e não-regressão do caminho normal (propaga ao caller)
- `test/database/setup-indexes-regression.test.ts` - 1 teste: idempotência de `setupCollection` chamado 2x com spec idêntica (índice gerenciado + externo sobrevivem intactos)

## Decisions Made

- `onHookError` é tipado `void` em `src/types/hooks.ts`, mas o valor de retorno em runtime pode ser uma `Promise` (dev usando `async () => {...}` sem respeitar o tipo declarado). `dispatchOnHookError` faz `as unknown` antes de sondar `.then()`, evitando o erro TS1345 ("An expression of type 'void' cannot be tested for truthiness") enquanto ainda captura o caso real de uma Promise rejeitada.
- O caminho normal (post-hook não-`fireAndForget`) foi deliberadamente deixado intocado — o guard é específico do ramo `fireAndForget`, preservando a semântica de propagação de D-05 (Fase 2).
- `setupIndexes` não foi tocado — já é incremental desde a Fase 1 (WR-10). O plano é puramente de regressão: cobre o cenário de idempotência (spec idêntica) que `test/database/setup-indexes.test.ts` ainda não provava.

## Deviations from Plan

None - plan executado exatamente como escrito.

## Issues Encountered

- `npx tsc --noEmit` inicialmente rejeitou `returned && typeof (returned as {...}).then === 'function'` com TS1345 porque `onHookError` retorna `void` estaticamente — resolvido com `as unknown` antes do cast de forma (não é um deviation de escopo, apenas ajuste de tipagem para o mesmo guard já planejado).
- `npx prettier --write` reformatou ambos os arquivos de teste recém-criados (import multilinha em `hooks-onhookerror-throws.test.ts`, quebra de linha em `setup-indexes-regression.test.ts`) antes do commit — sem impacto de comportamento.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- WR-02 e SEC-04 fechados nesta fase — nenhum item pendente relacionado neste plano.
- Suíte de testes (27 arquivos / 80 testes) permanece 100% verde após as mudanças; nenhuma regressão introduzida em `hooks-fire-and-forget.test.ts` ou `setup-indexes.test.ts`.
- Sem bloqueios para os planos 03-02/03-04/03-05 (independentes desta wave).

---
*Phase: 03-blindagem-testes-ci-e-seguran-a*
*Completed: 2026-07-08*

## Self-Check: PASSED

- FOUND: src/model/hooks.ts
- FOUND: test/model/hooks-onhookerror-throws.test.ts
- FOUND: test/database/setup-indexes-regression.test.ts
- FOUND: 3f92c0b
- FOUND: c80c310
