# Phase 1: Fundação — Core sem bugs e build moderno - Research

**Researched:** 2026-07-07
**Domain:** Correção de bugs conhecidos em ODM MongoDB (TypeScript) + migração de build tooling para dual CJS/ESM
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Piso de Node.js e target do build**
- **D-01:** `engines` sobe para **Node >= 20.19** já na Fase 1 (ex.: `"^20.19.0 || >=22.12.0"`) — destrava `structuredClone` e `require(esm)`; quebrar em alpha é barato.
- **D-02:** Target de compilação alinhado ao floor (ES2023) — detalhe fino a critério do Claude.

**Exports e formato do pacote**
- **D-03:** Distribuição **dual CJS + ESM** com tipos separados (`.d.ts`/`.d.mts`) — leitura literal do REL-02; zero fricção para qualquer consumidor.
- **D-04:** Build por **bundler de lib** (tsup ou tsdown — pesquisa decide; tsdown é o sucessor do tsup, que está em manutenção). O bundler resolve os path aliases `@/*` e elimina `tsc-alias`/`tsconfig-paths` do build.
- **D-05:** npm publica **só `lib/`** — remover `src` e `tsconfig.json` do campo `files`.

**Semântica do registry de models**
- **D-06:** `new Model()` para collection já registrada **retorna a instância existente, mas lança erro claro se a config da segunda chamada divergir** da registrada. O check-and-set vira atômico (fecha a race de `src/model/index.ts:76-80`).
- **D-07:** Setup de collections permanece **explícito e documentado** (registrar → `connect()` → `setupCollections()`); model registrado depois exige `setupCollection(model)` manual. Sem async implícito no constructor.
- **D-08:** **Remover o fallback de dbName de teste** embutido na lib (`mongoat-test` / `${PACKAGE}-test-…` em `src/database/index.ts:396-412`): sem `MONGODB_DB_NAME` e sem `config.dbName`, a conexão lança erro descritivo. Comportamento de teste sai do runtime da lib.
- **D-09:** Registry ganha **API mínima de limpeza/reset** (pode ser `@internal`) junto do fix de race — a suíte da Fase 3 não precisa reabrir o registry.
- **D-10:** Operação de model **antes de `connect()` lança erro claro e tipado** ("Database not connected — call db.connect() first") em vez do TypeError críptico do cast `as Collection`.
- **D-11:** Novos erros da Fase 1 (config divergente, dbName ausente, sem conexão) nascem numa **classe base própria `MongoatError`** (extends Error, com `cause` preservando o erro original). O re-wrap `MongoError(JSON.stringify(err))` dos erros do driver só muda na Fase 3 (SEC-04).

**Validação dos fixes (sem suíte completa até a Fase 3)**
- **D-12:** **Testes com vitest já na Fase 1**: regressão de cada bug corrigido **+ happy-path CRUD básico por método público**. A suíte completa continua sendo da Fase 3. Remover `ts-jest` morto das devDependencies.
- **D-13:** Backend de teste: **Docker (testcontainers/compose)** com Mongo real. **Esta decisão vira o padrão do projeto e substitui `mongodb-memory-server`** também na Fase 3 (ajustar o critério do ROADMAP no planning da Fase 3; CI usará service container de Mongo).
- **D-14:** Script npm **`check:package`** rodando `are-the-types-wrong` + `publint` sobre o tarball do `npm pack` — mesma validação entra na CI da Fase 3.
- **D-15:** **Smoke de consumo**: dois mini-projetos temporários (CJS com `require`, ESM com `import`) instalam o tarball e executam um import básico — pega o que a análise estática não vê.
- **D-16:** `examples/` são **atualizados para o novo build** (tsx ou ts-node moderno) e executados uma vez como smoke manual.

### Claude's Discretion
- Target exato de compilação (alinhado ao floor Node 20.19; ES2023 como referência).
- Escolha entre tsup e tsdown (decidir na pesquisa) — **decidido nesta pesquisa: tsdown** (ver Standard Stack).
- **Manter ou remover os subpath exports** (`./database`, `./model`, `./utils`, `./types`) — decidir no planning pelo custo de manutenção do exports map; o barrel raiz já re-exporta tudo.
- Design interno do fix de race e da API de reset do registry.
- Mecânica da clonagem de schema (ex.: `structuredClone`, disponível no novo floor) para `includeAdditionalPropertiesFalse` não mutar objetos do usuário — **decidido nesta pesquisa: `structuredClone`** (ver Architecture Patterns, Pattern 4).

