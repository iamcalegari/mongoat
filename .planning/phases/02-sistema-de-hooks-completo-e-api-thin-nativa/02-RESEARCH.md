# Phase 2: Sistema de hooks completo e API thin nativa - Research

**Researched:** 2026-07-07
**Domain:** Pipeline de hooks pre/post (middleware pattern) + passthrough tipado de options nativas do driver MongoDB, dentro de uma arquitetura Proxy/registry já existente
**Confidence:** MEDIUM (arquitetura interna verificada por leitura direta do código-fonte = HIGH; padrões de mercado — Mongoose, Papr — via WebSearch/WebFetch sem Context7 disponível nesta sessão = MEDIUM/LOW; decisões de design novas propostas aqui, sem precedente externo direto = ASSUMED, sinalizadas no Assumptions Log)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** API de registro **dupla**: declarativa no construtor (`new Model({ hooks: { insert: { pre: [...], post: [...] } } })`) **e** métodos encadeáveis `model.pre(METHOD, fn)` / `model.post(METHOD, fn)` para registro tardio/condicional. O `.pre()` atual deixa de sobrescrever e passa a **acumular** (breaking de comportamento, aceitável em alpha).
- **D-02:** Execução em **ordem de registro**, aguardada sequencialmente (leitura literal de HOOK-01). Ordem entre hooks do construtor e hooks encadeáveis: construtor primeiro, depois os encadeáveis na ordem de chamada — a critério do planning confirmar/documentar.
- **D-03:** Hook recebe um **objeto de contexto explícito `ctx`** — `(ctx) => ...` (sync ou async). Elimina o `this = documento` mágico do `.bind()` atual. O `ctx` carrega ao menos: `filter`, `doc`/`document` (quando aplicável), `options`, `result` (post), e metadados (nome do método, model). Breaking na assinatura atual dos pre-hooks — aceitável em alpha. Formato exato do `ctx` por método → pesquisa/planning.
- **D-04:** Post-hook **observa por padrão, transforma opt-in**. Por padrão lê `ctx.result` para efeitos colaterais (log, cache, métricas) e o retorno ao caller é o resultado cru do driver. Transformar o valor entregue ao caller exige sinal explícito (retornar valor do hook **ou** flag no registro — mecanismo exato a definir na pesquisa). Quando transformação está ativa, o valor final é `ctx.result` após todos os post-hooks.
- **D-05:** (Travado por HOOK-03) erro em **pre-hook aborta** a operação antes da chamada ao driver; erro em **post-hook propaga** ao caller por padrão.
- **D-06:** Post-hook `fireAndForget` (opt-in explícito no registro) **não propaga**; o erro é entregue a um **callback opcional `onHookError(err, ctx)`** configurável no model/database. Sem callback → **fallback `console.error`**. Nunca engolir em silêncio total. (Alinha com a direção de SEC-03/SEC-04 sem antecipá-las.)
- **D-07:** Quando um hook chama um método do próprio model, a **chamada aninhada roda em modo raw** — a operação re-entrante executa **sem re-disparar hooks**, evitando o loop mas completando a chamada. Hooks podem usar `model.find()`/etc. livremente. Comportamento implícito a **documentar** claramente. (Detalhe de implementação — flag de reentrância por contexto — a critério do planning.)
- **D-08:** `model.getCollection()`, `database.getClient()`, `database.getDb()` são **escape total**: devolvem o objeto **cru do driver**, sem hooks **e** sem gating de `allowedMethods`. É o escape hatch honesto ("você saiu da zona segura — agora é o driver puro"), alinhado ao core value (acesso direto ao driver nativo). Documentar o trade-off explicitamente. Naming exato (`getCollection` vs `.raw`/`.native`) → planning.
- **D-09:** (Largamente mecânica) todo método do Model aceita e repassa options nativas com os **tipos do driver** (`FindOptions`, `AggregateOptions`, `BulkWriteOptions`, etc.) e retorna resultados **precisa e consistentemente tipados**. Decorrência de D-03: como o `ctx` carrega `options`, um **pre-hook pode ajustar as options** antes da chamada ao driver.

### Claude's Discretion

- Mecanismo exato do opt-in de transformação do post-hook (retorno do hook vs flag no registro) — D-04.
- Formato preciso e tipagem do `ctx` por método (quais campos existem em cada método) — D-03.
- Implementação do modo raw / flag de reentrância do guard de recursão — D-07.
- Naming e forma exata do escape hatch (`getCollection` vs `.raw`/`.native`) — D-08.
- Design da tipagem genérica que garante options e retornos precisos por método — D-09.
- Ordem exata entre hooks declarados no construtor vs encadeáveis — D-02.

### Deferred Ideas (OUT OF SCOPE)

- **Hooks em transações** (o `ctx` carregar a `session` de `withTransaction`) — v2 (já listado em REQUIREMENTS v2); nesta fase o `ctx` não precisa expor `session`.
- **Hierarquia completa de erros + sanitização das mensagens do driver** — Fase 3 (SEC-03/SEC-04); esta fase só reutiliza a base `MongoatError` e introduz `onHookError`.
- **Contexto tipado e selado para plugins (`PluginContext`)** — Fase 6 (PLUG-03); o `ctx` de hooks desta fase é o precursor conceitual, mas o contrato de plugins é separado.
- Confirmar/ajustar naming do escape hatch (`getCollection` vs `.raw`/`.native`) — decisão de planning desta fase, não adiada, apenas não travada aqui.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| HOOK-01 | Múltiplos handlers `pre` por método, ordem de registro, aguardados sequencialmente (incluindo `insertMany`) | Ver `## Architecture Patterns` → Pattern 1 (Hook Registry) e Pattern 2 (Pipeline sequencial); `## Common Pitfalls` → Pitfall 1; recomendação para `insertMany` (paralelo entre documentos, sequencial por documento) |
| HOOK-02 | Hooks `post` em todos os métodos CRUD, com acesso ao resultado via `ctx` | Pattern 1 + Pattern 3 (ctx por método) + `## Don't Hand-Roll` (opt-in de transformação via retorno) |
| HOOK-03 | Erro em pre-hook aborta antes do driver; erro em post-hook propaga por padrão | Pattern 2 (semântica de erro) + `## Common Pitfalls` → Pitfall 3 |
| HOOK-04 | Post-hook `fireAndForget` opt-in, erros não propagam, vão para `onHookError`/`console.error` | Pattern 4 (fireAndForget) + `## Open Questions` (await vs detach) |
| HOOK-05 | Guard contra recursão infinita quando hook chama método do próprio model | Pattern 5 (AsyncLocalStorage por instância) + `## Common Pitfalls` → Pitfall 2 |
| API-01 | Todos os métodos aceitam/repassam options nativas tipadas do driver | Pattern 6 (options passthrough + mutação via ctx) |
| API-02 | `model.getCollection()` — bypass de hooks/gating, documentado | Pattern 7 (escape hatch honesto, análise do `KModelProxyHandler`) |
| API-03 | `database.getClient()` / `database.getDb()` nativos | Pattern 7 |
| API-04 | Tipos de retorno TS precisos e consistentes em todos os métodos públicos | Pattern 6 + `## Code Examples` |
</phase_requirements>

