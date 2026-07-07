# Phase 3: Blindagem — testes, CI e segurança - Research

**Researched:** 2026-07-07
**Domain:** Hardening de segurança (NoSQL injection / `$where` / ObjectId) + hierarquia de erros type-safe + cobertura de testes (vitest + testcontainers) + CI (GitHub Actions) para um ODM npm publicado
**Confidence:** MEDIUM-HIGH — achados sobre o código-fonte instalado (`bson@7.0.0`, `mongodb@7.0.0`, `eslint.config.js` atual) e sobre o próprio repo são `[VERIFIED]` por leitura direta/execução; achados de mercado (operadores MongoDB, padrões de erro TS, gotchas de CI) são `[CITED]`/`[MEDIUM]` via WebSearch (Context7 não disponível nesta sessão — nenhum MCP de docs foi oferecido às ferramentas)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Política de erros (SEC-02, SEC-03) — decididas com o autor
- **D-01 — Hierarquia de erros tipada.** Criar subclasses de `MongoatError`: `MongoatValidationError` (schema/ObjectId inválido, filtro proibido), `MongoatConnectionError` (sem conexão / dbName ausente), `MongoatDriverError` (wrap de erro do driver). O dev discrimina por `instanceof`. Migrar os `throw new MongoatError(...)` atuais para a subclasse apropriada (mantendo `MongoatError` como base pública).
- **D-02 — ObjectId fail-loud.** `toObjectId` valida com `ObjectId.isValid`; em input inválido lança `MongoatValidationError` com mensagem clara. `findById` propaga (NÃO retorna `null` para id malformado — falha explícita, não mascara bug do caller). Validação no ponto único de conversão (`toObjectId`), então todo consumidor herda.
- **D-03 — Mensagem limpa + `cause`.** Erros re-lançados têm `.message` estável e sanitizada (sem stack traces nem detalhes internos); o erro original do driver fica preservado em `.cause` para quem quiser inspecionar. Nunca serializar o erro inteiro (fim definitivo do padrão `JSON.stringify(err)`). `wrapDriverError` da Fase 2 já preserva message+cause — a Fase 3 formaliza via `MongoatDriverError` e garante a sanitização da mensagem.
- **D-04 — `code` estável.** Cada erro carrega um campo `code` estável (string, ex.: `INVALID_OBJECT_ID`, `NOT_CONNECTED`, `FORBIDDEN_OPERATOR`, `VALIDATION_FAILED`, `DUPLICATE_KEY`). O dev programa contra o `code`, independente da mensagem (que pode mudar sem quebrar semver).

#### Claude's Discretion — delegadas pelo autor

**sanitizeFilter / `$where` (SEC-01)**
- **D-05 — `$where` rejeitado incondicionalmente pela lib.** Todo método que recebe `filter` (find, findMany, update, updateMany, delete, deleteMany, total) rejeita `$where` em QUALQUER nível do filtro, lançando `MongoatValidationError` (`code: FORBIDDEN_OPERATOR`). `$where` é execução de JS server-side, sem uso legítimo defensável numa lib de dados. Isto é automático e não-desligável.
- **D-06 — `sanitizeFilter` é utilitário OPT-IN.** Exportado de `@utils`, aplicado pelo dev ao input não-confiável (query string HTTP, body) — NÃO automático em todos os métodos. Respeita o core value "não esconder o driver": sanitização automática agressiva quebraria queries legítimas com operadores. O dev escolhe onde aplicar.
- **D-07 — Escopo do `sanitizeFilter`.** Neutraliza os vetores de execução de código (`$where`, `$function`, `$accumulator`, `$expr` contendo `$function`) e, de forma configurável, remove chaves de topo iniciadas por `$` vindas de objeto não-confiável (query-injection clássico). PRESERVA operadores de query normais (`$gt`, `$in`, `$and`, `$or`, ...) — senão seria inútil. Documentar claramente o que sana e o que não.

**Cobertura de testes (QUAL-02)**
- **D-08 — Testcontainers, não mongodb-memory-server.** Manter a infra da Fase 1 (MongoDB real em Docker via testcontainers) apesar do texto do requisito citar `mongodb-memory-server` — testcontainers é mais fiel ao driver v7 real. Divergência intencional e documentada.
- **D-09 — Alvo de cobertura.** Todos os 12 métodos públicos do `Model` + métodos públicos do `Database`, cada um com happy path + ≥1 cenário de erro; concorrência onde há estado compartilhado (registro concorrente de model, operações CRUD paralelas). Fechar as "Test Coverage Gaps" do CONCERNS.md.
- **D-10 — Threshold como gate.** Habilitar `@vitest/coverage-v8` (já instalado) com threshold no CI. Ponto de partida ~80% lines/functions/statements, ~70% branches (o planner/pesquisa refina) — evitar 100%, que incentiva testes vazios.

**CI GitHub Actions (QUAL-03)**
- **D-11 — Matriz Node 20 e 22.** Alinhado ao `engines: ^20.19.0 || >=22.12.0` real (definido na Fase 1). A lib NÃO suporta mais 16. ⚠️ Reconciliar: PROJECT.md/CLAUDE.md ainda dizem "Node >=16.20.1" — o `engines` do package.json vence; atualizar a doc nesta fase.
- **D-12 — Um fluxo, runner com Docker.** `ubuntu-latest` (tem Docker) roda os testes de integração via testcontainers diretamente. Job único: install → lint → typecheck → build → test (com coverage) → gate `check:package` (attw + publint, cumpre o gate de CI prometido em REL-02). Não separar unit/integração inicialmente (a suíte roda em ~8s).
- **D-13 — Triggers push + PR para `main`,** quebrando o build em qualquer regressão (test/lint/build/attw/threshold).

### Claude's Discretion (resumo por área)
- Escopo exato do allowlist de operadores para o modo "remove chaves `$` de topo" do `sanitizeFilter` (D-07).
- Estrutura de arquivos/nomes exatos da hierarquia de erros (D-01) — apenas os 4 nomes de classe estão travados.
- Thresholds numéricos exatos de cobertura (D-10) — ponto de partida dado, ajuste fica com o planner.
- Se WR-02 (Fase 2, `onHookError` que lança → unhandledRejection) entra nesta fase como item de hardening (ver `<deferred>`).

### Deferred Ideas (OUT OF SCOPE)

- **Warnings advisory da Fase 2** (`02-REVIEW.md`): WR-01 (`ctx.model` expõe instância não-proxied — gating contornável de hook), WR-03 (`isSameConfig` ignora hooks no re-registro), WR-04 (exemplo com timestamp congelado). Avaliar no planejamento quais têm caráter de hardening e cabem aqui; WR-02 (`onHookError` que lança → unhandledRejection) tem cara de robustez e é forte candidato a entrar na Fase 3.
- **Connection pooling exposto** em `DatabaseConfig` — marcado v2 (deferred) em REQUIREMENTS.md.
- **`CUSTOM_VALIDATION.UNIQUE`** nunca implementado — fora do escopo v1 declarado.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| QUAL-02 | Suíte unit+integração cobrindo os 12 métodos de `Model` + métodos públicos de `Database`, incluindo erro e concorrência | `## Architecture Patterns` → Pattern 3 (matriz de cobertura), `## Validation Architecture`, `## Common Pitfalls` → Pitfall 4 |
| QUAL-03 | CI GitHub Actions roda test/lint/build em push e PR | `## Architecture Patterns` → Pattern 4 (workflow single-job), `## Common Pitfalls` → Pitfall 1 (`eslint.config.js` quebrado), Pitfall 5 (Ryuk/testcontainers) |
| SEC-01 | `sanitizeFilter` opt-in + `$where` rejeitado incondicionalmente | `## Architecture Patterns` → Pattern 1 (scanner recursivo), `## Code Examples` → sanitizeFilter/rejectWhere |
| SEC-02 | `toObjectId` valida com `ObjectId.isValid`, erro tipado em entrada inválida | `## Common Pitfalls` → Pitfall 2 (asymmetria `isValid` vs `new ObjectId(undefined)`), `## Code Examples` → toObjectId |
| SEC-03 | Erros re-lançados sanitizados, `cause` preservado, sem `JSON.stringify` | `## Architecture Patterns` → Pattern 2 (hierarquia de erros), `## Common Pitfalls` → Pitfall 3 (E11000 vaza valor do documento) |
| SEC-04 | `setupIndexes` incremental (já implementado na Fase 1) + teste de regressão | `## Runtime State Inventory` — não aplicável (sem migração); nota em `## Summary` |

