---
phase: 02-sistema-de-hooks-completo-e-api-thin-nativa
plan: 03
subsystem: database
tags: [odm, mongodb, escape-hatch, options-passthrough, typescript]

# Dependency graph
requires:
  - phase: 02-sistema-de-hooks-completo-e-api-thin-nativa
    plan: 01
    provides: HookRegistry pipeline (pre → driver → post), runHooked/executeHooked, ctx.options como mesma referência usada na chamada ao driver
  - phase: 02-sistema-de-hooks-completo-e-api-thin-nativa
    plan: 02
    provides: Semântica de erro assimétrica fechada (pre aborta, post propaga, fireAndForget desvia)
provides:
  - Model.getCollection() — escape hatch honesto que devolve a Collection nativa, bypass total de hooks e gating (D-08/API-02)
  - Database.getClient()/getDb() — MongoClient/Db nativos, sem Proxy a contornar (D-08/API-03)
  - Options passthrough tipado fechado nos 12 métodos, incluindo o fix de Pitfall 4 remanescente em insertMany (D-09/API-01)
  - Confirmação de que os 12 métodos públicos já tinham retorno TS explícito e preciso (API-04) — nenhuma mudança de código necessária
affects: [phase-03-seguranca-e-blindagem, phase-05-decorators, phase-06-plugins]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Model.getCollection() reaproveita getCollectionOrThrow() — fail-loud pré-conexão (D-10) herdado de graça"
    - "getCollection/getClient/getDb deliberadamente FORA do enum METHODS — KModelProxyHandler já os deixa passar sem gating, sem tocar no handler"
    - "insertMany lê postCtx.options (não o parâmetro options original) na chamada ao driver — mesmo padrão dos outros 11 métodos que leem c.options via runHooked"

key-files:
  created:
    - test/model/escape-hatch.test.ts
    - test/database/escape-hatch.test.ts
    - test/model/options-passthrough.test.ts
  modified:
    - src/model/index.ts
    - src/database/index.ts

key-decisions:
  - "Task 3 (API-04, retornos TS explícitos) não exigiu nenhuma mudança de código — auditoria dos 12 métodos confirmou que todos já declaravam Promise<T> preciso e alinhado ao HookContextMap desde a reescrita da Wave 1 (Plan 01), incluindo o gap que o RESEARCH.md apontava (aggregate → Promise<Document[]>). Nenhum commit de Task 3 — apenas confirmação via tsc --noEmit + npm test + npm run build + npm run check:package, todos verdes."
  - "insertMany era o único dos 12 métodos que ainda lia o parâmetro options original (não postCtx.options) na chamada final ao driver — fix pontual de Pitfall 4, committed junto do Task 2 por ser a mesma unidade lógica (auditoria de options passthrough)."
  - "Teste do fix de insertMany usa comportamento real do driver (ordered:false permite que um documento após uma duplicata sobreviva) em vez de spy em Collection — db.collection(name) do driver oficial não é singleton por nome, então um spy no objeto retornado por model.getCollection() não intercepta a chamada interna feita por rawInsertMany() (instâncias de Collection diferentes para o mesmo nome)."

requirements-completed: [API-01, API-02, API-03, API-04]

