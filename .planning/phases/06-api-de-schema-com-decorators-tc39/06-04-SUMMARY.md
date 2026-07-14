---
phase: 06-api-de-schema-com-decorators-tc39
plan: 04
subsystem: api
tags: [typescript, tc39-decorators, hooks, json-schema, mongodb]

# Dependency graph
requires:
  - phase: 06-02
    provides: Model constructor aceita `schema: ModelValidationSchema | SchemaClass<T>` transparentemente; `this.schemaClass` guardado no Model; `candidateHasHooks`/WR-04 deixado extensível para hooks decorados
  - phase: 06-03
    provides: FieldMeta com `fieldPreHooks`/`classPreHooks` já previstos no shape; padrão de decorator puramente-de-metadata (nenhum retorna um novo inicializador TC39)
provides:
  - "`@Pre(method, fn)` — classe (D-09, ctx completo) e campo (D-09, açúcar `(value, ctx) => novoValor`, NUNCA transforma o inicializador TC39 do campo)"
  - "`@Post(method, fn)` — só classe (D-10); em campo lança `MongoatValidationError`"
  - "`assertKnownHookMethod` (`src/schema/guards.ts`) — `INVALID_HOOK_METHOD` na DECORAÇÃO (D-14), não no compile/construção do Model"
  - "`extractDecoratorHooks(cls)` (interno, `src/schema/compile.ts`) — normaliza hooks decorados para o formato `HookFn` do pipeline da Fase 2; `@Pre` de campo embrulhado num hook que muta `ctx.document[field]`"
  - "Model constructor: hooks decorados registrados em `this.hooks[method].pre/.post` na ordem D-11 (campo → classe → config → encadeado), ANTES de `props.hooks`"
  - "WR-04 fechado por completo: `candidateHasHooks` agora também cobre hooks decorados (`@Pre`/`@Post`) — re-registração de `collectionName` existente com hook decorado lança `MODEL_CONFIG_CONFLICT`"
affects: [plugins, migrations, documentation]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "decorator aplicável a classe E campo via um único parâmetro de contexto union (`ClassDecoratorContext | ClassFieldDecoratorContext`), discriminado em runtime por `context.kind` — evita duas funções exportadas separadas para o mesmo conceito (`@Pre`)"
    - "hook decorado NUNCA usa o mecanismo de field-initializer TC39 — é sempre embrulhado num `HookFn` e empurrado para o MESMO pipeline (`this.hooks[method].pre/.post`) que `props.hooks`/`.pre()`/`.post()` já usam, preservando um único caminho de dispatch"
    - "ordem determinística de hooks garantida por ORDEM DE PUSH (nunca por prioridade/peso) — extractDecoratorHooks já devolve `pre` pré-ordenado (campo antes de classe), e o constructor do Model empurra esse array ANTES do loop de `props.hooks`"

key-files:
  created:
    - test/schema/hooks-decorator-order.test.ts
    - test/schema/hook-decoration-errors.test.ts
  modified:
    - src/schema/guards.ts
    - src/schema/decorators.ts
    - src/schema/compile.ts
    - src/schema/index.ts
    - src/index.ts
    - src/errors/index.ts
    - src/model/index.ts
    - src/types/schema.ts

key-decisions:
  - "`Pre`/`Post` tipam `fn` como `(...args: unknown[]) => unknown` (mesmo shape já estabelecido em `FieldMeta` desde o 06-01) em vez de overloads separados por posição (classe vs campo) — uma função com aridade menor/maior é livremente atribuível a essa assinatura variádica, então o dev pode escrever `(ctx) => {...}` (classe) ou `(value, ctx) => {...}` (campo) sem cast nenhum no call-site; tipar o parâmetro do CORPO da função exige um cast interno (`ctx as {...}`), aceito como o mesmo padrão de `unknown`+cast já pervasivo no módulo de decorators"
  - "`@Post` aplicado a um campo lança com o `code` DEFAULT de `MongoatValidationError` (`VALIDATION_FAILED`), não um código novo — o plano só exige documentar `INVALID_HOOK_METHOD` em `src/errors/index.ts` ('nenhuma classe nova'); inventar mais um `code` não documentado seria escopo além do especificado"
  - "`extractDecoratorHooks` embrulha `@Pre` de campo com um NO-OP silencioso quando `ctx.document` está ausente (método sem documento, ex.: `find`/`delete`) — em vez de lançar, já que o dev pode legitimamente reaproveitar o mesmo `method` string em métodos sem `document`; a falha catastrófica que este plano existe para prevenir é o hook nunca disparar OU disparar fora de ordem, não um no-op inofensivo"

