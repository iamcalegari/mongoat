---
phase: 01-funda-o-core-sem-bugs-e-build-moderno
reviewed: 2026-07-07T05:27:00Z
depth: standard
files_reviewed: 17
files_reviewed_list:
  - src/database/index.ts
  - src/errors/index.ts
  - src/index.ts
  - src/model/index.ts
  - src/types/index.ts
  - src/types/model.ts
  - test/database/dbname-required.test.ts
  - test/database/proxy-binding.test.ts
  - test/database/registry-reset.test.ts
  - test/model/connection-required.test.ts
  - test/model/crud-happy-path.test.ts
  - test/model/find-typing.test.ts
  - test/model/insertmany-hooks.test.ts
  - test/model/registry-config.test.ts
  - test/model/schema-clone.test.ts
  - test/setup/testcontainer.ts
  - test/smoke.test.ts
findings:
  critical: 2
  warning: 11
  info: 10
  total: 23
status: issues_found
---

# Phase 01: Code Review Report

**Reviewed:** 2026-07-07T05:27:00Z
**Depth:** standard
**Files Reviewed:** 17
**Status:** issues_found

## Summary

Revisão adversarial dos arquivos alterados na Fase 01 (fundação core + build moderno). Os 5 bugs alvo da fase (binding do Proxy, hooks não aguardados no `insertMany`, tipagem do `find()`, mutação de schema, race do registry) estão de fato corrigidos e cobertos por testes de regressão sólidos contra Mongo real via testcontainers — bom trabalho nessa frente.

Porém, a revisão encontrou **2 problemas críticos** e **11 warnings** nos mesmos arquivos:

1. **`config.uri` é silenciosamente ignorado** a menos que `username` E `password` também sejam fornecidos — a conexão cai no default `mongodb://127.0.0.1:27017/` sem aviso. Os próprios testes da fase evidenciam o workaround: todos passam `username: 'mongoat', password: 'mongoat'` fictícios só para ativar o branch.
2. **`withTransaction` vira no-op silencioso** quando o client não está conectado — o callback nunca executa e a chamada resolve com `undefined`, mascarando perda de escrita.

Além disso, várias correções da fase foram aplicadas de forma **incompleta na mesma classe de bug**: o `?? []` morto sobrevive em `findMany()` (mesma classe do fix de tipagem do `find()`), os `try/catch` de `insertMany`/`bulkWrite` são código morto por falta de `await` (mesma classe do fix de hooks não aguardados), e o caminho deprecated `Database.defineModel()` ainda contém o bug D-06 original (retorno silencioso de config divergente) que o construtor do `Model` corrigiu.

## Structural Findings (fallow)

Nenhum pré-processamento estrutural foi fornecido para esta revisão.

## Narrative Findings (AI reviewer)

## Critical Issues

### CR-01: `config.uri` ignorado sem `username`+`password` — conexão silenciosa no localhost default

**File:** `src/database/index.ts:64-72`
**Issue:** A URL de conexão só é atribuída dentro de `if (this.config.uri && this.config.username && this.config.password)`. Consequências:

1. `new Database({ uri: 'mongodb://prod-host:27017' })` (URI sem placeholders de credenciais, ex.: auth por connection string, Atlas SRV com credenciais embutidas, ou instância local sem auth) **descarta a URI** e conecta em `mongodb://127.0.0.1:27017/` sem qualquer erro ou aviso.
2. A env var `MONGODB_URI` só é lida **dentro** desse branch — configuração puramente por ambiente (`MONGODB_URI` setada, `new Database()` sem args), que o CLAUDE.md documenta como padrão do projeto ("Environment-Driven Config"), também cai no default localhost.

Isso é comportamento incorreto com risco real de perda de dados (escrita no banco errado). A evidência de que o problema é conhecido está nos próprios testes: **todos** os arquivos de teste passam `username: 'mongoat', password: 'mongoat'` fictícios (o container não tem auth) unicamente para satisfazer a condição tripla — um workaround que ficará invisível para usuários da lib.

**Fix:**
```typescript
constructor(/* ... */) {
  this[kClient] = client;
  this[kDb] = db;

  const uri = process.env.MONGODB_URI || this.config.uri;

  if (uri) {
    const username = process.env.MONGODB_USERNAME || this.config.username;
    const password = process.env.MONGODB_PASSWORD || this.config.password;

    this[kConnectionUrl] =
      username && password
        ? uri
            .replace('<username>', encodeURIComponent(username))
            .replace('<password>', encodeURIComponent(password))
        : uri;
  }

  if (!Model.hasDatabase()) Model.setDatabase(this);
}
```
Depois do fix, remover as credenciais fictícias dos testes (elas passam a ser desnecessárias e deixam de documentar um falso requisito da API).

