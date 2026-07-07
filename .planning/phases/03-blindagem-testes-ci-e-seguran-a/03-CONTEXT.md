# Phase 3: Blindagem — testes, CI e segurança - Context

**Gathered:** 2026-07-07
**Status:** Ready for planning

<domain>
## Phase Boundary

O core (Fases 1 e 2 completas: bugs corrigidos, build dual, hooks pre/post completos, API thin nativa) é blindado para virar candidato a v1.0: (1) suíte unit+integração cobrindo todos os métodos públicos incluindo erro e concorrência (QUAL-02), (2) CI GitHub Actions rodando test/lint/build em push e PR (QUAL-03), e (3) hardening de segurança contra injeção e entrada insegura — `sanitizeFilter`/`$where` (SEC-01), validação de ObjectId (SEC-02), erros sanitizados e tipados (SEC-03), e `setupIndexes` incremental (SEC-04).

Esta fase clarifica **como** implementar o que já está no ROADMAP — não adiciona capacidades novas (decorators, plugins, release e docs são fases próprias).

</domain>

<decisions>
## Implementation Decisions

### Política de erros (SEC-02, SEC-03) — decididas com o autor
- **D-01 — Hierarquia de erros tipada.** Criar subclasses de `MongoatError`: `MongoatValidationError` (schema/ObjectId inválido, filtro proibido), `MongoatConnectionError` (sem conexão / dbName ausente), `MongoatDriverError` (wrap de erro do driver). O dev discrimina por `instanceof`. Migrar os `throw new MongoatError(...)` atuais para a subclasse apropriada (mantendo `MongoatError` como base pública).
- **D-02 — ObjectId fail-loud.** `toObjectId` valida com `ObjectId.isValid`; em input inválido lança `MongoatValidationError` com mensagem clara. `findById` propaga (NÃO retorna `null` para id malformado — falha explícita, não mascara bug do caller). Validação no ponto único de conversão (`toObjectId`), então todo consumidor herda.
- **D-03 — Mensagem limpa + `cause`.** Erros re-lançados têm `.message` estável e sanitizada (sem stack traces nem detalhes internos); o erro original do driver fica preservado em `.cause` para quem quiser inspecionar. Nunca serializar o erro inteiro (fim definitivo do padrão `JSON.stringify(err)`). `wrapDriverError` da Fase 2 já preserva message+cause — a Fase 3 formaliza via `MongoatDriverError` e garante a sanitização da mensagem.
- **D-04 — `code` estável.** Cada erro carrega um campo `code` estável (string, ex.: `INVALID_OBJECT_ID`, `NOT_CONNECTED`, `FORBIDDEN_OPERATOR`, `VALIDATION_FAILED`, `DUPLICATE_KEY`). O dev programa contra o `code`, independente da mensagem (que pode mudar sem quebrar semver).

### Claude's Discretion — delegadas pelo autor (escolhas abaixo, ajustáveis no planejamento)

#### sanitizeFilter / `$where` (SEC-01)
- **D-05 — `$where` rejeitado incondicionalmente pela lib.** Todo método que recebe `filter` (find, findMany, update, updateMany, delete, deleteMany, total) rejeita `$where` em QUALQUER nível do filtro, lançando `MongoatValidationError` (`code: FORBIDDEN_OPERATOR`). `$where` é execução de JS server-side, sem uso legítimo defensável numa lib de dados. Isto é automático e não-desligável (cumpre o texto "rejeitado incondicionalmente").
- **D-06 — `sanitizeFilter` é utilitário OPT-IN.** Exportado de `@utils`, aplicado pelo dev ao input não-confiável (query string HTTP, body) — NÃO automático em todos os métodos. Respeita o core value "não esconder o driver": sanitização automática agressiva quebraria queries legítimas com operadores. O dev escolhe onde aplicar.
- **D-07 — Escopo do `sanitizeFilter`.** Neutraliza os vetores de execução de código (`$where`, `$function`, `$accumulator`, `$expr` contendo `$function`) e, de forma configurável, remove chaves de topo iniciadas por `$` vindas de objeto não-confiável (query-injection clássico). PRESERVA operadores de query normais (`$gt`, `$in`, `$and`, `$or`, ...) — senão seria inútil. Documentar claramente o que sana e o que não.

#### Cobertura de testes (QUAL-02)
- **D-08 — Testcontainers, não mongodb-memory-server.** Manter a infra da Fase 1 (MongoDB real em Docker via testcontainers) apesar do texto do requisito citar `mongodb-memory-server` — testcontainers é mais fiel ao driver v7 real. Divergência intencional e documentada.
- **D-09 — Alvo de cobertura.** Todos os 12 métodos públicos do `Model` + métodos públicos do `Database`, cada um com happy path + ≥1 cenário de erro; concorrência onde há estado compartilhado (registro concorrente de model, operações CRUD paralelas). Fechar as "Test Coverage Gaps" do CONCERNS.md.
- **D-10 — Threshold como gate.** Habilitar `@vitest/coverage-v8` (já instalado) com threshold no CI. Ponto de partida ~80% lines/functions/statements, ~70% branches (o planner/pesquisa refina) — evitar 100%, que incentiva testes vazios.