## Summary

Esta fase evolui o `preMethod: Record<METHODS, Function>` atual (1 handler por método, `.bind(doc)(options)`, sem post-hooks) para um pipeline pre/post completo com múltiplos handlers, contexto explícito (`ctx`), semântica de erro assimétrica (pre aborta, post propaga, `fireAndForget` desvia) e um guard de recursão robusto. Em paralelo, todo método público do `Model` passa a aceitar/repassar options tipadas do driver e a ter retorno TS preciso, e ganha um escape hatch honesto (`getCollection`/`getClient`/`getDb`) que sai completamente da abstração do ODM.

A pesquisa em ODMs de referência (Mongoose, Papr) confirma o formato geral esperado: hooks múltiplos executam em ordem de registro, aguardados sequencialmente; erro em pre aborta a cadeia; post-hooks de erro têm um contrato distinto. Papr, por ser "thin" como o Mongoat, **não tem hooks** — confirma que a filosofia "thin" é compatível com hooks OU sem eles; o Mongoat diverge deliberadamente de Papr ao adicionar pipeline pre/post completo (HOOK-01..05) mantendo o mesmo compromisso de passthrough total de options e "escape hatch" honesto que Papr também pratica.

A leitura direta do código-fonte (`src/database/index.ts`, `src/model/index.ts`) revelou um achado arquitetural importante e de alta confiança: o `KModelProxyHandler` só aplica o gate de `allowedMethods` para propriedades que estejam em `target.methods` (== `Object.values(METHODS)`, os 12 enums). Qualquer método que **não** seja adicionado ao enum `METHODS` já escapa naturalmente do gating — isso significa que `getCollection()`/`getClient()`/`getDb()` satisfazem D-08 ("escape total: sem hooks e sem gating") **sem nenhuma mudança no `KModelProxyHandler`**, desde que não sejam registrados no enum `METHODS`. Esse é o design mais simples e correto disponível.

Para o guard de recursão (HOOK-05/D-07), a pesquisa recomenda `AsyncLocalStorage` nativo do Node (zero dependência nova) instanciado **por Model** (não global) — uma flag de instância booleana simples vaza estado entre chamadas concorrentes no mesmo model (Node é single-threaded mas interlaça execuções assíncronas via `await`), o que corromperia silenciosamente hooks em cenários de concorrência real. `AsyncLocalStorage` resolve isso ao vincular o estado "estou dentro de um hook" à cadeia de chamadas assíncronas específica, não à instância.

Para o mecanismo de transformação opt-in do post-hook (D-04), a pesquisa recomenda a **convenção de retorno**: hook retorna `undefined` (implícito, sem `return`) = apenas observa; hook retorna qualquer outro valor (incluindo `null`) = esse valor vira o novo `ctx.result`. Isso evita adicionar um terceiro parâmetro/flag à assinatura de `pre()`/`post()` e mantém uma única forma de função para pre e post hooks — mas é uma proposta de design sintetizada nesta pesquisa, não um padrão verificado em nenhuma biblioteca externa; está sinalizada como `[ASSUMED]` e deve ser confirmada no planning.

**Primary recommendation:** Modelar o hook registry como `Record<METHODS, { pre: HookFn[]; post: PostHookEntry[] }>`, executar sequencialmente com `for...of` + `await` (não `Promise.all` para hooks do mesmo documento), usar `AsyncLocalStorage` por instância de `Model` para o guard de recursão, e não adicionar `getCollection`/`getClient`/`getDb` ao enum `METHODS` — eles herdam o bypass de gating de graça.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Registro de hooks (declarativo + encadeável) | Model Layer | — | `Model` já é dono de `preMethod`/`pre()`; hooks são estado por model |
| Execução do pipeline pre → driver → post | Model Layer | MongoDB Driver Layer | Model orquestra a sequência; a chamada ao driver é uma etapa no meio do pipeline, não uma camada separada |
| Guard de recursão (modo raw) | Model Layer | — | Estado de reentrância é por instância de Model (D-07 é escopado a "métodos do próprio model") |
| `onHookError` (fallback de erro do `fireAndForget`) | Model Layer | Database Layer (se registrado globalmente) | Hooks são por model; um callback global no `Database` é conveniência opcional, não requisito desta fase |
| Options passthrough tipado | Model Layer | MongoDB Driver Layer | Model é quem expõe os métodos públicos; os tipos vêm do driver, mas a responsabilidade de "aceitar e repassar" é do Model |
| Escape hatch `getCollection()` | Model Layer | MongoDB Driver Layer | Ponto de saída da abstração; devolve objeto do driver, mas o método pertence ao Model |
| Escape hatch `getClient()`/`getDb()` | Database Layer | MongoDB Driver Layer | Cliente e Db são geridos pelo `Database`, não pelo Model |
| Gating de `allowedMethods` (Proxy) | Database Layer (`KModelProxyHandler`) | Model Layer (`methods`/`allowedMethods`) | Handler estático do `Database`, mas os dados (`methods`, `allowedMethods`) vivem no `Model` |

## Standard Stack

### Core

Nenhuma dependência de runtime nova é necessária nesta fase — `AsyncLocalStorage` é nativo do módulo `node:async_hooks`/global (`AsyncLocalStorage` está disponível globalmente desde Node 16 sem import de pacote externo, apenas `import { AsyncLocalStorage } from 'node:async_hooks'`), e os tipos de options (`FindOptions`, `AggregateOptions`, `BulkWriteOptions`, `InsertOneOptions`, `UpdateOptions`, `DeleteOptions`, `FindOneAndUpdateOptions`, `FindOneAndDeleteOptions`, `CountDocumentsOptions`, `BulkWriteOptions`) já são exportados por `mongodb@7.0.0`, já uma dependência declarada.

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `mongodb` (já dependência) | 7.0.0 (instalado); 7.4.0 disponível no registry [VERIFIED: npm registry] | Fonte dos tipos de options/retorno usados no passthrough | Já é a dependência raiz do projeto; nenhuma nova lib de tipos necessária |
| `node:async_hooks` (nativo) | Bundled no runtime Node (`engines: ^20.19.0 \|\| >=22.12.0`) [VERIFIED: node --version = v22.22.2 no ambiente] | Guard de recursão por contexto assíncrono (D-07) | Zero dependência nova; resolve o vazamento de estado entre chamadas concorrentes que uma flag booleana de instância teria [CITED: nodejs.org/api/async_context.html] |

### Supporting

