---
phase: 07
slug: sistema-de-plugins
status: verified
# threats_open = count of OPEN threats at or above workflow.security_block_on severity (the blocking gate)
threats_open: 0
asvs_level: 1
created: 2026-07-15
updated: 2026-07-15
---

# Phase 07 — Security

> Contrato de segurança da fase: registro de ameaças, riscos aceitos e trilha de auditoria.
> Registro autorado em plan-time; verificação retroativa por grep + reprodução empírica (ASVS L1).

---

## Trust Boundaries

| Boundary | Descrição | Dado que cruza |
|----------|-----------|----------------|
| autor-do-plugin → core Mongoat | O `setup()` de um plugin (potencialmente pacote npm de terceiro) roda in-process durante `new Model(...)`; o core define a superfície de efeito permitida (`pre`/`post`/`static`) e o selo read-only do `PluginContext`. | Código do plugin (alta confiança implícita — supply-chain) |
| plugin → `$jsonSchema` compilado | Um `setup()` que consegue mutar o validator vivo enfraquece a validação server-side do MongoDB. `ctx.schema` é entregue como `structuredClone`, desconectado da referência viva. | Regras de validação server-side |
| ordem de bootstrapping → estado estático global | `Model.plugin()` muta estado module-level; a trava `kPluginsLocked` garante que globais não sejam registrados após models já materializados. | Lista global de plugins |
| static de plugin → driver nativo | Um static usa o escape hatch (`this.getCollection()`) — mesma superfície pública já auditada na Fase 2, sem nova via de bypass. | Documentos/queries |

---

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation (verificada) | Status |
|-----------|----------|-----------|----------|-------------|-------------------------|--------|
| T-07-01 | Tampering | `registerPluginStatic` / `RESERVED_NAMES` + `FORBIDDEN_STATIC_KEYS` (`src/model/plugins.ts`) | high | mitigate | Colisão contra membros nomeados do `Model.prototype` **e** contra as chaves de prototype-pollution `__proto__`/`constructor`/`prototype` (novo `FORBIDDEN_STATIC_KEYS`) lança `STATIC_COLLISION` antes de qualquer atribuição; assignment via `Object.defineProperty` (nunca aciona o setter `__proto__`). Verificado por `plugins-static-collision.test.ts` (`__proto__`/`constructor`/`prototype` colidem + `find`/`insert` sobrevivem). Corrigido em `79bf050`. | closed |
| T-07-02 | Elevation of Privilege | `setup()` in-process / escape hatch `this.getCollection()` | high | accept | Parte controlável mitigada: `PluginContext` nunca expõe referência viva de schema/validator/allowedMethods — `buildPluginContext` entrega `structuredClone` + cópia congelada (`src/model/plugins.ts:182-199`; `src/types/plugin.ts:14-48`). Limitação in-process = mesma classe de qualquer dep npm; risco aceito e registrado. | closed |
| T-07-03 | Tampering / Info Disclosure | `buildPluginContext.schema` / `onHookError` | high/low | mitigate/accept | `ctx.schema = structuredClone(target.validator.$jsonSchema)` (`src/model/plugins.ts:185`) — mutar a cópia nunca alcança o validator; asserido em `plugins-resolve.test.ts:195-210` e `plugins-context-seal.test.ts`. `defaultOnHookError` loga só `err`, nunca `ctx` (`src/model/hooks.ts:19-21`). | closed |
| T-07-04 | Denial of Service (config) | model meio-configurado registrado após erro de plugin | high | mitigate | Fail-loud: `applyPlugins` roda ANTES de `registerModel` (`src/model/index.ts:583-587` → `:625`); um `setup()` que **lança** aborta `new Model(...)` com `PLUGIN_SETUP_FAILED`; `plugins-fail-loud.test.ts:72` prova `db.getModel(name) === undefined`. Após o fix de T-07-01 (`79bf050`), o caminho `__proto__`/`constructor`/`prototype` também lança → `PLUGIN_SETUP_FAILED` → aborta a construção (não há mais registro silencioso de model corrompido). | closed |
| T-07-05 | Tampering (state) | `Model.plugin()` chamado tarde → globais inconsistentes | high | mitigate | `Model.plugin()` verifica `kPluginsLocked` e lança `PLUGIN_REGISTERED_TOO_LATE` (`src/model/index.ts:1297-1308`); trava setada na 1ª construção incl. early-return de reuso (`:526`, `:615`); `plugins-global-lock.test.ts` cobre os dois caminhos + Pitfall 5. | closed |
| T-07-06 | Tampering (test isolation) | estado global vazando entre suites | low | mitigate | `Model[kResetPlugins]()` limpa lista + destrava (`src/model/index.ts:1323-1326`); Symbol `kResetPlugins` exportado de `@/model` (ausente do barrel `src/index.ts`); `plugins-reset.test.ts` verifica. | closed |
| T-07-07 | Tampering (type-safety) | consumidor tipando statics via `any`/cast | low | mitigate | Exemplo canônico `declare module '@/model' { interface Model ... }` (`examples/plugins/augmentation.ts:64-77`), `.paginate(1, 10)` sem `as`/`any` no call-site; `npx tsc --noEmit` sobre `examples/` guarda a regressão. | closed |
| T-07-SC | Tampering | instalação de pacotes npm | n/a | accept | Zero deps novas (D-02): `package.json` mantém apenas `bson`/`mongodb`; todos os 4 SUMMARY com `tech-stack.added: []`. Nenhum `npm install` a auditar. | closed |

