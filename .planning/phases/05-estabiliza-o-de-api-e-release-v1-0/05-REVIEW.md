---
phase: 05-estabiliza-o-de-api-e-release-v1-0
reviewed: 2026-07-13T07:40:00Z
depth: standard
files_reviewed: 16
files_reviewed_list:
  - src/database/index.ts
  - src/model/index.ts
  - test/database/proxy-binding.test.ts
  - test/model/registry-config.test.ts
  - docs/migration.md
  - MIGRATION.md
  - .changeset/config.json
  - .github/workflows/release.yml
  - .github/workflows/deprecate-alphas.yml
  - scripts/smoke-rc.mjs
  - scripts/deprecate-alphas.mjs
  - eslint.config.mjs
  - package.json
  - docs/explanation/versioning.md
  - docs/.vitepress/config.mts
  - README.md
findings:
  critical: 0
  warning: 6
  info: 7
  total: 13
status: issues_found
---

# Phase 5: Code Review Report

**Reviewed:** 2026-07-13T07:40:00Z
**Depth:** standard
**Files Reviewed:** 16
**Status:** issues_found

## Summary

Review adversarial da Fase 5 (estabilização de API e release 1.1.0). A remoção das duas APIs `@deprecated` (`Database.defineModel()` e `Model.create()`) está limpa no código de runtime — nenhuma referência dangling em `src/`, testes atualizados, migration guide cobre a mudança. O pipeline de release (changesets + `release.yml` gated + provenance OIDC) e os scripts (`smoke-rc.mjs`, `deprecate-alphas.mjs`) são sólidos e a release 1.1.0 já foi executada com sucesso.

Nenhum Critical. Os problemas encontrados se concentram em: **(1)** superfície de API congelada com resíduo — o tipo `ModelSetup` (props exclusivas do `defineModel` removido) continua exportado do barrel raiz e agora está preso no contrato semver da 1.1.0; **(2)** docs de migração publicadas ainda afirmam que a 1.1.0 "não foi lançada" e que a versão corrente é `1.0.34-alpha` — exatamente a página para onde a mensagem de deprecação das 34 alphas aponta; **(3)** pacote publicado como MIT sem arquivo LICENSE no repo nem no tarball; **(4)** lacunas de robustez no pipeline (publish sem gate de testes; actions de terceiros não pinadas por SHA segurando um token bypass-2FA); **(5)** `isSameConfig` não compara `hooks`/`onHookError`, reintroduzindo para hooks a mesma classe de mascaramento silencioso que D-06/WR-04 eliminou para defaults/índices.

## Narrative Findings (AI reviewer)

## Warnings

### WR-01: Docs de migração publicadas afirmam que a 1.1.0 não foi lançada (conteúdo stale pós-release)

**File:** `docs/migration.md:3-17`, `MIGRATION.md:3-10`, `docs/migration.md:26,180`, `MIGRATION.md:19`
**Issue:** A 1.1.0 já está em `latest` e as 34 alphas foram deprecadas com uma mensagem que aponta para `https://iamcalegari.github.io/mongoat/migration` — mas essa página (e o `MIGRATION.md` da raiz) ainda diz:
- "Mongoat is currently published as **`1.0.34-alpha`**" (linha 3 de ambos);
- "**Status: living document.** 1.1.0 is not released yet" (docs/migration.md:15, MIGRATION.md:7);
- Seção 3 marcada como "_(in progress)_" com verbos no futuro ("`toObjectId(value)` **will** validate…"), descrevendo como pendente um comportamento que já shipou.

Todo usuário de alpha que rodar `npm install` verá o warning de deprecação, clicará no link e cairá numa página que nega a existência da release para a qual está sendo mandado migrar.
**Fix:** Atualizar os dois arquivos: remover o banner "not released yet"/"living document", trocar "currently published as 1.0.34-alpha" por texto pós-release ("The `1.0.x-alpha` line is deprecated — `1.1.0` is the current stable release"), remover as tags "_(in progress)_" do TOC e do heading da seção 3, e converter os verbos futuros ("will validate") para presente.

### WR-02: Pacote publicado como MIT sem arquivo LICENSE (nem no repo, nem no tarball)

**File:** `package.json:11,64-66`, `README.md:158`
**Issue:** `"license": "MIT"` está declarado e o README linka "[MIT](…/package.json)" — mas não existe arquivo `LICENSE` trackeado no repositório (`git ls-files | grep -i license` retorna vazio). Com `"files": ["lib"]`, o tarball da 1.1.0 foi publicado sem texto de licença (o npm só inclui LICENSE automaticamente quando o arquivo existe). Um identificador SPDX sem o texto da licença é juridicamente frágil: a MIT exige que o copyright notice e o texto de permissão acompanhem o software.
**Fix:** Adicionar `LICENSE` na raiz com o texto MIT + copyright do autor (o npm o inclui automaticamente no próximo publish) e apontar o link do README para ele:
```markdown
[MIT](https://github.com/iamcalegari/mongoat/blob/main/LICENSE)
```

### WR-03: Tipo órfão `ModelSetup` continua exportado do barrel raiz — API morta congelada no contrato semver da 1.1.0