coverage:
  - id: D8-Model
    description: "model.getCollection() devolve a Collection nativa e bypassa hooks E gating simultaneamente (allowedMethods restrito, INSERT fora da lista, escrita direta na Collection funciona; hook registrado em INSERT não dispara para insertOne feito via getCollection())"
    requirement: "API-02"
    verification:
      - kind: integration
        ref: "test/model/escape-hatch.test.ts#getCollection() retorna a Collection nativa do driver"
        status: pass
      - kind: integration
        ref: "test/model/escape-hatch.test.ts#bypassa o gating de allowedMethods"
        status: pass
      - kind: integration
        ref: "test/model/escape-hatch.test.ts#bypassa o pipeline de hooks"
        status: pass
      - kind: integration
        ref: "test/model/escape-hatch.test.ts#getCollection() reaproveita getCollectionOrThrow()"
        status: pass
    human_judgment: false
  - id: D8-Database
    description: "database.getClient()/getDb() retornam MongoClient/Db nativos; undefined antes de connect(); enum METHODS permanece com 12 membros (escape hatch fora do gating)"
    requirement: "API-03"
    verification:
      - kind: integration
        ref: "test/database/escape-hatch.test.ts#getClient()/getDb() retornam undefined antes de connect()"
        status: pass
      - kind: integration
        ref: "test/database/escape-hatch.test.ts#getClient() retorna a instância nativa de MongoClient após connect()"
        status: pass
      - kind: integration
        ref: "test/database/escape-hatch.test.ts#getDb() retorna a instância nativa de Db conectado após connect()"
        status: pass
      - kind: integration
        ref: "test/database/escape-hatch.test.ts#enum METHODS permanece com 12 membros"
        status: pass
    human_judgment: false
  - id: D9-Options
    description: "Pre-hook que muta ctx.options afeta a chamada real ao driver (limit/projection em findMany); options nativas passadas diretamente na chamada pública têm efeito; insertMany (único método especial-casado) também lê a mutação do pre-hook (ordered:false observável via comportamento real do driver)"
    requirement: "API-01"
    verification:
      - kind: integration
        ref: "test/model/options-passthrough.test.ts#pre-hook que muta ctx.options.limit afeta a chamada real ao driver"
        status: pass
      - kind: integration
        ref: "test/model/options-passthrough.test.ts#pre-hook que muta ctx.options.projection afeta a chamada real ao driver"
        status: pass
      - kind: integration
        ref: "test/model/options-passthrough.test.ts#options nativas passadas diretamente na chamada pública têm efeito observável"
        status: pass
      - kind: integration
        ref: "test/model/options-passthrough.test.ts#pre-hook que muta ctx.options em insertMany chega ao driver"
        status: pass
    human_judgment: false
  - id: D9-Types
    description: "Todos os 12 métodos públicos têm retorno TS explícito e preciso, alinhado ao HookContextMap; typecheck e suíte completa verdes; build tsdown + attw/publint verdes (retornos/options entram nos .d.ts publicados)"
    requirement: "API-04"
    verification:
      - kind: typecheck
        ref: "npx tsc --noEmit"
        status: pass
      - kind: integration
        ref: "npm test (24 arquivos / 67 testes)"
        status: pass
      - kind: build
        ref: "npm run build (tsdown dual CJS/ESM)"
        status: pass
      - kind: build
        ref: "npm run check:package (publint + attw — No problems found, node10/node16-cjs/node16-esm/bundler todos 🟢)"
        status: pass
    human_judgment: false

# Metrics
duration: 15min
completed: 2026-07-07
status: complete
---

# Phase 02 Plan 03: Escape hatch nativo + options passthrough tipado Summary

**`Model.getCollection()`/`Database.getClient()`/`Database.getDb()` fecham o escape hatch honesto (bypass total e deliberado de hooks e gating, fora do enum `METHODS`) e o pipeline de hooks fecha o último ponto remanescente de Pitfall 4 (`insertMany` lendo `postCtx.options`) — os 12 métodos públicos já tinham retorno TS explícito e preciso desde a Wave 1, confirmado sem necessidade de mudança de código.**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-07-07T18:08:00Z
- **Completed:** 2026-07-07T18:23:01Z
- **Tasks:** 3 (2 com commit de código, 1 de auditoria sem diff)
- **Files modified:** 5 (3 novos, 2 modificados)