### CR-02: `withTransaction` é no-op silencioso quando não conectado — callback nunca executa

**File:** `src/database/index.ts:305-323`
**Issue:** Com o banco desconectado, `this[kClient]?.startSession(...)` retorna `undefined`, `clientSession?.withTransaction(...)` é `undefined` aguardado, e o método **resolve com `undefined` sem nunca invocar `fn`**. O chamador recebe sucesso aparente para uma transação que jamais rodou — perda de escrita silenciosa. Isso contradiz diretamente o padrão D-10 adotado na mesma fase (`getCollectionOrThrow` lança `MongoatError` descritivo exatamente para eliminar falhas silenciosas pré-conexão). Adicionalmente, `endSession()` retorna `Promise` e não é aguardado, e a dupla chamada em try/catch deveria ser um `finally`.

**Fix:**
```typescript
async withTransaction(
  fn: (session: ClientSession) => Promise<any> | undefined,
  options?: ClientSessionOptions
) {
  if (!this[kClient]) {
    throw new MongoatError(
      'Database not connected — call db.connect() first'
    );
  }

  const clientSession = this[kClient].startSession({ ...options });
  let result: any;

  try {
    await clientSession.withTransaction(async (session) => {
      result = await fn(session);
    });
  } finally {
    await clientSession.endSession();
  }

  return result;
}
```

## Warnings

### WR-01: `try/catch` morto em `insertMany` e `bulkWrite` — `return` sem `await` dentro do `try`

**File:** `src/model/index.ts:399-404, 461-465`
**Issue:** `return collection.insertMany(_documents, options);` e `return collection.bulkWrite(_operations, options ?? {});` retornam a Promise sem `await` dentro do `try`. Rejeições assíncronas do driver **nunca passam pelo `catch`** — o wrapping em `MongoError(JSON.stringify(...))` documentado no comentário das linhas 456-458 é código morto. É a mesma classe de bug (Promise não aguardada) que esta fase corrigiu nos pre-hooks do `insertMany`. Compare com `insert()` (linha 374), que corretamente aguarda.
**Fix:** Em ambos os métodos: `return await collection.insertMany(_documents, options);` (idem para `bulkWrite`). Alternativa: remover os try/catch mortos até a hierarquia de erros da Fase 3 (SEC-04), mantendo comportamento explícito.

### WR-02: `insertMany` muta os documentos do chamador e esconde `documentDefaults` do hook — inconsistente com `insert`

**File:** `src/model/index.ts:387-396` (e `bulkWrite` em `443-454`)
**Issue:** Duas divergências em relação a `insert()`:
1. O pre-hook é vinculado ao **objeto cru do chamador** (`.bind(doc)`), então mutações do hook vazam para o array de entrada do usuário. `insert()` copia antes (`_document = { ...defaults, ...document }`) — o input do chamador fica intacto.
2. O hook roda **antes** do merge com `documentDefaults`, então `this` dentro do hook não enxerga os defaults (em `insert()`, enxerga). Hooks que leem/ajustam campos default se comportam diferente entre os dois métodos.

`bulkWrite` tem o mesmo vazamento: `anyOperarion.insertOne.document = { ... }` reatribui o campo **dentro do objeto de operação do chamador** (o `map` retorna os mesmos objetos), mutando o array de entrada.
**Fix:**
```typescript
async insertMany(documents, options = {}) {
  const _documents = documents.map((doc) => ({
    ...this.documentDefaults,
    ...doc,
  }));

  await Promise.all(
    _documents.map((doc) =>
      this.preMethod[METHODS.INSERT_MANY].bind(doc)(options)
    )
  );
  // ...
}
```
Em `bulkWrite`, clonar a operação (`{ ...operation, insertOne: { ...op.insertOne, document: {...} } }`) em vez de mutar in-place.

### WR-03: `Database.defineModel()` ainda contém o bug D-06 original — config divergente silenciosamente ignorada