Nenhuma lib de terceiros é recomendada para o hook pipeline em si (event emitter, middleware libs como `hooks-fixed`/`kareem` do Mongoose) — a constraint de "mínimo de dependências de runtime" do CLAUDE.md e o volume pequeno do pipeline (12 métodos, execução sequencial simples) não justificam puxar uma lib externa. Ver `## Don't Hand-Roll` para o raciocínio completo.

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `AsyncLocalStorage` por instância de Model | Flag booleana de instância (`this[kInHook] = true`) | Mais simples de escrever, mas vaza estado entre chamadas concorrentes no mesmo model (bug de corrida real em Node com I/O intercalado) — rejeitado |
| `AsyncLocalStorage` por instância de Model | `AsyncLocalStorage` global (módulo, não por Model) | Mais simples de instanciar (um singleton), mas faz uma chamada de hook em Model A para Model B também rodar em modo raw — mais amplo que o requisito literal de HOOK-05 ("métodos do próprio model"); documentado como opção válida se o planning preferir simplicidade sobre precisão de escopo |
| Convenção de retorno para opt-in de transformação (D-04) | Flag de registro (`model.post(METHOD, fn, { transform: true })`) | Flag é mais explícita e auto-documentada na assinatura, mas adiciona um terceiro parâmetro a `pre()`/`post()` e um terceiro campo aos hooks declarativos do construtor — mais superfície de API para o mesmo resultado |
| `for...of` sequencial para hooks do mesmo documento | `Promise.all` (herdado do fix de Fase 1 em `insertMany`) | `Promise.all` roda hooks em paralelo — quebra a garantia de ordem de HOOK-01 quando há múltiplos hooks no mesmo documento; mantido apenas para paralelizar entre documentos diferentes em `insertMany`, nunca entre hooks do mesmo documento |

**Installation:**
```bash
# Nenhuma instalação necessária — AsyncLocalStorage é nativo, tipos de options já vêm de mongodb@7.0.0 (dependência existente)
```

**Version verification:**
```bash
npm view mongodb version
# → 7.4.0 (registry, 2026-07-07) — projeto está pinado em 7.0.0; upgrade fora de escopo desta fase, apenas observação
```

## Package Legitimacy Audit

Esta fase **não introduz nenhuma dependência de runtime nova**. `AsyncLocalStorage` é nativo (`node:async_hooks`), e todos os tipos de options usados no passthrough (D-09/API-01) já vêm de `mongodb@7.0.0`, dependência já presente em `package.json`. O gate de legitimidade de pacotes não se aplica.

**Packages removed due to [SLOP] verdict:** none — nenhum pacote novo avaliado
**Packages flagged as suspicious [SUS]:** none — nenhum pacote novo avaliado

## Architecture Patterns

### System Architecture Diagram

```text
Application Code
    │
    │ model.insert(doc, options)   (chamada pública, através do Proxy)
    ▼
┌─────────────────────────────────────────────────────────────┐
│ KModelProxyHandler.get (src/database/index.ts)               │
│  - "insert" ∈ METHODS?  sim → gate allowedMethods             │
│  - método não-METHODS (getCollection/…)?  passa direto        │
│  - bind sempre a `target` (raw instance), nunca ao Proxy       │
└───────────────────────┬────────────────────────────────────────┘
                        │ (se permitido)
                        ▼
┌─────────────────────────────────────────────────────────────┐
│ Model.insert() — hook pipeline orchestrator                   │
│                                                                 │
│  1. store = this[kHookContext].getStore()                     │
│     store?.raw === true?                                       │
│        ├─ SIM → pula hooks, chama runRawInsert() direto        │
│        └─ NÃO → this[kHookContext].run({ raw:true }, async () =>│
│  2.       ctx = buildContext(METHODS.INSERT, { document, options })│
│  3.       for (const hook of hooks.insert.pre) await hook(ctx)  │← erro aqui ABORTA (D-05)
│  4.       collection = this.getCollectionOrThrow()              │
│  5.       ctx.result = await collection.insertOne(ctx.document, ctx.options)│
│  6.       for (const entry of hooks.insert.post) {               │
│             fireAndForget? → dispatch sem esperar propagar erro   │
│                              (catch → onHookError/console.error) │← erro aqui NÃO propaga (D-06)
│             normal?        → await entry.fn(ctx); erro propaga   │← erro aqui PROPAGA (D-05)
│             retorno !== undefined? → ctx.result = retorno (D-04) │
│           }                                                       │
│  7.       return ctx.result                                       │
│           )                                                        │
└───────────────────────┬────────────────────────────────────────┘
                        │ (dentro de um hook, se ele chamar model.find())
                        ▼
                 store.raw === true → pula pipeline de hooks,
                 mas AINDA passa pelo Proxy/gating normalmente
                        │
                        ▼
┌─────────────────────────────────────────────────────────────┐
│ MongoDB Driver Layer — collection.insertOne/find/…             │
└─────────────────────────────────────────────────────────────┘

Escape hatch honesto (D-08) — bypassa TUDO acima:
Application Code → model.getCollection() → Collection<T> nativa
                    (não está no enum METHODS → Proxy não gateia,
                     não passa pelo hook pipeline — chamadas na
                     collection retornada nunca disparam hooks)
```

### Recommended Project Structure

```
src/
├── model/
│   ├── index.ts          # Model class — CRUD + orquestração do pipeline
│   ├── hooks.ts           # NOVO: HookRegistry, tipos de ctx por método, runPreHooks/runPostHooks
│   └── ...
├── database/
│   └── index.ts           # Database class — getClient()/getDb() adicionados aqui
├── types/
│   └── hooks.ts            # NOVO: HookContextMap<ModelType>, HookFn, PostHookEntry, HookOptions
├── errors/
│   └── index.ts            # MongoatError (reaproveitado — base de onHookError)
└── utils/
    └── enums.ts             # METHODS (12 operações — getCollection/getClient/getDb NÃO entram aqui)
```

### Pattern 1: Hook Registry (múltiplos handlers, dual registration)

**What:** Estrutura de dados que substitui `preMethod: Record<METHODS, Function>` por um registro de arrays pre/post por método, populado tanto pelo construtor declarativo quanto pelos métodos encadeáveis.

**When to use:** Base de todo o pipeline — HOOK-01, HOOK-02, D-01, D-02.

**Example:**
```typescript
// src/types/hooks.ts
export type HookFn<Ctx> = (ctx: Ctx) => void | unknown | Promise<void | unknown>;

export interface PostHookEntry<Ctx> {
  fn: HookFn<Ctx>;
  fireAndForget?: boolean; // D-06/HOOK-04
}

export type HookRegistry<ModelType extends Document> = {
  [M in METHODS]: {
    pre: HookFn<HookContextMap<ModelType>[M]>[];
    post: PostHookEntry<HookContextMap<ModelType>[M]>[];
  };
};

// src/model/index.ts — construção inicial (substitui `preMethod`)
private hooks: HookRegistry<ModelType> = Object.fromEntries(
  Object.values(METHODS).map((m) => [m, { pre: [], post: [] }])
) as HookRegistry<ModelType>;

constructor(props: CreateModelProps<ModelType>) {
  // ... resto do construtor existente ...
  // D-02: construtor primeiro
  if (props.hooks) {
    for (const [method, cfg] of Object.entries(props.hooks)) {
      this.hooks[method as METHODS].pre.push(...(cfg.pre ?? []));
      this.hooks[method as METHODS].post.push(...(cfg.post ?? []).map(toPostEntry));
    }
  }
}

// D-01: .pre()/.post() ACUMULAM (não sobrescrevem) — depois do construtor, em ordem de chamada
pre<M extends METHODS>(method: M, fn: HookFn<HookContextMap<ModelType>[M]>): this {
  this.hooks[method].pre.push(fn);
  return this; // encadeável
}

post<M extends METHODS>(
  method: M,
  fn: HookFn<HookContextMap<ModelType>[M]>,
  options: { fireAndForget?: boolean } = {}
): this {
  this.hooks[method].post.push({ fn, fireAndForget: options.fireAndForget });
  return this;
}
```

