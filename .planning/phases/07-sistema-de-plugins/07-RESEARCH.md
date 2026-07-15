# Phase 7: Sistema de plugins - Research

**Researched:** 2026-07-15
**Domain:** Extensibilidade de ODM em TypeScript (contrato de plugin tipado, registro estático global, inferência de tipos através de construtor/Proxy)
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Plugin aceita **duas formas normalizadas**: função `(ctx: PluginContext) => void` OU objeto `{ name, setup }`. Internamente normaliza para a forma objeto (`fn → { name: fn.name || '<anonymous>', setup: fn }`). O `name` estável alimenta dedup, mensagens de erro e diagnóstico.
- **D-02:** Plugins parametrizáveis usam **factory pattern** — uma função que recebe opções e retorna o plugin (função ou objeto). **Zero API extra no core** (composição pura de JS/TS); o autor do plugin tipa suas próprias opções.
- **D-03:** `PluginContext` expõe **metadados read-only** para leitura: `collectionName` + visões congeladas/cópias de `allowedMethods` e `schema` (`Object.freeze`/cópia — nunca a referência viva). O **registro** (`pre`/`post`/`static`) é a única via de efeito.
- **D-04 (nota técnica):** `setup()` de plugin é **SÍNCRONO**. O construtor do Model é síncrono; plugins são aplicados **antes do wrap do Proxy** (PLUG-01) e não fazem I/O no apply.
- **D-05:** **Globais primeiro.** `Model.plugin()` roda antes dos `plugins[]` do model; cada grupo em ordem de registro/declaração.
- **D-06:** Hooks de plugin entram na ordem determinística da Fase 6 (D-11) **antes do config**: `@Pre de campo → @Pre de classe → PLUGINS (globais → locais) → hooks do config (props.hooks) → .pre()/.post() encadeados`.
- **D-07:** **Dedup por referência.** O mesmo plugin (mesma referência após normalização) aplica **1x**, na primeira posição em que aparece. Nomes iguais com **referências diferentes** = `MongoatValidationError` com code `DUPLICATE_PLUGIN_NAME`.
- **D-08:** **Nativo protegido; plugin→plugin erra.** Static que colide com método nativo (os `METHODS` gated + escape hatch `getCollection`/`getClient`/`getDb`) **sempre** lança. Dois plugins com o mesmo static também lançam `MongoatValidationError` com code `STATIC_COLLISION` na construção.
- **D-09:** **Tipagem via generic no construtor.** O tipo de retorno de `new Model({ plugins })` soma os statics de cada plugin ao tipo do model; o autor do plugin declara o shape, o consumidor não anota nada. ⚠️ **Item de research** — inferência através do retorno Proxy validada NESTE documento; fallback documentado (D-09b: interface merging manual) se a inferência plena não for viável.
- **D-10:** **Fail-loud na construção.** Qualquer erro no `setup()` de um plugin aborta o `new Model(...)` imediatamente, envolto em `MongoatValidationError` com code estável `PLUGIN_SETUP_FAILED`, o `name` do plugin culpado na mensagem e o erro original em `.cause`.
- **D-11:** **Reset interno + doc de teste.** Um `Model[kResetPlugins]()` (Symbol interno, fora do barrel público) limpa a lista global + o flag de trava do PLUG-02.
- **D-12:** Statics são **bound ao model** (como os métodos nativos já são via o Proxy). Dentro do static, `this.getCollection()` / `this.find()` etc. estão disponíveis.
- **D-13:** **Ortogonal — mesmo caminho.** Plugins operam sobre o Model construído, independente de como o schema foi definido (objeto plano ou classe decorada). **Sem** decorator `@Use` — uma única via de aplicar plugin (o construtor).
- **D-14:** Hooks de plugin **herdam tudo** da Fase 2: entram nos mesmos arrays, seguem a semântica assimétrica (pre pode abortar; post observa; `fireAndForget → onHookError`). O `onHookError` permanece config do MODEL.
- **D-15:** **Sem versão formal; semver do pacote.** O "selo" é a imutabilidade + a estabilidade do tipo `PluginContext` sob o semver do próprio pacote.

### Claude's Discretion

- Codes exatos e mensagens dos novos erros (`DUPLICATE_PLUGIN_NAME`, `STATIC_COLLISION`, `PLUGIN_SETUP_FAILED`) — nomear em consistência com o enum de erros existente (Fase 3).
- Nomes internos exatos dos Symbols (`kResetPlugins`, storage da lista global de plugins, flag de trava do PLUG-02) — seguir a convenção `kPrivateName`/`KMapName` já usada em Database/Model.
- Mecânica exata do `PluginContext`: como `pre`/`post`/`static` alimentam os arrays de hook e o mapa de statics do model; como a leitura read-only é congelada sem custo de cópia profunda desnecessária.
- Assinatura de tipo precisa do generic de inferência de statics (D-09) e a decisão final inferência-plena vs. interface-merging — dirigida pelo research/planner após validar viabilidade no retorno Proxy.
- Onde o flag de "primeiro model construído" (trava do PLUG-02) vive e como a mensagem de erro de ordem é redigida (`Model.plugin()` chamado tarde demais).
- Interação com a área frágil `isSameConfig` (WR-04 do 05-REVIEW: hoje `isSameConfig` já compara hooks desde a Fase 6): decidir se plugins entram na comparação de re-registro do mesmo `collectionName`.

### Deferred Ideas (OUT OF SCOPE)

- **Decorator `@Use(plugin)` na classe** — considerado para simetria com a API de decorators da Fase 6, mas rejeitado (D-13): uma única via de aplicar plugin (o construtor). Se houver demanda futura por declarar plugins junto do schema decorado, é candidato a fase própria.
- **`apiVersion` / versionamento formal do contrato de plugin** — rejeitado (D-15) em favor do semver do pacote; reconsiderar só se um ecossistema de plugins de terceiros tornar a compatibilidade em runtime necessária.
- **Migrations** (Fase 8) — fora de escopo, já roadmapeado.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| PLUG-01 | Dev pode aplicar plugins por model via `plugins[]` no construtor (aplicados antes do wrap do Proxy) | Ver Arquitetura Patterns §"Ponto de inserção no pipeline" — o construtor resolve/aplica plugins entre a checagem de `existing` e o `return registerModel(...)` (linhas 454-551 de `src/model/index.ts`), antes do wrap. |
| PLUG-02 | Dev registra plugin global via `Model.plugin()`, com enforcement de ordem (erro claro se chamado após a construção do primeiro model) | Ver §"Estado estático global + flag de trava" — modelo direto em `KModelMap`/`kDatabase` (Symbol-keyed static). |
| PLUG-03 | Plugins recebem `PluginContext` tipado e selado: podem registrar hooks e statics; não podem mutar schema/validator/allowedMethods | Ver §"Mecânica do selo read-only" (verificado com `Object.freeze` shallow vs `structuredClone`) e o veredito de tipagem D-09. |
</phase_requirements>

## Summary

