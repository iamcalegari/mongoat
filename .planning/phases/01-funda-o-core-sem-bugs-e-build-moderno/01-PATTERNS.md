# Phase 1: Fundação — Core sem bugs e build moderno - Pattern Map

**Mapped:** 2026-07-07
**Files analyzed:** 12 (5 arquivos existentes modificados + 7 novos)
**Analogs found:** 12 / 12 (todos os fixes são internos ao próprio arquivo; novos arquivos usam analogs externos ou de outras libs GSD)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|--------------------|------|-----------|-----------------|----------------|
| `src/model/index.ts` (fix insertMany, find, schema clone, registro) | model | CRUD | próprio arquivo (fix in-place) | exact |
| `src/database/index.ts` (fix Proxy binding, dbName fallback, `kGetDbName`) | service/middleware | request-response | próprio arquivo (fix in-place) | exact |
| `src/errors/index.ts` (novo) | utility | transform | nenhum analog local — padrão `class extends Error` do Node | no-analog-local |
| `src/types/model.ts` (ajuste tipo `find`, opcional vendorizar `JSONSchema4`) | config/types | transform | próprio arquivo | exact |
| `package.json` (engines/exports/files/scripts) | config | batch | próprio arquivo | exact |
| `tsconfig.json` / novo `tsdown.config.ts` | config | batch | `tsconfig.json` atual + docs tsdown | role-match |
| `vitest.config.ts` (novo) | config | batch | nenhum config de teste existente | no-analog-local |
| `test/setup/testcontainer.ts` (novo) | utility | event-driven | nenhum — infraestrutura de teste nova | no-analog-local |
| `test/model/insertMany-hooks.test.ts` (novo) | test | CRUD | nenhum teste existente no repo | no-analog-local |
| `test/model/find-typing.test.ts` (novo) | test | CRUD | nenhum teste existente no repo | no-analog-local |
| `test/model/schema-clone.test.ts` (novo) | test | transform | nenhum teste existente no repo | no-analog-local |
| `test/database/proxy-binding.test.ts`, `registry-race.test.ts`, `connection-required.test.ts` (novos) | test | request-response | nenhum teste existente no repo | no-analog-local |

**Nota geral:** esta fase é 100% correção de bugs + build tooling — não há features novas nem componentes/controllers no sentido tradicional. Os "analogs" mais fortes são os próprios arquivos-alvo (o fix é cirúrgico, dentro do padrão já estabelecido pelo restante do arquivo), exatamente como o RESEARCH.md já mapeou linha a linha. Para os arquivos genuinamente novos (`errors/`, `test/`, configs de build/test), não existe equivalente na base atual — os excertos abaixo usam o próprio código-fonte lido como referência de convenções (naming, símbolos `k`, JSDoc) e os Code Examples do RESEARCH.md como fonte da forma exata do código novo.

## Pattern Assignments

### `src/model/index.ts` (model, CRUD) — 5 fixes internos

**Analog:** o próprio arquivo — convenções já estabelecidas nos outros métodos da classe `Model`.

**Imports pattern** (linhas 1-33): manter grupo `mongodb` primeiro, depois `@/types/model`, `@/utils/enums`, `@/database`, `@/utils` — ordem de import alias já convencionada. Fix de `MongoatError` deve ser importado de `@/errors` neste bloco, junto dos demais aliases:
```typescript
import { MongoatError } from '@/errors';
```

**Fix 1 — hooks não aguardados no `insertMany`** (linhas 299-320, bug atual):
```typescript
// ANTES (bug — forEach não aguarda, hooks correm em paralelo sem bloquear)
documents.forEach(async (doc) => {
  await this.preMethod[METHODS.INSERT_MANY].bind(doc)(options);
});

const _documents = documents.map((doc) => ({
  ...this.documentDefaults,
  ...doc,
}));
```
Correção (Pattern 2 do RESEARCH.md, aplicar substituindo o `forEach`):
```typescript
await Promise.all(
  documents.map((doc) => this.preMethod[METHODS.INSERT_MANY].bind(doc)(options))
);

const _documents = documents.map((doc) => ({
  ...this.documentDefaults,
  ...doc,
}));
```
Contrato preservado: hooks mutam `doc` in-place via `.bind(doc)`; `_documents.map` roda depois do `Promise.all`, então captura a mutação.

**Fix 2 — tipo de retorno do `find()`** (linhas 322-331, bug atual):
```typescript
// ANTES
find(
  filter: Filter<ModelType> = {},
  options?: FindOptions
): Promise<WithId<ModelType> | null> | null {
  const collection = Model[kDatabase]?.getCollection<ModelType>(
    this.collectionName
  ) as Collection<ModelType>;

  return collection.findOne(filter, options) ?? null;
}
```
Correção — remover `| null` externo e o `?? null` morto (collection sempre existe após D-10 lançar erro antes):
```typescript
find(
  filter: Filter<ModelType> = {},
  options?: FindOptions
): Promise<WithId<ModelType> | null> {
  const collection = this.getCollectionOrThrow(); // helper novo de D-10

  return collection.findOne(filter, options);
}
```