**File:** `src/database/index.ts:179-183`
**Issue:** `if (!!model) return model;` retorna o model registrado **antes** de qualquer comparação de config — exatamente o comportamento que D-06 corrigiu no construtor do `Model` (`isSameConfig` + throw em divergência). Pelo caminho deprecated, uma segunda `defineModel()` com schema/allowedMethods divergentes é descartada sem aviso. Deprecated não isenta de correção: o método continua exportado na API pública.
**Fix:** Remover o early-return e delegar ao construtor:
```typescript
static defineModel<ModelType extends Document>({ ... }: ModelSetup): Model<ModelType> {
  Model.create({ ... }); // construtor já resolve: reusa se igual, lança se divergente
  return Database[KModelMap].get(collectionName) as Model<ModelType>;
}
```

### WR-04: `isSameConfig` ignora `documentDefaults`, `indexes` e `validationQueryExpressions` isolados — divergência mascarada

**File:** `src/model/index.ts:49-64`
**Issue:** A comparação de identidade cobre apenas `allowedMethods` + `validator`. Duas registrações com mesmo schema mas `documentDefaults` diferentes (ex.: `{ status: 'active' }` vs `{ status: 'draft' }`) ou `indexes` diferentes retornam a primeira instância silenciosamente — os novos defaults/índices são descartados sem aviso. É a mesma classe de mascaramento que D-06 se propôs a eliminar; `documentDefaults` e `indexes` afetam materialmente o comportamento do model.
**Fix:** Incluir `documentDefaults` e `indexes` na comparação (`JSON.stringify` sobre os mesmos moldes já usados), ou documentar explicitamente no JSDoc público que apenas schema+métodos definem identidade e que o restante é ignorado em re-registro.

### WR-05: `isSameConfig` sensível à ordem de chaves — falso positivo de divergência

**File:** `src/model/index.ts:56-61`
**Issue:** `JSON.stringify(existing.validator) === JSON.stringify(candidate.validator)` falha para validators estruturalmente idênticos com ordem de inserção de chaves diferente (ex.: o mesmo schema declarado com `properties` em ordem distinta em dois módulos). Resultado: `MongoatError: already registered with a different configuration` espúrio para configs equivalentes.
**Fix:** Serializar com chaves ordenadas antes de comparar:
```typescript
function stableStringify(value: unknown): string {
  return JSON.stringify(value, (_k, v) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.keys(v).sort().reduce((acc: any, k) => ((acc[k] = v[k]), acc), {})
      : v
  );
}
```

### WR-06: `documentDefaults` compartilhado por referência — mutação de default aninhado polui todos os inserts futuros

**File:** `src/model/index.ts:169, 364-367, 393-396, 446-450`
**Issue:** `this.documentDefaults = documentDefaults` guarda a referência do usuário, e todos os merges são spreads rasos. Se um default for objeto (ex.: `documentDefaults: { meta: { source: 'api' } }`), **todo documento inserido compartilha a mesma instância `meta`**. Um pre-hook que faça `this.meta.source = 'batch'` muta o default compartilhado permanentemente — todos os inserts subsequentes (de qualquer chamador) herdam o valor mutado. A fase corrigiu exatamente essa classe de vazamento por referência no schema (`structuredClone` em `schemaValidatorBuilder`), mas deixou `documentDefaults` exposto ao mesmo defeito.
**Fix:** Clonar no ponto de uso: `{ ...structuredClone(this.documentDefaults), ...document }` (ou clonar uma vez no construtor e a cada merge, já que o merge raso ainda compartilharia os aninhados).

### WR-07: `?? []` morto em `findMany` — mesma classe do bug de tipagem corrigido em `find()`

**File:** `src/model/index.ts:348-352`
**Issue:** `return collection.find(filter, options).toArray() ?? [];` — `toArray()` retorna `Promise`, que nunca é nullish; o `?? []` jamais dispara. É exatamente o padrão que o fix QUAL-01 removeu de `find()` (`findOne(...) ?? null`), documentado no próprio teste `find-typing.test.ts:12-18`, mas que sobreviveu em `findMany()`. Código morto que mente sobre um retorno síncrono `[]` impossível.
**Fix:**
```typescript
findMany(filter: Filter<ModelType> = {}, options: FindOptions = {}) {
  const collection = this.getCollectionOrThrow();
  return collection.find(filter, options).toArray();
}
```

### WR-08: `connect()` concorrente cria dois `MongoClient` — vazamento de pool de conexões

