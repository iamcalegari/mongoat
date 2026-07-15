# Phase 7: Sistema de plugins - Context

**Gathered:** 2026-07-15
**Status:** Ready for planning

<domain>
## Phase Boundary

O dev pode estender models com plugins reutilizáveis — **por model** (`plugins[]` no construtor) e **globais** (`Model.plugin()`) — através de um `PluginContext` tipado e selado. Plugins podem registrar hooks e statics, mas **não** podem mutar schema/validator/allowedMethods. Feature aditiva pós-v1.0 (minor 1.x), independente da Fase 6 mas coexistindo com ela.

**Requisitos:** PLUG-01 (plugins por model, aplicados antes do wrap do Proxy), PLUG-02 (`Model.plugin()` global com enforcement de ordem), PLUG-03 (`PluginContext` tipado e selado).

**Fora de escopo (empurra para outra fase / não é plugin):** migrations (Fase 8); qualquer mutação de schema/validator/allowedMethods por plugin (viola o selo por design); versionamento formal de contrato de plugin (usa semver do pacote).

</domain>

<decisions>
## Implementation Decisions

### Forma do contrato de plugin
- **D-01:** Plugin aceita **duas formas normalizadas**: função `(ctx: PluginContext) => void` OU objeto `{ name, setup }`. Internamente normaliza para a forma objeto (`fn → { name: fn.name || '<anonymous>', setup: fn }`). O `name` estável alimenta dedup, mensagens de erro e diagnóstico.
- **D-02:** Plugins parametrizáveis usam **factory pattern** — uma função que recebe opções e retorna o plugin (função ou objeto). **Zero API extra no core** (composição pura de JS/TS); o autor do plugin tipa suas próprias opções. Ex.: `timestamps({ createdField: 'created_at' })`.
- **D-03:** `PluginContext` expõe **metadados read-only** para leitura: `collectionName` + visões congeladas/cópias de `allowedMethods` e `schema` (`Object.freeze`/cópia — nunca a referência viva). O **registro** (`pre`/`post`/`static`) é a única via de efeito. Isso materializa o "selo" do PLUG-03: leitura sem mutação.
- **D-04 (nota técnica):** `setup()` de plugin é **SÍNCRONO**. O construtor do Model é síncrono (`src/model/index.ts:349` retorna o Proxy sincronamente via `registerModel`); plugins são aplicados **antes do wrap do Proxy** (PLUG-01) e não fazem I/O no apply.

### Ordem e deduplicação
- **D-05:** **Globais primeiro.** `Model.plugin()` roda antes dos `plugins[]` do model; cada grupo em ordem de registro/declaração (padrão "base global, especialização local").
- **D-06:** Hooks de plugin entram na ordem determinística da Fase 6 (D-11) **antes do config**: `@Pre de campo → @Pre de classe → PLUGINS (globais → locais) → hooks do config (props.hooks) → .pre()/.post() encadeados`. Mantém o gradiente genérico→específico, consistente com "config sobrescreve declaração" (D-13 da Fase 6).
- **D-07:** **Dedup por referência.** O mesmo plugin (mesma referência após normalização) aplica **1x**, na primeira posição em que aparece (global + local é redundância óbvia, não erro). Nomes iguais com **referências diferentes** = `MongoatValidationError` com code `DUPLICATE_PLUGIN_NAME` (colisão de identidade).

### Statics: colisões e tipagem
- **D-08:** **Nativo protegido; plugin→plugin erra.** Static que colide com método nativo (os `METHODS` gated: find/insert/update/... + escape hatch `getCollection`/`getClient`/`getDb`) **sempre** lança. Dois plugins com o mesmo static também lançam `MongoatValidationError` com code `STATIC_COLLISION` na construção. **Nunca sobrescreve silenciosamente**; a mensagem aponta o plugin culpado pelo `name`.
- **D-09:** **Tipagem via generic no construtor.** O tipo de retorno de `new Model({ plugins })` soma os statics de cada plugin ao tipo do model; o autor do plugin declara o shape (ex.: `Plugin<{ paginate(...): ... }>`), o consumidor não anota nada. ⚠️ **Item de research:** fazer a inferência fluir através do retorno **Proxy** do construtor (`registerModel` retorna `new Proxy(...)`) é não-trivial em TypeScript — validar viabilidade cedo; fallback documentado é interface merging manual (D-09b) se a inferência plena não for viável.

