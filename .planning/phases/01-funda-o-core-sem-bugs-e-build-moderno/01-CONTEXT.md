# Phase 1: Fundação — Core sem bugs e build moderno - Context

**Gathered:** 2026-07-06
**Status:** Ready for planning

<domain>
## Phase Boundary

A lib compila em formato dual CJS/ESM com `exports` map correto (validado por `are-the-types-wrong`) e não tem nenhum bug de correção conhecido — pre-hooks aguardados em todos os caminhos de inserção, binding de `this` correto no Proxy, `find()` com tipo consistente, registry de models sem race condition, setup de schema sem mutação de objetos compartilhados, e sem a dependência de runtime `json-schema`. Requisitos: QUAL-01, QUAL-04, REL-02.

</domain>

<decisions>
## Implementation Decisions

### Piso de Node.js e target do build
- **D-01:** `engines` sobe para **Node >= 20.19** já na Fase 1 (ex.: `"^20.19.0 || >=22.12.0"`) — destrava `structuredClone` e `require(esm)`; quebrar em alpha é barato.
- **D-02:** Target de compilação alinhado ao floor (ES2023) — detalhe fino a critério do Claude.

### Exports e formato do pacote
- **D-03:** Distribuição **dual CJS + ESM** com tipos separados (`.d.ts`/`.d.mts`) — leitura literal do REL-02; zero fricção para qualquer consumidor.
- **D-04:** Build por **bundler de lib** (tsup ou tsdown — pesquisa decide; tsdown é o sucessor do tsup, que está em manutenção). O bundler resolve os path aliases `@/*` e elimina `tsc-alias`/`tsconfig-paths` do build.
- **D-05:** npm publica **só `lib/`** — remover `src` e `tsconfig.json` do campo `files`.

### Semântica do registry de models
- **D-06:** `new Model()` para collection já registrada **retorna a instância existente, mas lança erro claro se a config da segunda chamada divergir** da registrada. O check-and-set vira atômico (fecha a race de `src/model/index.ts:76-80`).
- **D-07:** Setup de collections permanece **explícito e documentado** (registrar → `connect()` → `setupCollections()`); model registrado depois exige `setupCollection(model)` manual. Sem async implícito no constructor.
- **D-08:** **Remover o fallback de dbName de teste** embutido na lib (`mongoat-test` / `${PACKAGE}-test-…` em `src/database/index.ts:396-412`): sem `MONGODB_DB_NAME` e sem `config.dbName`, a conexão lança erro descritivo. Comportamento de teste sai do runtime da lib.
- **D-09:** Registry ganha **API mínima de limpeza/reset** (pode ser `@internal`) junto do fix de race — a suíte da Fase 3 não precisa reabrir o registry.
- **D-10:** Operação de model **antes de `connect()` lança erro claro e tipado** ("Database not connected — call db.connect() first") em vez do TypeError críptico do cast `as Collection`.
- **D-11:** Novos erros da Fase 1 (config divergente, dbName ausente, sem conexão) nascem numa **classe base própria `MongoatError`** (extends Error, com `cause` preservando o erro original). O re-wrap `MongoError(JSON.stringify(err))` dos erros do driver só muda na Fase 3 (SEC-04).

### Validação dos fixes (sem suíte completa até a Fase 3)
- **D-12:** **Testes com vitest já na Fase 1**: regressão de cada bug corrigido **+ happy-path CRUD básico por método público**. A suíte completa continua sendo da Fase 3. Remover `ts-jest` morto das devDependencies.
- **D-13:** Backend de teste: **Docker (testcontainers/compose)** com Mongo real. **Esta decisão vira o padrão do projeto e substitui `mongodb-memory-server`** também na Fase 3 (ajustar o critério do ROADMAP no planning da Fase 3; CI usará service container de Mongo).
- **D-14:** Script npm **`check:package`** rodando `are-the-types-wrong` + `publint` sobre o tarball do `npm pack` — mesma validação entra na CI da Fase 3.
- **D-15:** **Smoke de consumo**: dois mini-projetos temporários (CJS com `require`, ESM com `import`) instalam o tarball e executam um import básico — pega o que a análise estática não vê.
- **D-16:** `examples/` são **atualizados para o novo build** (tsx ou ts-node moderno) e executados uma vez como smoke manual.

