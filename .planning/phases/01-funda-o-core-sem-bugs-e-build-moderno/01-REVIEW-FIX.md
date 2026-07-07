---
phase: 01-funda-o-core-sem-bugs-e-build-moderno
fixed_at: 2026-07-07T12:50:00Z
review_path: .planning/phases/01-funda-o-core-sem-bugs-e-build-moderno/01-REVIEW.md
iteration: 1
findings_in_scope: 13
fixed: 13
skipped: 0
status: all_fixed
---

# Phase 01: Code Review Fix Report

**Fixed at:** 2026-07-07T12:50:00Z
**Source review:** .planning/phases/01-funda-o-core-sem-bugs-e-build-moderno/01-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 13 (2 Critical + 11 Warning; escopo `critical_warning` — os 10 Info ficaram fora)
- Fixed: 13
- Skipped: 0

Todos os gates permaneceram verdes após cada correção: `npx tsc --noEmit`, `npm test` (vitest + testcontainers, Mongo real) e `npm run build` (tsdown dual CJS/ESM) no final. A suíte cresceu de 20 para 41 testes (regressões novas para cada correção comportamental).

## Fixed Issues

### CR-01: `config.uri` ignorado sem `username`+`password`

**Files modified:** `src/database/index.ts`, `test/database/uri-precedence.test.ts` (novo), `test/database/dbname-required.test.ts`, `test/database/proxy-binding.test.ts`, `test/database/registry-reset.test.ts`, `test/model/connection-required.test.ts`, `test/model/crud-happy-path.test.ts`, `test/model/find-typing.test.ts`, `test/model/insertmany-hooks.test.ts`, `test/model/registry-config.test.ts`, `test/model/schema-clone.test.ts`, `test/smoke.test.ts`
**Commit:** 0e1c4a3
**Applied fix:** URI agora é resolvida como `MONGODB_URI || config.uri` incondicionalmente; credenciais são opcionais e só substituem os placeholders `<username>`/`<password>` quando ambas existem. JSDoc do construtor atualizado. Credenciais fictícias (`username: 'mongoat', password: 'mongoat'`) removidas de todos os 9 arquivos de teste que as usavam como workaround. Novo teste de regressão cobre: config puramente por ambiente (`new Database()` + `MONGODB_URI`), `config.uri` sem credenciais, precedência env > config, fallback default e substituição de placeholders.

### CR-02: `withTransaction` no-op silencioso quando desconectado

**Files modified:** `src/database/index.ts`, `test/database/with-transaction.test.ts` (novo)
**Commit:** 12d2f20
**Applied fix:** Lança `MongoatError('Database not connected — call db.connect() first')` quando `kClient` é `undefined` (mesmo padrão D-10 do `getCollectionOrThrow`); `endSession()` agora é aguardado dentro de `finally` (substituindo a dupla chamada não aguardada em try/catch). Regressão: caso desconectado rejeita sem nunca executar o callback; caso conectado executa a transação real (replica set de nó único do container) e persiste a escrita.

### WR-01: `try/catch` morto em `insertMany`/`bulkWrite` (`return` sem `await`)

**Files modified:** `src/model/index.ts`
**Commit:** f47711d
**Applied fix:** `return await collection.insertMany(...)` e `return await collection.bulkWrite(...)` — rejeições assíncronas do driver agora passam pelos catches. `bulkWrite` virou `async` (necessário para o `await`; o tipo de retorno `Promise<BulkWriteResult>` não muda). O caminho de erro passou a ser exercitado pelo teste de WR-11.

### WR-02: `insertMany`/`bulkWrite` mutavam o input do chamador; hook não via defaults

**Files modified:** `src/model/index.ts`, `test/model/insert-input-isolation.test.ts` (novo)
**Commit:** d0033d1
**Applied fix:** `insertMany` agora faz o merge com `documentDefaults` ANTES dos hooks e vincula os hooks às cópias (mesmo comportamento de `insert()`): o hook enxerga os defaults via `this` e mutações não vazam para o array de entrada. `bulkWrite` clona a operação (`{ ...operation, insertOne: { ...op.insertOne, document: {...} } }`) em vez de reatribuir in-place. O typo `anyOperarion` (IN-02) foi incidentalmente corrigido na reescrita do bloco. Regressões: input intacto após `insertMany` com hook mutador, hook enxergando defaults, operações de `bulkWrite` intactas.

### WR-03: `Database.defineModel()` (deprecated) ainda tinha o bug D-06 original

**Files modified:** `src/database/index.ts`, `test/model/registry-config.test.ts`
**Commit:** e78e77e
**Applied fix:** Removido o early-return `if (!!model) return model;` — `defineModel` agora delega ao construtor do `Model` (reusa se a config for igual, lança `MongoatError` se divergir). Regressões: `defineModel` com config divergente lança; com config igual retorna a mesma instância.

### WR-04: `isSameConfig` ignorava `documentDefaults` e `indexes`

**Files modified:** `src/model/index.ts`, `test/model/registry-config.test.ts`
**Commit:** b03c8eb
**Applied fix:** `documentDefaults` e `indexes` incluídos na comparação de identidade (mesmo molde `JSON.stringify` já usado). Regressões: re-registração com mesmo schema mas `documentDefaults` divergentes lança; idem para `indexes` divergentes.

