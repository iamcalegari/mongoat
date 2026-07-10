# Phase 5: Estabilização de API e release v1.0 - Research

**Researched:** 2026-07-08
**Domain:** Release engineering (changesets, npm provenance/OIDC, semver de pre-release→estável, deprecação de pacotes)
**Confidence:** MEDIUM-HIGH (mecânica de bump verificada via execução local do `semver`; fluxo changesets/provenance via documentação oficial; nenhum acesso a MCP de docs nesta sessão — tudo via WebSearch, tags `[CITED]`/`[VERIFIED]` conforme a fonte)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01 — Primeira versão estável = `1.1.0` (REL-04)** — As 34 alphas são `1.0.x-alpha` (latest = `1.0.34-alpha`); `1.0.0` seria numericamente menor e exigiria forçar dist-tag + quem tem a alpha não atualizaria. Escolhido **`1.1.0`** (minor bump, `> 1.0.34-alpha`): o dist-tag `latest` atualiza naturalmente, usuários da alpha recebem o update, e o número reflete "primeira estável com features" (condiz com as breaking changes documentadas). **Consequência:** o `CHANGELOG.md`/`MIGRATION.md` (que hoje dizem "v1.0.0") e o goal/success-criteria do ROADMAP são atualizados para `1.1.0`. O "v1.0" do roadmap é o MARCO conceitual de estabilidade, materializado como npm `1.1.0`.
- **D-02 — Release Candidate antes da estável (REL-03)** — Publicar `1.1.0-rc.0` com dist-tag `rc` (NÃO `latest`). Validar o tarball: `are-the-types-wrong` + `publint` (já no `check:package`), smoke de import CJS **e** ESM, e o quick start do README compilando contra o pacote empacotado. Só então promover para `1.1.0` estável.
- **D-03 — Publicação: primeira gated, automatizada depois (REL-01)** — Pipeline **changesets**: changesets (`.changeset/*.md`) descrevem as mudanças; a Changesets Action abre um "Version Packages" PR (bump + CHANGELOG). A **primeira release (`1.1.0`) é publicada por disparo/aprovação explícita** do workflow de release no CI (o autor aperta o botão — publish é irreversível). Os releases seguintes (`1.1.x`, `1.2.0`…) publicam automaticamente no merge do Version PR.
- **D-04 — Supply-chain do publish (REL-01)** — O publish roda no **GitHub Actions com `npm publish --provenance`** (OIDC `id-token: write` atesta que o tarball veio deste repo/CI). `NPM_TOKEN` como **secret** do repo (automation/granular token, escopo mínimo de publish). `publishConfig.access: public` já existe. Workflow de release separado (não misturar com `ci.yml`/`docs.yml`).
- **D-05 — Deprecar as 34 alphas (REL-04)** — Após a estável no ar: `npm deprecate` das versões `1.0.x-alpha` (`< 1.1.0`) com mensagem apontando para a estável e o guia de migração: _"The 1.0.x-alpha line is discontinued — upgrade to the stable release. Migration guide: https://iamcalegari.github.io/mongoat/migration"_.
- **D-06 — Auditoria de API alpha→estável (REL-03)** — Antes do RC: revisar a superfície pública (barrel `src/index.ts`) e confirmar que as breaking changes documentadas (CHANGELOG/MIGRATION) estão completas e a API está coerente/congelável. **Resolver os `@deprecated` existentes** antes de congelar: `Database.defineModel` (src/database/index.ts:179) e `Model.create` (src/model/index.ts:423) — decidir remover (breaking, aceitável na primeira estável) ou manter documentado. Registrar o diff alpha→1.1.0.
- **D-07 — Política semver documentada (REL-04)** — Documentar a política de estabilidade da API pública (o que conta como breaking/minor/patch; que a superfície pública é o barrel `src/index.ts`; `@internal` fora do contrato). Publicar no site (Explanation ou página "Stability/Versioning") e referenciar no README/CONTRIBUTING.

### Claude's Discretion

- **Ferramenta:** `@changesets/cli` + config em `.changeset/config.json` (changelog via `@changesets/changelog-github` ou default). Workflow `.github/workflows/release.yml` usando `changesets/action`.
- **Reconciliar CHANGELOG:** o `CHANGELOG.md` manual atual (formato Keep a Changelog, seção `[Unreleased]`) vira o registro da `1.1.0`; do `1.1.0` em diante o changesets gerencia o CHANGELOG a partir dos changesets. Research/planner definem a mecânica exata (ex.: um changeset inicial consolidando as breaking changes).
- **Bump:** `package.json` version `1.0.34-alpha` → `1.1.0` via `changeset version` (não editar à mão).
- **RC dist-tag e promoção:** `changeset pre enter rc` (modo pre-release do changesets) ou publish manual do rc com `--tag rc`; a promoção move o `latest` para `1.1.0`.

### Deferred Ideas (OUT OF SCOPE)

- Automação total de publish (sem gate) — só após a primeira estável validar o pipeline.
- Multi-dist-tag além de `latest`/`rc` (ex.: `next` para features pós-v1) — quando as Fases 6-8 introduzirem features.
- Release notes ricas por GitHub Releases (além do CHANGELOG) — nice-to-have, o changelog cobre o essencial.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| REL-01 | Pipeline de release com changesets: CHANGELOG gerado, versionamento via PR, publicação npm automatizada no merge | Ver Architecture Patterns (Pattern 1-3), `.changeset/config.json` e `release.yml` em Code Examples; `changesets/action` verificado como Action oficial (`changesets/` org) |
| REL-03 | `v1.0.0-rc` (→ `1.1.0-rc.0`, D-01) publicado com auditoria de API (diff alpha→v1) antes da tag final | Ver Pattern 2 (fluxo RC exato, comandos verificados via `semver.inc`), Don't Hand-Roll (auditoria manual do barrel), Code Examples (smoke test pós-RC) |
| REL-04 | `v1.0.0` (→ `1.1.0`, D-01) estável publicada no npm com política semver documentada e versões alpha deprecadas (`npm deprecate`) | Ver Pitfall 1 (CRÍTICO — gotcha verificado de `npm deprecate` por range com pre-releases), Pattern 2 (promoção RC→estável), D-07 tratado como tarefa de documentação (site VitePress já publicado na Fase 4) |
</phase_requirements>

