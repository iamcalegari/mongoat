# Mongoat

## What This Is

Mongoat é um ODM (Object Document Mapper) leve, rápido e type-safe para MongoDB em Node.js/TypeScript, publicado no npm como `@iamcalegari/mongoat`. Oferece uma API moderna sobre o driver oficial sem escondê-lo: models com CRUD completo, validação server-side por JSON Schema, hooks de transformação e controle de métodos permitidos via Proxy — para desenvolvedores que querem produtividade de ODM mantendo controle total do MongoDB nativo.

## Core Value

Ser um ODM fino e extensível: produtividade de ODM sem abrir mão do controle e do acesso direto ao driver nativo do MongoDB.

## Requirements

### Validated

<!-- Capacidades existentes, inferidas do código e do mapa em .planning/codebase/ -->

- ✓ Conexão gerenciada com MongoDB (config via objeto ou env vars; `serverApi` v1 strict em produção) — existing
- ✓ CRUD completo no Model: insert/insertMany, find/findById/findMany, update/updateMany, delete/deleteMany, total, aggregate, bulkWrite — existing
- ✓ Hooks `pre` por método para transformação de documentos — existing
- ✓ Validação server-side via `$jsonSchema` (collMod) com `additionalProperties: false` recursivo — existing
- ✓ Setup automático de collections, validators e índices (`setupCollections`) — existing
- ✓ Transações via `withTransaction` — existing
- ✓ Gating de métodos permitidos por model via Proxy — existing
- ✓ Registro global de models com reuso (singleton por collection) — existing
- ✓ Defaults de documento aplicados em inserções (`documentDefaults`) — existing
- ✓ Bugs conhecidos de `.planning/codebase/CONCERNS.md` corrigidos (pre-hooks aguardados em `insertMany`, Proxy binding, tipo de `find()`, registro atômico, schema sem mutação) + 2 bugs extras descobertos e corrigidos — Validated in Phase 1
- ✓ Build dual CJS/ESM via tsdown com `exports` map validado por are-the-types-wrong + publint; `json-schema` removida do runtime — Validated in Phase 1
- ✓ Infra de testes vitest + testcontainers (MongoDB real em Docker), 20 testes de regressão/smoke — Validated in Phase 1
- ✓ Hooks pre/post completos (múltiplos handlers, ordem de registro, semântica de erro assimétrica, fireAndForget, guard de recursão) — Validated in Phase 2
- ✓ API thin nativa: options do driver repassadas em todos os métodos + escape hatch (`getCollection`/`getClient`/`getDb`) com retornos tipados — Validated in Phase 2
- ✓ Suíte unit+integração (12 métodos, erro + concorrência) com coverage gate e CI GitHub Actions (matriz Node 20/22) — Validated in Phase 3
- ✓ Hardening: `sanitizeFilter`, `$where` rejeitado, `toObjectId` fail-loud, erros sanitizados, `setupIndexes` incremental — Validated in Phase 3
- ✓ Site de documentação VitePress + TypeDoc publicado (Diátaxis: tutorial, how-tos, explanation) + README renovado + guia de migração — Validated in Phase 4
- ✓ Primeira versão estável publicada: npm **1.1.0** em `latest` com provenance (SLSA/OIDC), RC validado por smoke CJS+ESM, política semver publicada, 34 alphas deprecadas por versão exata — Validated in Phase 5
- ✓ Pipeline de release automatizado com changesets + `release.yml` gated (Environment npm-publish com required reviewer) — Validated in Phase 5
- ✓ API de schema com decorators TC39 padrão (`@Schema`/`@Prop` + açúcares, `@Pre`/`@Post`, `Schema.compile`, Model aceita classe decorada) coexistindo com a API de objetos, sem `reflect-metadata` nem flags experimentais — Validated in Phase 6 (verificação 14/14 após gap closure 06-05)

### Active

<!-- Escopo atual. Hipóteses até serem entregues e validadas. -->