Esta fase não introduz nenhuma dependência de runtime nova — é composição pura sobre a infraestrutura já entregue nas Fases 2 (hooks), 3 (erros tipados) e 6 (ordem determinística/`isSameConfig`). O trabalho real é mecânico: (1) resolver `plugins[]` (locais) + a lista global (`Model.plugin()`) dentro do construtor síncrono do `Model`, ANTES do `return Model[kDatabase].registerModel(this)` que faz o wrap em `Proxy`; (2) alimentar os mesmos arrays de hooks (`this.hooks[method].pre/post`) já existentes, no slot determinístico entre `@Pre` de classe e `props.hooks`; (3) expor um `PluginContext` cujo único efeito colateral possível é registrar hooks/statics — leitura de `schema`/`allowedMethods` é sempre uma cópia desconectada, nunca a referência viva.

O item de maior risco técnico da fase — se a inferência de tipos dos statics de plugin sobrevive ao retorno via `new Proxy(...)` do construtor — foi **investigado com prioridade máxima e verificado empiricamente com o `tsc` 5.9.3 pinado no projeto** (não apenas por leitura de documentação). O veredito é definitivo e verificável por qualquer um: **TypeScript não permite anotação de tipo de retorno em um construtor (`TS1093`)**, e o tipo estático de uma expressão `new Model(...)` é **sempre** o tipo de instância declarado da classe (parametrizado por seus próprios generics) — o `return` em runtime (mesmo retornando um `Proxy`) nunca influencia esse tipo. Um acumulador de tipos por tupla variádica (`MergeStatics<Plugins>`) funciona perfeitamente como operação pura de tipos, mas não há como "splicar" esse tipo computado sobre o shape já fechado da classe `Model` sem uma anotação explícita no call-site — o que violaria "o consumidor não anota nada". **Portanto: inferência plena via `new Model(...)` NÃO é viável; a fase deve implementar diretamente o fallback D-09b (interface merging manual pelo consumidor/autor do plugin)**, que é também o padrão consagrado usado por bibliotecas comparáveis (Fastify `decorate()` resolve exatamente o mesmo problema via `declare module`).

**Primary recommendation:** Implementar `plugins[]`/`Model.plugin()` como composição síncrona sobre os hooks/erros já existentes (zero deps novas); resolver D-09 com module augmentation documentada (`declare module '@iamcalegari/mongoat' { interface Model<T> { ... } }`), não com um generic acumulador no construtor.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Aplicação de plugins por-model (`plugins[]`) | API/Backend (biblioteca, camada Model) | — | Roda inteiramente dentro do construtor síncrono do `Model`, sem tocar rede/driver; é uma etapa de composição de configuração, não uma operação de dados. |
| Registro de plugin global (`Model.plugin()`) | API/Backend (estado estático da classe) | — | Estado module-level (`static` na classe `Model`), análogo ao `KModelMap` já existente em `Database`; não é uma responsabilidade de camada de conexão nem de persistência. |
| `PluginContext` (leitura selada + registro de hooks/statics) | API/Backend | — | Superfície de extensão do ODM — mesma camada dos hooks/`allowedMethods`/`validator` que ela expõe read-only. |
| Execução dos hooks registrados por plugin | API/Backend | Database/Storage (indireta) | Os hooks eventualmente chamam o driver via `this.getCollection()`, mas o PONTO de execução do hook (pre/post) é orquestrado pelo `Model`, não pela camada de storage. |
| Statics registrados por plugin (ex.: `paginate`) | API/Backend | Database/Storage (indireta via `this.getCollection()`) | O static É um método do Model — usa o escape hatch para tocar o driver, mas sua definição/binding pertence à camada Model. |

## Standard Stack

Nenhuma dependência de runtime nova é necessária nesta fase — D-02 é explícito: "Zero API extra no core (composição pura de JS/TS)". Toda a mecânica (dedup, ordem, selo, statics, reset) é implementável com:

- `Object` nativo (`Object.freeze`, `structuredClone` — já usados no codebase: `structuredClone` em `schemaValidatorBuilder`/`Schema.compile`, `Object.freeze` ainda não usado no Model mas é built-in ES2015+, coberto pelo `target: ES2023`/`lib: ES2023`).
- `Map`/`Set` nativos para a lista global de plugins e o índice de dedup por referência/nome.
- A hierarquia de erros já existente (`MongoatValidationError` — Fase 3).

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `Object.freeze`/`structuredClone` nativos para o selo do `PluginContext` | Uma lib de deep-freeze (`deep-freeze`, `immer`) | Violaria "mínimo de dependências de runtime" (CLAUDE.md) por um problema já resolvido com 2 linhas de JS nativo — mesma filosofia que rejeitou `lodash.isequal` para `isSameConfig` (Fase 1/D-06). |
| Acumulador de tipos manual (`MergeStatics<Plugins>`) | `type-fest`'s `UnionToIntersection`/utilitários de merge | Não muda o veredito do D-09 (o gargalo é o construtor, não o acumulador de tipos em si — ver §Code Examples) e adicionaria uma dependência de tipos só-`devDependency` para um utilitário de ~5 linhas. |

**Installation:** nenhuma — nenhum pacote novo é adicionado ao `package.json`.

## Package Legitimacy Audit

**Nenhum pacote novo é instalado nesta fase.** D-02 trava explicitamente "zero API extra no core" via composição pura de JS/TS nativo. A auditoria de legitimidade de pacotes (`gsd-tools query package-legitimacy check`) não se aplica — não há `npm install` a validar.

**Packages removed due to [SLOP] verdict:** none (nenhum pacote proposto)
**Packages flagged as suspicious [SUS]:** none (nenhum pacote proposto)

## Architecture Patterns

### System Architecture Diagram

```text
new Model<T>({ schema, plugins: [pluginA, pluginB], hooks, ... })
        │
        ▼
1. Guards de conexão + resolução de schema/collectionName
   (código já existente, D-06/D-08 da Fase 6 — inalterado)
        │
        ▼
2. Checagem de `existing` (re-registro do mesmo collectionName)
   — candidateHasHooks (Fase 6) ganha companhia: candidateHasPlugins?
        │
        ▼  (só quando é um registro NOVO)
3. ATRIBUIÇÃO dos campos do model: collectionName, schemaClass,
   indexes, allowedMethods, documentDefaults, validator, hooks {} vazio
        │
        ▼
4. RESOLUÇÃO DE PLUGINS (NOVO NESTA FASE) — PLUG-01/02
   4a. lista global (Model[kGlobalPlugins]) — ordem de Model.plugin()
   4b. plugins[] locais (props.plugins) — ordem do array
   4c. normaliza cada entrada (função → {name, setup}) — D-01
   4d. dedup por referência (D-07) — mesma ref pula silenciosamente
   4e. para cada plugin único, na ordem global→local:
       - monta PluginContext selado (cópia congelada de
         allowedMethods/schema + collectionName)
       - chama setup(ctx) SINCRONAMENTE, dentro de try/catch
       - erro no setup() → MongoatValidationError PLUGIN_SETUP_FAILED,
         cause = erro original, ABORTA a construção inteira (D-10)
       - ctx.pre/ctx.post → this.hooks[method].pre/post.push(...)
       - ctx.static(name, fn) → valida colisão (D-08) e anexa fn a
         `this` (será bound pelo Proxy trap depois, D-12)
        │
        ▼
5. hooks decorados (@Pre campo → @Pre classe) — JÁ EXISTENTE,
   roda ANTES do passo 4 no código atual (ver nota de ordem abaixo)
        │
        ▼
6. props.hooks (config) — JÁ EXISTENTE, deve rodar DEPOIS do passo 4
        │
        ▼
7. return Model[kDatabase].registerModel(this) — wrap em Proxy
   (plugins já aplicados a `this` ANTES deste ponto — PLUG-01)
        │
        ▼
new Model(...) devolve a instância Proxy-wrapped, com hooks/statics
de plugin já presentes; .pre()/.post() encadeáveis do dev entram DEPOIS
```

