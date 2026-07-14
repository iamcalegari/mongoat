---
phase: 06-api-de-schema-com-decorators-tc39
verified: 2026-07-14T12:00:00Z
status: passed
score: 14/14 must-haves verified
behavior_unverified: 0
overrides_applied: 0
mvp_mode_note: "ROADMAP mode é tagueado `mvp`, mas o texto do Goal da fase (\"O dev pode definir schemas com decorators TC39 padrão como alternativa de primeira classe à API de objetos, compilando para a mesma representação interna.\") não está no formato User Story (`As a ..., I want to ..., so that ....`) — gsd_run query user-story.validate retorna valid=false. Esta é uma discrepância de processo/metadado, não uma lacuna de código, já registrada na verificação anterior (2026-07-14T00:15:00Z) e mantida aqui sem refazer o refuse-to-verify — a verificação padrão goal-backward é integralmente aplicável (ROADMAP Success Criteria + PLAN must_haves) e foi conduzida normalmente. Reconciliar retroativamente com `/gsd mvp-phase 6` continua opcional."
re_verification:
  previous_status: gaps_found
  previous_score: 12/14
  gaps_closed:
    - "@Pre no nível de campo transforma só o valor do campo, sem corromper o dado (D-09) — wrapper agora é async e aguarda fn(...) (CR-01), guardado por Object.hasOwn (WR-05)"
    - "Schema.compile de um schema aninhado totalmente opcional produz um ModelValidationSchema utilizável pelo MongoDB (equivalência DECO-03 em caso extremo) — compile() omite a chave required quando o array filtrado é vazio (WR-06)"
  gaps_remaining: []
  regressions: []
gaps: []
human_verification: []
---

# Fase 6: API de schema com decorators (TC39) — Relatório de Verificação

**Phase Goal:** O dev pode definir schemas com decorators TC39 padrão como alternativa de primeira classe à API de objetos, compilando para a mesma representação interna. Feature aditiva pós-v1.0 (minor 1.x).
**Verified:** 2026-07-14T12:00:00Z
**Status:** passed
**Re-verification:** Sim — após fechamento de gaps (plano 06-05, commits 13d2c56/60914a0/2b6e2ce)

## Goal Achievement

