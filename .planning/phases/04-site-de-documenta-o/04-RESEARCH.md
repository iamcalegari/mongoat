# Phase 4: Site de documentação - Research

**Researched:** 2026-07-08
**Domain:** VitePress + TypeDoc (typedoc-plugin-markdown/typedoc-vitepress-theme) + GitHub Pages Actions + Diátaxis
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**D-01 — Hosting e deploy: GitHub Pages (DOCS-01)**
Site hospedado no GitHub Pages, com deploy automático via GitHub Actions a cada merge na `main` (workflow dedicado, ex.: `actions/deploy-pages` + build do VitePress). URL inicial: `iamcalegari.github.io/mongoat` (domínio próprio pode ser apontado depois, sem retrabalho). Adicionar `homepage` no `package.json` apontando para o site. Zero serviço/conta externa nova (respeita minimalismo).

**D-02 — Estrutura: Diátaxis ESTRITO (DOCS-01)**
Organização nos 4 quadrantes formais do Diátaxis: Tutorials (aprendizado guiado, orientado a iniciante — inclui o quick start), How-to guides (tarefas específicas: hooks pre/post, `sanitizeFilter`, tratar erros por `instanceof`/`code`, escape hatch nativo, índices/validação), Reference (API pública gerada por TypeDoc, D-04), Explanation (conceitos/design: filosofia "thin ODM", Proxy gating, validação server-side `$jsonSchema`, modelo de erros sanitizados). Fora dos 4 quadrantes: Home/landing e guia de migração alpha→v1.0 (DOCS-03).

**D-03 — README enxuto + link pro site (DOCS-04)**
README = quick start funcional + badges + features em bullets + seção "Full documentation → {site}". Fonte da verdade é o site; README não duplica os guias (evita drift). Remover o disclaimer "🚧 work in progress"; badge dinâmico shields.io já reflete o npm (correção só se necessário).

**D-04 — Referência de API: TypeDoc integrado ao VitePress (DOCS-02)**
`typedoc-plugin-markdown` gera a referência como páginas markdown dentro do VitePress — um site só, navegação e busca unificadas. Gerada do código + JSDoc. Cobrir só a API pública exportada do barrel raiz (`src/index.ts`): `Database`, `Model`, `MongoatError` + subclasses, `toObjectId`, `sanitizeFilter`, `METHODS`, tipos públicos.

### Claude's Discretion

- **Idioma:** inglês em todo o site/README (consistência com README/CHANGELOG/MIGRATION já em inglês; público npm internacional). Comunicação interna/planning segue em pt.
- **Ferramentas:** VitePress (última estável) + TypeDoc + `typedoc-plugin-markdown`, como devDeps. Busca = local search built-in do VitePress (minisearch, sem Algolia/serviço externo).
- **Guia de migração (DOCS-03):** consolidar `CHANGELOG.md`/`MIGRATION.md` (raiz, já criados) numa página do site; os arquivos raiz permanecem como fonte editável.
- **Estrutura de diretórios:** `docs/` na raiz com a config do VitePress; exemplos de código dos guias reaproveitam/estendem `examples/`.
- **Versionamento da doc:** só v1.0 por ora (sem multi-version); adicionar versionamento se/quando necessário.

### Deferred Ideas (OUT OF SCOPE)

- **Versionamento multi-versão da doc** (dropdown de versões) — só quando houver breaking entre majors; v1.0 não precisa.
- **Busca via Algolia DocSearch** — local search built-in do VitePress basta por ora.
- **Domínio próprio** (ex.: mongoat.dev) — apontar para o Pages quando/se o autor quiser.
- **Documentar decorators/plugins/migrations** — Fases 6-8 (quando as features saírem).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-------------------|
| DOCS-01 | Site VitePress publicado com quick start e guias do core da v1.0 (conexão/models, CRUD, hooks pre/post, validação `$jsonSchema`, segurança, escape hatch); decorators/plugins/migrations são documentados quando saem (Fases 6-8) | `## Standard Stack` (VitePress 1.6.4), `## Architecture Patterns` (estrutura de diretórios + Diátaxis), `## Common Pitfalls` (Pitfall 2: `base` config) |
| DOCS-02 | Referência de API gerada por TypeDoc (`typedoc-plugin-markdown`) integrada ao site | `## Standard Stack` (typedoc/typedoc-plugin-markdown/typedoc-vitepress-theme, versões verificadas), `## Architecture Patterns` (Pattern 1 e 2: `docsRoot`, sidebar), `## Common Pitfalls` (Pitfall 1: `excludeProtected`, Pitfall 3: ordem de scripts, Pitfall 4: versões cruzadas) |
| DOCS-03 | Guia de migração alpha→v1.0 documentando todas as mudanças de API (consolida `CHANGELOG.md`/`MIGRATION.md`) | Conteúdo-fonte já lido (`CHANGELOG.md`, `MIGRATION.md`) — consolidar em `docs/migration.md`, linkado fora dos 4 quadrantes (D-02) |
| DOCS-04 | README renovado com quick start funcional, apontando para o site (sem o disclaimer "work in progress") | `README.md` atual lido (disclaimer na linha 14 a remover); `## Sources`/pesquisa de boas práticas de README npm |
</phase_requirements>

