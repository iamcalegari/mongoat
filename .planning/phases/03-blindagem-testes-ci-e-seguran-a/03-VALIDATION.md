---
phase: 3
slug: blindagem-testes-ci-e-seguran-a
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-07-07
---

# Phase 3 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4.1.10 (instalado) + `@vitest/coverage-v8` 4.1.10 |
| **Config file** | `vitest.config.ts` (existe; Wave 0 adiciona bloco `test.coverage` com thresholds — D-10) |
| **Quick run command** | `npx vitest run <arquivo-do-teste-novo>` (~5-10s com cold start do container) |
| **Full suite command** | `npm test` (= `vitest run`; sobe/derruba `mongo:7` via globalSetup) |
| **Estimated runtime** | ~8-15s (inclui boot do testcontainer) |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run <arquivo do teste novo>`
- **After every plan wave:** Run `npm test` (suíte completa)
- **Before `/gsd-verify-work`:** `npm run lint && npm run typecheck && npm run build && npx vitest run --coverage && npm run check:package` verde localmente
- **Max feedback latency:** ~15 segundos

---

## Per-Task Verification Map

> Preenchido após o planejamento criar os PLAN.md (Task IDs). Mapa de requisito→teste já derivado do RESEARCH.md §Validation Architecture:

| Requirement | Secure Behavior | Test Type | Automated Command | File Exists |
|-------------|-----------------|-----------|-------------------|-------------|
| SEC-01 | `$where` rejeitado incondicionalmente em todo método com filter, em qualquer profundidade | unit+integração | `npx vitest run test/model/where-rejection.test.ts` | ❌ W0 |
| SEC-01 | `sanitizeFilter` neutraliza `$where`/`$function`/`$accumulator`/`$expr+$function`, preserva `$gt`/`$in`/`$and`/`$or` | unit | `npx vitest run test/model/sanitize-filter.test.ts` | ❌ W0 |
| SEC-02 | `toObjectId`/`findById` lança `MongoatValidationError` (`INVALID_OBJECT_ID`) p/ string malformada, `undefined`, número, array | unit+integração | `npx vitest run test/model/object-id-validation.test.ts` | ❌ W0 |
| SEC-03 | Erro do driver → `MongoatDriverError` com `.cause` preservado, `.code` mapeado, `.message` sem stack | integração | `npx vitest run test/model/error-hierarchy.test.ts` | ❌ W0 |
| SEC-04 | `setupIndexes()` chamado 2x não dropa índice não-gerenciado nem recria índice idêntico | integração | `npx vitest run test/database/setup-indexes-regression.test.ts` | ❌ W0 |
| QUAL-02 | 12 métodos de `Model` + Database com happy+erro; concorrência (registro + CRUD paralelo) | unit+integração | `npm test` | Parcial |
| QUAL-03 | lint/typecheck/build/test/check:package verdes no CI em push+PR | CI | `.github/workflows/ci.yml` | ❌ W0 |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `eslint.config.js` reescrito como flat config funcional (ESLint 9) — hoje quebrado, bloqueia `npm run lint` (Pitfall 1 do RESEARCH)
- [ ] Script `"lint": "eslint ."` no `package.json`
- [ ] Script de coverage (`vitest run --coverage`) disponível ao CI
- [ ] `vitest.config.ts` — bloco `test.coverage` (`provider: 'v8'`, `thresholds: { lines: 80, functions: 80, statements: 80, branches: 70 }`) — ponto de partida D-10
- [ ] `test/model/where-rejection.test.ts`, `test/model/sanitize-filter.test.ts`, `test/model/object-id-validation.test.ts`, `test/model/error-hierarchy.test.ts`, `test/database/setup-indexes-regression.test.ts` — todos novos
- [ ] Framework install: nenhum — `vitest`/`@vitest/coverage-v8`/`testcontainers` já instalados; só `@eslint/js` (nova devDep, auditada `[OK]`)

*Existing infrastructure covers the runtime; Wave 0 é sobre habilitar lint + coverage gates e os stubs de teste.*

---

## Manual-Only Verifications

*All phase behaviors have automated verification — infra/foundation phase (lib de dados, sem UI). O CI em push/PR (QUAL-03) só é observável no GitHub após o merge, mas é validável localmente rodando a mesma sequência de comandos.*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