## Summary

Esta fase é 100% release engineering sobre um pacote já publicado (34 alphas). A mecânica central — descoberta e **verificada por execução local** nesta pesquisa — é que `changeset version` calcula a nova versão aplicando o bump semver (via `semver.inc`) diretamente sobre a versão atual do `package.json` (`1.0.34-alpha`), e **`semver.inc('1.0.34-alpha', 'minor') === '1.1.0'`** exatamente. Isso confirma que a decisão travada D-01 (`1.1.0`) é alcançável com um único changeset tipo `minor` — sem precisar editar `package.json` à mão nem forçar dist-tag. O mesmo vale para o RC: `semver.inc('1.0.34-alpha', 'preminor', 'rc') === '1.1.0-rc.0'`, que é exatamente o alvo de D-02.

A segunda descoberta crítica (também verificada por execução local) é um **gotcha real em D-05**: ranges de semver como `<1.1.0` ou `1.0.x-alpha` **não casam** com nenhuma das 34 versões `1.0.x-alpha` publicadas, porque o node-semver só permite que uma versão pre-release satisfaça um range quando existe um comparador com a **mesma tupla** major.minor.patch **e** uma tag de pre-release. Um `npm deprecate "@iamcalegari/mongoat@<1.1.0" "..."` executado ingenuamente **deprecaria zero versões silenciosamente** (sem erro). A mitigação segura e verificada é depreciar por **versão exata**, iterando sobre `npm view @iamcalegari/mongoat versions --json` (34 chamadas), não por range.

Provenance (D-04) é direto: `npm publish --provenance` requer apenas `id-token: write` + npm CLI ≥ 9.5 — ambos já satisfeitos pelo Node 20.x/22.x usados no `ci.yml`/`docs.yml` (Node 22 LTS empacota npm 10.x). **Não** é necessário adotar o "Trusted Publishing" mais novo do npm (OIDC sem token algum, GA desde jul/2025) porque D-04 já trava `NPM_TOKEN` como secret — trusted publishing exigiria npm CLI ≥ 11.5.1 (upgrade manual no workflow, pois Node 22 não empacota essa versão) e está documentado aqui apenas como nota de "State of the Art" para uma fase futura.

**Primary recommendation:** um único workflow `.github/workflows/release.yml` (separado de `ci.yml`/`docs.yml`) rodando `changesets/action@v1` com `permissions: id-token: write`, `NPM_CONFIG_PROVENANCE: true`, gated na primeira publicação via GitHub Environment com required reviewer; `changelog: false` no `.changeset/config.json` para preservar o CHANGELOG.md/MIGRATION.md mantidos à mão (convenção já estabelecida na Fase 4); depreciar as 34 alphas por versão exata em loop, não por range.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Versionamento semântico (bump, changelog) | CI/CD (GitHub Actions) | Build tooling (npm/changesets CLI) | `changeset version` roda em CI (Version Packages PR) e localmente para o autor gerar changesets |
| Publicação no registry (npm publish) | CI/CD (GitHub Actions) | — | Gated na 1ª release; automatizada nas seguintes; nunca do laptop do autor (garante proveniência) |
| Auditoria de API pública | Código-fonte (`src/index.ts`) | Documentação (CHANGELOG/MIGRATION) | Barrel é a superfície contratual; docs já documentam as breaking changes candidatas |
| Deprecação de versões antigas | Registry externo (npm) | CI/CD (passo manual/automatizável pós-release) | Estado vive no npm registry, não em git — ver Runtime State Inventory |
| Política semver documentada | Documentação (site VitePress) | README/CONTRIBUTING | Site já publicado (Fase 4); nova página "Stability/Versioning" |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@changesets/cli` | `2.31.0` [VERIFIED: npm registry, `npm view @changesets/cli version`, publicado 2026-04-17] | CLI de changesets: `add`, `version`, `publish`, `pre` | Ferramenta de fato para versionamento+changelog orientado a PR no ecossistema npm; 3.1M downloads/semana |
| `changesets/action` | tag `v1` (GitHub Action, **não** é dependência npm) [CITED: github.com/changesets/action] | Action que abre o "Version Packages" PR e publica no merge | Ação oficial mantida pela mesma org `changesets`; consumida via `uses: changesets/action@v1`, nunca instalada via `npm install` |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@changesets/changelog-github` | `0.7.0` [VERIFIED: npm registry] | Gerador de changelog alternativo (linka PR/autor) | **Não recomendado aqui** — ver "Reconciliação do CHANGELOG" abaixo; o projeto já mantém CHANGELOG.md à mão (D-03 da Fase 4) |
| `semver` (transitivo, já em `node_modules` via outras deps) | `7.8.5` [VERIFIED: local `node_modules`] | Confirmar localmente o resultado de bumps antes de rodar `changeset version` em produção | Sanity-check opcional, não é dependência nova |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `changesets/action` (PR-based, gated) | `semantic-release` (commit-message driven, full-auto) | `semantic-release` não combina com D-03 (1ª release gated, sem PR de revisão); exige Conventional Commits retroativo no histórico já existente |
| CHANGELOG auto-gerado pelo changesets | CHANGELOG.md mantido à mão + changesets só para bump | Auto-gerado é mais barato de manter, mas destrói a curadoria Keep-a-Changelog já feita nas Fases 1-4 (ver decisão abaixo) |
| `npm publish --provenance` + `NPM_TOKEN` (D-04) | npm Trusted Publishing (OIDC, sem token) | Trusted Publishing é mais novo (GA jul/2025) e mais seguro (zero segredos de longa duração), mas D-04 já trava `NPM_TOKEN`; exige npm CLI ≥11.5.1 (upgrade manual, pois runners não vêm com essa versão) — candidato a fase futura, não a esta |