## Summary

O site é 100% greenfield (`docs/` inexistente, nenhuma devDep de docs instalada, sem `homepage`). As decisões D-01..D-04 já fixam a stack e o hosting; a pesquisa aqui existe para acertar as **versões exatas**, o **fluxo canônico de integração** TypeDoc→VitePress e o **workflow de deploy** oficial — os três pontos onde uma fase de docs greenfield mais costuma tropeçar (versões incompatíveis, `base` errado quebrando assets no Pages, e membros `protected`/Symbol vazando na Reference).

Confirmei no registry npm as versões atuais: **vitepress@1.6.4**, **typedoc@0.28.20**, **typedoc-plugin-markdown@4.12.0**, **typedoc-vitepress-theme@1.1.3**. Encontrei o repositório de exemplo oficial do próprio mantenedor do plugin (`typedoc2md/typedoc-vitepress-theme-example`) com `package.json`/`typedoc.json`/`.vitepress/config.mts` reais — isso dá um template de configuração verificado, não hipotético. Também recuperei o markdown-fonte oficial do guia de deploy da VitePress (`vitepress.dev/guide/deploy`, seção GitHub Pages), que contém o workflow Actions completo e testado pelos próprios mantenedores.

Duas descobertas de código mudam o plano: (1) `Database` usa `protected [kClient]` etc. — TypeDoc **inclui `protected` por padrão** (`excludeProtected` é `false` por padrão), então sem configuração explícita esses campos Symbol internos vazariam na Reference pública, contrariando D-04 ("só a API pública do barrel"); (2) como `docs/` (raiz do VitePress) e `src/index.ts` (entryPoint do TypeDoc) vivem em diretórios diferentes da mesma raiz do repo, o TypeDoc precisa rodar a partir da raiz do repo mas escrever a saída dentro de `docs/`, exigindo a opção `docsRoot: './docs'` do `typedoc-vitepress-theme` — sem isso a sidebar gerada aponta para caminhos errados.

**Primary recommendation:** VitePress 1.x + TypeDoc 0.28.x + typedoc-plugin-markdown 4.x + typedoc-vitepress-theme 1.x, `docs/` na raiz, `typedoc.json` na raiz do repo com `entryPoints: ["src/index.ts"]`, `out: "docs/api"`, `docsRoot: "./docs"` e `excludeProtected: true`; deploy via o workflow oficial `actions/configure-pages` + `upload-pages-artifact` + `deploy-pages` em `.github/workflows/docs.yml`, separado do `ci.yml`; `base: '/mongoat/'` no config VitePress.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Conteúdo Diátaxis (Tutorials/How-to/Explanation) | Static/CDN (VitePress build) | — | Markdown estático servido pelo GitHub Pages; nenhuma lógica de servidor |
| Referência de API (Reference) | Build-time tooling (TypeDoc) | Static/CDN | Gerada em build a partir do código-fonte (`src/index.ts`); consumida como markdown estático pelo VitePress |
| Busca | Browser/Client (VitePress local search, minisearch) | — | Índice gerado no build, executado inteiramente no client, sem serviço externo (Algolia descartado por decisão) |
| Deploy/publicação | CI/CD (GitHub Actions) | CDN (GitHub Pages) | Build + upload de artefato + publicação automática no merge da `main`, workflow dedicado separado do CI de testes |
| README | Repositório (fonte estática, npm registry) | — | Renderizado pelo GitHub/npmjs.com; não faz parte do pipeline de build do site |

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `vitepress` | 1.6.4 [VERIFIED: npm registry] | Static site generator (Vue-powered), tema padrão + busca local built-in | Ferramenta oficial do ecossistema Vue para docs, mínima config, markdown-first — combina com "mínimo de dependências" do CLAUDE.md |
| `typedoc` | 0.28.20 [VERIFIED: npm registry — nota abaixo] | Extrai a API pública do TS e gera o modelo de documentação | Ferramenta padrão de facto para gerar referência de API TS a partir de JSDoc; já usada como base pelos dois plugins abaixo |
| `typedoc-plugin-markdown` | 4.12.0 [VERIFIED: npm registry + docs oficiais] | Plugin do TypeDoc que emite markdown em vez do HTML tema-padrão do TypeDoc | É o único caminho canônico e mantido para "TypeDoc dentro de outro SSG" (D-04) |
| `typedoc-vitepress-theme` | 1.1.3 [VERIFIED: npm registry + docs oficiais] | Preset de markdown VitePress-friendly (front-matter, links) + gera `typedoc-sidebar.json` | Complementa o `typedoc-plugin-markdown` especificamente para VitePress — mantido pela mesma org (`typedoc2md`) |

