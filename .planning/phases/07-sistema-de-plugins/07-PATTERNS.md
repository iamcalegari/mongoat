# Fase 7: Sistema de plugins - Mapa de Padrões

**Mapeado:** 2026-07-15
**Arquivos analisados:** 9 (2 novos código, 1 tipo novo, 2 modificados, 1 erros, 9 testes novos)
**Analogs encontrados:** 7/9 (2 sem analog direto — ver seção final)

## File Classification

| Arquivo Novo/Modificado | Role | Data Flow | Analog Mais Próximo | Match Quality |
|---|---|---|---|---|
| `src/model/plugins.ts` (NOVO) | utility/service (funções puras de resolução) | transform | `src/model/hooks.ts` (`buildContext`/`runPreHooks`/`runPostHooks`) | role-match |
| `src/model/index.ts` (constructor — bloco de plugins) | model (mutação de estado do construtor) | CRUD (config-time, síncrono) | ele mesmo — bloco `decoratedHooks`/`props.hooks` (linhas 427-539) | exact (mesmo arquivo, mesmo construtor) |
| `src/database/index.ts` (nenhuma mudança prevista — só referência) | model registry | request-response (Proxy trap) | `registerModel`/`KModelProxyHandler` (linhas 211-216, 337-364) | exact (reuso, zero mudança) |
| `src/types/plugin.ts` (NOVO) | types | — | `src/types/hooks.ts` (`HookFn`, `HookConfig`, `HookContextMap`) | exact |
| `src/types/model.ts` (`CreateModelProps.plugins`) | types (config) | — | campo `hooks?:` já existente na mesma interface (linhas 69-73) | exact |
| `src/errors/index.ts` (nenhum código novo — reuso de `MongoatValidationError`) | error hierarchy | — | `MongoatValidationError` (linhas 52-61) | exact (reuso puro, zero classe nova) |
| `test/model/plugins-*.test.ts` (9 arquivos, Wave 0) | test | CRUD/event-driven | `test/model/hooks-pre-order.test.ts`, `test/model/registry-config.test.ts` | exact |

## Pattern Assignments

### `src/model/plugins.ts` (NOVO — utility, transform)

**Analog primário:** `src/model/hooks.ts` (padrão de função pura que recebe registry + ctx e produz efeito) + o próprio `src/model/index.ts` para o padrão de normalização inline já existente.

**Padrão de normalização inline já usado no core** (`src/model/index.ts:532-536`, dentro do bloco `props.hooks`):
```typescript
if (config.post) {
  this.hooks[method].post.push(
    ...config.post.map((entry) =>
      typeof entry === 'function' ? { fn: entry } : entry
    )
  );
}
```
Este é o modelo EXATO para `normalizePlugin` (D-01): `typeof plugin === 'function' ? { name: ..., setup: plugin } : plugin` — a lib já tem o costume de normalizar no boundary, nunca espalhar `typeof x === 'function'` pelos call-sites. RESEARCH.md §Pattern 1 já fornece o código-fonte proposto; use-o como está.

**Padrão de erro tipado (`MongoatValidationError` + `.code`)** — copiar de `src/model/index.ts:454-482` (bloco `if (existing)` do construtor, que já lança `MongoatValidationError` com `code: 'MODEL_CONFIG_CONFLICT'`):
```typescript
throw new MongoatValidationError(
  `Model "${resolvedCollectionName}" already registered with a different configuration`,
  { code: 'MODEL_CONFIG_CONFLICT' }
);
```
Molde direto para `DUPLICATE_PLUGIN_NAME`, `STATIC_COLLISION`, `PLUGIN_SETUP_FAILED` — mesma forma `new MongoatValidationError(message, { cause?, code })`, nunca uma classe de erro nova (D-10/D-08/D-07 reusam a hierarquia da Fase 3, não introduzem subclasse).

