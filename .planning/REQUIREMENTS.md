# Requirements — Mongoat v1.0

**Defined:** 2026-07-03
**Milestone:** v1.0 estável + diferenciais (decorators, plugins, docs site)

"Dev" = desenvolvedor que consome a lib.

## v1 Requirements

### Hooks & Extensibilidade

- [x] **HOOK-01**: Dev pode registrar múltiplos handlers `pre` por método; executam em ordem de registro, aguardados sequencialmente em todos os caminhos (incluindo `insertMany`)
- [x] **HOOK-02**: Dev pode registrar hooks `post` em todos os métodos CRUD, com acesso ao resultado da operação via contexto do hook
- [x] **HOOK-03**: Erro lançado em pre-hook aborta a operação antes da chamada ao driver; erro em post-hook propaga ao caller por padrão
- [x] **HOOK-04**: Dev pode registrar post-hook `fireAndForget` (opt-in explícito) cujos erros não propagam
- [x] **HOOK-05**: Executor de hooks tem guard contra recursão infinita quando um hook chama métodos do próprio model

### API Thin (controle nativo)

- [x] **API-01**: Todos os métodos do Model aceitam e repassam as options nativas do driver, com tipos do driver (`FindOptions`, `AggregateOptions`, `BulkWriteOptions`, etc.)
- [x] **API-02**: Dev pode acessar a `Collection` nativa via `model.getCollection()` (bypass de hooks/gating, documentado como tal)
- [x] **API-03**: Dev pode acessar `MongoClient` e `Db` nativos via `database.getClient()` / `database.getDb()`
- [x] **API-04**: Todos os métodos públicos têm tipos de retorno TS precisos e consistentes (ex.: `find()` retorna `Promise<WithId<T> | null>`, sem união com `null` síncrono)

### Qualidade

- [x] **QUAL-01**: Bugs conhecidos de `.planning/codebase/CONCERNS.md` corrigidos: pre-hooks não aguardados em `insertMany`, binding perdido no proxy handler, tipo de retorno de `find()`, race condition do registry estático, mutação de schema em `includeAdditionalPropertiesFalse`
- [x] **QUAL-02**: Suíte de testes unitários + integração (vitest + mongodb-memory-server) cobrindo todos os métodos públicos, incluindo cenários de erro e concorrência
- [x] **QUAL-03**: CI (GitHub Actions) executa testes, lint e build em todo push/PR
- [x] **QUAL-04**: Dependência `json-schema` 0.4.0 removida do runtime (validação é server-side via `$jsonSchema`)

### Segurança

- [x] **SEC-01**: Filtros fornecidos pelo usuário podem ser sanitizados (utilitário `sanitizeFilter`); `$where` é rejeitado incondicionalmente pela lib
- [x] **SEC-02**: Conversão de ObjectId valida com `ObjectId.isValid` e lança erro tipado e documentado em entrada inválida
- [x] **SEC-03**: Erros re-lançados não expõem stack traces nem detalhes internos (mensagens sanitizadas; sem `JSON.stringify` do erro inteiro)
- [x] **SEC-04**: `setupIndexes` compara índices existentes vs desejados e só recria o que mudou (sem drop-recreate incondicional)

### Release Engineering

- [x] **REL-01**: Pipeline de release com changesets: CHANGELOG gerado, versionamento via PR, publicação npm automatizada no merge
- [x] **REL-02**: Build dual CJS/ESM (tsdown) com `exports` map correto, validado por `are-the-types-wrong` como gate de CI
- [x] **REL-03**: `v1.0.0-rc` publicado com auditoria de API (diff alpha→v1) antes da tag final
- [x] **REL-04**: `v1.0.0` estável publicada no npm com política semver documentada e versões alpha deprecadas (`npm deprecate`)

### Schema Decorators (TC39)

- [ ] **DECO-01**: Dev pode definir schema via decorators TC39 padrão (`@Schema`, `@Prop`/`@BsonType`, `@Description`, `@Optional`, `@Pattern`) sem `reflect-metadata` e sem flags experimentais no tsconfig
- [ ] **DECO-02**: Dev pode registrar hooks no nível da classe via `@Pre`
- [ ] **DECO-03**: Classes decoradas compilam (`Schema.compile`) para o mesmo `ModelValidationSchema` da API de objetos; as duas APIs coexistem como cidadãs de primeira classe
- [ ] **DECO-04**: Construtor do Model aceita classe decorada ou objeto plano de forma transparente

### Plugins

- [ ] **PLUG-01**: Dev pode aplicar plugins por model via `plugins[]` no construtor (aplicados antes do wrap do Proxy)
- [ ] **PLUG-02**: Dev pode registrar plugin global via `Model.plugin()`, com enforcement de ordem (erro claro se chamado após a construção do primeiro model)
- [ ] **PLUG-03**: Plugins recebem contexto tipado e selado (`PluginContext`): podem registrar hooks e statics; não podem mutar schema/validator/allowedMethods

### Documentação

