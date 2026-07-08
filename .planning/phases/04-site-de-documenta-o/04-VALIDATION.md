---
phase: 4
slug: site-de-documenta-o
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-07-08
---

# Phase 4 — Validation Strategy

> Per-phase validation contract. Esta é uma fase de **conteúdo/build estático** (documentação): a validação é predominantemente **build-smoke** (o build da VitePress falha em link interno quebrado / markdown inválido) + **revisão manual** dos quadrantes e da Reference. Não há unit tests tradicionais.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | VitePress build (smoke) + revisão manual; vitest existente não muda nesta fase |
| **Config file** | `docs/.vitepress/config.mts` (novo), `typedoc.json` (novo) |
| **Quick run command** | `npm run docs:build` (falha rápido = link quebrado / markdown inválido / typedoc falhou) |
| **Full suite command** | `npm run docs:build && npm run docs:preview` (revisão visual) |
| **Estimated runtime** | ~10-30s (build) |

---

## Sampling Rate

- **After every task commit:** `npm run docs:build` (a build da VitePress já valida links internos)
- **After every wave:** `npm run docs:build && npm run docs:preview` + revisão visual dos 4 quadrantes + Reference
- **Phase gate:** build verde localmente **e** deploy verde no Actions (`docs.yml`) no GitHub Pages
- **Max feedback latency:** ~30s (build local)

---

## Per-Task Verification Map

| Requirement | Behavior | Test Type | Automated Command | File Exists |
|-------------|----------|-----------|-------------------|-------------|
| DOCS-01 | Site VitePress builda sem erro; cobre os 4 quadrantes Diátaxis + Home + Migration | build/smoke | `npm run docs:build` | ❌ W0 |
| DOCS-02 | Reference TypeDoc cobre só o barrel `src/index.ts`, sem símbolos internos (`excludeProtected: true`) | smoke + review | `npm run predocs:build` (typedoc) + inspeção de `docs/api/**` | ❌ W0 |
| DOCS-03 | Página de migração presente e linkada na nav (consolida CHANGELOG/MIGRATION) | build/smoke + review | link `/migration` resolve no build | ❌ W0 |
| DOCS-04 | README sem "work in progress", quick start funcional que compila | manual + smoke | `npx tsx examples/model/usage.ts` (Mongo local) | ✅ base em `examples/` |

*Status: ⬜ pending · ✅ green · ❌ red*

---

## Wave 0 Requirements

- [ ] devDeps instaladas: `vitepress`, `typedoc` (pinar `^0.28.19` p/ evitar flag "too-new" do 0.28.20), `typedoc-plugin-markdown`, `typedoc-vitepress-theme` (versões confirmadas no RESEARCH)
- [ ] `docs/.vitepress/config.mts` (com `base: '/mongoat/'`, nav/sidebar Diátaxis, local search)
- [ ] `typedoc.json` na raiz (`entryPoints: ["src/index.ts"]`, `excludeProtected: true`, plugin markdown + theme, `docsRoot: "./docs"`)
- [ ] Scripts `docs:dev`/`docs:build`/`docs:preview` (+ `predocs:*` rodando typedoc) no `package.json`
- [ ] `.github/workflows/docs.yml` (deploy Pages — separado do `ci.yml`)

*Existing infra (lib build, vitest) não muda; Wave 0 é a montagem do stack de docs.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Conteúdo dos 4 quadrantes está correto e útil | DOCS-01 | Qualidade editorial não é automatizável | Revisar cada quadrante no `docs:preview` |
| Reference não vaza internos e cobre a API pública | DOCS-02 | Julgamento sobre superfície pública | Inspecionar `docs/api/**` (sem `kClient`/protected) |
| Deploy real verde no GitHub Pages | DOCS-01 | Só observável pós-push no Actions | Confirmar run do `docs.yml` verde + site acessível na URL Pages |

---

## Validation Sign-Off

- [ ] Todos os requisitos têm build-smoke ou verificação manual definida
- [ ] Wave 0 monta o stack de docs
- [ ] `npm run docs:build` verde localmente
- [ ] Deploy `docs.yml` verde no Pages
- [ ] `nyquist_compliant: true` set (após Wave 0)

**Approval:** pending
