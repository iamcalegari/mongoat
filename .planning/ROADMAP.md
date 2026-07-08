# Roadmap: Mongoat

## Overview

Mongoat é uma lib brownfield publicada como `@iamcalegari/mongoat@1.0.34-alpha`: um ODM fino sobre o driver oficial do MongoDB, com CRUD completo, hooks `pre`, validação server-side `$jsonSchema` e gating de métodos via Proxy. Este roadmap leva a lib do alpha à **v1.0.0 estável** e aos diferenciais competitivos (site de docs, decorators TC39, plugins, migrations). A jornada segue o grafo de dependências da pesquisa: primeiro consertar o core e modernizar o build (fundação), depois completar o pipeline de hooks e a API thin nativa, então blindar com testes/CI/segurança, **documentar o core e publicar a v1.0 já bem documentada**, e por fim adicionar as camadas aditivas pós-v1.0 — decorators, plugins e migrations — como minors 1.x. Cada fase entrega uma capacidade coerente e verificável; o ponto de não-retorno (contrato semver da v1.0) fica em fase dedicada.

## Phases

**Phase Numbering:**

- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Fundação — Core sem bugs e build moderno** - Corrige bugs conhecidos, remove `json-schema` e configura build dual CJS/ESM (completed 2026-07-07)
- [x] **Phase 2: Sistema de hooks completo e API thin nativa** - Hooks pre/post completos, options nativas em todos os métodos e escape hatch (completed 2026-07-07)
- [x] **Phase 3: Blindagem — testes, CI e segurança** - Suíte unit+integração, GitHub Actions e hardening contra injeção (completed 2026-07-08)
- [ ] **Phase 4: Site de documentação** - README renovado + VitePress + TypeDoc + guia de migração do core v1.0 (antes do release)
- [ ] **Phase 5: Estabilização de API e release v1.0** - Auditoria alpha→v1.0, changesets, RC e publicação estável
- [ ] **Phase 6: API de schema com decorators (TC39)** - `@Schema`/`@Pre`/etc. coexistindo com a API de objetos (aditivo, minor 1.x)
- [ ] **Phase 7: Sistema de plugins** - `plugins[]` por model e `Model.plugin()` global com contrato selado (aditivo, minor 1.x)
- [ ] **Phase 8: Migrations** - schema + data migrations versionadas (up/down), estado rastreado e CLI (aditivo, minor 1.x)

## Phase Details

### Phase 1: Fundação — Core sem bugs e build moderno

**Goal**: A lib compila em formato dual CJS/ESM com `exports` map correto e não tem nenhum bug de correção conhecido — uma base confiável para tudo que vem depois.
**Mode:** mvp
**Depends on**: Nothing (first phase)
**Requirements**: QUAL-01, QUAL-04, REL-02
**Success Criteria** (what must be TRUE):

  1. Documentos transformados por pre-hooks são persistidos corretamente em todos os caminhos de inserção, incluindo `insertMany` (nenhuma cadeia de hooks não aguardada).
  2. Métodos gateados pelo Proxy mantêm o binding correto de `this`, e `find()` retorna um resultado consistente e precisamente tipado.
  3. O pacote instala e importa corretamente em projetos CommonJS e ESM, com os tipos resolvendo sob `are-the-types-wrong` (exports map válido).
  4. O registro de models é livre de race condition e o setup de schema não muta objetos de schema compartilhados (`includeAdditionalPropertiesFalse`).
  5. A lib não carrega mais a dependência de runtime `json-schema`.

**Plans**: 5/5 plans complete
**Wave 1**

- [x] 01-01-PLAN.md — Fundação: tooling install, package manifest dual + MongoatError (Wave 1)

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 01-02-PLAN.md — Build dual CJS/ESM (tsdown) + validação de empacotamento (attw/publint, smoke CJS/ESM) (Wave 2)
- [x] 01-03-PLAN.md — Infraestrutura de teste (vitest + testcontainers Docker) (Wave 2)

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 01-04-PLAN.md — Correções da camada Database (Proxy binding, dbName, registry reset) (Wave 3)

**Wave 4** *(blocked on Wave 3 completion)*

- [x] 01-05-PLAN.md — Correções da camada Model (insertMany hooks, find typing, schema clone, D-06/D-10) (Wave 4)

### Phase 2: Sistema de hooks completo e API thin nativa