</phase_requirements>

## Summary

Esta fase não introduz tecnologia nova — ela formaliza e testa decisões já tomadas nas Fases 1-2. A pesquisa focou em três frentes concretas e verificáveis no próprio ambiente: (1) o comportamento EXATO de `ObjectId.isValid`/`new ObjectId()` na versão instalada do `bson` (7.0.0), lido diretamente do código-fonte em `node_modules` — não de documentação genérica, que frequentemente descreve comportamento de versões antigas (`isValid('123456789012')` era `true` em bson < 4, mas é `false` na v7 instalada); (2) a lista canônica de operadores MongoDB que executam JavaScript server-side (`$where`, `$function`, `$accumulator`, e `$expr` quando encapsula os dois últimos) versus operadores de injeção lógica (`$ne`, `$gt`, chaves `$` de topo vindas de input não confiável) — categorias distintas que exigem tratamentos distintos (rejeição incondicional vs. sanitização opt-in); e (3) um achado crítico não previsto no CONTEXT.md: **o `eslint.config.js` atual do repositório está quebrado** — é um objeto no formato antigo (`eslintrc`) sendo exportado como se fosse flat config (ESLint 9 exige um array/`tseslint.config(...)`), e `npx eslint` confirma "File ignored because no matching configuration was supplied" para qualquer arquivo `.ts`. Isso bloqueia o próprio D-12 ("install → lint → ...") — o gate de lint prometido pela fase não pode ser cumprido sem primeiro consertar o config.

