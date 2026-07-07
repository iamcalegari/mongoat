# Phase 2: Sistema de hooks completo e API thin nativa - Context

**Gathered:** 2026-07-07
**Status:** Ready for planning

<domain>
## Phase Boundary

O dev ganha um pipeline **pre/post de hooks completo** e **controle total do driver nativo**. Concretamente: registrar múltiplos handlers `pre` e `post` por método CRUD (execução em ordem de registro, aguardada sequencialmente); erro em pre-hook aborta antes do driver, erro em post-hook propaga por padrão exceto `fireAndForget`; guard contra recursão infinita; todo método do Model aceita e repassa options nativas com os tipos do driver e retorna resultados precisamente tipados; escape hatch para `Collection`/`Db`/`MongoClient` nativos. Requisitos: HOOK-01..HOOK-05, API-01..API-04. Constraint do autor (mantida): arquitetura Proxy (gating) + registry estático.

**Não é desta fase:** hooks em transações (v2 — `session` no ctx), sanitização/hierarquia completa de erros do driver (Fase 3, SEC-04), decorators de schema (Fase 5), sistema de plugins (Fase 6). Novas capacidades fora do domínio de hooks/escape hatch viram ideias adiadas.

</domain>

<decisions>
## Implementation Decisions

### Registro e ordem dos hooks (HOOK-01, HOOK-02)
- **D-01:** API de registro **dupla**: declarativa no construtor (`new Model({ hooks: { insert: { pre: [...], post: [...] } } })`) **e** métodos encadeáveis `model.pre(METHOD, fn)` / `model.post(METHOD, fn)` para registro tardio/condicional. O `.pre()` atual deixa de sobrescrever e passa a **acumular** (breaking de comportamento, aceitável em alpha).
- **D-02:** Execução em **ordem de registro**, aguardada sequencialmente (leitura literal de HOOK-01). Ordem entre hooks do construtor e hooks encadeáveis: construtor primeiro, depois os encadeáveis na ordem de chamada — a critério do planning confirmar/documentar.

### Contrato do hook (HOOK-01, HOOK-02)
- **D-03:** Hook recebe um **objeto de contexto explícito `ctx`** — `(ctx) => ...` (sync ou async). Elimina o `this = documento` mágico do `.bind()` atual. O `ctx` carrega ao menos: `filter`, `doc`/`document` (quando aplicável), `options`, `result` (post), e metadados (nome do método, model). Breaking na assinatura atual dos pre-hooks — aceitável em alpha. Formato exato do `ctx` por método → pesquisa/planning.

### Poder do post-hook (HOOK-02)
- **D-04:** Post-hook **observa por padrão, transforma opt-in**. Por padrão lê `ctx.result` para efeitos colaterais (log, cache, métricas) e o retorno ao caller é o resultado cru do driver. Transformar o valor entregue ao caller exige sinal explícito (retornar valor do hook **ou** flag no registro — mecanismo exato a definir na pesquisa). Quando transformação está ativa, o valor final é `ctx.result` após todos os post-hooks.

### Semântica de erros (HOOK-03, HOOK-04)
- **D-05:** (Travado por HOOK-03) erro em **pre-hook aborta** a operação antes da chamada ao driver; erro em **post-hook propaga** ao caller por padrão.
- **D-06:** Post-hook `fireAndForget` (opt-in explícito no registro) **não propaga**; o erro é entregue a um **callback opcional `onHookError(err, ctx)`** configurável no model/database. Sem callback → **fallback `console.error`**. Nunca engolir em silêncio total. (Alinha com a direção de SEC-03/SEC-04 sem antecipá-las.)

### Guard de recursão (HOOK-05)
- **D-07:** Quando um hook chama um método do próprio model, a **chamada aninhada roda em modo raw** — a operação re-entrante executa **sem re-disparar hooks**, evitando o loop mas completando a chamada. Hooks podem usar `model.find()`/etc. livremente. Comportamento implícito a **documentar** claramente. (Detalhe de implementação — flag de reentrância por contexto — a critério do planning.)

### Escape hatch nativo (API-02, API-03)
- **D-08:** `model.getCollection()`, `database.getClient()`, `database.getDb()` são **escape total**: devolvem o objeto **cru do driver**, sem hooks **e** sem gating de `allowedMethods`. É o escape hatch honesto ("você saiu da zona segura — agora é o driver puro"), alinhado ao core value (acesso direto ao driver nativo). Documentar o trade-off explicitamente. Naming exato (`getCollection` vs `.raw`/`.native`) → planning.

### Options passthrough e tipagem (API-01, API-04)
- **D-09:** (Largamente mecânica — Claude/pesquisa) todo método do Model aceita e repassa options nativas com os **tipos do driver** (`FindOptions`, `AggregateOptions`, `BulkWriteOptions`, etc.) e retorna resultados **precisa e consistentemente tipados** (ex.: `find()` → `Promise<WithId<T> | null>`, já corrigido na Fase 1). Decorrência de D-03: como o `ctx` carrega `options`, um **pre-hook pode ajustar as options** antes da chamada ao driver.

### Claude's Discretion
- Mecanismo exato do opt-in de transformação do post-hook (retorno do hook vs flag no registro) — D-04.
- Formato preciso e tipagem do `ctx` por método (quais campos existem em cada método) — D-03.
- Implementação do modo raw / flag de reentrância do guard de recursão — D-07.
- Naming e forma exata do escape hatch (`getCollection` vs `.raw`/`.native`) — D-08.
- Design da tipagem genérica que garante options e retornos precisos por método — D-09.
- Ordem exata entre hooks declarados no construtor vs encadeáveis — D-02.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Escopo e requisitos
- `.planning/ROADMAP.md` — goal, critérios de sucesso e dependências da Fase 2
- `.planning/REQUIREMENTS.md` — HOOK-01..HOOK-05 e API-01..API-04 (escopo da fase); ver também HOOK-05 (guard de recursão) e as descrições de fireAndForget/post-hooks

