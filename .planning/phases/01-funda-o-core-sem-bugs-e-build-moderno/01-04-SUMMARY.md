---
phase: 01-funda-o-core-sem-bugs-e-build-moderno
plan: 04
subsystem: database
tags: [proxy, mongodb, error-handling, testing, vitest]

requires:
  - phase: 01-funda-o-core-sem-bugs-e-build-moderno
    provides: "MongoatError base class (Plan 01), infra de teste com MongoDB real via testcontainers (Plan 03)"
provides:
  - "KModelProxyHandler.get corrigido — bind sempre ao target, guard de allowedMethods preservado, agora lança MongoatError"
  - "Database.defineModel() (deprecated) sem duplo-Proxy"
  - "Model constructor retorna a instância já registrada/proxied em vez do `this` cru"
  - "kGetDbName síncrono, sem fallback silencioso para 'mongoat-test'; lança MongoatError quando nenhum dbName está configurado"
  - "Database.resetRegistry() (@internal) para limpar o KModelMap em suítes de teste"
affects: [01-05, database, model, testing]

tech-stack:
  added: []
  patterns:
    - "Proxy get trap: sempre `value.bind(target)`, nunca `.bind(receiver)`, para não reentrar no trap em chamadas internas (this.outroMetodo())"
    - "Erros de configuração/guard da lib usam MongoatError, nunca Error genérico ou fallback silencioso"

key-files:
  created:
    - test/database/proxy-binding.test.ts
    - test/database/dbname-required.test.ts
    - test/database/registry-reset.test.ts
  modified:
    - src/database/index.ts
    - src/model/index.ts

key-decisions:
  - "defineModel() corrigido (não apenas documentado como known-issue) — reaproveita a instância já registrada em Database[KModelMap] em vez de embrulhar num segundo Proxy"
  - "Model constructor passou a `return` explicitamente a instância registrada/proxied por registerModel(), corrigindo um 6º bug de binding não listado no QUAL-01 original: sem esse fix, new Model() na primeira construção devolvia o `this` cru (sem guard), só a segunda chamada para o mesmo collectionName (que cai no early-return via getModel) devolvia o Proxy"
  - "kGetUrlAndDbName deixou de ser async (não há mais nenhum await dentro dele após kGetDbName virar síncrono)"

patterns-established:
  - "Regressão de bugs de Proxy/guard testada com MongoDB real (testcontainers), nunca mockada — segue D-13"

requirements-completed: [QUAL-01]

coverage:
  - id: D1
    description: "KModelProxyHandler vincula métodos ao target (nunca ao receiver); chamadas internas (findById → this.find) não reentram no trap; guard de allowedMethods continua lançando (agora MongoatError)"
    requirement: QUAL-01
    verification:
      - kind: unit
        ref: "test/database/proxy-binding.test.ts#vincula métodos ao target: chamada interna (findById → this.find) não reentra no guard do Proxy"
        status: pass
      - kind: unit
        ref: "test/database/proxy-binding.test.ts#acessar diretamente um método fora de allowedMethods ainda lança MongoatError (guard preservado)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Guard de allowedMethods lança MongoatError tanto via new Model() direto quanto via Database.defineModel() (deprecated), e defineModel() não produz mais duplo-Proxy"
    requirement: QUAL-01
    verification:
      - kind: unit
        ref: "test/database/proxy-binding.test.ts#método não permitido lança MongoatError via new Model() direto"
        status: pass
      - kind: unit
        ref: "test/database/proxy-binding.test.ts#método não permitido lança MongoatError via Database.defineModel() (deprecated)"
        status: pass
      - kind: unit
        ref: "test/database/proxy-binding.test.ts#defineModel() não produz duplo-Proxy — método permitido funciona com this correto"
        status: pass
    human_judgment: false
  - id: D3
    description: "kGetDbName (via connect()) usa MONGODB_DB_NAME do env, cai para config.dbName, e lança MongoatError descritivo (sem dump de config) quando nenhum dos dois está configurado — sem fallback silencioso para 'mongoat-test'"
    requirement: QUAL-01
    verification:
      - kind: unit
        ref: "test/database/dbname-required.test.ts#usa MONGODB_DB_NAME do ambiente quando presente"
        status: pass
      - kind: unit
        ref: "test/database/dbname-required.test.ts#usa config.dbName quando MONGODB_DB_NAME não está no ambiente"
        status: pass
      - kind: unit
        ref: "test/database/dbname-required.test.ts#lança MongoatError descritivo quando nenhum dbName está configurado (sem fallback silencioso)"
        status: pass
    human_judgment: false
  - id: D4
    description: "Database.resetRegistry() (@internal) limpa o KModelMap estático — getModel() retorna undefined após o reset"
    requirement: QUAL-01
    verification:
      - kind: unit
        ref: "test/database/registry-reset.test.ts#limpa o KModelMap: getModel retorna undefined para models registrados antes do reset"
        status: pass
    human_judgment: false