**Padrão de cópia desconectada (nunca referência viva)** — copiar de `src/model/index.ts:569` (`schemaValidatorBuilder`) e `cloneDocumentDefaults` (linhas 165-200):
```typescript
const clonedSchema = structuredClone(schema);
```
Este é o precedente EXATO que RESEARCH.md §Pattern 3 recomenda reusar para `PluginContext.schema` — `structuredClone` já é idioma do projeto para "nunca vazar a referência viva de um schema", não uma técnica nova introduzida por esta fase.

**Padrão Map-based dedup/registry** — não há um `Map` de dedup por referência já no código, mas o padrão estático `Map<string, Model>` de `Database` (ver abaixo, `KModelMap`) é o precedente estrutural mais próximo para `pluginStaticOwners`/`seen` (Pattern 2/4 do RESEARCH.md).

---

### `src/model/index.ts` — bloco de resolução de plugins no construtor (PLUG-01)

**Analog:** o próprio construtor, bloco de hooks decorados + `props.hooks` (linhas 499-539).

**Ponto de inserção exato** — ESTRITAMENTE entre o loop `decoratedHooks.post` (termina linha 517) e `if (props.hooks)` (linha 522):
```typescript
// linha 499-517 (JÁ EXISTENTE, decoratedHooks.pre/post — não mexer)
for (const { method, fn } of decoratedHooks.pre as unknown as {...}[]) {
  this.hooks[method].pre.push(fn);
}
for (const { method, fn } of decoratedHooks.post as unknown as {...}[]) {
  this.hooks[method].post.push({ fn });
}

// <<< NOVO NESTA FASE: bloco de resolução de plugins entra AQUI >>>
// (globais Model[kGlobalPlugins] → props.plugins locais, dedup, setup()
// síncrono em try/catch, ctx.pre/post/static)

// linha 522 (JÁ EXISTENTE, não mexer)
if (props.hooks) { ... }
```
Isso é confirmado por leitura linha-a-linha do arquivo atual — RESEARCH.md §"Nota de ordem crítica" já cravou este ponto; o pattern mapper confirma que as linhas batem com o arquivo real lido nesta sessão.

**Padrão de guard de conexão/estado síncrono no topo do construtor** (linhas 349-354) — mesmo estilo fail-loud a copiar para o guard "primeiro model construído" (trava do PLUG-02, D-11/Pitfall 5):
```typescript
if (!Model[kDatabase]) {
  throw new MongoatConnectionError(
    'Database not connected — call db.connect() first'
  );
}
```

**Padrão Symbol-key privado de estado interno** (linha 64-65, `kDatabase`/`kHookContext`) — molde EXATO para `kResetPlugins`, `kGlobalPlugins`, `kPluginsLocked`:
```typescript
const kDatabase = Symbol('kDatabase');
const kHookContext = Symbol('kHookContext');
```
E o campo estático correspondente (linha 334):
```typescript
static [kDatabase]: Database | undefined;
```
Aplicar o MESMO padrão para o storage estático global de plugins:
```typescript
static [kGlobalPlugins]: PluginObject<Document>[] = [];
static [kPluginsLocked] = false; // ou nome equivalente — Claude's Discretion
```

**Padrão de método interno `static` de reset já existe em `Database`, não em `Model`** — ver seção `src/database/index.ts` abaixo (`resetRegistry`); replicar a MESMA forma (`static` limpando um `Map`/array estático) para `Model[kResetPlugins]`.

---

### `src/database/index.ts` — Proxy trap e reset de registry (referência, zero mudança)

**Analog:** `registerModel` (linhas 211-216) + `KModelProxyHandler` (linhas 337-364) + `resetRegistry` (linhas 198-200).

**Bind pattern (D-12 — statics de plugin herdam de graça)** — linhas 352-359:
```typescript
// Bind ALWAYS to `target` (the raw instance), never to `receiver`
// (the Proxy itself) — binding to `receiver` would make every
// internal `this.xxx` access inside the method re-enter this trap...
if (typeof value === 'function') {
  return value.bind(target);
}
```
CONFIRMADO: nenhuma mudança necessária neste arquivo — qualquer propriedade função anexada dinamicamente a `model` (via `(model as Record<string, unknown>)[name] = fn` em `src/model/plugins.ts`) passa por este MESMO trap na primeira leitura via a instância Proxy-wrapped e é bound automaticamente a `target`. É o precedente que elimina qualquer trabalho extra para D-12.