*Status: open · closed · open — below high threshold (non-blocking)*
*Severity: critical > high > medium > low — apenas ameaças open com severidade ≥ `block_on` (high) contam para `threats_open`*
*Disposition: mitigate (implementação exigida) · accept (risco documentado) · transfer (terceiro)*

---

## Resolved Threats (previamente blocking — fechadas nesta sessão)

### T-07-01 — bypass de prototype-pollution em `registerPluginStatic` (high, mitigate → RESOLVIDA em `79bf050`)

**Afirmação da mitigação (plan-time):** "Static colidindo com QUALQUER membro do `Model.prototype` (incl. privados `rawInsert`/`executeHooked`) lança `STATIC_COLLISION` na resolução; nunca sobrescreve silenciosamente."

**Gap:** `RESERVED_NAMES` (`src/model/plugins.ts:33-67`) enumera métodos por nome mas **não inclui** as chaves especiais herdadas de `Object.prototype`: `__proto__`, `constructor`, `prototype`. A guarda em `registerPluginStatic` (`:147`) usa `RESERVED_NAMES.has(name)` e depois atribui via bracket `target[name] = fn` (`:164`). Para `name === '__proto__'`, essa atribuição invoca o setter de `__proto__` e **troca o protótipo da instância do model**.

**Reprodução empírica (contra o módulo-fonte real, via `tsx`):**

```
RESERVED_NAMES.has("__proto__")   = false
RESERVED_NAMES.has("constructor") = false
RESERVED_NAMES.has("prototype")   = false
RESERVED_NAMES.has("find")        = true

[before] typeof model.find = function
[__proto__] guard threw STATIC_COLLISION?  false
[after ] typeof model.find = undefined | typeof model.insert = undefined

[constructor] guard threw?  false | own constructor overwritten?  true
```

`ctx.static('__proto__', fn)` **não lança** `STATIC_COLLISION` — a atribuição substitui a cadeia de protótipos que carrega os métodos nativos, deixando `model.find`/`model.insert`/etc. como `undefined`. `ctx.static('constructor', fn)` também escapa e cria own-property sombreando `Model`.

