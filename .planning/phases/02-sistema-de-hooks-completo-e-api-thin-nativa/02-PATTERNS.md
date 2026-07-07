# Phase 2: Sistema de hooks completo e API thin nativa - Pattern Map

**Mapped:** 2026-07-07
**Files analyzed:** 9
**Analogs found:** 9 / 9

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `src/types/hooks.ts` (novo) | model (types) | transform | `src/types/model.ts` | role-match (arquivo de tipos irmão) |
| `src/model/hooks.ts` (novo) | utility (pipeline runner) | event-driven | `src/model/index.ts` (`preMethod`/`pre()` atuais) | role-match (evolução direta do mesmo arquivo) |
| `src/model/index.ts` (modificado — pipeline pre/post, `getCollection`, options passthrough) | model | CRUD + event-driven | ele mesmo (estado atual, ver excertos abaixo) | exact (arquivo já existe, é reescrito incrementalmente) |
| `src/database/index.ts` (modificado — `getClient()`/`getDb()`) | service | request-response | `Database.getCollection()` (linha 287-289) | exact (mesmo arquivo, mesmo padrão de getter cru) |
| `src/utils/enums.ts` (NÃO modificar — `getCollection`/`getClient`/`getDb` ficam FORA do enum `METHODS`) | config | — | ele mesmo | exact |
| `test/model/hooks-pre-order.test.ts` (novo) | test | event-driven | `test/model/insertmany-hooks.test.ts` | exact (mesmo domínio: ordenação/await de hooks) |
| `test/model/hooks-post-order.test.ts` (novo) | test | event-driven | `test/model/insertmany-hooks.test.ts` | exact |
| `test/model/hooks-error-propagation.test.ts` (novo) | test | event-driven | `test/model/connection-required.test.ts` (padrão de asserção de erro) | role-match |
| `test/model/hooks-fire-and-forget.test.ts` (novo) | test | event-driven | `test/model/insertmany-hooks.test.ts` | role-match |
| `test/model/hooks-recursion-guard.test.ts` (novo) | test | event-driven | `test/database/proxy-binding.test.ts` (chamada interna reentrante) | role-match |
| `test/model/options-passthrough.test.ts` (novo) | test | CRUD | `test/model/crud-happy-path.test.ts` | role-match |
| `test/model/escape-hatch.test.ts` (novo) | test | request-response | `test/database/proxy-binding.test.ts` | role-match |
| `test/database/escape-hatch.test.ts` (novo) | test | request-response | `test/database/with-transaction.test.ts` (não lido, mas mesmo padrão de setup Database) | role-match |

## Pattern Assignments

### `src/types/hooks.ts` (novo)

**Analog:** `src/types/model.ts` (arquivo inteiro, 79 linhas — lido integralmente)

**Convenção de import e naming** (linhas 1-8 de `src/types/model.ts`):
```typescript
import { METHODS } from '@/utils/enums';
import {
  CreateIndexesOptions,
  Document,
  Filter,
  IndexSpecification,
  OptionalUnlessRequiredId,
} from 'mongodb';
```
Replicar: hooks.ts deve importar `METHODS` de `@/utils/enums` e os tipos de options do driver (`FindOptions`, `InsertOneOptions`, `BulkWriteOptions`, etc.) diretamente de `mongodb`.

**Convenção de naming de tipos** (linhas 27-49): sufixo `Props` para parâmetros de configuração (`CreateModelProps`), sem prefixo `I`. Para os novos tipos: `HookFn<Ctx>`, `PostHookEntry<Ctx>`, `HookRegistry<ModelType>`, `HookContextMap<ModelType>` — já seguem a convenção do RESEARCH.md, manter exatamente esses nomes.

**Padrão de tipo condicional por chave de enum** (linhas 70-78, `ModelValidationSchema`):
```typescript
export interface ModelValidationSchema<T extends DefaultProperties = any>
  extends JSONSchema4Subset {
  bsonType: string | string[];
  items?: ModelValidationSchema;
  properties?: {
    [k in keyof T]: ModelValidationSchema;
  };
  required?: (keyof T)[];
}
```
O `HookContextMap<ModelType>` do RESEARCH.md (Pattern 3) segue essa mesma filosofia de mapped/lookup type indexado por `METHODS` — é a extensão natural desse padrão já usado no arquivo, não uma técnica nova ao projeto.