## Accomplishments
- `src/model/index.ts`: `getCollection()` público — reaproveita `getCollectionOrThrow()` (fail-loud pré-conexão, D-10), JSDoc `@public` com nota de segurança ostensiva do bypass deliberado (D-08). Fix de Pitfall 4 em `insertMany`: a chamada final ao driver agora lê `postCtx.options` em vez do parâmetro `options` original — único ponto remanescente entre os 12 métodos que ainda não lia de `ctx`.
- `src/database/index.ts`: `getClient()`/`getDb()` públicos — getters crus de `kClient`/`kDb`, mesmo padrão de `getCollection()` já existente no arquivo; `Database` nunca é Proxy-wrapped, então já são "escape total" por natureza.
- `test/model/escape-hatch.test.ts`: bypass simultâneo de hooks e gating provado com um model de `allowedMethods` restrito e um hook de `INSERT` registrado — nenhum dos dois dispara para chamadas feitas diretamente na `Collection` retornada.
- `test/database/escape-hatch.test.ts`: `getClient()`/`getDb()` nativos, `undefined` pré-conexão, e reforço de que o enum `METHODS` permanece com 12 membros.
- `test/model/options-passthrough.test.ts`: pre-hook mutando `ctx.options` (limit/projection) afeta `findMany` real; options nativas passadas diretamente têm efeito; `insertMany` com `ordered:false` injetado por pre-hook observável via comportamento real do driver (documento após uma duplicata sobrevive).
- Auditoria de retornos TS (API-04, Task 3): confirmado que os 12 métodos públicos já declaravam `Promise<T>` explícito e preciso, alinhado ao `HookContextMap` canônico — nenhuma mudança de código necessária.

## Task Commits

Each task with code changes was committed atomically:

1. **Task 1: Escape hatch nativo — getCollection (Model) + getClient/getDb (Database)** - `8b6732e` (feat)
2. **Task 2: Options passthrough tipado — pre-hook muta ctx.options e chega ao driver (API-01)** - `7c6408b` (fix)
3. **Task 3: Tipos de retorno precisos e consistentes nos 12 métodos (API-04)** - sem commit (auditoria confirmou que já estava completo desde a Wave 1; ver Deviations)

**Plan metadata:** commit pending (this SUMMARY + STATE/ROADMAP update)

## Files Created/Modified
- `src/model/index.ts` - `getCollection()` público; `insertMany` lê `postCtx.options` na chamada ao driver
- `src/database/index.ts` - `getClient()`/`getDb()` públicos
- `test/model/escape-hatch.test.ts` - API-02 (novo)
- `test/database/escape-hatch.test.ts` - API-03 (novo)
- `test/model/options-passthrough.test.ts` - API-01 (novo)