Ao testar um `eslint.config.mjs` corrigido (formato flat config com `typescript-eslint`'s `tseslint.config()` + `@eslint/js`) contra o código atual, o lint real encontrou 4 erros `@typescript-eslint/no-explicit-any` — exatamente nos 4 `catch (err: any)` de `src/model/index.ts` já sinalizados em `CONCERNS.md` e no `02-REVIEW.md` (IN-04) como parte do TODO `useUnknownInCatchVariables`. Isso cria uma sinergia direta com SEC-03: a reescrita da hierarquia de erros (D-01/D-03) é o momento natural para também tipar esses catches como `unknown` e fechar o TODO do `tsconfig.json`, e o lint-gate da fase passa a depender disso.

Para `sanitizeFilter` (SEC-01), a pesquisa recomenda um scanner recursivo único que percorre TODO o filtro (objetos e arrays, incluindo dentro de `$and`/`$or`/`$nor`/`$in`), usando o MESMO discriminador de "plain object" já usado em `cloneDocumentDefaults` (`Object.getPrototypeOf(v) === Object.prototype`) para não recursar erroneamente em `ObjectId`/`Date`/`RegExp`/`Buffer`. Como o scanner é recursivo e vasculha toda a árvore, não é preciso tratamento especial para `$expr` — um `$expr: { $function: {...} }` já é capturado pela varredura genérica de `$function` em qualquer profundidade. O rejeitar-incondicional de `$where` (D-05) é uma responsabilidade DIFERENTE de `sanitizeFilter` (D-06/D-07): D-05 é um guard interno, sempre ativo, embutido nos métodos do `Model` (lança `MongoatValidationError`); `sanitizeFilter` é uma função pura, exportada, chamada explicitamente pelo dev ANTES de montar o filtro — as duas se sobrepõem em detectar `$where`, mas têm gatilhos e call-sites diferentes.

Para o hardening de `toObjectId` (SEC-02), o achado mais importante é uma assimetria que o CONTEXT.md não previu: `ObjectId.isValid(undefined)` retorna `false`, mas `new ObjectId(undefined)` NÃO lança — ele **gera um ObjectId novo e aleatório**. A implementação atual de `toObjectId` (`return new ObjectId(inputId)`, sem checagem) herda esse comportamento: `findById(undefined)` hoje não falha — ele silenciosamente monta um filtro `{ _id: <ObjectId aleatório> }` que não bate com nada, retornando `null` como se o documento não existisse. Isso mascara exatamente o tipo de bug de caller que D-02 quer expor. A correção (`ObjectId.isValid(inputId)` antes de `new ObjectId(inputId)`) resolve isso automaticamente, mas exige decidir se `toObjectId` continua aceitando `undefined` como "gerar novo" para outros usos futuros, ou se passa a exigir sempre um valor explícito — ver `## Open Questions`.

Para QUAL-02/QUAL-03, a suíte já tem 24 arquivos/68 testes e infraestrutura testcontainers madura (Fase 1) — o trabalho da Fase 3 é gap-filling (métodos sem cenário de erro, ausência de testes de `ObjectId` inválido, ausência de `@vitest/coverage-v8` configurado no `vitest.config.ts`) e não fundação nova. Para CI, `ubuntu-latest` roda Docker nativamente (testcontainers funciona sem `services:` do GitHub Actions), mas o reaper `Ryuk` do testcontainers deve permanecer HABILITADO (não usar `TESTCONTAINERS_RYUK_DISABLED`) — desabilitá-lo é desaconselhado pelos próprios mantenedores exceto em ambientes restritos/rootless, o que não é o caso de `ubuntu-latest`.

SEC-04 (`setupIndexes` incremental) já está implementado desde a Fase 1 (`src/database/index.ts:455-489`, comentário `WR-10`) — o diff createIndex/conflict-detection/dropIndex já existe. A Fase 3 só precisa de um teste de regressão que prove que um `setupIndexes()` repetido NÃO dropa índices não gerenciados nem recria índices idênticos.

**Primary recommendation:** Consertar `eslint.config.js` (flat config real) como primeiro passo da fase — é bloqueador silencioso de D-12 — depois seguir a ordem natural: hierarquia de erros (D-01..D-04, desbloqueia SEC-02/SEC-03) → `sanitizeFilter`/`$where` guard (SEC-01) → gap-fill de testes com os novos erros tipados (QUAL-02) → workflow de CI single-job (QUAL-03) por último, já que ele só faz sentido depois que `lint`/`test:coverage` existirem como scripts reais.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Hierarquia de erros (`MongoatValidationError`/`ConnectionError`/`DriverError`) | Errors Layer (`src/errors/`) | Model/Database Layer (pontos de `throw`) | Classes vivem em `src/errors/`; `Model`/`Database` apenas instanciam a subclasse correta no ponto de falha existente |
| `$where`/`$function`/`$accumulator` guard incondicional | Model Layer | Errors Layer | Cada método com `filter` chama o guard antes de tocar o driver; o guard lança a classe de erro definida na Errors Layer |
| `sanitizeFilter` (opt-in) | Utils Layer (`src/utils/`) | Errors Layer (indiretamente, reusa a mesma lista de operadores perigosos) | Função pura exportada de `@utils`, chamada pelo CÓDIGO DO DEV, não pelo pipeline interno do Model |
| Validação de `ObjectId` (`toObjectId`) | Utils Layer (`src/utils/database.ts`) | Model Layer (único call-site interno: `findById`) | Ponto único de conversão já existe na Utils Layer; corrigir ali propaga para todo consumidor |
| `setupIndexes` incremental | Database Layer | MongoDB Driver Layer | Já implementado; Database orquestra diff, driver executa `createIndex`/`dropIndex` |
| Suíte de testes (unit+integração) | Test Layer (`test/`) | MongoDB real via testcontainers (Docker) | Testes de integração dependem de um MongoDB real; testcontainers é a camada que provê isso no CI e localmente |
| Coverage gate (`@vitest/coverage-v8`) | Test Layer (`vitest.config.ts`) | CI Layer (GitHub Actions) | Threshold é configurado no vitest, mas só vira GATE de fato quando o CI falha o build ao violá-lo |
| CI workflow (lint/typecheck/build/test/check:package) | CI Layer (`.github/workflows/`) | — | Novo — não existe hoje; orquestra scripts já definidos (ou a definir) em `package.json` |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `mongodb` | 7.0.0 (instalado, pinado na Fase 1) | Driver oficial — fonte de `ObjectId`, `MongoServerError`, tipos de options | Já é a única dependência de runtime relevante; D-08 do CLAUDE.md exige preferir recursos nativos do driver |
| `bson` | 7.0.0 (instalado) | `ObjectId.isValid`/constructor — base de SEC-02 | Reexportado pelo driver; comportamento verificado diretamente no código instalado |
| `vitest` | 4.1.10 (instalado) | Test runner | Já adotado na Fase 1; `npm view vitest version` confirma 4.1.10 = latest no registry (sem drift) `[VERIFIED: npm registry]` |
| `@vitest/coverage-v8` | 4.1.10 (instalado) | Coverage provider para o gate de threshold (D-10) | Já instalado como devDependency; `npm view` confirma 4.1.10 = latest, sem gap de versão `[VERIFIED: npm registry]` |
| `@testcontainers/mongodb` + `testcontainers` | 12.0.4 (instalado) | MongoDB real em Docker para testes de integração (D-08) | Já em uso desde a Fase 1 (`test/setup/testcontainer.ts`), imagem pinada `mongo:7` |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@eslint/js` | ^10.0.1 (NOVA devDependency) | Config base `eslint.configs.recommended` para o flat config corrigido | Necessário porque o `eslint.config.js` atual está quebrado (ver Pitfall 1) — `typescript-eslint`'s `tseslint.config()` precisa dele explicitamente; hoje só existe como dependência transitiva, não instalada diretamente |
| `actions/checkout@v5` | — (GitHub Action, não npm) | Checkout do repo no runner | Padrão em qualquer workflow |
| `actions/setup-node@v4` | — (GitHub Action) | Instala Node da matriz + cache npm nativo (`cache: 'npm'`) | Built-in cache usa hash de `package-lock.json`; evita reconfigurar `actions/cache` manualmente |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `sanitizeFilter` hand-rolled | `express-mongo-sanitize`/`mongo-sanitize` (npm) | Pacote pronto teria a mesma forma (strip recursivo de chaves `$`/`.`), mas (a) é acoplado ao formato `req.body`/Express, não a um `Filter<T>` do driver tipado; (b) adiciona dependência de runtime, contra o constraint "mínimo possível de dependências" do CLAUDE.md. Hand-rolled é a escolha correta aqui — D-06/D-07 já travam esse design |
| `eslint-plugin-security` | Regras manuais anti-`$where`/anti-`eval` | Pacote real, mantido pela org `eslint-community` (2.6M downloads/semana), mas o gate `package-legitimacy check` retornou `[SUS]` (heurística de "too-new" — provavelmente por uma republicação recente sob o novo escopo). Como D-05/SEC-01 já é aplicado via runtime guard (não lint), este pacote é OPCIONAL e não necessário para fechar os requisitos da fase — mencionado apenas como discretion do planner, não recomendado por padrão |
| Testar `services:` nativo do GitHub Actions para MongoDB | Continuar com testcontainers (D-08) | `services:` seria mais simples de configurar em teoria, mas D-08 já trava testcontainers deliberadamente (paridade com ambiente local, sem duplicar lógica de conexão) — não há motivo para desviar no CI |

**Installation:**
```bash
npm install -D @eslint/js
```

**Version verification:**
```bash
npm view vitest version                    # 4.1.10 — igual ao instalado, sem drift
npm view @vitest/coverage-v8 version        # 4.1.10 — igual ao instalado
npm view @eslint/js version                 # 10.0.1 — nova devDependency
npm view mongodb version                    # 7.5.0 no registry — 7.0.0 pinado deliberadamente na Fase 1 (fora de escopo desta fase, não mexer)
```

## Package Legitimacy Audit

Apenas UM pacote novo é necessário nesta fase: `@eslint/js` (para consertar o `eslint.config.js` quebrado — ver Pitfall 1). Todos os outros pacotes relevantes (`vitest`, `@vitest/coverage-v8`, `testcontainers`, `@testcontainers/mongodb`, `@arethetypeswrong/cli`, `publint`) já foram auditados e aprovados no checkpoint de supply-chain da Fase 1 (T-01-01-SC, ver `01-SECURITY.md`) — não re-auditados aqui.

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| `@eslint/js` | npm | publicado 2026-02-06 (10.0.1) | ~118M/semana | github.com/eslint/eslint | OK | Approved |

**Packages removed due to [SLOP] verdict:** nenhum
**Packages flagged as suspicious [SUS]:** nenhum instalado nesta fase. `eslint-plugin-security` foi avaliado como alternativa opcional (ver `Alternatives Considered`) e retornou `[SUS]` (too-new) — NÃO recomendado para instalação; se o planner decidir incluí-lo mesmo assim, deve gatear com `checkpoint:human-verify`.

## Architecture Patterns

### System Architecture Diagram

```
                    ┌─────────────────────────────┐
                    │   Dev consumer code          │
                    │  (filtro vindo de HTTP/etc.) │
                    └──────────────┬───────────────┘
                                   │ opt-in
                                   ▼
                    ┌─────────────────────────────┐
                    │  sanitizeFilter(filter)       │  ← NOVO (src/utils)
                    │  - scan recursivo             │
                    │  - strip $where/$function/    │
                    │    $accumulator (sempre)      │
                    │  - strip $ de topo (opt-in)   │
                    └──────────────┬───────────────┘
                                   │ filtro "limpo" (ou original, se dev pular)
                                   ▼
        ┌───────────────────────────────────────────────────┐
        │  Model.find/findMany/update/updateMany/delete/     │
        │  deleteMany/total(filter, options)                  │
        │                                                      │
        │  1. rejectForbiddenOperators(filter) — SEMPRE ativo  │  ← NOVO, guard incondicional (D-05)
        │     throw MongoatValidationError(FORBIDDEN_OPERATOR) │
        │     se $where em QUALQUER profundidade                │
        │  2. runHooked(...) → pre-hooks → driver → post-hooks │
        └──────────────────────┬──────────────────────────────┘
                                │
                                ▼
                    ┌─────────────────────────┐
                    │  rawXxx() → collection.  │
                    │  find/update/delete(...) │
                    └──────────┬───────────────┘
                                │ erro do driver (MongoServerError, etc.)
                                ▼
                    ┌─────────────────────────────┐
                    │  wrapDriverError(err)         │  ← evolui para MongoatDriverError
                    │  - message sanitizada         │
                    │  - cause = err original        │
                    │  - code = mapeado de err.code  │
                    │    (ex.: 11000 → DUPLICATE_KEY)│
                    └─────────────────────────────┘

        ┌───────────────────────────────────────────┐
        │  findById(documentId) → toObjectId(id)      │
        │                                              │
        │  toObjectId:                                 │
        │    if (!ObjectId.isValid(id))                │
        │       throw MongoatValidationError(           │
        │         INVALID_OBJECT_ID)                    │
        │    return new ObjectId(id)                    │
        └───────────────────────────────────────────┘

CI (GitHub Actions, ubuntu-latest, matriz Node 20/22):
push/PR → checkout → setup-node(cache:npm) → npm ci
   → npm run lint → npm run typecheck → npm run build
   → npm run test (vitest, sobe container mongo:7 via testcontainers)
   → coverage threshold gate (falha se abaixo do limite)
   → npm run check:package (npm pack --dry-run && publint && attw --pack .)
   → build falha ⇒ PR bloqueado
```

### Recommended Project Structure
```
src/
├── errors/
│   └── index.ts          # MongoatError (base) + MongoatValidationError +
│                          # MongoatConnectionError + MongoatDriverError (D-01)
├── utils/
│   ├── database.ts        # toObjectId (hardened — SEC-02)
│   ├── sanitize.ts         # NOVO: sanitizeFilter + rejectForbiddenOperators (SEC-01)
│   └── index.ts            # barrel — exporta sanitizeFilter
├── model/index.ts          # guard $where embutido nos 7 métodos com `filter`
└── database/index.ts       # setupIndexes (sem mudança — já incremental)

test/
├── model/
│   ├── sanitize-filter.test.ts     # NOVO — SEC-01
│   ├── where-rejection.test.ts     # NOVO — SEC-01 (guard incondicional)
│   ├── object-id-validation.test.ts # NOVO — SEC-02
│   └── error-hierarchy.test.ts      # NOVO — SEC-03/D-01..D-04
└── database/
    └── setup-indexes-regression.test.ts  # NOVO — SEC-04 (regressão)

.github/
└── workflows/
    └── ci.yml              # NOVO — QUAL-03

vitest.config.ts             # + bloco coverage.thresholds (D-10)
eslint.config.js             # CORRIGIDO — flat config real (Pitfall 1)
package.json                 # + scripts "lint" e "test:coverage"
```

### Pattern 1: Scanner recursivo único para operadores perigosos

**What:** Uma função `containsForbiddenOperator(value, forbiddenKeys, depth = 0)` que percorre recursivamente objetos planos e arrays, retornando `true` assim que encontrar QUALQUER chave da lista proibida em qualquer profundidade — reusada tanto pelo guard incondicional (`$where` apenas) quanto por `sanitizeFilter` (lista maior: `$where`, `$function`, `$accumulator`).

**When to use:** Sempre que o filtro/pipeline vier (total ou parcialmente) de fora do controle do código do dev.

**Example:**
```typescript
// Baseado no discriminador de plain-object já usado em cloneDocumentDefaults
// (src/model/index.ts) — reaproveitar a MESMA função para consistência.
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    !!value &&
    typeof value === 'object' &&
    (Object.getPrototypeOf(value) === Object.prototype ||
      Object.getPrototypeOf(value) === null)
  );
}