**Reaproveitar diretamente:** `DefaultProperties`, `CreateModelProps<ModelType>` (para adicionar o campo `hooks?` — ver seção `## Pattern Assignments` de `src/model/index.ts` abaixo).

---

### `src/model/hooks.ts` (novo) e `src/model/index.ts` (modificado)

**Analog:** o próprio `src/model/index.ts` atual (598 linhas, lido integralmente) — a Fase 2 evolui incrementalmente o mesmo arquivo/classe.

**Imports pattern** (linhas 1-33):
```typescript
import {
  AggregateOptions,
  AnyBulkWriteOperation,
  BulkWriteOptions,
  Collection,
  CountDocumentsOptions,
  DeleteOptions,
  Document,
  Filter,
  FindOneAndDeleteOptions,
  FindOneAndUpdateOptions,
  FindOptions,
  InsertOneOptions,
  ObjectId,
  OptionalUnlessRequiredId,
  UpdateFilter,
  UpdateOptions,
  WithId,
} from 'mongodb';

import {
  CreateIndexProps,
  CreateModelProps,
  DefaultProperties,
  DocumentDefaults,
  ModelDbValidationProps,
  ModelValidationSchema,
  ValidationQueryExpressions,
} from '@/types/model';
import { METHODS } from '@/utils/enums';
import { Database } from '@/database';
import { MongoatError } from '@/errors';
import { toObjectId } from '@/utils';
```
`hooks.ts` deve seguir o mesmo agrupamento: bloco `mongodb` primeiro, depois `@/*` imports por barrel/path alias. Novo import a adicionar: `import { AsyncLocalStorage } from 'node:async_hooks';` (nativo, sem instalação).

**Padrão de symbol privado a replicar** (linha 35): `const kDatabase = Symbol('kDatabase');` — o novo estado de reentrância deve seguir exatamente essa convenção: `const kHookContext = Symbol('kHookContext');` como campo privado de instância (não estático, ao contrário de `kDatabase`).

**Estado atual a substituir** (`preMethod`, linhas 176-189):
```typescript
preMethod: Record<METHODS, Function> = {
  [METHODS.UPDATE]: () => { },
  [METHODS.UPDATE_MANY]: () => { },
  [METHODS.INSERT]: () => { },
  [METHODS.FIND_MANY]: () => { },
  [METHODS.FIND]: () => { },
  [METHODS.TOTAL]: () => { },
  [METHODS.FIND_BY_ID]: () => { },
  [METHODS.DELETE]: () => { },
  [METHODS.AGGREGATE]: () => { },
  [METHODS.INSERT_MANY]: () => { },
  [METHODS.DELETE_MANY]: () => { },
  [METHODS.BULK_WRITE]: () => { },
};
```
Este é o objeto `Record<METHODS, Function>` indexado pelos 12 valores do enum — o `hooks: HookRegistry<ModelType>` do RESEARCH.md (Pattern 1) segue a MESMA estrutura de inicialização (um entry por `METHODS`), só troca o valor de `Function` única para `{ pre: HookFn[]; post: PostHookEntry[] }`. Copiar a forma de inicialização (`Object.fromEntries(Object.values(METHODS).map(...))` do RESEARCH.md é equivalente e mais enxuto que o objeto literal atual — usar essa versão compacta).

**`pre()` atual a substituir** (linhas 374-387):
```typescript
pre<T extends ModelType>(
  methodName: METHODS,
  transformer: (
    this: UpdateFilter<T> & T,
    args: FindOneAndUpdateOptions &
      FindOptions &
      DeleteOptions &
      InsertOneOptions &
      BulkWriteOptions &
      ModelType
  ) => void
) {
  this.preMethod[methodName] = transformer;
}
```
Nota: hoje **sobrescreve** (`=`). D-01 exige acumular (`.push`). Nova assinatura usa `ctx` explícito em vez de `this: T` + `args` — ver Pattern 1/3 do RESEARCH.md para a assinatura alvo exata.