**Goal**: O dev ganha um pipeline pre/post de hooks completo e controle total do driver nativo — repassando options em todos os métodos, com escape hatch para `Collection`/`Db`/`MongoClient` e tipos de retorno precisos.
**Mode:** mvp
**Depends on**: Phase 1
**Requirements**: HOOK-01, HOOK-02, HOOK-03, HOOK-04, HOOK-05, API-01, API-02, API-03, API-04
**Success Criteria** (what must be TRUE):

  1. Dev pode registrar múltiplos handlers `pre` e `post` por método CRUD; executam em ordem de registro, aguardados sequencialmente, com os `post` recebendo o resultado da operação.
  2. Um erro em pre-hook aborta a operação antes da chamada ao driver; um erro em post-hook propaga por padrão, exceto quando registrado como `fireAndForget` explícito.
  3. Um hook que chama métodos do próprio model é interrompido por um guard de recursão em vez de entrar em loop infinito.
  4. Todo método do Model aceita e repassa options nativas com os tipos do driver (`FindOptions`, `AggregateOptions`, etc.) e retorna resultados precisa e consistentemente tipados.
  5. Dev acessa a `Collection` nativa via `model.getCollection()` e o `MongoClient`/`Db` nativos via `database.getClient()`/`getDb()`, com bypass documentado de hooks/gating.

**Plans**: 3/3 plans complete

**Wave 1**

- [x] 02-01-PLAN.md — Pipeline pre/post completo: contrato ctx, registro dual, guard de recursão (HOOK-01, HOOK-02, HOOK-05)

**Wave 2** *(blocked on Wave 1)*

- [x] 02-02-PLAN.md — Semântica de erro assimétrica + fireAndForget + onHookError (HOOK-03, HOOK-04)

**Wave 3** *(blocked on Wave 2)*

- [x] 02-03-PLAN.md — API thin nativa: escape hatch + options passthrough + retornos tipados (API-01, API-02, API-03, API-04)

### Phase 3: Blindagem — testes, CI e segurança

**Goal**: O core agora completo é testado de ponta a ponta, verificado continuamente e blindado contra injeção e entrada insegura — o portão de qualidade para uma v1.0 estável.
**Mode:** mvp
**Depends on**: Phase 2
**Requirements**: QUAL-02, QUAL-03, SEC-01, SEC-02, SEC-03, SEC-04
**Success Criteria** (what must be TRUE):

  1. Uma suíte unit+integração (vitest + mongodb-memory-server) exercita todos os métodos públicos, incluindo cenários de erro e concorrência.
  2. CI (GitHub Actions) roda testes, lint e build em todo push e PR, quebrando o build em qualquer regressão.
  3. Filtros fornecidos pelo usuário podem ser sanitizados (`sanitizeFilter`) e `$where` é rejeitado incondicionalmente.
  4. A conversão de ObjectId valida a entrada com `ObjectId.isValid` e lança um erro tipado e documentado em entrada inválida.
  5. Erros re-lançados carregam mensagens sanitizadas (sem stack traces / detalhes internos), e `setupIndexes` só recria índices que de fato mudaram.

**Plans**: 5/5 plans complete

**Wave 1**

- [x] 03-01-PLAN.md — Lint gate funcional + hierarquia de erros tipada + wrapDriverError sanitizado (SEC-03)
- [x] 03-03-PLAN.md — Robustez: regressão setupIndexes incremental (SEC-04) + hook dispatch à prova de falha (WR-02)

**Wave 2** *(blocked on Wave 1)*

- [x] 03-02-PLAN.md — Blindagem de entrada: ObjectId fail-loud + $where guard + sanitizeFilter (SEC-01, SEC-02)

**Wave 3** *(blocked on Wave 2)*

- [x] 03-04-PLAN.md — Cobertura unit+integração (12 métodos: erro + concorrência) + coverage gate (QUAL-02)

**Wave 4** *(blocked on Wave 3)*

- [x] 03-05-PLAN.md — CI GitHub Actions (matriz 20/22) + reconciliação de docs de Node (QUAL-03)

### Phase 4: Site de documentação

**Goal**: A lib entra na v1.0 **bem documentada**: um site publicado + README renovado cobrindo o core estável (conexão, models, CRUD, hooks pre/post, validação `$jsonSchema`, segurança, escape hatch nativo), com referência de API TypeDoc e o guia de migração alpha→v1.0. Documentar o core primeiro também audita a API antes de congelá-la no release.
**Mode:** mvp
**Depends on**: Phase 3
**Requirements**: DOCS-01, DOCS-02, DOCS-03, DOCS-04
**Success Criteria** (what must be TRUE):

  1. Um site VitePress é publicado com quick start e guias do **core da v1.0**: conexão/models, CRUD, hooks pre/post, validação `$jsonSchema`, segurança (`sanitizeFilter`/hierarquia de erros) e escape hatch nativo.
  2. Uma referência de API gerada por TypeDoc (typedoc-plugin-markdown) é integrada ao site.
  3. O guia de migração alpha→v1.0 (consolidando `CHANGELOG.md`/`MIGRATION.md`) documenta todas as mudanças de API.
  4. O README é renovado com um quick start funcional que aponta para o site — sem o disclaimer "work in progress".