- [ ] Sistema de plugins/middleware para estender Models — `plugins[]` por model e `Model.plugin()` global com contrato selado (Fase 7)
- [ ] Migrations versionadas (schema + dados, up/down, estado rastreado, CLI `mongoat migrate`) (Fase 8)

### Out of Scope

<!-- Limites explícitos. Inclui razão para evitar re-adição. -->

- Suporte a outros bancos além do MongoDB — o foco é ser um ODM Mongo-first, fino sobre o driver oficial
- Recursos de aplicação (auth, cache, filas, HTTP) — é uma biblioteca de dados, não um framework
- (demais exclusões serão definidas na etapa de requisitos)

## Context

- Brownfield: codebase pequeno (~1k linhas em `src/`), mapeado em `.planning/codebase/` (7 documentos, 2026-07-03)
- `src/schema/index.ts` contém apenas um rascunho comentado da API de decorators — é a direção desejada pelo autor
- Fases 1–6 completas (2026-07-07 → 2026-07-14): core sem bugs conhecidos, hooks pre/post + API thin, blindagem/testes/CI, site de docs, **release estável 1.1.0** e API de decorators TC39 (`src/schema/`, 168 testes) — próxima feature aditiva: plugins (Fase 7)
- Publicado no npm como `@iamcalegari/mongoat@1.1.0` (`latest`, provenance SLSA); linha `1.0.x-alpha` deprecada no registry; RCs saem no dist-tag `rc`
- Releases via changesets + `release.yml` gated (aprovação humana no Environment `npm-publish`); zero-clique adiado até o release.yml ganhar gate de testes (WR-05 de `05-REVIEW.md`)
- Follow-ups advisory de `05-REVIEW.md` (0 críticos, 6 warnings): LICENSE ausente no tarball, actions não pinadas por SHA, `ModelSetup` órfão no barrel, `isSameConfig` ignora hooks
- `CONCERNS.md` lista bugs conhecidos, riscos de segurança (`toObjectId` sem validação, stringify de erros expondo detalhes, filtros sem sanitização), áreas frágeis (registry estático sem thread-safety, casts sem null-check, mutação de schema em `includeAdditionalPropertiesFalse`) e lacunas (`CUSTOM_VALIDATION.UNIQUE` nunca implementado)
- Dependências de runtime mínimas: `bson`, `json-schema` (0.4.0, antigo — avaliar remoção/substituição na pesquisa), `mongodb` v7

## Constraints

- **Arquitetura**: manter a arquitetura atual baseada em Proxy (gating de métodos e registro de models) — decisão do autor
- **Dependências**: mínimo possível de dependências de runtime; preferir recursos nativos do driver oficial
- **Segurança**: seguir as boas práticas de segurança e desenvolvimento recomendadas pelo MongoDB (validação server-side, credenciais via env vars, `serverApi` strict em produção, queries injection-safe)
- **Compatibilidade**: Node `^20.19.0 || >=22.12.0`; driver `mongodb` v7; TypeScript 5.x
- **Distribuição**: pacote npm público — mudanças de API exigem versionamento semântico disciplinado

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Decorators: substituir ou coexistir com a API de objetos | Definido no roadmap: **coexistir** como cidadãs de primeira classe (Fase 6, TC39 standard, sem reflect-metadata) | ✓ Good |
| Documentação em site dedicado (VitePress/Docusaurus ou similar) | Profissionalizar a lib para a v1.0 | ✓ Good — VitePress + TypeDoc no ar (Fase 4) |
| Primeira estável é npm 1.1.0 (não 1.0.0) | Alphas eram 1.0.x-alpha; 1.0.0 seria numericamente menor no semver | ✓ Good |
| Writes no registry (publish/deprecate) só via CI gated | Conta exige 2FA; token bypass-2FA vive só no CI, atrás de Environment com required reviewer | ✓ Good |
| Manter arquitetura de Proxy | Já validada no uso atual; base do gating e da extensibilidade | ✓ Good |
| Mínimo de dependências de runtime | Lib leve, menos superfície de risco e de manutenção | ✓ Good |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-07-14 after Phase 6 completion (decorators TC39, gap closure 06-05, verificação 14/14)*