**Padrão de chamada de hook a substituir em CADA método CRUD** — exemplo em `insert()` (linhas 460-483):
```typescript
async insert(
  document: OptionalUnlessRequiredId<ModelType>,
  options: InsertOneOptions = {}
) {
  let _document = {
    ...cloneDocumentDefaults(this.documentDefaults),
    ...document,
  };

  await this.preMethod[METHODS.INSERT].bind(_document)(options);

  const collection = this.getCollectionOrThrow();

  try {
    const { insertedId } = await collection.insertOne(_document, options);

    return { _id: insertedId, ..._document } as unknown as WithId<ModelType> &
      DefaultProperties;
  } catch (err: any) {
    throw wrapDriverError(err);
  }
}
```
Padrões a preservar EXATAMENTE ao migrar para o pipeline pre/post:
1. `cloneDocumentDefaults(this.documentDefaults)` antes do merge com o doc do chamador — não remover (WR-06, evita vazamento de referência).
2. `try/catch` + `wrapDriverError(err)` ao redor da chamada ao driver — preservar em TODOS os métodos que hoje o têm (`insert`, `insertMany`, `bulkWrite`).
3. `getCollectionOrThrow()` chamado FORA do `try` (não dentro) — erro de "sem conexão" (`MongoatError`) não deve ser re-wrapado pelo catch de erro de driver (ver comentário linha 577-579 sobre `bulkWrite`).

**Padrão de `insertMany` (paralelo entre documentos) a preservar e estender** (linhas 485-515):
```typescript
async insertMany(
  documents: OptionalUnlessRequiredId<ModelType>[],
  options: BulkWriteOptions = {}
) {
  const _documents = documents.map((doc) => ({
    ...cloneDocumentDefaults(this.documentDefaults),
    ...doc,
  }));

  await Promise.all(
    _documents.map((doc) =>
      this.preMethod[METHODS.INSERT_MANY].bind(doc)(options)
    )
  );

  const collection = this.getCollectionOrThrow();
  try {
    return await collection.insertMany(_documents, options);
  } catch (err: any) {
    throw wrapDriverError(err);
  }
}
```
`Promise.all` continua correto para paralelizar ENTRE documentos (Pitfall 1 do RESEARCH.md) — a mudança é que, DENTRO de cada `_documents.map(...)`, os múltiplos hooks pre de um mesmo doc rodam com `for...of` sequencial (não `Promise.all`). Não regredir esse paralelismo entre documentos ao "consertar" a ordem interna.

**Escape hatch `getCollection()` — adicionar seguindo o padrão de `getCollectionOrThrow()` já existente** (linhas 350-372):
```typescript
private getCollectionOrThrow(): Collection<ModelType> {
  const collection = Model[kDatabase]?.getCollection<ModelType>(
    this.collectionName
  );

  if (!collection) {
    throw new MongoatError(
      'Database not connected — call db.connect() first'
    );
  }

  return collection;
}
```
O método público `getCollection()` (D-08/API-02) deve reaproveitar este helper privado exatamente como o RESEARCH.md recomenda (Pattern 7):
```typescript
getCollection(): Collection<ModelType> {
  return this.getCollectionOrThrow();
}
```
CRÍTICO: NÃO adicionar `'getCollection'` ao enum `METHODS` em `src/utils/enums.ts` — isso quebraria o escape total (ver Anti-Patterns do RESEARCH.md e `## Shared Patterns` abaixo).

**Erro de driver — reaproveitar sem modificação** (linhas 58-71):
```typescript
function wrapDriverError(err: unknown): MongoatError {
  return new MongoatError(err instanceof Error ? err.message : String(err), {
    cause: err,
  });
}
```
Usar esta mesma função para erros do driver capturados durante a etapa "chamar o driver" do pipeline hookado — não criar um wrapper de erro paralelo. Erros DE HOOKS (pre/post) não passam por `wrapDriverError` — propagam como o hook os lançou (ou como `MongoatError` se o hook usar `MongoatError` diretamente).

---

### `src/database/index.ts` (modificado — `getClient()`/`getDb()`)

**Analog:** `getCollection()` já existente no mesmo arquivo (linhas 287-289):
```typescript
getCollection<T extends Document>(collectionName: string) {
  return this[kDb]?.collection<T>(collectionName);
}
```
Padrão a replicar para `getClient()`/`getDb()` (API-03/D-08) — getter público que retorna diretamente o symbol privado, sem transformação:
```typescript
getClient(): MongoClient | undefined {
  return this[kClient];
}

getDb(): Db | undefined {
  return this[kDb];
}
```
Nota: `Database` nunca é Proxy-wrapped (só `Model` é, via `registerModel()` linha 280-285) — logo `getClient`/`getDb` já são "escape total" por natureza, sem nenhum gating a contornar. Symbols `kClient`/`kDb` já declarados (linhas 16-17, 30-32) — apenas expor getters públicos, não criar novos symbols.

