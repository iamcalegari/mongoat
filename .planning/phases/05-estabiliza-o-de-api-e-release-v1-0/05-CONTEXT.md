# Phase 5: Estabilização de API e release v1.0 - Context

**Gathered:** 2026-07-08
**Status:** Ready for planning

<domain>
## Phase Boundary

Auditar e estabilizar deliberadamente a API pública do core (Fases 1-4), montar um pipeline de release com changesets, publicar um Release Candidate, promover a **primeira versão estável no npm** com semver disciplinado, e deprecar as 34 versões alpha. Requisitos REL-01, REL-03, REL-04.

**Contexto de versionamento (decisivo):** o pacote `@iamcalegari/mongoat` tem 34 versões publicadas, todas `1.0.x-alpha` (dist-tag `latest` = `1.0.34-alpha`). Como `1.0.34-alpha` é um pre-release de `1.0.34`, um `1.0.0` "puro" seria numericamente MENOR — por isso a primeira estável sai como **1.1.0** (ver D-01).

**Fora do escopo:** features novas (decorators/plugins/migrations = Fases 6-8); mudar a arquitetura. Esta fase é release engineering + auditoria, não desenvolvimento de feature.

</domain>

<decisions>
## Implementation Decisions

- **D-01 — Primeira versão estável = `1.1.0` (REL-04)** — As 34 alphas são `1.0.x-alpha` (latest = `1.0.34-alpha`); `1.0.0` seria numericamente menor e exigiria forçar dist-tag + quem tem a alpha não atualizaria. Escolhido **`1.1.0`** (minor bump, `> 1.0.34-alpha`): o dist-tag `latest` atualiza naturalmente, usuários da alpha recebem o update, e o número reflete "primeira estável com features" (condiz com as breaking changes documentadas). **Consequência:** o `CHANGELOG.md`/`MIGRATION.md` (que hoje dizem "v1.0.0") e o goal/success-criteria do ROADMAP são atualizados para `1.1.0`. O "v1.0" do roadmap é o MARCO conceitual de estabilidade, materializado como npm `1.1.0`.
- **D-02 — Release Candidate antes da estável (REL-03)** — Publicar `1.1.0-rc.0` com dist-tag `rc` (NÃO `latest`). Validar o tarball: `are-the-types-wrong` + `publint` (já no `check:package`), smoke de import CJS **e** ESM, e o quick start do README compilando contra o pacote empacotado. Só então promover para `1.1.0` estável.
- **D-03 — Publicação: primeira gated, automatizada depois (REL-01)** — Pipeline **changesets**: changesets (`.changeset/*.md`) descrevem as mudanças; a Changesets Action abre um "Version Packages" PR (bump + CHANGELOG). A **primeira release (`1.1.0`) é publicada por disparo/aprovação explícita** do workflow de release no CI (o autor aperta o botão — publish é irreversível). Os releases seguintes (`1.1.x`, `1.2.0`…) publicam automaticamente no merge do Version PR.
- **D-04 — Supply-chain do publish (REL-01)** — O publish roda no **GitHub Actions com `npm publish --provenance`** (OIDC `id-token: write` atesta que o tarball veio deste repo/CI). `NPM_TOKEN` como **secret** do repo (automation/granular token, escopo mínimo de publish). `publishConfig.access: public` já existe. Workflow de release separado (não misturar com `ci.yml`/`docs.yml`).
- **D-05 — Deprecar as 34 alphas (REL-04)** — Após a estável no ar: `npm deprecate` das versões `1.0.x-alpha` (`< 1.1.0`) com mensagem apontando para a estável e o guia de migração: _"The 1.0.x-alpha line is discontinued — upgrade to the stable release. Migration guide: https://iamcalegari.github.io/mongoat/migration"_.
- **D-06 — Auditoria de API alpha→estável (REL-03)** — Antes do RC: revisar a superfície pública (barrel `src/index.ts`) e confirmar que as breaking changes documentadas (CHANGELOG/MIGRATION) estão completas e a API está coerente/congelável. **Resolver os `@deprecated` existentes** antes de congelar: `Database.defineModel` (src/database/index.ts:179) e `Model.create` (src/model/index.ts:423) — decidir remover (breaking, aceitável na primeira estável) ou manter documentado. Registrar o diff alpha→1.1.0.
- **D-07 — Política semver documentada (REL-04)** — Documentar a política de estabilidade da API pública (o que conta como breaking/minor/patch; que a superfície pública é o barrel `src/index.ts`; `@internal` fora do contrato). Publicar no site (Explanation ou página "Stability/Versioning") e referenciar no README/CONTRIBUTING.