**Padrão de reset estático — molde direto para `Model[kResetPlugins]`** (linhas 188-200):
```typescript
/**
 * @internal
 *
 * Clears the static model registry (`KModelMap`).
 *
 * Not part of the public API — intended for test suites that need to
 * isolate registry state between cases (D-09)...
 */
static resetRegistry(): void {
  Database[KModelMap].clear();
}
```
Copiar a MESMA forma de JSDoc (`@internal`, "Not part of the public API", menção a uso em `beforeEach`) para `Model[kResetPlugins]` — inclusive o padrão de Symbol-key para o nome do método em si (`KModelMap`/`KModelProxyHandler` já são Symbols; o próprio MÉTODO de reset de `Database` é público (`resetRegistry`), mas o de `Model` deve ser Symbol-keyed por D-11 ("fora do barrel público") — usar a forma `Model[kResetPlugins]()`, não um método nomeado public).

**Static Map estático da classe** (linha 38) — molde para a lista global de plugins:
```typescript
private static [KModelMap] = new Map<string, Model>();
```
Equivalente em `Model`:
```typescript
private static [kGlobalPlugins]: PluginObject<Document>[] = [];
```

---

### `src/types/plugin.ts` (NOVO)

**Analog:** `src/types/hooks.ts` inteiro (mesma camada de tipo, mesmo padrão de composição sobre `METHODS`/`Document`).

**Padrão de tipo função + registro** (`HookFn`, linhas 35-37):
```typescript
export type HookFn<Ctx> = (
  ctx: Ctx
) => void | unknown | Promise<void | unknown>;
```
Molde direto para `PluginSetup<ModelType>`.

**Padrão de interface de config declarativa** (`HookConfig`, linhas 63-66):
```typescript
export interface HookConfig<Ctx> {
  pre?: HookFn<Ctx>[];
  post?: (HookFn<Ctx> | PostHookEntry<Ctx>)[];
}
```
Molde estrutural para `PluginObject<ModelType>` (`{ name?, setup }`).

**RESEARCH.md já fornece o bloco completo pronto para copiar** (`src/types/plugin.ts` proposto, linhas 460-496 do RESEARCH.md) — usar como ponto de partida, apenas confirmando import de `ModelValidationSchema` de `@/types/model` (existe, linha 111 de `src/types/model.ts`) em vez de reinventar o tipo do schema.

---

### `src/types/model.ts` (`CreateModelProps.plugins`)

**Analog:** o campo `hooks?:` já existente na MESMA interface (linhas 69-73):
```typescript
/**
 * Declarative pre/post hook registration — merged BEFORE any later
 * `.pre()`/`.post()` chainable calls (constructor hooks run first).
 */
hooks?: { [M in METHODS]?: HookConfig<HookContextMap<ModelType>[M]> };
```
Copiar o MESMO estilo de JSDoc (comentário de ordem/precedência acima do campo) para o novo campo:
```typescript
/**
 * Plugins locais deste model, aplicados DEPOIS dos plugins globais
 * (`Model.plugin()`) e ANTES do wrap em Proxy (PLUG-01). Ver D-05/D-06.
 */
plugins?: Plugin<ModelType>[];
```
(bloco já pronto em RESEARCH.md §Code Examples, linhas 498-509 — usar tal como está.)

---

### `src/errors/index.ts` — reuso, zero classe nova