const FORBIDDEN_OPERATORS = new Set(['$where']);
const CODE_EXECUTION_OPERATORS = new Set(['$where', '$function', '$accumulator']);

function findForbiddenOperator(
  value: unknown,
  forbidden: ReadonlySet<string>
): string | undefined {
  if (Array.isArray(value)) {
    for (const item of value) {
      const hit = findForbiddenOperator(item, forbidden);
      if (hit) return hit;
    }
    return undefined;
  }

  if (isPlainObject(value)) {
    for (const [key, val] of Object.entries(value)) {
      if (forbidden.has(key)) return key;
      const hit = findForbiddenOperator(val, forbidden);
      if (hit) return hit;
    }
  }

  // Date/ObjectId/RegExp/Buffer/primitivos são folhas — não recursar.
  return undefined;
}
```

**Por que `$expr` não precisa de caso especial:** `{ $expr: { $function: { body: '...' } } }` já é capturado — o scanner desce em `$expr` (é um plain object), encontra a chave `$function` dentro dele e retorna. Um `$expr: { $gt: ['$a', '$b'] }` legítimo não contém `$function`/`$accumulator`/`$where`, então passa limpo.

### Pattern 2: Hierarquia de erros com `code` estável e `cause` preservado

**What:** `MongoatError` ganha um campo `code: string` no construtor; cada subclasse define um `code` default mas permite override pontual (ex.: `MongoatDriverError` mapeia `err.code` do driver quando disponível).

**When to use:** Todo `throw` interno do Model/Database migra da classe base genérica para a subclasse correta.

**Example:**
```typescript
// src/errors/index.ts
export class MongoatError extends Error {
  readonly code: string;

  constructor(message: string, options?: { cause?: unknown; code?: string }) {
    super(message, { cause: options?.cause });
    this.name = 'MongoatError';
    this.code = options?.code ?? 'MONGOAT_ERROR';
    // Necessário mesmo com target ES2022: consumidores da lib publicada
    // podem transpilar/bundlar para um target mais baixo (ES5/CommonJS
    // antigo) fora do controle do Mongoat — sem isto, `instanceof` quebra
    // no bundle do CONSUMIDOR, não no nosso próprio build.
    Object.setPrototypeOf(this, MongoatError.prototype);
  }
}

export class MongoatValidationError extends MongoatError {
  constructor(message: string, options?: { cause?: unknown; code?: string }) {
    super(message, { cause: options?.cause, code: options?.code ?? 'VALIDATION_FAILED' });
    this.name = 'MongoatValidationError';
    Object.setPrototypeOf(this, MongoatValidationError.prototype);
  }
}

export class MongoatConnectionError extends MongoatError {
  constructor(message: string, options?: { cause?: unknown; code?: string }) {
    super(message, { cause: options?.cause, code: options?.code ?? 'NOT_CONNECTED' });
    this.name = 'MongoatConnectionError';
    Object.setPrototypeOf(this, MongoatConnectionError.prototype);
  }
}

export class MongoatDriverError extends MongoatError {
  constructor(message: string, options?: { cause?: unknown; code?: string }) {
    super(message, { cause: options?.cause, code: options?.code ?? 'DRIVER_ERROR' });
    this.name = 'MongoatDriverError';
    Object.setPrototypeOf(this, MongoatDriverError.prototype);
  }
}
```

```typescript
// src/model/index.ts — wrapDriverError evolui para mapear err.code
import { MongoServerError } from 'mongodb';

const DRIVER_CODE_MAP: Record<number, string> = {
  11000: 'DUPLICATE_KEY',
};