### Claude's Discretion (delegadas)
- **Ferramenta:** `@changesets/cli` + config em `.changeset/config.json` (changelog via `@changesets/changelog-github` ou default). Workflow `.github/workflows/release.yml` usando `changesets/action`.
- **Reconciliar CHANGELOG:** o `CHANGELOG.md` manual atual (formato Keep a Changelog, seção `[Unreleased]`) vira o registro da `1.1.0`; do `1.1.0` em diante o changesets gerencia o CHANGELOG a partir dos changesets. Research/planner definem a mecânica exata (ex.: um changeset inicial consolidando as breaking changes).
- **Bump:** `package.json` version `1.0.34-alpha` → `1.1.0` via `changeset version` (não editar à mão).
- **RC dist-tag e promoção:** `changeset pre enter rc` (modo pre-release do changesets) ou publish manual do rc com `--tag rc`; a promoção move o `latest` para `1.1.0`.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requisitos e metas
- `.planning/REQUIREMENTS.md` — REL-01, REL-03, REL-04
- `.planning/ROADMAP.md` §"Phase 5" — goal e success criteria (atualizar "v1.0.0" → contexto 1.1.0)

### Estado do release
- `package.json` — version (`1.0.34-alpha` → `1.1.0`), `publishConfig`, `exports`, `files`, scripts (`check:package`)
- `CHANGELOG.md`, `MIGRATION.md` — histórico alpha→estável; atualizar menções "v1.0.0" → `1.1.0`
- `src/index.ts` — a superfície pública a auditar/congelar
- `src/database/index.ts:179`, `src/model/index.ts:423` — os `@deprecated` a resolver
- `.github/workflows/ci.yml`, `docs.yml` — o workflow de release é SEPARADO destes
- Site de migração no ar: `https://iamcalegari.github.io/mongoat/migration`

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `check:package` (npm pack --dry-run + publint + attw) já valida o tarball — reaproveitar no gate do RC/release.
- CI (`ci.yml`) com Node 20/22 + attw/publint verdes; build dual CJS/ESM (tsdown) validado — a base de qualidade para a release.
- CHANGELOG.md/MIGRATION.md já escritos (base das release notes e da auditoria de API).

### Established Patterns
- Deploy do site já usa GitHub Actions com OIDC (`docs.yml` — `id-token: write`) — o mesmo padrão OIDC serve ao provenance do publish.
- `@deprecated` já usado em 2 pontos — a auditoria decide o destino deles.

### Integration Points
- Novo `.github/workflows/release.yml` (changesets/action + provenance). Novo `.changeset/` dir + config. `NPM_TOKEN` secret. Bump de version. Atualização de CHANGELOG/MIGRATION/ROADMAP para 1.1.0. Nova página de política semver no site.

</code_context>

<specifics>
## Specific Ideas

- **A "v1.0" do roadmap = npm `1.1.0`** (o marco conceitual de primeira estável, materializado num número > 1.0.34-alpha). Toda menção a "v1.0.0" em docs/changelog é atualizada.
- Publish irreversível: a `1.1.0` é gated (disparo/aprovação humana do workflow); confirmar explicitamente com o autor antes do publish final.
- Provenance reaproveita o padrão OIDC já usado no `docs.yml`.

</specifics>

<deferred>
## Deferred Ideas

- Automação total de publish (sem gate) — só após a primeira estável validar o pipeline.
- Multi-dist-tag além de `latest`/`rc` (ex.: `next` para features pós-v1) — quando as Fases 6-8 introduzirem features.
- Release notes ricas por GitHub Releases (além do CHANGELOG) — nice-to-have, o changelog cobre o essencial.

</deferred>

---

*Phase: 5-Estabilização de API e release v1.0*
*Context gathered: 2026-07-08*