**JSDoc pattern a seguir** (exemplo em `connect()`, linhas 100-114):
```typescript
/**
 * @public
 *
 * Connect to the database. ...
 * @returns A promise that resolves to a string containing the connection name,
 * or nothing if the connection is already established.
 */
```
Aplicar `@public` + nota de trade-off de segurança (D-08 pede documentação explícita e ostensiva do bypass) nos JSDocs de `getClient()`/`getDb()`/`getCollection()` (Model).

---

## Shared Patterns

### Symbols privados `k*`
**Source:** `src/database/index.ts` linhas 16-24, `src/model/index.ts` linha 35
**Apply to:** todo novo estado interno do pipeline de hooks (`kHookContext` para o `AsyncLocalStorage` por instância de Model)
```typescript
const kClient = Symbol('kClient');
const kDb = Symbol('kDb');
```

### `MongoatError` como base de erro
**Source:** `src/errors/index.ts` (arquivo completo, 22 linhas)
```typescript
export class MongoatError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'MongoatError';
    Object.setPrototypeOf(this, MongoatError.prototype);
  }
}
```
**Apply to:** `onHookError(err, ctx)` deve tipar `err` como `unknown` (não assumir `MongoatError`, pois hooks de terceiros podem lançar qualquer coisa); erros internos do próprio Mongoat relacionados a hooks (ex.: validação de argumento de `pre()`/`post()`) devem usar `new MongoatError(...)`, seguindo o padrão de `getCollectionOrThrow()`/construtor do `Model`.

### Fail-loud pré-conexão (D-10, padrão já estabelecido na Fase 1)
**Source:** `src/model/index.ts` linhas 360-372 (`getCollectionOrThrow`), `src/database/index.ts` linhas 344-348 (`withTransaction`)
```typescript
if (!this[kClient]) {
  throw new MongoatError(
    'Database not connected — call db.connect() first'
  );
}
```
**Apply to:** `getCollection()` no `Model` já herda esse comportamento via `getCollectionOrThrow()`. Manter a MESMA mensagem de erro literal (`'Database not connected — call db.connect() first'`) por consistência entre `Model` e `Database`.

### Proxy binding — `bind(target)` nunca `bind(receiver)`
**Source:** `src/database/index.ts` linhas 364-390 (`KModelProxyHandler`)
```typescript
static [KModelProxyHandler]() {
  return {
    get(target: Model<Document>, prop: METHODS, receiver: unknown) {
      if (
        target.methods.includes(prop) &&
        !target.allowedMethods.includes(prop)
      ) {
        throw new MongoatError(
          `The method "${prop}" is not allowed in "${target.collectionName}"`
        );
      }

      const value = Reflect.get(target, prop, receiver);

      if (typeof value === 'function') {
        return value.bind(target);
      }

      return value;
    },
  };
}
```
**Apply to:** CRÍTICO para HOOK-05 (D-07) — chamadas internas de um hook a `model.find()`/etc. reentram neste mesmo trap. O guard de gating (`target.methods.includes(prop) && !allowedMethods.includes(prop)`) SEMPRE roda antes do guard de reentrância do pipeline de hooks (que vive dentro do método já vinculado a `target`) — ou seja, mesmo em modo raw (D-07), o gating de `allowedMethods` continua ativo (só o pipeline de hooks é pulado). Não modificar este handler para a Fase 2 — `getCollection`/`getClient`/`getDb` escapam dele naturalmente por não estarem no enum `METHODS` (ver próximo item).

### Enum `METHODS` como fronteira do gating — NÃO adicionar os escape hatches
**Source:** `src/utils/enums.ts` linhas 1-14
```typescript
export enum METHODS {
  AGGREGATE = 'aggregate',
  UPDATE = 'update',
  UPDATE_MANY = 'updateMany',
  INSERT = 'insert',
  INSERT_MANY = 'insertMany',
  FIND_MANY = 'findMany',
  DELETE_MANY = 'deleteMany',
  BULK_WRITE = 'bulkWrite',
  FIND = 'find',
  FIND_BY_ID = 'findById',
  DELETE = 'delete',
  TOTAL = 'total',
}
```
**Apply to:** `getCollection` (Model), `getClient`/`getDb` (Database) NÃO entram nesta lista — é o próprio mecanismo do D-08 (ver Pattern 7 do RESEARCH.md). `this.methods = Object.values(METHODS)` (linha 270 de `src/model/index.ts`) continua igual — não tocar.