### Pattern 2: Pipeline sequencial pre → driver → post, com semântica de erro assimétrica

**What:** A execução de hooks nunca usa `Promise.all` para múltiplos hooks do MESMO documento/operação — sempre `for...of` + `await`, preservando ordem de registro (HOOK-01/HOOK-02) e permitindo abortar no primeiro erro de pre-hook.

**When to use:** Todo método CRUD do Model.

**Example:**
```typescript
// src/model/hooks.ts
async function runPreHooks<Ctx>(hooks: HookFn<Ctx>[], ctx: Ctx): Promise<void> {
  // D-02: sequencial, ordem de registro. D-05: throw aqui propaga e ABORTA
  // (nenhum hook subsequente roda, driver nunca é chamado).
  for (const hook of hooks) {
    await hook(ctx);
  }
}

async function runPostHooks<Ctx extends { result?: unknown }>(
  hooks: PostHookEntry<Ctx>[],
  ctx: Ctx,
  onHookError: (err: unknown, ctx: Ctx) => void
): Promise<void> {
  for (const { fn, fireAndForget } of hooks) {
    if (fireAndForget) {
      // HOOK-04/D-06: dispatch sem bloquear a resposta ao caller; erro NUNCA
      // some em silêncio — .catch imediato evita unhandled rejection e roteia
      // para onHookError (fallback console.error).
      Promise.resolve()
        .then(() => fn(ctx))
        .then((returned) => {
          if (returned !== undefined) ctx.result = returned; // ver Open Questions — ordem não garantida
        })
        .catch((err) => onHookError(err, ctx));
      continue;
    }

    // D-05: throw aqui PROPAGA ao caller (comportamento default do post-hook)
    const returned = await fn(ctx);
    if (returned !== undefined) ctx.result = returned; // D-04: opt-in de transformação via retorno
  }
}
```

### Pattern 3: `ctx` por método via lookup type (sem explosão de generics)

**What:** Em vez de um `ctx` genérico único com todos os campos opcionais (`filter?`, `document?`, `documents?`, `update?`, `pipeline?`, `operations?`, ...), define-se uma interface por "família" de método e um mapa (`HookContextMap`) indexado pelo literal `METHODS`. `pre<M extends METHODS>(method: M, fn: (ctx: HookContextMap<ModelType>[M]) => ...)` infere o `ctx` certo automaticamente a partir do `M` passado.

**When to use:** D-03 — define o shape do `ctx`.

**Example:**
```typescript
// src/types/hooks.ts
interface BaseHookContext<ModelType extends Document> {
  method: METHODS;
  model: Model<ModelType>;
}

export interface HookContextMap<ModelType extends Document> {
  [METHODS.INSERT]: BaseHookContext<ModelType> & {
    document: OptionalUnlessRequiredId<ModelType>;
    options: InsertOneOptions;
    result?: WithId<ModelType> & DefaultProperties;
  };
  [METHODS.INSERT_MANY]: BaseHookContext<ModelType> & {
    documents: OptionalUnlessRequiredId<ModelType>[];
    options: BulkWriteOptions;
    result?: InsertManyResult<ModelType>;
  };
  [METHODS.FIND]: BaseHookContext<ModelType> & {
    filter: Filter<ModelType>;
    options?: FindOptions;
    result?: WithId<ModelType> | null;
  };
  [METHODS.FIND_MANY]: BaseHookContext<ModelType> & {
    filter: Filter<ModelType>;
    options: FindOptions;
    result?: WithId<ModelType>[];
  };
  [METHODS.FIND_BY_ID]: BaseHookContext<ModelType> & {
    documentId: ObjectId | string;
    options?: FindOptions;
    result?: WithId<ModelType> | null;
  };
  [METHODS.UPDATE]: BaseHookContext<ModelType> & {
    filter: Filter<ModelType>;
    update: UpdateFilter<ModelType>;
    options: FindOneAndUpdateOptions;
    result?: WithId<ModelType> | null;
  };
  [METHODS.UPDATE_MANY]: BaseHookContext<ModelType> & {
    filter: Filter<ModelType>;
    update: UpdateFilter<ModelType>;
    options: UpdateOptions;
    result?: UpdateResult;
  };
  [METHODS.DELETE]: BaseHookContext<ModelType> & {
    filter: Filter<ModelType>;
    options?: FindOneAndDeleteOptions;
    result?: WithId<ModelType> | null;
  };
  [METHODS.DELETE_MANY]: BaseHookContext<ModelType> & {
    filter: Filter<ModelType>;
    options: DeleteOptions;
    result?: DeleteResult;
  };
  [METHODS.TOTAL]: BaseHookContext<ModelType> & {
    filter: Filter<ModelType>;
    options: CountDocumentsOptions;
    result?: number;
  };
  [METHODS.AGGREGATE]: BaseHookContext<ModelType> & {
    pipeline: Document[];
    options: AggregateOptions;
    result?: Document[];
  };
  [METHODS.BULK_WRITE]: BaseHookContext<ModelType> & {
    operations: AnyBulkWriteOperation<ModelType>[];
    options?: BulkWriteOptions;
    result?: BulkWriteResult;
  };
}
```

Cada `ctx.options` é a MESMA referência usada na chamada ao driver (não uma cópia) — um pre-hook que faz `ctx.options.session = mySession` afeta a chamada real (decorrência de D-09 citada em D-03).

### Pattern 4: `fireAndForget` post-hook — dispatch não-bloqueante com rede de segurança

**What:** Ver Pattern 2. O ponto central: `fireAndForget` é o único caso em que a Fase 2 abre mão de "aguardado sequencialmente" (que é a regra geral de HOOK-01/D-02) — a troca é deliberada: o objetivo do `fireAndForget` é justamente NÃO atrasar a resposta ao caller.

**When to use:** HOOK-04. Ver `## Open Questions` para a ambiguidade não resolvida (await-mas-erro-desviado vs. verdadeiramente não aguardado) que o planning precisa fechar.

### Pattern 5: Guard de recursão via `AsyncLocalStorage` por instância de Model

**What:** Cada instância de `Model` (a instância crua, `target`, não o Proxy) ganha um `AsyncLocalStorage` próprio. O pipeline de hooks roda dentro de `store.run({ raw: true }, ...)`; qualquer chamada aninhada a um método do MESMO model dentro dessa cadeia assíncrona vê `store.getStore()?.raw === true` e pula o pipeline de hooks (mas passa pelo Proxy/gating normalmente — só o D-08 escape hatch bypassa gating).

**When to use:** HOOK-05, D-07.