**File:** `src/index.ts:19`, `src/types/index.ts:15`, `src/types/model.ts:69-77`
**Issue:** `ModelSetup` era o tipo de props exclusivo do `Database.defineModel()` removido nesta fase. A remoção tirou o método mas deixou o tipo exportado do entrypoint raiz — que, pela própria política publicada em `docs/explanation/versioning.md:24-30`, agora é parte do contrato semver ("If a symbol is exported from that barrel, it's part of the semver contract"). Removê-lo depois exigirá um MAJOR por causa de um tipo que não tem mais nenhum consumidor no código. `docs/explanation/proxy-gating.md:100` ainda o referencia como parte da Reference, reforçando o símbolo morto na doc pública.
**Fix:** Remover `ModelSetup` de `src/index.ts`, `src/types/index.ts` e `src/types/model.ts` (e a menção em `proxy-gating.md`) o quanto antes. Como a 1.1.0 acabou de sair e o tipo é inutilizável (não há mais API que o aceite), tratar como correção imediata em vez de deixá-lo fossilizar no contrato — quanto mais releases passarem, mais custosa a remoção fica sob a política declarada.

### WR-04: `isSameConfig` ignora `hooks` e `onHookError` — re-registração com hooks divergentes é descartada em silêncio

**File:** `src/model/index.ts:210-244`, `src/model/index.ts:350-370`
**Issue:** O comparador de re-registração cobre `allowedMethods`, `validator`, `documentDefaults` e `indexes` — mas não `props.hooks` nem `props.onHookError`. Um segundo `new Model({ collectionName: 'users', schema, hooks: { [METHODS.INSERT]: { pre: [hashPassword] } } })` para uma collection já registrada com o mesmo schema retorna a instância existente e **descarta os hooks silenciosamente** (o early-return em `src/model/index.ts:352-362` abandona o `this` antes do bloco que popula `this.hooks`). É exatamente a classe de mascaramento que D-06/WR-04 eliminou para `documentDefaults`/`indexes` — um hook de segurança (hash de senha, auditoria) pode simplesmente nunca ser registrado, sem erro.
**Fix:** Funções não são comparáveis estruturalmente, então a política precisa ser explícita: ou (a) lançar `MongoatValidationError` (`MODEL_CONFIG_CONFLICT`) quando a config candidata declara `hooks`/`onHookError` e uma instância já existe (registro de hooks numa re-registração nunca é intencionalmente no-op), ou (b) mesclar os hooks candidatos na instância existente (mesma semântica acumulativa de `.pre()`/`.post()`). A opção (a) é a mais coerente com o espírito fail-loud do D-06. No mínimo, documentar o comportamento no JSDoc de `CreateModelProps.hooks`.

### WR-05: `release.yml` publica sem gate de testes — apenas build + check:package rodam antes do `changeset publish`

**File:** `.github/workflows/release.yml:43-51`
**Issue:** O job de release roda `npm ci` → `npm run build` → `npm run check:package` → publish. Não roda `npm test` nem `npm run typecheck`. Os testes vivem num `ci.yml` separado que dispara em paralelo no mesmo push — não há dependência entre os workflows, então nada impede publicar um commit cujos testes estão vermelhos. Hoje o Environment `npm-publish` exige um clique humano (que em tese confere o CI antes de aprovar), mas o próprio comentário do arquivo (linhas 12-14) documenta o plano de remover o required reviewer para releases "zero-clique" — nesse cenário, um push quebrado na main publicaria direto no npm.
**Fix:** Adicionar o gate no próprio job, antes da changesets/action:
```yaml
      - run: npm run typecheck
      - run: npm test
```
(ou condicionar o job de release à conclusão verde do `ci.yml` via `workflow_run`/reusable workflow). Essencial fazer isso **antes** de remover o required reviewer.

### WR-06: Actions de terceiros não pinadas por SHA em workflows que seguram um token npm bypass-2FA

**File:** `.github/workflows/release.yml:33,37,49`, `.github/workflows/deprecate-alphas.yml:30,32`
**Issue:** `changesets/action@v1`, `actions/setup-node@v4` e `actions/checkout@v5` são referenciadas por tag mutável. Os dois workflows expõem `secrets.NPM_TOKEN` — um token granular com **bypass de 2FA** e permissão de publish/deprecate no pacote. Uma tag `v1` re-apontada num compromisso da `changesets/action` (classe de ataque já vista em `tj-actions/changed-files`, 2025) exfiltraria um token capaz de publicar versões maliciosas de `@iamcalegari/mongoat` sem 2FA. O gate de Environment não mitiga: o reviewer aprova o job sem ver o que a tag resolve naquele momento.
**Fix:** Pinar por SHA completo com comentário da versão, priorizando a action que toca o token:
```yaml
      - uses: changesets/action@e0538e686673de0265c8a3e2904b8c76beaa43fd # v1.5.3
```
(idem para checkout/setup-node) e habilitar Dependabot para `github-actions` manter os SHAs atualizados. Complementarmente, restringir o escopo/validade do token no npm.

## Info