**Nota**: features pós-v1.0 (decorators, plugins, migrations — Fases 6-8) são documentadas incrementalmente quando cada uma sai.

**Plans**: TBD

### Phase 5: Estabilização de API e release v1.0

**Goal**: A API do alpha é auditada e estabilizada deliberadamente, e então publicada como v1.0.0 com semver disciplinado e um pipeline de release automatizado.
**Mode:** mvp
**Depends on**: Phase 4
**Requirements**: REL-01, REL-03, REL-04
**Success Criteria** (what must be TRUE):

  1. A API pública é auditada (diff alpha→v1.0), as deprecações resolvidas e um `v1.0.0-rc` é publicado antes da tag final.
  2. `v1.0.0` é publicada no npm com política semver documentada e as versões alpha anteriores deprecadas (`npm deprecate`).
  3. Releases são conduzidas por um pipeline de changesets: CHANGELOG gerado, versionamento via PR e publicação npm automatizada no merge.

**Plans**: TBD

### Phase 6: API de schema com decorators (TC39)

**Goal**: O dev pode definir schemas com decorators TC39 padrão como alternativa de primeira classe à API de objetos, compilando para a mesma representação interna. Feature aditiva pós-v1.0 (minor 1.x).
**Mode:** mvp
**Depends on**: Phase 5
**Requirements**: DECO-01, DECO-02, DECO-03, DECO-04
**Success Criteria** (what must be TRUE):

  1. Dev define um schema com `@Schema`, `@Prop`/`@BsonType`, `@Description`, `@Optional`, `@Pattern` usando decorators TC39 padrão — sem `reflect-metadata` e sem flags experimentais no tsconfig.
  2. Dev registra hooks no nível da classe via `@Pre`.
  3. Uma classe decorada compila (`Schema.compile`) para o mesmo `ModelValidationSchema` da API de objetos; as duas APIs coexistem como cidadãs de primeira classe.
  4. O construtor do Model aceita de forma transparente tanto uma classe decorada quanto um objeto plano.

**Plans**: TBD

### Phase 7: Sistema de plugins

**Goal**: O dev pode estender models com plugins reutilizáveis — por model e globais — através de um contrato de plugin tipado e selado. Feature aditiva pós-v1.0 (minor 1.x).
**Mode:** mvp
**Depends on**: Phase 5 (usa os hook arrays entregues na Phase 2; independente da Phase 6)
**Requirements**: PLUG-01, PLUG-02, PLUG-03
**Success Criteria** (what must be TRUE):

  1. Dev aplica plugins por model via `plugins[]` no construtor, aplicados antes do wrap do Proxy.
  2. Dev registra um plugin global via `Model.plugin()`, com enforcement de ordem (erro claro se chamado após a construção do primeiro model).
  3. Plugins recebem um `PluginContext` tipado e selado: podem registrar hooks e statics, mas não podem mutar schema/validator/allowedMethods.

**Plans**: TBD

### Phase 8: Migrations

**Goal**: O dev ganha um sistema de **migrations versionadas** para evoluir schema (validators/índices) e dados de forma controlada e reversível — a capacidade que faltava para operar a lib em produção ao longo do tempo. Feature aditiva pós-v1.0 (minor 1.x); tirada de "Out of Scope" a pedido do autor.
**Mode:** mvp
**Depends on**: Phase 5 (construída sobre a API v1.0 estável; usa o escape hatch nativo e os models)
**Requirements**: MIG-01, MIG-02, MIG-03
**Success Criteria** (what must be TRUE):

  1. Dev define migrations versionadas com funções `up`/`down` que alteram schema (`$jsonSchema`/índices via `collMod`/`createIndex`) e/ou dados.
  2. A lib aplica migrations pendentes em ordem e reverte com `down`, rastreando o estado aplicado numa collection de controle (idempotente — não re-aplica o que já rodou).
  3. Uma CLI (`mongoat migrate`) cria, executa (`up`/`down`/`to <versão>`) e mostra o `status` das migrations.

**Plans**: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Fundação — Core sem bugs e build moderno | 5/5 | Complete    | 2026-07-07 |
| 2. Sistema de hooks completo e API thin nativa | 3/3 | Complete   | 2026-07-07 |
| 3. Blindagem — testes, CI e segurança | 5/5 | Complete    | 2026-07-08 |
| 4. Site de documentação | 0/TBD | Not started | - |
| 5. Estabilização de API e release v1.0 | 0/TBD | Not started | - |
| 6. API de schema com decorators (TC39) | 0/TBD | Not started | - |
| 7. Sistema de plugins | 0/TBD | Not started | - |
| 8. Migrations | 0/TBD | Not started | - |