**Nota sobre `typedoc@0.28.20`:** o `package-legitimacy check` (seam) devolveu `SUS` — motivo único: `too-new` (release patch publicado há 3 dias, 2026-07-05). Confirmado via `npm view typedoc time`: é a release nº ~90 de uma linha contínua desde 2024 (0.26.x → 0.28.x), pacote `TypeStrong/TypeDoc`, **3.876.608 downloads/semana**. Isto é um falso positivo do heurístico "too-new" sobre um pacote maduro — mas o protocolo exige tratar como `SUS` mesmo assim. Ver `## Package Legitimacy Audit`.

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `actions/checkout` | v5 | Clona o repo no runner | Todo workflow de CI/CD |
| `actions/setup-node` | v6 | Instala Node no runner | Antes de `npm ci` |
| `actions/cache` | v4 | Cacheia `docs/.vitepress/cache` | Acelera builds subsequentes (opcional, não bloqueante) |
| `actions/configure-pages` | v4 | Detecta config do GitHub Pages do repo | Necessário antes do upload do artefato |
| `actions/upload-pages-artifact` | v3 | Empacota `docs/.vitepress/dist` como artefato Pages | Passo de build |
| `actions/deploy-pages` | v4 | Publica o artefato no GitHub Pages | Job de deploy, separado do job de build |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `typedoc-plugin-markdown` + `typedoc-vitepress-theme` | TypeDoc HTML padrão em subpasta separada (iframe/link externo) | Dois sites/navegações distintos — direto contra D-04 ("um site só") |
| `typedoc-plugin-markdown` + `typedoc-vitepress-theme` | `vitepress-plugin-typedoc` (integração via plugin Vite, gera em dev-time) | Projeto com atividade e adoção bem menores; a combinação `typedoc-plugin-markdown`+`typedoc-vitepress-theme` é a documentada oficialmente pelo próprio typedoc-plugin-markdown como "plugin de tema VitePress" |
| VitePress local search | Algolia DocSearch | Decisão travada (Deferred) — exigiria conta externa, contra minimalismo |

**Installation:**
```bash
npm install -D vitepress typedoc typedoc-plugin-markdown typedoc-vitepress-theme
```

**Version verification:** confirmado via `npm view <pkg> version` em 2026-07-08 (ver tabela acima). `typedoc@0.28.20` publicado 2026-07-05; demais publicados entre 2025-08 (vitepress) e 2026-06-02 (typedoc-plugin-markdown/typedoc-vitepress-theme, mesma data — release conjunta dos dois pacotes irmãos, esperado).

## Package Legitimacy Audit

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| `vitepress` | npm | pacote maduro (vuejs org); última release 2025-08-05 | 601.969/semana | `github.com/vuejs/vitepress` | OK | Aprovado |
| `typedoc` | npm | maduro (TypeStrong org, desde 2015); release atual 2026-07-05 | 3.876.608/semana | `github.com/TypeStrong/TypeDoc` | **SUS** (`too-new`) | Flagged — planner deve inserir `checkpoint:human-verify` antes do install; ver nota de mitigação abaixo |
| `typedoc-plugin-markdown` | npm | maduro (typedoc2md org); release atual 2026-06-02 | 2.231.034/semana | `github.com/typedoc2md/typedoc-plugin-markdown` | OK | Aprovado |
| `typedoc-vitepress-theme` | npm | maduro (mesma org/monorepo); release atual 2026-06-02 | 30.991/semana | `github.com/typedoc2md/typedoc-plugin-markdown` (monorepo) | OK | Aprovado |

**Packages removed due to `[SLOP]` verdict:** none.
**Packages flagged as suspicious `[SUS]`:** `typedoc` — motivo é exclusivamente o sinal `too-new` (patch release de 3 dias), não downloads/repo/idade do pacote em si (que são todos fortes). **Mitigação recomendada ao planner:** ou (a) adicionar `checkpoint:human-verify` antes de `npm install typedoc` conforme o protocolo, ou (b) pinar `typedoc@^0.28.19` (release anterior, de 2026-04-12, ~3 meses de idade) para sair do território "too-new" sem perder compatibilidade — `0.28.19` também está na faixa suportada pelo `typedoc-plugin-markdown@4.12.0`. Nenhum `postinstall` script suspeito encontrado em nenhum dos 4 pacotes (`npm view <pkg> scripts.postinstall` vazio para todos).

*Todos os 4 nomes de pacote já vinham travados por D-04/Discretion no CONTEXT.md (não descobertos via WebSearch nesta sessão) — confirmados contra o registry npm e a documentação oficial (`vitepress.dev`, `typedoc-plugin-markdown.org`), portanto tratados como `[VERIFIED]` e não `[ASSUMED]`.*

## Architecture Patterns

### System Architecture Diagram