### IN-01: Typo "ligthweight" na description publicada no npm

**File:** `package.json:4`
**Issue:** `"description": "A ligthweight ODM library for MongoDB"` — "ligthweight" → "lightweight". O typo já está na metadata da 1.1.0 no registry (aparece na busca do npm e no card do pacote).
**Fix:** Corrigir para `"A lightweight ODM library for MongoDB"`; sai no próximo publish.

### IN-02: Âncora quebrada no TOC do MIGRATION.md

**File:** `MIGRATION.md:19,145`
**Issue:** O TOC linka `[Input validation _(in progress)_](#3-input-validation-in-progress)`, mas o heading da seção é `## 3. Input validation` (sem o sufixo) — a âncora gerada pelo GitHub é `#3-input-validation`, então o link do TOC não navega. (Em `docs/migration.md` heading e âncora ainda batem entre si, mas ambos carregam o "_(in progress)_" stale — coberto no WR-01.)
**Fix:** Ao remover as tags "_(in progress)_" (WR-01), alinhar TOC e headings nos dois arquivos.

### IN-03: Política de versionamento diz "deprecate against the exact affected version range" — contradiz a abordagem por versão exata

**File:** `docs/explanation/versioning.md:89-92`
**Issue:** A página de política afirma que linhas descontinuadas são marcadas "with `npm deprecate` against the exact affected version **range**". O próprio `scripts/deprecate-alphas.mjs:1-10` documenta o pitfall que motivou o design oposto: ranges **não casam pre-releases** e depreciam zero versões silenciosamente. Um mantenedor futuro seguindo a política ao pé da letra reproduziria o bug que o script existe para evitar.
**Fix:** Trocar por "against each exact affected version (never a semver range — ranges silently skip pre-releases)".

### IN-04: `getAlphaVersions` quebra se `npm view versions --json` retornar string (pacote com uma única versão)

**File:** `scripts/deprecate-alphas.mjs:31-43`
**Issue:** Quando um pacote tem exatamente uma versão publicada, `npm view <pkg> versions --json` emite uma string JSON (`"1.0.0"`), não um array — `versions.filter` lançaria `TypeError: versions.filter is not a function`. Não afetou a execução real (34 versões), e a operação já foi consumada; fica registrado para reuso futuro do script.
**Fix:** `const list = Array.isArray(versions) ? versions : [versions];` antes do filter.

### IN-05: Passo de amostragem do deprecate aborta (em vez de re-tentar) se `npm view` falhar transitoriamente; amostras hardcoded

**File:** `.github/workflows/deprecate-alphas.yml:49-66`
**Issue:** Sob o shell padrão do Actions (`bash -e`), `msg=$(npm view … deprecated)` com falha de rede encerra o script na hora — o retry/backoff só cobre o caso de saída vazia (réplica atrasada), não o de comando falho. Além disso, as três versões de amostra (`1.0.0-alpha 1.0.17-alpha 1.0.34-alpha`) são hardcoded e divergiriam silenciosamente se a lista real mudasse. Operação já consumada com sucesso — registrado como melhoria.
**Fix:** `msg=$(npm view … deprecated || true)` para que falhas transitórias caiam no caminho de retry; opcionalmente derivar as amostras da mesma listagem do script.

### IN-06: `smoke-rc.mjs` não verifica QUAL versão o dist-tag `rc` resolveu

**File:** `scripts/smoke-rc.mjs:12,20-48`
**Issue:** O smoke instala `@iamcalegari/mongoat@rc` e valida import CJS/ESM, mas nunca confere a versão instalada. Se o dist-tag `rc` estiver stale (apontando para um RC anterior), o smoke "passa" validando o tarball errado — exatamente o tipo de falso-positivo que um gate de release não deve ter. Hoje `rc` aponta para `1.1.0-rc.0` e a validação real já ocorreu; relevante para os próximos ciclos de RC.
**Fix:** Após o install, ler `require('@iamcalegari/mongoat/package.json').version` (ou `npm ls --json`) e comparar com a versão esperada, aceita via argv/env (`node scripts/smoke-rc.mjs 1.2.0-rc.0`).

### IN-07: `Database.registerModel()` público substitui uma entrada existente do registry sem passar pela detecção de conflito (D-06)

**File:** `src/database/index.ts:202-216`
**Issue:** A checagem `isSameConfig`/`MODEL_CONFIG_CONFLICT` vive apenas no construtor de `Model`. `registerModel()` é público e documentado ("If you want to register a model manually…") e faz `Map.set` incondicional — chamar `db.registerModel(outroModel)` para um `collectionName` já registrado substitui a entrada silenciosamente, contornando toda a proteção D-06 e deixando referências antigas apontando para uma instância órfã. Como agora está congelado no contrato 1.1.0, vale ao menos documentar.
**Fix:** Lançar `MongoatValidationError` (`MODEL_CONFIG_CONFLICT`) quando `Database[KModelMap].has(model.collectionName)` e a entrada não for o mesmo objeto — ou documentar explicitamente no JSDoc que re-registrar substitui a entrada.

---

_Reviewed: 2026-07-13T07:40:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