function wrapDriverError(err: unknown): MongoatDriverError {
  const code =
    err instanceof MongoServerError && typeof err.code === 'number'
      ? (DRIVER_CODE_MAP[err.code] ?? 'DRIVER_ERROR')
      : 'DRIVER_ERROR';

  return new MongoatDriverError(err instanceof Error ? err.message : String(err), {
    cause: err,
    code,
  });
}
```

**Fonte:** `err.code`/`err.codeName` em `MongoServerError` — verificado lendo `node_modules/mongodb/lib/error.js:165-192` (a classe copia todas as props da resposta do servidor, incluindo `code`) e `node_modules/mongodb/mongodb.d.ts:7087` (export público). `[VERIFIED: mongodb@7.0.0 source (node_modules)]`

### Pattern 3: Matriz de cobertura por método (QUAL-02/D-09)

**What:** Cada um dos 12 métodos de `Model` (`aggregate`, `update`, `updateMany`, `insert`, `insertMany`, `findMany`, `deleteMany`, `bulkWrite`, `find`, `findById`, `delete`, `total`) precisa de: (a) happy path, (b) ≥1 cenário de erro, (c) concorrência quando há estado compartilhado.

**When to use:** Checklist de gap-fill para QUAL-02.

| Método | Já testado (happy) | Falta erro | Falta concorrência |
|--------|---------------------|-----------|---------------------|
| `insert` | ✓ (`crud-happy-path.test.ts`) | ✓ (`insert-error-cause.test.ts` — parcial, revisar após D-01) | — |
| `insertMany` | ✓ | parcial (`insertmany-hooks.test.ts` foca em hooks, não erro do driver) | ✓ (`insertmany-hooks.test.ts` testa paralelismo entre docs) |
| `find`/`findById` | ✓ | **falta** — nenhum teste de `ObjectId` inválido existe hoje | — |
| `update`/`updateMany` | ✓ | falta cenário de filtro/update inválido dedicado | — |
| `delete`/`deleteMany` | ✓ | falta | — |
| `total` | não claramente coberto isoladamente | falta | — |
| `aggregate` | não claramente coberto | falta | — |
| `bulkWrite` | via `options-passthrough.test.ts` | falta erro de operação inválida | — |
| Registro concorrente de model | ✓ (`registry-config.test.ts` cobre config divergente) | — | verificar se cobre 2 `new Model()` SIMULTÂNEOS (race), não só sequenciais |
| `Database.connect()` concorrente | ✓ (`connect-concurrency.test.ts`) | — | ✓ |

**Nota:** a lista acima é um levantamento, não um plano — o planner decide quais viram tasks novas vs. extensões de arquivos existentes.

### Pattern 4: CI single-job com Docker nativo

**What:** Um workflow com um job único no `ubuntu-latest`, sem `services:` do GitHub Actions (testcontainers gerencia o container Mongo sozinho via Docker socket, já disponível nesse runner).

**Example:**
```yaml
# .github/workflows/ci.yml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  build-and-test:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        node-version: ['20.x', '22.x']
    steps:
      - uses: actions/checkout@v5
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ matrix.node-version }}
          cache: 'npm'
      - run: npm ci
      - run: npm run lint
      - run: npm run typecheck
      - run: npm run build
      - run: npm run test -- --coverage
      - run: npm run check:package
```

**Fonte:** `actions/setup-node` cache nativo via hash de `package-lock.json` `[CITED: github.com/actions/setup-node README]`; `ubuntu-latest` tem Docker pré-instalado, testcontainers funciona sem setup extra `[CITED: docker.com/blog — Running Testcontainers Tests Using GitHub Actions]`.

**Nota sobre a matriz:** `20.x`/`22.x` testam a ÚLTIMA patch de cada major, não o piso exato `^20.19.0 || >=22.12.0` do `engines`. Testar o piso exato adicionaria rigor mas também complexidade (2 entradas fixas + 2 "latest") — deixado como discretion do planner (ver `## Open Questions`).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Validação de formato de ObjectId | Regex manual `/^[0-9a-fA-F]{24}$/` | `ObjectId.isValid(id)` do driver | O driver já implementa a validação correta e é a fonte de verdade de "o que é um ObjectId válido" para a versão exata em uso — reimplementar arrisca divergir sutilmente (ex.: não tratar `ObjectIdLike`/Uint8Array de 12 bytes) |
| Cache/pool de containers de teste | Gerenciar ciclo de vida do container manualmente | `testcontainers`/`@testcontainers/mongodb` (já instalado) já cuida de start/stop/Ryuk cleanup | Reimplementar reaper/cleanup é exatamente a classe de bug (containers órfãos) que a Fase 1 já resolveu via testcontainers |
| Deep-equal para comparar configs de índice/schema no gate de cobertura | lib de deep-equal | Já resolvido no código atual (`stableStringify`/`JSON.stringify` puro conforme semântica de cada caso) — não é escopo desta fase, apenas reaproveitar | Consistência com o padrão hand-rolled já estabelecido (CLAUDE.md: mínimo de dependências) |

**Key insight:** Toda a "infraestrutura de segurança" desta fase (scanner de operadores, hierarquia de erros, validação de ObjectId) é deliberadamente hand-rolled e pequena — não porque pacotes prontos não existam (`mongo-sanitize`, `ts-custom-error` existem e são legítimos), mas porque o constraint do projeto ("mínimo possível de dependências de runtime") e o core value ("não esconder o driver") tornam soluções finas e auditáveis a escolha correta. Isso é uma decisão consciente, não uma lacuna de pesquisa.

## Common Pitfalls

### Pitfall 1: `eslint.config.js` está quebrado — lint gate de D-12 não funciona hoje

**What goes wrong:** O arquivo atual usa o formato antigo `.eslintrc` (`module.exports = { parser, plugins, overrides: [{ extends: [...] }] }`) mas o projeto roda ESLint 9.39.2, que exige flat config (array ou helper `tseslint.config(...)`). Rodar `npx eslint src/errors/index.ts` produz `"File ignored because no matching configuration was supplied"` — ZERO regras aplicadas, silenciosamente.

**Why it happens:** A migração de `.eslintrc` → flat config não foi feita quando o projeto adotou ESLint 9; o arquivo nunca foi de fato exercitado (não há script `"lint"` no `package.json` hoje, então ninguém rodou isso em CI ou localmente).