### Estado do código
- `.planning/codebase/ARCHITECTURE.md` — arquitetura Proxy/registry (constraint do autor: manter)
- `.planning/codebase/CONVENTIONS.md` — símbolos `k`, enum `METHODS`, padrão `preMethod[METHODS.X]`
- `.planning/codebase/CONCERNS.md` — áreas frágeis; a Fase 1 já corrigiu os bugs base sobre os quais os hooks assentam

### Decisões e artefatos da Fase 1 (base direta)
- `.planning/phases/01-funda-o-core-sem-bugs-e-build-moderno/01-CONTEXT.md` — D-11 (`MongoatError` como base de erros, que fireAndForget/onHookError reutilizam), D-06/D-07 (semântica do registry)
- `.planning/phases/01-funda-o-core-sem-bugs-e-build-moderno/01-SUMMARY.md` (todos) — o que já existe: `getCollectionOrThrow()`, `MongoatError`, tipos de retorno corrigidos
- `src/model/index.ts` — superfície atual: `preMethod: Record<METHODS, Function>` (1 handler, linha ~176), `pre()` (linha ~386), padrão `.bind(doc)(options)`, `getCollectionOrThrow()`
- `src/database/index.ts` — `getCollection()` (linha ~287) já existe; `getClient()`/`getDb()` a criar; `KModelProxyHandler` (gating)
- `src/utils/enums.ts` — enum `METHODS` (12 operações) que indexa os hooks

### Pesquisa do ecossistema
- `.planning/research/SUMMARY.md` — síntese que fundamentou o roadmap
- `.planning/research/PITFALLS.md` — armadilhas conhecidas
- `.planning/research/FEATURES.md` — features de ODMs de referência (Mongoose/Papr) para hooks/escape hatch

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `preMethod: Record<METHODS, Function>` e o método `pre()` em `src/model/index.ts` — base a evoluir de 1 handler para lista de handlers pre/post.
- Enum `METHODS` (12 operações) — chaveia o registro de hooks; reaproveitar como chave do novo registro pre/post.
- `MongoatError` (`src/errors/index.ts`, Fase 1) — base para erros de hook e para o caminho `onHookError`.
- `Database.getCollection()` (`src/database/index.ts:287`) e `getCollectionOrThrow()` (Model, Fase 1) — ponto de partida do escape hatch de `Collection`.
- Tipos de options do driver já importados em `src/model/index.ts` (`FindOptions`, `AggregateOptions`, `BulkWriteOptions`, etc.).

### Established Patterns
- Símbolos `k*` para estado privado — novos internals (lista de hooks, flag de reentrância) seguem o padrão.
- Gating via Proxy (`KModelProxyHandler`) e registry estático — **constraint do autor: manter**; hooks e escape hatch atuam dentro/ao redor, não substituem.
- Pre-hooks hoje chamados via `.bind(alvo)(options)` — muda para `(ctx) => ...` (D-03).

### Integration Points
- `src/model/index.ts` métodos CRUD (`insert`, `insertMany`, `find`, `findMany`, `update`, etc.) — cada um passa a: rodar pre-hooks (aguardados) → chamar driver com options → rodar post-hooks. `insertMany` já aguarda hooks com `Promise.all` (fix da Fase 1) — reavaliar para ordem sequencial de múltiplos hooks.
- `KModelProxyHandler` (`src/database/index.ts`) — interação com o escape hatch (D-08: escape total, não passa pelo gating).
- Constructor do Model — ganha o parâmetro `hooks` declarativo (D-01) mantendo-se síncrono (D-07 da Fase 1).

</code_context>

<specifics>
## Specific Ideas

- Princípio reafirmado (herdado da Fase 1): **"quebrar em alpha é barato"** — mudanças breaking na assinatura de hooks (`this` → `ctx`) e no comportamento de `pre()` (sobrescrever → acumular) entram nesta fase.
- Escape hatch **honesto**: o usuário quer que `getCollection()` e amigos sejam bypass total (sem hooks, sem gating), coerente com o core value de acesso direto ao driver — não um wrapper que "vaza" a abstração do ODM.
- Erro de hook nunca some em silêncio: mesmo o `fireAndForget` tem destino (`onHookError` ou `console.error`).

</specifics>

<deferred>
## Deferred Ideas

- **Hooks em transações** (o `ctx` carregar a `session` de `withTransaction`) — v2 (já listado em REQUIREMENTS v2); nesta fase o `ctx` não precisa expor `session`.
- **Hierarquia completa de erros + sanitização das mensagens do driver** — Fase 3 (SEC-03/SEC-04); esta fase só reutiliza a base `MongoatError` e introduz `onHookError`.
- **Contexto tipado e selado para plugins (`PluginContext`)** — Fase 6 (PLUG-03); o `ctx` de hooks desta fase é o precursor conceitual, mas o contrato de plugins é separado.
- Confirmar/ajustar naming do escape hatch (`getCollection` vs `.raw`/`.native`) — decisão de planning desta fase, não adiada, apenas não travada aqui.

</deferred>

---

*Phase: 2-Sistema de hooks completo e API thin nativa*
*Context gathered: 2026-07-07*