patterns-established:
  - "Todo hook decorado (`@Pre`/`@Post`) é SÓ MAIS UMA PORTA DE REGISTRO no pipeline pré-existente da Fase 2 — nenhum decorator desta fase introduziu um dispatch novo; `runPreHooks`/`runPostHooks` (`src/model/hooks.ts`) seguem sendo o único ponto de execução de hooks do Model, decorados ou não"

requirements-completed: [DECO-02]

coverage:
  - id: D1
    description: "Dev registra hooks no nível da classe via @Pre('metodo', fn) — recebe o ctx completo (mesmo contrato do pipeline da Fase 2)"
    requirement: DECO-02
    verification:
      - kind: integration
        ref: "test/schema/hooks-decorator-order.test.ts#ordem de execução no insert é campo → classe → config → encadeado (D-11); @Pre de campo transforma o valor persistido; @Pre de classe vê o ctx completo"
        status: pass
    human_judgment: false
  - id: D2
    description: "@Pre no nível de campo é açúcar que transforma só o valor do campo ((value, ctx) => novoValor), registrado no pipeline de hooks existente sem transformar o inicializador TC39"
    requirement: DECO-02
    verification:
      - kind: integration
        ref: "test/schema/hooks-decorator-order.test.ts#ordem de execução no insert é campo → classe → config → encadeado (D-11); @Pre de campo transforma o valor persistido; @Pre de classe vê o ctx completo"
        status: pass
    human_judgment: false
  - id: D3
    description: "@Post no nível da classe é incluído e simétrico ao @Pre de classe; @Post por campo não existe (D-10)"
    requirement: DECO-02
    verification:
      - kind: integration
        ref: "test/schema/hooks-decorator-order.test.ts#ordem de execução no insert é campo → classe → config → encadeado (D-11); @Pre de campo transforma o valor persistido; @Pre de classe vê o ctx completo"
        status: pass
      - kind: unit
        ref: "test/schema/hook-decoration-errors.test.ts#@Post aplicado a um CAMPO lança MongoatValidationError (post por campo não tem semântica clara — D-10)"
        status: pass
    human_judgment: false
  - id: D4
    description: "A ordem de execução por método é determinística: (1) @Pre de campo → (2) @Pre de classe → (3) hooks do config do Model → (4) .pre()/.post() encadeados (D-11)"
    requirement: DECO-02
    verification:
      - kind: integration
        ref: "test/schema/hooks-decorator-order.test.ts#ordem de execução no insert é campo → classe → config → encadeado (D-11); @Pre de campo transforma o valor persistido; @Pre de classe vê o ctx completo"
        status: pass
    human_judgment: false
  - id: D5
    description: "@Pre com um método inexistente estoura MongoatValidationError com code INVALID_HOOK_METHOD na DECORAÇÃO (stack aponta a linha da classe) (D-14)"
    requirement: DECO-02
    verification:
      - kind: unit
        ref: "test/schema/hook-decoration-errors.test.ts#@Pre com um método inexistente lança MongoatValidationError com code INVALID_HOOK_METHOD já na decoração"
        status: pass
      - kind: unit
        ref: "test/schema/hook-decoration-errors.test.ts#@Post com um método inexistente lança MongoatValidationError com code INVALID_HOOK_METHOD já na decoração"
        status: pass
    human_judgment: false
  - id: D6
    description: "Um hook @Pre declarado numa classe decorada re-registrada para um collectionName existente falha alto (MODEL_CONFIG_CONFLICT), não é descartado em silêncio (WR-04)"
    requirement: DECO-02
    verification:
      - kind: unit
        ref: "test/schema/hook-decoration-errors.test.ts#re-registrar classe decorada com @Pre sobre collectionName existente lança MODEL_CONFIG_CONFLICT"
        status: pass
    human_judgment: false