## Decisions Made
- **Task 3 sem commit de código:** a auditoria dos 12 métodos (comparando assinatura pública, tipo de `options` e tipo de retorno contra o `HookContextMap` canônico de `src/types/hooks.ts`) confirmou que TODOS já tinham retorno TS explícito e preciso (`find`/`update`/`delete`/`findById` → `Promise<WithId<ModelType> | null>`; `findMany` → `Promise<WithId<ModelType>[]>`; `insert` → `Promise<WithId<ModelType> & DefaultProperties>`; `insertMany` → `Promise<InsertManyResult<ModelType>>`; `updateMany` → `Promise<UpdateResult>`; `deleteMany` → `Promise<DeleteResult>`; `total` → `Promise<number>`; `aggregate` → `Promise<Document[]>`; `bulkWrite` → `Promise<BulkWriteResult>`) e o tipo de `options` nativo correto do driver — já herdado da reescrita completa dos 12 métodos na Wave 1 (Plan 01), que precedeu inclusive o gap que o RESEARCH.md apontava (`aggregate` sem `Promise<Document[]>` explícito — já corrigido). `npx tsc --noEmit`, `npm test`, `npm run build` e `npm run check:package` confirmam, todos verdes, sem necessidade de nenhuma edição.
- **insertMany lê `postCtx.options`, não o parâmetro `options` original:** único método especial-casado fora do dispatcher `runHooked`/`executeHooked` — os outros 11 métodos já liam `c.options` (a variante `ctx` passada para `rawFn`) por construção do próprio dispatcher. Como todo `preCtx` por documento compartilha a MESMA referência de `options` (mutação in-place já era visível independente de qual variável fosse lida), o impacto comportamental do fix é nulo para o padrão de mutação já usado em todo o codebase — o fix fecha a inconsistência de estilo/uma futura regra de reassignment e documenta a intenção explicitamente, alinhando `insertMany` ao mesmo padrão dos outros 11 métodos.
- **Teste de `insertMany` usa comportamento real do driver em vez de spy:** `vi.spyOn(model.getCollection(), 'insertMany')` não intercepta a chamada feita internamente por `rawInsertMany()` — o driver oficial (`Db.collection(name)`) não retorna uma instância singleton por nome de collection, então `model.getCollection()` e a `Collection` obtida internamente por `getCollectionOrThrow()` são objetos diferentes (mesma collection lógica no MongoDB, instâncias JS distintas). Resolvido testando o efeito observável do driver: um documento inserido logo após uma duplicata de `_id` só sobrevive no batch se `ordered:false` de fato chegou à chamada real — prova indireta, porém definitiva, de que a mutação do pre-hook chegou ao driver.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `insertMany` lia o parâmetro `options` original em vez de `ctx.options` na chamada final ao driver (Pitfall 4)**
- **Found during:** Task 2 (auditoria dos 12 métodos pedida pela `<action>` da task)
- **Issue:** `postCtx.result = await this.rawInsertMany(_documents, options);` lia a variável `options` (parâmetro público), não `postCtx.options` — inconsistente com os outros 11 métodos, todos que passam por `runHooked`/`executeHooked` e leem `c.options` no `rawFn`. Como cada `preCtx` por documento compartilha a mesma referência de `options`, o impacto comportamental era nulo para mutação in-place (`ctx.options.campo = x`), mas o código não documentava/garantia essa leitura de `ctx` explicitamente — a acceptance_criteria da task ("Toda chamada ao driver dentro do pipeline lê de ctx.options") não estava tecnicamente satisfeita.
- **Fix:** Trocado para `this.rawInsertMany(_documents, postCtx.options)`.
- **Files modified:** `src/model/index.ts`
- **Verification:** `npx vitest run test/model/options-passthrough.test.ts` (teste dedicado que prova a mutação chegando ao driver via comportamento real de `ordered:false`) — 4/4 verde; `npm test` completo — 67/67 verde.
- **Committed in:** `7c6408b` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 — bug/inconsistência descoberta durante a auditoria explicitamente pedida pela própria task; sem scope creep, sem mudança arquitetural)
**Impact on plan:** Nenhum. A mudança fecha exatamente o Pitfall 4 que a task pedia para auditar, sem alterar nenhum comportamento externo observável no caminho comum (mutação in-place já funcionava por acidente de referência compartilhada).

## Issues Encountered
None além do desvio documentado acima.

## User Setup Required
None - nenhuma configuração de serviço externo necessária.

## Next Phase Readiness
- Fase 02 completa: pipeline de hooks pre/post (HOOK-01..05, Plans 01-02) + API thin nativa (API-01..04, Plan 03) — todos os requisitos da fase (HOOK-01..05, API-01..04) cobertos e verificados.
- `Model.getCollection()`/`Database.getClient()`/`getDb()` disponíveis como ponto de extensão para a Fase 3 (segurança/blindagem) documentar o trade-off de bypass como comportamento aceito, não como falha de gating (T-02-01 do threat_model desta fase — já coberto por `escape-hatch.test.ts`).
- Gates de build/distribuição (`npm run build`, `npm run check:package`) verdes — os tipos de retorno/options desta fase já estão consistentes nos `.d.ts` publicados.
- Nenhum bloqueador conhecido para a Fase 3.

---
*Phase: 02-sistema-de-hooks-completo-e-api-thin-nativa*
*Completed: 2026-07-07*

## Self-Check: PASSED
- FOUND: src/model/index.ts, src/database/index.ts, test/model/escape-hatch.test.ts, test/database/escape-hatch.test.ts, test/model/options-passthrough.test.ts
- FOUND commits: 8b6732e (feat), 7c6408b (fix)