```
                    ┌─────────────────────────────┐
                    │  src/index.ts (barrel)      │
                    │  + JSDoc @public/@private   │
                    └──────────────┬──────────────┘
                                   │ entryPoints
                                   ▼
                    ┌─────────────────────────────┐
                    │  typedoc.json (raiz repo)   │
                    │  plugin: [typedoc-plugin-   │
                    │  markdown, typedoc-         │
                    │  vitepress-theme]           │
                    │  out: docs/api              │
                    │  docsRoot: ./docs           │
                    │  excludeProtected: true     │
                    └──────────────┬──────────────┘
                                   │ npm run predocs (typedoc)
                                   ▼
          ┌────────────────────────────────────────────┐
          │  docs/api/*.md + docs/api/typedoc-         │
          │  sidebar.json                    (gerado)  │
          └───────────────────┬────────────────────────┘
                               │ import (config.mts)
                               ▼
     ┌──────────────────────────────────────────────────────────┐
     │  docs/  (VitePress project root)                         │
     │  ┌────────────┐ ┌───────────┐ ┌───────────┐ ┌──────────┐ │
     │  │ tutorials/ │ │ how-to/   │ │ api/      │ │explanation││
     │  │(escrito à  │ │(escrito à │ │(GERADO —  │ │(escrito à │ │
     │  │ mão)       │ │ mão)      │ │ não editar)│ │mão)      │ │
     │  └────────────┘ └───────────┘ └───────────┘ └──────────┘ │
     │  + index.md (Home) + migration.md                         │
     │  .vitepress/config.mts → nav + sidebar (4 quadrantes)     │
     └───────────────────────────┬────────────────────────────────┘
                                  │ npm run docs:build
                                  ▼
                    ┌─────────────────────────────┐
                    │  docs/.vitepress/dist/       │
                    │  (HTML+JS+CSS estático)      │
                    └──────────────┬──────────────┘
                                   │ upload-pages-artifact
                                   ▼
          ┌────────────────────────────────────────────┐
          │  .github/workflows/docs.yml (push → main)  │
          │  configure-pages → build → upload → deploy │
          └───────────────────┬────────────────────────┘
                               │ deploy-pages
                               ▼
                 https://iamcalegari.github.io/mongoat/
```

### Recommended Project Structure
```
docs/
├── .vitepress/
│   └── config.mts          # nav + sidebar (4 quadrantes) + base + search
├── api/                     # GERADO pelo TypeDoc — não editar à mão, git-ignorado ou commitado (ver Open Question)
├── tutorials/
│   └── getting-started.md  # quick start guiado: connect → schema → CRUD
├── how-to/
│   ├── hooks.md             # registrar pre/post
│   ├── sanitize-filters.md  # sanitizeFilter em input não-confiável
│   ├── handle-errors.md     # instanceof/.code
│   ├── escape-hatch.md      # getCollection/getClient/getDb
│   └── indexes-validation.md
├── explanation/
│   ├── thin-odm-philosophy.md
│   ├── proxy-gating.md
│   └── server-side-validation.md
├── migration.md             # consolida CHANGELOG.md/MIGRATION.md da raiz
└── index.md                 # Home/landing
typedoc.json                 # raiz do repo — entryPoints: ["src/index.ts"]
.github/workflows/
├── ci.yml                   # já existe — testes/lint/build
└── docs.yml                 # NOVO — build+deploy do site (D-01)
```

