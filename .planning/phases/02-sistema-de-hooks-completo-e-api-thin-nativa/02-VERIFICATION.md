---
phase: 02-sistema-de-hooks-completo-e-api-thin-nativa
verified: 2026-07-07T18:40:00Z
status: gaps_found
score: 4/5 must-haves verified
behavior_unverified: 0
overrides_applied: 0
gaps:
  - truth: "Todo método do Model aceita e repassa options nativas com os tipos do driver (FindOptions, AggregateOptions, etc.) e retorna resultados precisa e consistentemente tipados."
    status: partial
    reason: >
      A metade "tipos de retorno explícitos" está satisfeita para os 12 métodos.
      A metade "repassa options nativas" quebra para 4 de 12 métodos: find (src/model/index.ts:771-773),
      findById (:788-790), delete (:814-816) e bulkWrite (:854-856) declaram `options?: XOptions`
      SEM default `= {}`, ao contrário dos outros 8 métodos. Quando o caller omite options,
      `ctx.options` fica `undefined`. Reproduzido empiricamente contra Mongo real nesta verificação:
      (1) um pre-hook que muta in-place (`ctx.options.projection = {...}`) lança `TypeError: Cannot
      set properties of undefined`, abortando a operação; (2) um hook defensivo
      (`if (ctx.options) ctx.options.projection = {...}`) vira no-op silencioso — a redação de campo
      sensível NUNCA é aplicada e o dado vaza no resultado (confirmado com um campo "secret" que
      permaneceu não-redigido no resultado de `find()`). O contrato documentado em
      `src/types/hooks.ts:80-83` ("ctx.options is the SAME reference used in the driver call — a
      pre-hook mutation reaches the driver, API-01") não vale para esses 4 métodos.
      `test/model/options-passthrough.test.ts` só cobre `findMany`/`insertMany` (ambos já têm
      default `{}`), então o buraco fica sem cobertura de teste.
    artifacts:
      - path: "src/model/index.ts"
        issue: "find():771-773, findById():788-790, delete():814-816, bulkWrite():854-856 declaram `options?: X` sem `= {}`, diferente dos outros 8 métodos CRUD"
      - path: "src/types/hooks.ts"
        issue: "HookContextMap para FIND (:106), FIND_BY_ID (:116), DELETE (:133) e BULK_WRITE (:153) declara `options?:` (opcional) em vez de `options:` — o tipo reflete corretamente o bug em runtime, mas contradiz o contrato documentado no comentário de topo do arquivo (:80-83)"
      - path: "test/model/options-passthrough.test.ts"
        issue: "só exercita findMany/insertMany (ambos com default {}); nenhum caso mutando ctx.options em find/findById/delete/bulkWrite"
    missing:
      - "Dar default `= {}` a find(), findById(), delete() e bulkWrite() (alinhando com os outros 8 métodos)"
      - "Atualizar HookContextMap para FIND/FIND_BY_ID/DELETE/BULK_WRITE de `options?:` para `options:` (sempre presente)"
      - "Adicionar caso(s) de teste em options-passthrough.test.ts que mutem ctx.options em find/findById/delete/bulkWrite sem o caller ter passado options"
---

# Fase 2: Sistema de Hooks Completo e API Thin Nativa — Relatório de Verificação

**Meta da Fase:** O dev ganha um pipeline pre/post de hooks completo e controle total do driver nativo — repassando options em todos os métodos, com escape hatch para `Collection`/`Db`/`MongoClient` e tipos de retorno precisos.
**Verificado:** 2026-07-07T18:40:00Z
**Status:** gaps_found
**Re-verificação:** Não — verificação inicial

## Goal Achievement

### Observable Truths

| # | Truth (Success Criterion do ROADMAP) | Status | Evidência |
|---|---|---|---|
| 1 | Dev pode registrar múltiplos handlers `pre`/`post` por método CRUD; ordem de registro; aguardados sequencialmente; `post` recebe o resultado. | ✓ VERIFIED | `test/model/hooks-pre-order.test.ts` (3 casos, inclusive `insertMany` seq. por doc) e `test/model/hooks-post-order.test.ts` (3 casos, inclusive transform via retorno) rodados contra Mongo real — 66/66 testes passando (`npx vitest run test/model/ test/database/`, ver seção Behavioral Spot-Checks). `src/model/hooks.ts:31-38` (`runPreHooks`, `for...of` + `await`) e `:57-89` (`runPostHooks`) confirmam a implementação. |
| 2 | Erro em pre-hook aborta antes do driver; erro em post-hook normal propaga; exceto `fireAndForget` explícito. | ✓ VERIFIED | `test/model/hooks-error-propagation.test.ts` (3 casos, inclusive prova indireta "documento nunca persistido" e "documento já persistido quando post lança") e `test/model/hooks-fire-and-forget.test.ts` (3 casos, inclusive não-bloqueio medido com `vi.waitFor`) passando contra Mongo real. `src/model/hooks.ts:62-88` implementa o branch `fireAndForget` roteado para `onHookError`. |
| 3 | Hook que chama método do próprio model é interrompido por guard de recursão, não entra em loop infinito. | ✓ VERIFIED | `test/model/hooks-recursion-guard.test.ts` (2 casos: pre-hook de `insert` chamando `ctx.model.total()` sem re-disparar hooks de `total`; chamada aninhada sem hooks registrados também não trava) passando contra Mongo real. `src/model/index.ts:230, 521-535` (`AsyncLocalStorage` per-instance `kHookContext`, `runHooked`) implementa o guard. |
| 4 | Todo método do Model aceita e repassa options nativas tipadas do driver; retorna resultados precisa e consistentemente tipados. | ✗ FAILED (parcial) | **Tipos de retorno:** ✓ verificado — os 12 métodos públicos declaram retorno `Promise<T>` explícito (`aggregate→Promise<Document[]>`, `find→Promise<WithId<T>\|null>`, `updateMany→Promise<UpdateResult>`, etc. — `src/model/index.ts`). **Repasse de options via ctx (mutação por pre-hook):** ✗ falha para 4/12 métodos — ver Gap #1 abaixo. Reproduzido empiricamente contra Mongo real nesta verificação (script de repro temporário, removido após confirmação — 3/3 asserts confirmando `TypeError` em `find`/`delete` e vazamento silencioso de campo sensível). |
| 5 | Dev acessa `Collection` via `model.getCollection()` e `MongoClient`/`Db` via `database.getClient()`/`getDb()`, com bypass documentado de hooks/gating. | ✓ VERIFIED | `test/model/escape-hatch.test.ts` (4 casos: shape, bypass de gating, bypass de hooks, fail-loud pré-conexão) e `test/database/escape-hatch.test.ts` (4 casos, inclusive "enum METHODS permanece com 12 membros") passando contra Mongo real. `src/model/index.ts:436-458` e `src/database/index.ts:287-324` têm JSDoc explícito "ATENÇÃO — bypass DELIBERADO". |

**Score:** 4/5 truths verified (0 present, behavior-unverified)

### Required Artifacts

| Artifact | Expected | Status | Details |
|---|---|---|---|
| `src/types/hooks.ts` | `HookFn`, `PostHookEntry`, `HookConfig`, `HookRegistry`, `BaseHookContext`, `HookContextMap`, `OnHookError` | ✓ VERIFIED | Todos presentes (168 linhas), tipados por método via `HookContextMap<ModelType>[M]`. `options?:` em FIND/FIND_BY_ID/DELETE/BULK_WRITE reflete corretamente o bug do Gap #1 (não é um erro de tipo — é o tipo dizendo a verdade sobre o runtime). |
| `src/model/hooks.ts` | `runPreHooks`, `runPostHooks`, `buildContext`, `defaultOnHookError` | ✓ VERIFIED | Todos presentes e substantivos (107 linhas); wired em `src/model/index.ts`. |
| `src/model/index.ts` | registry de hooks, `kHookContext`, `pre()`/`post()` encadeáveis, `executeHooked`/`runHooked`, `getCollection()`, 12 métodos com options+retorno tipados | ✓ VERIFIED (com ressalva) | Todos presentes e wired; ressalva do Gap #1 nos 4 métodos citados. |
| `src/database/index.ts` | `getClient()`, `getDb()` | ✓ VERIFIED | `:305-324`, documentados como bypass deliberado, testados. |
| `test/model/hooks-*.test.ts`, `test/model/escape-hatch.test.ts`, `test/model/options-passthrough.test.ts`, `test/database/escape-hatch.test.ts` | suítes de integração contra Mongo real | ✓ VERIFIED (com gap de cobertura) | 8 arquivos de teste, todos substantivos (não-stub), todos passando. Gap: `options-passthrough.test.ts` não cobre find/findById/delete/bulkWrite (ver Gap #1). |

### Key Link Verification

| From | To | Via | Status | Details |
|---|---|---|---|---|
| `ctx.options`/`ctx.document`/`ctx.filter` | chamada real ao driver (`rawX`) | mesma referência, lida em `c.options` dentro do `rawFn` passado a `runHooked` | ⚠️ PARTIAL | Verdadeiro para 8/12 métodos (default `{}` presente); falso para `find`/`findById`/`delete`/`bulkWrite` quando o caller omite options (`ctx.options === undefined`). |
| Todo método CRUD | `kHookContext.run({ raw: true }, ...)` | guard de recursão | ✓ WIRED | Confirmado em `runHooked` (`:521-535`) e `insertMany` (caso especial, `:707-713`), testado por `hooks-recursion-guard.test.ts`. |
| `hooks` registry | inicializado com 12 entries `{ pre: [], post: [] }` | `Object.fromEntries(Object.values(METHODS)...)` no construtor | ✓ WIRED | `src/model/index.ts:202-204`, confirmado por `test/database/escape-hatch.test.ts` ("enum METHODS permanece com 12 membros"). |
| `getCollection()`/`getClient()`/`getDb()` | fora do enum `METHODS` | bypass de gating "de graça" | ✓ WIRED | Confirmado por teste explícito (`Object.values(METHODS)` não contém os 3 nomes) e pelo teste de bypass funcional (`insert()` via Proxy lança, `getCollection().insertOne()` não). |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|---|---|---|---|
| Suíte completa de testes do Model/Database da fase (23 arquivos) roda verde contra Mongo real (testcontainers) | `npx vitest run test/model/ test/database/` | `Test Files 23 passed (23)`, `Tests 66 passed (66)` | ✓ PASS |
| `tsc --noEmit` (typecheck estrito, `strict: true`) | `npx tsc --noEmit` | exit 0, sem output | ✓ PASS |
| Repro empírico de CR-01: pre-hook mutando `ctx.options` in-place em `find()`/`delete()` sem options do caller | script de teste temporário (vitest, removido após execução) contra Mongo real | `TypeError` lançado em ambos; hook defensivo `if (ctx.options)` virou no-op e vazou campo `secret` não-redigido | ✗ FAIL (confirma Gap #1) |

### Requirements Coverage

| Requirement | Source Plan | Descrição | Status | Evidência |
|---|---|---|---|---|
| HOOK-01 | 02-01 | Múltiplos pre hooks, ordem de registro, sequenciais (inclusive insertMany) | ✓ SATISFIED | `hooks-pre-order.test.ts` |
| HOOK-02 | 02-01 | Múltiplos post hooks, acesso a `ctx.result` | ✓ SATISFIED | `hooks-post-order.test.ts` |
| HOOK-03 | 02-02 | Erro em pre aborta; erro em post normal propaga | ✓ SATISFIED | `hooks-error-propagation.test.ts` |
| HOOK-04 | 02-02 | `fireAndForget` opt-in, erros não propagam | ✓ SATISFIED | `hooks-fire-and-forget.test.ts` |
| HOOK-05 | 02-01 | Guard de recursão contra loop infinito | ✓ SATISFIED | `hooks-recursion-guard.test.ts` |
| API-01 | 02-03 | Todos os métodos aceitam e repassam options nativas tipadas | ✗ BLOCKED | Gap #1 — 4/12 métodos (find/findById/delete/bulkWrite) não repassam `ctx.options` de forma confiável para mutação por hook quando o caller omite options |
| API-02 | 02-03 | `model.getCollection()` com bypass documentado | ✓ SATISFIED | `escape-hatch.test.ts` (model) |
| API-03 | 02-03 | `database.getClient()`/`getDb()` | ✓ SATISFIED | `escape-hatch.test.ts` (database) |
| API-04 | 02-03 | Tipos de retorno TS explícitos e precisos em todos os métodos | ✓ SATISFIED | Inspeção direta de `src/model/index.ts` — os 12 métodos declaram `Promise<T>` explícito |

Nenhum requisito órfão: os 9 IDs mapeados para a Fase 2 em `REQUIREMENTS.md` aparecem todos no `requirements:` frontmatter de algum dos 3 planos (HOOK-01/02/05 → 02-01; HOOK-03/04 → 02-02; API-01/02/03/04 → 02-03).

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|---|---|---|---|---|
| `src/model/index.ts` | 773, 790, 816, 856 | `options?: X` sem default `= {}` (inconsistente com os outros 8 métodos) | 🛑 Blocker | Gap #1 — quebra o contrato de mutação de `ctx.options` documentado como garantia de API-01 |
| `src/model/index.ts` (todos os métodos) + `src/model/hooks.ts:96-106` (WR-01 do 02-REVIEW.md) | vários | `ctx.model` expõe a instância crua (não-Proxy) dentro de hooks — um hook pode chamar `ctx.model.delete()` mesmo se `DELETE` não estiver em `allowedMethods` | ⚠️ Warning | Contorna o gating anunciado como garantia de runtime; baixa explorabilidade (só código do próprio autor pode escrever hooks), não documentado como bypass intencional. Não bloqueia a fase — recomendado tratar em fase futura ou documentar. |
| `src/model/hooks.ts:69-77` (WR-02 do 02-REVIEW.md) | 76 | `.catch((err) => onHookError(err, ctx))` sem proteção se `onHookError` do usuário lançar | ⚠️ Warning | Pode gerar `unhandledRejection`; não bloqueia a fase. |
| `src/model/index.ts:143-177` (WR-03 do 02-REVIEW.md) | — | `isSameConfig` não compara `hooks`/`onHookError` no re-registro | ⚠️ Warning | Re-registro com hooks divergentes é descartado em silêncio; não bloqueia a fase. |
| `examples/model/model.ts:62-64` (WR-04 do 02-REVIEW.md) | — | `documentDefaults: { insertedAt: new Date() }` congela timestamp no load do módulo | ⚠️ Warning | Exemplo ensina padrão incorreto; não afeta a lib em si. |

Nenhum marcador de débito (`TBD`/`FIXME`/`XXX`/`TODO`/`HACK`/`PLACEHOLDER`) sem referência formal foi encontrado nos arquivos tocados pela fase (`src/model/index.ts`, `src/model/hooks.ts`, `src/types/hooks.ts`, `src/database/index.ts`). O único match de "TODO" (`src/database/index.ts:462`) é um falso positivo — substring de "TODOS" (português).

### Human Verification Required

Nenhum item necessita verificação humana. Todas as truths foram verificáveis programaticamente (testes de integração contra Mongo real via testcontainers + inspeção direta de código + reprodução empírica do Gap #1).

### Gaps Summary

A fase entrega solidamente 4 das 5 truths do ROADMAP: o pipeline pre/post completo (múltiplos handlers, ordem, sequencialidade), a semântica de erro assimétrica (abort/propagate/fireAndForget), o guard de recursão via `AsyncLocalStorage`, e o escape hatch honesto (`getCollection`/`getClient`/`getDb`) — todos com suítes de integração substantivas passando contra MongoDB real, sem stubs.

A Truth #4 (options nativas repassadas em TODO método) falha parcialmente: a metade "tipos de retorno" está completa, mas a metade "repasse de options via ctx" — que é o próprio mecanismo pelo qual um pre-hook pode mutar options antes da chamada ao driver, e que o projeto documenta como garantia central de API-01 — não vale para `find`, `findById`, `delete` e `bulkWrite`. Esses 4 métodos, diferente dos outros 8, não têm default `= {}` no parâmetro `options`, então `ctx.options` é `undefined` sempre que o caller não passa options explicitamente. Isso foi confirmado por inspeção de código (`src/model/index.ts`, `src/types/hooks.ts`) e reproduzido empiricamente contra Mongo real nesta verificação: um pre-hook de redação de campo sensível (padrão citado no próprio 02-REVIEW.md como caso de uso relevante de segurança) ou lança `TypeError` (mutação in-place) ou vira no-op silencioso e vaza o dado (hook defensivo `if (ctx.options)`), dependendo de como o hook foi escrito.

Esta é a mesma constatação do CR-01 em `02-REVIEW.md` — a verificação goal-backward a confirma de forma independente e empírica, não apenas por leitura do relatório de review. O fix é pequeno e localizado (default `= {}` em 4 assinaturas + ajuste de 4 tipos em `HookContextMap` + 1-2 casos de teste novos), mas é necessário para que a Truth #4 / API-01 sejam efetivamente entregues. Recomenda-se fechar este gap antes de avançar para a Fase 3 — ou registrar um override explícito caso o time decida aceitar o risco (não recomendado, dado o caráter de segurança do exemplo de redação de campo).

---

_Verificado: 2026-07-07T18:40:00Z_
_Verificador: Claude (gsd-verifier)_
