---
phase: 03-blindagem-testes-ci-e-seguran-a
plan: 04
subsystem: testing
tags: [vitest, coverage-v8, testcontainers, concurrency, error-coverage]

requires:
  - phase: 03-blindagem-testes-ci-e-seguran-a
    provides: hierarquia de erros tipada (MongoatDriverError/MongoatValidationError, Plano 01) e guards de segurança ($where, ObjectId, Plano 02) sobre os quais os novos testes de erro/regressão são construídos
provides:
  - Cobertura de erro para os 6 métodos do Model que ainda não tinham cenário de falha dedicado (aggregate/total/update/updateMany/delete/deleteMany) e para bulkWrite (MongoatDriverError com .cause)
  - Fechamento do Pitfall 4 (ctx.options mutation via pre-hook) para findById e bulkWrite — find/delete já estavam cobertos desde o fix CR-01
  - Cobertura de concorrência: registro concorrente do mesmo model (Promise.all) e CRUD paralelo (insert/findMany) no mesmo model
  - Gate de cobertura real (test.coverage em vitest.config.ts, provider v8, thresholds D-10) — pronto para ser consumido pelo CI no Plano 05
affects: [03-05]

tech-stack:
  added: []
  patterns:
    - "Erros de driver NÃO wrapeados (aggregate/total/update/updateMany/delete/deleteMany) são testados com .rejects.toThrow() genérico — só bulkWrite/insert/insertMany passam por wrapDriverError e viram MongoatDriverError com .cause"
    - "Concorrência de registro de model testada via Promise.all(Promise.resolve().then(() => new Model(...))) — defere a construção síncrona por um microtask cada, formalizando o cenário 'quase simultâneo' já que o construtor do Model é 100% síncrono"
    - "test.coverage.thresholds só é avaliado com --coverage — npm test (sem --coverage) continua sem custo de instrumentação"

key-files:
  created:
    - test/model/crud-error-coverage.test.ts
    - test/model/options-passthrough-remaining.test.ts
    - test/model/concurrency.test.ts
  modified:
    - vitest.config.ts

key-decisions:
  - "aggregate/total/update/updateMany/delete/deleteMany permanecem sem wrapDriverError (comportamento herdado do Plano 01 — só insert/insertMany/bulkWrite passam por wrapDriverError) — os testes de erro desses 6 métodos asserram apenas .rejects.toThrow() genérico, não instanceof MongoatDriverError, para não fixar em teste um comportamento que o próprio código-fonte não implementa; alterar isso seria mudança estrutural (Rule 4), fora do escopo de um plano de gap-fill de testes"
  - "options-passthrough-remaining.test.ts cobre só findById e bulkWrite — find e delete já tinham teste de ctx.options mutation em options-passthrough.test.ts desde o commit b51c4c9 (Fase 2, fix CR-01); duplicar teria violado a acceptance criteria 'sem duplicar happy paths existentes'"
  - "Thresholds de coverage mantidos exatamente no ponto de partida do D-10 (lines/functions/statements 80, branches 70) — a suíte já bate 94.4%/97.41%/94.4%/85.38% sem nenhum ajuste adicional de teste; não subimos o threshold para o valor real observado, evitando um gate frágil a qualquer refactor futuro que reduza levemente a cobertura"

patterns-established:
  - "Testes de concorrência de registro de model usam Promise.allSettled + inspeção de fulfilled/rejected para provar que exatamente uma config vence quando há divergência — nunca as duas 'vencem' corrompendo o registry"

requirements-completed: [QUAL-02]

