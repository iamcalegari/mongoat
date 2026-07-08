# Phase 4: Site de documentação - Context

**Gathered:** 2026-07-08
**Status:** Ready for planning

<domain>
## Phase Boundary

Documentar o **core da v1.0** (o que as Fases 1-3 entregaram) e entrar na v1.0 bem documentada — ANTES do release (Fase 5). Entregas (DOCS-01..04): um site VitePress publicado, uma referência de API TypeDoc, um guia de migração alpha→v1.0, e o README renovado. Escrever a documentação também serve de auditoria da API pública antes de congelá-la.

Escopo do conteúdo = **core estável**: conexão/`Database`, `Model` e CRUD (insert/insertMany, find/findById/findMany, update/updateMany, delete/deleteMany, total, aggregate, bulkWrite), hooks pre/post, validação server-side `$jsonSchema`, segurança (`sanitizeFilter`/`$where`/hierarquia de erros `MongoatError`), e o escape hatch nativo (`getCollection`/`getClient`/`getDb`).

**Fora do escopo desta fase:** documentar decorators/plugins/migrations (Fases 6-8) — serão adicionados à doc quando cada feature sair; publicar a v1.0 (Fase 5).

</domain>

<decisions>
## Implementation Decisions

### D-01 — Hosting e deploy: GitHub Pages (DOCS-01)
- Site hospedado no **GitHub Pages**, com **deploy automático via GitHub Actions** a cada merge na `main` (workflow dedicado, ex.: `actions/deploy-pages` + build do VitePress).
- URL inicial: `iamcalegari.github.io/mongoat` (domínio próprio pode ser apontado depois, sem retrabalho). Adicionar `homepage` no `package.json` apontando para o site.
- Zero serviço/conta externa nova (respeita minimalismo).

### D-02 — Estrutura: Diátaxis ESTRITO (DOCS-01)
- Organização nos **4 quadrantes formais do Diátaxis**:
  - **Tutorials** — aprendizado guiado, orientado a iniciante (ex.: "Do zero ao primeiro model: connect → definir schema → CRUD"). Inclui o quick start.
  - **How-to guides** — tarefas específicas (ex.: registrar hooks pre/post; sanitizar filtros não-confiáveis com `sanitizeFilter`; tratar erros por `instanceof`/`code`; usar o escape hatch nativo; definir índices/validação).
  - **Reference** — a API pública gerada por TypeDoc (D-04).
  - **Explanation** — conceitos/design (ex.: filosofia "thin ODM"; por que Proxy gating; validação server-side via `$jsonSchema`; modelo de erros sanitizados).
- Fora dos 4 quadrantes, duas páginas de navegação: **Home/landing** e o **guia de migração** alpha→v1.0 (DOCS-03).

### D-03 — README enxuto + link pro site (DOCS-04)
- README = quick start funcional + badges + features em bullets + seção "**Full documentation → {site}**". A **fonte da verdade é o site**; o README não duplica os guias (evita drift).
- Remover o disclaimer "🚧 work in progress" e o badge/versão só é corrigido se necessário (badge dinâmico shields.io já reflete o npm).

### D-04 — Referência de API: TypeDoc integrado ao VitePress (DOCS-02)
- **`typedoc-plugin-markdown`** gera a referência como páginas markdown **dentro do VitePress** — um site só, navegação e busca unificadas. Gerada do código + JSDoc.
- Cobrir **só a API pública exportada do barrel raiz** (`src/index.ts`): `Database`, `Model`, `MongoatError` + subclasses, `toObjectId`, `sanitizeFilter`, `METHODS`, tipos públicos.

### Claude's Discretion (delegadas — escolhas abaixo, ajustáveis no planejamento)
- **Idioma:** inglês em todo o site/README (consistência com README/CHANGELOG/MIGRATION já em inglês; público npm internacional). Comunicação interna/planning segue em pt.
- **Ferramentas:** VitePress (última estável) + TypeDoc + `typedoc-plugin-markdown`, como devDeps. Busca = local search built-in do VitePress (minisearch, sem Algolia/serviço externo).
- **Guia de migração (DOCS-03):** consolidar `CHANGELOG.md`/`MIGRATION.md` (raiz, já criados) numa página do site; os arquivos raiz permanecem como fonte editável.
- **Estrutura de diretórios:** `docs/` na raiz com a config do VitePress; exemplos de código dos guias reaproveitam/estendem `examples/`.
- **Versionamento da doc:** só v1.0 por ora (sem multi-version); adicionar versionamento se/quando necessário.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requisitos e metas da fase
- `.planning/REQUIREMENTS.md` — DOCS-01, DOCS-02, DOCS-03, DOCS-04
- `.planning/ROADMAP.md` §"Phase 4: Site de documentação" — goal e success criteria

### Conteúdo a documentar (fonte da verdade do que existe)
- `src/index.ts` — barrel raiz: a superfície pública exata a documentar (Reference)
- `src/database/index.ts`, `src/model/index.ts`, `src/errors/index.ts`, `src/utils/` — comportamento a explicar nos guias
- `examples/connection.ts`, `examples/model/model.ts` — exemplos existentes a reaproveitar
- `CHANGELOG.md`, `MIGRATION.md` — base do guia de migração (DOCS-03)
- `README.md` — o work-in-progress atual a ser renovado (DOCS-04)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `CHANGELOG.md` + `MIGRATION.md` (raiz): já escritos, alimentam o guia de migração.
- `examples/` (connection.ts, model/model.ts): exemplos de código a estender nos tutorials/how-to.
- JSDoc `@public`/`@private` já presente em `src/` (Database/Model): alimenta o TypeDoc; onde faltar, completar durante a fase.
- Build dual + `exports` map da Fase 1: o TypeDoc/exemplos referenciam a API pública real.

### Established Patterns
- Nenhuma infra de docs hoje (sem `docs/`, sem VitePress/TypeDoc instalados, sem `homepage` no package.json) — fase é greenfield para documentação.
- CI GitHub Actions já existe (`.github/workflows/ci.yml`) — o deploy do site será um workflow SEPARADO (não misturar com o CI de teste).

### Integration Points
- `docs/` novo na raiz (VitePress). `homepage` novo no package.json. Novo workflow `.github/workflows/docs.yml` (ou similar) para GitHub Pages. Novas devDeps (vitepress, typedoc, typedoc-plugin-markdown).
- README renovado aponta para o site.

</code_context>

<specifics>
## Specific Ideas

- **Diátaxis estrito** foi escolha explícita do autor (não a versão "lite") — seguir os 4 quadrantes formais.
- Documentar o guia de migração reaproveitando os `CHANGELOG.md`/`MIGRATION.md` já criados nesta milestone.
- O deploy é separado do CI de teste (workflow próprio para Pages).

</specifics>

<canonical_refs_note>
Docs cobrem o core da v1.0; decorators/plugins/migrations (Fases 6-8) serão documentados incrementalmente quando cada um sair.
</canonical_refs_note>

<deferred>
## Deferred Ideas

- **Versionamento multi-versão da doc** (dropdown de versões) — só quando houver breaking entre majors; v1.0 não precisa.
- **Busca via Algolia DocSearch** — local search built-in do VitePress basta por ora.
- **Domínio próprio** (ex.: mongoat.dev) — apontar para o Pages quando/se o autor quiser.
- **Documentar decorators/plugins/migrations** — Fases 6-8 (quando as features saírem).

</deferred>

---

*Phase: 4-Site de documentação*
*Context gathered: 2026-07-08*