**File:** `src/database/index.ts:96-111, 397-404`
**Issue:** `isConnected()` só retorna `true` depois que `kCreateClientConnection` conclui e atribui `kClient`/`kDb`. Duas chamadas concorrentes a `connect()` (ex.: bootstrap de dois módulos em paralelo) passam ambas pelo guard, criam **dois** `MongoClient`s, e o primeiro é sobrescrito em `this[kClient]` sem `close()` — pool de conexões vazado até o processo morrer.
**Fix:** Guardar a Promise em andamento:
```typescript
private [kConnecting]?: Promise<string>;

connect(): Promise<string> | void {
  if (this.isConnected()) return;
  if (this[kConnecting]) return this[kConnecting];

  this[kConnecting] = this[kCreateClientConnection]({ /* ... */ }).finally(
    () => { this[kConnecting] = undefined; }
  );
  return this[kConnecting];
}
```

### WR-09: Credenciais interpoladas na URI sem URL-encoding

**File:** `src/database/index.ts:69-71`
**Issue:** `uri.replace('<username>', username).replace('<password>', password)` injeta as credenciais cruas na connection string. Senhas com caracteres reservados de URI (`@`, `/`, `:`, `%`, `?`, `#` — comuns em senhas fortes) quebram o parse da URI ou deslocam a semântica (tudo após `@` vira host; `?` inicia query string, permitindo injetar opções de conexão). O driver exige percent-encoding nesses campos.
**Fix:** `uri.replace('<username>', encodeURIComponent(username)).replace('<password>', encodeURIComponent(password))`.

### WR-10: `setupIndexes` executa `dropIndexes()` incondicional — destrói índices externos e abre janela sem unicidade

**File:** `src/database/index.ts:381-395`
**Issue:** Todo `setupCollection` com `indexes.length > 0` derruba **todos** os índices da collection (inclusive os criados fora do Mongoat por DBAs/migrations) e os recria um a um. Além da destruição de índices não gerenciados, índices `unique` ficam ausentes entre o drop e o recreate — escritas concorrentes nessa janela podem persistir duplicatas que a recriação do índice depois rejeitará (falha no `createIndex` com dados duplicados). Em uma app que chama `setupCollections()` a cada boot, a janela reabre a cada deploy.
**Fix:** Diff em vez de drop-all: usar `collection.listIndexes()` para comparar com `model.indexes`, criar apenas os ausentes e derrubar (opcionalmente, atrás de flag) apenas os gerenciados que divergirem. `createIndex` já é idempotente para specs idênticas.

### WR-11: `JSON.stringify(err)` em `insert()` destrói a informação do erro — `message`/`stack` são não-enumeráveis

**File:** `src/model/index.ts:378-380`
**Issue:** Para instâncias de `Error` genéricas, `JSON.stringify(err)` produz `'{}'` (`message` e `stack` são propriedades não-enumeráveis), então `throw new MongoError(JSON.stringify(err, null, 2))` pode lançar um erro com mensagem `{}` — o erro original (e sua stack) é completamente descartado. `MongoServerError` expõe alguns campos enumeráveis, mas `message`/`stack` se perdem sempre. O `errors/index.ts` já declara a hierarquia de erros de driver como escopo da Fase 3 (SEC-04), mas este catch está **ativo hoje** (diferente dos catches mortos de WR-01) e degrada ativamente a diagnosticabilidade.
**Fix:** Mínimo até a Fase 3: preservar a causa — `throw new MongoatError(err instanceof Error ? err.message : String(err), { cause: err });` (a classe `MongoatError` já suporta `cause`).

## Info

### IN-01: Tipo boxed `Boolean` em `isConnected()`

**File:** `src/database/index.ts:353`
**Issue:** `private isConnected(): Boolean` usa o wrapper object `Boolean` em vez do primitivo `boolean` — viola a regra recomendada do typescript-eslint (`ban-types`).
**Fix:** `private isConnected(): boolean`.

### IN-02: Typo `anyOperarion`

**File:** `src/model/index.ts:444-449`
**Issue:** Variável `anyOperarion` (sic) — deveria ser `anyOperation`.
**Fix:** Renomear.

### IN-03: Lógica de `_allowedMethods` duplicada entre `defineModel` e o construtor de `Model`

**File:** `src/database/index.ts:185-196` e `src/model/index.ts:117-128`
**Issue:** A mesma lista de 8 métodos para `validity: true` é montada em dois lugares. Como `defineModel` repassa `validity` para `Model.create`, o construtor recomputa e o bloco em `defineModel` é redundante — dois pontos de manutenção para divergir.
**Fix:** Remover o bloco de `defineModel` e passar `allowedMethods` cru (o construtor decide).

