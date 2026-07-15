---
phase: 07
slug: sistema-de-plugins
status: issues_found
# threats_open = count of OPEN threats at or above workflow.security_block_on severity (the blocking gate)
threats_open: 1
asvs_level: 1
created: 2026-07-15
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
| T-07-01 | Tampering | `registerPluginStatic` / `RESERVED_NAMES` (`src/model/plugins.ts:33-67`, `:140-165`) | high | mitigate | Colisão contra membros nomeados do `Model.prototype` (`find`, `getCollection`, `rawInsert`, ...) lança `STATIC_COLLISION` — verificado por grep e por `plugins-static-collision.test.ts`/`plugins-resolve.test.ts`. **PORÉM a guarda NÃO cobre `__proto__`/`constructor`/`prototype`** — bypass de prototype-pollution reproduzido empiricamente. | **open** |
| T-07-02 | Elevation of Privilege | `setup()` in-process / escape hatch `this.getCollection()` | high | accept | Parte controlável mitigada: `PluginContext` nunca expõe referência viva de schema/validator/allowedMethods — `buildPluginContext` entrega `structuredClone` + cópia congelada (`src/model/plugins.ts:182-199`; `src/types/plugin.ts:14-48`). Limitação in-process = mesma classe de qualquer dep npm; risco aceito e registrado. | closed |
| T-07-03 | Tampering / Info Disclosure | `buildPluginContext.schema` / `onHookError` | high/low | mitigate/accept | `ctx.schema = structuredClone(target.validator.$jsonSchema)` (`src/model/plugins.ts:185`) — mutar a cópia nunca alcança o validator; asserido em `plugins-resolve.test.ts:195-210` e `plugins-context-seal.test.ts`. `defaultOnHookError` loga só `err`, nunca `ctx` (`src/model/hooks.ts:19-21`). | closed |
| T-07-04 | Denial of Service (config) | model meio-configurado registrado após erro de plugin | high | mitigate | Fail-loud: `applyPlugins` roda ANTES de `registerModel` (`src/model/index.ts:583-587` → `:625`); um `setup()` que **lança** aborta `new Model(...)` com `PLUGIN_SETUP_FAILED`; `plugins-fail-loud.test.ts:72` prova `db.getModel(name) === undefined`. Ver ressalva em T-07-01 (o caminho `__proto__` NÃO lança, então NÃO dispara este fail-loud). | closed |
| T-07-05 | Tampering (state) | `Model.plugin()` chamado tarde → globais inconsistentes | high | mitigate | `Model.plugin()` verifica `kPluginsLocked` e lança `PLUGIN_REGISTERED_TOO_LATE` (`src/model/index.ts:1297-1308`); trava setada na 1ª construção incl. early-return de reuso (`:526`, `:615`); `plugins-global-lock.test.ts` cobre os dois caminhos + Pitfall 5. | closed |
| T-07-06 | Tampering (test isolation) | estado global vazando entre suites | low | mitigate | `Model[kResetPlugins]()` limpa lista + destrava (`src/model/index.ts:1323-1326`); Symbol `kResetPlugins` exportado de `@/model` (ausente do barrel `src/index.ts`); `plugins-reset.test.ts` verifica. | closed |
| T-07-07 | Tampering (type-safety) | consumidor tipando statics via `any`/cast | low | mitigate | Exemplo canônico `declare module '@/model' { interface Model ... }` (`examples/plugins/augmentation.ts:64-77`), `.paginate(1, 10)` sem `as`/`any` no call-site; `npx tsc --noEmit` sobre `examples/` guarda a regressão. | closed |
| T-07-SC | Tampering | instalação de pacotes npm | n/a | accept | Zero deps novas (D-02): `package.json` mantém apenas `bson`/`mongodb`; todos os 4 SUMMARY com `tech-stack.added: []`. Nenhum `npm install` a auditar. | closed |

*Status: open · closed · open — below high threshold (non-blocking)*
*Severity: critical > high > medium > low — apenas ameaças open com severidade ≥ `block_on` (high) contam para `threats_open`*
*Disposition: mitigate (implementação exigida) · accept (risco documentado) · transfer (terceiro)*

---

## Open Threats (blocking — severidade ≥ block_on `high`)

### T-07-01 — bypass de prototype-pollution em `registerPluginStatic` (high, mitigate → INADEQUADA)

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

**Severidade:** high. **Bloqueia** (block_on = high). Conta como `threats_open: 1`.

**Remediação exigida (implementação — fora do escopo deste auditor):**
1. Rejeitar explicitamente `__proto__`, `constructor`, `prototype` na guarda de `registerPluginStatic` (ex.: um `FORBIDDEN_KEYS` verificado junto de `RESERVED_NAMES`), lançando `STATIC_COLLISION`.
2. Trocar a atribuição por bracket por `Object.defineProperty(target, name, { value: fn, writable: true, enumerable: true, configurable: true })` para nunca acionar setters herdados.
3. Adicionar caso de teste em `plugins-static-collision.test.ts` cobrindo `ctx.static('__proto__', ...)` e `ctx.static('constructor', ...)` → `PLUGIN_SETUP_FAILED` com `.cause.code === 'STATIC_COLLISION'` e `model.find` intacto.

Aplicar via `/gsd-execute-phase` (ou fix dedicado) e re-rodar `/gsd-secure-phase`. **Auditor não modifica arquivos de implementação.**

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

---

## Sign-Off

- [x] Toda ameaça tem disposição (mitigate / accept / transfer)
- [x] Riscos aceitos documentados no Accepted Risks Log
- [ ] `threats_open: 0` — **NÃO** confirmado (`threats_open: 1`, T-07-01 bloqueia)
- [ ] `status: verified` — **NÃO** setado (`status: issues_found`)

**Aprovação:** BLOQUEADA — T-07-01 (high) precisa de mitigação implementada e re-auditoria antes de shippar.