**Example:**
```typescript
import { AsyncLocalStorage } from 'node:async_hooks';

const kHookContext = Symbol('kHookContext');

export class Model<ModelType extends Document = Document> {
  private [kHookContext] = new AsyncLocalStorage<{ raw: true }>();

  async insert(document: OptionalUnlessRequiredId<ModelType>, options: InsertOneOptions = {}) {
    const store = this[kHookContext].getStore();

    if (store?.raw) {
      return this.rawInsert(document, options); // pula hooks — chamada aninhada
    }

    return this[kHookContext].run({ raw: true }, () =>
      this.hookedInsert(document, options)
    );
  }

  private async hookedInsert(document, options) {
    const ctx = { method: METHODS.INSERT, model: this, document, options };
    await runPreHooks(this.hooks[METHODS.INSERT].pre, ctx);
    ctx.result = await this.rawInsert(ctx.document, ctx.options);
    await runPostHooks(this.hooks[METHODS.INSERT].post, ctx, this.onHookError);
    return ctx.result;
  }

  private async rawInsert(document, options) {
    const collection = this.getCollectionOrThrow();
    // ... lógica atual de insertOne + wrapDriverError ...
  }
}
```

**Por que não uma flag booleana simples (`this[kInHook] = true`):** duas chamadas concorrentes a `model.insert()` no MESMO model (ex.: duas requisições HTTP simultâneas) intercalam em pontos de `await` — uma flag de instância setada por uma chamada seria visível pela outra chamada concorrente, fazendo-a (incorretamente) pular seus próprios hooks. `AsyncLocalStorage` vincula o estado à cadeia assíncrona específica que o criou, não à instância — evitando esse vazamento entre chamadas irmãs [CITED: nodejs.org/api/async_context.html].

### Pattern 6: Options passthrough + retorno preciso (API-01/API-04)

**What:** Todo método público aceita o tipo de options do driver correspondente (já majoritariamente implementado em `src/model/index.ts` — `FindOptions`, `AggregateOptions`, `BulkWriteOptions`, `InsertOneOptions`, `UpdateOptions`, `DeleteOptions`, `FindOneAndUpdateOptions`, `FindOneAndDeleteOptions`, `CountDocumentsOptions`) e declara explicitamente seu tipo de retorno (`Promise<T>`), seguindo a convenção já estabelecida em `find()` (Fase 1, WR-07).

**When to use:** API-01, API-04. Gap principal: `aggregate()` hoje não declara `Promise<Document[]>` explicitamente (infere); auditar todos os 12 métodos para retorno explícito.

### Pattern 7: Escape hatch honesto — reaproveitando uma propriedade já existente do Proxy

**What:** `KModelProxyHandler.get` só lança para métodos que estejam em `target.methods` (== `Object.values(METHODS)`). Qualquer método NOVO que não seja adicionado ao enum `METHODS` **já** escapa do gating de `allowedMethods` automaticamente — sem tocar no handler. Isso é o próprio mecanismo do D-08.

**When to use:** API-02, API-03, D-08.

**Example:**
```typescript
// src/model/index.ts — NÃO adicionar 'getCollection' ao enum METHODS (src/utils/enums.ts)
getCollection(): Collection<ModelType> {
  return this.getCollectionOrThrow(); // reaproveita o método privado existente (D-10 — fail loud pré-conexão)
}

// src/database/index.ts — Database nunca é Proxy-wrapped (só Model é); getClient/getDb já ungated por natureza
getClient(): MongoClient | undefined {
  return this[kClient];
}

getDb(): Db | undefined {
  return this[kDb];
}
```

**Por que isso é "escape total" de fato:** (1) sem hooks — `getCollection()` não está no pipeline pre/post, nunca é chamado dentro de `hookedInsert`/etc.; a `Collection` retornada é o objeto nativo do driver, e chamadas feitas diretamente nela (`collection.insertOne(...)`) nunca passam pelo `Model`. (2) sem gating — por não estar no enum `METHODS`, a checagem `target.methods.includes(prop)` é `false`, então o `if` de bloqueio nunca dispara.

### Anti-Patterns to Avoid

- **Adicionar `getCollection`/`getClient`/`getDb` ao enum `METHODS`:** quebraria D-08 silenciosamente — o método passaria a ser gateado por `allowedMethods`, exigindo que o dev inclua explicitamente o escape hatch na lista de métodos permitidos, contrariando "escape total".
- **Usar `Promise.all` para múltiplos hooks do MESMO documento/operação:** quebra a garantia de ordem de registro (HOOK-01/HOOK-02) — hooks paralelos podem completar fora de ordem e pisar em mutações uns dos outros no mesmo `ctx`.
- **Flag booleana de instância para o guard de recursão:** vaza estado entre chamadas concorrentes no mesmo model (ver Pattern 5).
- **`try/catch` genérico ao redor de post-hooks não-`fireAndForget` que apenas loga e não relança:** viola D-05/HOOK-03 diretamente — post-hooks normais DEVEM propagar.
- **Passar o `options` original (não `ctx.options`) para a chamada ao driver:** quebra a decorrência de D-09 ("pre-hook pode ajustar as options antes da chamada ao driver") — se o pipeline lê `ctx.options` para popular o hook mas chama o driver com a variável `options` original, mutações do pre-hook são silenciosamente descartadas.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|--------------|-----|
| Guard de reentrância assíncrona | Flag booleana manual + cleanup em `finally` | `node:async_hooks` `AsyncLocalStorage` (nativo) | Zero dependência nova; resolve corretamente concorrência intercalada — ver Pattern 5. Reimplementar isso manualmente reproduziria bugs de vazamento de contexto já resolvidos pela API nativa. |
| Deep-equal para detectar hooks duplicados/registro divergente | lib de deep-equal | Nenhuma verificação necessária — hooks são funções, comparação por identidade (`===`) já é o padrão de qualquer sistema de listener; não há requisito de deduplicação nesta fase | Evita puxar dependência para um problema que HOOK-01..05 não pede |
| Middleware/event-pipeline genérico (estilo `kareem` do Mongoose) | Lib de middleware npm | `for...of` + `await` manual (Pattern 2) | O volume é pequeno (12 métodos, pipeline linear pre→driver→post, sem branching de "múltiplas fases" como `validate`→`save` do Mongoose); uma lib de terceiros adicionaria abstração e dependência para resolver um problema que 20 linhas de código resolvem, violando a constraint de "mínimo de dependências de runtime" do projeto |

**Key insight:** O hook pipeline do Mongoose (via `kareem`) existe porque o Mongoose tem hooks em MUITOS pontos encadeados (`validate`, `save`, `remove`, hooks de subdocumento, hooks de plugin) com regras de propagação complexas entre eles. O Mongoat tem 12 métodos independentes, cada um com seu próprio pre/post — não há encadeamento entre métodos (inserir não dispara hooks de find). Um pipeline linear simples, escrito à mão, é adequado e evita a complexidade (e a dependência) que o Mongoose precisa para seu escopo muito maior.

## Common Pitfalls

### Pitfall 1: Hooks não aguardados / fora de ordem em operações batch (`insertMany`)

