---
phase: 07-sistema-de-plugins
verified: 2026-07-15T13:23:20Z
status: passed
score: 3/3 must-haves verified
behavior_unverified: 0
overrides_applied: 0
---

# Fase 7: Sistema de Plugins — Relatório de Verificação

**Objetivo da fase:** O dev pode estender models com plugins reutilizáveis — por model e globais — através de um contrato de plugin tipado e selado. Feature aditiva pós-v1.0 (minor 1.x).
**Verificado em:** 2026-07-15T13:23:20Z
**Status:** passed
**Re-verificação:** Não — verificação inicial

## Legenda de códigos de planejamento

| Código | Significado |
|---|---|
| PLUG-01/02/03 | Requisitos formais da fase (REQUIREMENTS.md) |
| D-0x | Decisões registradas em 07-CONTEXT.md/07-RESEARCH.md |
| WR-0x | Warning do code review (07-REVIEW.md) |
| IN-0x | Info/nota do code review (07-REVIEW.md) |
| T-07-0x | Item do STRIDE threat register de cada plano |

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Dev aplica plugins por model via `plugins[]` no construtor, aplicados antes do wrap do Proxy | ✓ VERIFIED | `src/model/index.ts:583-587` chama `applyPlugins(this, Model[kGlobalPlugins], props.plugins ?? [])` estritamente entre o loop `decoratedHooks.post` (linha 567-572) e `if (props.hooks)` (linha 592); `return Model[kDatabase].registerModel(...)` (wrap do Proxy) só ocorre na linha 625-627, depois. Confirmado por execução real: `npx vitest run test/model/plugins-application-order.test.ts` passa (3/3), incluindo o caso "ctx.static deixa model.<static> disponível imediatamente após `new Model(...)`". |
| 2 | Dev registra um plugin global via `Model.plugin()`, com enforcement de ordem (erro claro se chamado após a construção do primeiro model) | ✓ VERIFIED | `src/model/index.ts:1297-1308` — `static plugin()` lança `MongoatValidationError` code `PLUGIN_REGISTERED_TOO_LATE` se `Model[kPluginsLocked]` for `true`. A trava é setada tanto no caminho normal (linha 615) quanto no early-return de reuso de config idêntica (linha 526, Pitfall 5). Confirmado por execução real: `npx vitest run test/model/plugins-global-lock.test.ts` passa (3/3), inclusive o caso de reuso de config idêntica. |
| 3 | Plugins recebem um `PluginContext` tipado e selado: podem registrar hooks e statics, mas não podem mutar schema/validator/allowedMethods | ✓ VERIFIED (com ressalva reportada — ver Anti-Patterns) | `buildPluginContext` (`src/model/plugins.ts:177-199`) expõe `schema` via `structuredClone(target.validator.$jsonSchema)` e `allowedMethods` via `Object.freeze([...target.allowedMethods])` — nunca a referência viva. Confirmado por execução real: `npx vitest run test/model/plugins-context-seal.test.ts` passa (3/3), provando que mutar `ctx.schema`/tentar mutar `ctx.allowedMethods` dentro de `setup()` nunca altera `model.validator.$jsonSchema`/`model.allowedMethods`, e que a superfície de `ctx` é exatamente `{collectionName, allowedMethods, schema, pre, post, static}` (nenhuma referência viva vaza). **Ressalva:** o vetor de mutação coberto pelo critério (schema/validator/allowedMethods diretamente) está genuinamente bloqueado; um vetor ADJACENTE (poluição de protótipo via `ctx.static('__proto__', fn)`) NÃO está bloqueado — ver WR-01 abaixo, reproduzido empiricamente nesta verificação. |

**Score:** 3/3 truths verified (0 present-behavior-unverified)

### Required Artifacts

