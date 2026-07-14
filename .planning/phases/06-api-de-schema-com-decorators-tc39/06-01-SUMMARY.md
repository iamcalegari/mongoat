---
phase: 06-api-de-schema-com-decorators-tc39
plan: 01
subsystem: api
tags: [typescript, tc39-decorators, symbol-metadata, babel, tsdown, rolldown, oxc, json-schema]

# Dependency graph
requires:
  - phase: 01-fundacao-do-build-e-correcao-de-bugs
    provides: build dual CJS/ESM via tsdown (tsdown.config.mjs, exports map validado)
  - phase: 03-blindagem-testes-e-ci
    provides: MongoatValidationError com .code estável, padrão de guard functions (assertNoWhere), stableStringify (WR-05)
provides:
  - módulo src/schema/ com decorators TC39 @Schema/@Prop (metadata-only, sem reflect-metadata)
  - Schema.compile público — classe decorada → ModelValidationSchema idêntico ao objeto plano (DECO-03)
  - polyfill Symbol.metadata como side-effect (1ª linha de decorators.ts)
  - guard de modo legado assertStandardDecoratorMode (LEGACY_DECORATORS_MODE, D-16)
  - tipo SchemaClass<T> (marker, detecção reflection-free) + FieldMeta interno
  - cadeia de build de produção validada — tsdown + @rolldown/plugin-babel lowera decorators stage-3 e roda em node real
  - suíte vitest habilitada para sintaxe @ ((src|test)/schema/** via mesmo plugin babel)
affects: [06-02, 06-03, 06-04, plugins, migrations]

# Tech tracking
tech-stack:
  added: ["@rolldown/plugin-babel@0.2.3 (dev)", "@babel/core@^7.29.7 (dev)", "@babel/plugin-proposal-decorators@^7.29.7 (dev)", "@types/babel__core (dev)"]
  patterns: ["decorators puramente coletores de metadata via context.metadata/Symbol.metadata", "guard de modo legado na 1ª linha de todo decorator exportado", "clone-antes-de-repassar do metadata compartilhado no compile", "smoke de produção em node real (nunca vitest/esbuild) para gates de build tooling"]

key-files:
  created:
    - src/schema/polyfill.ts
    - src/schema/guards.ts
    - src/schema/decorators.ts
    - src/schema/compile.ts
    - src/types/schema.ts
    - scripts/smoke-decorators.mjs
    - test/schema/compile-equivalence.test.ts
    - test/schema/legacy-mode-guard.test.ts
  modified:
    - tsdown.config.mjs
    - vitest.config.ts
    - tsconfig.json
    - package.json
    - src/schema/index.ts
    - src/index.ts
    - src/types/index.ts
    - src/errors/index.ts

key-decisions:
  - "SCHEMA_METADATA_KEY e compile vivem em compile.ts; FieldMeta/SchemaClass em src/types/schema.ts — decorators.ts importa de compile.ts em direção única, sem ciclo de módulos"
  - "Vite 8 (rolldown-vite) transforma com Oxc, não esbuild — a suíte precisa do MESMO plugin babel do build de produção para lowear decorators em test/schema/**"
  - "getOrInitMeta usa Object.hasOwn (não `in`): metadata de decorator herda do pai via prototype chain; sem own-check uma subclasse mutaria o metadata do pai"
  - "Fixture do smoke usa `?:` em vez de `!:` nos campos decorados — babel re-emite o `!` junto do inicializador injetado e o Oxc rejeita a combinação no re-parse"

patterns-established:
  - "Decorators metadata-only: nenhum decorator retorna inicializador de campo TC39; tudo escreve em context.metadata['mongoat:schema']"
  - "assertStandardDecoratorMode(context) como 1ª linha de todo decorator exportado (falha alto em experimentalDecorators)"
  - "Schema.compile devolve o ModelValidationSchema cru (sem additionalProperties/_id) — responsabilidade do schemaValidatorBuilder não é duplicada"

requirements-completed: [DECO-01, DECO-03]

coverage:
  - id: D1
    description: "Classe decorada com @Schema/@Prop compila via Schema.compile para ModelValidationSchema sem reflect-metadata nem experimentalDecorators"
    requirement: DECO-01
    verification:
      - kind: unit
        ref: "test/schema/compile-equivalence.test.ts#produz um ModelValidationSchema byte-a-byte igual ao objeto plano equivalente"
        status: pass
    human_judgment: false
  - id: D2
    description: "Schema.compile produz schema byte-a-byte igual (stableStringify) ao objeto plano equivalente escrito à mão"
    requirement: DECO-03
    verification:
      - kind: unit
        ref: "test/schema/compile-equivalence.test.ts (5 testes: equivalência, required por padrão, bsonType omitido, INVALID_DECORATED_CLASS, clone do metadata)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Pacote buildado com tsdown importa em node real (CJS e ESM) e classe decorada transpilada pela cadeia de produção executa em node — não apenas sob vitest"
    requirement: DECO-01
    verification:
      - kind: integration
        ref: "node scripts/smoke-decorators.mjs (build + import CJS/ESM + fixture decorada tsdown+babel executada em node real)"
        status: pass
    human_judgment: false
  - id: D4
    description: "Decorator em modo legado (experimentalDecorators, context sem .kind) lança MongoatValidationError LEGACY_DECORATORS_MODE"
    requirement: DECO-01
    verification:
      - kind: unit
        ref: "test/schema/legacy-mode-guard.test.ts (3 testes: assinatura legada de Prop, contexto sem .kind, assinatura legada de Schema)"
        status: pass
    human_judgment: false

# Metrics
duration: 17min
completed: 2026-07-14
status: complete
---

# Phase 6 Plan 01: Fatia-esqueleto decorators TC39 Summary

**Decorators TC39 @Schema/@Prop metadata-only + Schema.compile produzindo ModelValidationSchema byte-a-byte igual ao objeto plano, com a cadeia de build tsdown+babel validada em node real (Pitfall 1 fechado)**

## Performance

- **Duration:** ~17 min (execução; exclui o checkpoint humano de supply-chain)
- **Started:** 2026-07-14T01:56:31Z
- **Completed:** 2026-07-14T02:11:21Z
- **Tasks:** 3 (1 checkpoint blocking-human aprovado + 2 auto, sendo 1 TDD)
- **Files modified:** 18

## Accomplishments

- **Gate crítico de build fechado (Pitfall 1):** `tsdown.config.mjs` registra `@rolldown/plugin-babel` (filtrado a `src/schema/**`, `@babel/plugin-proposal-decorators` `version: '2023-11'`); `scripts/smoke-decorators.mjs` prova em **node real** que o bundle CJS/ESM importa sem SyntaxError e que uma classe decorada consumidor-style transpilada pela MESMA cadeia de produção executa e compila corretamente.
- **@Schema/@Prop metadata-only:** ambos escrevem em `context.metadata['mongoat:schema']` via `Symbol.metadata` (polyfill `??=` de uma linha, sem reflect-metadata); `@Prop` marca required por padrão (D-04), `bsonType` omitido não impõe restrição (D-03); nenhum decorator retorna inicializador de campo.
- **Schema.compile público (D-07/D-15):** estático do símbolo único `Schema`, devolve o `ModelValidationSchema` cru equivalente ao objeto plano (equivalência byte-a-byte provada via stableStringify — DECO-03), com clone do metadata compartilhado (mutação downstream não contamina).
- **Guard de modo legado (D-16):** `assertStandardDecoratorMode` na 1ª linha de todo decorator lança `LEGACY_DECORATORS_MODE`; erros estruturais lançam `INVALID_DECORATED_CLASS` (D-14) — ambos documentados no JSDoc de `MongoatValidationError`.
- **Suíte habilitada para decorators:** vitest (Vite 8/rolldown-vite usa Oxc, que não lowera stage-3) ganhou o mesmo plugin babel filtrado a `(src|test)/schema/**` — semântica de lowering idêntica entre suíte e bundle publicado.

## Task Commits

Each task was committed atomically:

1. **Task 1: Checkpoint supply-chain T-06-SC** — aprovado pelo usuário ("approved"); sem commit (gate sem edição de arquivo). Pré-check registrado: os 3 pacotes apontam para os monorepos oficiais (babel/babel, rolldown/plugins) no registry.
2. **Task 2: Build enablement + polyfill + guard + @Schema/@Prop + smoke** — `4b2f58f` (feat)
3. **Task 3 (TDD RED): testes de equivalência DECO-03 + guard legado** — `43b92e9` (test)
4. **Task 3 (TDD GREEN): Schema.compile + SchemaClass** — `394f621` (feat)

_REFACTOR não foi necessário (GREEN já saiu limpo)._

## TDD Gate Compliance

- RED gate: `43b92e9` (`test(06-01)`) — 5 testes de compile falhando com `Schema.compile is not a function`.
- GREEN gate: `394f621` (`feat(06-01)`) — 8/8 testes de schema verdes.
- Nota: os 3 testes de `legacy-mode-guard.test.ts` já passavam no RED por desenho do plano — o guard foi entregue na Task 2; são regressão, não parte do ciclo RED do compile.

## Files Created/Modified

- `src/schema/polyfill.ts` — side-effect `Symbol.metadata ??= Symbol(...)`; 1ª linha de decorators.ts
- `src/schema/guards.ts` — `assertStandardDecoratorMode` (LEGACY_DECORATORS_MODE)
- `src/schema/decorators.ts` — `@Prop` (canônico, required por padrão) e `@Schema` (marker `kMongoatSchemaClass` + collectionName + INVALID_DECORATED_CLASS se sem campos); `Schema.compile = compile`
- `src/schema/compile.ts` — `compile(cls)` + `SCHEMA_METADATA_KEY`; clone-antes-de-repassar
- `src/schema/index.ts` — barrel do módulo (substituiu o rascunho comentado do autor)
- `src/types/schema.ts` — `SchemaClass<T>` (público) + `FieldMeta` (interno)
- `scripts/smoke-decorators.mjs` — smoke de produção (build → import CJS/ESM → fixture decorada em node real com assert de Schema.compile)
- `test/schema/compile-equivalence.test.ts` — 5 testes (equivalência, D-04, D-03, D-14, clone)
- `test/schema/legacy-mode-guard.test.ts` — 3 testes de guard legado
- `tsdown.config.mjs` — plugin babel filtrado a `src/schema/**`, version '2023-11'
- `vitest.config.ts` — mesmo plugin babel para `(src|test)/schema/**` (Oxc não lowera stage-3)
- `tsconfig.json` — lib ganha `ESNext.Decorators` (tipagem de `context.metadata`)
- `package.json` — 4 devDependencies build-time; `dependencies` inalteradas (só bson + mongodb)
- `src/index.ts` / `src/types/index.ts` — re-exports `Schema`, `Prop`, `SchemaClass` (sem subpaths novos, D-15)
- `src/errors/index.ts` — JSDoc com os novos codes (nenhuma classe nova)
- `.gitignore` — dirs transientes do smoke (`scripts/.smoke-tmp/`, `scripts/.smoke-out/`)

## Decisions Made

- **Layout de módulos sem ciclo:** `SCHEMA_METADATA_KEY` + `compile` em `compile.ts`; `FieldMeta`/`SchemaClass` em `src/types/schema.ts`; `decorators.ts` importa de `compile.ts` em direção única e liga `Schema.compile = compile` (expando de function declaration).
- **`Object.hasOwn` no getOrInitMeta:** metadata de decorators herda do pai via prototype chain; `in` faria subclasses mutarem o metadata da classe pai.
- **`@rolldown/plugin-babel` pinado exato `0.2.3`** (versão aprovada no gate); babel na linha `^7.29.7` (dentro do `^7.29.0` aprovado).
- **Compile exige apenas metadata presente** (não o marker `kMongoatSchemaClass`) para lançar `INVALID_DECORATED_CLASS` — fiel ao Pattern 2 do RESEARCH; classe com `@Prop` sem `@Schema` ainda compila (o caso é fechado pelo próprio `@Schema` que valida campos na decoração).

## Pitfall 1 — status do lowering (registro pedido pelo plano)

- **`src/schema/**` NÃO contém sintaxe `@`** — a lib só *define* as funções-decorator; o plugin babel no build da lib é efetivamente **no-op** hoje (confirmado: bundle idêntico em comportamento; import CJS/ESM ok). Ele permanece registrado como proteção para qualquer arquivo futuro de `src/schema/**` que venha a usar a sintaxe, e o smoke prova a cadeia documentada para consumidores.
- **Status Oxc/tsdown na execução (2026-07-14):** Rolldown/Oxc continuam SEM transform de decorators stage-3 — confirmado empiricamente: a suíte sob Vite 8 (rolldown-vite/Oxc) quebrou com `SyntaxError` até o plugin babel ser adicionado ao `vitest.config.ts`. Re-verificar `oxc-project/oxc#9170` se a fase continuar após 2026-07-27.
- **Gotcha da cadeia babel→oxc:** babel re-emite TS com `!` (definite assignment) junto do inicializador injetado pelo lowering (`name!: string = _init_name(this)`), que o Oxc rejeita no re-parse. Só afeta arquivos que passam por babel E oxc na mesma cadeia (fixture do smoke, futuros arquivos decorados em `src/schema/**`); consumidores com tsc/esbuild não passam por ela. Convenção: usar `?:` (não `!:`) em campos decorados nesses arquivos.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Vitest não lowera decorators — plugin babel adicionado ao vitest.config.ts**
- **Found during:** Task 3 (RED — `SyntaxError: Invalid or unexpected token` no arquivo de teste decorado)
- **Issue:** O plano/RESEARCH assumiam esbuild na suíte ("esbuild JÁ suporta stage-3"), mas Vite 8 é rolldown-vite e transforma com **Oxc**, que não lowera stage-3 — nenhum teste com sintaxe `@` rodava.
- **Fix:** Registrado `@rolldown/plugin-babel` (mesma config do build de produção) em `vitest.config.ts`, filtrado a `(src|test)/schema/**`.
- **Files modified:** vitest.config.ts
- **Verification:** RED passou a falhar pelo motivo certo (`Schema.compile is not a function`); GREEN 8/8; suíte completa 130/130.
- **Committed in:** `43b92e9` (commit RED)

**2. [Rule 1 - Bug] Fixture do smoke com `!:` quebrava o re-parse do Oxc pós-babel**
- **Found during:** Task 2 (primeira execução do smoke)
- **Issue:** babel lowera o decorator injetando inicializador e re-emite o `!` do TS; Oxc rejeita "initializer + definite assignment assertion".
- **Fix:** Campos decorados da fixture usam `?:`; comportamento documentado no próprio script e neste SUMMARY.
- **Files modified:** scripts/smoke-decorators.mjs
- **Verification:** smoke ALL GREEN em node real.
- **Committed in:** `4b2f58f` (commit da Task 2)

**3. [Deviation menor - fronteira de tasks] Assert de `Schema.compile` no smoke movido da Task 2 para a Task 3**
- **Found during:** Task 2 (planejamento da execução)
- **Issue:** O plano pedia que o smoke da Task 2 assertasse o shape de `Schema.compile`, mas `compile` só nasce na Task 3 (TDD) — assertar na Task 2 exigiria implementar antes do RED, violando o ciclo TDD mandado pelo próprio plano.
- **Fix:** Smoke da Task 2 assertou o metadata populado (o gate real de build); no GREEN da Task 3 a fixture ganhou o assert byte-a-byte de `Schema.compile` e o smoke completo foi re-executado verde.
- **Files modified:** scripts/smoke-decorators.mjs
- **Committed in:** `4b2f58f` (parcial) + `394f621` (assert completo)

---

**Total deviations:** 3 (1 blocking/Rule 3, 1 bug/Rule 1, 1 ajuste de fronteira de task)
**Impact on plan:** Nenhum scope creep — os três foram necessários para o objetivo do plano; o fix do vitest é infra que beneficia todos os planos seguintes da fase (06-02/03/04 usam sintaxe `@` em testes).

## Issues Encountered

- `npm install` gravou `^0.2.3` para o plugin — repinado exato `0.2.3` (versão aprovada no gate T-06-SC).
- Deprecação `external` → `deps.neverBundle` na API programática do tsdown (usada no smoke) — atualizado.

## User Setup Required

None - no external service configuration required. (O checkpoint de supply-chain T-06-SC foi aprovado pelo usuário durante a execução.)

## Next Phase Readiness

- Pilha inteira provada ponta-a-ponta (build → node real → compile): planos 06-02 (açúcares + @Pre/@Post), 06-03 (integração Model/D-08) e 06-04 podem construir por cima sem risco de invalidação de build.
- `kMongoatSchemaClass` (marker para detecção no Model) já é gravado pelo `@Schema` e exportado internamente de `decorators.ts` — pronto para o plano de integração.
- `FieldMeta` já reserva `fieldPreHooks`/`classPreHooks` para os decorators de hook do 06-02.
- Convenção para arquivos decorados que passem pela cadeia babel→oxc: campos com `?:`, nunca `!:` (ver Pitfall 1 acima).

## Self-Check: PASSED

- Arquivos criados verificados em disco: src/schema/{polyfill,guards,decorators,compile,index}.ts, src/types/schema.ts, scripts/smoke-decorators.mjs, test/schema/{compile-equivalence,legacy-mode-guard}.test.ts — FOUND
- Commits verificados: 4b2f58f, 43b92e9, 394f621 — FOUND
- Verificação do plano: smoke exit 0; 130/130 testes; typecheck exit 0; lint limpo; `dependencies` = {bson, mongodb}

---
*Phase: 06-api-de-schema-com-decorators-tc39*
*Completed: 2026-07-14*