**Analog:** `MongoatValidationError` (linhas 52-61) — NENHUMA subclasse nova é necessária; os 3 codes novos (`DUPLICATE_PLUGIN_NAME`, `STATIC_COLLISION`, `PLUGIN_SETUP_FAILED`) são apenas STRINGS passadas ao `code` já existente:
```typescript
export class MongoatValidationError extends MongoatError {
  constructor(message: string, options?: { cause?: unknown; code?: string }) {
    super(message, {
      cause: options?.cause,
      code: options?.code ?? 'VALIDATION_FAILED',
    });
    this.name = 'MongoatValidationError';
    Object.setPrototypeOf(this, MongoatValidationError.prototype);
  }
}
```
Uso nos 3 novos codes:
```typescript
throw new MongoatValidationError(`...`, { code: 'DUPLICATE_PLUGIN_NAME' });
throw new MongoatValidationError(`...`, { code: 'STATIC_COLLISION' });
throw new MongoatValidationError(`...`, { cause: err, code: 'PLUGIN_SETUP_FAILED' });
```
Único ponto de atenção: o JSDoc do bloco `@public` acima da classe (linhas 44-50) lista os codes existentes em prosa — ao adicionar os 3 novos codes, ATUALIZAR esse comentário na mesma lista (`ex.: INVALID_OBJECT_ID, FORBIDDEN_OPERATOR, MODEL_CONFIG_CONFLICT, ...`), não deixar o JSDoc desatualizado.

---

### `test/model/plugins-*.test.ts` (9 arquivos, Wave 0)

**Analog primário:** `test/model/hooks-pre-order.test.ts` (estrutura completa) + `test/model/registry-config.test.ts` (uso de `Database.resetRegistry()`/`beforeEach`).

**Imports/setup padrão** (copiar literalmente):
```typescript
import { Document } from 'mongodb';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { Database } from '@/database';
import { Model } from '@/model';
import { ModelValidationSchema } from '@/types';
import { METHODS } from '@/utils/enums';
```

**Padrão `beforeAll`/`afterAll` com container real (testes de integração — D-12/binding):**
```typescript
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
  // ...
});
```
`Database.resetRegistry()` já limpa `KModelMap` entre suites — para os testes de `plugins-global-lock.test.ts`/`plugins-reset.test.ts` (D-11), adicionar TAMBÉM `Model[kResetPlugins]()` no mesmo `afterAll`/`beforeEach` — mas como `kResetPlugins` é Symbol module-private (fora do barrel público por design, D-11), os testes internos do repositório (`test/model/`) podem importar o Symbol diretamente do módulo fonte (`@/model`) se ele for exportado do módulo (não do barrel `src/index.ts`) — checar RESEARCH.md/CONTEXT.md não especifica se o Symbol é exportado nomeadamente do módulo; **Claude's Discretion do CONTEXT.md cobre isso** — usar o mesmo padrão de export que `kDatabase`/`kHookContext` já usam (não exportados hoje — `test/model/*.test.ts` atual NUNCA acessa Symbols internos de `Model` diretamente, só via `Database.resetRegistry()` que é público). Recomendação: se `kResetPlugins` precisar ser chamado a partir dos testes, exportar o Symbol (não o método) do módulo `@/model`, análogo a como nenhum Symbol de `Model` é hoje exportado — decisão do planner/implementador na Wave 0.

**Padrão de teste de ordem de execução (spy via array `executionOrder`)** — copiar de `hooks-pre-order.test.ts:48-75`:
```typescript
it('...', async () => {
  const executionOrder: string[] = [];

  const model = new Model<Doc>({
    collectionName: '...',
    allowedMethods: [METHODS.INSERT],
    schema,
    plugins: [
      { name: 'a', setup: (ctx) => ctx.pre(METHODS.INSERT, () => executionOrder.push('a')) },
    ],
  });

  await db.setupCollection(model as unknown as Model);
  await model.insert({ name: 'alpha' });

  expect(executionOrder).toEqual([...]);
});
```

**Padrão de teste de erro tipado (`error-hierarchy.test.ts`)** — verificar via leitura rápida se necessário; mesmo idioma de `expect(() => new Model(...)).toThrow(MongoatValidationError)` + checagem de `.code`, consistente com o resto da suíte de erros da Fase 3/6.

## Shared Patterns