**What goes wrong:** A Fase 1 corrigiu o `forEach(async ...)` não aguardado trocando por `Promise.all(documents.map(...))` — correto para UM hook por documento. Com múltiplos hooks por documento (Fase 2), aplicar `Promise.all` também aos HOOKS DENTRO de cada documento reintroduziria o mesmo bug em nova forma: hooks do mesmo documento rodando em paralelo, sem ordem garantida.

**Why it happens:** É tentador generalizar o padrão "Promise.all resolve problemas de await" sem notar que ele só é seguro quando as tarefas paralelizadas são **independentes** entre si. Documentos diferentes são independentes; hooks do MESMO documento, registrados em ordem, não são (podem depender do resultado de mutação do hook anterior no mesmo `ctx`).

**How to avoid:** `Promise.all(documents.map(async (doc) => { for (const hook of pre) await hook(ctx) }))` — paraleliza documentos, mas mantém `for...of` sequencial DENTRO de cada documento. [ASSUMED — síntese desta pesquisa a partir da leitura literal de HOOK-01 ("aguardados sequencialmente em todos os caminhos, incluindo insertMany") combinada com o comentário do CONTEXT.md pedindo reavaliação; não há precedente externo verificado para este padrão específico.]

**Warning signs:** Teste com dois hooks pre no mesmo método, onde o segundo hook lê um campo que o primeiro escreveu em `ctx` — se falhar de forma intermitente/racy, hooks estão paralelos quando deveriam ser sequenciais.

### Pitfall 2: Recursão infinita via hook chamando método do próprio model

**What goes wrong:** Um hook registrado em `insert` chama `model.find()` internamente (ex.: checar duplicata) e, se `find` também tiver hooks registrados que (direta ou indiretamente) chamam `insert` de volta, o processo estoura a pilha ou entra em loop de Promises.

**Why it happens:** Hooks são registrados globalmente por método no model, não por call-site — qualquer chamada interna a um método hookado dentro do corpo de um hook re-entra no pipeline. [CITED: padrão documentado de forma equivalente em contextos de `async_hooks`/logging recursivo do próprio Node — nodejs.org/api/async_hooks.html]

**How to avoid:** Guard de reentrância via `AsyncLocalStorage` por Model (Pattern 5) — a chamada aninhada ao MESMO model dentro da cadeia assíncrona de um hook roda em modo raw (sem re-disparar hooks), completando a operação sem re-entrar no pipeline.

**Warning signs:** Stack overflow ou travamento em testes que registram um hook cujo corpo chama outro método do mesmo model.

### Pitfall 3: Erro de post-hook engolido em silêncio

**What goes wrong:** É tentador envolver a execução de post-hooks em `try/catch` que apenas loga e nunca relança, para "não estragar" uma operação que já teve sucesso no driver. Isso torna bugs de post-hook invisíveis — o caller recebe sucesso mesmo quando o efeito colateral (auditoria, invalidação de cache, notificação) falhou silenciosamente.

**Why it happens:** Parece razoável não "quebrar uma operação bem-sucedida" por causa de um hook — mas para hooks de integridade de dados (ex.: gravar log de auditoria obrigatório), isso é quase sempre errado.

**How to avoid:** Post-hooks normais (não-`fireAndForget`) DEVEM propagar erros por padrão (D-05/HOOK-03) — nunca um `.catch(() => {})` genérico no dispatch de post-hooks normais. Só o path explícito `fireAndForget` desvia o erro (para `onHookError`/`console.error`), e mesmo assim nunca em silêncio total (D-06). [CITED: mongoosejs.com/docs/middleware.html — confirma que hooks de post normais do Mongoose propagam, e que middleware de erro tem um contrato distinto e explícito, nunca implícito]

**Warning signs:** Teste com post-hook que lança erro — se o `await model.insert(...)` resolve normalmente em vez de rejeitar, o pitfall está presente.

### Pitfall 4: Mutação do `options` original em vez de `ctx.options`

**What goes wrong:** Se o pipeline constrói `ctx.options` mas a chamada ao driver usa a variável `options` original (parâmetro da função pública), um pre-hook que ajusta `ctx.options` (ex.: injeta `session`) não tem efeito algum — o driver nunca vê a mutação.

**Why it happens:** É fácil, ao refatorar o código existente para o novo pipeline, esquecer de trocar todas as referências de `options` (parâmetro) para `ctx.options` (campo do contexto) nos pontos de chamada ao driver.

**How to avoid:** Toda chamada ao driver dentro do pipeline hookado deve ler de `ctx.options`/`ctx.filter`/`ctx.document`, nunca dos parâmetros originais da função pública — o `ctx` é a única fonte de verdade depois que os pre-hooks rodam.

**Warning signs:** Teste onde um pre-hook seta `ctx.options.someField = x` e a assertiva verifica que a chamada ao driver mock/spy recebeu `someField` — se falhar, a mutação não está sendo lida de `ctx`.

## Code Examples

### Registro declarativo + encadeável coexistindo (D-01)

```typescript
// Fonte: síntese desta pesquisa, seguindo o formato explícito de D-01 do CONTEXT.md
const User = new Model<UserSchema>({
  collectionName: 'users',
  schema: userSchema,
  allowedMethods: [METHODS.INSERT, METHODS.FIND],
  hooks: {
    [METHODS.INSERT]: {
      pre: [(ctx) => { ctx.document.createdAt = new Date(); }],
      post: [(ctx) => { console.log('user created', ctx.result?._id); }],
    },
  },
});

// Registro tardio/condicional — acumula, não sobrescreve (D-01)
User.pre(METHODS.INSERT, async (ctx) => {
  ctx.document.password = await hashPassword(ctx.document.password);
}).post(METHODS.INSERT, (ctx) => {
  auditLog.record('user.created', ctx.result);
}, { fireAndForget: true }); // HOOK-04
```

### Erro em pre-hook aborta antes do driver (HOOK-03)

