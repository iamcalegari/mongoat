---
phase: 01-funda-o-core-sem-bugs-e-build-moderno
verified: 2026-07-07T05:40:00Z
status: passed
score: 5/5 must-haves verified
behavior_unverified: 0
overrides_applied: 0
---

# Phase 1: Fundação — Core sem bugs e build moderno — Verification Report

**Phase Goal:** A lib compila em formato dual CJS/ESM com `exports` map correto e não tem nenhum bug de correção conhecido — uma base confiável para tudo que vem depois.
**Verified:** 2026-07-07T05:40:00Z
**Status:** passed
**Re-verification:** No — initial verification

> Nota de processo: `ROADMAP.md` marca esta fase com `Mode: mvp`, mas o texto do goal da fase não está no formato User Story (`user-story.validate` retorna `valid: false`). O objeto de verificação recebido para esta execução já veio pré-formatado com Success Criteria padrão (não com um pedido de User Flow Coverage), então esta verificação seguiu o método padrão goal-backward (Success Criteria do ROADMAP + must_haves dos 5 PLANs), não o fluxo estreito de MVP User Story. Recomenda-se, fora desta verificação, corrigir o goal da Fase 1 no ROADMAP para o formato User Story ou remover `Mode: mvp` se a intenção real era um goal técnico.

## Goal Achievement

Toda a evidência abaixo foi coletada rodando os comandos eu mesmo neste ambiente (não a partir das alegações dos SUMMARY.md) em 2026-07-07: `npm run build`, `npx tsc --noEmit`, `npm run check:package`, `npx vitest run` (suíte completa contra MongoDB real via testcontainers), `grep` sobre `lib/` e `package.json`, e dois smoke-installs reais (CJS `require` + ESM `import`) a partir do tarball gerado por `npm pack`.

### Observable Truths (Success Criteria do ROADMAP)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Documentos transformados por pre-hooks são persistidos corretamente em todos os caminhos de inserção, incluindo `insertMany` (nenhuma cadeia de hooks não aguardada) | ✓ VERIFIED | `src/model/index.ts:387-391` — `insertMany` usa `await Promise.all(documents.map(...))`; `insert()` já aguardava. `test/model/insertmany-hooks.test.ts` prova ordenação real com hook assíncrono (`setTimeout` 20ms) — os 3 docs persistidos refletem a mutação. Rodei `npx vitest run` eu mesmo: 20/20 testes verdes. `bulkWrite()` nunca teve hooks amarrados (confirmado por `git show HEAD~20`, comportamento pré-existente fora do escopo dos 5 bugs de `CONCERNS.md`) — não é uma regressão desta fase. |
| 2 | Métodos gateados pelo Proxy mantêm o binding correto de `this`, e `find()` retorna um resultado consistente e precisamente tipado | ✓ VERIFIED | `src/database/index.ts:337-348` — `KModelProxyHandler.get` faz `return value.bind(target)` (nunca `.bind(receiver)`); guard de `allowedMethods` lança `MongoatError`. `test/database/proxy-binding.test.ts` (5 casos) prova: chamada interna `findById → this.find` não reentra no guard; guard lança via `new Model()` direto e via `defineModel()` deprecated; `defineModel()` não produz duplo-Proxy. `src/model/index.ts:406-413` — `find()` declara `Promise<WithId<ModelType> \| null>` (sem união síncrona); `test/model/find-typing.test.ts` prova via `tsc --noEmit` (atribuição de assinatura exata) + runtime (`await find()` resolve doc/null). |
| 3 | O pacote instala e importa corretamente em projetos CommonJS e ESM, com os tipos resolvendo sob `are-the-types-wrong` (exports map válido) | ✓ VERIFIED | `npm run build` (tsdown) produz `lib/index.mjs`, `lib/index.cjs`, `lib/index.d.mts`, `lib/index.d.cts` sem aliases `@/` não resolvidos. `npm run check:package` (rodei eu mesmo): publint "No problems found"; attw com todas as 4 células verdes (node10, node16 CJS/ESM, bundler). Smoke real independente que eu executei: `npm pack` → instalei o tarball em dois mini-projetos scratch (`type` ausente/CJS e `"type":"module"`/ESM) → `require('@iamcalegari/mongoat')` e `import('@iamcalegari/mongoat')` ambos retornam `Database`/`Model`/`MongoatError` como `function`. |
| 4 | O registro de models é livre de race condition e o setup de schema não muta objetos de schema compartilhados (`includeAdditionalPropertiesFalse`) | ✓ VERIFIED | `src/model/index.ts:130-164` — o `validator` é construído e comparado (`isSameConfig`) ANTES do early-return, sem nenhum `await` entre o `getModel()` e o `registerModel()` final (confirmado por leitura completa do constructor — nenhum `await` no trecho). `test/model/registry-config.test.ts`: config igual reaproveita a instância (`toBe`); config divergente lança `MongoatError` sem vazar o schema (`not.toContain('extraDivergentField')`). `src/model/index.ts:210` — `structuredClone(schema)` antes de `includeAdditionalPropertiesFalse`; `test/model/schema-clone.test.ts` prova que um schema compartilhado entre 2 models permanece intacto. |
| 5 | A lib não carrega mais a dependência de runtime `json-schema` | ✓ VERIFIED | `package.json` não lista `json-schema` nem em `dependencies` nem em `devDependencies` (vendorizado por completo em `src/types/model.ts` como `JSONSchema4Subset`, indo além do plano original que previa "mover para devDependencies"). `grep -REn "json-schema" lib/` só retorna comentários JSDoc (texto, não `import`) — confirmado por mim; `npx tsc --noEmit` limpo. |