**Fix 3 — clonagem de schema antes de mutar** (linhas 132-179, bug atual em `schemaValidatorBuilder`/`includeAdditionalPropertiesFalse`): usar `structuredClone` no início de `schemaValidatorBuilder`, exatamente como Pattern 4 do RESEARCH.md (linhas 313-336). Copiar literal daquele bloco — já é o código final esperado.

**Fix 4 — registro atômico com config divergente** (linhas 71-123, constructor): adicionar comparação de config antes do early-return em `if (!!model) return model;` (linha 78). Usar Pattern 5 do RESEARCH.md (linhas 341-357) como excerto literal. Comparação estrutural leve (schema serializado + `allowedMethods` + `validity`) — sem lib externa, ver "Don't Hand-Roll" do RESEARCH.md.

**Fix 5 — erro pré-conexão tipado (D-10)** (linhas 72-74, constructor):
```typescript
// ANTES
if (!Model[kDatabase]) {
  throw new Error('Database not found');
}
```
Correção — usar `MongoatError` novo:
```typescript
if (!Model[kDatabase]) {
  throw new MongoatError('Database not connected — call db.connect() first');
}
```
Aplicar o mesmo padrão de guard nos métodos que acessam `Model[kDatabase]?.getCollection(...)` via `as Collection<ModelType>` — extrair um helper privado `getCollectionOrThrow()` reaproveitado em `aggregate`, `update`, `updateMany`, `findMany`, `deleteMany`, `insert`, `insertMany`, `find`, `delete`, `total`, `bulkWrite` (todos hoje repetem o mesmo cast `as Collection<ModelType>` sem checagem — ver linhas 197-199, 216-218, 243-245, 259-261, 267-269, 285-287, 312-314, 326-328, 341-343, 351-353, 375-377).

**Error handling pattern já existente** (linhas 289-296, 315-320, 374-382): `try { ... } catch (err: any) { throw new MongoError(JSON.stringify(err, null, 2)); }` — **NÃO TOCAR nesta fase** (D-11 explicita que esse re-wrap muda só na Fase 3/SEC-04). Os novos erros desta fase (`MongoatError`) só nascem nos pontos D-06/D-08/D-10, nunca substituindo esse bloco existente.

---

### `src/database/index.ts` (service/middleware, request-response) — 3 fixes internos

**Analog:** o próprio arquivo.

**Fix 1 — binding do Proxy ao `target`** (linhas 309-330, bug atual em `KModelProxyHandler`):
```typescript
// ANTES (bug — bind() chamado mas resultado descartado; segunda linha refaz Reflect.get sem bind)
static [KModelProxyHandler]() {
  return {
    get(target: Model<Document>, prop: METHODS, receiver: unknown) {
      if (
        target.methods.includes(prop) &&
        !target.allowedMethods.includes(prop)
      ) {
        throw new Error(
          `The method "${prop}" is not allowed in "${target.collectionName}"`
        );
      }

      const originalMethod = target[prop as unknown as keyof typeof target];

      if (typeof originalMethod === 'function') {
        Reflect.get(target, prop, receiver).bind(target);
      }

      return Reflect.get(target, prop, receiver);
    },
  };
}
```
Correção literal — copiar Pattern 1 do RESEARCH.md (linhas 238-262):
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
Nota de segurança (Security Domain do RESEARCH.md): o guard de `allowedMethods` (linhas 312-319) não pode ser enfraquecido pelo fix — teste de regressão deve chamar um método fora de `allowedMethods` e assertar que ainda lança.

**Fix 2 — remoção do fallback de dbName de teste (D-08)** (linhas 395-411, `kGetDbName`):
```typescript
// ANTES (bug — fallback silencioso para 'mongoat-test' em produção)
[kGetDbName](): Promise<string> | string {
  if (process.env.MONGODB_DB_NAME) {
    return process.env.MONGODB_DB_NAME;
  }

  if (this.config.dbName) {
    return this.config.dbName;
  }

  const isTestSingleFile = !process.env.PACKAGE;

  if (isTestSingleFile) {
    return 'mongoat-test';
  }

  return `${process.env.PACKAGE}-test-${process.env.JEST_WORKER_ID || process.env.TAP_JOB_ID}`;
}
```
Correção:
```typescript
[kGetDbName](): string {
  if (process.env.MONGODB_DB_NAME) {
    return process.env.MONGODB_DB_NAME;
  }

  if (this.config.dbName) {
    return this.config.dbName;
  }

  throw new MongoatError(
    'No database name configured — set MONGODB_DB_NAME env var or config.dbName'
  );
}
```
Assinatura muda de `Promise<string> | string` para `string` (função síncrona pura) — atualizar `kGetUrlAndDbName` (linhas 385-393) e `kCreateClientConnection` (linhas 376-383) que fazem `await this[kGetDbName]()`.