| Artifact | Expected | Status | Details |
|---|---|---|---|
| `src/types/plugin.ts` | Tipos públicos `Plugin`/`PluginContext`/`PluginObject`/`PluginSetup` | ✓ VERIFIED | Existe, exporta os 4 tipos; `PluginContext.schema`/`.allowedMethods` marcados `readonly`. Re-exportado em `src/types/index.ts:21-24` e `src/index.ts:33-36`. |
| `src/model/plugins.ts` | Módulo puro (normalize/dedup/colisão/selo/applyPlugins) | ✓ VERIFIED | `normalizePlugin`, `resolvePluginList`, `RESERVED_NAMES` (33 nomes, incl. privados de runtime `rawInsert`/`executeHooked`/etc.), `registerPluginStatic`, `buildPluginContext`, `applyPlugins` todos exportados; zero import de `Model` (só tipos estruturais). |
| `src/model/index.ts` | Ponto de integração no construtor + `Model.plugin()` + `kResetPlugins` | ✓ VERIFIED | `applyPlugins` no slot D-06 (linha 583); `static plugin()` (linha 1297); `static [kResetPlugins]()` (linha 1323), Symbol exportado do módulo (`export const kResetPlugins`, linha 80) e AUSENTE do barrel público `src/index.ts` (confirmado por grep). |
| `test/model/plugins-resolve.test.ts` | 21 testes unitários da lógica pura | ✓ VERIFIED | Executado: 21/21 passam (incluído no total abaixo). |
| `test/model/plugins-application-order.test.ts` | PLUG-01 (aplicação + ordem) | ✓ VERIFIED | 3/3 passam. |
| `test/model/plugins-fail-loud.test.ts` | D-10 (abort + não-registro) | ✓ VERIFIED | 1/1 passa. |
| `test/model/plugins-context-seal.test.ts` | PLUG-03/D-03 (selo) | ✓ VERIFIED | 3/3 passam. |
| `test/model/plugins-static-collision.test.ts` | D-08 (colisão nativo/privado/plugin↔plugin) | ✓ VERIFIED | 4/4 passam. |
| `test/model/plugins-global-lock.test.ts` | PLUG-02 (enforcement de ordem) | ✓ VERIFIED | 3/3 passam. |
| `test/model/plugins-reset.test.ts` | D-11 (reset) | ✓ VERIFIED | 2/2 passam. |
| `test/model/plugins-order.test.ts` | D-05/D-06 (ordem completa) | ✓ VERIFIED | 1/1 passa. |
| `test/model/plugins-dedup.test.ts` | D-07 (dedup global+local) | ✓ VERIFIED | 2/2 passam. |
| `test/model/plugins-static-binding.test.ts` | D-12 (bind via Proxy, integração real) | ✓ VERIFIED | Executado com testcontainers reais (MongoDB): 1/1 passa. |
| `examples/plugins/timestamps-plugin.ts` | Factory parametrizável (D-02) | ✓ VERIFIED | Factory `timestamps(options?)` presente; `npx tsc --noEmit` inclui `examples/` e passa limpo. |
| `examples/plugins/paginate-plugin.ts` | Static via `this.getCollection()` | ✓ VERIFIED | Presente; usado pelo teste de integração D-12. |
| `examples/plugins/augmentation.ts` | Module augmentation D-09b | ✓ VERIFIED | `declare module '@/model' { interface Model<...> }` presente; `.paginate()` chamado sem `as`/`any`. |

### Key Link Verification