**Nota de ordem crítica:** no código atual (`src/model/index.ts:499-539`), os hooks decorados (`@Pre`/`@Post` de classe/campo) são empurrados para `this.hooks` ANTES do bloco `props.hooks`. A ordem travada em D-06 desta fase é `@Pre campo → @Pre classe → PLUGINS → props.hooks → .pre()/.post()`. Isso significa que o bloco de resolução de plugins (passo 4 acima) deve ser inserido **entre** o loop de `decoratedHooks.post` (linha ~516) e o `if (props.hooks)` (linha ~522) — não antes, não depois. Este é o ÚNICO ponto de inserção compatível com D-06 sem reescrever a lógica existente.

### Recommended Project Structure
```
src/
├── model/
│   ├── index.ts          # constructor ganha o bloco de resolução de plugins (passo 4)
│   ├── hooks.ts           # inalterado — runPreHooks/runPostHooks já genéricos o bastante
│   └── plugins.ts         # NOVO: normalizePlugin, dedupPlugins, applyPlugin,
│                           #        buildPluginContext, static-collision guard
├── types/
│   ├── model.ts           # CreateModelProps ganha `plugins?: Plugin<ModelType>[]`
│   └── plugin.ts          # NOVO: Plugin<T>, PluginObject<T>, PluginSetup<T>,
│                           #        PluginContext<T>
```

### Pattern 1: Normalização de plugin (D-01)
**What:** aceitar função OU objeto `{ name, setup }`, sempre normalizar internamente para objeto.
**When to use:** primeiro passo do processamento de cada entrada de `plugins[]`/`Model.plugin()`.
**Example:**
```typescript
// src/model/plugins.ts (padrão observado no core: normalização no boundary,
// nunca espalhada pelos call-sites — mesmo espírito de
// `entry => typeof entry === 'function' ? { fn: entry } : entry` já usado
// para post hooks em src/model/index.ts:533-536)
function normalizePlugin<T extends Document>(
  plugin: Plugin<T>
): PluginObject<T> {
  return typeof plugin === 'function'
    ? { name: plugin.name || '<anonymous>', setup: plugin }
    : plugin;
}
```

### Pattern 2: Dedup por referência + colisão de nome (D-07)
**What:** aplicar o mesmo plugin (mesma referência da função `setup` original, não do objeto normalizado recém-criado) uma única vez; nomes iguais com referências diferentes lançam.
**When to use:** ao montar a lista final ordenada (global → local) antes de rodar qualquer `setup()`.
**Example:**
```typescript
// A CHAVE de dedup é a referência ORIGINAL passada pelo dev (a função, ou o
// objeto { name, setup } literal) — não um objeto novo criado a cada
// chamada de normalize(). Um Map<originalRef, normalized> preserva isso.
function resolvePluginList<T extends Document>(
  globalPlugins: Plugin<T>[],
  localPlugins: Plugin<T>[]
): { original: Plugin<T>; normalized: PluginObject<T> }[] {
  const seen = new Map<Plugin<T>, PluginObject<T>>();
  const byName = new Map<string, Plugin<T>>();
  const ordered: { original: Plugin<T>; normalized: PluginObject<T> }[] = [];

  for (const original of [...globalPlugins, ...localPlugins]) {
    if (seen.has(original)) continue; // D-07: mesma ref, pula (dedup silencioso)

    const normalized = normalizePlugin(original);
    const existingRefForName = byName.get(normalized.name);

    if (existingRefForName && existingRefForName !== original) {
      throw new MongoatValidationError(
        `Plugin "${normalized.name}" already registered with a different reference`,
        { code: 'DUPLICATE_PLUGIN_NAME' }
      );
    }

    byName.set(normalized.name, original);
    seen.set(original, normalized);
    ordered.push({ original, normalized });
  }

  return ordered;
}
```

### Pattern 3: Selo read-only sem cópia profunda desnecessária (D-03)
**What:** `PluginContext.allowedMethods`/`.schema` são cópias desconectadas da referência viva, nunca mutáveis pelo plugin.
**When to use:** montagem do `PluginContext` antes de cada `setup()`.
**Confirmado empiricamente (ver §Assumptions Log — não é `[ASSUMED]`, é `[VERIFIED]` via execução de `node`):** `Object.freeze` é **raso** — congelar um objeto/array não protege propriedades ANINHADAS de mutação. Um `Object.freeze({ ...schema })` ainda permite `frozen.properties.name.bsonType = 'int'` em runtime.
**Example:**
```typescript
function buildPluginContext<T extends Document>(model: Model<T>): PluginContext<T> {
  return {
    collectionName: model.collectionName,
    // allowedMethods: array de strings primitivas — freeze raso já é
    // suficiente e correto (sem aninhamento a proteger).
    allowedMethods: Object.freeze([...model.allowedMethods]),
    // schema: estrutura ANINHADA (properties.*.bsonType, items, etc.) —
    // freeze raso NÃO protege; reusa o MESMO padrão já usado em
    // `schemaValidatorBuilder`/`Schema.compile` (structuredClone) em vez de
    // inventar um deep-freeze. A cópia é desconectada da referência viva —
    // o "selo" de D-03 é satisfeito (mutar a cópia nunca alcança o
    // `model.validator` real), sem o custo/risco de um deep-freeze
    // hand-rolled sobre um shape recursivo (`items`/`properties` aninhados).
    schema: structuredClone(model.validator.$jsonSchema),
    pre: (method, fn) => model.hooks[method].pre.push(fn),
    post: (method, fn, options) =>
      model.hooks[method].post.push({ fn, fireAndForget: options?.fireAndForget }),
    static: (name, fn) => registerPluginStatic(model, name, fn), // ver Pattern 4
  };
}
```