Esta é uma RE-VERIFICAÇÃO. A verificação anterior (2026-07-14T00:15:00Z, `status: gaps_found`, 12/14) documentou 2 gaps localizados em `src/schema/compile.ts`. O plano de fechamento `06-05-PLAN.md` executou 3 tarefas TDD (commits `13d2c56`, `60914a0`, `2b6e2ce`) visando fechá-los. Esta rodada re-verifica TODAS as 14 truths empiricamente contra o código atual (HEAD `e0216a8`), com foco reforçado nas 2 que haviam falhado.

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Dev define schema com `@Schema`/`@Prop`/`@BsonType`/`@Description`/`@Optional`/`@Pattern` via decorators TC39 padrão, sem `reflect-metadata` nem `experimentalDecorators` (ROADMAP SC1, DECO-01) | ✓ VERIFIED | `src/schema/decorators.ts`, `src/schema/sugars.ts` exportados via `src/index.ts`; `package.json` dependencies = `{bson, mongodb}` (sem `reflect-metadata`); `tsconfig.json` sem `experimentalDecorators`; suíte completa (`npx vitest run`) re-executada nesta verificação: 45 arquivos / 168 testes, todos verdes |
| 2 | `Schema.compile(cls)` produz um `ModelValidationSchema` byte-a-byte igual ao objeto plano equivalente (ROADMAP SC3, DECO-03) | ✓ VERIFIED | `test/schema/compile-equivalence.test.ts` re-executado verde nesta sessão; `src/schema/compile.ts:43-103` lido linha a linha — clone antes de repassar, sem duplicação de `additionalProperties`/`_id` |
| 3 | `@Prop({type: NestedClass})`/`items: NestedClass` compilam recursivamente; subschema inline aceito verbatim (D-05) | ✓ VERIFIED (agora sem exceção de caso extremo) | `test/schema/nested-compile.test.ts` re-executado verde, incluindo os 2 novos casos WR-06 (classe aninhada totalmente opcional via `type` e via `items`, deep-equal ao objeto plano sem a chave `required`) e o caso de não-regressão (`required` não-vazio permanece emitido) |
| 4 | O construtor do `Model` aceita de forma transparente classe decorada e objeto plano, produzindo o mesmo validator (ROADMAP SC4, DECO-04, D-08) | ✓ VERIFIED | `test/schema/schema-class-or-plain.test.ts` re-executado verde; código lido em `src/model/index.ts` |
| 5 | `@Schema('nome')` fornece `collectionName` default, sobrescrevível pelo config do Model (D-06) | ✓ VERIFIED | `test/schema/schema-class-or-plain.test.ts` re-executado verde |
| 6 | Model construído com classe decorada valida/rejeita documentos contra MongoDB real exatamente como o Model equivalente por objeto plano (DECO-04) | ✓ VERIFIED | `test/schema/decorated-vs-plain-parity.test.ts` (3 testes de integração, testcontainers/MongoDB real) re-executado verde nesta sessão |
| 7 | Inicializador de campo (`createdAt = new Date()`) avaliado FRESCO por insert; precedência doc > documentDefaults > inicializador de classe (D-12/D-13) | ✓ VERIFIED | `test/schema/per-insert-defaults.test.ts` re-executado verde contra MongoDB real; `buildClassDefaults()` (`src/model/index.ts`) instancia a classe fresca por chamada |
| 8 | Campo declarado sem inicializador (`undefined`) não é injetado no documento — falha por `required`, não por serialização de BSON `Undefined` (Pitfall 3) | ✓ VERIFIED | `ownDefinedProperties()` filtra chaves `undefined`; coberto por `per-insert-defaults.test.ts`, re-executado verde |
| 9 | WR-04: hook declarado numa re-registração do mesmo `collectionName` nunca é descartado em silêncio — falha alto com `MODEL_CONFIG_CONFLICT` | ✓ VERIFIED | `test/model/registry-config.test.ts` re-executado verde; `candidateHasHooks` cobre `props.hooks` e hooks decorados |
| 10 | Dev registra hooks no nível da classe via `@Pre`/`@Post` — recebe o `ctx` completo, mesmo contrato do pipeline da Fase 2 (ROADMAP SC2, DECO-02, D-09/D-10) | ✓ VERIFIED | `test/schema/hooks-decorator-order.test.ts` re-executado verde contra MongoDB real; hooks de classe são empurrados sem wrapper (`extractDecoratorHooks` linhas 250-256), portanto não afetados pelo bug do Gap 1 fechado |
| 11 | Ordem de execução determinística: (1) `@Pre` de campo → (2) `@Pre` de classe → (3) hooks do config → (4) `.pre()`/`.post()` encadeados (D-11) | ✓ VERIFIED | `test/schema/hooks-decorator-order.test.ts` re-executado verde; código lido em `src/model/hooks.ts:31-38` — `runPreHooks` continua `for...of` + `await hook(ctx)`, sequencial, sem `Promise.all`; o `await` extra dentro do wrapper de campo (Gap 1 fix) não altera a ordem de registro, só o timing de gravação do valor |
| 12 | `@Pre` de campo transforma **só** o valor do campo, sem transformar o inicializador TC39 e **sem corromper o dado** (D-09) | ✓ VERIFIED (GAP FECHADO) | `src/schema/compile.ts:229-246` lido: o wrapper de `extractDecoratorHooks` agora é `async` e faz `document[field] = await fn(document[field], ctx)`, guardado por `Object.hasOwn(document, field)`. Confirmado empiricamente por `test/schema/field-hook-async.test.ts` re-executado nesta sessão: (a) unit — `ctx.document.password` termina como `'hashed:plain'`, não uma Promise; (b) integração real contra MongoDB — `inserted.password === 'hashed:plain'` (`typeof === 'string'`); (c) campo `required` ausente do doc de entrada continua rejeitado (`MongoatDriverError`), provando que o wrapper não materializa campo ausente |
| 13 | `@Pre` com método inexistente lança `MongoatValidationError`/`INVALID_HOOK_METHOD` já na decoração (D-14) | ✓ VERIFIED | `test/schema/hook-decoration-errors.test.ts` re-executado verde |
| 14 | 9 açúcares (`@BsonType`, `@Description`, `@Pattern`, `@Enum`, `@Min`, `@Max`, `@MinLength`, `@MaxLength`, `@Optional`) compõem `@Prop` por merge, não replace; `@Optional` idempotente independente da ordem textual (D-02/D-04) | ✓ VERIFIED | `test/schema/sugars.test.ts` re-executado verde |

**Score:** 14/14 truths verified (0 falhas)

### Truths adicionais introduzidas pelo plano de fechamento (06-05, DECO-02/DECO-03)

Estas não substituem as 14 acima — são o detalhe de fechamento das truths #3 e #12, incluídas por completude e já refletidas no score acima.