### Deferred Ideas (OUT OF SCOPE)
- **Ajuste do critério da Fase 3 no ROADMAP** (trocar "mongodb-memory-server" por Docker/testcontainers) — aplicar no planning da Fase 3, decorrência de D-13.
- Hierarquia completa de erros e sanitização de mensagens do driver — Fase 3 (SEC-04); a Fase 1 só introduz a base `MongoatError` para os erros novos.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| QUAL-01 | Bugs conhecidos de `.planning/codebase/CONCERNS.md` corrigidos: pre-hooks não aguardados em `insertMany`, binding perdido no proxy handler, tipo de retorno de `find()`, race condition do registry estático, mutação de schema em `includeAdditionalPropertiesFalse` | Architecture Patterns (Patterns 1-5) dão a correção exata linha a linha para cada um dos 5 bugs, incluindo a nuance de bind-to-target (não receiver) e a reavaliação de que a "race" do registry é hoje síncrona (o fix real é a checagem de config divergente, D-06) |
| QUAL-04 | Dependência `json-schema` 0.4.0 removida do runtime (validação é server-side via `$jsonSchema`) | Summary + Don't Hand-Roll + Pitfall 2 explicam que o import já é type-only hoje e detalham o caminho (mover para devDependencies + validar com `attw`) e o fallback (vendorizar o tipo) se o bundling de tipos não for automático |
| REL-02 | Build dual CJS/ESM (tsdown) com `exports` map correto, validado por `are-the-types-wrong` como gate de CI | Standard Stack decide tsdown vs tsup; Code Examples dá o `exports` map completo com `types` primeiro em cada condition; Validation Architecture mapeia o gate `check:package` (attw+publint) mesmo sem CI ainda existir (D-14/D-15 cobrem a validação manual/local nesta fase) |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- **Arquitetura Proxy/registry:** manter a arquitetura atual (gating de métodos e registro de models via Proxy) — decisão do autor. Todos os fixes desta fase (Patterns 1, 5) atuam DENTRO dela; nenhuma alternativa de redesenho foi pesquisada.
- **Mínimo de dependências de runtime:** preferir recursos nativos do driver oficial — orienta a rejeição de libs de deep-equal para a comparação de config do registry (ver Don't Hand-Roll) e o uso de `structuredClone` nativo em vez de uma lib de clone.
- **Boas práticas de segurança MongoDB:** `serverApi` strict em produção já existe no código (`src/database/index.ts:100-109`) e não é tocado nesta fase; validação server-side já é o padrão (`$jsonSchema`).
- **Compatibilidade:** Node >= 16.20.1 (a subir para >=20.19 nesta fase, D-01), driver `mongodb` v7, TypeScript 5.x — **não** atualizar para TypeScript 6.x mesmo que seja a versão mais recente do registry (confirmado `6.0.3` disponível); manter TS `5.9.x` conforme stack declarado.
- **Distribuição via npm público:** mudanças de API exigem versionamento semântico disciplinado — reforça D-06 (erro claro em vez de comportamento silencioso) e a natureza "breaking-mas-documentada" das mudanças desta fase (engines, dbName, files).
- **Convenções de código:** símbolos `k`-prefixed para estado privado (`kClient`, `kDb`, `kDatabase`) — qualquer novo estado interno (ex.: guard de config do registry) deve seguir o mesmo padrão. Comentários JSDoc `@public`/`@private`/`@deprecated` nos métodos públicos/depreciados.
- **GSD Workflow Enforcement:** execução desta fase deve passar por `/gsd-execute-phase` — não editar arquivos diretamente fora do workflow GSD.

## Summary

Esta fase não introduz features novas — ela corrige 5 bugs já diagnosticados linha a linha em `.planning/codebase/CONCERNS.md` e migra o build de `tsc`+`tsc-alias` para um bundler de lib com saída dual CJS/ESM. A leitura direta do código-fonte (`src/model/index.ts`, `src/database/index.ts`, `package.json`, `tsconfig.json`) confirma todos os bugs apontados no CONCERNS.md e revela dois detalhes adicionais importantes para o planning: (1) o bug de binding do Proxy faz DOIS `Reflect.get()` e descarta o resultado do `.bind()` — a correção precisa vincular `this` ao `target` (instância crua), nunca ao `receiver` (o próprio Proxy), para não reabrir recursão no trap; (2) o `engines` atual (`>=16.20.1`) já está desalinhado com a própria dependência `mongodb@7.0.0`, que **exige `node >=20.19.0`** — confirmado via `npm view mongodb engines` — então D-01 corrige um bug pré-existente, não é só um upgrade oportunista.

A dependência `json-schema` já é, na prática, **type-only** no código atual (`import { JSONSchema4 } from 'json-schema'` usado apenas em posição de tipo em `src/types/model.ts:55`) — um compilador moderno já elide esse import do JS emitido. O trabalho real de QUAL-04 é (a) tirar o pacote de `dependencies` e (b) garantir que o `.d.ts` publicado não force consumidores TS a instalar `json-schema` só para resolver o tipo — o que depende de como o bundler escolhido trata tipos de "external" vs "bundled" (ver seção Don't Hand-Roll).

Entre tsup e tsdown, a pesquisa recomenda **tsdown**: é o sucessor oficial declarado do tsup (mesmo autor/equipe do Rolldown/Vite), ESM-first (evita as extensões de arquivo ausentes que tsup às vezes exige plugin para corrigir), e already tem ~2.5M downloads semanais com lançamentos ativos — vs tsup que está em modo manutenção (mesmo assim com 6.2M downloads semanais e zero risco de descontinuação abrupta, incluído como fallback documentado).

**Primary recommendation:** Corrigir os 5 bugs dentro da arquitetura Proxy/registry existente (sem redesenho), migrar build para `tsdown` com exports map dual (types primeiro em cada condition), mover `json-schema` para devDependencies com validação via `are-the-types-wrong`, e usar vitest + `@testcontainers/mongodb` (Docker real) para a suíte mínima desta fase.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Fix de hooks não aguardados (`insertMany`) | Model layer (`src/model/index.ts`) | — | Bug já isolado dentro do método; não toca Database/Proxy |
| Fix de binding do Proxy | Database layer (`src/database/index.ts`) — `KModelProxyHandler` | Model layer (métodos que leem `this.xxx`) | O guard de autorização vive no Database; o efeito colateral (binding) afeta todo método do Model |
| Fix de tipo do `find()` | Model layer | Types layer (`src/types/model.ts` se algum tipo genérico mudar) | Assinatura pública do método |
| Fix de race do registry + config divergente | Database layer (`Database[KModelMap]`, `registerModel`) | Model layer (constructor chama `getModel`) | O registry estático é propriedade do Database; o Model só consome |
| Remoção do fallback de dbName de teste | Database layer (`kGetDbName`) | — | Lógica de conexão, isolada |
| Clonagem de schema (`includeAdditionalPropertiesFalse`) | Model layer | — | Método privado do Model, sem dependência externa |
| Build dual CJS/ESM | Build tooling (fora do runtime da lib) | package.json (`exports`/`files`) | Não é código de aplicação; é config de empacotamento |
| Remoção de `json-schema` do runtime | Types layer (`src/types/model.ts`) | package.json (`dependencies`→`devDependencies`) | Import type-only já isolado num único arquivo |
| `MongoatError` base class | Novo módulo (`src/errors/` sugerido) | Database + Model layers (lançam os novos erros) | Classe transversal, sem dono único — mas os *sites* de lançamento ficam nas camadas existentes |
| Testes (vitest + testcontainers) | Test tooling (`test/`) | Database layer (setup/teardown de conexão) | Infra de teste consome a API pública; não é runtime da lib |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `tsdown` | `0.22.3` [ASSUMED — descoberto via WebSearch/training; ver Package Legitimacy Audit] | Bundler dual CJS/ESM para libs | Sucessor oficial do tsup (mesma equipe Rolldown/Vite), ESM-first, gera `.d.ts`/`.d.mts` via `rolldown-plugin-dts` |
| `vitest` | `4.1.10` [ASSUMED] | Test runner | Substitui `ts-jest` (morto, zero testes hoje); 5-10x mais rápido, ESM nativo, já decidido em CONTEXT D-12 |
| `@testcontainers/mongodb` | `12.0.4` [ASSUMED] | Módulo oficial testcontainers para subir Mongo real em Docker | Decisão de projeto (D-13): Docker real substitui `mongodb-memory-server` como padrão |
| `testcontainers` | `12.0.4` [ASSUMED] | Core do testcontainers-node (peer do módulo mongodb acima) | Necessário como peer dependency do módulo `@testcontainers/mongodb` |
| `@arethetypeswrong/cli` | `0.18.4` [ASSUMED] | Valida resolução de tipos do `exports` map dual contra o tarball publicado | Gate padrão de indústria para dual-package hazard (D-14) |
| `publint` | `0.3.21` [VERIFIED: npm registry — legitimacy check OK] | Valida shape do `package.json` publicado (main/module/exports/files) | Complementa attw; catches erros de shape que attw não cobre |
| `tsx` | `4.23.0` [ASSUMED] | Executa `examples/*.ts` diretamente (smoke manual, D-16) | Substitui `ts-node-dev`; resolve TS on-the-fly sem step de build |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `vite-tsconfig-paths` | `6.1.1` [ASSUMED] | Plugin do Vitest para resolver `@/*`, `@utils/*`, `@types/*`, `@test/*` a partir do `tsconfig.json` | Vitest não lê `paths` do tsconfig nativamente — precisa deste plugin (ou `resolve.alias` manual em `vitest.config.ts`) |
| `@vitest/coverage-v8` | `5.0.1` [ASSUMED, SUS — ver audit] | Cobertura de testes via V8 | Opcional na Fase 1 (a suíte completa é Fase 3), mas barato de já configurar |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| tsdown | tsup 8.5.1 [VERIFIED: npm registry OK] | tsup está em manutenção (não descontinuado); maior base de usuários e mais exemplos de troubleshooting no ecossistema. Migração tsup→tsdown é documentada como "trocar o import no config" — baixo custo de trocar depois se tsdown apresentar problema com os path aliases do projeto |
| `@testcontainers/mongodb` (Docker) | `mongodb-memory-server` | Mais rápido para iterar localmente (sem Docker), mas baixa binário do Mongo real na primeira execução (frágil em CI sem cache) — D-13 já decidiu Docker como padrão do projeto |
| Vendorizar tipo `JSONSchema4` manualmente | Deixar `json-schema` como devDependency e confiar no bundling de tipos do tsdown | Vendorizar é mais robusto (zero risco de regressão de bundler) mas duplica ~20 linhas de tipo; devDependency é mais simples mas depende do resolver de tipos do tsdown funcionar sem configuração extra (ver Don't Hand-Roll) |

**Installation:**
```bash
npm install --save-dev tsdown vitest @testcontainers/mongodb testcontainers @arethetypeswrong/cli publint tsx vite-tsconfig-paths @vitest/coverage-v8
npm uninstall ts-jest ts-node-dev tsc-alias tsconfig-paths typescript-cached-transpile
npm install json-schema --save-dev   # move de dependencies para devDependencies (ou remover totalmente — ver Don't Hand-Roll)
```

**Version verification:** Todas as versões acima foram obtidas via `npm view <pkg> version` nesta sessão (2026-07-07) contra o registry público — mas como as versões/nomes dos pacotes de build tooling (tsdown, vitest, testcontainers) vieram de conhecimento de treinamento + WebSearch antes da checagem de registry, ficam tagueadas `[ASSUMED]` por política de proveniência (existência no registry não confere `[VERIFIED]` sozinha). `publint` e `tsup` foram cross-checados e retornaram `OK` no gate de legitimidade — tageados `[VERIFIED: npm registry]`.

## Package Legitimacy Audit

| Package | Registry | Age (latest publish) | Downloads/wk | Source Repo | Verdict | Disposition |
|---------|----------|----------------------|--------------|--------------|---------|-------------|
| `tsdown` | npm | publicado 2026-06-16 | 2.55M | github.com/rolldown/tsdown | SUS ("too-new" — só o release mais recente é recente; pacote e mantenedor estabelecidos) | Mantido — ver nota abaixo |
| `vitest` | npm | publicado 2026-07-06 | 67.96M | github.com/vitest-dev/vitest | SUS ("too-new") | Mantido — ver nota abaixo |
| `@testcontainers/mongodb` | npm | publicado 2026-06-29 | 170K | github.com/testcontainers/testcontainers-node | SUS ("too-new") | Mantido — ver nota abaixo |
| `testcontainers` | npm | publicado 2026-06-29 | 4.40M | github.com/testcontainers/testcontainers-node | SUS ("too-new") | Mantido — ver nota abaixo |
| `@arethetypeswrong/cli` | npm | publicado 2026-06-22 | 359K | github.com/arethetypeswrong/arethetypeswrong.github.io | SUS ("too-new") | Mantido — ver nota abaixo |
| `tsx` | npm | publicado 2026-07-03 | 68.67M | github.com/privatenumber/tsx | SUS ("too-new") | Mantido — ver nota abaixo |
| `@vitest/coverage-v8` | npm | publicado 2026-07-06 | 25.81M | github.com/vitest-dev/vitest | SUS ("too-new") | Mantido — ver nota abaixo |
| `publint` | npm | publicado 2026-05-13 | 706K | github.com/publint/publint | OK | Aprovado |
| `tsup` (alternativa) | npm | publicado 2025-11-12 | 6.20M | github.com/egoist/tsup | OK | Aprovado (fallback) |
| `vite-tsconfig-paths` | npm | publicado 2026-02-11 | 28.07M | github.com/aleclarson/vite-tsconfig-paths | OK | Aprovado |

**Nota sobre os veredictos SUS:** todos os 6 pacotes acima marcados SUS foram sinalizados exclusivamente pelo heurístico "too-new", que mede a data de publicação da **versão mais recente**, não a idade do pacote. Todos têm dezenas de milhões (ou centenas de milhares, no caso de módulos mais nichados como `@testcontainers/mongodb`) de downloads semanais e repositórios oficiais conhecidos (vitest-dev, rolldown, testcontainers, privatenumber/tsx, arethetypeswrong) — o padrão é releases frequentes de projetos ativamente mantidos, não pacotes hallucinados ou slopsquatted. Ainda assim, seguindo o protocolo, cada um deve ser tratado como `[ASSUMED]` até verificação e o planner **deve inserir `checkpoint:human-verify` antes da primeira instalação** destes pacotes (double-check do nome exato e da versão pinada no momento da execução, já que builds de ferramentas evoluem rápido).

**Packages removed due to [SLOP] verdict:** nenhum.
**Packages flagged as suspicious [SUS]:** `tsdown`, `vitest`, `@testcontainers/mongodb`, `testcontainers`, `@arethetypeswrong/cli`, `tsx`, `@vitest/coverage-v8` — todos com alta legitimidade aparente (ver nota acima), mas o planner deve gatear a instalação de cada um atrás de `checkpoint:human-verify`.

## Architecture Patterns

### System Architecture Diagram

```text
┌─────────────────────────────────────────────────────────────────┐
│ Application Code                                                 │
│  new Database(config) → new Model(props) → db.connect()          │
│  → db.setupCollections() → model.insert()/find()/...             │
└───────────────────────────┬───────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│ Model constructor (src/model/index.ts)                           │
│  1. Model[kDatabase] existe? senão throw MongoatError (D-10)      │
│  2. getModel(collectionName) — check atômico (D-06)                │
│     ├─ existe E config igual  → retorna instância existente        │
│     ├─ existe E config diverge → throw MongoatError (D-06)         │
│     └─ não existe → constrói: schemaValidatorBuilder()             │
│         (clona schema via structuredClone antes de mutar — fix)    │
│  3. Model[kDatabase].registerModel(this)                           │
└───────────────────────────┬───────────────────────────────────────┘
                            │ registerModel()
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│ Database registry (src/database/index.ts)                        │
│  Database[KModelMap]: Map<string, Proxy<Model>>                   │
│  registerModel(model) → new Proxy(model, KModelProxyHandler())    │
│    KModelProxyHandler.get(target, prop, receiver):                │
│      not in allowedMethods? → throw                               │
│      value = Reflect.get(target, prop, receiver)                  │
│      typeof value === 'function'                                  │
│        → return value.bind(target)   ◄── FIX: bind a target,      │
│                                            nunca a receiver         │
│      → return value                                                │
└───────────────────────────┬───────────────────────────────────────┘
                            │ toda chamada de método público
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│ Model CRUD methods (bound ao target real)                        │
│  insert()      → await preHook(_document) → collection.insertOne  │
│  insertMany()  → await Promise.all(docs.map(preHook)) ◄── FIX     │
│                   (troca forEach+async por Promise.all)            │
│  find()        → return collection.findOne(...)  ◄── FIX          │
│                   (tipo: Promise<WithId<T>|null>, sem `| null`      │
│                    externo nem `?? null` morto)                    │
└───────────────────────────┬───────────────────────────────────────┘
                            │ getCollection()
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│ MongoDB Driver v7 (mongodb + bson)                                │
└─────────────────────────────────────────────────────────────────┘

Build pipeline (fora do runtime):
src/**/*.ts ──tsdown──▶ lib/index.mjs + lib/index.d.mts   (ESM, types first)
                    └──▶ lib/index.cjs + lib/index.d.cts   (CJS, types first)
                    resolve @/* @utils/* @types/* nativamente (sem tsc-alias)
```

### Recommended Project Structure
```
src/
├── database/         # inalterado — Database class, registry, Proxy handler
├── model/            # inalterado — Model class, CRUD, hooks
├── errors/           # NOVO — MongoatError (base class com `cause`)
│   └── index.ts
├── types/            # inalterado (json-schema type-only import isolado aqui)
└── utils/            # inalterado

test/                 # NOVO — vitest specs
├── setup/
│   └── testcontainer.ts   # helper: sobe Mongo via @testcontainers/mongodb, expõe URI
├── model/
│   ├── insertMany-hooks.test.ts   # regressão do bug 1
│   ├── proxy-binding.test.ts      # regressão do bug 2
│   ├── find-typing.test.ts        # regressão do bug 3
│   └── crud-happy-path.test.ts    # happy-path por método público (D-12)
└── database/
    ├── registry-race.test.ts      # regressão do bug 4 (config divergente + concorrência)
    └── connection-required.test.ts # regressão de D-10

vitest.config.ts       # NOVO — plugin vite-tsconfig-paths, testcontainer global setup
tsdown.config.ts       # NOVO — entry, dts, exports multi-formato
```

### Pattern 1: Fix do Proxy binding (bind ao `target`, não ao `receiver`)
**What:** o `get` trap do Proxy deve retornar o método vinculado à instância crua (`target`), nunca ao próprio Proxy (`receiver`).
**When to use:** sempre que o trap intercepta acesso a um método de instância que internamente lê `this.propriedade`.
**Why `target` e não `receiver`:** vincular a `receiver` (o Proxy) faria qualquer acesso interno a `this.xxx` dentro do método reentrar no trap do Proxy — desnecessário e arriscado (podendo mascarar o guard de `allowedMethods` em chamadas internas). Vincular a `target` dá acesso direto ao estado real sem re-trigger do Proxy.
**Example:**
```typescript
// src/database/index.ts — KModelProxyHandler (fix)
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

### Pattern 2: Fix do hook chain em `insertMany` (Promise.all em vez de forEach)
**What:** trocar `documents.forEach(async doc => { await ... })` por `await Promise.all(documents.map(doc => ...))`.
**When to use:** qualquer loop que dispara efeitos assíncronos por item e precisa que TODOS completem antes de prosseguir.
**Example:**
```typescript
// src/model/index.ts — insertMany (fix)
async insertMany(
  documents: OptionalUnlessRequiredId<ModelType>[],
  options: BulkWriteOptions = {}
) {
  await Promise.all(
    documents.map((doc) =>
      this.preMethod[METHODS.INSERT_MANY].bind(doc)(options)
    )
  );

  const _documents = documents.map((doc) => ({
    ...this.documentDefaults,
    ...doc,
  }));

  // ... resto do método inalterado (mutação de `doc` via hook é preservada,
  // pois _documents.map roda DEPOIS do Promise.all acima)
}
```
**Nota de contrato:** os hooks atuais mutam `this` in-place (`bind(doc)` seta `this = doc`, e o transformer é esperado mutar campos de `doc` diretamente) — não retornam valor. A correção preserva esse contrato; não o redesenha (isso é escopo de HOOK-01..05 na Fase 2).

### Pattern 3: Fix do `find()` (tipo de retorno consistente)
**What:** remover o `| null` externo e o `?? null` morto — `collection.findOne()` sempre retorna uma Promise.
**Example:**
```typescript
// src/model/index.ts — find (fix)
find(
  filter: Filter<ModelType> = {},
  options?: FindOptions
): Promise<WithId<ModelType> | null> {
  const collection = Model[kDatabase]?.getCollection<ModelType>(
    this.collectionName
  ) as Collection<ModelType>;

  return collection.findOne(filter, options);
}
```

### Pattern 4: Clonagem de schema antes de mutar (`structuredClone`)
**What:** `includeAdditionalPropertiesFalse()` muta o objeto `schema` recebido; se o mesmo objeto de schema for reusado entre models (comum em testes ou em schemas compartilhados), a mutação vaza.
**Why `structuredClone`:** disponível globalmente desde Node 17 (sem import), faz deep clone estrutural correto para objetos JSON-Schema (plain objects/arrays/strings/booleans/null — não há funções ou tipos não-clonáveis em `ModelValidationSchema`).
**Example:**
```typescript
// src/model/index.ts — schemaValidatorBuilder (fix)
private schemaValidatorBuilder({
  schema,
  validationQueryExpressions = {},
}: { schema: ModelValidationSchema; validationQueryExpressions?: ValidationQueryExpressions }): ModelDbValidationProps {
  const clonedSchema = structuredClone(schema);

  return {
    validationAction: 'error',
    validationLevel: 'strict',
    validator: {
      $jsonSchema: {
        additionalProperties: false,
        bsonType: 'object',
        properties: {
          _id: { bsonType: 'objectId', description: 'Id of the document in the database' },
          ...this.includeAdditionalPropertiesFalse(clonedSchema).properties,
        },
        required: [...((clonedSchema.required as string[]) ?? []), '_id'],
      },
      ...validationQueryExpressions,
    },
  };
}
```

### Pattern 5: Registry atômico com detecção de config divergente (D-06)
**What:** o check-then-act atual (`if (!!model) return model`) é sincronamente atômico HOJE (não há `await` entre o check e o `registerModel()` no fim do constructor — confirmado lendo o código completo) — a "race" descrita em CONCERNS.md/PITFALLS.md pressupõe um `await` que **não existe** no código atual. O trabalho real de D-06 não é "adicionar um lock" (não há nada para travar em código 100% síncrono), é: (1) blindar contra regressão futura (não deixar nenhum `await` entrar entre check e set), e (2) comparar a config da segunda chamada com a registrada e lançar erro claro se divergir — isso hoje simplesmente não existe (a segunda chamada é ignorada silenciosamente).
**Example:**
```typescript
// src/model/index.ts — constructor (fix conceitual)
const existing = Model[kDatabase].getModel(props.collectionName);

if (existing) {
  const unwrapped = existing as unknown as Model<ModelType>;
  if (!isSameConfig(unwrapped, props)) {
    throw new MongoatError(
      `Model "${props.collectionName}" already registered with a different configuration`
    );
  }
  return existing;
}
// ... construção normal, sem nenhum await antes do registerModel() final
```
**Design de `isSameConfig`:** comparação estrutural rasa dos campos que definem identidade do model (`schema` via `JSON.stringify` ou deep-equal leve, `allowedMethods`, `validity`) — não precisa de lib externa (ver Don't Hand-Roll: comparação estrutural simples não justifica `fast-deep-equal`/`lodash.isequal` como dependência nova).

### Anti-Patterns to Avoid
- **Vincular o Proxy `bind()` ao `receiver`:** reabre recursão desnecessária no trap e pode mascarar o guard de `allowedMethods`. Sempre `value.bind(target)`.
- **Adicionar lock assíncrono (mutex/semaphore) para "resolver" a race do registry:** não há race real em código síncrono single-threaded sem `await` entre check e set — um lock aqui é complexidade sem benefício. Focar em (a) nunca introduzir `await` nesse trecho e (b) checar divergência de config.
- **Deixar `Database.defineModel()` (deprecated) dar double-wrap no Proxy:** hoje `defineModel()` chama `Model.create()` → `new Model()` (que já registra e envolve em Proxy dentro do constructor) e DEPOIS envolve o resultado em um SEGUNDO Proxy (`src/database/index.ts:207`) — isso é uma proxy-dentro-de-proxy latente. Não é um dos 5 bugs listados em QUAL-01, mas foi descoberto nesta pesquisa; recomenda-se documentar como known-issue do método deprecated ou corrigir com baixo custo (usar `Model[kDatabase].getModel()` em vez de `Model.create()` dentro de `defineModel`) — decisão de escopo cabe ao planning.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Deep clone de schema JSON | Função recursiva de clone customizada | `structuredClone()` nativo (Node ≥17) | Zero dependência, disponível no floor Node 20.19, já cobre o shape de `ModelValidationSchema` |
| Validação de dual-package exports | Script manual de "tentar importar de dois jeitos" | `@arethetypeswrong/cli` + `publint` contra o tarball do `npm pack` | Ferramentas padrão de indústria; cobrem casos de borda (ordem de `types` na condition, `.d.mts` vs `.d.cts`) que um script manual não detecta |
| Subir MongoDB para testes | Baixar/gerenciar binário do `mongod` manualmente | `@testcontainers/mongodb` | Já lida com lifecycle do container, portas, cleanup; decisão de projeto D-13 |
| Comparação de config de model para detectar divergência | `lodash.isequal` / `fast-deep-equal` como nova dependência | Comparação estrutural leve escrita à mão (poucos campos: schema serializado, allowedMethods, validity) | Superfície pequena e conhecida — trazer uma lib de deep-equal genérica para comparar ~4 campos viola a constraint de "mínimo de dependências de runtime" |
| Resolver path aliases (`@/*`) no build | Manter `tsc-alias` pós-processando o output do `tsc` | `tsdown` (resolve aliases nativamente durante o bundle, via config do tsconfig `paths`) | É exatamente o motivo da migração (D-04); manter `tsc-alias` junto do bundler é redundante |

**Key insight:** todos os "problemas" desta fase já têm solução estabelecida (nativa da plataforma ou ferramenta de mercado); o único código genuinamente novo é a comparação de config do registry (pequena, sem justificar dependência) e a classe `MongoatError` (trivial, extends Error).

## Common Pitfalls

### Pitfall 1: `engines` do package.json já mentia antes desta fase
**What goes wrong:** o `package.json` atual declara `"engines": { "node": ">=16.20.1" }`, mas a dependência já instalada `mongodb@7.0.0` (via `npm view mongodb engines`) exige `node >=20.19.0`. Qualquer consumidor em Node 16-20.18 já falhava silenciosamente ou com erro obscuro do driver, não por causa do Mongoat.
**Why it happens:** o `engines` nunca foi atualizado quando o driver v7 foi adotado.
**How to avoid:** D-01 já resolve isso — só é importante o planner saber que esta não é uma decisão "proativa", é a correção de um bug de metadata já existente.
**Warning signs:** `npm install` em Node <20.19 hoje já pode emitir warning do próprio `mongodb` sobre engine incompatível (dependendo da config de `engine-strict`).

### Pitfall 2: `json-schema` como devDependency pode ainda vazar para o `.d.ts` publicado
**What goes wrong:** mover `json-schema` de `dependencies` para `devDependencies` não garante, por si só, que o `.d.ts` final não contenha `import { JSONSchema4 } from 'json-schema'` como import externo — se o bundler tratar o pacote como "external" para fins de tipos (não bundlar), consumidores TS precisarão ter `json-schema` instalado (mesmo que só como dev dependency deles) só para o `tsc` deles resolver o tipo.
**Why it happens:** tsdown (via `rolldown-plugin-dts`) por padrão trata `dependencies` como external e bundla `devDependencies` — mas há relatos de casos onde tipos complexos de terceiros não são resolvidos corretamente pelo resolver padrão (oxc) e precisam de `resolver: 'tsc'` como fallback.
**How to avoid:** depois de mover para devDependencies, rodar `@arethetypeswrong/cli` contra o tarball — se ele acusar `json-schema` como resolução quebrada ou ausente, a alternativa mais robusta é vendorizar as ~10-15 linhas do subset de `JSONSchema4` realmente usado (`bsonType`, `properties`, `items`, `required`, `description`, `pattern`, `enum`, etc.) diretamente em `src/types/model.ts`, eliminando o import por completo.
**Warning signs:** `attw` reporta `NoResolution` ou erro de tipo faltante na condition `types` do subpath principal.

### Pitfall 3: Dupla instância de Proxy via `Database.defineModel()` (deprecated)
**What goes wrong:** o método deprecated `defineModel()` envolve o model resultante em um Proxy adicional além do que o constructor do `Model` já cria internamente (ver Anti-Patterns acima). Isso é preexistente e não está na lista de 5 bugs de QUAL-01, mas qualquer fix no `KModelProxyHandler` (Pattern 1) deve ser testado também através do caminho deprecated para confirmar que o binding duplo não quebra silenciosamente.
**How to avoid:** incluir um teste de regressão que exercite `defineModel()` (não só o constructor direto) contra o fix do Proxy binding.
**Warning signs:** um teste que só cobre `new Model()` diretamente pode passar enquanto `defineModel()` continua quebrado.

### Pitfall 4: `useUnknownInCatchVariables: false` mascarado como decisão desta fase
**What goes wrong:** o TODO em `tsconfig.json:38-39` sugere habilitar `useUnknownInCatchVariables`, mas isso tocaria os catch blocks de `insert`/`insertMany`/`bulkWrite` que usam `JSON.stringify(err, null, 2)` — que é explicitamente **fora de escopo** desta fase (D-11: o re-wrap de `MongoError` só muda na Fase 3/SEC-04).
**How to avoid:** não habilitar essa flag nesta fase, mesmo que pareça uma "correção de bug" barata — abrir essa flag sem também corrigir os catch blocks (Fase 3) quebraria a build (TS erro em `err: any` implícito nos blocos existentes) ou exigiria tocar código fora do escopo de QUAL-01.
**Warning signs:** build quebra com erros de tipo em `catch (err)` depois de habilitar a flag sem tocar os 3 catch blocks afetados.

### Pitfall 5: Vitest não resolve os path aliases do tsconfig por padrão
**What goes wrong:** `test/**/*.test.ts` importando `@/database`, `@/model` etc. falha com "Cannot find module" se o `vitest.config.ts` não configurar resolução de alias.
**Why it happens:** Vitest (via Vite) usa seu próprio resolver, que não lê `tsconfig.json` `paths` automaticamente.
**How to avoid:** adicionar o plugin `vite-tsconfig-paths` em `vitest.config.ts`, ou espelhar manualmente os aliases em `resolve.alias`.
**Warning signs:** todos os testes falham na fase de import/setup, não na asserção.

## Runtime State Inventory

> Fase não é rename/refactor/migration — é correção de bugs + build tooling. Seção omitida.

## Code Examples

### Exports map dual CJS/ESM (types primeiro em cada condition)
```json
// Source: padrão consolidado por publint/arethetypeswrong (types deve ser a primeira key
// dentro de cada condition `import`/`require`, senão TypeScript não resolve corretamente
// sob moduleResolution "Node16"/"Bundler")
{
  "type": "commonjs",
  "files": ["lib"],
  "main": "./lib/index.cjs",
  "module": "./lib/index.mjs",
  "types": "./lib/index.d.cts",
  "exports": {
    ".": {
      "import": {
        "types": "./lib/index.d.mts",
        "default": "./lib/index.mjs"
      },
      "require": {
        "types": "./lib/index.d.cts",
        "default": "./lib/index.cjs"
      }
    }
  },
  "engines": {
    "node": "^20.19.0 || >=22.12.0"
  }
}
```
**Nota:** manter `"type": "commonjs"` (ou omitir o campo, que já default para commonjs) no root — PITFALLS.md do research do projeto já documenta que usar `"type": "module"` num pacote dual-publish é um anti-padrão; a saída ESM usa extensão `.mjs` explícita em vez de depender do campo `type`.

### Script `check:package` (D-14)
```json
// package.json scripts
{
  "scripts": {
    "build": "tsdown",
    "check:package": "npm pack --dry-run && npx publint && npx @arethetypeswrong/cli --pack ."
  }
}
```

### `MongoatError` base class (D-11)
```typescript
// src/errors/index.ts (novo módulo)
export class MongoatError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'MongoatError';
    Object.setPrototypeOf(this, MongoatError.prototype);
  }
}
```
**Nota:** `Error` com segundo argumento `{ cause }` é suportado nativamente desde Node 16.9 — não precisa de polyfill no floor Node 20.19.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| `tsc` + `tsc-alias` para path aliases | Bundler de lib (tsdown/tsup) resolve aliases nativamente | Consolidado ~2024-2026 no ecossistema de libs TS | Remove 2 devDependencies (`tsc-alias`, `tsconfig-paths`), um passo do build |
| `ts-jest` + Jest | `vitest` | Vitest é o padrão de facto para libs TS novas desde ~2023 | Zero config de transform, testes mais rápidos, ESM nativo |
| `mongodb-memory-server` (binário baixado) | `testcontainers` com Docker real | Preferência crescente por "real服务" em vez de binários emulados, mais fidelidade a produção | Decisão de projeto (D-13), requer Docker no ambiente de dev/CI |
| `main`/`types` sem `exports` map | `exports` map obrigatório para libs modernas | Node.js 12+ já suporta `exports`; TypeScript 4.7+ (`moduleResolution: Node16`) passou a exigir isso para resolver tipos corretamente | Sem isso, consumidores ESM ou com `moduleResolution` moderno quebram |

**Deprecated/outdated:**
- `ts-node-dev`: sem manutenção ativa comparado a `tsx`; substituído para rodar `examples/*.ts` (D-16).
- `experimentalDecorators` + `reflect-metadata`: não é usado hoje no Mongoat e não deve ser introduzido (relevante para Fase 6, mencionado aqui só para não confundir com o floor de TS desta fase).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Versões exatas de `tsdown` (0.22.3), `vitest` (4.1.10), `@testcontainers/mongodb`/`testcontainers` (12.0.4), `@arethetypeswrong/cli` (0.18.4), `tsx` (4.23.0), `vite-tsconfig-paths` (6.1.1), `@vitest/coverage-v8` (5.0.1) | Standard Stack | Baixo — todas confirmadas existentes no registry nesta sessão; risco é apenas de a versão ter avançado entre pesquisa e execução do plano (mitigado por `npm install <pkg>@latest` no momento da task e checagem de legitimidade antes de instalar) |
| A2 | `tsdown` bundla (inline) os tipos de dependências movidas para `devDependencies` por padrão, resolvendo o vazamento de `json-schema` para o `.d.ts` publicado | Don't Hand-Roll / Pitfall 2 | Médio — se o comportamento não for esse (ou exigir config extra `resolver: 'tsc'`), o planner precisa do fallback documentado (vendorizar o tipo manualmente) |
| A3 | `tsx` resolve os path aliases do `tsconfig.json` (`@/*` etc.) nativamente ao executar `examples/*.ts`, sem precisar de `tsconfig-paths` | Standard Stack / D-16 | Baixo-Médio — se não resolver nativamente, é necessário manter um mecanismo equivalente (ex.: `tsx --tsconfig` ou plugin) só para os examples; não bloqueia o build da lib em si |
| A4 | Uma imagem Docker `mongo:7` (ou tag equivalente compatível com wire protocol do driver v7) é suficiente para os testes de regressão desta fase, mesmo que a versão mínima definitiva de MongoDB Server seja decidida só na Fase 3 | Environment Availability / Validation Architecture | Baixo — driver v7.3 suporta server 4.4+ e prepara para 9.0; qualquer tag `mongo:7.x` ou `mongo:8` recente funciona para os testes de regressão dos 5 bugs, que não dependem de features específicas de versão do servidor |

**Se esta tabela não estivesse vazia:** ela não está — 4 assumptions, nenhuma bloqueante para o planning, mas A2 e A3 merecem uma checagem rápida (spike de 10 minutos) logo no início da execução, antes de comprometer toda a config de build/examples a elas.

## Open Questions

1. **`tsdown` realmente resolve os path aliases (`@/*`, `@utils/*`, `@types/*`) do `tsconfig.json` sem config manual de `alias` no `tsdown.config.ts`?**
   - What we know: tsdown documenta resolução de dependências consistente com o output JS (bundla ou externaliza conforme regras padrão), mas a doc pública consultada nesta sessão não detalhou explicitamente o comportamento de `paths`/`baseUrl` do tsconfig.
   - What's unclear: se é automático ou exige `alias: { '@': './src' }` explícito no config do tsdown.
   - Recommendation: task de Wave 0 deve incluir um smoke test mínimo (`import { Database } from '@/database'` compilando com sucesso) antes de prosseguir com o restante da migração de build.

2. **O `.d.ts` publicado, depois de mover `json-schema` para devDependency, passa limpo no `@arethetypeswrong/cli`?**
   - What we know: comportamento padrão documentado é bundlar tipos de devDependencies, mas há issues conhecidas de resolução com pacotes de tipo complexos.
   - What's unclear: se `JSONSchema4` (interface relativamente simples) cai nesse caso de borda.
   - Recommendation: rodar `attw` como parte da task que remove a dependência; se falhar, vendorizar o subset do tipo (fallback já documentado em Pitfall 2).

3. **`defineModel()` (deprecated) deve ganhar o fix do double-Proxy nesta fase, ou só ser documentado como known-issue?**
   - What we know: o bug de double-wrap existe hoje e não está nos 5 itens de QUAL-01.
   - What's unclear: se corrigir está dentro do "espírito" de QUAL-01 (bug de correção) ou é escopo extra.
   - Recommendation: planner decide; custo de corrigir é baixo (trocar `Model.create()` por checagem direta em `getModel()` dentro de `defineModel`) e reduz risco de o fix do Pattern 1 (Proxy binding) ser testado só pelo caminho não-deprecated.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Runtime, novo floor D-01 | ✓ | v22.22.2 (satisfaz `^20.19.0 \|\| >=22.12.0`) | — |
| Docker | Testcontainers (D-13) | ✓ | 29.6.1 | — |
| npm | Scripts de build/publish | ✓ | 10.9.7 | — |
| git | Versionamento | ✓ | 2.55.0 | — |

**Missing dependencies with no fallback:** nenhuma.
**Missing dependencies with fallback:** nenhuma — ambiente local já satisfaz todos os requisitos desta fase.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest `4.1.10` [ASSUMED] |
| Config file | `vitest.config.ts` (a criar — Wave 0) |
| Quick run command | `npx vitest run test/model` ou `test/database` (arquivo isolado) |
| Full suite command | `npx vitest run` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| QUAL-01 (hooks insertMany) | Documento inserido via `insertMany` reflete transformação do pre-hook | integration (testcontainers) | `npx vitest run test/model/insertMany-hooks.test.ts` | ❌ Wave 0 |
| QUAL-01 (Proxy binding) | Método chamado via Proxy preserva `this` e não vaza `receiver` | unit | `npx vitest run test/database/proxy-binding.test.ts` | ❌ Wave 0 |
| QUAL-01 (find typing) | `find()` retorna `Promise<WithId<T> \| null>` consistente (compile-time + runtime) | unit + typecheck | `npx vitest run test/model/find-typing.test.ts` + `tsc --noEmit` | ❌ Wave 0 |
| QUAL-01 (registry race/config) | Segunda chamada com config divergente lança erro; config igual retorna mesma instância | unit | `npx vitest run test/database/registry-race.test.ts` | ❌ Wave 0 |
| QUAL-01 (schema mutation) | Mesmo objeto de schema usado em dois models não é mutado entre si | unit | `npx vitest run test/model/schema-clone.test.ts` | ❌ Wave 0 |
| QUAL-04 (json-schema removido) | `npm ls json-schema` não aparece em `dependencies`; `attw`/`publint` passam | smoke (script) | `npm run check:package` | ❌ Wave 0 (script novo) |
| REL-02 (dual CJS/ESM) | Pacote instala/importa em projeto CJS (`require`) e ESM (`import`) | manual smoke (D-15) | scripts em dois mini-projetos temporários | ❌ Wave 0 |
| REL-02 (attw gate) | `are-the-types-wrong` roda limpo contra o tarball | smoke (script) | `npm run check:package` | ❌ Wave 0 |
| D-10 (erro pré-conexão) | Operação de model antes de `connect()` lança `MongoatError` tipado | unit | `npx vitest run test/database/connection-required.test.ts` | ❌ Wave 0 |
| D-12 (happy-path CRUD) | Cada método público (insert/find/update/delete/aggregate/bulkWrite/total) funciona contra Mongo real | integration (testcontainers) | `npx vitest run test/model/crud-happy-path.test.ts` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** rodar o arquivo de teste específico da task (`npx vitest run test/<arquivo>`)
- **Per wave merge:** `npx vitest run` (suíte completa desta fase)
- **Phase gate:** suíte completa verde + `npm run check:package` verde antes de `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `vitest.config.ts` — config base com plugin `vite-tsconfig-paths` e globalSetup do testcontainer
- [ ] `test/setup/testcontainer.ts` — helper que sobe `@testcontainers/mongodb`, expõe URI via env/global, encerra no teardown
- [ ] `package.json` scripts: `"test": "vitest run"`, `"test:watch": "vitest"`, `"check:package"` (attw+publint)
- [ ] Framework install: `npm install --save-dev vitest @testcontainers/mongodb testcontainers vite-tsconfig-paths @vitest/coverage-v8`
- [ ] Remover `ts-jest` de devDependencies (morto, sem script associado — confirmado em CONCERNS.md)

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-------------------|
| V2 Authentication | Não | Fora de escopo — sem auth de usuário final nesta fase |
| V3 Session Management | Não | Não aplicável a uma lib ODM |
| V4 Access Control | Parcial | O gate de `allowedMethods` via Proxy É um controle de acesso a nível de método — o fix de binding (Pattern 1) não deve enfraquecer esse guard; teste de regressão deve cobrir "método fora de `allowedMethods` continua lançando erro" |
| V5 Input Validation | Não (nesta fase) | Sanitização de filtros (`$where`, injeção de operador) é escopo de SEC-01/SEC-02 — Fase 3. Esta fase não deve introduzir nem remover validação de filtro |
| V6 Cryptography | Não | Sem manipulação de segredos/criptografia nesta fase |
| V7 Error Handling | Sim | `MongoatError` (D-11) — mensagens claras mas sem vazar detalhes internos desnecessários; **não** tocar o `JSON.stringify(err)` existente (isso é SEC-03, Fase 3) |

### Known Threat Patterns for {stack}

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Enfraquecimento acidental do guard de `allowedMethods` ao corrigir o binding do Proxy | Elevation of Privilege | Teste de regressão explícito: chamar um método NÃO listado em `allowedMethods` através do Proxy corrigido e assertar que ainda lança erro — antes e depois do fix de binding |
| Vazamento de config interna via mensagem de erro de "config divergente" (D-06) | Information Disclosure | `MongoatError` deve mencionar o nome da collection e que a config diverge, sem despejar o schema completo do usuário na mensagem (evitar `JSON.stringify` do schema inteiro no erro) |
| `structuredClone` falhando silenciosamente em schema com tipos não-cloneáveis (ex.: se um usuário incluir uma função customizada de validação no objeto de schema, fora do padrão JSON Schema) | Denial of Service (exceção não tratada) | `structuredClone` lança `DataCloneError` para valores não-cloneáveis — deixar propagar é aceitável aqui (schema malformado é erro de configuração do dev, não de usuário final), mas documentar a limitação |

## Sources

### Primary (HIGH confidence)
- `.planning/codebase/CONCERNS.md` — bugs locais confirmados por leitura direta do código (2026-07-03)
- `.planning/codebase/ARCHITECTURE.md` — anti-patterns já documentados com trechos de código (2026-07-03)
- `.planning/research/SUMMARY.md`, `.planning/research/PITFALLS.md` — síntese de pesquisa do ecossistema (2026-07-03)
- Leitura direta de `src/model/index.ts`, `src/database/index.ts`, `src/types/model.ts`, `package.json`, `tsconfig.json` nesta sessão (2026-07-07)
- `npm view mongodb engines` — confirma `node >=20.19.0` como requisito real da dependência já instalada (2026-07-07)
- Node.js v20.19.0 (LTS) release notes / Joyee Cheung blog sobre `require(esm)` unflag em 20.19.0 e 22.12.0 — https://nodejs.org/en/blog/release/v20.19.0 , https://joyeecheung.github.io/blog/2025/12/30/require-esm-in-node-js-from-experiment-to-stability/

### Secondary (MEDIUM confidence)
- tsdown docs (https://tsdown.dev/guide/, https://tsdown.dev/options/dts) — capacidades gerais de bundling dual e geração de `.d.ts`, mas sem detalhamento explícito de bundling de tipos externos por devDependency
- pkgpulse: tsup vs tsdown vs unbuild 2026 (https://www.pkgpulse.com/guides/tsup-vs-tsdown-vs-unbuild-typescript-library-bundling-2026)
- rolldown-plugin-dts issues (github.com/sxzz/rolldown-plugin-dts) — comportamento de inline de tipos externos e casos de borda com oxc resolver
- publint rules (https://publint.dev/rules), guia de exports (https://hirok.io/posts/package-json-exports) — ordem de `types` dentro das conditions
- gsd-tools `package-legitimacy check` — sinais de registry (downloads, idade, repo) para todos os pacotes recomendados

### Tertiary (LOW confidence)
- Claim sobre `tsx` resolver path aliases nativamente — não confirmado por fetch direto à documentação (falha de rede na sessão); tratado como assumption (A3) com verificação recomendada em Wave 0

## Metadata

**Confidence breakdown:**
- Standard stack (bugs/fixes em si): HIGH — código lido diretamente, bugs confirmados linha a linha
- Standard stack (ferramentas de build/test): MEDIUM — versões e comportamento de bundling de tipos parcialmente assumidos (ver Assumptions Log)
- Architecture: HIGH — padrão Proxy/registry já existente, fixes são cirúrgicos dentro dele
- Pitfalls: HIGH — todos cross-verificados contra o código real do repositório, não apenas fontes externas

**Research date:** 2026-07-07
**Valid until:** 2026-08-06 (30 dias — stack de build tooling muda rápido; revalidar versões antes de instalar se o planning for retomado depois desse prazo)