duration: 12min
completed: 2026-07-07
status: complete
---

# Phase 1 Plan 04: Fix do Proxy binding, dbName sem fallback e reset do registry Summary

**KModelProxyHandler agora vincula métodos ao `target` (nunca ao `receiver`), `defineModel()` deixou de dar duplo-Proxy, `kGetDbName` lança `MongoatError` em vez de cair silenciosamente para `mongoat-test`, e `Database.resetRegistry()` (@internal) permite isolar o registry entre testes.**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-07-07T04:49:00Z (aprox.)
- **Completed:** 2026-07-07T05:00:10Z
- **Tasks:** 2 completed
- **Files modified:** 5 (2 src, 3 test novos)

## Accomplishments

- Corrigido o bug de binding do `KModelProxyHandler` (QUAL-01): o trap `get` fazia `Reflect.get(...).bind(target)` e descartava o resultado, retornando em seguida um segundo `Reflect.get` sem bind — na prática, chamadas via `model.metodo()` rodavam com `this` = o próprio Proxy (`receiver`), fazendo qualquer `this.outroMetodo()` interno reentrar no trap. Agora o trap retorna `value.bind(target)` sempre que `value` é função, e o guard de `allowedMethods` passou a lançar `MongoatError` (antes: `Error` genérico).
- `Database.defineModel()` (deprecated) parou de embrulhar o resultado de `Model.create()` num segundo `new Proxy(...)` — reaproveita a instância já registrada/proxied em `Database[KModelMap]`.
- Removido o fallback silencioso de `kGetDbName` para `'mongoat-test'` / `${PACKAGE}-test-${JEST_WORKER_ID}` (D-08): agora é síncrono e lança `MongoatError` descritivo (menciona `MONGODB_DB_NAME` e `config.dbName`, sem despejar a config inteira) quando nenhum nome de banco está configurado.
- Adicionada API mínima `@internal` de reset do registry, `Database.resetRegistry()` (D-09), que limpa o `KModelMap` estático — destinada à suíte de testes (usada pelo próprio `proxy-binding.test.ts` no `afterAll`, e disponível para o Plan 05).
- 3 arquivos de teste novos, todos rodando contra MongoDB real via testcontainers (D-13, sem mocks): `proxy-binding.test.ts` (6 casos), `dbname-required.test.ts` (3 casos), `registry-reset.test.ts` (1 caso).

## Task Commits

Each task was committed atomically:

1. **Task 1: Corrigir binding do Proxy (bind ao target) + duplo-Proxy do defineModel** - `b089cc6` (fix)
2. **Task 2: Remover fallback de dbName de teste (D-08) e adicionar reset do registry (D-09)** - `2950fad` (fix)

_Nenhuma task usou TDD com commits separados (test→feat→refactor) — cada commit já inclui teste + fix, verificado verde antes de committar (equivalente RED+GREEN colapsado, já que o comportamento antigo e o novo foram validados na mesma passada de verificação)._

## Files Created/Modified

- `src/database/index.ts` - `KModelProxyHandler.get` corrigido (bind ao target, `MongoatError` no guard); `defineModel()` sem duplo-Proxy; `kGetDbName` síncrono sem fallback de teste; `Database.resetRegistry()` adicionado; `kGetUrlAndDbName`/`kCreateClientConnection` ajustados para a assinatura síncrona
- `src/model/index.ts` - constructor de `Model` agora `return`a a instância já registrada/proxied por `registerModel()` em vez de deixar o `this` cru escapar (fix adicional, ver Deviations)
- `test/database/proxy-binding.test.ts` (novo) - binding do Proxy, guard preservado (via `new Model()` e via `defineModel()`), defineModel sem duplo-wrap, propriedade não-função crua
- `test/database/dbname-required.test.ts` (novo) - os 3 casos de `kGetDbName` (env, config, erro)
- `test/database/registry-reset.test.ts` (novo) - `resetRegistry()` limpa o `KModelMap`