#### CI GitHub Actions (QUAL-03)
- **D-11 — Matriz Node 20 e 22.** Alinhado ao `engines: ^20.19.0 || >=22.12.0` real (definido na Fase 1). A lib NÃO suporta mais 16. ⚠️ Reconciliar: PROJECT.md/CLAUDE.md ainda dizem "Node >=16.20.1" — o `engines` do package.json vence; atualizar a doc nesta fase.
- **D-12 — Um fluxo, runner com Docker.** `ubuntu-latest` (tem Docker) roda os testes de integração via testcontainers diretamente. Job único: install → lint → typecheck → build → test (com coverage) → gate `check:package` (attw + publint, cumpre o gate de CI prometido em REL-02). Não separar unit/integração inicialmente (a suíte roda em ~8s).
- **D-13 — Triggers push + PR para `main`,** quebrando o build em qualquer regressão (test/lint/build/attw/threshold).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requisitos e metas da fase
- `.planning/REQUIREMENTS.md` — QUAL-02, QUAL-03, SEC-01, SEC-02, SEC-03, SEC-04 (definições canônicas)
- `.planning/ROADMAP.md` §"Phase 3" — goal e os 5 success criteria

### Segurança / hardening
- `.planning/codebase/CONCERNS.md` — riscos originais: `toObjectId` sem validação, stringify de erros, filtros sem sanitização, `setupIndexes` drop-recreate, lacunas de teste
- `.planning/phases/01-funda-o-core-sem-bugs-e-build-moderno/01-SECURITY.md` — threat model STRIDE já mitigado na Fase 1 (evitar regressão / reaproveitar padrões)
- `.planning/phases/02-sistema-de-hooks-completo-e-api-thin-nativa/02-REVIEW.md` — warnings advisory (WR-02 onHookError→unhandledRejection; IN-01..04) que se alinham ao hardening

### Código a evoluir
- `src/errors/index.ts` — `MongoatError` base (ponto de extensão da hierarquia D-01)
- `src/utils/database.ts` — `toObjectId` (SEC-02, D-02)
- `src/model/index.ts` — `wrapDriverError` (SEC-03, D-03); métodos que recebem `filter` (SEC-01, D-05)
- `src/database/index.ts` §455-487 — `setupIndexes` JÁ incremental (SEC-04 / WR-10 da Fase 1)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `MongoatError` (`src/errors/index.ts`): classe base pronta para as subclasses de D-01; já suporta `cause`.
- `wrapDriverError` (`src/model/index.ts`, Fase 2): já preserva `message` + `cause` sem `JSON.stringify` — evoluir para emitir `MongoatDriverError` com `code`.
- `toObjectId` (`src/utils/database.ts`): ponto único de conversão — adicionar `ObjectId.isValid` aqui cobre `findById` automaticamente.
- `setupIndexes` (`src/database/index.ts:455`): SEC-04 já resolvido na Fase 1 (diff em vez de drop-recreate) — Fase 3 só adiciona teste de regressão confirmando o comportamento incremental.
- `@vitest/coverage-v8@4.1.10` e `@testcontainers/mongodb@12.0.4` já instalados; script `check:package` (attw+publint) pronto para virar gate de CI.

### Established Patterns
- Testes de integração: `beforeAll(connect)` / `afterAll(Database.resetRegistry + disconnect)` contra Mongo real (ver `test/model/options-passthrough.test.ts`). 24 arquivos / 68 testes hoje.
- Erros: `throw new MongoatError(...)` espalhados em Model/Database — serão trocados pela subclasse tipada correta.
- Gating por Proxy e registry estático (constraint do autor — manter).

### Integration Points
- Hierarquia de erros substitui os `new MongoatError(...)` atuais em `src/model` e `src/database`.
- `sanitizeFilter` novo em `src/utils` (exportado no barrel); checagem de `$where` embutida nos métodos com `filter`.
- CI novo em `.github/workflows/` (inexistente hoje).

</code_context>

<specifics>
## Specific Ideas

- **Divergência requisito × realidade:** QUAL-02 cita `mongodb-memory-server`; a decisão (D-08) é manter testcontainers, adotado na Fase 1.
- **SEC-04 já entregue** na Fase 1 (WR-10) — não re-implementar; apenas cobrir com teste de regressão.
- **Reconciliar versão de Node** (D-11): `engines` real (20/22) diverge da doc (16.20.1); atualizar PROJECT.md/CLAUDE.md nesta fase.

</specifics>

<deferred>
## Deferred Ideas

- **Warnings advisory da Fase 2** (`02-REVIEW.md`): WR-01 (`ctx.model` expõe instância não-proxied — gating contornável de hook), WR-03 (`isSameConfig` ignora hooks no re-registro), WR-04 (exemplo com timestamp congelado). Avaliar no planejamento quais têm caráter de hardening e cabem aqui; WR-02 (`onHookError` que lança → unhandledRejection) tem cara de robustez e é forte candidato a entrar na Fase 3.
- **Connection pooling exposto** em `DatabaseConfig` — marcado v2 (deferred) em REQUIREMENTS.md.
- **`CUSTOM_VALIDATION.UNIQUE`** nunca implementado — fora do escopo v1 declarado.

</deferred>

---

*Phase: 3-Blindagem — testes, CI e segurança*
*Context gathered: 2026-07-07*