### Falhas e testabilidade
- **D-10:** **Fail-loud na construção.** Qualquer erro no `setup()` de um plugin aborta o `new Model(...)` imediatamente, envolto em `MongoatValidationError` com code estável `PLUGIN_SETUP_FAILED`, o `name` do plugin culpado na mensagem e o erro original em `.cause`. Fiel à política fail-loud da Fase 3 — model meio-configurado nunca existe/registra.
- **D-11:** **Reset interno + doc de teste.** Um `Model[kResetPlugins]()` (Symbol interno, **fora do barrel público**) limpa a lista global + o flag de trava do PLUG-02; documentado no guia de testing para uso em `beforeEach`. Mesmo padrão Symbol-key da lib; não polui a API pública. Endereça a área frágil "registry estático sem reset" do CONCERNS.md.

### Statics × driver nativo
- **D-12:** Statics são **bound ao model** (como os métodos nativos já são via o Proxy — `src/database/index.ts:357-358` faz `value.bind(target)`). Dentro do static, `this.getCollection()` / `this.find()` etc. estão disponíveis: o plugin usa a **mesma superfície pública** do model. Zero API nova — o escape hatch da Fase 2 é o caminho para o driver cru (ex.: `paginate` faz `this.getCollection().find(q).skip().limit()`).

### Plugin × classe decorada (Fase 6)
- **D-13:** **Ortogonal — mesmo caminho.** Plugins operam sobre o Model construído, independente de como o schema foi definido. `plugins[]` é opção do construtor; classe decorada (D-08 da F6) e objeto plano convergem no mesmo construtor. `PluginContext.schema` read-only reflete o schema **já compilado** (via `Schema.compile` da classe ou o objeto plano). Hooks de plugin entram no slot `PLUGINS` da ordem D-06, após os `@Pre` da classe. **Sem** decorator `@Use` — uma única via de aplicar plugin (o construtor).

### onHookError / fireAndForget
- **D-14:** Hooks de plugin **herdam tudo** da Fase 2: entram nos mesmos arrays, seguem a semântica assimétrica (pre pode abortar; post observa; `fireAndForget → onHookError`). O `onHookError` permanece **config do MODEL** (uma política de erro por model, não por plugin) — plugins registram efeitos, o dono do model decide a política de falha. Zero mecanismo novo.

### Contrato selado: versionamento
- **D-15:** **Sem versão formal; semver do pacote.** O "selo" é a imutabilidade (plugin não muta schema/validator/allowedMethods) + a estabilidade do tipo `PluginContext` sob o semver do próprio `@iamcalegari/mongoat` (adicionar campo ao ctx = minor; mudar/remover = major). Sem `apiVersion`, sem checagem em runtime — coerente com "mínimo de superfície" e com a política semver publicada na Fase 5.

### Claude's Discretion
- Codes exatos e mensagens dos novos erros (`DUPLICATE_PLUGIN_NAME`, `STATIC_COLLISION`, `PLUGIN_SETUP_FAILED`) — nomear em consistência com o enum de erros existente (Fase 3).
- Nomes internos exatos dos Symbols (`kResetPlugins`, storage da lista global de plugins, flag de trava do PLUG-02) — seguir a convenção `kPrivateName`/`KMapName` já usada em Database/Model.
- Mecânica exata do `PluginContext`: como `pre`/`post`/`static` alimentam os arrays de hook e o mapa de statics do model; como a leitura read-only é congelada sem custo de cópia profunda desnecessária.
- Assinatura de tipo precisa do generic de inferência de statics (D-09) e a decisão final inferência-plena vs. interface-merging — dirigida pelo research/planner após validar viabilidade no retorno Proxy.
- Onde o flag de "primeiro model construído" (trava do PLUG-02) vive e como a mensagem de erro de ordem é redigida (`Model.plugin()` chamado tarde demais).
- Interação com a área frágil `isSameConfig` (WR-04 do 05-REVIEW: hoje `isSameConfig` já compara hooks desde a Fase 6): decidir se plugins entram na comparação de re-registro do mesmo `collectionName`.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requisitos e roadmap
- `.planning/REQUIREMENTS.md` §Plugins — PLUG-01/02/03 (texto normativo dos requisitos)
- `.planning/ROADMAP.md` §"Phase 7: Sistema de plugins" — goal, depends-on (Fase 5), success criteria

### Código de integração (o Model e o Proxy que plugins estendem)
- `src/model/index.ts` — construtor do Model (`:349`), storage de hooks (`hooks`, `:314`), `registerModel` chamado sincronamente (`:549`), escape hatch `getCollection` (`:677`); é onde `plugins[]` é consumido e statics/hooks de plugin são aplicados
- `src/database/index.ts` — `registerModel` que faz `new Proxy(model, KModelProxyHandler())` (`:211-212`), o gating trap (`:337-363`, `value.bind(target)` em `:357-358`); PLUG-01 exige aplicar plugins **antes** deste wrap
- `src/schema/compile.ts` + `src/schema/index.ts` — `Schema.compile` da Fase 6; `PluginContext.schema` read-only reflete a saída dele (D-13)
- `src/types/model.ts` — `CreateModelProps` (onde `plugins[]` entra), tipos do Model
- `src/types/hooks.ts` — `HookRegistry`/`HookContextMap` e a semântica de erro/`onHookError` que hooks de plugin herdam (D-14)