### Symbol-key privado para estado interno da classe
**Fonte:** `src/model/index.ts:64-65` (`kDatabase`, `kHookContext`) e `src/database/index.ts:16-24` (`kClient`, `KModelMap`, `KModelProxyHandler`)
**Aplicar a:** `kResetPlugins`, `kGlobalPlugins` (lista estática global), `kPluginsLocked` (flag de trava PLUG-02), `pluginStaticOwners` (se module-level em vez de instance-level)
```typescript
const kDatabase = Symbol('kDatabase');
// ...
static [kDatabase]: Database | undefined;
```

### Erro tipado com `.code` estável (nunca subclasse nova)
**Fonte:** `src/errors/index.ts:52-61` (`MongoatValidationError`)
**Aplicar a:** `DUPLICATE_PLUGIN_NAME`, `STATIC_COLLISION`, `PLUGIN_SETUP_FAILED`
```typescript
throw new MongoatValidationError(message, { cause, code: 'PLUGIN_SETUP_FAILED' });
```

### Cópia desconectada via `structuredClone` (nunca `Object.freeze` de referência viva)
**Fonte:** `src/model/index.ts:569` (`schemaValidatorBuilder`), `cloneDocumentDefaults` (linhas 165-200)
**Aplicar a:** `PluginContext.schema` (D-03) — `structuredClone(model.validator.$jsonSchema)`, nunca `Object.freeze` direto na referência viva.

### Bind automático via Proxy trap (D-12 — zero trabalho extra)
**Fonte:** `src/database/index.ts:337-364` (`KModelProxyHandler`, `value.bind(target)`)
**Aplicar a:** Statics de plugin anexados dinamicamente a `this` dentro do construtor — já herdam bind ao ler através da instância Proxy-wrapped; NENHUM `.bind()` manual necessário em `registerPluginStatic`.

### Normalização no boundary, nunca espalhada pelos call-sites
**Fonte:** `src/model/index.ts:532-536` (normalização de post-hook `typeof entry === 'function' ? { fn: entry } : entry`)
**Aplicar a:** `normalizePlugin` (D-01) — mesmo idioma `typeof plugin === 'function' ? {...} : plugin`.

### Reset estático para isolamento de testes (D-11)
**Fonte:** `src/database/index.ts:188-200` (`Database.resetRegistry()`), consumido em `test/model/registry-config.test.ts:34-35` (`beforeEach`)
**Aplicar a:** `Model[kResetPlugins]()` — mesma forma de JSDoc `@internal` + doc de uso em `beforeEach`.

## No Analog Found

| Arquivo | Role | Data Flow | Razão |
|---|---|---|---|
| `src/model/plugins.ts` — lógica de `resolvePluginList`/dedup por referência+nome | utility | transform | Não existe hoje nenhum `Map<ref, T>` de dedup por referência no codebase — o padrão mais próximo é o `Map<string, Model>` de `KModelMap` (dedup por STRING, não por referência de objeto). Usar RESEARCH.md §Pattern 2 como fonte primária (já verificado/completo), não um analog do codebase. |
| Guarda de colisão de statics contra nomes PRIVADOS do protótipo (`RESERVED_NAMES` incluindo `rawInsert`/`executeHooked`/etc.) | utility | transform | Nenhuma feature anterior precisou enumerar os métodos privados do `Model` como uma lista de proteção — é uma necessidade nova introduzida por D-08/Pitfall 2. RESEARCH.md §Pattern 4 já fornece a lista completa via grep real do arquivo atual; usar como fonte primária. |

## Metadata

**Escopo de busca de analog:** `src/model/`, `src/database/`, `src/types/`, `src/errors/`, `test/model/`, `test/setup/`
**Arquivos lidos integralmente:** `src/model/index.ts` (1209 linhas), `src/database/index.ts` (473 linhas), `src/types/model.ts`, `src/types/hooks.ts`, `src/errors/index.ts`, `src/utils/enums.ts`, `test/model/hooks-pre-order.test.ts`, `test/setup/testcontainer.ts` (trecho)
**Data de extração:** 2026-07-15