### Pattern 1: TypeDoc rodando de fora do root do VitePress (`docsRoot`)
**What:** `typedoc.json` fica na raiz do repo (ao lado de `tsconfig.json`, para resolver `@/*` corretamente), mas o VitePress vive em `docs/`. A opção `docsRoot` do `typedoc-vitepress-theme` (default `"./"`) precisa apontar para `"./docs"` para a sidebar/links gerados serem relativos à raiz correta do site.
**When to use:** sempre que `typedoc.json`/`entryPoints` não estiverem dentro do próprio diretório do VitePress — que é exatamente o caso do Mongoat (`entryPoints: ["src/index.ts"]` na raiz, `docs/` como projeto VitePress).
**Example:**
```jsonc
// typedoc.json (raiz do repo)
{
  "entryPoints": ["src/index.ts"],
  "out": "docs/api",
  "docsRoot": "./docs",
  "plugin": ["typedoc-plugin-markdown", "typedoc-vitepress-theme"],
  "excludeProtected": true,
  "readme": "none",
  "indexFormat": "table"
}
```
*Fonte: [typedoc-plugin-markdown.org/plugins/vitepress/options](https://typedoc-plugin-markdown.org/plugins/vitepress/options) — `out` default do preset é `./api`, aqui sobrescrito para `docs/api`; `docsRoot` default `"./"`.*

### Pattern 2: Sidebar gerado importado no config VitePress
**What:** o plugin gera `typedoc-sidebar.json` dentro do `out` dir; o `.vitepress/config.mts` importa e injeta em `themeConfig.sidebar` sob a entrada "Reference".
**When to use:** sempre — é como o TypeDoc "aparece" na navegação do VitePress.
**Example (baseado no repo de exemplo oficial `typedoc2md/typedoc-vitepress-theme-example`):**
```ts
// docs/.vitepress/config.mts
import { defineConfig } from 'vitepress';
import typedocSidebar from '../api/typedoc-sidebar.json';

export default defineConfig({
  title: 'Mongoat',
  description: 'A lightweight, type-safe MongoDB ODM',
  base: '/mongoat/', // D-01: GitHub project page iamcalegari.github.io/mongoat/
  themeConfig: {
    search: { provider: 'local' },
    nav: [
      { text: 'Home', link: '/' },
      { text: 'Tutorials', link: '/tutorials/getting-started' },
      { text: 'How-to', link: '/how-to/hooks' },
      { text: 'Reference', link: '/api/' },
      { text: 'Explanation', link: '/explanation/thin-odm-philosophy' },
      { text: 'Migration', link: '/migration' },
    ],
    sidebar: {
      '/tutorials/': [{ text: 'Tutorials', items: [/* ... */] }],
      '/how-to/': [{ text: 'How-to guides', items: [/* ... */] }],
      '/explanation/': [{ text: 'Explanation', items: [/* ... */] }],
      '/api/': [{ text: 'Reference', items: typedocSidebar }],
    },
  },
});
```
*Fonte: [typedoc2md/typedoc-vitepress-theme-example/.vitepress/config.mts](https://github.com/typedoc2md/typedoc-vitepress-theme-example) — config real do repositório de exemplo mantido pela mesma org do plugin.*

### Pattern 3: Scripts npm com ordem de build garantida
**What:** `predocs` roda o TypeDoc antes do VitePress iniciar/buildar, via hook npm `pre*`.
**When to use:** todo `docs:dev`/`docs:build` — a Reference precisa existir em disco antes do VitePress ler o `typedoc-sidebar.json`.
**Example:**
```jsonc
// package.json (adicionar)
{
  "scripts": {
    "predocs:dev": "typedoc",
    "predocs:build": "typedoc",
    "docs:dev": "vitepress dev docs",
    "docs:build": "vitepress build docs",
    "docs:preview": "vitepress preview docs"
  }
}
```
*Fonte: [typedoc2md/typedoc-vitepress-theme-example/package.json](https://github.com/typedoc2md/typedoc-vitepress-theme-example) — mesmo padrão `predocs:dev`/`predocs:build`.*

### Anti-Patterns to Avoid
- **Rodar `typedoc` sem `excludeProtected: true`:** `Database` usa campos `protected [kClient]`/`[kDb]`/etc. (Symbol-keyed). TypeDoc **inclui `protected` por padrão** (`excludeProtected` default `false`) — sem a flag, esses internos vazam na Reference pública, violando D-04.
- **Dois sites (HTML TypeDoc padrão + VitePress) linkados por URL externa:** quebra a decisão explícita de "site único, navegação/busca unificadas" (D-04).
- **Commitar `docs/api/*.md` gerado no git como fonte editável:** o dev acaba editando o markdown gerado à mão (perdido no próximo build) — tratar `docs/api/` como artefato de build (ver Open Question sobre `.gitignore` vs. commit para GitHub Pages Actions, que não depende de arquivo estar commitado).
- **Confundir "busca local" com zero-config:** `themeConfig.search.provider: 'local'` precisa ser setado explicitamente — sem isso, o tema padrão não tem busca alguma habilitada.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Extrair API pública do TS para markdown | Script custom de parsing de AST/JSDoc | `typedoc` + `typedoc-plugin-markdown` | TypeDoc já resolve tipos genéricos, overloads, herança (`MongoatError` → subclasses) corretamente; um extractor custom reimplementaria um compilador TS parcial |
| Gerar sidebar a partir da árvore de tipos gerada | Script que varre `docs/api/*.md` e monta JSON de navegação | `typedoc-vitepress-theme` (`typedoc-sidebar.json` automático) | Mantém sidebar em sincronia automática a cada mudança de API — sem isso, sidebar fica manual e diverge silenciosamente |
| Deploy para GitHub Pages | Script custom com `gh-pages` npm package + push para branch `gh-pages` | Workflow oficial `configure-pages`+`upload-pages-artifact`+`deploy-pages` | Método "Actions" (não branch `gh-pages`) é o recomendado atualmente pelo GitHub e pela própria VitePress; evita branch órfã e histórico de deploy poluindo o repo |
| Busca client-side | Índice de busca custom (Lunr, Fuse.js manual) | `themeConfig.search.provider: 'local'` (minisearch, built-in) | Já integrado ao build da VitePress, zero dependência extra, zero serviço externo |

**Key insight:** documentação de API é um domínio onde "hand-rolling" custa caro de forma não-óbvia: qualquer mudança futura na assinatura de um método exige que o gerador reflita a mudança automaticamente — é exatamente o papel do TypeDoc extrair do compilador TS, não de um parser regex/AST simplificado mantido à mão.

## Common Pitfalls

### Pitfall 1: `protected`/Symbol-keyed fields vazando na Reference
**What goes wrong:** a Reference pública mostra `[kClient]`, `[kDb]`, `[kConnecting]`, `[kConnectionUrl]` como "propriedades" do `Database`, confundindo o dev-leitor e violando D-04.
**Why it happens:** TypeDoc só exclui `private` por padrão (`excludePrivate: true` é o default); `protected` continua visível (`excludeProtected: false` é o default). O código usa `protected` (não `private`) nesses campos Symbol-keyed — confirmado em `src/database/index.ts:29-38`.
**How to avoid:** setar `excludeProtected: true` em `typedoc.json`.
**Warning signs:** ao rodar `typedoc` localmente, abrir `docs/api/classes/Database.md` e conferir se aparecem propriedades com nomes de `Symbol(...)`.

### Pitfall 2: `base` errado quebrando assets em produção
**What goes wrong:** site publica mas aparece em branco/CSS quebrado, ou links internos 404 — clássico em GitHub Pages de project page.
**Why it happens:** `base` no `.vitepress/config` não foi setado para `/mongoat/` (default é `/`, assumindo domínio raiz). Project pages do GitHub servem em `usuario.github.io/repo/`, um subpath.
**How to avoid:** `base: '/mongoat/'` explícito no config; testar com `vitepress preview` **usando o build de produção**, não `vitepress dev` (que ignora `base`).
**Warning signs:** funciona em `docs:dev` local mas quebra só depois do deploy no Pages.

### Pitfall 3: TypeDoc não roda antes do build/dev (ordem de scripts)
**What goes wrong:** `docs:dev`/`docs:build` falha ao importar `typedoc-sidebar.json` porque o arquivo ainda não existe (primeira vez) ou está desatualizado (após mudança de API sem re-rodar typedoc).
**Why it happens:** falta o hook `predocs:dev`/`predocs:build` no `package.json`, ou o dev roda `vitepress dev` direto sem passar pelo script npm.
**How to avoid:** usar sempre `npm run docs:dev`/`npm run docs:build` (nunca `npx vitepress dev` direto); os hooks `pre*` do npm garantem a ordem.
**Warning signs:** erro de import/module-not-found apontando para `typedoc-sidebar.json` ao rodar VitePress.

### Pitfall 4: Versões desalinhadas entre TypeDoc e o plugin de markdown
**What goes wrong:** `typedoc-plugin-markdown` lança erro de "unsupported TypeDoc version" ou gera saída quebrada silenciosamente.
**Why it happens:** `typedoc-plugin-markdown` trava range de peerDependency estrito contra `typedoc` (major.minor específico); atualizar um sem o outro quebra.
**How to avoid:** instalar os três (`typedoc`, `typedoc-plugin-markdown`, `typedoc-vitepress-theme`) juntos numa única passada e deixar o npm resolver o peerDependency; não fixar versões manualmente sem checar compatibilidade cruzada primeiro.
**Warning signs:** `npm install` reclama de peer dependency conflict, ou build do TypeDoc sai sem erro mas o markdown gerado vem vazio/genérico.

### Pitfall 5: Workflow de deploy misturado com o CI de testes
**What goes wrong:** falha de teste bloqueia deploy do site (ou vice-versa), acoplando dois pipelines com propósitos diferentes — contra decisão explícita do autor (D-01, `code_context`).
**Why it happens:** tentação de adicionar um job "deploy-docs" dentro do `ci.yml` existente reaproveitando o trigger.
**How to avoid:** `.github/workflows/docs.yml` totalmente separado, com seu próprio `on: push: branches: [main]`.
**Warning signs:** qualquer edição em `ci.yml` para esta fase é um sinal de que a separação não foi respeitada.

## Code Examples

### Escape hatch documentado (How-to)
```typescript
// Source: src/model/index.ts:504-526 (JSDoc @public já existente)
const rawCollection = User.getCollection(); // Collection<UserSchema> nativa do driver
// bypass TOTAL e deliberado de hooks/gating — documentar isso explicitamente no how-to
```

### Tratamento de erro por instanceof/.code (How-to)
```typescript
// Source: MIGRATION.md §2.1
import { MongoatDriverError, MongoatValidationError } from '@iamcalegari/mongoat';

try {
  await User.insert(doc);
} catch (err) {
  if (err instanceof MongoatDriverError && err.code === 'DUPLICATE_KEY') {
    // err.message sanitizado; err.cause tem o erro original do driver
  }
}
```

### sanitizeFilter em input não-confiável (How-to)
```typescript
// Source: src/utils/sanitize.ts:162-210 (JSDoc @public já existente)
import { sanitizeFilter } from '@iamcalegari/mongoat';

const safeFilter = sanitizeFilter(req.query); // opt-in — nenhum método do Model chama isto sozinho
const users = await User.findMany(safeFilter);
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| Deploy Pages via branch `gh-pages` + `gh-pages` npm package | Deploy Pages via GitHub Actions nativo (`actions/deploy-pages`) | Método "Actions" disponível desde 2022, hoje é o caminho documentado como padrão pelo próprio GitHub e VitePress | Sem branch órfã extra no repo; deploy como job de workflow, com ambiente `github-pages` rastreável na aba Environments |
| TypeDoc HTML tema padrão + iframe/link para outro site | TypeDoc como plugin markdown embutido no SSG de docs | Padrão consolidado desde `typedoc-plugin-markdown` v4 (suporte first-class a temas de SSG como VitePress/Docusaurus) | Navegação e busca unificadas — exatamente o requisito D-04 |

**Deprecated/outdated:**
- Publicar a Reference como HTML isolado do TypeDoc (tema `default`) ao lado de um site de guias separado: ainda funciona, mas não é o padrão recomendado quando já existe um SSG de markdown (VitePress) para o resto da doc.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `docs/api/` deve ser tratado como artefato de build (não commitado) — decisão de projeto ainda não tomada no CONTEXT.md | Anti-Patterns, Open Questions | Se o autor preferir commitar a Reference gerada (para diff-review de mudanças de API), a estratégia de `.gitignore` muda; baixo risco — não afeta o funcionamento do site, só o fluxo de review |
| A2 | Node 22.x no workflow `docs.yml` (em vez do Node 24 do exemplo oficial da VitePress) | Standard Stack, Common Pitfalls | Nenhum — `engines` do projeto já exige `^20.19.0 \|\| >=22.12.0`; usar 22.x mantém consistência com `ci.yml`, mas Node 24 também funcionaria sem problema conhecido |

**Se esta tabela parecer vazia:** não está — os 4 nomes de pacote e as versões vieram de fontes verificadas (registry + docs oficiais), então não entraram aqui; só as duas decisões operacionais acima (que ainda dependem de preferência do autor) ficam marcadas.

## Open Questions

1. **`docs/api/` (Reference gerada) deve ser commitada no git ou gitignorada?**
   - What we know: o workflow de deploy (`docs.yml`) roda `typedoc` no runner do GitHub Actions antes do build da VitePress — **não depende** do arquivo estar commitado, porque o job de build sempre regenera do zero a partir de `src/`.
   - What's unclear: se o autor quer revisar diffs da Reference gerada em PRs (útil para notar mudanças de API acidentais) ou prefere tratá-la como build artifact puro (mais limpo, sem "ruído gerado" no histórico git).
   - Recommendation: gitignorar (`docs/api/` no `.gitignore`) por padrão — é o artifact de build mais comum neste padrão (análogo a `lib/` do próprio pacote); se o autor quiser auditoria de diff de API, considerar rodar `typedoc` como check de CI separado que falha se a assinatura pública mudar sem uma entrada correspondente no CHANGELOG (fora do escopo desta fase, relevante para REL-03).

2. **Como versionar `typedoc.json`: arquivo JSON separado ou bloco embutido no `.vitepress/config.mts`?**
   - What we know: `typedoc-plugin-markdown`/`typedoc-vitepress-theme` suportam ambas as formas (config file `typedoc.json` na raiz OU passar opções via CLI/API).
   - What's unclear: nenhuma preferência declarada em CONTEXT.md.
   - Recommendation: `typedoc.json` na raiz do repo (visível, versionado, edição direta) — é o padrão do repositório de exemplo oficial e o mais fácil de descobrir por outro contribuidor.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | build local do site (`docs:dev`/`docs:build`) | ✓ | v22.22.2 | — |
| npm | instalar devDeps novas | ✓ | 10.9.7 | — |
| GitHub Actions (runner ubuntu-latest) | deploy workflow | ✓ (já usado em `ci.yml`) | — | — |
| GitHub Pages (feature do repo) | hosting (D-01) | não verificável localmente — requer habilitar "Source: GitHub Actions" nas Settings > Pages do repo | — | nenhum — passo manual único, documentar no plano como task/checkpoint |

**Missing dependencies with no fallback:**
- Habilitar GitHub Pages com "Source: GitHub Actions" nas configurações do repositório — passo manual de configuração do GitHub (não é um pacote/CLI), deve virar uma task explícita (ou `checkpoint:human-verify`) no plano, já que não há como automatizar via código do repo.

**Missing dependencies with fallback:** nenhuma.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest (já configurado no projeto — `vitest.config.ts`), mas esta fase é predominantemente não-testável por unit tests (é geração de conteúdo/build estático) |
| Config file | `vitest.config.ts` (existente, não precisa mudar para esta fase) |
| Quick run command | `npm run docs:build` (falha rápido = build quebrado) |
| Full suite command | `npm run docs:build && npm run docs:preview` (verificação visual manual) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| DOCS-01 | Site VitePress builda sem erro e cobre os 4 quadrantes + Home/Migration | build/smoke | `npm run docs:build` | ❌ Wave 0 (script novo) |
| DOCS-02 | Reference gerada cobre exatamente o barrel `src/index.ts` (sem símbolos internos vazados) | smoke + manual-review | `npm run predocs:build` (rodar `typedoc` isolado) + inspeção visual de `docs/api/classes/Database.md` | ❌ Wave 0 |
| DOCS-03 | Página de migração presente e linkada na nav | manual-only | verificação visual (link `/migration` no nav resolve e renderiza) | ❌ Wave 0 |
| DOCS-04 | README sem o disclaimer "work in progress", com quick start funcional | manual-only (+ opcional: script que roda o quick start do README como smoke test, já existe `examples/model/usage.ts` reaproveitável) | `npx tsx examples/model/usage.ts` (requer Mongo local/testcontainers) | ✅ já existe (`examples/`) |

### Sampling Rate
- **Per task commit:** `npm run docs:build` (falha rápido em erro de sintaxe markdown/link quebrado do VitePress — a própria build da VitePress já valida links internos por padrão)
- **Per wave merge:** `npm run docs:build && npm run docs:preview` + revisão visual dos 4 quadrantes e da Reference
- **Phase gate:** build verde localmente + deploy verde no Actions (`docs.yml`) antes de considerar a fase concluída

### Wave 0 Gaps
- [ ] `docs/.vitepress/config.mts` — não existe, precisa ser criado (Wave 0)
- [ ] `typedoc.json` — não existe, precisa ser criado (Wave 0)
- [ ] `.github/workflows/docs.yml` — não existe, precisa ser criado (Wave 0)
- [ ] Scripts `docs:dev`/`docs:build`/`docs:preview`/`predocs:dev`/`predocs:build` — não existem em `package.json` (Wave 0)
- [ ] Framework install: `npm install -D vitepress typedoc typedoc-plugin-markdown typedoc-vitepress-theme`

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-------------------|
| V2 Authentication | Não | Site estático público, sem autenticação |
| V3 Session Management | Não | N/A |
| V4 Access Control | Não | N/A — GitHub Pages serve conteúdo público estático |
| V5 Input Validation | Não | Nenhum input de usuário no site em si (busca é client-side sobre índice estático) |
| V6 Cryptography | Não | N/A |
| Supply-chain (fora do ASVS clássico, mas relevante ao CLAUDE.md) | **Sim** | Ver `## Package Legitimacy Audit` — 4 novas devDeps auditadas; `typedoc` sinalizado `SUS` (too-new) |

### Known Threat Patterns for este stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|----------------------|
| Supply-chain (pacote comprometido/slopsquat em devDependency) | Tampering | Auditoria de legitimidade already-run (ver Package Legitimacy Audit); `checkpoint:human-verify` recomendado para `typedoc` antes do install |
| Secrets vazados no workflow de deploy | Information Disclosure | O workflow não precisa de nenhum secret custom — `GITHUB_TOKEN` automático com `permissions: pages: write, id-token: write` já é o suficiente; não introduzir tokens pessoais/PATs |
| Exposição indevida de detalhes internos na Reference pública | Information Disclosure (baixo risco, mas contra D-04) | `excludeProtected: true` no `typedoc.json` (ver Pitfall 1) |

## Sources

### Primary (HIGH confidence)
- [vitepress.dev/guide/deploy](https://vitepress.dev/guide/deploy) — markdown-fonte oficial recuperado via GitHub raw (`vuejs/vitepress`), workflow completo GitHub Pages
- [typedoc-plugin-markdown.org/plugins/vitepress](https://typedoc-plugin-markdown.org/plugins/vitepress) e `/quick-start`, `/options` — documentação oficial do plugin
- [github.com/typedoc2md/typedoc-vitepress-theme-example](https://github.com/typedoc2md/typedoc-vitepress-theme-example) — repositório de exemplo real mantido pela mesma org (`package.json`, `typedoc.json`, `.vitepress/config.mts` lidos diretamente)
- `npm view <pkg> version/time/scripts.postinstall` — versões e datas de publicação confirmadas diretamente no registry (vitepress, typedoc, typedoc-plugin-markdown, typedoc-vitepress-theme)
- [diataxis.fr](https://diataxis.fr/) — definição canônica dos 4 quadrantes
- Leitura direta do código-fonte: `src/index.ts`, `src/database/index.ts`, `src/model/index.ts`, `src/errors/index.ts`, `src/utils/sanitize.ts`, `src/utils/enums.ts` — superfície pública exata e uso de `protected`/`private`

### Secondary (MEDIUM confidence)
- WebSearch sobre `typedoc-vitepress-theme` (versão e mecanismo geral de sidebar) — cruzado com a leitura direta do repo de exemplo (promovido a fonte primária onde possível)
- WebSearch sobre boas práticas de README npm — padrão geral (badges/quick start/link para docs), sem uma única fonte autoritativa única

### Tertiary (LOW confidence)
- Nenhuma claim ficou apenas em tertiary — todas as versões/configuração crítica foram cruzadas com registry npm e/ou docs oficiais/repo de exemplo real.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — versões confirmadas via `npm view` + docs oficiais + repositório de exemplo real do mantenedor
- Architecture: HIGH — padrão de integração confirmado por config real (`typedoc2md/typedoc-vitepress-theme-example`) e pela leitura direta do código-fonte do Mongoat (protected fields, JSDoc coverage)
- Pitfalls: HIGH — `excludeProtected` e `docsRoot` confirmados na documentação oficial de opções do plugin; `base` é comportamento documentado da própria VitePress

**Research date:** 2026-07-08
**Valid until:** 2026-08-07 (30 dias — stack de docs é razoavelmente estável, mas `typedoc`/`typedoc-plugin-markdown` lançam patches com frequência; reconfirmar versões antes de instalar se a fase for executada depois dessa janela)
