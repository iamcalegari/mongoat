---
phase: 01-funda-o-core-sem-bugs-e-build-moderno
plan: 05
subsystem: database
tags: [mongodb, typescript, odm, model, structuredClone, proxy, vitest]

# Dependency graph
requires:
  - phase: 01-funda-o-core-sem-bugs-e-build-moderno (plan 01)
    provides: MongoatError base class (src/errors/index.ts)
  - phase: 01-funda-o-core-sem-bugs-e-build-moderno (plan 03)
    provides: vitest + testcontainers infra (test/setup/testcontainer.ts, real MongoDB per suite)
  - phase: 01-funda-o-core-sem-bugs-e-build-moderno (plan 04)
    provides: fixed Proxy binding (bind ao target), Database.resetRegistry() (D-09), Model constructor retorna a instância registrada/proxied
provides:
  - insertMany aguarda pre-hooks assíncronos com Promise.all antes de inserir
  - find() com tipo de retorno honesto — Promise<WithId<ModelType> | null>, sem união síncrona
  - getCollectionOrThrow() — helper privado que lança MongoatError tipado quando o Database não está conectado (D-10), reutilizado em 11 métodos CRUD
  - schemaValidatorBuilder clona o schema com structuredClone antes de mutar — schemas compartilhados entre models nunca vazam mutação
  - isSameConfig() + registro atômico com detecção de config divergente (D-06) — segunda new Model() com config diferente lança MongoatError em vez de ser ignorada silenciosamente
  - fix de bug pré-existente em delete() (mongodb@7 findOneAndDelete não usa mais {value})
  - QUAL-01 fechado — os 5 bugs conhecidos da camada Model/Database estão corrigidos e travados por teste (04 + 05)
affects: [phase-02-hooks-extensibilidade, phase-03-blindagem-seguranca]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "TDD RED/GREEN por bug: teste de regressão falha primeiro (runtime ou tsc --noEmit), depois fix cirúrgico"
    - "Helper privado getCollectionOrThrow() centraliza o guard de conexão em vez de repetir o cast `as Collection<ModelType>` em cada método"
    - "Comparação estrutural leve via JSON.stringify (sem lib de deep-equal) para detectar divergência de config no registry"
    - "Regression test de tipo via atribuição de função bound a uma variável com assinatura-alvo exata (falha em tsc --noEmit se o tipo real for mais amplo)"

key-files:
  created:
    - test/model/insertmany-hooks.test.ts
    - test/model/find-typing.test.ts
    - test/model/schema-clone.test.ts
    - test/model/connection-required.test.ts
    - test/model/registry-config.test.ts
    - test/model/crud-happy-path.test.ts
  modified:
    - src/model/index.ts

key-decisions:
  - "isSameConfig compara allowedMethods (ordenado) e o validator já construído via JSON.stringify — evita trazer lodash.isequal/fast-deep-equal só para comparar ~2 campos"
  - "validator é construído ANTES do early-return de config existente no constructor, para isSameConfig ter os dados prontos — sem introduzir await entre o check e o registerModel() final (constructor continua síncrono, D-07)"
  - "bulkWrite: retirada da coleta de collection para fora do try/catch, para que MongoatError de D-10 não seja re-embrulhado em MongoError pelo catch pré-existente (D-11, fora de escopo desta fase)"

patterns-established:
  - "Todo novo erro interno de Model/Database usa MongoatError, nunca Error genérico"
  - "Acesso à collection sempre via getCollectionOrThrow(), nunca cast direto `as Collection<T>`"

requirements-completed: [QUAL-01]

coverage:
  - id: D1
    description: "insertMany aguarda pre-hooks assíncronos com Promise.all antes de inserir os documentos"
    requirement: "QUAL-01"
    verification:
      - kind: unit
        ref: "test/model/insertmany-hooks.test.ts#aguarda pre-hook assíncrono antes de persistir — todos os documentos refletem a mutação"
        status: pass
    human_judgment: false
  - id: D2
    description: "find() declara Promise<WithId<ModelType> | null> — sem união síncrona com null nem `?? null` morto"
    requirement: "QUAL-01"
    verification:
      - kind: unit
        ref: "test/model/find-typing.test.ts#assinatura de tipo: find() nunca retorna | null fora da Promise (checado por tsc --noEmit)"
        status: pass
      - kind: other
        ref: "npx tsc --noEmit"
        status: pass
    human_judgment: false
  - id: D3
    description: "getCollectionOrThrow() lança MongoatError tipado quando o Database não está conectado, em vez de TypeError críptico (D-10)"
    requirement: "QUAL-01"
    verification:
      - kind: unit
        ref: "test/model/connection-required.test.ts#método CRUD antes de connect() lança MongoatError descritivo, não TypeError"
        status: pass
    human_judgment: false
  - id: D4
    description: "schemaValidatorBuilder clona o schema com structuredClone antes de mutar — schema compartilhado entre dois models não é mutado"
    requirement: "QUAL-01"
    verification:
      - kind: unit
        ref: "test/model/schema-clone.test.ts#o mesmo objeto de schema usado em dois models permanece intacto após ambas as construções"
        status: pass
    human_judgment: false
  - id: D5
    description: "Registro atômico: new Model() com config igual reaproveita a instância; config divergente lança MongoatError sem despejar o schema (D-06)"
    requirement: "QUAL-01"
    verification:
      - kind: unit
        ref: "test/model/registry-config.test.ts#new Model() com a MESMA config para uma collection já registrada retorna a instância existente"
        status: pass
      - kind: unit
        ref: "test/model/registry-config.test.ts#new Model() com config DIVERGENTE para uma collection já registrada lança MongoatError sem despejar o schema"
        status: pass
    human_judgment: false
  - id: D6
    description: "Happy-path CRUD por método público (insert, find, findMany, findById, update, updateMany, total, aggregate, bulkWrite, delete, deleteMany) contra Mongo real (D-12)"
    requirement: "QUAL-01"
    verification:
      - kind: integration
        ref: "test/model/crud-happy-path.test.ts#encadeia insert → find → findMany → findById → update → updateMany → total → aggregate → bulkWrite → delete → deleteMany"
        status: pass
    human_judgment: false

