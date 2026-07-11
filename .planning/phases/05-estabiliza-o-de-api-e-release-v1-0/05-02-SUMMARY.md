---
plan: 05-02
title: "Pipeline changesets + release.yml (provenance/OIDC + Environment gate)"
status: complete
requirements: [REL-01]
completed: 2026-07-11
---

# Plano 05-02 — Summary

> Finalizado pelo coordenador após o executor ser cortado pelo limite de sessão (5h) logo antes do commit da Task 1. O trabalho parcial (changesets instalado + config) foi verificado e completado (release.yml + gate).

## O que foi entregue (REL-01, D-03, D-04)

**Task 1 — Changesets (`9387df3`):**
- `@changesets/cli@2.31.0` como devDependency (versão exata auditada no research — verdict OK, sem checkpoint de supply-chain bloqueante).
- `.changeset/config.json`: **`changelog: false`** (preserva o `CHANGELOG.md` mantido à mão — não deixa o `changeset version` sobrescrever a curadoria Keep-a-Changelog), `commit: false`, `access: "public"`, `baseBranch: "main"`.
- Script `release` = `changeset publish` no `package.json`. **`version` não editada** — continua `1.0.34-alpha` (o bump é do `changeset version`, nas Waves 3/4).

**Task 2 — `release.yml` (`2c732b0`):**
- Workflow **SEPARADO** do `ci.yml`/`docs.yml` (D-04); dispara só em `push` para `main`.
- `permissions: contents/pull-requests write + id-token: write` (OIDC p/ provenance, reaproveitando o padrão do `docs.yml`).
- Job `release` com `environment: npm-publish` (gate humano de required reviewer — D-03), steps checkout(fetch-depth 0) → setup-node 22.x → `npm ci` → `npm run build` → `npm run check:package` → `changesets/action@v1` (`publish: npm run release`).
- Env: `NPM_TOKEN`/`NODE_AUTH_TOKEN` de `secrets.NPM_TOKEN`, `NPM_CONFIG_PROVENANCE: true`. `NPM_TOKEN` nunca em `run:`/log.

## Pré-requisitos do usuário (user_setup) — CONFIRMADOS

- ✅ `NPM_TOKEN` secret do repo (criado pelo autor; o token exposto no chat foi revogado e substituído).
- ✅ Environment `npm-publish` com o autor como required reviewer.

## Verificação

- Config checks: `changelog:false`/`access:public`/`baseBranch:main` OK; `release` script OK; version intacta.
- `release.yml`: YAML válido, `environment: npm-publish`, `id-token: write`, `changesets/action@v1`, `NPM_CONFIG_PROVENANCE` presente.
- Gate local: `lint`/`typecheck`/`build`/`test`/`check:package` **todos verdes**. **Nada publicado** (este plano só monta o pipeline).

## Próximo

Wave 2 = **05-03 (RC `1.1.0-rc.0`)** — dry-run do bump, changeset consolidado, pre-mode, smoke CJS+ESM; **checkpoint humano** para o publish gated do RC.