**How to avoid:** Reescrever `eslint.config.js` (ou `.mjs`) usando `typescript-eslint`'s `tseslint.config(eslint.configs.recommended, tseslint.configs.recommended, { files: ['**/*.ts'], languageOptions: { parserOptions: { project: './tsconfig.json' } } })`. Adicionar `@eslint/js` como devDependency (hoje só existe transitivo). Adicionar `"lint": "eslint ."` ao `package.json`.

**Warning signs:** `npx eslint .` roda sem erros/warnings mesmo em arquivos com problemas óbvios — sinal de que nenhuma config está sendo aplicada, não de que o código está limpo.

**Verificado nesta pesquisa:** um `eslint.config.mjs` corrigido, testado contra `src/model/index.ts`, encontrou IMEDIATAMENTE 4 erros `@typescript-eslint/no-explicit-any` nas linhas 682, 766, 862 e 900 — exatamente os `catch (err: any)` já sinalizados em `CONCERNS.md` ("Disabled TypeScript Type Safety Feature") e no `02-REVIEW.md` (IN-04). `[VERIFIED: execução local de eslint contra o código do repo]`

### Pitfall 2: `toObjectId(undefined)` não falha — gera um ObjectId aleatório novo

**What goes wrong:** `ObjectId.isValid(undefined)` retorna `false`, mas `new ObjectId(undefined)` (o que `toObjectId` faz hoje, sem guard) NÃO lança — ele executa `this.buffer = ObjectId.generate()`, criando um ObjectId válido e aleatório do zero. Um `findById(undefined)` hoje "funciona" silenciosamente: monta `{ _id: <objectid aleatório> }`, não encontra nada, retorna `null` — como se o documento simplesmente não existisse, mascarando o bug real (caller esqueceu de passar o id).

**Why it happens:** É o comportamento INTENCIONAL do construtor de `ObjectId` para o caso de uso "criar um novo id para inserir um documento" (`new ObjectId()` sem args é um padrão comum). `toObjectId` reusa esse construtor diretamente sem diferenciar "quero gerar um novo id" de "quero validar um id recebido".

**How to avoid:** `toObjectId` deve chamar `ObjectId.isValid(inputId)` e lançar `MongoatValidationError` (`code: INVALID_OBJECT_ID`) ANTES de instanciar — isso automaticamente cobre `undefined`, já que `isValid(undefined) === false`. Ver `## Open Questions` sobre se `toObjectId` deve continuar aceitando "sem argumento = gerar novo" para outros usos, ou se essa API vira estritamente "validar e converter".

**Warning signs:** Testes que fazem `findById(possiblyUndefinedVar)` e recebem `null` em vez de um erro — sintoma de que o guard não está em vigor.

**Verificado nesta pesquisa:** comportamento lido diretamente em `node_modules/bson/lib/bson.cjs:2550-2571` (versão instalada, 7.0.0). `[VERIFIED: bson@7.0.0 source (node_modules)]`

### Pitfall 3: Mensagem de erro do driver pode conter valor do documento (E11000)

**What goes wrong:** SEC-03/D-03 pede mensagens "sanitizadas, sem detalhes internos" — mas o `.message` do próprio driver em um erro de chave duplicada normalmente inclui o VALOR do campo duplicado (formato clássico do MongoDB: `E11000 duplicate key error collection: db.users index: email_1 dup key: { email: "user@example.com" }`). Se `MongoatDriverError.message` simplesmente repassa `err.message` (como o `wrapDriverError` atual faz), esse valor de dado do usuário pode acabar em um log ou resposta HTTP que o dev não pretendia expor.

**Why it happens:** D-03 foi escrito pensando em "stack traces / detalhes internos de implementação" (nomes de função interna, caminhos de arquivo) — não necessariamente em dados de negócio que já pertencem ao próprio documento inserido pelo caller. É uma zona cinzenta.

**How to avoid:** Decisão de escopo — ver `## Open Questions`. Uma opção conservadora: para `code === 'DUPLICATE_KEY'`, usar uma mensagem própria fixa (`"Duplicate key violation on '${indexName}'"`, extraindo apenas o NOME do índice do `err.message` via regex, não o valor) em vez de repassar `err.message` cru.

**Warning signs:** Testes de erro que fazem snapshot/`toContain` de `err.message` e passam mesmo quando `err.message` inclui PII — sinal de que ninguém está checando o CONTEÚDO da sanitização, só a ausência de stack trace.

### Pitfall 4: Testes de `ctx.options` mutation em `find`/`delete`/`bulkWrite` ficam invisíveis sem os 4 métodos com default `{}` (CR-01 já corrigido)

**What goes wrong:** O bug CR-01 da Fase 2 (options `undefined` em 4 métodos) já foi corrigido (commit `b51c4c9`), mas a cobertura de teste para essa classe de regressão (`options-passthrough.test.ts`) hoje só exercita `findMany`/`insertMany`. Sem um teste que mute `ctx.options` especificamente em `find`, `delete`, `findById` e `bulkWrite`, uma futura regressão nesse padrão passaria despercebida.

**Why it happens:** O fix foi feito reativamente a um bug encontrado em code review, não como parte de uma matriz de cobertura sistemática.

**How to avoid:** D-09 (matriz de cobertura por método) deve incluir explicitamente "mutação de `ctx.options` alcança o driver" como cenário para os 4 métodos historicamente afetados, não só para os que já tinham default `{}`.

### Pitfall 5: Desabilitar Ryuk no CI "para simplificar" reintroduz containers órfãos

**What goes wrong:** É comum encontrar sugestões online de setar `TESTCONTAINERS_RYUK_DISABLED=true` para "evitar problemas" em CI. Isso desliga o container reaper (`Ryuk`) que garante limpeza de containers/networks/volumes órfãos ao final da suíte — reintroduzindo exatamente o risco T-01-03-02 (Denial of Service por acúmulo de recursos) que a Fase 1 já mitigou.

**Why it happens:** Ryuk ocasionalmente falha ao subir em ambientes de CI restritos/rootless, e desabilitá-lo é o workaround mais rápido encontrado em issues do GitHub.

**How to avoid:** `ubuntu-latest` roda Docker com privilégios suficientes — Ryuk deve funcionar sem intervenção. Não desabilitar preventivamente; só investigar Ryuk especificamente SE houver falha real observada em CI.

## Code Examples

### sanitizeFilter (SEC-01/D-06/D-07)

```typescript
// src/utils/sanitize.ts
const CODE_EXECUTION_OPERATORS = new Set(['$where', '$function', '$accumulator']);

// Allowlist de operadores de query "normais" — usada apenas quando
// stripUnknownTopLevel está ativo, para decidir o que PRESERVAR no
// nível de topo (D-07: "preserva $gt, $in, $and, $or...").
const KNOWN_QUERY_OPERATORS = new Set([
  '$and', '$or', '$nor', '$not', '$eq', '$ne', '$gt', '$gte', '$lt', '$lte',
  '$in', '$nin', '$exists', '$type', '$expr', '$regex', '$options', '$mod',
  '$all', '$elemMatch', '$size', '$text', '$search', '$geoWithin',
  '$geoIntersects', '$near', '$nearSphere', '$bitsAllClear', '$bitsAllSet',
  '$bitsAnyClear', '$bitsAnySet',
]);

export interface SanitizeFilterOptions {
  /** Remove chaves de topo iniciadas por `$` que não estejam na allowlist
   * de operadores conhecidos — proteção contra query-selector injection
   * clássico (ex.: `{ $ne: null }` injetado como valor de um campo
   * esperado como string). Default: true. */
  stripUnknownTopLevel?: boolean;
}

export function sanitizeFilter<T extends Record<string, unknown>>(
  filter: T,
  options: SanitizeFilterOptions = {}
): T {
  const { stripUnknownTopLevel = true } = options;
  const clone = structuredClone(filter);

  stripCodeExecutionOperators(clone);

  if (stripUnknownTopLevel) {
    for (const key of Object.keys(clone)) {
      if (key.startsWith('$') && !KNOWN_QUERY_OPERATORS.has(key)) {
        delete (clone as Record<string, unknown>)[key];
      }
    }
  }

  return clone;
}

function stripCodeExecutionOperators(value: unknown): void {
  if (Array.isArray(value)) {
    value.forEach(stripCodeExecutionOperators);
    return;
  }

  if (isPlainObject(value)) {
    for (const key of Object.keys(value)) {
      if (CODE_EXECUTION_OPERATORS.has(key)) {
        delete value[key];
        continue;
      }
      stripCodeExecutionOperators(value[key]);
    }
  }
}
```

### Guard incondicional de `$where` embutido no Model (SEC-01/D-05)

```typescript
// src/model/index.ts — chamado no início de find/findMany/update/
// updateMany/delete/deleteMany/total, antes de runHooked
function assertNoWhere(filter: unknown): void {
  if (findForbiddenOperator(filter, new Set(['$where']))) {
    throw new MongoatValidationError(
      'The $where operator is not allowed — it executes arbitrary JavaScript on the server',
      { code: 'FORBIDDEN_OPERATOR' }
    );
  }
}
```

### toObjectId hardened (SEC-02/D-02)

```typescript
// src/utils/database.ts
import { ObjectId, ObjectIdLike } from 'mongodb';
import { MongoatValidationError } from '@/errors';