# Metrics
duration: 6min
completed: 2026-07-13
status: complete
---

# Phase 6 Plan 04: Hooks declarativos via decorators (@Pre/@Post) Summary

**`@Pre`/`@Post` na classe e `@Pre` de campo (transformação de valor tipo hashPassword) registram hooks no pipeline pré-existente da Fase 2 com ordem determinística campo→classe→config→encadeado (D-11), fechando DECO-02 e o WR-04 restante (hooks decorados nunca descartados em silêncio numa re-registração)**

## Performance

- **Duration:** ~6 min
- **Started:** 2026-07-13T23:53:09-03:00 (commit RED)
- **Completed:** 2026-07-13T23:54:27-03:00 (commit GREEN da Task 3)
- **Tasks:** 3 (1 TDD RED + 2 auto/GREEN)
- **Files modified:** 10 (2 test novos, 8 src)

## Accomplishments

- **`@Pre` unificado classe+campo (D-09):** uma única função exportada, discriminada em runtime por `context.kind` — no nível de CLASSE recebe o `ctx` completo (mesmo contrato de `.pre()`/`props.hooks`); no nível de CAMPO é um açúcar `(value, ctx) => novoValor` que NUNCA usa o mecanismo de field-initializer do TC39, apenas registra metadata (`meta.fieldPreHooks`) consumida depois pelo wiring do Model.
- **`@Post` simétrico só-de-classe (D-10):** grava em `meta.classPostHooks`; aplicado a um campo lança `MongoatValidationError` imediatamente (post por campo não tem semântica clara — não há um "valor de campo" simétrico ao resultado de uma operação inteira).
- **`INVALID_HOOK_METHOD` na decoração, não no compile (D-14):** `assertKnownHookMethod` (`src/schema/guards.ts`) valida `method` contra o enum `METHODS` já quando `@Pre`/`@Post` roda — um nome de método com erro de digitação estoura com a stack apontando para a linha exata da classe, em vez de registrar um hook que nunca dispara.
- **`extractDecoratorHooks` — hooks decorados normalizados para o pipeline existente:** `@Pre` de campo é embrulhado num `HookFn` que aplica `ctx.document[field] = fn(ctx.document[field], ctx)` (no-op silencioso quando o método não tem `ctx.document`, ex. `find`); `pre` já sai PRÉ-ORDENADO (campo antes de classe) — o `Model` só precisa fazer `push` na ordem recebida.
- **Ordem D-11 fixada por ORDEM DE PUSH no constructor do Model:** hooks decorados são registrados em `this.hooks[method].pre/.post` ANTES do loop de `props.hooks` (que por sua vez sempre roda antes de qualquer `.pre()`/`.post()` chamado pelo dev depois que o constructor retorna) — prova contra Mongo real: `['field', 'class', 'config', 'chained']`.
- **WR-04 fechado por completo:** `candidateHasHooks` (deixado extensível pelo Plano 06-02) agora TAMBÉM considera `decoratedHooks.pre`/`decoratedHooks.post` — uma classe decorada com `@Pre`/`@Post` re-registrada para um `collectionName` já existente falha alto com `MODEL_CONFIG_CONFLICT` em vez de ter o hook silenciosamente descartado (o pior tipo de bug de segurança — ex. um `@Pre('insert', hashPassword)` que simplesmente para de rodar).

## Task Commits

Each task was committed atomically:

1. **Task 1 (TDD RED): testes de ordem de hooks (D-11) e erros de decoração (D-14)** — `59337d3` (test)
2. **Task 2: @Pre (classe+campo) e @Post (classe) + guard INVALID_HOOK_METHOD** — `a3e66d8` (feat)
3. **Task 3: wiring de hooks decorados no Model com ordem D-11 + WR-04 estendido** — `ce80dcd` (feat)

_REFACTOR não foi necessário (GREEN de cada task saiu limpo — Task 2 focou em decorators/guard, Task 3 focou em extração/wiring, sem sobreposição)._

## TDD Gate Compliance

- RED gate: `59337d3` (`test(06-04)`) — 5 testes novos (1 em `hooks-decorator-order.test.ts`, 4 em `hook-decoration-errors.test.ts`) falhando pelo motivo certo: `TypeError: Pre is not a function` / `Post is not a function` (decorators ainda não existiam), verificado explicitamente reaplicando a implementação DEPOIS de confirmar o RED (`git checkout -- <arquivos de implementação>` → rodar suíte → RED confirmado → reaplicar patch).
- GREEN gate: `a3e66d8` (Task 2 — decorators + guard) + `ce80dcd` (Task 3 — wiring + WR-04). Suíte completa 157/157 verde ao final da Task 3.

## Files Created/Modified

- `src/schema/guards.ts` — `assertKnownHookMethod(method)` (D-14, `INVALID_HOOK_METHOD`)
- `src/schema/decorators.ts` — `Pre(method, fn)` (classe: `meta.classPreHooks`; campo: `meta.fieldPreHooks`); `Post(method, fn)` (classe: `meta.classPostHooks`; campo: lança)
- `src/schema/compile.ts` — `extractDecoratorHooks(cls)` (interno): normaliza hooks decorados para `HookFn` do pipeline; `@Pre` de campo embrulhado numa mutação de `ctx.document[field]`
- `src/schema/index.ts` / `src/index.ts` — barrel reexporta `Pre`, `Post` (D-15, sem subpaths novos)
- `src/errors/index.ts` — JSDoc de `MongoatValidationError` documenta `INVALID_HOOK_METHOD`
- `src/model/index.ts` — constructor extrai `decoratedHooks` ANTES do branch de re-registro; registra `pre`/`post` decorados em `this.hooks[method]` ANTES de `props.hooks`; `candidateHasHooks` estendido para cobrir hooks decorados (WR-04)
- `src/types/schema.ts` — `FieldMeta.classPostHooks` (fora do `files_modified` original do plano — ver Deviations)
- `test/schema/hooks-decorator-order.test.ts` (novo) — 1 teste de integração (Mongo real): ordem D-11 completa + transformação de valor + ctx completo no hook de classe + `@Post` disparado
- `test/schema/hook-decoration-errors.test.ts` (novo) — 4 testes unitários: `INVALID_HOOK_METHOD` em `@Pre`/`@Post`, `@Post` em campo lança, WR-04 estendido

## Decisions Made