**Fix 3 — `defineModel()` double-Proxy (known-issue opcional, ver Open Question 3 do RESEARCH.md)** (linhas 169-212): se o planner decidir corrigir, trocar `Model.create({...})` (linha 197) por leitura direta via `Model[kDatabase]?.getModel(collectionName)` reaproveitando a instância já registrada/proxied pelo constructor, eliminando o segundo `new Proxy(...)` na linha 207.

**Imports pattern** (linhas 1-13): adicionar `import { MongoatError } from '@/errors';` ao lado do bloco de imports de `@/model`, `@/types`, `@/utils/enums`.

---

### `src/errors/index.ts` (novo — utility, transform)

**Nenhum analog local** — classe de erro não existe hoje no projeto (erros são `throw new Error(...)` inline ou `MongoError` do driver). Usar literalmente o Code Example do RESEARCH.md (linhas 454-464):
```typescript
export class MongoatError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'MongoatError';
    Object.setPrototypeOf(this, MongoatError.prototype);
  }
}
```
**Convenção a seguir:** adicionar comentário JSDoc `/** @public */` acima da classe, seguindo o padrão de `src/database/index.ts:36-53` e `src/model/index.ts` (JSDoc em métodos públicos). Registrar o export no barrel `src/index.ts` (padrão `export { X } from './Y';`, ver `src/index.ts:1-15`).

**Security note (Threat Pattern do RESEARCH.md):** mensagem de erro de config divergente (D-06) não deve fazer `JSON.stringify` do schema completo do usuário — só nome da collection + fato da divergência.

---

### `src/types/model.ts` (config/types, transform)

**Analog:** o próprio arquivo.

**Import atual (linha 2)** a resolver conforme Pitfall 2 do RESEARCH.md:
```typescript
import { JSONSchema4 } from 'json-schema';
```
Duas opções (decisão do planner conforme resultado do `attw` — ver Open Question 2):
1. Mover `json-schema` para `devDependencies` e manter o import (mais simples, depende de `rolldown-plugin-dts` bundlar corretamente).
2. Vendorizar o subset usado de `JSONSchema4` (~10-15 campos: `bsonType`, `properties`, `items`, `required`, `description`, `pattern`, `enum` etc.) diretamente neste arquivo, eliminando o import (fallback documentado em Pitfall 2).

Nenhuma mudança na estrutura de `ModelValidationSchema` (linhas 54-62) é necessária além de resolver a origem de `JSONSchema4`.

---

### `package.json` (config, batch)

**Analog:** o próprio arquivo — comparar bloco `exports`/`engines`/`files`/`scripts` atual (linhas 15-72) contra o alvo.

**Exports map dual** — copiar literal do Code Example do RESEARCH.md (linhas 413-439), adaptando ao campo `files: ["lib"]` (D-05, remove `src` e `tsconfig.json` da lista atual em `files` linhas 43-47) e `engines` (D-01, substitui linha 15-17).

**Scripts** — `build` (linha 19) migra de `tsc --project tsconfig.build.json && tsc-alias` para `tsdown`; adicionar `check:package` conforme Code Example (linhas 442-451); `example` (linha 20) migra de `ts-node --` para `tsx` (D-16).

**Dependencies** — mover `json-schema` (linha 25) para `devDependencies` ou remover totalmente (ver decisão em `src/types/model.ts` acima); remover `tsc-alias`/`tsconfig-paths`/`ts-jest`/`ts-node-dev`/`typescript-cached-transpile` de `devDependencies` (linhas 34-41) conforme instalação do RESEARCH.md (linha 122 do bloco `Installation`).