### WR-05: `isSameConfig` sensível à ordem de chaves

**Files modified:** `src/model/index.ts`, `test/model/registry-config.test.ts`
**Commit:** 5df5eac
**Applied fix:** Helper `stableStringify` (serialização com chaves ordenadas via replacer) aplicado a `validator` e `documentDefaults`. **Adaptação deliberada:** `indexes` continuam com `JSON.stringify` puro — a ordem das chaves em um índice composto (`{ a: 1, b: 1 }` vs `{ b: 1, a: 1 }`) é semântica no MongoDB; ordená-las equipararia índices genuinamente diferentes (documentado em comentário). Regressão: mesmo schema declarado com chaves em ordem distinta reusa a instância.

### WR-06: `documentDefaults` compartilhado por referência

**Files modified:** `src/model/index.ts`, `test/model/insert-input-isolation.test.ts`
**Commit:** 63bb39c
**Applied fix:** Helper `cloneDocumentDefaults` — deep-clone restrito a plain objects/arrays — aplicado no construtor (não guarda a referência do usuário) e em cada merge (`insert`, `insertMany`, `bulkWrite`), garantindo instância própria dos defaults aninhados por documento. **Adaptação deliberada:** não usei `structuredClone` (sugestão do review) porque defaults podem conter instâncias de classe do BSON (ex.: `ObjectId`) cujo protótipo o `structuredClone` destruiria — o clone custom passa qualquer não-plain-object por referência (documentado no JSDoc do helper). Regressão: hook que muta `this.meta.source` não polui inserts subsequentes.

### WR-07: `?? []` morto em `findMany`

**Files modified:** `src/model/index.ts`
**Commit:** 90c212e
**Applied fix:** Removido o `?? []` (`toArray()` retorna `Promise`, nunca nullish) — mesma classe do fix de tipagem do `find()` (QUAL-01).

### WR-08: `connect()` concorrente criava dois `MongoClient`

**Files modified:** `src/database/index.ts`, `test/database/connect-concurrency.test.ts` (novo)
**Commit:** b95d8d0
**Applied fix:** Novo campo privado `[kConnecting]: Promise<string> | undefined` — a Promise de conexão em andamento é guardada e reutilizada por chamadas concorrentes, com `.finally()` limpando o campo. Regressão: duas chamadas concorrentes retornam a MESMA Promise; após conectado, `connect()` volta a ser no-op.

### WR-09: Credenciais interpoladas sem URL-encoding

**Files modified:** `src/database/index.ts`, `test/database/uri-precedence.test.ts`
**Commit:** 41cf4eb
**Applied fix:** `encodeURIComponent` em `username` e `password` antes da substituição dos placeholders. Regressão: credenciais com `@`, `/`, `:`, `?`, `#` produzem a connection string percent-encoded esperada.

### WR-10: `setupIndexes` com `dropIndexes()` incondicional

**Files modified:** `src/database/index.ts`, `test/database/setup-indexes.test.ts` (novo)
**Commit:** 5dd7550
**Applied fix:** Diff em vez de drop-all: `createIndex` (idempotente para specs idênticas) é tentado direto; em caso de conflito de spec, apenas o índice gerenciado divergente (localizado por key pattern ou nome via `listIndexes()`) é derrubado e recriado — índices externos (DBAs/migrations) nunca são tocados e a janela sem unicidade fica restrita ao índice que de fato mudou. Regressões: índice externo sobrevive a novo `setupCollection`; índice gerenciado com spec divergente é substituído sem afetar os demais.

### WR-11: `JSON.stringify(err)` destruía a informação do erro

**Files modified:** `src/model/index.ts`, `test/model/insert-error-cause.test.ts` (novo)
**Commit:** f1b39df
**Applied fix:** Helper `wrapDriverError` — `new MongoatError(err instanceof Error ? err.message : String(err), { cause: err })` — aplicado nos três catches (`insert`, `insertMany`, `bulkWrite`; os dois últimos ficaram vivos com WR-01 e tinham o mesmo defeito). Import não usado de `MongoError` removido. **Mudança de tipo de erro público:** erros do driver nesses métodos agora chegam como `MongoatError` (com `cause`) em vez de `MongoError` com mensagem `{}` — alinhado à convenção D-08/D-10/D-11 da fase e ao escopo declarado em `src/errors/index.ts` (wrap mínimo até a hierarquia da Fase 3/SEC-04). Regressões: insert inválido rejeita com `MongoatError` contendo `Document failed validation` e `cause` preservado; `insertMany` inválido passa pelo catch.

## Skipped Issues

Nenhum — todos os 13 achados em escopo foram corrigidos.

## Verification

- `npx tsc --noEmit`: verde após cada uma das 13 correções.
- `npm test` (vitest + testcontainers, MongoDB real): verde após cada correção — 41 testes ao final (20 na baseline).
- `npm run build` (tsdown, dual CJS/ESM + `.d.cts`/`.d.mts`): verde ao final.
- Nota: durante o CR-02, o primeiro rascunho do teste falhou por causa do comportamento first-wins de `Model[kDatabase]` (IN-10, fora de escopo) — resolvido no próprio teste com o rebind explícito `Model.setDatabase(db)`, sem tocar o comportamento da lib.

---

_Fixed: 2026-07-07T12:50:00Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