**Installation:**
```bash
npm install --save-dev @changesets/cli@2.31.0
npx changeset init   # cria .changeset/config.json + .changeset/README.md
```

**Version verification:** confirmado via `npm view <pkg> version` nesta sessão (ver tabela acima); `@changesets/changelog-github` listado apenas para descarte deliberado, não para instalação.

## Package Legitimacy Audit

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| `@changesets/cli` | npm | pacote maduro (linha 2.x desde 2021; release atual 2026-04-17) | 3,149,009/wk | github.com/changesets/changesets | OK | Approved |
| `@changesets/changelog-github` | npm | maduro (release atual 2026-05-05) | 774,131/wk | github.com/changesets/changesets | OK | Approved (mas **não instalado** — descartado por decisão de design, não por legitimidade) |

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

`changesets/action` não passa pelo gate de legitimidade `npm view`/registry porque é consumida como GitHub Action (`uses: changesets/action@v1`), não como dependência npm — verificação de legitimidade para Actions é feita por **pin de versão major + org oficial `changesets/`** (mesma org do CLI), não por `npm view`. Recomenda-se fixar `changesets/action@v1` (não `@main`) e revisar o hash de commit se o projeto quiser pin por SHA (prática comum de supply-chain, mas opcional dado que é a action first-party dos próprios mantenedores do changesets).

## Architecture Patterns

### System Architecture Diagram

```
Autor escreve mudança
        │
        ▼
  npx changeset add   ──► .changeset/<random-name>.md  (bump type + descrição)
        │                        │
        │ (git push / PR normal) │
        ▼                        ▼
   PR normal mergeado ──► push em `main` dispara .github/workflows/release.yml
                                 │
                                 ▼
                    changesets/action@v1 roda `changeset status`
                                 │
                    ┌────────────┴─────────────┐
                    │ há changesets pendentes?  │
                    └────────────┬─────────────┘
                          sim ▼        │ não
              abre/atualiza PR         ▼
             "Version Packages"   roda `npm publish --provenance`
             (bump package.json,       (usa NPM_TOKEN + id-token: write)
              aplica changesets)            │
                    │                       ▼
          merge do PR "Version         pacote publicado no registry npm
          Packages" (autor aprova) ────► com dist-tag latest/rc
                    │
                    ▼
        1ª publicação (1.1.0): job gated
        por GitHub Environment com
        required reviewer (D-03)
```

### Recommended Project Structure
```
.changeset/
├── config.json          # changelog: false, access: public, baseBranch: main
├── README.md             # gerado por `changeset init`
└── <initial>.md          # changeset consolidado para a 1.1.0 (ver abaixo)
.github/workflows/
├── ci.yml                 # já existe
├── docs.yml               # já existe
└── release.yml            # NOVO — separado, permissions: id-token write
```

### Pattern 1: Reconciliação do CHANGELOG (mecânica exata)
**What:** manter `CHANGELOG.md`/`MIGRATION.md` como fonte editável (já é a convenção da Fase 4 — D-03: "CHANGELOG.md e MIGRATION.md na raiz permanecem fonte editável"), e usar changesets **apenas para o bump de versão**, não para gerar texto de changelog.
**When to use:** sempre que o projeto já tem uma curadoria manual de changelog (formato Keep a Changelog) que não deve ser substituída por bullets automáticos por changeset.
**Mecânica recomendada:**
1. Definir `"changelog": false` em `.changeset/config.json` — `changeset version` bumpará o `package.json`/lockfile mas **não tocará** em `CHANGELOG.md`. [CITED: github.com/changesets/changesets/blob/main/docs/config-file-options.md]
2. Criar **um** changeset consolidado (`npx changeset add`, tipo `minor`) cuja descrição curta é algo como `"First stable release (1.1.0) — see CHANGELOG.md"` — sua única função é fazer `changeset version`/`changeset status` calcularem o bump `minor` corretamente; o corpo não vira changelog público (porque `changelog: false`).
3. Como tarefa manual do plano (não automatizada): renomear a seção `## [Unreleased]` do `CHANGELOG.md` para `## [1.1.0] - <data>` e atualizar o link de comparação no rodapé, ANTES ou DEPOIS do merge do "Version Packages" PR (pode ser no mesmo commit/PR).
4. A partir de `1.1.0`, decidir se o CHANGELOG passa a ser 100% manual por PR normal (mesma convenção) — é a opção mais simples e consistente com o que a Fase 4 já estabeleceu para `docs/migration.md`.

