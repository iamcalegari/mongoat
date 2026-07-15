---
phase: 07
slug: sistema-de-plugins
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-07-15
---

# Phase 07 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Derived from `07-RESEARCH.md` § Validation Architecture (Nyquist-driven).

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest ^4.1.10 |
| **Config file** | `vitest.config.ts` (existing) |
| **Quick run command** | `npx vitest run test/model/plugins-*.test.ts` |
| **Full suite command** | `npm test` (`vitest run` — inclui testcontainers/Docker) |
| **Estimated runtime** | ~3–5s (unit plugins-*) · full suite bound pelo startup do container MongoDB compartilhado |

*Nenhuma mudança de framework/tooling é necessária — `vitest`, `@testcontainers/mongodb` e o `globalSetup` (`test/setup/testcontainer.ts`) já cobrem 100% da infra requerida.*

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run test/model/plugins-*.test.ts`
- **After every plan wave:** Run `npm test` (suíte completa — inclui testcontainers/Docker)
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** ~5 segundos (unit plugins-*, sem I/O de rede)

---

## Per-Task Verification Map

> Task IDs / Plan / Wave são atribuídos pelo planner (TBD); o mapa abaixo fixa o contrato requisito → comportamento observável → comando automatizado (do RESEARCH § Validation Architecture). Todo comportamento tem verificação automatizada.

| Behavior | Plan/Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|----------|-----------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| `plugins[]` locais aplicados dentro do construtor, ANTES do wrap do Proxy (statics/hooks já presentes na 1ª construção; `ctx.static` acessa `this.getCollection()`) | TBD | PLUG-01 | — | N/A | unit | `npx vitest run test/model/plugins-application-order.test.ts` | ❌ W0 | ⬜ pending |
| Falha em `setup()` de plugin local aborta `new Model(...)` — model NUNCA é registrado (`Database.getModel(name)` → `undefined`) | TBD | PLUG-01 | V1 Architecture | Fail-loud; nenhum model meio-configurado registrado | unit | `npx vitest run test/model/plugins-fail-loud.test.ts` | ❌ W0 | ⬜ pending |
| `Model.plugin(g)` aplica ANTES dos `plugins[]` locais (ordem observável via spy) | TBD | PLUG-02 | — | N/A | unit | `npx vitest run test/model/plugins-order.test.ts` | ❌ W0 | ⬜ pending |
| `Model.plugin()` chamado APÓS o 1º `new Model(...)` (inclusive reuso de config idêntica) lança erro de ordem | TBD | PLUG-02 | — | Enforcement de ordem, fail-loud | unit | `npx vitest run test/model/plugins-global-lock.test.ts` | ❌ W0 | ⬜ pending |
| `Model[kResetPlugins]()` limpa lista global + flag de trava | TBD | PLUG-02 | — | Símbolo interno fora do barrel público | unit | `npx vitest run test/model/plugins-reset.test.ts` | ❌ W0 | ⬜ pending |
| `ctx.schema`/`ctx.allowedMethods` são cópias — mutar a cópia NUNCA afeta `model.validator`/`model.allowedMethods` reais | TBD | PLUG-03 | V4 Access Control | Selo read-only; referência viva nunca exposta | unit | `npx vitest run test/model/plugins-context-seal.test.ts` | ❌ W0 | ⬜ pending |
| `ctx.pre`/`ctx.post`/`ctx.static` são os ÚNICOS canais de efeito — sem via de mutar schema/validator/allowedMethods via `ctx` | TBD | PLUG-03 | V1 Architecture | Superfície de efeito restrita a 3 métodos | unit | `npx vitest run test/model/plugins-context-seal.test.ts` | ❌ W0 | ⬜ pending |
| Hooks executam na ordem `@Pre campo → @Pre classe → PLUGINS(global→local) → props.hooks → .pre()/.post()` | TBD | PLUG-02 (D-06/D-11) | — | N/A | unit | `npx vitest run test/model/plugins-order.test.ts` | ❌ W0 | ⬜ pending |
| Mesmo plugin (mesma ref) global+local aplica 1x (spy de `setup` 1 vez); nomes iguais/refs diferentes → `DUPLICATE_PLUGIN_NAME` | TBD | PLUG-01 (D-07) | — | Dedup por referência, colisão de nome fail-loud | unit | `npx vitest run test/model/plugins-dedup.test.ts` | ❌ W0 | ⬜ pending |
| Static colidindo com nativo (`find`, `getCollection`, privado `rawInsert`) → `STATIC_COLLISION`; dois plugins mesmo static → `STATIC_COLLISION` | TBD | PLUG-01 (D-08) | Tampering | Guarda contra o conjunto COMPLETO de nomes reservados; nunca sobrescreve silenciosamente | unit | `npx vitest run test/model/plugins-static-collision.test.ts` | ❌ W0 | ⬜ pending |
| Erro em `setup()` → `MongoatValidationError` code `PLUGIN_SETUP_FAILED`, `.cause` = erro original, mensagem inclui `name` do plugin | TBD | PLUG-01 (D-10) | V1 Architecture | Fail-loud; `.cause` preservado; sem vazamento | unit | `npx vitest run test/model/plugins-fail-loud.test.ts` | ❌ W0 | ⬜ pending |
| Static de plugin via instância Proxy-wrapped tem `this` bound (`this.getCollection()`/`this.find()` funcionam de dentro do static) | TBD | PLUG-01 (D-12) | — | N/A | integration (MongoDB real via testcontainers) | `npx vitest run test/model/plugins-static-binding.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `test/model/plugins-application-order.test.ts` — cobre PLUG-01 (aplicação antes do wrap)
- [ ] `test/model/plugins-fail-loud.test.ts` — cobre PLUG-01/D-10 (abort de construção)
- [ ] `test/model/plugins-order.test.ts` — cobre PLUG-02/D-06/D-11 (ordem completa: campo→classe→plugins→config→encadeado)
- [ ] `test/model/plugins-global-lock.test.ts` — cobre PLUG-02 (enforcement de ordem do `Model.plugin()`)
- [ ] `test/model/plugins-reset.test.ts` — cobre D-11 (`kResetPlugins`)
- [ ] `test/model/plugins-context-seal.test.ts` — cobre PLUG-03/D-03 (selo read-only)
- [ ] `test/model/plugins-dedup.test.ts` — cobre D-07 (dedup por referência + colisão de nome)
- [ ] `test/model/plugins-static-collision.test.ts` — cobre D-08 (nativo protegido + plugin↔plugin)
- [ ] `test/model/plugins-static-binding.test.ts` — cobre D-12 (bind via Proxy), integração real com MongoDB (`@testcontainers/mongodb`, já configurado em `test/setup/testcontainer.ts`)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Ergonomia do fallback D-09b (interface merging manual via `declare module`) — o consumidor escreve o augment corretamente e o `.paginate()` fica tipado | PLUG-01 (D-09) | Inferência-plena via `new Model({ plugins })` provada NÃO viável (TS1093 + tipo de `new` fixo); a DX de tipos é validada por `tsc`/exemplo, não por teste de runtime | Escrever exemplo em `examples/` com `declare module` augmentando o Model; rodar `npx tsc --noEmit` no exemplo e confirmar `.paginate()` resolve sem erro e sem anotação do consumidor no call-site |

*Runtime dos statics de plugin é coberto automaticamente (D-12); apenas a camada de TIPOS do fallback D-09b é verificação manual/`tsc`.*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