```typescript
// Fonte: comportamento esperado, análogo ao Mongoose (mongoosejs.com/docs/middleware.html)
User.pre(METHODS.INSERT, () => {
  throw new MongoatError('validação de negócio falhou');
});

await User.insert({ username: 'x' });
// → rejeita com MongoatError; collection.insertOne NUNCA é chamado
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|-------------------|---------------|--------|
| `preMethod: Record<METHODS, Function>` — 1 handler, `this`-bind mágico | `hooks: Record<METHODS, { pre: HookFn[]; post: PostHookEntry[] }>` — múltiplos handlers, `ctx` explícito | Esta fase (breaking, aceitável em alpha) | Toda assinatura de hook existente (`function() { this.x = ... }`) precisa migrar para `(ctx) => { ctx.document.x = ... }` |
| `pre()` sobrescreve o handler anterior | `pre()`/`post()` acumulam (push) | Esta fase (D-01) | Registrar `pre()` duas vezes para o mesmo método agora executa AMBOS, não só o último |
| Sem post-hooks | Post-hooks em todos os 12 métodos, com opt-in de transformação | Esta fase (HOOK-02) | Novo ponto de extensão — hooks de auditoria/cache/notificação deixam de precisar de workaround manual pós-chamada |
| `insertMany` com `Promise.all` de UM hook por doc (fix Fase 1) | `Promise.all` entre docs + `for...of` sequencial de múltiplos hooks dentro de cada doc | Esta fase | Preserva paralelismo entre documentos, corrige ordem dentro de cada documento |

**Deprecated/outdated:**
- Assinatura `.bind(doc)(options)` do `pre()` atual: será removida em favor de `(ctx) => ...` — documentar como breaking change no guia de migração alpha→v1.0 (DOCS-03, Fase 7), não desta fase.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|-----------------|
| A1 | Convenção de retorno (`undefined` = observa, qualquer outro valor = transforma) é o mecanismo de opt-in do D-04, em vez de uma flag de registro | Pattern 3 / Summary | Planning pode preferir a flag explícita por ser mais auto-documentada; trocar depois exige mudar a assinatura de `post()` e o corpo de `runPostHooks` — baixo custo de retrabalho se decidido cedo no planning |
| A2 | `fireAndForget` post-hooks são verdadeiramente NÃO aguardados (dispatch + `.catch`), não apenas "aguardados mas com erro desviado" | Pattern 4 / Open Questions | Impacta diretamente o design dos testes de HOOK-04 (se aguardado, o teste pode usar `await model.insert()` e checar side-effect síncrono; se não aguardado, o teste precisa de polling/espera) — decisão bloqueante para a tarefa de teste, deve ser confirmada no planning antes de escrever PLAN.md |
| A3 | `AsyncLocalStorage` deve ser instanciado POR Model (não globalmente compartilhado entre todos os models) | Pattern 5 / Standard Stack (Alternatives Considered) | Se o planning preferir um único `AsyncLocalStorage` global por simplicidade, uma chamada de hook em Model A para Model B também rodaria em modo raw — mais amplo que HOOK-05 pede literalmente, mas não quebra nenhum requisito explícito; risco baixo, é uma escolha de escopo, não de correção |
| A4 | `insertMany` deve paralelizar hooks ENTRE documentos mas rodar sequencialmente os múltiplos hooks DENTRO de cada documento | Pitfall 1 / Pattern 1 | Se a leitura correta de HOOK-01 for "sequencial em TUDO, inclusive entre documentos", a implementação precisaria trocar `Promise.all` por um `for...of` externo também — impacto de performance para inserts grandes, mas simples de ajustar se descoberto no planning |
| A5 | Papr não tem sistema de hooks (usado como ponto de comparação para confirmar que a filosofia "thin" é compatível com QUALQUER escolha sobre hooks) | Summary | Baixo risco — é um dado de contexto/justificativa, não uma decisão de implementação; se Papr de fato tiver algum hook mínimo não capturado pela busca, não muda nenhuma decisão de design desta fase |

## Open Questions

1. **`fireAndForget` é verdadeiramente não-aguardado ou apenas "erro desviado"?**
   - What we know: D-06 define claramente a semântica de ERRO (não propaga, vai para `onHookError`/`console.error`). D-02 define que hooks em geral são "aguardados sequencialmente".
   - What's unclear: se `fireAndForget` também está isento da regra geral de "aguardado sequencialmente" (interpretação do nome "fire and forget") ou se permanece aguardado e só o tratamento de erro muda.
   - Recommendation: Pattern 4 recomenda dispatch não-aguardado (mais fiel ao nome e ao caso de uso — side-effects que não devem atrasar a resposta). O planning deve confirmar esta leitura explicitamente antes de codificar — é uma decisão testável (Validation Architecture já lista o teste correspondente) e barata de fechar agora.

2. **Ordem entre `Promise.all` (documentos) e hooks fireAndForget em `insertMany`.**
   - What we know: `insertMany` processa N documentos, cada um podendo ter múltiplos pre/post hooks, alguns potencialmente `fireAndForget`.
   - What's unclear: se um post-hook `fireAndForget` de um documento pode terminar depois de todo o `insertMany` já ter retornado ao caller — implicação de design que precisa estar documentada para o usuário da lib.
   - Recommendation: Documentar explicitamente (na Fase de docs, mas a decisão de comportamento é desta fase): `fireAndForget` hooks podem completar depois do retorno da chamada pública. Isso é consistente com a semântica esperada do nome.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|-------------|-----------|---------|----------|
| Docker (para `@testcontainers/mongodb`) | Suíte de testes de integração (Validation Architecture) | ✓ | 29.6.1 [VERIFIED: docker --version] | — |
| Node.js | Runtime + `AsyncLocalStorage` nativo | ✓ | v22.22.2 [VERIFIED: node --version] — satisfaz `engines: ^20.19.0 \|\| >=22.12.0` | — |
| `mongodb` (driver, já dependência) | Tipos de options/retorno | ✓ | 7.0.0 instalado; 7.4.0 disponível no registry [VERIFIED: npm view mongodb version] | Upgrade fora de escopo desta fase |

**Missing dependencies with no fallback:** nenhuma.
**Missing dependencies with fallback:** nenhuma.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest ^4.1.10 (já configurado) |
| Config file | `vitest.config.ts` |
| Quick run command | `npx vitest run test/model/hooks-<slug>.test.ts` |
| Full suite command | `npm test` (`vitest run`) — sobe container real via `test/setup/testcontainer.ts` (globalSetup) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|---------------------|--------------|
| HOOK-01 | Múltiplos pre hooks executam em ordem de registro, aguardados sequencialmente (incl. `insertMany`) | integration | `npx vitest run test/model/hooks-pre-order.test.ts` | ❌ Wave 0 |
| HOOK-02 | Post-hooks em todos os métodos CRUD, acesso a `ctx.result`, transformação opt-in | integration | `npx vitest run test/model/hooks-post-order.test.ts` | ❌ Wave 0 |
| HOOK-03 | Pre-hook error aborta antes do driver; post-hook error propaga | integration | `npx vitest run test/model/hooks-error-propagation.test.ts` | ❌ Wave 0 |
| HOOK-04 | `fireAndForget` post-hook não propaga; erro vai a `onHookError`/`console.error` | integration | `npx vitest run test/model/hooks-fire-and-forget.test.ts` | ❌ Wave 0 |
| HOOK-05 | Guard de recursão — hook chamando método do próprio model não estoura pilha nem re-dispara hooks | integration | `npx vitest run test/model/hooks-recursion-guard.test.ts` | ❌ Wave 0 |
| API-01 | Options nativas do driver chegam de fato à chamada do driver; pre-hook pode mutar `ctx.options` | integration | `npx vitest run test/model/options-passthrough.test.ts` | ❌ Wave 0 |
| API-02 | `model.getCollection()` bypassa hooks E gating | integration | `npx vitest run test/model/escape-hatch.test.ts` | ❌ Wave 0 |
| API-03 | `database.getClient()`/`getDb()` retornam objetos nativos | unit/integration | `npx vitest run test/database/escape-hatch.test.ts` | ❌ Wave 0 |
| API-04 | Tipos de retorno TS precisos em todos os métodos públicos | typecheck | `npm run typecheck` (já existe) | ✅ (comando existente — precisa apenas dos novos tipos explícitos) |

### Sampling Rate

- **Per task commit:** `npx vitest run <arquivo do teste da task>`
- **Per wave merge:** `npm test` (suíte completa, container real)
- **Phase gate:** `npm test` + `npm run typecheck` verdes antes de `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `test/model/hooks-pre-order.test.ts` — cobre HOOK-01 (múltiplos pre hooks, ordem, sequencial em `insert` e `insertMany`)
- [ ] `test/model/hooks-post-order.test.ts` — cobre HOOK-02 (múltiplos post hooks, `ctx.result`, opt-in de transformação)
- [ ] `test/model/hooks-error-propagation.test.ts` — cobre HOOK-03 (pre aborta, post propaga)
- [ ] `test/model/hooks-fire-and-forget.test.ts` — cobre HOOK-04 (não propaga, `onHookError`/`console.error` fallback) — depende de fechar Open Question 1 antes de escrever
- [ ] `test/model/hooks-recursion-guard.test.ts` — cobre HOOK-05 (chamada aninhada ao próprio model não re-dispara hooks nem estoura pilha)
- [ ] `test/model/options-passthrough.test.ts` — cobre API-01 (mutação de `ctx.options` por pre-hook chega ao driver)
- [ ] `test/model/escape-hatch.test.ts` — cobre API-02 (bypass de hooks e gating simultâneo)
- [ ] `test/database/escape-hatch.test.ts` — cobre API-03 (`getClient`/`getDb`)
- [ ] Nenhum framework novo a instalar — Vitest + `@testcontainers/mongodb` já cobrem o necessário

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|----------------|---------|--------------------|
| V2 Authentication | não | Fora de escopo — ODM não gerencia autenticação de usuário final |
| V3 Session Management | não | `ClientSession` do driver é passthrough de options, não gerenciamento de sessão de aplicação; fora de escopo desta fase (transações em hooks são v2, deferred) |
| V4 Access Control | sim | O gate `KModelProxyHandler`/`allowedMethods` já implementa controle de acesso a nível de método — esta fase deve preservar essa garantia para todo método hookado, e documentar explicitamente que `getCollection`/`getClient`/`getDb` são um bypass DELIBERADO e não uma falha de gating (D-08) |
| V5 Input Validation | sim | `ctx.options`/`ctx.filter` mutáveis por pre-hook — hooks de terceiros (plugins futuros) que mutam `ctx.filter` poderiam introduzir operadores perigosos (`$where`); sanitização de filtro é SEC-01 (Fase 3, fora de escopo aqui), mas o design do `ctx` não deve dificultar a adição futura desse controle |
| V6 Cryptography | não | Nenhuma operação criptográfica nova nesta fase |