### Claude's Discretion
- Target exato de compilação (alinhado ao floor Node 20.19; ES2023 como referência).
- Escolha entre tsup e tsdown (decidir na pesquisa).
- **Manter ou remover os subpath exports** (`./database`, `./model`, `./utils`, `./types`) — decidir no planning pelo custo de manutenção do exports map; o barrel raiz já re-exporta tudo.
- Design interno do fix de race e da API de reset do registry.
- Mecânica da clonagem de schema (ex.: `structuredClone`, disponível no novo floor) para `includeAdditionalPropertiesFalse` não mutar objetos do usuário.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Escopo e requisitos
- `.planning/ROADMAP.md` — goal, critérios de sucesso e dependências da Fase 1 (nota: critério da Fase 3 sobre mongodb-memory-server foi substituído por Docker — ver D-13)
- `.planning/REQUIREMENTS.md` — QUAL-01, QUAL-04, REL-02 (escopo da fase)

### Estado do código
- `.planning/codebase/CONCERNS.md` — inventário dos bugs conhecidos e áreas frágeis que esta fase corrige (insertMany hooks, binding, find typing, races, mutação de schema)
- `.planning/codebase/ARCHITECTURE.md` — arquitetura Proxy/registry que é constraint do autor (manter)
- `.planning/codebase/STACK.md` — build atual (tsc + tsc-alias) que será substituído

### Pesquisa
- `.planning/research/SUMMARY.md` — síntese da pesquisa do ecossistema que fundamentou o roadmap
- `.planning/research/PITFALLS.md` — armadilhas conhecidas (dual package hazard, etc.)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- Barrel `src/index.ts` re-exporta Database/Model/utils/types — base do entry único do novo build.
- Exports map atual do `package.json` (5 entries com `types`/`default`) — referência do que migrar para o formato dual.
- Aliases `@/*`, `@utils/*`, `@types/*`, `@test/*` no tsconfig — o bundler passa a resolvê-los no build.
- `examples/` — vira smoke manual da API pública após atualização.

### Established Patterns
- Símbolos com prefixo `k` para estado privado (`kClient`, `kDb`, `KModelMap`) — novos internals seguem o padrão.
- Gating de métodos via Proxy e registro de models na classe `Database` — **constraint do autor: manter a arquitetura**; os fixes atuam dentro dela.
- Enum `METHODS` (12 operações) indexa os pre-hooks (`preMethod[METHODS.X]`).

### Integration Points
- `src/model/index.ts:76-80` — check-then-act da duplicata de model (race + config ignorada) → D-06.
- `src/model/index.ts:303-305` — `forEach` async não aguardado no `insertMany` (bug QUAL-01).
- `src/database/index.ts:324` — binding do Proxy não aplicado (bug QUAL-01).
- `src/model/index.ts:325-331` — tipo inconsistente do `find()` (bug QUAL-01).
- `src/model/index.ts:161-179` — `includeAdditionalPropertiesFalse` muta schema compartilhado.
- `src/database/index.ts:95-110` e `396-412` — `connect()` não faz setup; fallback de dbName de teste a remover → D-07/D-08.
- `package.json` — engines, files, exports, scripts de build; dependência `json-schema` a remover (QUAL-04).

</code_context>

<specifics>
## Specific Ideas

- Princípio reafirmado pelo usuário: **"quebrar em alpha é barato"** — mudanças breaking (engines, dbName, files) entram já na Fase 1, não na v1.0.
- Descoberta da discussão promovida a bug da fase: o fallback silencioso para banco `mongoat-test` em produção (D-08) — o usuário quer falha explícita, não default mágico.
- Docker como backend de teste é decisão de projeto (não só da fase): o usuário prefere Mongo real em container a binários baixados pelo memory-server.

</specifics>

<deferred>
## Deferred Ideas

- **Ajuste do critério da Fase 3 no ROADMAP** (trocar "mongodb-memory-server" por Docker/testcontainers) — aplicar no planning da Fase 3, decorrência de D-13.
- Hierarquia completa de erros e sanitização de mensagens do driver — Fase 3 (SEC-04); a Fase 1 só introduz a base `MongoatError` para os erros novos.

</deferred>

---

*Phase: 1-Fundação — Core sem bugs e build moderno*
*Context gathered: 2026-07-06*