duration: 35min
completed: 2026-07-07
status: complete
---

# Phase 1 Plan 05: Correção dos bugs de QUAL-01 na camada Model Summary

**Os 4 bugs restantes de QUAL-01 corrigidos em `src/model/index.ts` (insertMany hooks, tipo de find(), mutação de schema, guard de conexão) mais registro atômico de model com detecção de config divergente (D-06) — QUAL-01 fechado.**

## Performance

- **Duration:** ~35 min
- **Started:** 2026-07-07T02:09:00Z (aprox.)
- **Completed:** 2026-07-07T02:19:00Z (aprox.)
- **Tasks:** 3 (cada uma com ciclo RED/GREEN — 6 commits de tarefa + este de metadados)
- **Files modified:** 7 (1 modificado, 6 de teste criados)

## Accomplishments

- `insertMany` aguarda pre-hooks assíncronos com `Promise.all` antes de aplicar `documentDefaults` e inserir — hooks que fazem trabalho assíncrono (ex.: consulta externa) agora bloqueiam corretamente o insert.
- `find()` tem tipo de retorno honesto (`Promise<WithId<ModelType> | null>`), sem a união síncrona `| null` que nunca disparava em runtime.
- Novo helper privado `getCollectionOrThrow()` (D-10): lança `MongoatError('Database not connected — call db.connect() first')` em vez de deixar um `TypeError` críptico do driver estourar quando o Database não está conectado. Reutilizado em `aggregate`, `update`, `updateMany`, `findMany`, `deleteMany`, `insert`, `insertMany`, `find`, `delete`, `total`, `bulkWrite`.
- `schemaValidatorBuilder` clona o schema com `structuredClone` antes de `includeAdditionalPropertiesFalse` mutá-lo — schemas compartilhados entre models (por referência) não vazam mais mutação entre si.
- Registro de model agora é atômico com detecção de config divergente: `isSameConfig()` compara `allowedMethods` e o `validator` já construído; config igual reaproveita a instância registrada, config divergente lança `MongoatError` com apenas o `collectionName` + fato da divergência (nunca o schema, Information Disclosure — T-01-05-01). Constructor permanece 100% síncrono (nenhum `await` introduzido entre o check e `registerModel()`).
- Happy-path CRUD por método público (D-12) travado contra Mongo real via `@testcontainers/mongodb`.
- QUAL-01 fechado — os 5 bugs conhecidos (proxy binding + registry race em plan 04; insertMany hooks + find typing + schema mutation + registry config divergente em plan 05) estão corrigidos e cobertos por regressão.

## Task Commits

Cada task seguiu o ciclo TDD RED (teste falhando) → GREEN (fix), com um commit `test(...)` e um `fix(...)` por task:

1. **Task 1: Corrigir insertMany (Promise.all) e tipo de retorno de find()**
   - `42b06e7` test(01-05): add failing regression tests for insertMany hooks and find() typing
   - `0ce9153` fix(01-05): await insertMany pre-hooks with Promise.all, fix find() return type
2. **Task 2: Helper getCollectionOrThrow (D-10) e clonagem de schema (structuredClone)**
   - `99ade4b` test(01-05): add failing regression tests for D-10 connection guard and schema clone
   - `7e407a2` fix(01-05): add getCollectionOrThrow (D-10) and clone schema before mutating
3. **Task 3: Registro atômico com config divergente (D-06) + happy-path CRUD**
   - `df5872f` test(01-05): add failing regression test for divergent config registration + CRUD happy-path lock-in
   - `8c91cee` fix(01-05): detect divergent model re-registration with isSameConfig (D-06)

**Plan metadata:** (this commit) `docs(01-05): complete Model bug-fix plan`

## Files Created/Modified