### Known Threat Patterns for hook pipelines com escape hatch

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|-------------------------|
| Hook malicioso/mal-configurado usando `model.getCollection()` para contornar `allowedMethods` sem que isso seja óbvio ao dev | Elevation of Privilege (parcialmente aceito por design — D-08) | Documentação explícita e ostensiva (JSDoc `@public` + nota de segurança) de que `getCollection`/`getClient`/`getDb` bypassam TODO o gating — decisão consciente do usuário, não um bug; **não** é mitigável dentro desta fase, é um trade-off documentado |
| `onHookError` chamado com `ctx` completo (incluindo `document`/`filter` do usuário) logado por um handler ingênuo, vazando dados sensíveis em logs | Information Disclosure | Fora de escopo desta fase (sanitização de erro é SEC-03/04, Fase 3) — mas a assinatura de `onHookError(err, ctx)` já expõe `ctx` inteiro; recomenda-se nota no JSDoc de que o consumidor de `onHookError` é responsável por não logar campos sensíveis de `ctx.document`/`ctx.filter` sem redação |
| Pre-hook que muta `ctx.options` para remover guards de segurança que o dev esperava (ex.: remover `session` de uma transação) | Tampering | Nenhuma mitigação nova nesta fase — é uma decorrência aceita de D-09 (pre-hook PODE ajustar options); documentar como comportamento esperado, não como vulnerabilidade |

## Sources

### Primary (HIGH confidence)

- Leitura direta do código-fonte: `src/model/index.ts`, `src/database/index.ts`, `src/utils/enums.ts`, `src/errors/index.ts` — base de todo o `## Architecture Patterns` e do achado sobre `KModelProxyHandler` (Pattern 7)
- `.planning/codebase/ARCHITECTURE.md`, `.planning/codebase/CONVENTIONS.md` — convenções de símbolos `k*`, padrão `preMethod`, Proxy pattern
- `test/model/insertmany-hooks.test.ts`, `test/model/crud-happy-path.test.ts` — padrão de teste de integração já estabelecido (Vitest + testcontainers real)

### Secondary (MEDIUM confidence)

- [Middleware — Mongoose v9.7.3](https://mongoosejs.com/docs/middleware.html) [CITED — WebFetch direto na doc oficial] — ordem de execução pre/post, propagação de erro, middleware de erro `(err, doc, next)`, ordenação entre hooks aninhados (`validate` antes de `save`)

### Tertiary (LOW confidence — WebSearch sem Context7 disponível nesta sessão, marcado para validação)

- Papr — hooks/escape hatch design [ASSUMED — WebSearch, sem fetch direto ao README/docs do Papr]: confirma que Papr não implementa pre/post hooks, mantém API próxima do driver nativo, usa passthrough pouco tipado como escape hatch deliberado
- Node.js `AsyncLocalStorage` para guard de reentrância [ASSUMED — WebSearch; padrão de "skip quando a própria operação causou o hook" citado a partir da doc de `async_hooks`, mas não há um exemplo de código oficial de "reentrancy guard" testado nesta sessão]
- TypeScript discriminated unions / lookup types para `ctx` por método [ASSUMED — WebSearch geral sobre mapped types; a aplicação concreta ao `HookContextMap<ModelType>` desta pesquisa (Pattern 3) é síntese própria, não um exemplo copiado de fonte externa]
- MongoDB driver v7 — mudanças de versão mínima do Node e `AbortSignal` experimental em cursors [ASSUMED — WebSearch; não impacta nenhuma decisão desta fase, apenas contexto]

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — nenhuma dependência nova, `AsyncLocalStorage` é API nativa estável do Node desde a v16, tipos de options já existem no driver instalado
- Architecture: HIGH para os achados baseados em leitura direta do código (Pattern 5, 7); MEDIUM para os padrões de pipeline pre/post (Pattern 1-4, 6) — alinhados ao que Mongoose documenta oficialmente, mas adaptados/sintetizados para o formato de `ctx` específico do Mongoat, que não tem precedente externo idêntico
- Pitfalls: MEDIUM — Pitfall 2 e 3 têm precedente direto em fontes citadas (Mongoose, Node docs); Pitfall 1 e 4 são inferências desta pesquisa a partir do histórico de bugs já documentado no próprio projeto (Fase 1)

**Research date:** 2026-07-07
**Valid until:** 2026-08-06 (30 dias — stack estável, mas revisar se `mongodb` for atualizado de 7.0.0 para 7.4.0+ antes do planning)