| From | To | Via | Status | Details |
|---|---|---|---|---|
| `src/model/index.ts` (construtor) | `src/model/plugins.ts` (`applyPlugins`) | Chamada direta no slot entre `decoratedHooks.post` e `if (props.hooks)` | ✓ WIRED | Confirmado por leitura de linha e por teste de ordem (`plugins-application-order.test.ts`, `plugins-order.test.ts`). |
| `src/model/plugins.ts` | `Model` (classe) | Tipo estrutural `PluginTarget` (SEM import de `Model`) | ✓ WIRED (sem ciclo) | `import` de `plugins.ts` não referencia `@/model`; confirmado por grep dos imports do arquivo. |
| `Model.plugin()` | `Model[kGlobalPlugins]` | `push` da referência original | ✓ WIRED | Confirmado por teste `plugins-dedup.test.ts` (mesma referência global+local aplica 1x) e `plugins-order.test.ts` (global aplica antes de local). |
| `Model.plugin()` | `Model[kPluginsLocked]` | Guarda de ordem (throw se `true`) | ✓ WIRED | Confirmado por `plugins-global-lock.test.ts`, incluindo o caminho de reuso de config idêntica (Pitfall 5). |
| Static de plugin (`ctx.static`) | Proxy trap `value.bind(target)` (`src/database/index.ts`) | Nenhum `.bind()` manual em `registerPluginStatic` | ✓ WIRED | Provado com MongoDB real via testcontainers em `plugins-static-binding.test.ts` (paginação funcional usando `this.getCollection()` dentro do static). |
| `src/index.ts`/`src/types/index.ts` (barrel) | `src/types/plugin.ts` | `export type { Plugin, PluginContext, PluginObject, PluginSetup }` | ✓ WIRED | Confirmado por grep — presentes nos dois barrels. |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|---|---|---|---|
| Testes unitários puros do módulo `plugins.ts` | `npx vitest run test/model/plugins-resolve.test.ts` | 21/21 pass | ✓ PASS |
| Aplicação local antes do wrap do Proxy | `npx vitest run test/model/plugins-application-order.test.ts` | 3/3 pass | ✓ PASS |
| Fail-loud + não-registro | `npx vitest run test/model/plugins-fail-loud.test.ts` | 1/1 pass | ✓ PASS |
| Selo read-only do contexto | `npx vitest run test/model/plugins-context-seal.test.ts` | 3/3 pass | ✓ PASS |
| Colisão de statics (nativo/privado/plugin↔plugin) | `npx vitest run test/model/plugins-static-collision.test.ts` | 4/4 pass | ✓ PASS |
| Enforcement de ordem global (`Model.plugin()`) | `npx vitest run test/model/plugins-global-lock.test.ts` | 3/3 pass | ✓ PASS |
| Reset de estado global (`kResetPlugins`) | `npx vitest run test/model/plugins-reset.test.ts` | 2/2 pass | ✓ PASS |
| Ordem determinística completa | `npx vitest run test/model/plugins-order.test.ts` | 1/1 pass | ✓ PASS |
| Dedup global+local por referência | `npx vitest run test/model/plugins-dedup.test.ts` | 2/2 pass | ✓ PASS |
| Bind de static via Proxy (integração real, testcontainers) | `npx vitest run test/model/plugins-static-binding.test.ts` | 1/1 pass | ✓ PASS |
| Compilação de tipos (inclui `examples/plugins/`) | `npx tsc --noEmit` | exit 0 | ✓ PASS |
| Suíte completa (regressão) | `npx vitest run` (única execução completa) | 209/209 pass, 55 arquivos | ✓ PASS |
| **Spot-check ad hoc — `candidateHasPlugins` (re-registro com `plugins` declarado)** | Teste ad hoc criado nesta verificação (`new Model` → `new Model` mesmo `collectionName` + `plugins: [p]`) | Lança `MongoatValidationError` code `MODEL_CONFIG_CONFLICT` como esperado | ✓ PASS (comportamento correto, porém não coberto por nenhum teste do repositório — ver Anti-Patterns) |
| **Spot-check ad hoc — WR-01 (`ctx.static('__proto__', fn)`)** | Teste ad hoc criado nesta verificação | `ctx.static('__proto__', fn)` NÃO lança; `model.find` vira `undefined` após a construção (protótipo corrompido) | ✗ FAIL — confirma WR-01 do 07-REVIEW.md como reproduzível hoje |
| **Spot-check ad hoc — WR-02 (dois plugins anônimos)** | Teste ad hoc criado nesta verificação | `plugins: [() => {}, () => {}]` lança `DUPLICATE_PLUGIN_NAME` mesmo sem nome declarado | ✗ FAIL — confirma WR-02 do 07-REVIEW.md como reproduzível hoje |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|---|---|---|---|---|
| PLUG-01 | 07-01, 07-02, 07-04 | Dev aplica plugins por model via `plugins[]` no construtor, aplicados antes do wrap do Proxy | ✓ SATISFIED | `applyPlugins` no slot D-06; teste de integração (bind via Proxy) contra MongoDB real |
| PLUG-02 | 07-03 | Dev registra plugin global via `Model.plugin()`, com enforcement de ordem | ✓ SATISFIED | `static plugin()` + `kPluginsLocked`; `plugins-global-lock.test.ts` |
| PLUG-03 | 07-01, 07-02 | Plugins recebem `PluginContext` tipado e selado (hooks/statics sim, schema/validator/allowedMethods não) | ✓ SATISFIED (com ressalva WR-01, ver Anti-Patterns) | `buildPluginContext` via `structuredClone`/`Object.freeze`; `plugins-context-seal.test.ts` |