### Pattern 2: Fluxo de RC → estável (comandos exatos)
```bash
# 1. Entrar em modo pre-release com tag "rc"
npx changeset pre enter rc          # cria .changeset/pre.json

# 2. Ter pelo menos 1 changeset tipo "minor" pendente (ver Pattern 1)
npx changeset version               # bump: 1.0.34-alpha -> 1.1.0-rc.0 (verificado)
git add -A && git commit -m "chore: version 1.1.0-rc.0"

# 3. Publicar o RC com dist-tag "rc" (NÃO latest)
npx changeset publish --tag rc      # ou: npm publish --tag rc --provenance

# 4. Validar o RC (D-02): check:package + smoke CJS/ESM contra o tarball publicado
npm install @iamcalegari/mongoat@rc --prefix /tmp/smoke-test
node -e "require('@iamcalegari/mongoat')"           # smoke CJS
node --input-type=module -e "import '@iamcalegari/mongoat'"  # smoke ESM

# 5. Sair do modo pre-release
npx changeset pre exit
npx changeset version               # bump: 1.1.0-rc.0 -> 1.1.0 (remove o sufixo -rc.N)
git add -A && git commit -m "chore: version 1.1.0"

# 6. Publicar a estável — dist-tag "latest" (padrão), GATED (D-03)
npx changeset publish               # ou npm publish --provenance
```
**Gotcha confirmado:** `changeset pre exit` **não** faz o bump sozinho — apenas grava a intenção em `.changeset/pre.json`; é preciso rodar `changeset version` de novo (passo 5 acima) para de fato remover o sufixo `-rc.N`. [CITED: github.com/changesets/changesets/blob/main/docs/prereleases.md]

### Pattern 3: Publish gated na 1ª release, automático depois
**What:** GitHub Environment (ex.: `npm-publish`) com **required reviewers** configurado nas settings do repo; o job de `npm publish` do `release.yml` referencia `environment: npm-publish`.
**When to use:** D-03 exige que só a **primeira** publicação (`1.1.0`) seja gated por aprovação humana explícita, e as seguintes sejam automáticas no merge do "Version Packages" PR.
**Como reconciliar "gated só na 1ª vez" com "automático depois" no mesmo workflow:** repositórios públicos têm Environments protection rules gratuitas em qualquer plano [CITED: docs.github.com/actions/reference/workflows-and-actions/deployments-and-environments]. Duas estratégias equivalentes, escolher uma:
  - **(a) Simples/recomendada:** manter o Environment com required reviewer **permanentemente** no job de publish do `release.yml`. Isso satisfaz D-03 na 1ª vez; para as próximas o autor apenas aprova (é 1 clique, não bloqueia automação de fato — o PR "Version Packages" já é o gate de conteúdo, o Environment é só o gate de *ação irreversível*). Mais simples de manter, sem lógica condicional no workflow.
  - **(b) Condicional:** remover o `environment:` do job (ou trocar de Environment) **depois** que a 1.1.0 for publicada com sucesso, via um PR de acompanhamento que edita `release.yml`. Mais fiel ao "gated só na 1ª vez, automático depois" literal, mas exige lembrar de fazer esse follow-up.
  Recomenda-se **(a)** por default operacional mais simples e ainda seguro (aprovação de 1 clique não é fricção real); documentar a decisão explícita no plano.

### Anti-Patterns to Avoid
- **Range-based `npm deprecate` para versões pre-release:** `npm deprecate "@iamcalegari/mongoat@<1.1.0" "msg"` **não casa com nenhuma das 34 alphas** — ver Common Pitfalls #1. Sempre depreciar por versão exata quando o conjunto envolve pre-releases com tuplas major.minor.patch distintas.
- **Editar `package.json.version` manualmente:** o CONTEXT.md já veta isso (D-01/discrição); `changeset version` deve ser a única fonte do bump, senão o Version Packages PR gerado pela action diverge do que já está no working tree.
- **Misturar o workflow de release com `ci.yml`/`docs.yml`:** D-04 exige workflow separado — evita que um `npm publish` acidental dispare em PR de docs, e mantém `permissions: id-token: write` escopado ao mínimo necessário.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Cálculo de bump semver a partir de changesets | Script próprio que lê `.changeset/*.md` e chama `semver.inc` | `@changesets/cli` (`changeset version`) | Já resolve dependências internas, monorepo-safety (irrelevante aqui, mas mantém upgrade path), e é o padrão de fato do ecossistema |
| Diff estrutural de API pública TS | Script ad-hoc de AST diffing | Revisão manual do barrel `src/index.ts` guiada por CHANGELOG.md/MIGRATION.md (D-06) | O pacote tem 1 barrel pequeno (~30 exports); `@microsoft/api-extractor` exigiria `api-extractor.json` + rollup `.d.ts` só para um caso de uso único — desproporcional ao tamanho da superfície e ao princípio de "mínimo de dependências" do CLAUDE.md. `attw`+`publint` (já no `check:package`) já cobrem a forma dos tipos publicados; falta apenas a checagem semântica manual |
| Verificação de tarball antes do publish | Smoke test customizado | `check:package` já existente (`npm pack --dry-run && publint && attw --pack .`) | Reaproveitar — já valida ESM/CJS/types; a fase só adiciona o smoke de import real (Pattern 2, passo 4) |

**Key insight:** a fase tem escopo de release engineering, não de desenvolvimento de tooling novo — toda ferramenta recomendada (`changesets`, `attw`, `publint`) já é padrão de fato ou já está instalada; a única peça "manual" deliberada é a auditoria de API (baixo custo dado o tamanho do barrel) e a reconciliação do CHANGELOG (decisão de design documentada acima, não uma lacuna de tooling).

## Runtime State Inventory