| # | Truth (06-05) | Status | Evidence |
|---|-------|--------|----------|
| G1 | Um `@Pre` de campo com transform ASSÍNCRONO grava no documento o VALOR RESOLVIDO, nunca uma Promise pendente; persiste corretamente contra MongoDB real (CR-01) | ✓ VERIFIED | `test/schema/field-hook-async.test.ts` — unit + integração, re-executados |
| G2 | Um `@Pre` de campo cujo campo está AUSENTE do documento não materializa o campo — `required` do MongoDB continua rejeitando (WR-05) | ✓ VERIFIED | mesmo arquivo, caso "campo AUSENTE... nunca é materializado" (unit) + "segue rejeitado pelo required" (integração) |
| G3 | `Schema.compile` de uma classe decorada aninhada totalmente opcional OMITE `required` quando vazia; aceito pelo `$jsonSchema` do MongoDB em `setupCollection` (WR-06) | ✓ VERIFIED | `test/schema/nested-compile.test.ts` (unit, deep-equal) + `test/schema/all-optional-nested-setup.test.ts` (integração, `setupCollection` real via `type` e via `items`, resolve sem lançar, inserts aceitos) |

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/schema/compile.ts` | `compile`, `compileProperty`, `resolveNestedSchema`, `extractDecoratorHooks` | ✓ VERIFIED | Lido integralmente nesta verificação — `compile()` (linha 101) emite `required` via spread condicional `...(required.length > 0 ? { required } : {})`; `extractDecoratorHooks` (linhas 229-246) usa wrapper `async`/`await` guardado por `Object.hasOwn` |
| `test/schema/field-hook-async.test.ts` | novo — regressão CR-01/WR-05 | ✓ VERIFIED | Existe, 4 testes (2 unit + 2 integração), todos verdes |
| `test/schema/all-optional-nested-setup.test.ts` | novo — integração `setupCollection` WR-06 | ✓ VERIFIED | Existe, 4 testes de integração contra MongoDB real, todos verdes |
| `test/schema/nested-compile.test.ts` | estendido — casos aninhados totalmente opcionais | ✓ VERIFIED | 2 novos casos WR-06 + 1 caso de não-regressão presentes e verdes |
| `scripts/smoke-decorators.mjs` | produção build + execução node real | ✓ VERIFIED | `npm run build` re-executado nesta verificação: build CJS+ESM completo sem erros |

(Demais artefatos da fase — `src/schema/polyfill.ts`, `guards.ts`, `decorators.ts`, `sugars.ts`, `src/types/schema.ts`, barrel exports — inalterados desde a verificação inicial, onde já haviam sido confirmados; não modificados por 06-05, não re-detalhados aqui.)

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `src/schema/compile.ts extractDecoratorHooks` (wrapper de campo) | `src/model/hooks.ts runPreHooks` | `for...of` + `await hook(ctx)` sequencial | ✓ WIRED (order + correção de valor) | Antes: valor correto mas timing quebrado para `fn` async. Agora: `await` no wrapper é aguardado corretamente pelo `runPreHooks` já sequencial — ordem D-11 preservada, valor resolvido antes da gravação. Confirmado por leitura de código + `hooks-decorator-order.test.ts` (ordem) + `field-hook-async.test.ts` (valor) |
| `src/schema/compile.ts compile()` (recursivo via `resolveNestedSchema`) | `$jsonSchema` do MongoDB (`db.setupCollection`) | omissão condicional de `required` | ✓ WIRED | `all-optional-nested-setup.test.ts` confirma que `setupCollection` resolve sem lançar e os inserts subsequentes são aceitos — efeito server-side real, não apenas shape unitário |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| `npm run typecheck` (`tsc --noEmit`) | `npx tsc --noEmit` | exit 0, sem output | ✓ PASS |
| `npm run build` (produção, CJS+ESM) | `npm run build` | build completo, `lib/index.cjs`/`lib/index.mjs`/`.d.ts` gerados sem erro | ✓ PASS |
| Suíte completa (rodada UMA vez nesta verificação) | `npx vitest run` | 45 arquivos / 168 testes, todos verdes (11.88s) | ✓ PASS |
| Debt markers (`TBD`/`FIXME`/`XXX`) nos arquivos modificados por 06-05 | `grep -n -E "TBD\|FIXME\|XXX" src/schema/compile.ts test/schema/field-hook-async.test.ts test/schema/all-optional-nested-setup.test.ts test/schema/nested-compile.test.ts` | nenhum match | ✓ PASS |
| Commits das 3 tarefas de 06-05 existem no histórico | `git log --oneline` | `13d2c56`, `60914a0`, `2b6e2ce` presentes, com diffs correspondentes exatamente ao que a SUMMARY reivindica | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| DECO-01 | 06-01, 06-03 | Dev pode definir schema via decorators TC39 padrão sem reflect-metadata/flags experimentais | ✓ SATISFIED | Truths #1, #14 verificadas; build/runtime gate verificado |
| DECO-02 | 06-04, 06-05 | Dev pode registrar hooks no nível da classe via `@Pre` (e — fechado nesta rodada — `@Pre` de campo não corrompe o dado com transforms assíncronos) | ✓ SATISFIED | Truths #10, #11, #13 (classe) + #12/G1/G2 (campo, gap fechado) todas verificadas empiricamente |
| DECO-03 | 06-01, 06-03, 06-05 | Classes decoradas compilam para o mesmo `ModelValidationSchema`; as duas APIs coexistem como cidadãs de primeira classe (inclusive no caso extremo aninhado-opcional) | ✓ SATISFIED | Truth #2, #3 (agora sem exceção) + G3 (gap fechado, inclusive efeito server-side em `setupCollection`) |
| DECO-04 | 06-02 | Construtor do Model aceita classe decorada ou objeto plano de forma transparente | ✓ SATISFIED | Truths #4, #5, #6, #7, #8, #9 verificadas contra MongoDB real |

Sem requisitos órfãos — DECO-01..04 são o conjunto completo da Fase 6 em `.planning/REQUIREMENTS.md` (linhas 48-51, todas marcadas `[x]`; tabela de status linhas 120-123, todas "Complete"), e todas as 4 estão declaradas no `requirements:` frontmatter de algum plano (06-01..06-05) sem lacunas de mapeamento.

### Anti-Patterns Found

`06-REVIEW.md` foi atualizado após o fechamento de gaps (commit `e0216a8`, "docs(06): update code review report after gap closure (0C/10W/8I)") e confirma independentemente:

| Item | Severidade anterior | Status atual (confirmado nesta verificação por leitura de código) |
|------|---------------------|----------------------------------------------------------------|
| CR-01 (wrapper de campo grava Promise pendente) | Critical | **Fechado** — `src/schema/compile.ts:229-246` é `async`/`await` |
| WR-05 (materialização de campo ausente) | Warning | **Fechado** — guard `Object.hasOwn(document, field)` presente |
| WR-06 (nested `required: []` rejeitado pelo MongoDB) | Warning | **Fechado** — `src/schema/compile.ts:101` spread condicional confirmado |

Nenhum `TBD`/`FIXME`/`XXX` sem referência a follow-up encontrado nos arquivos modificados por 06-05 (verificado via `grep` nesta sessão).

Um novo achado de nível Info surgiu na revisão pós-fechamento (**IN-06**: campo com valor `undefined` EXPLÍCITO — ex.: `insert({ password: undefined })` via spread parcial — ainda materializa via `Object.hasOwn` porque a chave existe com valor `undefined`, potencialmente mascarando `required` nesse caso específico). Este é um edge case DIFERENTE do que o must-have de 06-05 (`campo AUSENTE`) e o próprio WR-05 fechado cobriam — nenhuma truth desta fase ou do plano 06-05 assere o comportamento para `undefined` explícito, então não constitui uma falha de must-have; registrado aqui como item de hardening não-bloqueante para acompanhamento futuro (já capturado no `06-REVIEW.md` atualizado, 0 Critical / 10 Warning / 8 Info).

### Human Verification Required

Nenhum. Todos os achados deste relatório são reprodutíveis via leitura de código, `npx tsc --noEmit`, `npm run build`, `npx vitest run` (suíte completa, 168/168 verde, incluindo os 11 novos testes de 06-05 contra MongoDB real via testcontainers) — nenhuma decisão visual/UX/serviço externo pendente.

### Gaps Summary

Nenhum gap remanescente. Os 2 gaps documentados na verificação anterior (2026-07-14T00:15:00Z) foram fechados pelo plano `06-05`:

1. **Gap 1 (CR-01/WR-05, antes bloqueante)** — confirmado fechado: o wrapper de `@Pre` de campo em `extractDecoratorHooks` agora é `async`, aguarda o transform do dev (`await fn(...)`) antes de gravar `document[field]`, e só grava quando `Object.hasOwn(document, field)` é verdadeiro. Reproduzido empiricamente: um transform assíncrono (`hashPassword`) agora persiste a string resolvida, nunca uma Promise; um campo `required` ausente do documento de entrada continua sendo rejeitado.
2. **Gap 2 (WR-06, edge case)** — confirmado fechado: `compile()` omite a chave `required` quando o array filtrado é vazio, propagando automaticamente para classes aninhadas via `resolveNestedSchema` → `compile` recursivo. Reproduzido empiricamente: `setupCollection` de um Model com classe aninhada totalmente opcional (via `type` e via `items`) resolve sem lançar contra MongoDB real, e inserts com o subdocumento omitido ou com campos opcionais ausentes são aceitos.

A fase 6 está com todas as 14 truths e as 4 requirements (DECO-01..04) verificadas empiricamente. Fase pronta para ser promovida a "Complete" em `.planning/REQUIREMENTS.md` (já refletido nas linhas 48-51/120-123) e para prosseguir ao próximo passo do workflow.

---

*Verified: 2026-07-14T12:00:00Z*
*Verifier: Claude (gsd-verifier)*