Nenhum requisito órfão: `REQUIREMENTS.md` mapeia exatamente PLUG-01/02/03 para a Fase 7, e os três aparecem no campo `requirements` de pelo menos um dos 4 planos (01, 02, 03, 04). Todos marcados `[x]` e "Complete" em `REQUIREMENTS.md`.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|---|---|---|---|---|
| `src/model/plugins.ts` | 140-165 (`registerPluginStatic`) | WR-01 (07-REVIEW.md): `ctx.static('__proto__'/'constructor', fn)` não é rejeitado por `RESERVED_NAMES` e corrompe o protótipo do model (`model.find`/`model.insert` viram `undefined`) | ⚠️ WARNING (advisory, não bloqueia a fase per instrução do orquestrador) | Reproduzido empiricamente nesta verificação (spot-check acima). Enfraquece a garantia de "contrato selado" do critério 3 por um vetor adjacente (não é mutação direta de schema/validator/allowedMethods, mas destrói a superfície nativa do model). Fix sugerido já documentado no 07-REVIEW.md. |
| `src/model/plugins.ts` | 75-128 (`normalizePlugin`/`resolvePluginList`) | WR-02 (07-REVIEW.md): dois plugins anônimos (`() => {}`) ou dois `{ setup }` sem `name` colidem com `DUPLICATE_PLUGIN_NAME` — formato bare-function documentado como suportado quebra em quantidade > 1 | ⚠️ WARNING (advisory) | Reproduzido empiricamente nesta verificação. Não é um blocker funcional (o erro é claro), mas é uma UX de erro enganosa para um formato que o próprio tipo público promove. |
| `src/model/index.ts` (guarda `candidateHasPlugins`, linha 495-513) | — | Guarda de re-registro com `plugins` compila e FUNCIONA (verificado empiricamente nesta verificação), mas nenhum teste do repositório exercita esse caminho — gap sinalizado honestamente pelo próprio 07-02-SUMMARY.md (`human_judgment: true`) e nunca fechado nos Planos 03/04 | ℹ️ INFO | Comportamento correto confirmado por spot-check ad hoc; risco de regressão futura não coberto por CI. |
| `src/model/plugins.ts` | `'<anonymous>'` em 3 locais (IN-01 do review) | Magic string duplicada | ℹ️ INFO | Cosmético, sem impacto funcional. |
| `src/types/model.ts:63-68` (pré-existente, Fase 6) | — | JSDoc público cita ID interno `(D-06)` — viola convenção do projeto (memória "JSDoc público sem IDs internos") | ℹ️ INFO | Pré-existente à Fase 7, fora do escopo de criação desta fase, mas presente nos arquivos revisados. O novo campo `plugins` no mesmo arquivo está limpo. |

Nenhum marcador de débito não-referenciado (`TBD`/`FIXME`/`XXX`) nem `TODO`/`HACK`/`PLACEHOLDER` encontrado nos arquivos desta fase.

### Human Verification Required

Nenhum item requer verificação humana — todos os comportamentos-chave (aplicação local, ordem global→local, selo, colisão, fail-loud, bind via Proxy) foram exercitados e passaram via testes automatizados reais (incluindo integração com MongoDB via testcontainers), e as duas ressalvas WR-01/WR-02 já têm status e fix sugerido documentados no 07-REVIEW.md (WARNING, não BLOCKER, por decisão explícita do escopo desta verificação).

### Gaps Summary

Nenhum gap bloqueante. Os 3 critérios de sucesso da fase estão genuinamente implementados e comprovados por teste real (não apenas por afirmação do SUMMARY):

1. `plugins[]` local aplicado antes do wrap do Proxy — confirmado por leitura de código + teste de ordem.
2. `Model.plugin()` global com enforcement de ordem fail-loud — confirmado por teste, incluindo o caso de reuso de config idêntica (Pitfall 5).
3. `PluginContext` selado via `structuredClone`/`Object.freeze` para o vetor literal do critério (schema/validator/allowedMethods) — confirmado por teste.

Duas ressalvas foram levadas para este relatório por instrução explícita do escopo da verificação (WR-01 prototype-pollution via `ctx.static('__proto__', ...)` e WR-02 colisão de nome entre plugins anônimos), ambas já classificadas como WARNING (não BLOCKER) no 07-REVIEW.md e reproduzidas empiricamente aqui. Elas não impedem o goal-achievement da fase (o contrato bloqueia o vetor de mutação direta descrito no critério 3), mas representam dívida de robustez que o autor pode escolher endereçar em uma iteração futura ou aceitar como risco residual documentado.

Adicionalmente, o caminho `candidateHasPlugins` (guarda de re-registro com `plugins` declarado) está implementado e funciona corretamente (verificado nesta sessão por spot-check ad hoc), mas nenhum teste do repositório o exercita — gap de cobertura de teste, não de comportamento.

---

_Verified: 2026-07-15T13:23:20Z_
_Verifier: Claude (gsd-verifier)_