> Fase envolve mudança de estado publicado externamente (npm registry) e renomeação textual ("v1.0.0" → "1.1.0") em múltiplos arquivos — tratada como o equivalente de uma fase de rename para fins desta auditoria.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data / estado publicado | npm registry: 34 versões `1.0.x-alpha` já publicadas, dist-tag `latest` = `1.0.34-alpha` [VERIFIED: `npm view @iamcalegari/mongoat dist-tags/versions`] | Nenhuma migração de dados — apenas publicar novas versões (`1.1.0-rc.0`, `1.1.0`) e depois marcar as 34 antigas como deprecated via `npm deprecate` (versão exata, não range — ver Pitfall #1) |
| Live service config (fora do git) | Nenhum serviço externo com config própria (n8n, Datadog, etc.) identificado neste projeto | Nenhuma ação |
| OS-registered state | Nenhum (biblioteca npm, sem processos de sistema/tasks registrados) | Nenhuma ação |
| Secrets/env vars | `NPM_TOKEN` (novo secret do repo, D-04) — não existe hoje; precisa ser criado nas GitHub Secrets antes do 1º publish. `GITHUB_TOKEN` (já disponível por padrão em Actions, usado pela `changesets/action` para abrir o PR) | Criar `NPM_TOKEN` (automation/granular token, escopo mínimo "Read and write" só para `@iamcalegari/mongoat`) nas Settings → Secrets do repo |
| Build artifacts | `lib/` é gerado e não versionado (`.gitignore`/`files: ["lib"]`); nenhum artefato stale a limpar | Nenhuma ação — `npm run build` roda antes de cada publish |
| Documentação com string a atualizar | `CHANGELOG.md:16`, `MIGRATION.md:7,9`, `docs/migration.md:15,17` (dual maintenance, D-03 da Fase 4), `.planning/ROADMAP.md:154,160,161` — todos mencionam "v1.0.0"/"v1.0.0-rc" | Atualizar as 4 fontes para `1.1.0`/`1.1.0-rc.0`; `MIGRATION.md` e `docs/migration.md` devem ficar sincronizados (mesma convenção já usada na Fase 4) |

## Common Pitfalls

### Pitfall 1: `npm deprecate` por range silenciosamente não deprecia nenhuma pre-release (CRÍTICO para D-05)
**What goes wrong:** rodar `npm deprecate "@iamcalegari/mongoat@<1.1.0" "mensagem"` (ou `@1.0.x-alpha`, ou `@1.x`) parece razoável, mas **não casa com nenhuma das 34 versões `1.0.x-alpha`** e não retorna erro — o comando simplesmente não encontra nada para marcar.
**Why it happens:** por especificação do semver, uma versão pre-release só satisfaz um range se **existir um comparador com a mesma tupla major.minor.patch que também carregue uma tag de pre-release**. `<1.1.0` tem tupla `1.1.0` (sem pre-release na prática, dado que o node-semver normaliza para `<1.1.0-0` internamente em alguns casos, mas mesmo assim a tupla não bate com `1.0.34`). **Verificado por execução local** (`node -e "require('semver').satisfies('1.0.34-alpha','<1.1.0')"` → `false`; testado com `1.x`, `1.0.x-alpha`, `>=1.0.0-0 <1.1.0-0` — todos falham em casar as 34 versões). Isso contradiz um exemplo da própria documentação oficial do `npm deprecate` (que afirma que `1.x` deprecaria `1.0.0-beta.0`) — **há uma divergência real entre o texto da doc e o comportamento observado do node-semver 7.8.5** (mesma lib usada internamente pelo npm CLI). Tratar como não confiável até confirmar em um teste real contra o registry.
**How to avoid:** depreciar por **versão exata**, em loop sobre a lista real de versões publicadas:
```bash
for v in $(npm view @iamcalegari/mongoat versions --json | node -e "process.stdin.resume();let d='';process.stdin.on('data',c=>d+=c).on('end',()=>JSON.parse(d).forEach(v=>console.log(v)))"); do
  npm deprecate "@iamcalegari/mongoat@$v" "The 1.0.x-alpha line is discontinued — upgrade to the stable release. Migration guide: https://iamcalegari.github.io/mongoat/migration"
done
```
Este loop é o único caminho **verificado como correto** para depreciar as 34 alphas com segurança — 34 chamadas de API, mas determinístico e sem ambiguidade de matching.
**Warning signs:** depois de rodar `npm deprecate` com range, confirmar com `npm view @iamcalegari/mongoat@1.0.34-alpha deprecated` — se vier `undefined`, o range não pegou.

### Pitfall 2: `changeset pre exit` não faz o bump sozinho
**What goes wrong:** achar que `changeset pre exit` já produz o `1.1.0` final.
**Why it happens:** `pre exit` só grava a intenção em `.changeset/pre.json`; é `changeset version` (rodado depois) que de fato remove o sufixo `-rc.N` e recalcula a versão. [CITED: github.com/changesets/changesets/blob/main/docs/prereleases.md]
**How to avoid:** sempre rodar `pre exit` **seguido** de `version` como dois passos distintos (ver Pattern 2, passo 5).
**Warning signs:** `package.json` ainda mostra `-rc.N` depois do `pre exit` isolado.

### Pitfall 3: `changelog` automático do changesets sobrescreve a curadoria manual
**What goes wrong:** deixar o `changelog` default (`@changesets/cli/changelog`) ativo faz `changeset version` **inserir uma seção nova no topo de `CHANGELOG.md`** com bullets terse gerados automaticamente, brigando com a seção `[Unreleased]` já cuidadosamente escrita (formato Keep a Changelog, com **BREAKING** marcado).
**Why it happens:** comportamento padrão do gerador de changelog do changesets é sempre escrever no arquivo, sem "modo dry" nem merge inteligente com conteúdo pré-existente.
**How to avoid:** `"changelog": false` no `.changeset/config.json` desde o primeiro `changeset init` (ver Pattern 1).
**Warning signs:** `git diff CHANGELOG.md` depois de um `changeset version` mostrando duas seções de topo conflitantes.

### Pitfall 4: npm CLI empacotado no runner não suporta Trusted Publishing completo
**What goes wrong:** tentar configurar "Trusted Publisher" no npmjs.com (zero-token) e descobrir que o publish falha silenciosamente ou cai em erro de autenticação.
**Why it happens:** Trusted Publishing (OIDC sem `NPM_TOKEN`) exige npm CLI ≥ **11.5.1** [CITED: docs.npmjs.com/trusted-publishers/]; Node 22 LTS empacota npm **10.x** [CITED: nodejs.org/en/blog/release/v22.22.2 + pesquisa de versão]. Sem um passo explícito `npm install -g npm@latest`, o publish usa a versão antiga.
**How to avoid:** irrelevante para D-04 (que já usa `NPM_TOKEN` + `--provenance`, que só exige npm ≥ 9.5 — satisfeito pelo npm 10.x padrão). Só relevante se o projeto migrar para Trusted Publishing numa fase futura — nesse caso, adicionar `run: npm install -g npm@latest` antes do publish.
**Warning signs:** erro `E401`/`ENEEDAUTH` mesmo com o Trusted Publisher configurado corretamente no npmjs.com.

## Code Examples

### `.changeset/config.json` recomendado
```json
{
  "$schema": "https://unpkg.com/@changesets/config@3.0.0/schema.json",
  "changelog": false,
  "commit": false,
  "fixed": [],
  "linked": [],
  "access": "public",
  "baseBranch": "main",
  "updateInternalDependencies": "patch",
  "ignore": []
}
```
Fonte: opções documentadas em [CITED: github.com/changesets/changesets/blob/main/docs/config-file-options.md]. `access: "public"` reflete o `publishConfig.access: "public"` que já existe no `package.json`; `baseBranch: "main"` corresponde ao branch único do repo (`ci.yml`/`docs.yml` também usam `main`).

### `.github/workflows/release.yml` (esqueleto)
```yaml
name: Release

on:
  push:
    branches: [main]

concurrency: ${{ github.workflow }}-${{ github.ref }}

permissions:
  contents: write
  pull-requests: write
  id-token: write   # necessário para --provenance (D-04)

jobs:
  release:
    runs-on: ubuntu-latest
    environment: npm-publish   # Environment com required reviewer (D-03, Pattern 3)
    steps:
      - uses: actions/checkout@v5
        with:
          fetch-depth: 0
      - uses: actions/setup-node@v4
        with:
          node-version: '22.x'
          cache: 'npm'
      - run: npm ci
      - run: npm run build
      - run: npm run check:package
      - name: Create Release Pull Request or Publish
        uses: changesets/action@v1
        with:
          publish: npm run release   # ex.: "changeset publish" — ver package.json scripts
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          NPM_TOKEN: ${{ secrets.NPM_TOKEN }}
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
          NPM_CONFIG_PROVENANCE: true
```
Fonte: composição de [CITED: github.com/changesets/action] + [CITED: docs.npmjs.com/generating-provenance-statements/] + padrão OIDC já usado em `docs.yml` (permissions `id-token: write`).

### Smoke test pós-RC (dual CJS/ESM)
```bash
mkdir -p /tmp/mongoat-rc-smoke && cd /tmp/mongoat-rc-smoke
npm init -y >/dev/null
npm install @iamcalegari/mongoat@rc
node -e "const { Database, Model } = require('@iamcalegari/mongoat'); console.log(typeof Database, typeof Model)"
node --input-type=module -e "import { Database, Model } from '@iamcalegari/mongoat'; console.log(typeof Database, typeof Model)"
```
Reaproveita o padrão que `check:package` já faz localmente (dry-run), mas contra o tarball **realmente publicado** no dist-tag `rc` — fecha o D-02 ("smoke de import CJS e ESM").

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| `NPM_TOKEN` (automation token) + `--provenance` via OIDC atestation | npm **Trusted Publishing** — zero token de longa duração, 100% OIDC | GA em 31/jul/2025 [CITED: github.blog/changelog/2025-07-31-npm-trusted-publishing-with-oidc-is-generally-available/] | Elimina o risco de vazamento de `NPM_TOKEN`; não adotado nesta fase por decisão travada (D-04), mas é o caminho natural de uma fase futura de hardening de supply-chain — requer npm CLI ≥ 11.5.1 (upgrade explícito no workflow) |

**Deprecated/outdated:**
- Nenhum. O stack de release (changesets, provenance via OIDC) já é o estado da arte atual para pacotes npm públicos; o único "mais novo ainda" é Trusted Publishing, tratado como não-adotado por decisão do usuário.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `1.0.34-alpha` é uma tag "alpha" simples sem outros identificadores; nenhuma versão alpha usa formato diferente (ex.: `1.0.10-alpha.1`) que mudaria o matching de range | Runtime State Inventory / Pitfall 1 | Se houver formato inconsistente entre as 34 versões, o loop de `npm deprecate` por versão exata ainda funciona (não depende de range), então o risco é baixo mesmo se esta suposição estiver errada |
| A2 | O texto exato do doc oficial do `npm deprecate` ("SemVer ranges include prerelease versions", exemplo `1.x`→`1.0.0-beta.0`) está desatualizado ou descreve um comportamento server-side diferente do node-semver client-side testado localmente | Pitfall 1 | Se a doc estiver certa e o registry realmente casar ranges com prereleases (ao contrário do node-semver puro), a recomendação de "depreciar por versão exata" ainda é segura (só um pouco mais verbosa) — **não há downside em segui-la mesmo que a doc esteja certa** |
| A3 | Estratégia (a) do Pattern 3 (manter o Environment/required-reviewer permanentemente, não só na 1ª release) é aceitável como interpretação de D-03 | Pattern 3 | Se o usuário realmente quer publish 100% automático a partir da 2ª release (sem clique nenhum), o planner deve confirmar com o usuário/CONTEXT antes de implementar (a) como definitivo — incluir como pergunta de discuss-phase se ainda não resolvida |
| A4 | Remover os 2 `@deprecated` (`defineModel`, `Model.create`) é preferível a mantê-los documentados, dado que é a primeira release estável e alpha permite breaking changes livremente | Don't Hand-Roll / D-06 | Se o autor preferir manter compatibilidade retroativa por mais um ciclo, a remoção quebraria consumidores que ainda usam a API deprecated — mas nenhum consumidor externo real existe ainda (0 downloads históricos relevantes fora do próprio autor), risco baixo |

**Se esta tabela estivesse vazia:** não está — 4 itens exigem atenção do planner/usuário, nenhum bloqueia o planejamento (todos têm mitigação segura mesmo se a suposição estiver errada).

## Open Questions

1. **`changeset version` bumpa `1.0.34-alpha` → `1.1.0` de fato, ou precisa de passo extra?**
   - What we know: **Verificado por execução local** que `semver.inc('1.0.34-alpha', 'minor') === '1.1.0'` e `semver.inc('1.0.34-alpha', 'preminor', 'rc') === '1.1.0-rc.0'` — a mesma lib (`semver`) que o changesets usa internamente para calcular bumps.
   - What's unclear: não foi possível rodar `npx changeset version` de ponta a ponta neste ambiente de pesquisa (exigiria inicializar `.changeset/` e um changeset real no repo, o que é uma ação de execução, não de pesquisa).
   - Recommendation: o plano deve incluir um passo de **dry-run real** (`npx changeset version` numa branch descartável, revisar o `package.json` resultante, depois reverter) antes de confiar cegamente na mecânica — a matemática bate, mas a integração `@changesets/cli` ↔ `package.json` real do projeto vale uma confirmação de 1 comando.

2. **`npm deprecate` por range realmente ignora prereleases no registry real, ou só no `node-semver` local?**
   - What we know: confirmado localmente (node-semver 7.8.5) que ranges como `<1.1.0`, `1.x`, `1.0.x-alpha` não casam com nenhuma das 34 versões `1.0.x-alpha`; a doc oficial do `npm deprecate` afirma o contrário com um exemplo (`1.x` deprecando `1.0.0-beta.0`).
   - What's unclear: se o backend do registry npm usa exatamente o `node-semver` (mais provável) ou uma lógica de matching própria mais permissiva para este comando específico.
   - Recommendation: **não depender do range de forma alguma** — usar o loop de versão exata (Pitfall 1) independentemente da resposta a esta pergunta; é a estratégia 100% segura em ambos os cenários. Opcionalmente, testar com 1 versão real via `--dry-run` (se o comando suportar) antes do loop completo.

3. **Estratégia (a) vs (b) do Pattern 3 (Environment permanente vs remoção pós-1ª-release)?**
   - What we know: D-03 diz "a primeira release é publicada por disparo/aprovação explícita... os releases seguintes publicam automaticamente".
   - What's unclear: se "automaticamente" significa literalmente zero clique nas releases seguintes, ou se um clique de aprovação (Environment sempre presente) ainda conta como "automático" o suficiente.
   - Recommendation: levar para discuss-phase/confirmação explícita com o autor antes de fixar (a) como definitivo no plano; (a) é a opção mais simples e seguramente aceitável como fallback.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| npm CLI (local dev) | `npm deprecate`, testes locais de `check:package` | ✓ | 10.9.7 | — |
| npm CLI (GitHub Actions, Node 22.x) | `npm publish --provenance` | ✓ (npm 10.x empacotado) | ~10.x | Suficiente para `--provenance` (requer ≥9.5); Trusted Publishing (≥11.5.1) exigiria upgrade explícito, não usado nesta fase |
| Node.js 20.x/22.x | build/test/publish | ✓ | já usado em `ci.yml`/`docs.yml` | — |
| GitHub CLI (`gh`) | verificação de visibilidade do repo | ✓ | — | — |
| GitHub Environments com required reviewers | Pattern 3 (gate D-03) | ✓ (repo público → disponível em qualquer plano) [VERIFIED: `gh repo view --json visibility` → `PUBLIC`] | — | — |
| `NPM_TOKEN` secret | publish em CI | ✗ (ainda não criado) | — | Criar antes do 1º `push` que dispare `release.yml`; sem fallback — bloqueia o publish até existir |

**Missing dependencies with no fallback:**
- `NPM_TOKEN` secret do repositório — precisa ser criado nas GitHub Settings antes de o workflow de release rodar pela primeira vez.

**Missing dependencies with fallback:**
- npm CLI ≥ 11.5.1 para Trusted Publishing — não necessário nesta fase (D-04 usa `NPM_TOKEN` + provenance clássico, que já funciona com npm 10.x).

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.10 (já configurado, `vitest.config.ts`) |
| Config file | `vitest.config.ts` |
| Quick run command | `npm test` |
| Full suite command | `npm test -- --coverage` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| REL-01 | Pipeline changesets publica no merge do Version Packages PR | manual/CI (não unit-testável) | `gh workflow run release.yml` (dry-run em branch descartável) ou observar 1ª execução real | ❌ Wave 0 — é validação de infraestrutura, não de código |
| REL-03 | RC (`1.1.0-rc.0`) instala e importa (CJS+ESM) corretamente | smoke manual/script | `npm install @iamcalegari/mongoat@rc && node -e "require(...)"` (ver Code Examples) | ❌ Wave 0 — não existe hoje, é script novo do release, não teste vitest |
| REL-04 | `npm deprecate` marca as 34 alphas corretamente | smoke manual pós-execução | `npm view @iamcalegari/mongoat@<versão> deprecated` amostrado em algumas versões | ❌ Wave 0 — verificação pontual, não automatizável em CI (mutação irreversível no registry) |
| D-06 (remoção de `defineModel`/`Model.create`) | Barrel não exporta mais os métodos removidos; testes que os exercitavam são removidos/atualizados | unit (regressão) | `npm test -- test/database/proxy-binding.test.ts test/model/registry-config.test.ts` | ✅ já existem (`test/database/proxy-binding.test.ts`, `test/model/registry-config.test.ts`) — precisam ser **atualizados ou removidos**, não apenas mantidos, se a remoção for a decisão tomada |

### Sampling Rate
- **Per task commit:** `npm run lint && npm run typecheck && npm test` (sem coverage — mais rápido)
- **Per wave merge:** `npm run build && npm run check:package && npm test -- --coverage`
- **Phase gate:** suíte completa verde + `check:package` verde + smoke real do RC publicado (Code Examples) antes de promover para `1.1.0` estável

### Wave 0 Gaps
- [ ] Nenhum arquivo de teste novo necessário para a mecânica de release em si (é infraestrutura CI/CLI, não código testável por vitest)
- [ ] Se D-06 resultar em remoção de `defineModel`/`Model.create`: atualizar/remover `test/database/proxy-binding.test.ts` e `test/model/registry-config.test.ts` — via `grep` confirmado que são os únicos dois arquivos de teste que referenciam essas APIs
- [ ] Script de smoke test pós-RC (Code Examples) — não existe hoje, recomenda-se criar como script descartável (não faz parte da suíte vitest, roda manualmente ou como step do `release.yml`)

*(Nenhum gap bloqueia o planejamento — todos são scripts/passos manuais de release, não lacunas de cobertura de código.)*

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | não | N/A — não há autenticação de usuário final nesta fase |
| V3 Session Management | não | N/A |
| V4 Access Control | sim (indireto) | `npm deprecate` exige ser owner do pacote; `NPM_TOKEN` deve ter escopo mínimo (não "automation" full-access se um "granular access token" escopado a `@iamcalegari/mongoat` com permissão só de publish estiver disponível) |
| V5 Input Validation | não | N/A — fase não introduz parsing de input externo |
| V6 Cryptography | sim (indireto) | Provenance usa assinatura Sigstore/OIDC internamente — não é hand-rolled, é gerenciado 100% pelo `npm publish --provenance` + GitHub OIDC; nenhuma implementação própria de cripto |

### Known Threat Patterns for release engineering

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| `NPM_TOKEN` vazado (log, workflow malicioso, PR de fork) | Elevation of Privilege / Information Disclosure | Token granular com escopo mínimo (só publish do pacote específico); nunca usado em workflows disparados por `pull_request` de forks (`release.yml` só dispara em `push` para `main`, que já é o padrão do `ci.yml`) |
| Publish acidental de uma branch não confiável | Tampering | `release.yml` restrito a `push: branches: [main]`; gate de Environment (D-03) reduz ainda mais a superfície para a release mais crítica |
| Supply-chain attack via `changesets/action` (Action de terceiro na cadeia de publish) | Tampering | Pin por tag major (`@v1`) da org oficial `changesets/`; considerar pin por SHA se o projeto quiser hardening adicional (não obrigatório, mas mencionado como opção) |
| Typosquat nos novos devDependencies | Spoofing | Gate de legitimidade já executado nesta pesquisa (`@changesets/cli`, `@changesets/changelog-github` — ambos OK) |

## Sources

### Primary (HIGH confidence — verificado por execução local)
- Execução local de `node -e "require('semver')..."` contra `/home/alan/Dev/mongoat/node_modules/semver@7.8.5` — bumps `minor`/`preminor` e comportamento de `satisfies()` com pre-releases
- `npm view @iamcalegari/mongoat dist-tags/versions/repository --json` — estado real do registry (34 versões, dist-tag `latest`, repository field)
- `npm view @changesets/cli version` / `npm view @changesets/changelog-github version` — versões atuais confirmadas
- `gh repo view --json visibility` — confirma repo público (Environments gratuitos)
- Gate de legitimidade (`gsd-tools query package-legitimacy check`) — ambos pacotes `OK`

### Secondary (MEDIUM confidence — documentação oficial via WebSearch)
- github.com/changesets/changesets/blob/main/docs/config-file-options.md
- github.com/changesets/changesets/blob/main/docs/prereleases.md
- github.com/changesets/action
- docs.npmjs.com/cli/v11/commands/npm-deprecate/ (nota: exemplo específico sobre prerelease contradiz o node-semver testado localmente — ver Pitfall 1/Open Question 2)
- docs.npmjs.com/generating-provenance-statements/
- docs.npmjs.com/trusted-publishers/
- github.blog/changelog/2025-07-31-npm-trusted-publishing-with-oidc-is-generally-available/
- docs.github.com/en/actions/reference/workflows-and-actions/deployments-and-environments

### Tertiary (LOW confidence — blogs/tutoriais, usados só como confirmação cruzada, nunca como única fonte)
- blog.ignacemaes.com, tsevdos.me, philna.sh, remarkablemark.org (posts sobre changesets + provenance + trusted publishing — usados para triangular o comportamento oficial, nenhuma claim depende exclusivamente deles)

## Metadata

**Confidence breakdown:**
- Mecânica de bump (D-01/D-02): HIGH — verificado por execução local do `semver`, a mesma lib usada internamente pelo changesets
- Deprecação de pre-releases (D-05): HIGH no diagnóstico do problema (verificado localmente); MEDIUM na causa raiz exata do lado do registry (doc oficial diverge do node-semver — mitigação recomendada é segura em ambos os cenários)
- Provenance/OIDC (D-04): MEDIUM-HIGH — documentação oficial npm consistente entre múltiplas fontes, reaproveita padrão já validado em `docs.yml`
- Fluxo changesets/action + gated publish (D-03): MEDIUM — documentação oficial clara sobre a mecânica base; a estratégia exata de "gated só na 1ª vez" (Pattern 3) é uma escolha de design documentada, não um fato verificável

**Research date:** 2026-07-08
**Valid until:** ~30 dias (ecossistema changesets/npm é estável, mas Trusted Publishing é uma área em evolução ativa — reconfirmar versões de `@changesets/cli` e npm CLI se a fase não for executada em breve)