### Decisões anteriores que constrangem esta fase
- `.planning/phases/06-api-de-schema-com-decorators-tc39/06-CONTEXT.md` §D-11 — ordem determinística de execução de hooks (o slot `PLUGINS` de D-06 se insere aqui); §D-13 — precedência config > declaração
- `.planning/phases/02-*/02-CONTEXT.md` — contrato de hook via `ctx`, semântica assimétrica pre/post, `fireAndForget`/`onHookError`, escape hatch total (base de D-12/D-14)
- `.planning/codebase/CONCERNS.md` — área frágil "registry estático sem thread-safety/reset" (motiva D-11) e `CUSTOM_VALIDATION.UNIQUE` nunca implementado
- `.planning/phases/05-*/05-REVIEW.md` §WR-04 — `isSameConfig` e comparação de re-registro (Claude's Discretion sobre plugins na comparação)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **Proxy binding (`src/database/index.ts:357-358`)**: statics de plugin já herdam `this` bound ao model raw automaticamente — nenhum trabalho extra para D-12; statics acessam `this.getCollection()`/`this.find()`.
- **Escape hatch (`getCollection`/`getClient`/`getDb`)**: caminho pronto para statics de plugin executarem queries no driver nativo (D-12).
- **`HookRegistry` + pipeline de hooks (Fase 2/6)**: `ctx.pre`/`ctx.post` de plugin alimentam os arrays existentes; nada de pipeline novo (D-06/D-14).
- **Padrão Symbol-key (`kClient`, `KModelMap`, `KModelProxyHandler`)**: modelo direto para `kResetPlugins` e o storage da lista global de plugins (D-11).
- **Hierarquia de erros tipada (Fase 3, `MongoatValidationError` + `.code`)**: reusar para os novos codes (`DUPLICATE_PLUGIN_NAME`, `STATIC_COLLISION`, `PLUGIN_SETUP_FAILED`).

### Established Patterns
- **Gating por enum `METHODS`**: statics NÃO estão no enum, então passam pelo trap sem serem gated — mas por isso a proteção contra colisão com nativos (D-08) precisa ser explícita no apply, não vem de graça do Proxy.
- **Construtor síncrono que retorna Proxy**: constrange D-04 (setup síncrono) e D-09 (inferência de tipo através do retorno Proxy é o ponto difícil).
- **Config operacional ≠ shape** (D-06 da Fase 6): plugins são operacionais, entram no construtor, não no schema.

### Integration Points
- `plugins[]` novo campo em `CreateModelProps` (`src/types/model.ts`) consumido no construtor do Model **antes** de `registerModel` (PLUG-01).
- `Model.plugin()` novo static + estado estático global (lista + flag de trava) na classe Model, com enforcement de ordem (PLUG-02).
- Aplicação dos hooks de plugin no ponto exato da ordem D-11/D-06, entre `@Pre` de classe e hooks do config.

</code_context>

<specifics>
## Specific Ideas

- Plugins de referência que o dev tem em mente (guiam os testes/exemplos): `timestamps` (createdAt/updatedAt via `ctx.pre`), `audit`/`metrics` (globais via `Model.plugin()`), `paginate` (static que usa `this.getCollection()`). A DX-alvo é estilo mongoose (`plugins: [timestamps()]`) mas com o `PluginContext` selado e tipado do Mongoat.
- Filosofia mantida: thin sobre o driver, mínimo de superfície pública nova, imutabilidade do contrato como o "selo".

</specifics>

<deferred>
## Deferred Ideas

- **Decorator `@Use(plugin)` na classe** — considerado para simetria com a API de decorators da Fase 6, mas rejeitado (D-13): uma única via de aplicar plugin (o construtor). Se houver demanda futura por declarar plugins junto do schema decorado, é candidato a fase própria.
- **`apiVersion` / versionamento formal do contrato de plugin** — rejeitado (D-15) em favor do semver do pacote; reconsiderar só se um ecossistema de plugins de terceiros tornar a compatibilidade em runtime necessária.
- **Migrations** (Fase 8) — fora de escopo, já roadmapeado.

</deferred>

---

*Phase: 7-Sistema de plugins*
*Context gathered: 2026-07-15*
