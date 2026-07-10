---
phase: 5
slug: estabiliza-o-de-api-e-release-v1-0
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-07-08
---

# Phase 5 — Validation Strategy

> Fase de **release engineering** — a validação é predominantemente de **infraestrutura/CLI** (changesets, publish, deprecate), não de código testável por unit tests. A rede de segurança é o **RC validado antes de promover** + a suíte/`check:package` já verdes + smoke real do tarball publicado.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.1.10 (existente) para regressão; validação de release = CLI/smoke |
| **Quick run** | `npm run lint && npm run typecheck && npm test` |
| **Full gate** | `npm run build && npm run check:package && npm test -- --coverage` |
| **Release smoke** | `npm install @iamcalegari/mongoat@rc` + import CJS **e** ESM contra o tarball publicado |

---

## Sampling Rate

- **Per task commit:** `npm run lint && npm run typecheck && npm test`
- **Per wave:** `npm run build && npm run check:package && npm test -- --coverage`
- **Phase gate:** suíte + `check:package` verdes + **smoke real do RC publicado** (CJS+ESM) ANTES de promover a `1.1.0` estável

---

## Per-Requirement Verification Map

| Req | Behavior | Test Type | Command | File |
|-----|----------|-----------|---------|------|
| REL-01 | Pipeline changesets publica no merge do Version PR | CI/manual | 1ª execução real do `release.yml` (gated) | ❌ W0 (infra) |
| REL-03 | RC `1.1.0-rc.0` instala e importa (CJS+ESM) | smoke | `npm i @iamcalegari/mongoat@rc` + import nos dois formatos | ❌ W0 (script) |
| REL-04 | `npm deprecate` marca as 34 alphas | smoke pós-exec | `npm view @...@<versão> deprecated` (amostra) | ❌ W0 (mutação irreversível) |
| D-06 | Barrel não exporta mais `defineModel`/`Model.create` (se removidos) | unit (regressão) | `npm test` (atualizar `test/database/proxy-binding.test.ts`, `test/model/registry-config.test.ts`) | ✅ existem — atualizar/remover |

---

## Wave 0 Requirements

- [ ] `NPM_TOKEN` criado como secret do repo (automation/granular, escopo mínimo de publish) — **bloqueia o publish** até existir
- [ ] Nenhum arquivo de teste NOVO necessário (release é infra CLI/CI)
- [ ] Se D-06 remover `defineModel`/`Model.create`: atualizar/remover os 2 testes que os exercitam
- [ ] Dry-run real de `changeset version` (branch descartável) confirmando `1.0.34-alpha` → `1.1.0` antes de confiar na mecânica

---

## Manual-Only / Irreversible Verifications

| Behavior | Why Manual | Instructions |
|----------|------------|--------------|
| Publish da `1.1.0` (GATED, irreversível) | Aprovação humana explícita (D-03); npm publish é irreversível | Autor aprova o GitHub Environment / dispara o workflow; confirmar `npm view @...@1.1.0` + dist-tag `latest` |
| `npm deprecate` das 34 alphas | Mutação irreversível no registry | Loop de versão EXATA (não range — Open Question 2); amostrar `deprecated` depois |
| Provenance da publicação | Só observável no registry pós-publish | Confirmar badge/atestação de proveniência na página do npm |

---

## Validation Sign-Off

- [ ] Suíte + check:package verdes
- [ ] `NPM_TOKEN` presente
- [ ] RC publicado e smoke-testado (CJS+ESM) antes da estável
- [ ] Publish da 1.1.0 aprovado explicitamente pelo autor
- [ ] `nyquist_compliant: true` set

**Approval:** pending