export function toObjectId(
  inputId: string | ObjectId | ObjectIdLike | Uint8Array<ArrayBufferLike>
): ObjectId {
  if (!ObjectId.isValid(inputId)) {
    throw new MongoatValidationError(
      `Invalid ObjectId: ${JSON.stringify(inputId)}`,
      { code: 'INVALID_OBJECT_ID' }
    );
  }

  return new ObjectId(inputId);
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| `ObjectId.isValid('123456789012')` (12 chars, não-hex) considerado válido | bson v7: só strings de EXATAMENTE 24 hex chars, ou `Uint8Array` de 12 bytes, ou `ObjectIdLike` | bson v4+ (o "12-char string" era tratado como raw bytes em versões antigas) | Muitos artigos/blog posts sobre `ObjectId.isValid` na internet descrevem o comportamento ANTIGO — não confiar em WebSearch para esse detalhe específico sem cross-check no código instalado |
| `new ObjectId(1234567890)` (número/timestamp) criava um ObjectId time-based | bson v7: `new ObjectId(<number>)` LANÇA `BSONError` — números não são mais aceitos pelo construtor | Removido em algum major do bson (não determinado precisamente nesta pesquisa) | Se algum código legado do projeto ou de exemplos assumir "posso passar um número", vai quebrar — usar `ObjectId.createFromTime()` para esse caso de uso |
| `$where`/`$function`/`$accumulator` como recursos "avançados" sem aviso | MongoDB 8.0 deprecia os três, loga warning ao usar | MongoDB 8.0 | Reforça que rejeitar `$where` incondicionalmente (D-05) está alinhado com a direção do próprio MongoDB, não é uma restrição arbitrária do Mongoat |

**Deprecated/outdated:**
- `mapReduce` (comando MongoDB): não exposto por nenhum método do `Model` (confirmado — `METHODS` enum não tem `MAP_REDUCE`), então fora do escopo de SEC-01 nesta fase; mencionar na doc de segurança como "não suportado, use `aggregate()`".

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Padrão de "convention over configuration" para o campo `code` de erro (strings `SCREAMING_SNAKE_CASE` como `INVALID_OBJECT_ID`) segue a convenção mais comum em SDKs Node — não há um precedente ÚNICO verificado (nem no MongoDB driver, que usa `codeName` em PascalCase, ex. `DuplicateKey`) | Pattern 2 / D-04 | Baixo — é só uma convenção de nomenclatura; fácil de ajustar em code review sem quebrar a arquitetura |
| A2 | `KNOWN_QUERY_OPERATORS` (allowlist para o modo `stripUnknownTopLevel` de `sanitizeFilter`) foi montada por conhecimento geral de operadores de query MongoDB, não checada campo-a-campo contra a doc oficial de "Query and Projection Operators" | Code Examples / D-07 | Médio — se a allowlist estiver incompleta, `sanitizeFilter` pode remover um operador legítimo que o dev esperava preservar (falso positivo, não seria um risco de segurança, mas quebraria queries) |
| A3 | `eslint.configs.recommended` (`@eslint/js`) + `tseslint.configs.recommended` reproduzem substancialmente as MESMAS regras que o `eslint.config.js` antigo pretendia aplicar (`eslint:recommended` + `plugin:@typescript-eslint/recommended`) — testado que RESOLVE e ENCONTRA erros reais, mas não comparado regra-a-regra com o config antigo (que nunca rodou de verdade) | Pitfall 1 | Baixo — o objetivo é ter QUALQUER lint funcionando como gate; ajuste fino de regras é responsabilidade normal de manutenção, não bloqueia a fase |

## Open Questions

1. **`toObjectId` deve continuar aceitando "sem argumento = gera novo ObjectId"?**
   - What we know: hoje `toObjectId(inputId?: ...)` é opcional e, sem argumento, delega para `new ObjectId(undefined)` que GERA um id novo. O único call-site interno (`findById`) sempre passa um valor. A função também é exportada publicamente via `@utils`.
   - What's unclear: se algum consumidor externo depende do "gerar novo" via `toObjectId()`, tornar o parâmetro obrigatório é breaking change de API pública (aceitável em alpha, mas vale registrar). Se ninguém depende disso, simplificar para sempre exigir um valor é mais seguro E mais simples de documentar.
   - Recommendation: tornar `inputId` obrigatório (não-opcional) em `toObjectId`, já que D-02 pede fail-loud; documentar no changelog/migration guide (Fase 4) que `toObjectId()` sem args agora lança em vez de gerar. Se o planner preferir preservar "gerar novo", isso precisa de um segundo helper explícito (`ObjectId.generate()`/wrapper próprio), não sobrecarregar `toObjectId`.

2. **Mensagens de erro `DUPLICATE_KEY` devem redigir o valor do campo (Pitfall 3)?**
   - What we know: `err.message` do driver para E11000 inclui o valor duplicado; D-03 fala em "sem detalhes internos" mas não é claro se isso cobre dados de negócio já conhecidos pelo caller.
   - What's unclear: se o valor duplicado é considerado "detalhe interno" (deve ser redigido) ou "dado do domínio que o próprio caller forneceu" (ok expor).
   - Recommendation: tratar como PRECISA redigir por padrão (mensagem fixa por `code`, extraindo só o nome do índice) — é mais seguro por padrão para uma lib publicada que não controla como o dev vai logar/expor o erro; se o dev quiser o detalhe completo, ele já tem via `.cause`.

3. **Matriz de CI deve testar o piso exato do `engines` (`20.19.0`/`22.12.0`) além de `20.x`/`22.x`?**
   - What we know: `engines` promete suporte a partir de `20.19.0`/`22.12.0`; testar só `20.x`/`22.x` (latest patch) não pega regressão específica do piso.
   - What's unclear: se vale o custo de manutenção extra (2 entradas adicionais na matriz) para um risco baixo (patches dentro de uma major raramente quebram compat retroativa).
   - Recommendation: começar só com `20.x`/`22.x`; adicionar o piso exato apenas se surgir um bug real de compat de versão no futuro (YAGNI).

4. **WR-02 da Fase 2 (`onHookError` que lança → `unhandledRejection`) entra nesta fase?**
   - What we know: CONTEXT.md já sinaliza isso como "forte candidato" em `<deferred>`.
   - What's unclear: se o planner considera isso escopo de SEC-03 (robustez de tratamento de erro) ou um item separado.
   - Recommendation: incluir — é uma correção pequena (`try/catch` ao redor da chamada de `onHookError` em `fireAndForget`) e está tematicamente alinhada com "erros nunca devem vazar de forma descontrolada", o mesmo espírito de SEC-03.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Docker | testcontainers (testes locais e CI) | ✓ (usado ativamente desde a Fase 1) | — | — |
| Node.js | runtime/build | ✓ | ver `node --version` do ambiente de execução | — |
| npm | scripts/CI | ✓ | — | — |
| GitHub Actions runner (`ubuntu-latest`) | QUAL-03 | N/A localmente — só existe no CI real | — | — |

**Missing dependencies with no fallback:** nenhuma.
**Missing dependencies with fallback:** nenhuma — toda a infraestrutura necessária (Docker, Node, npm) já está disponível e em uso desde a Fase 1.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest 4.1.10 (instalado) |
| Config file | `vitest.config.ts` (existe; falta bloco `coverage.thresholds` — D-10) |
| Quick run command | `npx vitest run test/model/object-id-validation.test.ts` (arquivo único, ~1-2s após container já up) |
| Full suite command | `npm test` (= `vitest run`; sobe/derruba container `mongo:7` via `globalSetup`, ~8s conforme D-12) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SEC-01 | `$where` rejeitado incondicionalmente em `find`/`findMany`/`update`/`updateMany`/`delete`/`deleteMany`/`total`, em qualquer profundidade (`$and`/`$or` aninhado) | unit+integração | `npx vitest run test/model/where-rejection.test.ts` | ❌ Wave 0 |
| SEC-01 | `sanitizeFilter` neutraliza `$where`/`$function`/`$accumulator`/`$expr+$function` e preserva `$gt`/`$in`/`$and`/`$or` | unit | `npx vitest run test/model/sanitize-filter.test.ts` | ❌ Wave 0 |
| SEC-02 | `toObjectId`/`findById` lança `MongoatValidationError` (`code: INVALID_OBJECT_ID`) para string malformada, `undefined`, número, array | unit+integração | `npx vitest run test/model/object-id-validation.test.ts` | ❌ Wave 0 |
| SEC-03 | Erro do driver (ex.: duplicate key) vira `MongoatDriverError` com `.cause` preservado, `.code` mapeado, `.message` sem stack | integração | `npx vitest run test/model/error-hierarchy.test.ts` | ❌ Wave 0 |
| SEC-04 | `setupIndexes()` chamado 2x não dropa índice não-gerenciado nem recria índice idêntico | integração | `npx vitest run test/database/setup-indexes-regression.test.ts` | ❌ Wave 0 |
| QUAL-02 | Todos os 12 métodos de `Model` + métodos públicos de `Database` com happy path + erro; concorrência em registro de model e CRUD paralelo | unit+integração | `npm test` (suíte completa) | Parcial — ver Pattern 3 |
| QUAL-03 | `npm run lint`/`npm run typecheck`/`npm run build`/`npm test`/`npm run check:package` todos verdes localmente antes do workflow existir | smoke (manual, pré-CI) | `npm run lint && npm run typecheck && npm run build && npm test && npm run check:package` | ❌ `lint`/`test:coverage` scripts não existem ainda |

### Sampling Rate
- **Per task commit:** `npx vitest run <arquivo do teste novo>` (rápido, container já up se testcontainers reusar dentro da sessão de watch, ou ~5-10s de cold start em `run` isolado)
- **Per wave merge:** `npm test` (suíte completa, ~8-15s incluindo boot do container)
- **Phase gate:** `npm run lint && npm run typecheck && npm run build && npm run test -- --coverage && npm run check:package` verde localmente ANTES de criar `.github/workflows/ci.yml` — o workflow só deve ser escrito depois que a sequência de comandos já passa manualmente, para não depurar CI E scripts ao mesmo tempo.

### Wave 0 Gaps
- [ ] `eslint.config.js` reescrito como flat config funcional (Pitfall 1) — bloqueia `npm run lint`
- [ ] Script `"lint": "eslint ."` adicionado ao `package.json`
- [ ] Script `"test:coverage": "vitest run --coverage"` adicionado ao `package.json` (ou usar `vitest run --coverage` direto no workflow)
- [ ] `vitest.config.ts` — bloco `test.coverage` com `provider: 'v8'`, `thresholds: { lines: 80, functions: 80, statements: 80, branches: 70 }` (ponto de partida D-10)
- [ ] `test/model/where-rejection.test.ts`, `test/model/sanitize-filter.test.ts`, `test/model/object-id-validation.test.ts`, `test/model/error-hierarchy.test.ts`, `test/database/setup-indexes-regression.test.ts` — todos novos
- [ ] Framework install: nenhum — `vitest`/`@vitest/coverage-v8`/`testcontainers` já instalados

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-------------------|
| V2 Authentication | não | Fora do escopo de uma lib de dados (ODM não gerencia autenticação) |
| V3 Session Management | não | Idem |
| V4 Access Control | parcial | `KModelProxyHandler` (`allowedMethods`) já é o controle de acesso a nível de método — fora de escopo desta fase (Fase 1/2), sem regressão esperada |
| V5 Input Validation | sim | `sanitizeFilter` (opt-in) + guard incondicional de `$where`/`$function`/`$accumulator` + `ObjectId.isValid` — hand-rolled, deliberadamente, ver `## Don't Hand-Roll` |
| V6 Cryptography | não | Nenhuma criptografia introduzida nesta fase |
| V7 Error Handling and Logging | sim | Hierarquia `MongoatError`/`MongoatValidationError`/`MongoatConnectionError`/`MongoatDriverError` com `.cause` preservado e `.message` sanitizada (D-01..D-04) |

### Known Threat Patterns for este stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|----------------------|
| `$where`/`$function`/`$accumulator` — execução de JS arbitrário server-side | Tampering / Elevation of Privilege | Guard incondicional embutido nos métodos do Model (D-05), rejeita com `MongoatValidationError(FORBIDDEN_OPERATOR)` antes de tocar o driver |
| Operator injection (`{$ne: ''}`, `{$gt: ''}` vindo de JSON não validado) | Tampering | `sanitizeFilter` opt-in (D-06/D-07) — responsabilidade do dev aplicar no boundary de input não confiável; a lib não pode adivinhar o que é "confiável" |
| ObjectId malformado causando erro genérico/opaco do driver | Tampering (indiretamente, DoS por erro não tratado) | `toObjectId` fail-loud com `MongoatValidationError(INVALID_OBJECT_ID)` (D-02) |
| Vazamento de stack trace/detalhes internos em erro re-lançado | Information Disclosure | `MongoatError`/subclasses nunca fazem `JSON.stringify(err)`; `.message` sanitizada, `.cause` preservado só para inspeção deliberada (D-03) |
| Vazamento de VALOR de campo duplicado via mensagem de erro E11000 | Information Disclosure | Ver Pitfall 3 / Open Question 2 — mitigação proposta mas não travada pelo CONTEXT.md |
| `setupIndexes` drop-recreate destruindo índices não gerenciados | Denial of Service | Já mitigado na Fase 1 (WR-10) — Fase 3 só adiciona teste de regressão (SEC-04) |
| Supply-chain de nova devDependency (`@eslint/js`) | Tampering | `package-legitimacy check` retornou `[OK]` (118M downloads/semana, repo oficial `eslint/eslint`) — instalação de baixo risco, sem checkpoint humano necessário |

## Sources

### Primary (HIGH confidence — leitura/execução direta no ambiente)
- `node_modules/bson/lib/bson.cjs` (bson@7.0.0 instalado) — implementação de `ObjectId.isValid`/`validateHexString`/constructor
- `node_modules/mongodb/lib/error.js` + `node_modules/mongodb/mongodb.d.ts` (mongodb@7.0.0 instalado) — `MongoServerError.code`/`.codeName`
- `node_modules/vitest/dist/coverage.d.ts` (vitest@4.1.10 instalado) — shape de `Threshold`/`ResolvedThreshold`
- Execução local de `npx eslint` contra `eslint.config.js` atual (falha) e contra um flat config corrigido (funciona, encontra 4 erros reais)
- `src/errors/index.ts`, `src/model/index.ts`, `src/database/index.ts`, `src/utils/database.ts` (código-fonte do próprio repo)
- `.planning/codebase/CONCERNS.md`, `.planning/phases/01-.../01-SECURITY.md`, `.planning/phases/02-.../02-REVIEW.md` (artefatos do próprio projeto)

### Secondary (MEDIUM confidence — WebSearch cross-checado)
- MongoDB Docs — `$where` (query operator), `$function`/`$accumulator` (aggregation) — deprecação em 8.0
- OWASP-adjacent sources sobre NoSQL/operator injection (A03:2021)
- `express-mongo-sanitize` README (padrão de referência para o shape de um sanitizer)
- `actions/setup-node` README (cache nativo npm)
- Docker blog / testcontainers docs sobre `ubuntu-latest` + Ryuk

### Tertiary (LOW confidence)
- Convenção de nomenclatura `SCREAMING_SNAKE_CASE` para `code` de erro (Assumption A1) — inferida, não verificada contra um precedente único

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — todas as versões já instaladas foram verificadas contra o npm registry (`npm view`), sem drift
- Architecture (scanner de operadores, hierarquia de erros): MEDIUM-HIGH — design sintetizado nesta pesquisa a partir de padrões verificados (express-mongo-sanitize, MongoServerError.code), mas sem precedente externo idêntico para copiar 1:1 — sinalizado via Assumptions Log
- ObjectId/bson behavior: HIGH — verificado por leitura direta do código-fonte instalado, não por documentação genérica (que descreve versões antigas incorretamente para este caso)
- CI/lint pitfalls: HIGH — verificado por execução local real (`npx eslint`), não apenas lido
- Pitfalls: HIGH — todos os pitfalls centrais (ObjectId undefined, eslint quebrado, E11000 leak) foram reproduzidos/confirmados nesta sessão, não apenas citados de fontes externas

**Research date:** 2026-07-07
**Valid until:** 30 dias (stack estável — mongodb/bson/vitest pinados; risco de drift baixo exceto por novas versões de `mongodb`/`bson` que a Fase 4 pode considerar atualizar)
