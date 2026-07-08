# Phase 5: Estabilização de API e release v1.0 - Discussion Log

> **Audit trail only.** Do not use as input to planning/research/execution agents.
> Decisions are captured in CONTEXT.md.

**Date:** 2026-07-08
**Phase:** 5-Estabilização de API e release v1.0
**Areas discussed:** Número da versão, Publicação (auto vs manual), RC + deprecação, Supply-chain — todas as 4 selecionadas.

---

## Número da versão estável

| Option | Description | Selected |
|--------|-------------|----------|
| 1.0.0 + forçar dist-tag | Semântica limpa, mas < 1.0.34-alpha; exige dist-tag forçado; alpha não atualiza | |
| 2.0.0 | > alpha, mas começar em 2.0.0 sem v1 prévia é estranho | |
| 1.0.35 ou 1.1.0 | > 1.0.34-alpha; latest atualiza naturalmente | ✓ (opção) |

**Sub-decisão (1.0.35 vs 1.1.0):**

| Option | Description | Selected |
|--------|-------------|----------|
| 1.1.0 (minor) | Sinaliza primeira estável com features; número limpo p/ série 1.x | ✓ |
| 1.0.35 (patch) | Continuação da sequência; '35' arbitrário; 'patch' subestima | |

**User's choice:** **1.1.0** → D-01.

## Publicação: auto vs manual

| Option | Description | Selected |
|--------|-------------|----------|
| Primeira gated + auto depois | 1.1.0 publicada com disparo/aprovação explícita; próximos via changesets Action | ✓ |
| Automação total desde já | changesets publica no merge, incluindo 1.1.0 | |

**User's choice:** Primeira gated + auto depois → D-03.

## RC + deprecar alphas

| Option | Description | Selected |
|--------|-------------|----------|
| RC (dist-tag rc) + deprecar tudo | 1.1.0-rc.0 validado antes de promover; deprecar as 34 alphas | ✓ |
| Direto p/ estável, sem RC | Pular o RC | |

**User's choice:** RC + deprecar tudo → D-02, D-05.

## Supply-chain do publish

| Option | Description | Selected |
|--------|-------------|----------|
| Provenance via CI + automation token | `--provenance` (OIDC) + NPM_TOKEN secret | ✓ |
| Simples (token, sem provenance) | Só NPM_TOKEN | |

**User's choice:** Provenance via CI + automation token → D-04.

---

## Claude's Discretion

- `@changesets/cli` + `.changeset/config.json`; `.github/workflows/release.yml` (changesets/action).
- Reconciliar CHANGELOG.md manual com o changesets (D-03 discretion); bump via `changeset version`; RC via `changeset pre enter rc`.
- Auditoria (D-06) resolve os 2 `@deprecated` (defineModel, Model.create); política semver documentada (D-07).

## Deferred Ideas

- Automação total de publish (pós-primeira estável); dist-tag `next`; GitHub Releases ricas.