- `src/model/index.ts` — insertMany com `Promise.all`; `find()` tipado; helper privado `getCollectionOrThrow()`; `structuredClone` no `schemaValidatorBuilder`; `isSameConfig()` + registro atômico no constructor; fix do bug pré-existente em `delete()`.
- `test/model/insertmany-hooks.test.ts` — regressão do pre-hook assíncrono não aguardado.
- `test/model/find-typing.test.ts` — regressão do tipo de retorno de `find()` (thenable + assinatura exata via tsc).
- `test/model/schema-clone.test.ts` — regressão da mutação de schema compartilhado.
- `test/model/connection-required.test.ts` — regressão do guard de conexão (D-10).
- `test/model/registry-config.test.ts` — regressão da detecção de config divergente (D-06).
- `test/model/crud-happy-path.test.ts` — happy-path CRUD por método público (D-12).

## Decisions Made

- `isSameConfig` compara `allowedMethods` (ordenado) e o `validator` já construído via `JSON.stringify`, em vez de comparar o schema bruto separadamente — o `validator` já embute schema + `validationQueryExpressions`, então uma única comparação cobre ambos os campos sem lib de deep-equal.
- O `validator` é construído no constructor ANTES do early-return de config existente (não depois), para que `isSameConfig` tenha os dados prontos quando `existing` já estiver registrado. Isso não introduz nenhum `await` no meio do caminho — o constructor continua 100% síncrono (D-07).
- Em `bulkWrite`, a obtenção da collection foi movida para fora do bloco `try/catch` — se ficasse dentro, um `MongoatError` do novo guard de D-10 seria capturado pelo `catch` pré-existente e re-embrulhado em `MongoError`, contradizendo o requisito de D-10 (erro tipado e claro) e sem tocar no comportamento do re-wrap em si (D-11, fora de escopo).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Corrigido `delete()` retornando sempre `undefined`**
- **Found during:** Task 3 (happy-path CRUD, D-12)
- **Issue:** `delete()` fazia `const result = await collection.findOneAndDelete(...); return result?.value;`. No driver `mongodb@7`, `findOneAndDelete` resolve o documento diretamente (`WithId<ModelType> | null>`) — não existe mais o wrapper `{ value }` de versões antigas do driver. `result?.value` sempre resolvia para `undefined`, descartando silenciosamente o documento deletado em toda chamada.
- **Fix:** `return collection.findOneAndDelete(filter, options ?? {});` — retorna o resultado do driver diretamente.
- **Files modified:** `src/model/index.ts`
- **Verification:** `test/model/crud-happy-path.test.ts` assert `deleted?.name === 'alpha-updated'` (verde); confirmado via leitura da tipagem do driver em `node_modules/mongodb/mongodb.d.ts`.
- **Committed in:** `7e407a2` (Task 2 commit — fix aplicado junto do `getCollectionOrThrow`, já que ambos tocam o mesmo método)

---

**Total deviations:** 1 auto-fixed (1 bug — Rule 1)
**Impact on plan:** Fix necessário para o próprio objetivo de D-12 (happy-path de `delete` teria falhado silenciosamente sem ele, já que `deleted?.name` seria sempre `undefined`). Não é um dos 4 bugs nomeados no plano, mas está diretamente dentro do escopo do arquivo tocado (`src/model/index.ts`) e do método exercitado pela task. Sem scope creep — nenhuma outra área do código foi tocada.

## Issues Encountered

None — os dois greps + `tsc --noEmit` + suíte completa de testes confirmaram cada fase RED/GREEN conforme esperado. `test/model/find-typing.test.ts` usa uma técnica de "regressão de tipo" (atribuir `model.find.bind(model)` a uma variável com assinatura-alvo exata) para dar um sinal RED real em `tsc --noEmit`, já que o bug original de `find()` não tinha efeito observável em runtime (o `?? null` nunca disparava — `Promise` nunca é nullish), apenas mentia sobre o tipo.

## User Setup Required

None - nenhuma configuração de serviço externo necessária.

## Next Phase Readiness

- QUAL-01 fechado por completo (5/5 bugs conhecidos corrigidos e travados por teste, entre plans 04 e 05).
- `npm run build` ✓, `npx tsc --noEmit` ✓, `npm test` ✓ (10 arquivos / 20 testes, Mongo real via testcontainers).
- Fase 1 (fundação: bugs core + build moderno) está pronta para fechamento — os 5 planos da fase foram executados.
- Nenhum bloqueador novo introduzido. Débitos já conhecidos (CI de `are-the-types-wrong`, versão mínima de MongoDB, hooks pre/post completos) permanecem registrados em STATE.md/REQUIREMENTS.md para as próximas fases.

---
*Phase: 01-funda-o-core-sem-bugs-e-build-moderno*
*Completed: 2026-07-07*

## Self-Check: PASSED

All 8 created/modified files verified present on disk; all 6 task commit hashes (42b06e7, 0ce9153, 99ade4b, 7e407a2, df5872f, 8c91cee) verified in git log.