### Testes de integração — setup/teardown com Database real (testcontainers)
**Source:** `test/model/insertmany-hooks.test.ts` (arquivo completo, 78 linhas), `test/database/proxy-binding.test.ts` (arquivo completo, 133 linhas)
```typescript
import { Document } from 'mongodb';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { Database } from '@/database';
import { Model } from '@/model';
import { ModelValidationSchema } from '@/types';
import { METHODS } from '@/utils/enums';

describe('...', () => {
  let db: Database;

  beforeAll(async () => {
    db = new Database({
      uri: process.env.MONGODB_URI,
      dbName: process.env.MONGODB_DB_NAME,
    });

    await db.connect();
  });

  afterAll(async () => {
    Database.resetRegistry();
    await db.disconnect();
  });

  it('...', async () => {
    const model = new Model<Doc>({
      collectionName: 'nome_unico_por_teste',
      allowedMethods: [METHODS.INSERT_MANY, METHODS.FIND_MANY],
      schema,
    });

    await db.setupCollection(model as unknown as Model);

    // ... registrar hooks, exercitar, asserir
  });
});
```
**Apply to:** todos os 9 arquivos de teste novos listados em Wave 0 do RESEARCH.md (`hooks-pre-order.test.ts`, `hooks-post-order.test.ts`, `hooks-error-propagation.test.ts`, `hooks-fire-and-forget.test.ts`, `hooks-recursion-guard.test.ts`, `options-passthrough.test.ts`, `escape-hatch.test.ts` em `test/model/` e `test/database/`). Pontos obrigatórios:
- `collectionName` único por teste (evita colisão de registro entre testes — ver `isSameConfig`/D-06 em `src/model/index.ts`).
- `Database.resetRegistry()` no `afterAll` — limpa `KModelMap` estático entre suítes (D-09 da Fase 1).
- `db.setupCollection(model as unknown as Model)` antes de exercitar CRUD — cria a collection + valida o schema no MongoDB real.
- Comentário de cabeçalho referenciando o bug/requisito coberto (`QUAL-01`, `D-10`, etc.) — para os novos testes, referenciar `HOOK-01`..`HOOK-05`/`API-01`..`API-04` conforme o requisito coberto.

### Padrão de asserção de erro tipado (`MongoatError`)
**Source:** `test/model/connection-required.test.ts` linhas 46-49
```typescript
expect(() => model.total()).toThrow(MongoatError);
expect(() => model.total()).toThrow(
  'Database not connected — call db.connect() first'
);
```
**Apply to:** `hooks-error-propagation.test.ts` (asserir que erro de pre-hook aborta com o erro exato lançado pelo hook) e `hooks-recursion-guard.test.ts` (asserir ausência de stack overflow / MongoatError se aplicável).

## No Analog Found

Nenhum arquivo desta fase ficou sem analog — todos têm um par direto (arquivo irmão de tipos, o próprio `src/model/index.ts`/`src/database/index.ts` em seu estado atual, ou um teste de integração equivalente da Fase 1) por serem uma evolução incremental de uma base já estabelecida, não um domínio novo (ex.: não há streaming, não há novo protocolo de I/O).

## Metadata

**Analog search scope:** `src/model/`, `src/database/`, `src/types/`, `src/utils/`, `src/errors/`, `test/model/`, `test/database/`
**Files scanned:** `src/model/index.ts` (598 linhas, lido integralmente), `src/database/index.ts` (497 linhas, lido integralmente), `src/utils/enums.ts` (19 linhas), `src/errors/index.ts` (22 linhas), `src/types/model.ts` (79 linhas), `test/model/insertmany-hooks.test.ts` (78 linhas), `test/model/connection-required.test.ts` (52 linhas), `test/database/proxy-binding.test.ts` (133 linhas)
**Pattern extraction date:** 2026-07-07