### Pattern 4: Guarda de colisão de statics (D-08)
**What:** statics NÃO passam pelo enum `METHODS`, então o Proxy trap (`src/database/index.ts:337-363`) não os protege automaticamente — a checagem contra nomes nativos precisa ser explícita.
**When to use:** toda chamada de `ctx.static(name, fn)`.
**Example:**
```typescript
// RESERVED_NAMES enumerado por grep real do Model.prototype atual
// (src/model/index.ts) — evita colisão com QUALQUER membro existente,
// não só os do enum METHODS. Inclui os privados (rawX/executeHooked/...)
// porque `private` do TypeScript é só compile-time: em runtime são
// propriedades normais do protótipo, sobrescrevíveis por um static de
// plugin com o mesmo nome se não forem checadas aqui.
const RESERVED_NAMES = new Set([
  ...Object.values(METHODS),        // aggregate, update, updateMany, insert, ...
  'getCollection',                   // escape hatch do Model
  'pre', 'post',                     // API de hooks encadeável
  'collectionName', 'indexes', 'validator', 'validationAction',
  'validationLevel', 'methods', 'allowedMethods', 'documentDefaults', 'hooks',
  'onHookError', 'schemaClass',
  // privados (existem em runtime mesmo sendo `private` no TS):
  'schemaValidatorBuilder', 'includeAdditionalPropertiesFalse',
  'getCollectionOrThrow', 'buildClassDefaults', 'executeHooked', 'runHooked',
  'rawAggregate', 'rawUpdate', 'rawUpdateMany', 'rawFindMany', 'rawDeleteMany',
  'rawInsert', 'rawInsertMany', 'rawFind', 'rawFindById', 'rawDelete', 'rawTotal',
  'rawBulkWrite',
]);

const pluginStaticOwners = new Map<string, string>(); // static name -> plugin name

function registerPluginStatic<T extends Document>(
  model: Model<T>,
  name: string,
  fn: (...args: unknown[]) => unknown,
  pluginName: string
): void {
  if (RESERVED_NAMES.has(name)) {
    throw new MongoatValidationError(
      `Plugin "${pluginName}" cannot register static "${name}" — it collides with a native Model method`,
      { code: 'STATIC_COLLISION' }
    );
  }

  const owner = pluginStaticOwners.get(name);
  if (owner && owner !== pluginName) {
    throw new MongoatValidationError(
      `Static "${name}" is already registered by plugin "${owner}" — plugin "${pluginName}" cannot overwrite it`,
      { code: 'STATIC_COLLISION' }
    );
  }

  pluginStaticOwners.set(name, pluginName);
  (model as unknown as Record<string, unknown>)[name] = fn;
  // D-12: NÃO precisa `.bind(model)` aqui — o Proxy trap
  // (`Database[KModelProxyHandler]`, src/database/index.ts:357-358) já faz
  // `value.bind(target)` para QUALQUER função lida através dele, incluindo
  // esta atribuída dinamicamente. Zero trabalho extra para D-12.
}
```

### Anti-Patterns to Avoid

- **Acumular tipos de statics via generic no construtor do `Model` para inferência automática (D-09 "plena"):** verificado inviável nesta fase — ver veredito abaixo. Não tente resolver isso com generics mais elaborados no construtor; a limitação é estrutural do TypeScript (constructores não podem anotar tipo de retorno — `TS1093`), não uma limitação de expressividade dos generics.
- **Deep-freeze hand-rolled para o `schema` do `PluginContext`:** desnecessário — `structuredClone` já resolve o "nunca a referência viva" com uma função nativa, sem reimplementar recursão sobre um shape que já tem `items`/`properties` aninhados arbitrariamente.
- **Checar colisão de static só contra `Object.values(METHODS)`:** insuficiente — `getCollection`, `pre`, `post` e todos os métodos `rawX`/privados também são propriedades reais do protótipo em runtime; um plugin poderia sobrescrever `rawInsert` silenciosamente se a checagem for restrita ao enum.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Merge de tipos de statics de múltiplos plugins | Um sistema de "plugin registry" com resolução de tipos em runtime | Tipo condicional recursivo sobre tupla `readonly Plugin[]` (`MergeStatics<Plugins>`, ver Code Examples) — funciona como operação PURA de tipos, é só inútil no ponto de consumo (`new Model(...)`) por causa da limitação de constructor. | TypeScript já resolve acumulação de tipos sobre tuplas heterogêneas nativamente (variadic tuple types, TS 4.0+) — reinventar isso em runtime seria redundante e mais frágil que o que o compilador já faz de graça. |
| Congelamento profundo de estruturas aninhadas (`schema`) | Uma função `deepFreeze()` recursiva | `structuredClone()` (nativo, Node 17+, já usado no codebase) | O objetivo de D-03 é "nunca a referência viva" — uma cópia desconectada já satisfaz isso sem precisar impedir mutação da CÓPIA em si (que não afeta nada real). |
| Fila/registro de plugins globais | Uma lib de "plugin manager"/DI container | `Map`/array estático na própria classe `Model` (mesmo padrão de `KModelMap` em `Database`) | O problema é "lista ordenada + flag de trava" — infraestrutura já presente na classe, sem justificar uma dependência ou abstração nova. |

**Key insight:** Toda a superfície nova desta fase é composição sobre primitivas que o TypeScript e o JavaScript nativo já resolvem (tuplas variádicas para tipos, `structuredClone`/`Object.freeze` para imutabilidade, `Map` para registro) — o risco real não é "faltam ferramentas", é "o construtor tem uma restrição estrutural do TypeScript que nenhuma ferramenta contorna" (ver D-09 abaixo).

## D-09 — Veredito de Inferência de Tipos (PRIORIDADE MÁXIMA)

### Pergunta original

`new Model<T>({ plugins: [pluginA, pluginB] })` pode produzir um tipo de retorno que soma os statics declarados por cada plugin ao tipo do model, sem o consumidor anotar nada — sobrevivendo ao retorno via `new Proxy(...)` do construtor?

### Método de verificação

Testado empiricamente com o **TypeScript 5.9.3 pinado no `package.json` do projeto** (não uma versão hipotética), rodando `tsc` real sobre arquivos de experimento isolados, com `strict: true` e o mesmo `target`/`module` do `tsconfig.json` do projeto. `[VERIFIED: tsc 5.9.3 local]` em todo este veredito — não é `[ASSUMED]`.

### Achado 1 — Constructores NÃO podem anotar tipo de retorno

```typescript
class Foo {
  constructor(): Foo {  // <-- tentativa de anotar QUALQUER tipo de retorno,
    return this;         //     mesmo idêntico ao da própria classe
  }
}
```
Resultado do `tsc`: `error TS1093: Type annotation cannot appear on a constructor declaration.`

Isso fecha, de forma definitiva, qualquer variante de "o construtor declara um tipo de retorno diferente/estendido" — TypeScript proíbe a sintaxe categoricamente, não é uma questão de generics mal desenhados.

### Achado 2 — O tipo de `new ClassName(...)` é sempre o tipo de instância da classe, nunca o que o `return` do construtor produz

```typescript
class Model<T, Plugins extends readonly AnyPlugin[] = []> {
  collectionName!: string;
  constructor(props: { collectionName: string; plugins?: Plugins }) {
    this.collectionName = props.collectionName;
    return new Proxy(this, {}) as unknown as this; // runtime: Proxy real
  }
}
const paginatePlugin = plugin<{ paginate: (n: number) => string[] }>({ name: 'paginate', setup: () => {} });
const m = new Model({ collectionName: 'x', plugins: [paginatePlugin] as const });
m.paginate(1); // <-- testado
```
Resultado do `tsc`: `error TS2339: Property 'paginate' does not exist on type 'Model<unknown, readonly [Plugin<{ paginate: (n: number) => string[]; }>]>'`.