**Score:** 5/5 truths verified (0 presentes-mas-não-verificados; 0 overrides)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/errors/index.ts` | Classe `MongoatError` extends `Error`, com `cause` | ✓ VERIFIED | Existe, `instanceof` correto via `Object.setPrototypeOf`; exercitado indiretamente por `toThrow(MongoatError)` em 3 arquivos de teste (proxy-binding, dbname-required, registry-config). Nenhum teste unitário direto de `.cause` preservado (ver Anti-Patterns/Info abaixo — não bloqueante). |
| `package.json` | Manifesto dual CJS/ESM, engines, files, scripts | ✓ VERIFIED | `engines.node`, `files:["lib"]`, `exports["."]` dual com `types` primeiro, scripts `build`/`check:package`/`test`/`typecheck` — todos confirmados por leitura direta do arquivo. |
| `tsconfig.json` | target ES2023 | ✓ VERIFIED | `"target": "ES2023"`, `"lib": ["ES2023"]` confirmados. |
| `tsdown.config.ts` | Config do bundler dual | ✓ VERIFIED | `entry: ['src/index.ts']`, `format: ['esm','cjs']`, `dts: true`, `outDir: 'lib'`. |
| `lib/` (gerado) | Saída dual | ✓ VERIFIED | 4 arquivos gerados por `npm run build` executado por mim; smoke CJS+ESM reais confirmam consumo. |
| `vitest.config.ts` | Aliases + globalSetup | ✓ VERIFIED | Presente; `npx vitest run` (rodado por mim) resolve `@/*` em 10 arquivos de teste. |
| `test/setup/testcontainer.ts` | Container Mongo real (mongo:7) | ✓ VERIFIED | `docker ps -a` pós-run confirma zero containers órfãos; suíte inteira roda contra Mongo real. |
| `src/database/index.ts` | Proxy fix, dbName sem fallback, resetRegistry | ✓ VERIFIED | Lido linha a linha — todos os 3 fixes presentes e wired. |
| `src/model/index.ts` | insertMany/find/schema-clone/getCollectionOrThrow/isSameConfig | ✓ VERIFIED | Lido linha a linha — todos os fixes presentes e wired; bug adicional de `delete()` (`result?.value` sempre `undefined` no driver v7) também corrigido. |
| `test/database/*.test.ts`, `test/model/*.test.ts` | Regressão dos bugs | ✓ VERIFIED | 9 arquivos de teste novos + `test/smoke.test.ts`, todos lidos e confirmados como testes substantivos (não stubs) contra Mongo real. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| `src/index.ts` | `src/errors/index.ts` | `export { MongoatError } from './errors'` | ✓ WIRED | Confirmado por leitura. |
| `package.json` `exports["."]` | `lib/index.{mjs,cjs,d.mts,d.cts}` | build do tsdown | ✓ WIRED | Arquivos existem após `npm run build`; smoke real de consumo confirma resolução. |
| `tsdown.config.ts` entry | `src/index.ts` | bundling | ✓ WIRED | Build produz saída correta a partir do entry único. |
| `src/database/index.ts` `KModelProxyHandler` | `src/model/index.ts` métodos CRUD | `value.bind(target)` | ✓ WIRED | Teste de binding prova chamada interna sem reentrar no guard. |
| `vitest.config.ts` `globalSetup` | `test/setup/testcontainer.ts` | `MONGODB_URI`/`MONGODB_DB_NAME` via env | ✓ WIRED | Todos os 10 arquivos de teste leem essas envs e passam contra o container real. |
| `Database.resetRegistry()` (plan 04) | `test/model/registry-config.test.ts`, `test/database/registry-reset.test.ts` (plan 05/04) | chamada direta em `beforeEach`/teste | ✓ WIRED | Confirmado por leitura dos testes. |
| `src/model/index.ts` `getCollectionOrThrow()` | 11 métodos CRUD | chamada interna em cada método | ✓ WIRED | Confirmado por leitura — `aggregate`, `update`, `updateMany`, `findMany`, `deleteMany`, `insert`, `insertMany`, `find`, `delete`, `total`, `bulkWrite` usam o helper. |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Build dual CJS/ESM | `npm run build` | 4 arquivos gerados, sem aliases `@/` não resolvidos | ✓ PASS |
| Typecheck | `npx tsc --noEmit` | exit 0 | ✓ PASS |
| Empacotamento (publint+attw) | `npm run check:package` | publint "No problems found"; attw 4/4 células verdes | ✓ PASS |
| `json-schema` fora do runtime | `grep -REn "json-schema" lib/` + `npm pkg get dependencies devDependencies` | nenhuma entrada em deps; só comentários JSDoc em `lib/` | ✓ PASS |
| Suíte de testes completa (Mongo real) | `npx vitest run` | 10 arquivos / 20 testes, todos verdes | ✓ PASS |
| Containers órfãos | `docker ps -a` pós-run | nenhum container mongo remanescente | ✓ PASS |
| Consumo real CJS | `npm pack` → `npm install <tgz>` → `require(...)` em mini-projeto scratch | `function function function` (Database/Model/MongoatError) | ✓ PASS |
| Consumo real ESM | idem, `"type":"module"` + `import(...)` | `function function function` | ✓ PASS |
| Commits das 5 plans | `git log --oneline \| grep <hash>` para os 14 hashes citados nos SUMMARYs | todos os 14 hashes encontrados | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan(s) | Description | Status | Evidence |
|-------------|----------------|--------------|--------|----------|
| QUAL-01 | 01-01, 01-03, 01-04, 01-05 | 5 bugs conhecidos de `CONCERNS.md` corrigidos (hooks insertMany, binding Proxy, tipo find, race do registry, mutação de schema) | ✓ SATISFIED | Todos os 5 bugs mapeados 1:1 contra `CONCERNS.md` e confirmados corrigidos + testados (ver tabela de Truths acima). `REQUIREMENTS.md` marca `[x]`. |
| QUAL-04 | 01-01, 01-02 | `json-schema` removido do runtime | ✓ SATISFIED | Confirmado — removido por completo (nem devDependency), vendorizado. |
| REL-02 | 01-01, 01-02 | Build dual CJS/ESM com exports map correto, validado por attw | ✓ SATISFIED | Confirmado — build, attw, publint, smoke real todos verdes. |

**Nota de rastreabilidade:** `REQUIREMENTS.md` (tabela "Traceability", linha `QUAL-01`) ainda mostra o texto "In Progress (01-01 lançou MongoatError; fixes em 01-03/04/05)" apesar do checkbox `[x]` já estar marcado como completo na seção "v1 Requirements" acima da tabela. Isso é uma inconsistência de documentação (a tabela não foi atualizada após o fechamento em 01-05), não um gap de código — o código e os testes confirmam QUAL-01 fechado. Recomenda-se atualizar a célula da tabela para "Complete" em um commit de doc separado.

Nenhum requisito órfão: os únicos IDs de requirement mapeados para a Fase 1 em `REQUIREMENTS.md` (QUAL-01, QUAL-04, REL-02) aparecem exatamente nos `requirements:` de pelo menos um dos 5 PLANs.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `tsconfig.json` | 38 | `// TODO(NODE-3659): Enable useUnknownInCatchVariables...` | ℹ️ Info | Marcador pré-existente (não introduzido por esta fase); o próprio PLAN 01-01 prescreve explicitamente **não** tocar nessa flag (Pitfall 4, escopo Fase 3/SEC-04) e referencia um issue rastreável (`NODE-3659`). Não bloqueante. |
| `src/database/index.ts` | 64-72 | `config.uri` só é aplicado quando `username` E `password` também estão presentes (senão cai silenciosamente no `mongodb://127.0.0.1:27017/` default) | 🛑 Crítico (fora do escopo desta fase) | Encontrado por `01-REVIEW.md` (CR-01) — **não é um dos 5 bugs listados em `CONCERNS.md`/QUAL-01**, é um bug pré-existente descoberto durante a revisão adversarial da Fase 1. Por instrução explícita do orquestrador desta verificação, achados novos fora do escopo dos 5 bugs-alvo não reprovam a fase. Recomenda-se registrar como item de backlog/nova entrada em `CONCERNS.md` para correção em fase futura (ex.: Fase 3/segurança). |
| `src/database/index.ts` | 305-323 | `withTransaction()` vira no-op silencioso (resolve `undefined` sem chamar `fn`) quando o client não está conectado | 🛑 Crítico (fora do escopo desta fase) | `01-REVIEW.md` (CR-02) — mesma situação do item acima: achado novo, fora dos 5 bugs de QUAL-01, não bloqueia esta fase por instrução explícita, mas deveria virar item de backlog. |
| `src/model/index.ts` | 399-404, 461-465 | `try/catch` morto em `insertMany`/`bulkWrite` (`return` sem `await` dentro do `try`) | ⚠️ Warning (fora do escopo) | `01-REVIEW.md` (WR-01) — mesma classe do bug corrigido nos pre-hooks, mas em um trecho diferente (o wrap de erro do driver, não os hooks); não fazia parte dos 5 bugs-alvo. |
| `src/database/index.ts` | 179-183 | `Database.defineModel()` (deprecated) ainda ignora config divergente silenciosamente (bug D-06 original não propagado para o caminho deprecated) | ⚠️ Warning (fora do escopo) | `01-REVIEW.md` (WR-03) — o construtor do `Model` foi corrigido; o wrapper deprecated que delega a ele não repete a checagem porque faz early-return antes de chamar `Model.create`. Não fazia parte do escopo explícito de D-06 (que mirava o construtor). |
| `src/errors/index.ts` | — | Nenhum teste unitário direto de `MongoatError` (instanceof/name/cause) — coberto apenas indiretamente via `toThrow(MongoatError)` em outros testes | ℹ️ Info | O SUMMARY do plan 01-01 documenta que a verificação comportamental foi feita via script `tsx` ad-hoc não commitado. Comportamento nativo de `Error` (`super(message, options)` + `cause`), risco baixo; não bloqueante. |

Os demais 8 warnings e 9 infos de `01-REVIEW.md` (WR-02, WR-04 a WR-11, IN-01 a IN-10, exceto os já citados) são, na leitura desta verificação, também fora do escopo dos 5 bugs-alvo de QUAL-01/REL-02/QUAL-04 e não impactam nenhuma das 5 Success Criteria do ROADMAP — mantidos apenas como referência em `01-REVIEW.md`, não repetidos aqui.

### Human Verification Required

Nenhum item. Todas as truths desta fase são verificáveis programaticamente (build, typecheck, testes automatizados contra Mongo real, smoke de consumo real) e foram de fato executadas por esta verificação — não apenas lidas do SUMMARY.

### Gaps Summary

Nenhum gap bloqueante encontrado. Os 5 bugs conhecidos de QUAL-01 (mais 2 bugs adicionais descobertos e corrigidos pelos próprios executores — duplo-Proxy do constructor do `Model` em 01-04, e `delete()` sempre retornando `undefined` em 01-05) estão corrigidos, travados por teste de regressão real contra MongoDB, e o build dual CJS/ESM com exports map válido está funcional e comprovado por consumo real (CJS+ESM) e pelo gate `are-the-types-wrong`. `json-schema` foi removido por completo do pacote (runtime e tipos).

Os 2 achados críticos e 11 warnings do `01-REVIEW.md` são problemas reais, mas são **novos** (descobertos pela revisão adversarial, não parte dos 5 bugs documentados em `CONCERNS.md` que definiam o escopo de QUAL-01) e não contradizem nenhuma das 5 Success Criteria do ROADMAP desta fase. Por instrução explícita do escopo desta verificação, não bloqueiam o fechamento da Fase 1, mas devem ser registrados como débito técnico para triagem em fase futura (recomenda-se adicioná-los a `.planning/codebase/CONCERNS.md` ou abrir uma entrada de backlog antes de iniciar a Fase 2).

---

_Verified: 2026-07-07T05:40:00Z_
_Verifier: Claude (gsd-verifier)_
