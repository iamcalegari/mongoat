---
phase: 5
slug: estabiliza-o-de-api-e-release-v1-0
status: validated
nyquist_compliant: true
wave_0_complete: true
created: 2026-07-08
validated: 2026-07-14
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
| **Release smoke** | `node scripts/smoke-rc.mjs` — instala `@iamcalegari/mongoat@rc` em tmpdir real + import CJS **e** ESM contra o tarball publicado |

---

## Sampling Rate

- **Per task commit:** `npm run lint && npm run typecheck && npm test`
- **Per wave:** `npm run build && npm run check:package && npm test -- --coverage`
- **Phase gate:** suíte + `check:package` verdes + **smoke real do RC publicado** (CJS+ESM) ANTES de promover a `1.1.0` estável

---

## Per-Requirement Verification Map

| Req | Behavior | Test Type | Command | File | Status |
|-----|----------|-----------|---------|------|--------|
| REL-01 | Pipeline changesets publica no merge do Version PR | CI/manual | Execução real do `release.yml` (gated) | manual-only (infra) | ✅ EXECUTADO — RC `1.1.0-rc.0` e estável `1.1.0` publicados via `release.yml` gated com provenance (05-VERIFICATION truths 5/6/10) |
| REL-03 | RC `1.1.0-rc.0` instala e importa (CJS+ESM) | smoke automatizado | `node scripts/smoke-rc.mjs` | `scripts/smoke-rc.mjs` | ✅ COVERED — script repetível; reexecutado na verificação contra o tarball real (`CJS OK` + `ESM OK` + `PASS`) |
| REL-04 | `npm deprecate` marca as 34 alphas | dry-run automatizável + verificação pós-exec | `DRY_RUN=1 node scripts/deprecate-alphas.mjs` (imprime exatamente 34 comandos por versão exata) | `scripts/deprecate-alphas.mjs` | ✅ EXECUTADO — varredura COMPLETA do packument: 34/34 alphas com `deprecated`, 0 não-alpha tocada (05-VERIFICATION truth 7) |
| D-06 | Barrel não exporta mais `defineModel`/`Model.create` | unit (regressão) | `npm test` + `npm run typecheck` | suíte existente (testes que os exercitavam atualizados/removidos no 05-01) | ✅ COVERED — `grep` em `test/` e `src/` → 0 referências; typecheck limpo (re-conferido 2026-07-14); suíte 122/122 na verificação, 168/168 no gate mais recente |

---

## Wave 0 Requirements

- [x] `NPM_TOKEN` criado como secret do repo (automation/granular, escopo mínimo de publish) — evidência: os 2 publishes reais via CI só são possíveis com o secret presente (runs aprovados no Environment `npm-publish`)
- [x] Nenhum arquivo de teste NOVO necessário (release é infra CLI/CI) — confirmado no audit: nenhum gap automatizável
- [x] D-06: os 2 testes que exercitavam `defineModel`/`Model.create` atualizados/removidos (05-01; `grep` em `test/` → 0 referências)
- [x] Mecânica de bump `1.0.34-alpha` → `1.1.0` confirmada na prática: `changeset pre exit` + `changeset version` (commit `2d8f5d2`), `version === 1.1.0` verificado antes do publish

---

## Manual-Only / Irreversible Verifications

Todas executadas e verificadas independentemente em `05-VERIFICATION.md` (passed 10/10, evidência contra o registry ao vivo):

| Behavior | Why Manual | Instructions | Outcome |
|----------|------------|--------------|---------|
| Publish da `1.1.0` (GATED, irreversível) | Aprovação humana explícita (D-03); npm publish é irreversível | Autor aprova o GitHub Environment / dispara o workflow; confirmar `npm view @...@1.1.0` + dist-tag `latest` | ✅ `latest=1.1.0` no registry; aprovação humana real nos 2 publishes |
| `npm deprecate` das 34 alphas | Mutação irreversível no registry | Loop de versão EXATA (não range); varrer `deprecated` depois | ✅ 34/34 deprecadas, 0 não-alpha tocada (varredura completa do packument via workflow gated) |
| Provenance da publicação | Só observável no registry pós-publish | Confirmar atestação de proveniência na página do npm | ✅ packument: `dist.attestations.provenance.predicateType = https://slsa.dev/provenance/v1` |

---

## Validation Sign-Off

- [x] Suíte + check:package verdes (122/122 na verificação; 168/168 no gate pós-Fase 6; typecheck re-conferido 2026-07-14)
- [x] `NPM_TOKEN` presente (publishes reais executados)
- [x] RC publicado e smoke-testado (CJS+ESM) antes da estável (`scripts/smoke-rc.mjs` PASS contra tarball real)
- [x] Publish da 1.1.0 aprovado explicitamente pelo autor (Environment `npm-publish` com required reviewer)
- [x] `nyquist_compliant: true` set

**Approval:** validated 2026-07-14

---

## Validation Audit 2026-07-14

| Metric | Count |
|--------|-------|
| Gaps found | 0 |
| Resolved | 0 |
| Escalated | 0 |

Audit State A (VALIDATION.md de plan-time atualizado pós-execução): os 4 itens do mapa foram cruzados com `05-VERIFICATION.md` (passed 10/10, evidência independente contra registry/CI reais) e com o estado atual do repo (`scripts/smoke-rc.mjs` e `scripts/deprecate-alphas.mjs` presentes e repetíveis; `grep` confirma barrel/testes sem APIs removidas; typecheck limpo). REL-01 e a mutação do REL-04 permanecem manual-only por natureza (writes irreversíveis no registry, gate humano deliberado — D-03/D-05), com execução já realizada e evidenciada. Nenhum teste novo necessário.