Mesmo com o `Plugins` tuple corretamente inferido no tipo genérico exibido no erro (prova de que a inferência de tupla FUNCIONA), a classe nunca ganha `.paginate` como membro — porque `Model` nunca declara esse membro estruturalmente; o `return new Proxy(...)` em runtime é irrelevante para o typechecker.

### Achado 3 — O acumulador de tipos por tupla variádica funciona corretamente como operação pura

```typescript
type StaticsOf<P> = P extends Plugin<infer S> ? S : object;
type MergeStatics<Plugins extends readonly AnyPlugin[]> = Plugins extends readonly [infer Head, ...infer Tail]
  ? Tail extends readonly AnyPlugin[] ? StaticsOf<Head> & MergeStatics<Tail> : StaticsOf<Head>
  : object;

type Merged = MergeStatics<readonly [Plugin<{ paginate: (n: number) => string[] }>, Plugin<{ touch: () => void }>]>;
const check: Merged = { paginate: (n) => [String(n)], touch: () => {} }; // compila sem erro
```
Confirma (a) da pergunta original: TypeScript acumula generics de um array heterogêneo de plugins perfeitamente. O problema NUNCA foi a expressividade do sistema de tipos — é o ponto (b): não há como aplicar esse tipo computado sobre o resultado de `new Model(...)`.

### Achado 4 — Uma função factory (não `new ClassName()`) resolve isso de forma completa e sem anotação do consumidor

```typescript
function createModel<T, Plugins extends readonly AnyPlugin[] = []>(
  props: { collectionName: string; plugins?: Plugins }
): Model<T, Plugins> & MergeStatics<Plugins> {
  const model = new Model<T, Plugins>(props);
  return model as Model<T, Plugins> & MergeStatics<Plugins>;
}
const m = createModel({ collectionName: 'x', plugins: [paginatePlugin, timestampsPlugin] as const });
m.paginate(1); // compila
m.touch();     // compila
```
Funciona **perfeitamente** (zero erros, zero anotação do consumidor) — porque funções comuns (ao contrário de constructores) PODEM declarar um tipo de retorno arbitrário, e o typechecker confia nessa anotação para o call-site. **Mas isso exige que o dev escreva `createModel(...)`, não `new Model(...)`** — o que contradiz o texto literal de PLUG-01/Success Criteria #1 ("Dev aplica plugins por model via `plugins[]` **no construtor**") e D-13 ("uma única via de aplicar plugin: **o construtor**").

### Achado 5 — Module augmentation (D-09b) funciona e é o padrão consagrado do ecossistema

```typescript
class Model<T> {
  constructor(props: { collectionName: string; plugins?: AnyPlugin[] }) {
    this.collectionName = props.collectionName;
    return new Proxy(this, {}) as unknown as this;
  }
}
interface Model<T> {          // declaration merging: interface + class do mesmo nome
  paginate(n: number): string[];
}
const m = new Model({ collectionName: 'x', plugins: [] });
m.paginate(1); // compila — mas SÓ por causa da interface escrita à mão acima
```
Compila sem erro. Este é exatamente o padrão que o Fastify usa para o mesmo problema (`decorate()`/`FastifyInstance`): `declare module 'fastify' { interface FastifyRequest { user: {...} } }` — confirmado via pesquisa (ver Sources). É a solução padrão da indústria para "método/propriedade injetada dinamicamente por plugin, tipada estaticamente sem anotação do generic no call-site principal".

### Veredito

**Inferência plena via `new Model(...)` NÃO é viável.** Duas barreiras estruturais e independentes do TypeScript, ambas verificadas por compilação real:
1. Constructores não podem declarar tipo de retorno (`TS1093`) — elimina qualquer tentativa de o construtor "prometer" um tipo diferente do já declarado pela classe.
2. O tipo de `new ClassName(...)` é sempre o tipo de instância nominal da classe (parametrizado pelos seus próprios generics) — nunca reflete o valor de runtime retornado pelo `return` do construtor.

**Decisão para o planner:** implementar diretamente o **fallback D-09b (module augmentation)**, documentado como a forma oficial de tipar statics de plugin:
```typescript
// Ergonomia do consumidor (ou do pacote do plugin, se publicado):
declare module '@iamcalegari/mongoat' {
  interface Model<ModelType extends Document> {
    paginate(page: number, pageSize: number): Promise<WithId<ModelType>[]>;
  }
}
```
Isso exige que `Model` já seja exportado como `class` (é — `src/model/index.ts`) e que a interface mesclada declare a MESMA aridade/constraint de generics (`<ModelType extends Document>`) para o merge funcionar — TypeScript funde `class` + `interface` de mesmo nome no mesmo módulo/escopo automaticamente, sem sintaxe extra no core do Mongoat. Nenhuma mudança na assinatura pública de `Model` é necessária para habilitar isso — funciona hoje, com a classe como está.

A tupla `MergeStatics<Plugins>` (Achado 3) continua útil, mas só internamente/documentado como referência — não pode ser plugada no tipo de retorno de `new Model(...)`. Recomenda-se **não** implementá-la no core (seria código morto do ponto de vista do consumidor); documentar apenas o padrão de module augmentation no guia de plugins (Fase 4/DOCS, quando o guia de plugins for escrito).

## Common Pitfalls

### Pitfall 1: Aplicar plugins no lugar errado da ordem D-06
**What goes wrong:** hooks de plugin registrados antes de `@Pre` decorado, ou depois de `props.hooks` — quebra a garantia "config sobrescreve declaração"/gradiente genérico→específico.
**Why it happens:** o construtor atual (`src/model/index.ts:499-539`) já tem dois blocos consecutivos (`decoratedHooks` e `props.hooks`); é fácil inserir o novo bloco de plugins no lugar errado por engano (antes do primeiro, ou depois do segundo).
**How to avoid:** inserir o bloco de resolução de plugins ESTRITAMENTE entre o loop `decoratedHooks.post` (linha ~516) e o `if (props.hooks)` (linha ~522).
**Warning signs:** teste de ordem determinística (D-06) falhando com plugin executando antes de `@Pre` de campo, ou depois de `.pre()` encadeado.

### Pitfall 2: Checar colisão de static só contra o enum `METHODS`
**What goes wrong:** um plugin registra um static chamado `rawInsert` ou `getCollectionOrThrow` (métodos privados reais em runtime) e sobrescreve silenciosamente uma função interna do Model, quebrando TODOS os métodos CRUD que dependem dela.
**Why it happens:** `METHODS` só lista os 12 métodos públicos gated pelo Proxy — os privados (`rawX`, `executeHooked`, `runHooked`, `getCollectionOrThrow`, `buildClassDefaults`, `schemaValidatorBuilder`, `includeAdditionalPropertiesFalse`) são invisíveis ao TypeScript de fora, mas são propriedades REAIS do protótipo em runtime (`private` é apagado na compilação).
**How to avoid:** enumerar `RESERVED_NAMES` via os nomes reais do protótipo (Pattern 4 acima), não apenas `Object.values(METHODS)`.
**Warning signs:** um teste que registra um static com nome coincidente a um método privado e depois chama qualquer método CRUD público — se passar sem erro na CONSTRUÇÃO e falhar de forma bizarra numa chamada de método depois, é este pitfall.