coverage:
  - id: D1
    description: "Os 6 métodos do Model sem cenário de erro dedicado (aggregate, total, update, updateMany, delete, deleteMany) ganham teste de erro"
    requirement: "QUAL-02"
    verification:
      - kind: integration
        ref: "test/model/crud-error-coverage.test.ts#Model — gap-fill de cenários de erro por método (D-09)"
        status: pass
    human_judgment: false
  - id: D2
    description: "bulkWrite com operação inválida lança MongoatDriverError com .cause preservado"
    requirement: "QUAL-02"
    verification:
      - kind: integration
        ref: "test/model/crud-error-coverage.test.ts#bulkWrite() com operação que viola o schema rejeita com MongoatDriverError (.cause preservado)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Mutação de ctx.options por pre-hook chega ao driver em findById e bulkWrite (Pitfall 4 fechado para os 2 métodos que faltavam; find/delete já cobertos)"
    requirement: "QUAL-02"
    verification:
      - kind: integration
        ref: "test/model/options-passthrough-remaining.test.ts#Model — options passthrough remanescente (findById/bulkWrite) (Pitfall 4)"
        status: pass
    human_judgment: false
  - id: D4
    description: "Registro concorrente do mesmo model (2 new Model() via Promise.all) — config idêntica reusa a instância, config divergente falha alto sem corromper o registry"
    requirement: "QUAL-02"
    verification:
      - kind: integration
        ref: "test/model/concurrency.test.ts#Model — registro concorrente do mesmo collectionName (D-09)"
        status: pass
    human_judgment: false
  - id: D5
    description: "Operações CRUD paralelas (insert/findMany via Promise.all) no mesmo model mantêm consistência"
    requirement: "QUAL-02"
    verification:
      - kind: integration
        ref: "test/model/concurrency.test.ts#Model — operações CRUD paralelas no mesmo model (D-09)"
        status: pass
    human_judgment: false
  - id: D6
    description: "Gate de cobertura (test.coverage, provider v8, thresholds lines/functions/statements 80, branches 70) ativo em vitest.config.ts e satisfeito pela suíte completa"
    requirement: "QUAL-02"
    verification:
      - kind: other
        ref: "npx vitest run --coverage (exit 0; 94.4% stmts / 85.38% branch / 97.41% funcs / 94.52% lines)"
        status: pass
    human_judgment: false

duration: 25min
completed: 2026-07-07
status: complete
---

# Phase 3 Plan 4: Gap-fill de cobertura de testes + gate de threshold Summary

**Fecha as lacunas de erro/concorrência da matriz de cobertura (aggregate/total/update/updateMany/delete/deleteMany/bulkWrite/findById) e liga `@vitest/coverage-v8` como gate real em `vitest.config.ts`, com a suíte completa batendo 94.4% statements / 85.38% branches — bem acima dos thresholds 80/70 configurados.**

## Performance

- **Duration:** ~25 min
- **Completed:** 2026-07-07
- **Tasks:** 2
- **Files modified:** 4 (3 criados: `test/model/crud-error-coverage.test.ts`, `test/model/options-passthrough-remaining.test.ts`, `test/model/concurrency.test.ts`; 1 modificado: `vitest.config.ts`)

## Accomplishments

- `test/model/crud-error-coverage.test.ts`: cenário de erro para os 6 métodos que só tinham happy path (`aggregate`, `total`, `update`, `updateMany`, `delete`, `deleteMany`) + `bulkWrite` (assertando `MongoatDriverError` com `.cause` preservado, já que é o único desses que passa por `wrapDriverError`)
- `test/model/options-passthrough-remaining.test.ts`: fecha o Pitfall 4 (mutação de `ctx.options` por pre-hook chegando ao driver) para `findById` e `bulkWrite` — os 2 métodos que ainda faltavam (`find`/`delete` já cobertos desde o fix CR-01 na Fase 2)
- `test/model/concurrency.test.ts`: registro concorrente do mesmo `collectionName` (2 `new Model()` via `Promise.all`, config idêntica reusa a instância / config divergente falha alto sem corromper o registry) + CRUD paralelo (20 inserts + 10 findMany concorrentes) consistente
- `vitest.config.ts`: bloco `test.coverage` (provider `v8`, thresholds `lines/functions/statements: 80`, `branches: 70`, D-10) — `npx vitest run --coverage` roda 33 arquivos/122 testes e bate 94.4%/85.38%/97.41%/94.52%, todos acima do threshold; `npm test` sem `--coverage` continua verde em ~8.6s

## Task Commits

