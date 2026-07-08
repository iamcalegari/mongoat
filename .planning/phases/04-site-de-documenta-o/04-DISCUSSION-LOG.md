# Phase 4: Site de documentação - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-08
**Phase:** 4-Site de documentação
**Areas discussed:** Hosting/deploy, Estrutura do conteúdo, Escopo do README, Referência de API (TypeDoc) — todas as 4 selecionadas.

---

## Hosting/deploy

| Option | Description | Selected |
|--------|-------------|----------|
| GitHub Pages | Grátis, repo já no GitHub; deploy via Actions no merge | ✓ |
| Vercel/Netlify | Preview por PR, edge CDN; exige serviço externo | |
| Domínio próprio | mongoat.dev apontando p/ Pages/Vercel (depois) | |

**User's choice:** GitHub Pages → D-01.

## Estrutura do conteúdo

| Option | Description | Selected |
|--------|-------------|----------|
| Diátaxis-lite | Getting Started → guias por tópico → API → Migration | |
| Diátaxis estrito | 4 seções formais (Tutorials/How-to/Reference/Explanation) | ✓ |
| Linear simples | Sequência única de páginas | |

**User's choice:** Diátaxis estrito → D-02.

## Escopo do README

| Option | Description | Selected |
|--------|-------------|----------|
| Enxuto + link pro site | Quick start + badges + features + link; fonte da verdade = site | ✓ |
| README completo | Tudo no README (duplica o site, drift) | |

**User's choice:** Enxuto + link → D-03.

## Referência de API (TypeDoc)

| Option | Description | Selected |
|--------|-------------|----------|
| TypeDoc integrado ao VitePress | typedoc-plugin-markdown, um site só | ✓ |
| Site TypeDoc HTML separado | Dois sites, busca separada | |

**User's choice:** TypeDoc integrado → D-04.

---

## Claude's Discretion

- Idioma inglês em todo o site/README (consistência com README/CHANGELOG/MIGRATION).
- VitePress + TypeDoc + typedoc-plugin-markdown como devDeps; busca local built-in (sem Algolia).
- Guia de migração consolida CHANGELOG.md/MIGRATION.md; `docs/` na raiz; só v1.0 (sem multi-version).

## Deferred Ideas

- Versionamento multi-versão da doc; Algolia DocSearch; domínio próprio; documentar decorators/plugins/migrations (Fases 6-8).