## Decisions Made

- **defineModel() corrigido, não apenas documentado.** O RESEARCH.md deixava a decisão a cargo do planning ("Open Question 3"); o PATTERNS.md já trazia a correção pronta (Fix 3), então foi aplicada em vez de apenas registrar como known-issue — custo baixo, remove um duplo-wrap de Proxy real.
- **`kGetUrlAndDbName` deixou de ser `async`** — sem `await this[kGetDbName]()`, não sobrava nenhum outro `await` no corpo do método, então a assinatura virou totalmente síncrona (mais simples que manter `async` sem `await` interno).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `Model` constructor não retornava a instância registrada/proxied na primeira construção**
- **Found during:** Task 1, ao escrever `test/database/proxy-binding.test.ts` para cobrir "método não permitido lança MongoatError via `new Model()`" (exigido pelo `acceptance_criteria` da própria task).
- **Issue:** `Model[kDatabase].registerModel(this)` era chamado como statement solto no fim do constructor, sem `return`. Em JavaScript/TypeScript, um constructor sem `return` explícito devolve `this` (a instância crua) para `new ClassName(...)`. Como o guard de `allowedMethods` vive inteiramente no `KModelProxyHandler` (o Proxy devolvido por `registerModel`), a PRIMEIRA vez que `new Model({...})` era chamado para um `collectionName`, o objeto devolvido ao chamador NÃO era o Proxy — era a instância crua, sem NENHUM guard. Só a segunda chamada com o mesmo `collectionName` (que cai no early-return `if (!!model) return model` lendo de `Model[kDatabase].getModel(...)`) devolvia o Proxy. Isso não estava na lista dos 5 bugs de QUAL-01 nem nos exemplos do RESEARCH.md/PATTERNS.md (que assumiam implicitamente que o constructor já devolvia o Proxy), mas bloqueava diretamente o `<behavior>`/`acceptance_criteria` da Task 1 ("método não permitido lança MongoatError... via `new Model()`").
- **Fix:** `Model` constructor agora faz `return Model[kDatabase].registerModel(this as unknown as Model<Document>) as unknown as Model<ModelType>;` em vez de chamar `registerModel` como statement solto — devolve a instância já envolvida em Proxy, consistente com o comportamento do early-return e com o que `defineModel()` (Fix 3) já passou a assumir.
- **Files modified:** `src/model/index.ts` (fora da lista `files_modified` original do plano, que listava só `src/database/index.ts` + os 3 test files — extensão mínima e diretamente necessária para o comportamento da Task 1).
- **Verification:** `test/database/proxy-binding.test.ts` — casos "método não permitido lança MongoatError via `new Model()` direto" e "via `Database.defineModel()`" — ambos verdes; `npm test` (11/11), `npx tsc --noEmit`, `npm run build` permanecem verdes.
- **Committed in:** `b089cc6` (parte do commit da Task 1).

---

**Total deviations:** 1 auto-fixado (Rule 1 — bug).
**Impact on plan:** Necessário para que a Task 1 cumprisse seu próprio `acceptance_criteria` (guard funcionando via `new Model()`, não só via `defineModel()`). Escopo mínimo (1 método, mesma classe do fluxo de registro/Proxy que a task já mexia); nenhum redesenho de arquitetura.

## Issues Encountered

None.

## User Setup Required

None - nenhuma configuração de serviço externo necessária.

## Next Phase Readiness

- `Database.resetRegistry()` (D-09) está disponível para o Plan 05 isolar casos de teste do registry.
- Gates de Fase 1 seguem verdes: `npm run build` (tsdown dual CJS/ESM), `npx tsc --noEmit`, `npm test` (4 arquivos, 11 testes, todos contra MongoDB real via testcontainers).
- Catch blocks de `throw new MongoError(JSON.stringify(err, null, 2))` permanecem intactos (D-11, fora de escopo até Fase 3/SEC-04) — confirmado por grep antes de committar.
- Nenhum blocker identificado para o Plan 05.

---
*Phase: 01-funda-o-core-sem-bugs-e-build-moderno*
*Completed: 2026-07-07*

## Self-Check: PASSED

All created/modified files and both task commit hashes (`b089cc6`, `2950fad`) verified present on disk / in git log.
