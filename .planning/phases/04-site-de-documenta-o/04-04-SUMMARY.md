---
phase: 04-site-de-documenta-o
plan: 04
subsystem: docs
tags: [diataxis, explanation, vitepress, docs]
dependency-graph:
  requires: ["04-01"]
  provides: ["Explanation quadrant (Diátaxis): thin-odm-philosophy, proxy-gating, server-side-validation"]
  affects: ["docs/.vitepress/config.mts (sidebar links, já apontava pros stubs)"]
tech-stack:
  added: []
  patterns: ["Diátaxis Explanation — conteúdo conceitual/porquê, sem passo-a-passo"]
key-files:
  created: []
  modified:
    - docs/explanation/thin-odm-philosophy.md
    - docs/explanation/proxy-gating.md
    - docs/explanation/server-side-validation.md
decisions: []
metrics:
  duration: "~25min"
  completed: 2026-07-08
status: complete
---

# Phase 04 Plan 04: Explanation quadrant (thin ODM, Proxy gating, server-side validation) Summary

Três explanations reais do quadrante Diátaxis "Explanation" — filosofia thin ODM, por que o gating de métodos é via Proxy, e por que a validação é `$jsonSchema` server-side — fundamentadas na arquitetura real de `src/database/index.ts` e `src/model/index.ts`.

## What Was Built

- **`docs/explanation/thin-odm-philosophy.md`** — articula o core value do Mongoat (produtividade de ODM sem abrir mão do controle/acesso nativo ao driver): o que "thin" significa na prática (mínimo de deps — só `mongodb`+`bson`; tipos/options nativos em todos os métodos; preferência por recursos nativos do driver), o escape hatch (`getCollection`/`getClient`/`getDb`) como cidadão de primeira classe, e um contraste conceitual com ODMs "thick" que escondem o driver — sem depreciar concorrentes.
- **`docs/explanation/proxy-gating.md`** — explica o mecanismo real: `KModelProxyHandler` (o `get` trap que checa `target.methods`/`target.allowedMethods` e lança `MongoatError` com `code: METHOD_NOT_ALLOWED`), o detalhe de design do binding sempre a `target` (nunca a `receiver`, para não reentrar o trap em chamadas internas — bug QUAL-01 corrigido na Fase 1), e o porquê da escolha por Proxy (checagem centralizada num único trap vs. duplicar guards em 12 métodos, ou subclasses por configuração).
- **`docs/explanation/server-side-validation.md`** — explica por que a validação roda no servidor MongoDB via `$jsonSchema` (fonte da verdade única, vale para qualquer client, não só os que passam pelo Mongoat), como `schemaValidatorBuilder` monta o validator (clone via `structuredClone`, injeção de `_id`, `additionalProperties: false` recursivo), como `setupValidators` aplica via `collMod`, e o trade-off explícito vs. validação client-side (fora de escopo do Mongoat).

Todas as três páginas cross-linkam entre si e para os how-tos relevantes (`escape-hatch`, `indexes-validation`, `handle-errors`) e para a Reference (`/api/`).

## Deviations from Plan

None - plan executado exatamente como escrito.

## Verification

- `npm run docs:build` verde após cada task (TypeDoc + VitePress build completo, 0 erros).
- Conteúdo revisado linha a linha contra `src/database/index.ts` (`KModelProxyHandler`, `registerModel`, `setupValidators`) e `src/model/index.ts` (`schemaValidatorBuilder`, `includeAdditionalPropertiesFalse`) — mecanismos descritos batem com o código real.
- `min_lines: 25` superado nas três páginas (84/100/102 linhas).
- `key_links` do plano conferidos: `proxy-gating.md` referencia `allowedMethods`/`Proxy`; `server-side-validation.md` referencia `$jsonSchema`.

## Self-Check: PASSED

- FOUND: docs/explanation/thin-odm-philosophy.md
- FOUND: docs/explanation/proxy-gating.md
- FOUND: docs/explanation/server-side-validation.md
- FOUND: 37975af (docs(04-04): explanation da filosofia thin ODM)
- FOUND: fa7c44a (docs(04-04): explanations de proxy-gating e server-side-validation)