- [x] **DOCS-01**: Site VitePress publicado com quick start e guias do **core da v1.0** (conexão/models, CRUD, hooks pre/post, validação `$jsonSchema`, segurança, escape hatch); decorators/plugins/migrations são documentados quando saem (Fases 6-8)
- [x] **DOCS-02**: Referência de API gerada por TypeDoc (typedoc-plugin-markdown) integrada ao site
- [x] **DOCS-03**: Guia de migração alpha→v1.0 documentando todas as mudanças de API (consolida `CHANGELOG.md`/`MIGRATION.md`)
- [x] **DOCS-04**: README renovado com quick start funcional, apontando para o site (sem o disclaimer "work in progress")

### Migrations (pós-v1.0 — promovido de Out of Scope em 2026-07-08)

- [ ] **MIG-01**: Dev define migrations versionadas com funções `up`/`down` que alteram schema (`$jsonSchema`/índices via `collMod`/`createIndex`) e/ou dados
- [ ] **MIG-02**: A lib aplica migrations pendentes em ordem e reverte com `down`, rastreando o estado aplicado numa collection de controle (idempotente — não re-aplica o que já rodou)
- [ ] **MIG-03**: CLI (`mongoat migrate`) cria, executa (`up`/`down`/`to <versão>`) e mostra o `status` das migrations

## v2 Requirements (deferred)

- **Hooks em transações**: contexto de hook carrega a `session` de `withTransaction` — threading complexo, casos de uso incertos até haver adoção
- **Projection types estritos** (estilo papr v11): alta complexidade de tipos, escopo de major
- **`unregisterModel()` / eviction do registry**: só relevante para apps com centenas de models dinâmicos
- **Connection pooling exposto/documentado** em `DatabaseConfig` (maxPoolSize/minPoolSize com defaults sensatos)

## Out of Scope

- **Populate / referências de documento (`.populate()`, sugar de `$lookup`)** — incentiva padrões relacionais em document DB e N+1 queries; usar `aggregate()` com `$lookup` (já exposto); documentar o padrão
- **Virtual fields / propriedades computadas** — concern da camada de aplicação, não do ODM
- **Query builder chainable (`.where().gt()`)** — DSL paralela que precisa acompanhar o driver; o filtro nativo já é composável e tipado
- **Gerência multi-database/multi-tenant** — instanciar `Database` separados; fora do escopo declarado
- **Validação client-side (class-validator etc.)** — `$jsonSchema` server-side é o caminho MongoDB-native; duplicaria lógica e adicionaria dependência
- **Discriminators / herança de models** — mapeia mal para o modelo de documentos; documentar alternativas
- **Wrapper de change streams** — `collection.watch()` nativo via escape hatch já é ergonômico
- **Suporte a outros bancos** — ODM Mongo-first por definição
- **Features de aplicação (auth, cache, filas, HTTP)** — é uma biblioteca de dados, não um framework

## Traceability

| REQ-ID | Phase | Status |
|--------|-------|--------|
| HOOK-01 | Phase 2 | Complete |
| HOOK-02 | Phase 2 | Complete |
| HOOK-03 | Phase 2 | Complete |
| HOOK-04 | Phase 2 | Complete |
| HOOK-05 | Phase 2 | Complete |
| API-01 | Phase 2 | Complete |
| API-02 | Phase 2 | Complete |
| API-03 | Phase 2 | Complete |
| API-04 | Phase 2 | Complete |
| QUAL-01 | Phase 1 | In Progress (01-01 lançou MongoatError; fixes em 01-03/04/05) |
| QUAL-02 | Phase 3 | Complete |
| QUAL-03 | Phase 3 | Complete |
| QUAL-04 | Phase 1 | Complete |
| SEC-01 | Phase 3 | Complete |
| SEC-02 | Phase 3 | Complete |
| SEC-03 | Phase 3 | Complete |
| SEC-04 | Phase 3 | Complete |
| DOCS-01 | Phase 4 | Complete |
| DOCS-02 | Phase 4 | Complete |
| DOCS-03 | Phase 4 | Complete |
| DOCS-04 | Phase 4 | Complete |
| REL-01 | Phase 5 | Complete |
| REL-02 | Phase 1 | Complete |
| REL-03 | Phase 5 | Complete |
| REL-04 | Phase 5 | Complete |
| DECO-01 | Phase 6 | Pending |
| DECO-02 | Phase 6 | Pending |
| DECO-03 | Phase 6 | Pending |
| DECO-04 | Phase 6 | Pending |
| PLUG-01 | Phase 7 | Pending |
| PLUG-02 | Phase 7 | Pending |
| PLUG-03 | Phase 7 | Pending |
| MIG-01 | Phase 8 | Pending |
| MIG-02 | Phase 8 | Pending |
| MIG-03 | Phase 8 | Pending |

**Coverage:** 35/35 requisitos mapeados (32 do v1.0 + 3 MIG pós-v1.0) — cada um para exatamente uma fase, sem órfãos nem duplicatas.

---
*Requirements defined: 2026-07-03 (32 do v1.0) — Migrations (MIG-01..03) promovido de Out of Scope em 2026-07-08 → 35 requisitos em 9 categorias*