### Pitfall 3: `Object.freeze` raso tratado como se protegesse `schema` aninhado
**What goes wrong:** um dev (ou um teste) assume que `ctx.schema` é totalmente imutável porque foi `Object.freeze`d, e um plugin malicioso/com bug muta `ctx.schema.properties.name.bsonType` — a mutação AFETA a cópia (inofensiva), mas se a implementação tivesse feito `Object.freeze(model.validator.$jsonSchema)` DIRETO (sem clonar antes), a mutação alcançaria o schema REAL do model (já que freeze não impede reatribuição de sub-propriedades não congeladas, e mais grave: mesmo se congelasse a referência LIVE, ainda seria a referência live).
**Why it happens:** `Object.freeze` é raso por especificação ECMAScript — confirmado por execução real (`node -e`) neste research: um objeto congelado com propriedade aninhada não congelada permite mutação da propriedade aninhada.
**How to avoid:** SEMPRE `structuredClone` antes de expor `schema` no `PluginContext` (nunca `Object.freeze(model.validator.$jsonSchema)` diretamente — isso exporia a referência viva, congelada ou não).
**Warning signs:** teste que muta `ctx.schema` num plugin e depois verifica `model.validator.$jsonSchema` — se a mutação vazar, o clone não está acontecendo.

### Pitfall 4: `isSameConfig` não considerar plugins num re-registro (WR-04 revisitado)
**What goes wrong:** re-registrar o mesmo `collectionName` com uma lista de `plugins[]` DIFERENTE da primeira vez seria silenciosamente descartado pelo early-return de `isSameConfig` (que hoje não compara plugins) — igual ao bug histórico que motivou `candidateHasHooks` na Fase 6.
**Why it happens:** plugins carregam `setup` (função), que não é estruturalmente comparável via `stableStringify` — mesma razão pela qual hooks não entram em `isSameConfig`.
**How to avoid:** seguir o MESMO padrão de `candidateHasHooks` (linhas 443-452): computar um `candidateHasPlugins` categórico (`Boolean(props.plugins?.length)`) e, se `existing` já está registrado E o candidato declara plugins, lançar `MongoatValidationError` (fail-loud), nunca comparar estruturalmente.
**Warning signs:** teste de re-registro com plugins divergentes retornando a instância antiga sem erro.