- **`Pre`/`Post` reaproveitam o mesmo `(...args: unknown[]) => unknown` já estabelecido em `FieldMeta` (06-01)** em vez de overloads por posição — evita a armadilha de contravariância estrita do TypeScript (uma função com parâmetro `ctx: unknown` NÃO é atribuível como alvo de uma função dev-escrita com parâmetro `ctx: TipoConcreto`); o dev tipa/faz cast dentro do CORPO da função livremente, sem erro de compilação no call-site do decorator.
- **`@Post` em campo usa o `code` DEFAULT (`VALIDATION_FAILED`)** em vez de um código dedicado — o plano só pede para documentar `INVALID_HOOK_METHOD` em `src/errors/index.ts` ("nenhuma classe nova"); um código extra não especificado seria escopo além do pedido.
- **`extractDecoratorHooks` nunca lança para `cls` sem metadata Mongoat** — devolve `{ pre: [], post: [] }` — o `Model` chama incondicionalmente para qualquer `schema` que seja uma função, sem precisar checar de antemão "é uma classe decorada completa?".

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical functionality] `FieldMeta` sem `classPostHooks`**
- **Found during:** Task 2 (implementação de `@Post`)
- **Issue:** O plano listava `src/types/schema.ts` implicitamente (via "FieldMeta com fieldPreHooks/classPreHooks já previstos no shape" no `read_first`), mas não no `files_modified` da Task 2/3 — `@Post` precisa de um terceiro array (`classPostHooks`, distinto de `classPreHooks`) que não existia no shape herdado do 06-01
- **Fix:** Adicionado `classPostHooks: { method: string; fn: (...args: unknown[]) => unknown }[]` a `FieldMeta`, inicializado em `getOrInitMeta` — mesmo padrão dos campos irmãos já existentes
- **Files modified:** src/types/schema.ts
- **Verification:** `npm run typecheck` exit 0; `hooks-decorator-order.test.ts` (parte `@Post`) e `hook-decoration-errors.test.ts` (parte "@Post aplicado a um CAMPO") verdes
- **Committed in:** `a3e66d8` (commit da Task 2)

---

**Total deviations:** 1 (Rule 2, tipagem — mesma classe de ajuste do 06-03 com `JSONSchema4Subset`)
**Impact on plan:** Nenhum scope creep — extensão aditiva de uma interface `@internal` já vendorizada, necessária para o próprio `@Post` (exigido pelo plano) ter onde gravar sua metadata.

## Issues Encountered

None. A única atenção extra foi confirmar RED de verdade (não apenas descritivamente): os arquivos de implementação foram revertidos para `HEAD` via `git checkout -- <arquivos>` (não um `git stash`, que a política deste executor proíbe), a suíte rodou e falhou com `TypeError: Pre/Post is not a function` (motivo certo), e só então o patch de implementação foi reaplicado via `git apply` antes de seguir para as Tasks 2/3.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- API de decorators TC39 (`@Schema`, `@Prop`, açúcares, `@Optional`, `@Pre`, `@Post`) está com paridade completa em relação à API de objetos (schema E hooks) — DECO-01/02/03/04 fechados nesta fase.
- `extractDecoratorHooks` é `@internal` (não re-exportado no barrel público) — qualquer fase futura que precise introspeccionar hooks decorados deve importar de `@/schema/compile` diretamente, mesmo padrão de `kMongoatSchemaClass` (import direto de módulo interno, não do barrel `@/schema`).
- Hidratação recursiva de defaults/hooks para classes decoradas ANINHADAS (`@Prop({ type: OutraClasse })`) permanece fora de escopo (decisão já registrada no 06-02-SUMMARY.md/06-03-SUMMARY.md, reafirmada aqui) — só hooks do NÍVEL RAIZ da classe passada a `schema:` são extraídos/registrados.
- Suíte completa (157/157), `npm run typecheck`/`npm run build`/`npm run lint`/`npm run check:package` (attw) todos verdes — nenhuma regressão na API de objetos (`test/model/hooks-*.test.ts` sem mudança de comportamento).

## Self-Check: PASSED

- Arquivos verificados em disco: src/schema/guards.ts, src/schema/decorators.ts, src/schema/compile.ts, src/schema/index.ts, src/index.ts, src/errors/index.ts, src/model/index.ts, src/types/schema.ts, test/schema/{hooks-decorator-order,hook-decoration-errors}.test.ts — FOUND
- Commits verificados: 59337d3, a3e66d8, ce80dcd — FOUND
- Verificação do plano: suíte completa 157/157 verde; `npm run typecheck` exit 0; `npm run build` verde (CJS+ESM); `npm run lint` limpo; `npm run check:package` (attw) sem problemas (node10/node16 CJS/node16 ESM/bundler todos 🟢)

---
*Phase: 06-api-de-schema-com-decorators-tc39*
*Completed: 2026-07-13*