Each task was committed atomically:

1. **Task 1: Gap-fill de cenários de erro + ctx.options mutation por método (D-09/Pitfall 4)** - `efe6b43` (test)
2. **Task 2: Cobertura de concorrência + gate de threshold de coverage (D-09/D-10)** - `85b1417` (feat)

**Plan metadata:** (este commit, docs: complete plan)

## Files Created/Modified

- `test/model/crud-error-coverage.test.ts` - erro dedicado para aggregate/total/update/updateMany/delete/deleteMany/bulkWrite
- `test/model/options-passthrough-remaining.test.ts` - Pitfall 4 fechado para findById/bulkWrite
- `test/model/concurrency.test.ts` - registro concorrente de model + CRUD paralelo
- `vitest.config.ts` - bloco `test.coverage` (provider v8, thresholds D-10)

## Decisions Made

- **Erro não-wrapeado em 6 métodos:** `aggregate`/`total`/`update`/`updateMany`/`delete`/`deleteMany` não passam por `wrapDriverError` (só `insert`/`insertMany`/`bulkWrite` passam, decisão já tomada no Plano 01 — `wrapDriverError` call-sites "permanecem inalterados"). Os testes de erro desses 6 métodos usam `.rejects.toThrow()` genérico (o erro real é um `MongoServerError` nativo do driver), em vez de assertar `MongoatDriverError`, para não fixar em teste um comportamento que o código-fonte atual não implementa — alterar `wrapDriverError` para cobrir mais métodos seria uma mudança estrutural (Rule 4), fora do escopo de um plano de teste puro. Documentado no cabeçalho do arquivo.
- **`options-passthrough-remaining.test.ts` cobre só 2 dos "4 métodos" citados no plano:** o texto do plano lista `find`/`findById`/`delete`/`bulkWrite`, mas `find` e `delete` já tinham teste de `ctx.options` mutation em `options-passthrough.test.ts` desde o commit `b51c4c9` (fix CR-01 na Fase 2) — escrevê-los de novo violaria a acceptance criteria "sem duplicar happy paths existentes". O novo arquivo cobre exatamente a lacuna real: `findById` e `bulkWrite`.
- **Thresholds mantidos no ponto de partida do D-10** (80/80/80/70), não subidos para o valor real observado (~94%/97%/94%/85%) — um threshold colado ao valor atual quebraria a qualquer pequena regressão de cobertura futura sem sinalizar um problema real; o objetivo do D-10 é um piso mínimo, não um espelho do estado atual.

## Deviations from Plan

None - plano executado exatamente como escrito. A única nuance é a redução de escopo do arquivo `options-passthrough-remaining.test.ts` de "4 métodos" para "2 métodos" (documentada acima em Decisions Made), que é uma aplicação direta da própria acceptance criteria do plano ("sem duplicar happy paths existentes"), não um desvio de regra de deviation.

## Issues Encountered

None.

## User Setup Required

None - nenhuma configuração de serviço externo necessária.

## Next Phase Readiness

- Gate de cobertura (`npx vitest run --coverage`) ativo e verde — pronto para ser referenciado como `npm run test -- --coverage` (ou script dedicado) no workflow de CI do Plano 05 (D-12).
- Suíte completa: 33 arquivos / 122 testes, `npm test` (sem coverage) em ~8.6s — dentro da faixa esperada por 03-RESEARCH.md ("a suíte roda em ~8s").
- Nenhum bloqueio conhecido para o Plano 05.

---
*Phase: 03-blindagem-testes-ci-e-seguran-a*
*Completed: 2026-07-07*

## Self-Check: PASSED

- FOUND: `test/model/crud-error-coverage.test.ts`
- FOUND: `test/model/options-passthrough-remaining.test.ts`
- FOUND: `test/model/concurrency.test.ts`
- FOUND: `vitest.config.ts`
- FOUND: `.planning/phases/03-blindagem-testes-ci-e-seguran-a/03-04-SUMMARY.md`
- FOUND: `efe6b43` (Task 1)
- FOUND: `85b1417` (Task 2)
