---
phase: 5
slug: estabiliza-o-de-api-e-release-v1-0
status: verified
# threats_open = count of OPEN threats at or above workflow.security_block_on severity (the blocking gate)
threats_open: 0
asvs_level: 1
created: 2026-07-13
---

# Phase 5 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| código-fonte → tarball publicado | O barrel `src/index.ts` vira contrato público congelado na 1.1.0 | Código público (sem segredos) |
| laptop → GitHub Actions | Código/segredos cruzam para o runner de CI que publica | `NPM_TOKEN` (secret, bypass-2FA), código |
| GitHub Actions → registry npm | Tarball atestado (provenance) e mutações de deprecação cruzam para o registry público | Tarball assinado, comandos `npm deprecate` |
| laptop do autor → registry npm | Tentativa original de `npm deprecate` local — **abandonada**: writes migraram para o CI gated | (nenhum write local; token local sem bypass-2FA é inócuo para writes) |

---

## Threat Register

Registro consolidado dos `<threat_model>` dos 5 planos (IDs repetidos entre planos deduplicados; verificação com evidência de execução real — release executada e verificada 10/10 em `05-VERIFICATION.md`).

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T-05-01 | Tampering | Superfície pública (barrel) | medium | mitigate | Auditoria manual do barrel guiada por CHANGELOG/MIGRATION antes do congelamento; `defineModel`/`Model.create` removidos deliberadamente (grep + typecheck + suíte verdes, confirmado pelo verifier) | closed |
| T-05-02 | Information Disclosure | CHANGELOG/MIGRATION/página semver | low | accept | Docs de release públicas por design; nenhum segredo introduzido | closed (accepted) |
| T-05-03 | Information Disclosure | `NPM_TOKEN` em log/workflow | high | mitigate | Token granular como secret do repo, referenciado só via `secrets.*` em `env:` (nunca em `run:`/echo — verificado em `release.yml` e `deprecate-alphas.yml`); `release.yml` só em push:main; `deprecate-alphas.yml` só workflow_dispatch + Environment gate | closed |
| T-05-04 | Elevation of Privilege | Provenance/OIDC | medium | mitigate | `id-token: write` + `NPM_CONFIG_PROVENANCE: true` (Sigstore/OIDC gerenciado pelo npm, não hand-rolled); atestação SLSA v1 confirmada viva no registry para a 1.1.0 | closed |
| T-05-05 | Tampering | Publish acidental / branch não confiável / dist-tag errado | high | mitigate | `release.yml` restrito a push:main + Environment `npm-publish` com required reviewer (aprovação humana real nos 2 publishes); pós-publish verificado: RC ficou em `rc`, `latest` só moveu na estável | closed |
| T-05-SC | Tampering | Supply chain (@changesets/cli, changesets/action) | medium | mitigate | Legitimacy audit no research (ambos OK); action pinada `@v1` na org oficial `changesets/` conforme o plano. Hardening adicional (pin por SHA) registrado como follow-up WR-06 em `05-REVIEW.md` — além do escopo da mitigação planejada | closed |
| T-05-06 | Tampering | Publish do RC (irreversível por versão) | medium | mitigate | RC no dist-tag `rc` (não `latest`), superseedable; publish só via CI gated com provenance; smoke CJS+ESM validou o tarball real antes da promoção | closed |
| T-05-07 | Tampering | Bump rc→estável | low | mitigate | Bump via `changeset pre exit` + `changeset version` (commit 2d8f5d2), nunca manual; `version === 1.1.0` verificado antes do publish | closed |
| T-05-08 | Tampering | Deprecação silenciosa (range não casa prereleases) | high | mitigate | `scripts/deprecate-alphas.mjs` itera por versão EXATA sobre `npm view versions --json`; verify do plano proíbe range; pós-execução: varredura COMPLETA do packument = 34/34 alphas deprecadas, 0 não-alpha tocada (mais forte que a amostra planejada) | closed |
| T-05-09 | Repudiation | Deprecação irreversível no registry | medium | accept | Mutação aceita e desejada (D-05); dry-run auditável antes (34 comandos) + varredura completa depois; execução via Environment gate com aprovação humana explícita | closed (accepted) |

*Status: open · closed · open — below high threshold (non-blocking)*
*Severity: critical > high > medium > low — only open threats at or above workflow.security_block_on count toward threats_open*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-05-01 | T-05-02 | Documentação de release (CHANGELOG/MIGRATION/política semver) é pública por design; nenhum segredo trafega nesses artefatos | Autor (disposition de plan-time, 05-01/05-04 PLAN) | 2026-07-13 |
| AR-05-02 | T-05-09 | A deprecação das 34 alphas é uma mutação irreversível desejada (D-05); risco de escopo errado reduzido por dry-run prévio + varredura completa posterior + gate humano no Environment | Autor (disposition de plan-time, 05-05 PLAN; execução aprovada pelo autor no run 29232155429) | 2026-07-13 |

*Accepted risks do not resurface in future audit runs.*

---

## Residual Notes (não-bloqueantes)

- **Escopo do token**: a granularidade/escopo mínimo do `NPM_TOKEN` (só `@iamcalegari/mongoat`, read-write) é configuração do lado npmjs.com, não verificável a partir do repo — confiança no user_setup do 05-02. Rotação recomendada se houver suspeita (houve exposição de um token em chat em 2026-07-10, sessão S343 — token distinto do atual, mas rotação periódica é boa prática).
- **Follow-ups de hardening** em `05-REVIEW.md` (advisory): SHA-pinning das actions (WR-06); gate de testes no `release.yml` antes do publish — pré-requisito recomendado antes de remover o required reviewer para releases zero-clique (WR-05).

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-07-13 | 10 | 10 | 0 | /gsd-secure-phase (orquestrador, short-circuit L1: register de plan-time + threats_open 0 + evidência de execução real e verificação independente 10/10) |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-07-13
