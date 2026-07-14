---
phase: 06-api-de-schema-com-decorators-tc39
plan: 05
subsystem: api
tags: [decorators, tc39, json-schema, hooks, mongodb, validation]

# Dependency graph
requires:
  - phase: 06-api-de-schema-com-decorators-tc39 (06-01..06-04)
    provides: extractDecoratorHooks, Schema.compile, @Pre/@Post/@Optional decorators, pipeline de hooks D-11
provides:
  - "@Pre de campo com transform assíncrono persiste o valor resolvido, nunca uma Promise pendente (CR-01)"
  - "@Pre de campo nunca materializa um campo ausente do documento (WR-05)"
  - "Schema.compile omite a chave required quando vazia — subschema aninhado totalmente opcional é aceito pelo $jsonSchema do MongoDB (WR-06)"
affects: [06-VERIFICATION, decorators, schema-compile, hooks]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Wrapper de hook de campo assíncrono guardado por Object.hasOwn(document, field) — nunca materializa campo ausente"
    - "Emissão condicional de chave JSON Schema (spread condicional) em vez de sempre presente com valor vazio"

key-files:
  created:
    - test/schema/field-hook-async.test.ts
    - test/schema/all-optional-nested-setup.test.ts
  modified:
    - src/schema/compile.ts
    - test/schema/nested-compile.test.ts

key-decisions:
  - "O wrapper do @Pre de campo em extractDecoratorHooks virou async e faz `await fn(...)` — runPreHooks (src/model/hooks.ts) já aguarda CADA hook em sequência (for...of + await), então o await extra no wrapper não muda a ordem D-11 (campo → classe → config → encadeado), só corrige o timing de gravação do valor"
  - "A guarda de materialização trocou de `if (document)` para `if (document && Object.hasOwn(document, field))` — Object.hasOwn (não `in`, não truthy check) distingue 'campo ausente' de 'campo presente com valor undefined', preservando a validação required do MongoDB para o caso ausente"
  - "compile() extraiu o array `required` filtrado para uma const e passou a emiti-lo via spread condicional (`...(required.length > 0 ? { required } : {})`) — só compile() precisou mudar porque toda classe aninhada (via type/items) passa por resolveNestedSchema→compile recursivamente; compileProperty e resolveNestedSchema não tocam na chave required, então herdam a correção sem alteração"
  - "No nível raiz o gap WR-06 já era mascarado porque schemaValidatorBuilder (Model) sempre anexa _id a required — só um subschema ANINHADO totalmente opcional expunha required: [] ao $jsonSchema do MongoDB"

patterns-established:
  - "Object.hasOwn(document, field) como guarda padrão para wrappers de hook de campo que não devem materializar campos ausentes"

requirements-completed: [DECO-02, DECO-03]

coverage:
  - id: D1
    description: "@Pre de campo com transform async persiste o valor resolvido (nunca uma Promise pendente)"
    requirement: "DECO-02"
    verification:
      - kind: unit
        ref: "test/schema/field-hook-async.test.ts#ctx.document[field] termina como o valor RESOLVIDO, nunca uma Promise pendente"
        status: pass
      - kind: integration
        ref: "test/schema/field-hook-async.test.ts#um @Pre de campo async persiste o valor resolvido, nunca uma Promise/objeto vazio"
        status: pass
    human_judgment: false
  - id: D2
    description: "@Pre de campo nunca materializa um campo ausente do documento — required do MongoDB continua rejeitando"
    requirement: "DECO-02"
    verification:
      - kind: unit
        ref: "test/schema/field-hook-async.test.ts#campo AUSENTE do documento nunca é materializado (Object.hasOwn guard)"
        status: pass
      - kind: integration
        ref: "test/schema/field-hook-async.test.ts#campo required com @Pre de campo ausente do doc de entrada segue rejeitado pelo required do MongoDB (WR-05)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Schema.compile omite required quando vazio; subschema aninhado totalmente opcional deep-equal ao objeto plano equivalente"
    requirement: "DECO-03"
    verification:
      - kind: unit
        ref: "test/schema/nested-compile.test.ts#WR-06: classe aninhada totalmente opcional via @Prop({ type }) OMITE a chave required (vazia)"
        status: pass
      - kind: unit
        ref: "test/schema/nested-compile.test.ts#WR-06: classe aninhada totalmente opcional via @Prop({ items }) OMITE a chave required (vazia) em items"
        status: pass
      - kind: unit
        ref: "test/schema/nested-compile.test.ts#não-regressão: subschema aninhado com pelo menos um campo required continua emitindo required"
        status: pass
    human_judgment: false
  - id: D4
    description: "setupCollection aceita e usa um schema de classe aninhada totalmente opcional contra MongoDB real (efeito server-side de D3)"
    requirement: "DECO-03"
    verification:
      - kind: integration
        ref: "test/schema/all-optional-nested-setup.test.ts#objeto aninhado presente com campos opcionais omitidos é aceito (via @Prop({ type }))"
        status: pass
      - kind: integration
        ref: "test/schema/all-optional-nested-setup.test.ts#objeto aninhado inteiro omitido é aceito (via @Prop({ type }))"
        status: pass
      - kind: integration
        ref: "test/schema/all-optional-nested-setup.test.ts#array de itens aninhados totalmente opcionais é aceito (via items:)"
        status: pass
    human_judgment: false

# Metrics
duration: 11min
completed: 2026-07-14
status: complete
---

# Phase 06 Plan 05: Fechamento de gaps CR-01/WR-05/WR-06 Summary