### Pitfall 5: Esquecer que `Model.plugin()` precisa travar ANTES do primeiro `new Model()` bem-sucedido — inclusive reuso de config idêntica
**What goes wrong:** se o flag de trava só é setado no branch de registro NOVO (não no early-return de config idêntica, linha 454-474 atual), uma sequência `new Model(A)` (idêntico, reusa) → `Model.plugin(x)` → `new Model(B)` deixaria `x` inconsistente: aplicado em B mas não em A, apesar de nenhum dos dois ter "seguramente" travado o registro global antes.
**Why it happens:** o early-return de `isSameConfig` (reuso da instância já registrada) tecnicamente NÃO executa o bloco de resolução de plugins de novo — é plausível (mas incorreto) achar que só o branch "registro novo" conta como "primeiro model construído".
**How to avoid:** setar o flag de trava (Claude's Discretion) na primeira vez que o CONSTRUTOR é chamado com sucesso, independentemente de cair no early-return de reuso ou no registro novo — o critério é "algum model já foi materializado", não "algum model novo foi registrado".
**Warning signs:** teste que chama `new Model(mesmaConfig)` duas vezes e depois `Model.plugin()` — se não lançar, o flag não está sendo setado no lugar certo.

## Code Examples

### Tipos propostos (`src/types/plugin.ts`, novo)
```typescript
// Source: composição sobre HookFn/HookContextMap/METHODS já existentes
// (src/types/hooks.ts) — nenhum tipo novo de hook, só a superfície de
// registro exposta ao autor de plugin.
import type { Document } from 'mongodb';
import type { HookContextMap, HookFn } from '@/types/hooks';
import type { METHODS } from '@/utils/enums';
import type { ModelValidationSchema } from '@/types/model';

export interface PluginContext<ModelType extends Document = Document> {
  readonly collectionName: string;
  readonly allowedMethods: readonly METHODS[];
  readonly schema: Readonly<ModelValidationSchema>;

  pre<M extends METHODS>(method: M, fn: HookFn<HookContextMap<ModelType>[M]>): void;
  post<M extends METHODS>(
    method: M,
    fn: HookFn<HookContextMap<ModelType>[M]>,
    options?: { fireAndForget?: boolean }
  ): void;
  static(name: string, fn: (...args: never[]) => unknown): void;
}

export type PluginSetup<ModelType extends Document = Document> = (
  ctx: PluginContext<ModelType>
) => void;

export interface PluginObject<ModelType extends Document = Document> {
  name?: string;
  setup: PluginSetup<ModelType>;
}

export type Plugin<ModelType extends Document = Document> =
  | PluginSetup<ModelType>
  | PluginObject<ModelType>;
```

### `CreateModelProps` ganha `plugins[]` (`src/types/model.ts`)
```typescript
// Adição pontual — resto da interface inalterado.
export interface CreateModelProps<ModelType extends Document> {
  // ...campos existentes...
  /**
   * Plugins locais deste model, aplicados DEPOIS dos plugins globais
   * (`Model.plugin()`) e ANTES do wrap em Proxy (PLUG-01). Ver D-05/D-06.
   */
  plugins?: Plugin<ModelType>[];
}
```

### Fábrica parametrizável (D-02 — zero API extra)
```typescript
// Exemplo de referência do próprio dev (07-CONTEXT.md §Specific Ideas) —
// nenhuma API nova do core é necessária; é JS/TS puro.
function timestamps(options: { createdField?: string; updatedField?: string } = {}) {
  const createdField = options.createdField ?? 'createdAt';
  const updatedField = options.updatedField ?? 'updatedAt';

  return {
    name: 'timestamps',
    setup(ctx: PluginContext) {
      ctx.pre(METHODS.INSERT, (c) => {
        (c.document as Record<string, unknown>)[createdField] = new Date();
      });
      ctx.pre(METHODS.UPDATE, (c) => {
        c.update = { ...c.update, $set: { ...c.update.$set, [updatedField]: new Date() } };
      });
    },
  };
}

new Model({
  collectionName: 'users',
  schema,
  plugins: [timestamps({ createdField: 'created_at' })],
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| Mongoose `schema.plugin(fn, opts)` — plugin recebe o `schema` mutável direto, sem selo | Mongoat `PluginContext` selado (leitura read-only, efeito só via `pre`/`post`/`static`) | Decisão desta fase (D-03) | Elimina a classe de bug mais comum em plugins de Mongoose (mutação acidental de schema/paths compartilhados entre múltiplos usos do mesmo plugin) — trade-off deliberado de "menos poder, mais previsibilidade", coerente com o core value do Mongoat. |
| Tipagem de statics de plugin via `any`/module augmentation manual (padrão histórico em ODMs JS/TS, incluindo Mongoose com `@types/mongoose` antigo) | Mesmo padrão (module augmentation) adotado deliberadamente após validação de que a alternativa "moderna" (generic acumulador no construtor) não é viável em TS | Este research (2026-07-15) | Não é uma regressão — é a confirmação de que o padrão já usado pela indústria (Fastify, Express `Request` augmentation) continua sendo o único caminho correto para este problema estrutural do TypeScript, não uma solução ultrapassada. |

**Deprecated/outdated:** nenhum — não há API anterior de plugins no Mongoat (feature nova).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Mongoose expõe `schema.plugin(fn, opts)` sem selo/imutabilidade — usado só como contraste histórico, não como fonte normativa das decisões D-01..D-15 (já travadas) | State of the Art | Baixo — é uma nota comparativa, não uma decisão de implementação; mesmo que os detalhes exatos da API do Mongoose tenham mudado em versões recentes, não afeta nenhuma decisão travada desta fase. |

**Nota sobre o restante do documento:** todas as demais claims técnicas centrais (veredito D-09, comportamento de `Object.freeze`, restrição `TS1093`, comportamento de `new ClassName(...)`) são `[VERIFIED]` — confirmadas por execução real do `tsc 5.9.3`/`node` nesta sessão, não por conhecimento de treinamento. A tabela acima está propositalmente curta porque o research evitou fazer afirmações não verificadas sobre os pontos de maior risco da fase.

## Open Questions

1. **Nome exato do método `PluginContext.static()` vs. um verbo diferente (`ctx.decorate()`, ao estilo Fastify)**
   - What we know: D-03 já define que o registro de statics é "a única via de efeito" além de `pre`/`post`; o nome `static` é consistente com a terminologia usada em toda a documentação da fase (CONTEXT.md, ROADMAP.md).
   - What's unclear: se `static` como nome de método colide semanticamente com a palavra-chave `static` do JS/TS dentro do corpo de `setup()` (não colide sintaticamente — é só uma property key — mas pode confundir na leitura).
   - Recommendation: manter `ctx.static(name, fn)` — é o termo já usado nas Success Criteria da fase; renomear seria custo de comunicação sem ganho técnico.

2. **`isSameConfig`/`candidateHasPlugins`: comparar por presença (categórico) ou tentar comparar a lista de plugins por referência (array de refs)?**
   - What we know: Pitfall 4 acima recomenda o padrão categórico (`Boolean(props.plugins?.length)`), espelhando exatamente `candidateHasHooks`.
   - What's unclear: se comparar as REFERÊNCIAS dos plugins (não só a presença) permitiria um caminho de "reuso legítimo" quando o array de plugins é IDÊNTICO (mesmas referências, mesma ordem) — hoje isso é indefinido/discricionário (Claude's Discretion no CONTEXT.md).
   - Recommendation: planner decide; o approach categórico é mais simples e mais seguro (fail-loud sempre que há QUALQUER plugin no candidato de um re-registro), consistente com a política de hooks já estabelecida.

## Environment Availability

Não aplicável — esta fase não introduz nenhuma dependência externa (nem runtime, nem de infraestrutura de teste). O ambiente de testes já existente (Docker + `mongo:7` via `@testcontainers/mongodb`, `vitest`) cobre integralmente as necessidades desta fase; nenhuma nova ferramenta/serviço é necessária.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest ^4.1.10 |
| Config file | `vitest.config.ts` |
| Quick run command | `npx vitest run test/model/<arquivo-novo>.test.ts` |
| Full suite command | `npm test` (`vitest run`) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PLUG-01 | `plugins[]` locais são aplicados dentro do construtor, ANTES do wrap do Proxy (statics/hooks presentes já na primeira construção; `ctx.static` acessa `this.getCollection()` sem erro) | unit | `npx vitest run test/model/plugins-application-order.test.ts` | ❌ Wave 0 |
| PLUG-01 | Falha em `setup()` de um plugin local aborta `new Model(...)` — model NUNCA é registrado (`Database.getModel(name)` retorna `undefined` depois) | unit | `npx vitest run test/model/plugins-fail-loud.test.ts` | ❌ Wave 0 |
| PLUG-02 | `Model.plugin(g)` aplica ANTES dos `plugins[]` locais (ordem observável via spy de execução) | unit | `npx vitest run test/model/plugins-order.test.ts` | ❌ Wave 0 |
| PLUG-02 | `Model.plugin()` chamado APÓS o primeiro `new Model(...)` bem-sucedido (inclusive reuso de config idêntica) lança erro de ordem | unit | `npx vitest run test/model/plugins-global-lock.test.ts` | ❌ Wave 0 |
| PLUG-02 | `Model[kResetPlugins]()` limpa lista global + flag de trava (permite `Model.plugin()` de novo em teste seguinte) | unit | `npx vitest run test/model/plugins-reset.test.ts` | ❌ Wave 0 |
| PLUG-03 | `ctx.schema`/`ctx.allowedMethods` são cópias — mutar a cópia NUNCA afeta `model.validator`/`model.allowedMethods` reais | unit | `npx vitest run test/model/plugins-context-seal.test.ts` | ❌ Wave 0 |
| PLUG-03 | `ctx.pre`/`ctx.post`/`ctx.static` são os ÚNICOS canais de efeito — não há forma de mutar schema/validator/allowedMethods via `ctx` | unit | `npx vitest run test/model/plugins-context-seal.test.ts` | ❌ Wave 0 |
| D-06/D-11 (ordem determinística) | Hooks executam na ordem `@Pre campo → @Pre classe → PLUGINS(global→local) → props.hooks → .pre()/.post() encadeados` | unit | `npx vitest run test/model/plugins-order.test.ts` | ❌ Wave 0 |
| D-07 (dedup) | Mesmo plugin (mesma ref) registrado global+local aplica 1x (spy de `setup` chamado 1 vez); nomes iguais/refs diferentes lançam `DUPLICATE_PLUGIN_NAME` | unit | `npx vitest run test/model/plugins-dedup.test.ts` | ❌ Wave 0 |
| D-08 (colisão de statics) | Static colidindo com método nativo (`find`, `getCollection`, e um privado como `rawInsert`) lança `STATIC_COLLISION`; dois plugins com o mesmo nome de static lançam `STATIC_COLLISION` | unit | `npx vitest run test/model/plugins-static-collision.test.ts` | ❌ Wave 0 |
| D-10 (fail-loud) | Erro em `setup()` lança `MongoatValidationError` code `PLUGIN_SETUP_FAILED`, `.cause` = erro original, mensagem inclui o `name` do plugin culpado | unit | `npx vitest run test/model/plugins-fail-loud.test.ts` | ❌ Wave 0 |
| D-12 (bind de statics) | Static de plugin chamado via a instância Proxy-wrapped tem `this` bound corretamente (`this.getCollection()`/`this.find()` funcionam de dentro do static) | integration (usa MongoDB real via testcontainers) | `npx vitest run test/model/plugins-static-binding.test.ts` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `npx vitest run test/model/plugins-*.test.ts`
- **Per wave merge:** `npm test` (suíte completa — inclui testcontainers/Docker)
- **Phase gate:** suíte completa verde antes de `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `test/model/plugins-application-order.test.ts` — cobre PLUG-01 (aplicação antes do wrap)
- [ ] `test/model/plugins-fail-loud.test.ts` — cobre PLUG-01/D-10 (abort de construção)
- [ ] `test/model/plugins-order.test.ts` — cobre PLUG-02/D-06/D-11 (ordem completa: campo→classe→plugins→config→encadeado)
- [ ] `test/model/plugins-global-lock.test.ts` — cobre PLUG-02 (enforcement de ordem do `Model.plugin()`)
- [ ] `test/model/plugins-reset.test.ts` — cobre D-11 (`kResetPlugins`)
- [ ] `test/model/plugins-context-seal.test.ts` — cobre PLUG-03/D-03 (selo read-only)
- [ ] `test/model/plugins-dedup.test.ts` — cobre D-07 (dedup por referência + colisão de nome)
- [ ] `test/model/plugins-static-collision.test.ts` — cobre D-08 (nativo protegido + plugin↔plugin)
- [ ] `test/model/plugins-static-binding.test.ts` — cobre D-12 (bind via Proxy), integração real com MongoDB (`@testcontainers/mongodb`, já configurado em `test/setup/testcontainer.ts`)

Nenhuma mudança de framework/tooling é necessária — `vitest`, `@testcontainers/mongodb` e o `globalSetup` (`test/setup/testcontainer.ts`) já cobrem 100% da infraestrutura de teste requerida por esta fase (nenhum teste desta fase precisa de I/O de rede real além de PLUG-03/D-12, que já reusam o container MongoDB compartilhado).

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V1 Architecture | Sim | Fail-loud na construção (D-10) — nenhum model "meio-configurado" é registrado; superfície de efeito do `PluginContext` restrita a 3 métodos (`pre`/`post`/`static`), nunca acesso direto a referências mutáveis. |
| V2 Authentication | Não | Plugins não tocam autenticação — são uma extensão de camada Model, não de rede/sessão. |
| V3 Session Management | Não | Idem. |
| V4 Access Control | Não | `allowedMethods` é apenas LIDO (cópia) pelo `PluginContext` — plugins não podem ampliar/reduzir o que o Proxy gateia (D-03 impede exatamente isso). |
| V5 Input Validation | Parcial | Plugins não recebem input do usuário FINAL diretamente — mas um plugin mal escrito PODE registrar um `pre` hook que introduz uma vulnerabilidade de validação (ex.: remover um dos campos protegidos). Isso é um risco do CÓDIGO do plugin em si, fora do controle do core (mesma superfície de confiança que já existe para hooks manuais desde a Fase 2). |
| V6 Cryptography | Não | Nenhuma criptografia nesta fase. |
| V10 Malicious/Third-Party Code | Sim | Principal categoria relevante — ver "Known Threat Patterns" abaixo. |

### Known Threat Patterns for {stack}

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Plugin de terceiro com `setup()` malicioso/comprometido executa código arbitrário síncrono durante a construção do model (supply-chain risk — análogo a um pacote npm comprometido) | Elevation of Privilege | O Mongoat não pode "sandboxar" código JS de terceiros rodando no mesmo processo — é uma limitação fundamental do modelo de plugin in-process (mesma classe de risco de QUALQUER dependência npm). Mitigação documentada (não técnica): tratar plugins de terceiros com a MESMA disciplina de auditoria de supply-chain já aplicada a dependências do `package.json` (ver `T-01-01-SC` do histórico do projeto). O core mitiga o que É controlável: `PluginContext` NUNCA expõe a referência viva de `schema`/`validator`/`allowedMethods` (D-03), então mesmo um plugin malicioso não pode alterar retroativamente o contrato de validação do MongoDB (`$jsonSchema` já compilado permanece imutável a partir do `PluginContext`). |
| Plugin registra um static com o mesmo nome de um método privado interno (`rawInsert`, `executeHooked`), sobrescrevendo silenciosamente lógica interna do driver-wrapping | Tampering | Guarda de colisão explícita (D-08/Pattern 4) contra o conjunto COMPLETO de nomes reservados (não só `Object.values(METHODS)`) — falha loud na construção (`STATIC_COLLISION`), nunca sobrescreve silenciosamente. |
| `onHookError` de um hook registrado por plugin vaza dados sensíveis do `ctx` (documento/filtro) em log não sanitizado | Information Disclosure | Comportamento HERDADO da Fase 2/3 sem mudança — `defaultOnHookError` já loga só `err`, nunca `ctx` inteiro (T-02-02); plugins não introduzem uma superfície nova aqui, apenas reusam o mecanismo existente. |

## Sources

### Primary (HIGH confidence)
- `tsc` 5.9.3 (versão exata pinada em `package.json`) — execução real, local, dos 6 experimentos de tipos do D-09 (constructor return type annotation, `new ClassName()` typing, variadic tuple accumulation, factory function typing, module augmentation) e do experimento de `Object.freeze` shallow (via `node -e`).
- `src/model/index.ts`, `src/database/index.ts`, `src/types/model.ts`, `src/types/hooks.ts`, `src/model/hooks.ts`, `src/schema/compile.ts`, `src/schema/index.ts`, `src/types/schema.ts`, `src/errors/index.ts`, `src/utils/enums.ts` — leitura completa do código-fonte atual (não resumos).
- `.planning/phases/07-sistema-de-plugins/07-CONTEXT.md` e `07-DISCUSSION-LOG.md` — decisões travadas D-01..D-15.
- `.planning/codebase/CONCERNS.md` — área frágil "Static Model Registry with No Thread Safety" (motiva D-11).

### Secondary (MEDIUM confidence)
- [Middleware — Mongoose v9.7.4](https://mongoosejs.com/docs/middleware.html) — ordem de execução pre/post e `schema.plugin(fn, opts)`, usado só como contraste histórico (State of the Art), não como base normativa.
- [TypeScript | Fastify](https://fastify.dev/docs/latest/Reference/TypeScript/) e [Module augmentation in TypeScript · Issue #82 · fastify/fastify-jwt](https://github.com/fastify/fastify-jwt/issues/82) — confirma que `declare module` é o padrão consagrado para tipar decorações dinâmicas de instância em bibliotecas TS comparáveis.

### Tertiary (LOW confidence)
- Nenhuma claim desta fase depende de fonte não verificada além da nota A1 (Assumptions Log).

## Metadata

**Confidence breakdown:**
- D-09 (inferência de tipos): HIGH — verificado por execução real do compilador pinado do projeto, não por leitura de documentação.
- Standard stack: HIGH — zero dependências novas, decisão já travada (D-02); não há ambiguidade a resolver.
- Architecture/ordem de inserção: HIGH — ponto exato de inserção confirmado por leitura linha-a-linha do construtor atual (`src/model/index.ts:499-539`).
- Pitfalls: HIGH — 4 dos 5 pitfalls derivam diretamente de comportamento já observado no código atual (padrão `candidateHasHooks`, Proxy trap, freeze raso testado); 1 (Pitfall 5, flag de trava) é uma recomendação de design coberta como Claude's Discretion, não uma claim factual.

**Research date:** 2026-07-15
**Valid until:** 2026-08-14 (30 dias — stack estável, sem dependências externas com ciclo de release rápido; o único fator de "expiração" seria uma mudança de versão do TypeScript no `package.json`, que re-abriria a necessidade de re-verificar o veredito D-09)