### IN-04: Gate do Proxy é contornável via protótipo — documentar que não é fronteira de segurança

**File:** `src/database/index.ts:325-351`
**Issue:** O handler define apenas o trap `get`. `Object.getPrototypeOf(model).insert.call(model, doc)` (ou `getOwnPropertyDescriptor` no protótipo) obtém o método cru sem passar pelo guard de `allowedMethods`. Dentro da restrição arquitetural (gating via Proxy preservado), vale documentar no README/JSDoc que `allowedMethods` é guard de conveniência contra uso acidental, não controle de segurança.
**Fix:** Nota de documentação; opcionalmente adicionar traps `getOwnPropertyDescriptor`/`getPrototypeOf` se quiser endurecer.

### IN-05: Mensagem enganosa no construtor de `Model` quando nenhum `Database` foi instanciado

**File:** `src/model/index.ts:101-105`
**Issue:** O erro diz "call db.connect() first", mas esse branch dispara quando `Model[kDatabase]` é `undefined` — ou seja, **nenhuma instância de `Database` foi criada**. Chamar `connect()` não resolveria; o usuário precisa de `new Database(...)` antes.
**Fix:** Mensagem específica: `'No Database instance — create a Database (new Database(config)) before defining models'`.

### IN-06: `loadModels` resolve caminho relativo ao módulo da lib e não trata erro

**File:** `src/database/index.ts:77-79`
**Issue:** `await import(modelsPath)` com caminho relativo resolve relativo ao arquivo compilado da lib dentro de `node_modules`, não ao módulo chamador — só caminhos absolutos funcionam de forma confiável. Não há validação nem mensagem de erro amigável.
**Fix:** Documentar exigência de caminho absoluto (ou `pathToFileURL(resolve(...))`) e envolver em try/catch com `MongoatError` descritivo.

### IN-07: `JSONSchema4Subset` não re-exportado no barrel público

**File:** `src/types/index.ts:1-12`, `src/index.ts:4-15`
**Issue:** `ModelValidationSchema` (exportada) estende `JSONSchema4Subset`, mas a interface base não é re-exportada em `types/index.ts` nem em `src/index.ts`. Consumidores não conseguem nomear o tipo base, e dependendo do bundler de `.d.ts` o tipo pode ficar inacessível na declaração publicada.
**Fix:** Adicionar `JSONSchema4Subset` aos dois barrels.

### IN-08: Montagem frágil da query string no testcontainer

**File:** `test/setup/testcontainer.ts:33`
**Issue:** `` `${container.getConnectionString()}?directConnection=true` `` assume que a connection string nunca contém `?`. Se uma versão futura de `@testcontainers/mongodb` incluir parâmetros (ex.: `?replicaSet=...`), a URI resultante fica inválida silenciosamente.
**Fix:** Detectar `?` e usar `&` como separador, ou montar via `new URL(...)`.

### IN-09: `_id` pode ficar duplicado em `required` se o usuário já o listar

**File:** `src/model/index.ts:226`
**Issue:** `required: [...(clonedSchema.required ?? []), '_id']` não deduplica — um schema de usuário que já inclua `'_id'` em `required` gera `['_id', '_id']`. O JSON Schema Draft 4 exige itens únicos em `required`; o servidor MongoDB pode rejeitar o validator no `collMod`.
**Fix:** `required: [...new Set([...(clonedSchema.required ?? []), '_id'])]`.

### IN-10: `Model[kDatabase]` fica preso à primeira instância de `Database` para sempre

**File:** `src/database/index.ts:74`, `src/model/index.ts:98`
**Issue:** `if (!Model.hasDatabase()) Model.setDatabase(this)` — apenas a primeira `Database` criada no processo alimenta todos os models. Se o usuário descartar a primeira e criar uma segunda (ex.: reconexão com config nova), os models continuam apontando para a instância morta e `getCollectionOrThrow` lança "not connected" mesmo com a segunda conectada. Coerente com a restrição arquitetural (registry estático/singleton), mas o escape hatch `Model.setDatabase()` existe e não está documentado como tal.
**Fix:** Documentar o comportamento first-wins e o uso de `Model.setDatabase(db)` para rebind explícito.

---

_Reviewed: 2026-07-07T05:27:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