**Wrapper de `@Pre` de campo em `extractDecoratorHooks` virou `async` com `await fn(...)` + guarda `Object.hasOwn`, e `Schema.compile` passou a omitir `required` quando vazio — fecha os 2 gaps de 06-VERIFICATION.md (DECO-02, DECO-03).**

## Performance

- **Duration:** 11 min
- **Started:** 2026-07-14T09:25:01-03:00
- **Completed:** 2026-07-14T09:35:34-03:00
- **Tasks:** 3
- **Files modified:** 4 (1 fonte + 3 testes, 2 novos)

## Accomplishments
- `@Pre` de campo com transform assíncrono (ex.: `hashPassword`) agora persiste o valor RESOLVIDO no documento — o wrapper interno em `extractDecoratorHooks` é `async` e faz `document[field] = await fn(document[field], ctx)`, aproveitando que `runPreHooks` já aguarda cada hook em sequência (ordem D-11 preservada)
- `@Pre` de campo nunca materializa mais um campo AUSENTE do documento — guarda `Object.hasOwn(document, field)` no lugar do antigo `if (document)`, preservando a validação `required` do `$jsonSchema` do MongoDB
- `Schema.compile()` omite a chave `required` quando o array filtrado (contra `optionalFields`) é vazio, em vez de sempre emitir `required: []` — subschemas aninhados totalmente opcionais (via `@Prop({ type })` ou `items:`) agora produzem um `$jsonSchema` aceito por `createCollection`/`collMod`
- 11 testes novos cobrindo os 2 gaps (unit + integração contra MongoDB real via testcontainers), suíte completa sobe de 157 para 168 testes, todos verdes

## Task Commits

Each task was committed atomically:

1. **Task 1: @Pre de campo aguarda transform async + guarda campo ausente (Gap 1 — CR-01/WR-05)** - `13d2c56` (fix)
2. **Task 2: compile() omite `required` vazio + testes unitários de classe aninhada totalmente opcional (Gap 2 — WR-06)** - `60914a0` (fix)
3. **Task 3: Teste de integração — setupCollection aceita classe aninhada totalmente opcional contra Mongo real (Gap 2 — WR-06)** - `2b6e2ce` (test)

**Plan metadata:** (this commit — docs: complete 06-05 plan)

## Files Created/Modified
- `src/schema/compile.ts` - wrapper do `@Pre` de campo em `extractDecoratorHooks` virou `async`/`await` com guarda `Object.hasOwn`; `compile()` emite `required` via spread condicional
- `test/schema/field-hook-async.test.ts` (novo) - unit + integração do `@Pre` de campo async e da guarda de campo ausente
- `test/schema/nested-compile.test.ts` - casos de classe aninhada totalmente opcional (via `type` e `items`) e caso de não-regressão com `required` não-vazio
- `test/schema/all-optional-nested-setup.test.ts` (novo) - integração de `setupCollection` contra MongoDB real com classe aninhada totalmente opcional

## Decisions Made
- `runPreHooks` (`src/model/hooks.ts`) já aguardava cada hook em sequência (`for...of` + `await hook(ctx)`) — tornar o wrapper de campo `async` foi suficiente para corrigir o timing sem tocar em nenhum outro ponto do pipeline de hooks
- `Object.hasOwn(document, field)` escolhido em vez de `field in document` ou truthy check — distingue precisamente "campo nunca escrito" de "campo presente com `undefined`", que é a semântica exigida pela validação `required` do MongoDB
- Só `compile()` precisou mudar para fechar WR-06 — `compileProperty`/`resolveNestedSchema` não tocam na chave `required`; toda classe aninhada roteia de volta por `resolveNestedSchema` → `compile` recursivo, herdando a correção automaticamente
- Nos testes de integração da Task 3, o campo aninhado no NÍVEL DO PAI (`profile`/`tags`) também precisou de `@Optional()` para provar que o objeto aninhado inteiro pode ser omitido do documento — o gap WR-06 em si é sobre a chave `required` DENTRO do subschema aninhado (campos como `nickname`/`age`), uma camada distinta da obrigatoriedade do campo pai

## Deviations from Plan

None - plan executado exatamente como escrito. Os 3 testes de integração da Task 3 precisaram de `@Optional()` no campo pai (`profile`/`tags`) — ajuste de design de teste dentro do escopo já previsto no `<action>` da tarefa ("inserir... um documento omitindo o objeto aninhado inteiro"), não uma mudança de código de produção.

## Issues Encountered
None.

## User Setup Required
None - nenhuma configuração de serviço externo necessária.

## Next Phase Readiness
- Os 2 gaps de `06-VERIFICATION.md` (truths 1/2 e 3, associados a DECO-02 e DECO-03) estão fechados com correção + teste de regressão + prova de integração contra MongoDB real
- Recomenda-se re-rodar `/gsd-verify-work` (ou o verifier) sobre a Fase 6 para promover os 2 must-haves pendentes a ✓ (14/14) e fechar formalmente a fase
- `npm test` (168/168), `npm run typecheck` e `npm run build` verdes — nenhuma regressão na ordem de hooks D-11 nem na equivalência DECO-03 dos shapes já cobertos por `06-01..06-04`

---
*Phase: 06-api-de-schema-com-decorators-tc39*
*Completed: 2026-07-14*

## Self-Check: PASSED

All created/modified files found on disk; all 3 task commits (13d2c56, 60914a0, 2b6e2ce) found in git log.
