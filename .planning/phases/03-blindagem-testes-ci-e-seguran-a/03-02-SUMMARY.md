---
phase: 03-blindagem-testes-ci-e-seguran-a
plan: 02
subsystem: security
tags: [mongodb, injection, objectid, filter-sanitization, validation, bson]

requires:
  - phase: 03-blindagem-testes-ci-e-seguran-a
    provides: hierarquia de erros tipada (MongoatValidationError) do Plano 01, reusada em todo este plano
provides:
  - toObjectId fail-loud (ObjectId.isValid) e findById com rejeição explícita de id nullish
  - sanitizeFilter opt-in exportado de @utils/barrel raiz, neutralizando $where/$function/$accumulator em qualquer profundidade
  - guard incondicional de $where embutido nos 7 métodos do Model que recebem filter
affects: [03-03, 03-04, 03-05]

tech-stack:
  added: []
  patterns:
    - "Scanner recursivo único (findForbiddenOperator) reusado tanto por sanitizeFilter (Task 2) quanto pelo guard assertNoWhere do Model (Task 3) — evita duplicar a lógica de percorrer filtro em qualquer profundidade"
    - "isPlainObject com discriminador Object.getPrototypeOf(v) === Object.prototype — mesmo padrão de cloneDocumentDefaults, reusado no clone/scan de filtro para não recursar em ObjectId/Date/RegExp/Buffer"
    - "Guard síncrono lançado dentro de try/catch e convertido em Promise.reject nos métodos que retornam Promise — preserva o contrato assíncrono do método público mesmo quando a validação falha antes de tocar o driver"

key-files:
  created:
    - src/utils/sanitize.ts
    - test/model/object-id-validation.test.ts
    - test/model/sanitize-filter.test.ts
    - test/model/where-rejection.test.ts
  modified:
    - src/utils/database.ts
    - src/utils/index.ts
    - src/index.ts
    - src/model/index.ts

key-decisions:
  - "toObjectId sem argumento (undefined) preserva a geração de novo ObjectId (Open Question 1 resolvida em 03-CONTEXT.md) — não-breaking; só valida/lança quando um argumento É fornecido"
  - "findById trata documentId nullish como erro explícito via Promise.reject, em vez de delegar a toObjectId(undefined) que geraria um _id aleatório e mascararia o bug do caller"
  - "sanitizeFilter permanece OPT-IN (D-06) — nenhum método do Model o chama automaticamente; só o guard $where (assertNoWhere) é automático e não-desligável (D-05)"
  - "stripUnknownTopLevel (default true) do sanitizeFilter só inspeciona o NÍVEL DE TOPO do filtro — operadores de campo aninhados ($gt/$in dentro de um seletor de campo) nunca são tocados por esse passo"
  - "findForbiddenOperator/isPlainObject exportados internamente de src/utils/sanitize.ts para reuso pelo guard do Model, evitando duplicar o scanner entre Task 2 e Task 3"

patterns-established:
  - "Todo guard de validação de filtro (assertNoWhere) roda ANTES de runHooked/do driver, convertendo o throw síncrono em Promise.reject para preservar o contrato Promise dos 7 métodos afetados"

requirements-completed: [SEC-01, SEC-02]

coverage:
  - id: D1
    description: "toObjectId valida com ObjectId.isValid e lança MongoatValidationError(INVALID_OBJECT_ID) para entrada inválida fornecida (string malformada, número, array); sem argumento continua gerando novo ObjectId"
    requirement: "SEC-02"
    verification:
      - kind: unit
        ref: "test/model/object-id-validation.test.ts"
        status: pass
    human_judgment: false
  - id: D2
    description: "findById trata documentId nullish (undefined/null) como erro explícito, não delega à geração silenciosa de _id aleatório"
    requirement: "SEC-02"
    verification:
      - kind: integration
        ref: "test/model/object-id-validation.test.ts"
        status: pass
    human_judgment: false
  - id: D3
    description: "sanitizeFilter (opt-in) neutraliza $where/$function/$accumulator em qualquer profundidade (inclusive dentro de $expr) e remove chaves $ de topo desconhecidas por default, preservando operadores de query legítimos ($gt/$in/$and/$or)"
    requirement: "SEC-01"
    verification:
      - kind: unit
        ref: "test/model/sanitize-filter.test.ts"
        status: pass
    human_judgment: false
  - id: D4
    description: "Os 7 métodos do Model que recebem filter (find, findMany, update, updateMany, delete, deleteMany, total) rejeitam $where em qualquer profundidade com MongoatValidationError(FORBIDDEN_OPERATOR) antes de tocar o driver; findById não é afetado"
    requirement: "SEC-01"
    verification:
      - kind: integration
        ref: "test/model/where-rejection.test.ts"
        status: pass
    human_judgment: false

duration: 25min
completed: 2026-07-07
status: complete
---

# Phase 3 Plan 2: Blindagem de entrada não-confiável (SEC-01/SEC-02) Summary

**toObjectId fail-loud com ObjectId.isValid, sanitizeFilter opt-in contra injeção de operadores, e guard incondicional de $where nos 7 métodos do Model com filter**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-07-07T21:30:00-03:00
- **Completed:** 2026-07-07T23:31:28-03:00
- **Tasks:** 3
- **Files modified:** 8 (4 criados, 4 modificados)

