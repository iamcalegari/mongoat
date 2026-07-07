---
phase: 02
slug: sistema-de-hooks-completo-e-api-thin-nativa
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-07-07
---

# Phase 02 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4.1.10 (instalado na Fase 1) |
| **Config file** | `vitest.config.ts` (path aliases via vite-tsconfig-paths + resolve.tsconfigPaths) |
| **Quick run command** | `npx vitest run <arquivo>` (um arquivo de teste específico) |
| **Full suite command** | `npm test` (= `vitest run`) |
| **Estimated runtime** | ~8–12 segundos (sobe 1 container Mongo real via @testcontainers/mongodb, mongo:7) |

Backend de teste: MongoDB real em Docker via `test/setup/testcontainer.ts` (globalSetup) — expõe `MONGODB_URI` com `?directConnection=true`. Sem mocks do driver.

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run <arquivo-do-teste-da-task>`
- **After every plan wave:** Run `npm test`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** ~12 segundos

---

## Per-Task Verification Map

> Preenchido pelo planner/executor conforme as tasks forem definidas. Cada task que adiciona comportamento (hooks, escape hatch, options passthrough) precisa de um `<verify>` automatizado por teste vitest contra Mongo real.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| {a definir pelo planner} | — | — | HOOK-/API- | T-02-* / — | {comportamento} | unit/integration | `npx vitest run …` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] Infra vitest + testcontainers já existe (Fase 1) — não precisa reinstalar framework.
- [ ] Novos arquivos de teste por requisito (ordem de hooks, erro pre/post, fireAndForget→onHookError, guard de recursão, escape hatch total, options passthrough tipado) a criar pelo planner por wave/slice MVP.

*Infra existente cobre o framework; faltam apenas os arquivos de teste por requisito desta fase.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Tipos precisos de options/retorno (API-01/API-04) | API-01, API-04 | Correção de TIPOS é verificada em compile-time, não em runtime | `npx tsc --noEmit` deve passar; opcionalmente asserções de tipo (`expectTypeOf`/`tsd`-style) num teste dedicado |

*As demais behaviors de hooks/escape hatch têm verificação automatizada por vitest contra Mongo real.*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags (usar `vitest run`, nunca `vitest` watch em CI/verify)
- [ ] Feedback latency < 12s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