**Interação com T-07-04 (fail-loud):** como o caminho `__proto__` **não lança**, `applyPlugins` não envolve nada em `PLUGIN_SETUP_FAILED` e a construção NÃO aborta — um model silenciosamente corrompido chega até `registerModel` e é registrado. É exatamente o oposto do "nunca sobrescreve silenciosamente" prometido, e é a classe de ataque (prototype pollution) que a lista `RESERVED_NAMES` existe para prevenir. Confirmado independentemente pelo code review (`07-REVIEW.md`, WR-01).

**Severidade:** high. Era bloqueante (block_on = high) — **resolvida** em `79bf050`; não conta mais para `threats_open`.

**Remediação aplicada (`79bf050`, via `/gsd-code-review 7 --fix`):**
1. ✅ Novo `FORBIDDEN_STATIC_KEYS = { '__proto__', 'constructor', 'prototype' }` verificado junto de `RESERVED_NAMES` em `registerPluginStatic` → lança `STATIC_COLLISION` ANTES de qualquer atribuição.
2. ✅ Atribuição trocada de `target[name] = fn` para `Object.defineProperty(target, name, { value: fn, writable: true, enumerable: true, configurable: true })` — nunca aciona setters herdados (defesa em profundidade contra chaves que escapem da guarda).
3. ✅ `plugins-static-collision.test.ts` cobre `ctx.static('__proto__'/'constructor'/'prototype', ...)` → `STATIC_COLLISION` e prova que `model.find`/`model.insert` sobrevivem. Suíte 209 → **214** verde, `tsc`/`eslint` limpos.

Re-auditado por reprodução dirigida + testes (ASVS L1). **Auditor não modifica arquivos de implementação; o fix foi aplicado pelo fluxo `code-review-fix`.**

---

## Open Threats (não-blocking — severidade abaixo de `high`)

Nenhuma.

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-07-01 | T-07-02 | `setup()` in-process é não-sandboxável — mesma classe de risco de qualquer dependência npm; a parte controlável (nunca expor schema/validator/allowedMethods vivos) está mitigada por `structuredClone` + cópia congelada no `PluginContext`. Escape hatch `this.getCollection()` é a mesma superfície pública já auditada na Fase 2. | Planner (07-02-PLAN / 07-04-PLAN, disposition accept) | 2026-07-15 |
| AR-07-02 | T-07-SC | Fase 07 não instala nenhuma dependência (D-02) — `package.json` inalterado; nenhuma superfície de supply-chain nova. | Planner (07-01..07-04-PLAN, disposition accept) | 2026-07-15 |

*Riscos aceitos não ressurgem em auditorias futuras.*

---

## Unregistered Flags

Nenhum. Nenhum SUMMARY da Fase 07 (`07-01`..`07-04`) contém seção `## Threat Flags`; nenhuma superfície de ataque nova apareceu na implementação sem mapeamento para um Threat ID do registro.

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-07-15 | 8 | 7 | 1 | gsd-security-auditor (ASVS L1) — mitigações verificadas por grep + testes (`plugins-*.test.ts`) + reprodução empírica do bypass T-07-01 (`tsx` contra `src/model/plugins.ts`). T-07-01 OPEN-blocking; corroborado por 07-REVIEW WR-01. |
| 2026-07-15 | 8 | 8 | 0 | Re-auditoria pós-fix (orquestrador, ASVS L1) — T-07-01 fechada por `79bf050` (`FORBIDDEN_STATIC_KEYS` + `Object.defineProperty`); novos testes em `plugins-static-collision.test.ts` provam `STATIC_COLLISION` para `__proto__`/`constructor`/`prototype` e sobrevivência de `find`/`insert`. Suíte 214/214. `threats_open: 0`. |

---

## Sign-Off

- [x] Toda ameaça tem disposição (mitigate / accept / transfer)
- [x] Riscos aceitos documentados no Accepted Risks Log
- [x] `threats_open: 0` — confirmado (T-07-01 fechada em `79bf050` e re-auditada)
- [x] `status: verified`

**Aprovação:** LIBERADA — 8/8 ameaças fechadas (6 mitigadas + 2 aceitas). T-07-01 mitigada, testada (214/214) e re-auditada.