## Accomplishments
- `toObjectId` endurecido: valida com `ObjectId.isValid` quando um argumento é fornecido e lança `MongoatValidationError(INVALID_OBJECT_ID)` para input malformado (string, número, array); sem argumento continua gerando um `ObjectId` novo, preservando o uso legítimo de geração de `_id`
- `findById` trata `documentId` nullish como erro explícito via `Promise.reject`, fechando o bug em que um id `undefined` "funcionava" silenciosamente retornando `null`
- `src/utils/sanitize.ts` criado: `sanitizeFilter` opt-in (exportado de `@utils` e do barrel raiz) neutraliza `$where`/`$function`/`$accumulator` em qualquer profundidade e remove chaves `$` de topo desconhecidas por default, preservando `$gt`/`$in`/`$and`/`$or`
- Guard incondicional `assertNoWhere` embutido nos 7 métodos do `Model` que recebem `filter` (find, findMany, update, updateMany, delete, deleteMany, total) — rejeita `$where` em qualquer profundidade, sempre ativo e não-desligável, ANTES de tocar o driver
- Scanner único (`findForbiddenOperator`) reusado tanto pelo guard automático quanto pelo `sanitizeFilter` opt-in, evitando duplicar a lógica de percorrer o filtro recursivamente

## Task Commits

Cada task foi committada atomicamente:

1. **Task 1: toObjectId fail-loud + findById nullish explícito (SEC-02/D-02)** - `f75583b` (feat)
2. **Task 2: sanitizeFilter opt-in exportado de @utils (SEC-01/D-06/D-07)** - `ef64698` (feat)
3. **Task 3: Guard incondicional de $where nos 7 métodos com filter (SEC-01/D-05)** - `b479f60` (feat)

**Plan metadata:** (a ser gerado no commit final desta execução)

_Nota: as três tasks foram implementadas em modo TDD (test-first para os casos de comportamento novo), mas cada task resultou em um único commit `feat` contendo implementação + teste, seguindo o padrão já estabelecido nas fases anteriores deste projeto (não RED/GREEN/REFACTOR em commits separados)._

## Files Created/Modified
- `src/utils/database.ts` - `toObjectId` endurecido com `ObjectId.isValid` e `MongoatValidationError(INVALID_OBJECT_ID)`
- `src/utils/sanitize.ts` - `sanitizeFilter`, `SanitizeFilterOptions`, `findForbiddenOperator`, `isPlainObject` (novo arquivo)
- `src/utils/index.ts` - exporta `sanitizeFilter`/`SanitizeFilterOptions` no barrel `@utils`
- `src/index.ts` - exporta `sanitizeFilter` no barrel raiz
- `src/model/index.ts` - `findById` com rejeição de id nullish; `assertNoWhere` embutido nos 7 métodos com `filter`
- `test/model/object-id-validation.test.ts` - matriz de casos de `toObjectId`/`findById` (novo arquivo)
- `test/model/sanitize-filter.test.ts` - matriz de casos de `sanitizeFilter` (novo arquivo)
- `test/model/where-rejection.test.ts` - integração cobrindo os 7 métodos + findById + filtro legítimo (novo arquivo)

## Decisions Made
- `toObjectId()`/`toObjectId(undefined)` mantém a geração de novo `ObjectId` (não-breaking) — a validação fail-loud só se aplica quando um argumento É fornecido, conforme a Open Question 1 já resolvida em 03-CONTEXT.md
- `sanitizeFilter` permanece estritamente opt-in (D-06): nenhum método do `Model` o invoca automaticamente, apenas o guard `$where` é automático e não-desligável (D-05) — respeita o core value do projeto de não esconder o driver
- `stripUnknownTopLevel` do `sanitizeFilter` só inspeciona o nível mais externo do filtro; operadores de campo aninhados (`$gt`/`$in` sob um seletor de campo) nunca são tocados por esse passo, preservando queries legítimas em qualquer profundidade
- O guard `assertNoWhere` e o `sanitizeFilter` reusam o MESMO scanner recursivo (`findForbiddenOperator`), evitando duas implementações divergentes de "percorrer filtro em qualquer profundidade"

## Deviations from Plan

None - plano executado exatamente como escrito. As três tasks (SEC-02, sanitizeFilter, guard $where) foram implementadas conforme o `<action>` de cada task, com a matriz completa do bloco `<behavior>` coberta pelos testes.

## Issues Encountered
None.

## User Setup Required
None - nenhuma configuração de serviço externo necessária.

## Next Phase Readiness
- SEC-01 e SEC-02 do ROADMAP entregues: `sanitizeFilter` disponível para sanitização opt-in de input HTTP não-confiável; `$where` rejeitado incondicionalmente em todos os métodos com filtro; `toObjectId`/`findById` falham alto em entrada inválida em vez de mascarar bugs do caller
- `npm run lint`, `npx tsc --noEmit` e `npm test` (109 testes, 30 arquivos) verdes sem regressão
- Plano 03-03 (robustez de hooks/idempotência de índices) já executado e committado em paralelo (waves independentes); Planos 03-04 (testes) e 03-05 (CI) seguem pendentes

---
*Phase: 03-blindagem-testes-ci-e-seguran-a*
*Completed: 2026-07-07*

## Self-Check: PASSED

Todos os 8 arquivos de código/teste e os 3 commits de task (f75583b, ef64698, b479f60) foram verificados presentes no filesystem/git log.