**Subpath exports** (linhas 56-71, `./database`, `./model`, `./utils`, `./types`) — decisão de manter ou remover é do planner (Claude's Discretion no CONTEXT.md); se mantidos, seguir o mesmo formato dual (`import`/`require` com `types` primeiro) do entry principal.

---

### `tsconfig.json` + `tsdown.config.ts` (novo) (config, batch)

**Analog:** `tsconfig.json` atual (aliases em `paths`, linhas 42-48) — o `tsdown.config.ts` deve resolver os mesmos aliases (`@/*`, `@utils/*`, `@types/*`) nativamente ou via `alias` explícito (ver Open Question 1 do RESEARCH.md — validar com smoke test antes de prosseguir).

**Ajuste de `target`** (D-02): `tsconfig.json:7` (`"target": "ES2022"`) sobe para `ES2023` conforme decisão de research. Manter `useUnknownInCatchVariables: false` (linha 39) — **não habilitar nesta fase** (Pitfall 4 do RESEARCH.md).

**`tsconfig.build.json`** — provavelmente removido/obsoleto após migração para `tsdown` (o bundler não depende de um tsconfig de build separado da forma que `tsc --project` dependia); confirmar no planning se ainda é referenciado em algum script.

---

### `vitest.config.ts` (novo, config, batch)

**Nenhum analog local.** Usar `vite-tsconfig-paths` plugin para resolver os mesmos aliases do `tsconfig.json` (Pitfall 5 do RESEARCH.md) — sem isso, todo teste falha no import.

```typescript
// Estrutura mínima esperada (baseado no Pitfall 5 e Recommended Project Structure do RESEARCH.md)
import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globalSetup: ['./test/setup/testcontainer.ts'],
  },
});
```

---

### `test/setup/testcontainer.ts` (novo, utility, event-driven)

**Nenhum analog local** (não há `test/` hoje). Segue Recommended Project Structure do RESEARCH.md (linhas 217-219): helper que sobe `@testcontainers/mongodb`, expõe URI via env/global, encerra no teardown. Usar `globalSetup`/`globalTeardown` do vitest.

---

### Arquivos de teste novos (`test/model/*.test.ts`, `test/database/*.test.ts`)

**Nenhum analog local** (zero testes hoje, `ts-jest` estava morto sem specs — confirmado em CONCERNS.md). Cada arquivo mapeia 1:1 a um bug/comportamento da tabela "Phase Requirements → Test Map" do RESEARCH.md (linhas 529-541) — usar essa tabela como índice de arquivos a criar. Padrão de import: `@test/*` alias já existe em `tsconfig.json:45` e deve ser espelhado em `vitest.config.ts`.

**Pitfall a testar explicitamente (Pitfall 3 do RESEARCH.md):** `test/database/proxy-binding.test.ts` deve exercitar tanto `new Model()` direto quanto `Database.defineModel()` (deprecated) para confirmar que o fix do Proxy binding não quebra o caminho double-wrap.

## Shared Patterns

### Símbolos `k`-prefixed para estado privado
**Source:** `src/database/index.ts:15-22`, `src/model/index.ts:35`
**Apply to:** qualquer novo estado interno (ex.: guard de config do registry em D-06)
```typescript
const kClient = Symbol('kClient');
const kDatabase = Symbol('kDatabase');
```

### `MongoatError` como base de erros novos da fase
**Source:** `src/errors/index.ts` (novo, ver acima)
**Apply to:** `src/model/index.ts` (D-06, D-10), `src/database/index.ts` (D-08)
- Substituir `throw new Error(...)` genérico nos 3 pontos novos.
- **Não** substituir `throw new MongoError(JSON.stringify(err, null, 2))` (fora de escopo, D-11/Fase 3).

### JSDoc `@public`/`@private`/`@deprecated`
**Source:** `src/database/index.ts:36-53`, `src/database/index.ts:146-168` (`@deprecated`)
**Apply to:** qualquer método público novo ou tocado (ex.: `MongoatError`, helper `getCollectionOrThrow`, API de reset do registry D-09)

### Comparação estrutural leve sem lib externa
**Source:** Don't Hand-Roll do RESEARCH.md (linha 371) — decisão de projeto "mínimo de dependências de runtime"
**Apply to:** `isSameConfig` em `src/model/index.ts` (D-06) — usar `JSON.stringify`/comparação de campos específicos, nunca `lodash.isequal`/`fast-deep-equal`.

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `src/errors/index.ts` | utility | transform | Módulo novo — projeto não tinha hierarquia de erros própria antes desta fase |
| `vitest.config.ts` | config | batch | Projeto não tinha test runner configurado (ts-jest estava morto, sem config funcional) |
| `test/setup/testcontainer.ts` | utility | event-driven | Sem infraestrutura de teste com containers hoje |
| `test/**/*.test.ts` (7 arquivos) | test | CRUD / request-response | Zero testes existentes no repositório |
| `tsdown.config.ts` | config | batch | Bundler novo, sem config equivalente (build atual é `tsc` puro via `tsconfig.build.json`) |

Para os arquivos acima, o planner deve usar diretamente os Code Examples e Architecture Patterns do `01-RESEARCH.md` (seções "Code Examples", "Architecture Patterns", "Recommended Project Structure") como fonte primária, já que não há precedente no código atual.

## Metadata

**Analog search scope:** `src/` (todos os módulos), `package.json`, `tsconfig.json`, `src/utils/enums.ts`, `src/index.ts`; verificado ausência de diretório `test/`
**Files scanned:** 7 (todos os arquivos-fonte relevantes da lib) + configs de build
**Pattern extraction date:** 2026-07-07
