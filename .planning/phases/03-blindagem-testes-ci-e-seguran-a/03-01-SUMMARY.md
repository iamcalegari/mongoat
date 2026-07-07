---
phase: 03-blindagem-testes-ci-e-seguran-a
plan: 01
subsystem: errors
tags: [eslint, flat-config, typescript-eslint, error-hierarchy, mongodb, driver-errors]

requires:
  - phase: 02-sistema-de-hooks-completo-e-api-thin-nativa
    provides: pipeline de hooks completo (pre/post) e wrapDriverError mínimo (WR-11) sobre o qual a hierarquia de erros desta fase é construída
provides:
  - Flat config ESLint 9 real (eslint.config.mjs) e npm run lint funcional como gate de qualidade
  - Hierarquia de erros tipada (MongoatValidationError, MongoatConnectionError, MongoatDriverError) com campo code estável, exportada no barrel público
  - wrapDriverError emitindo MongoatDriverError com code mapeado do driver e redação do valor duplicado em erros E11000
affects: [03-02, 03-03, 03-04, 03-05]

tech-stack:
  added: ["@eslint/js@^9.39.4"]
  patterns:
    - "Flat config ESLint 9 via tseslint.config(eslint.configs.recommended, tseslint.configs.recommended, ...) em .mjs"
    - "Subclasses de erro com Object.setPrototypeOf + code default overridable via options.code"
    - "wrapDriverError: DRIVER_CODE_MAP (código numérico do driver -> code string estável) + mensagem própria fixa para DUPLICATE_KEY (nunca o valor do campo)"

key-files:
  created:
    - eslint.config.mjs
    - test/model/error-hierarchy.test.ts
  modified:
    - src/errors/index.ts
    - src/index.ts
    - src/model/index.ts
    - src/database/index.ts
    - src/types/model.ts
    - package.json
    - tsconfig.json
    - test/model/hooks-post-order.test.ts
    - test/model/hooks-pre-order.test.ts
    - test/model/insert-input-isolation.test.ts

key-decisions:
  - "@eslint/js instalado em ^9.39.4 (não ^10.0.1 do 03-RESEARCH.md) — @eslint/js@10 exige eslint ^10 como peer, incompatível com o eslint@9.39.2 pinado no projeto"
  - "eslint.config.js virou eslint.config.mjs (ESM) em vez de manter CommonJS — evita globals extras (require/module/__dirname) só para o próprio arquivo de config, mais próximo do eslint.config.mjs já testado no 03-RESEARCH.md"
  - "tsdown.config.ts e vitest.config.ts adicionados ao include do tsconfig.json — bloqueavam parserOptions.project do bloco **/*.ts do flat config (Parsing error: file not found in any project)"
  - "ModelValidationSchema<T = any> manteve o any (com eslint-disable pontual e comentário extenso) — never e Record<string,unknown>&DefaultProperties quebram o mapped type homomórfico {[k in keyof T]: ...}, mudança estrutural fora do escopo desta task"
  - "KModelProxyHandler 'method not allowed' permanece MongoatError base (não uma subclasse) com code METHOD_NOT_ALLOWED — gating de acesso via Proxy não é validação/conexão/driver"

patterns-established:
  - "Todo throw interno de Model/Database usa a subclasse de erro correta (MongoatConnectionError/MongoatValidationError) com code estável, nunca a base MongoatError genérica para esses casos"
  - "wrapDriverError é o único ponto que constrói MongoatDriverError a partir de um erro do driver — call-sites (rawInsert/rawInsertMany/rawBulkWrite) permanecem inalterados, apenas chamam a função"

requirements-completed: [SEC-03]

coverage:
  - id: D1
    description: "eslint.config.js quebrado (formato .eslintrc antigo, ignorado silenciosamente pelo ESLint 9) substituído por flat config real (.mjs); npm run lint termina com 0 erros"
    verification:
      - kind: other
        ref: "npm run lint (exit 0, 0 erros)"
        status: pass
      - kind: other
        ref: "npx eslint src/model/index.ts (aplica regras reais, não 'File ignored')"
        status: pass
    human_judgment: false
  - id: D2
    description: "Hierarquia de erros tipada — MongoatValidationError/MongoatConnectionError/MongoatDriverError com code estável, instanceof MongoatError, throws internos de Model/Database migrados"
    requirement: "SEC-03"
    verification:
      - kind: unit
        ref: "test/model/error-hierarchy.test.ts#Hierarquia de erros — instanceof/code (unit, sem driver)"
        status: pass
      - kind: integration
        ref: "test/model/error-hierarchy.test.ts#Model — erro de conexão (MongoatConnectionError)"
        status: pass
    human_judgment: false
  - id: D3
    description: "wrapDriverError emite MongoatDriverError com code mapeado (11000 -> DUPLICATE_KEY) e mensagem que redige o valor duplicado de erros E11000, mantendo-o acessível via .cause"
    requirement: "SEC-03"
    verification:
      - kind: integration
        ref: "test/model/error-hierarchy.test.ts#Model — wrapDriverError emite MongoatDriverError sanitizado (E11000)"
        status: pass
    human_judgment: false

duration: 20min
completed: 2026-07-07
status: complete
---

# Phase 3 Plan 1: Fundação de qualidade tipada — flat config ESLint + hierarquia de erros Summary

**Flat config ESLint 9 real destrava `npm run lint`, e `wrapDriverError` passa a emitir `MongoatDriverError` com `code` estável e redação do valor duplicado em E11000, sobre a nova hierarquia `MongoatValidationError`/`MongoatConnectionError`/`MongoatDriverError`.**

## Performance

- **Duration:** ~20 min
- **Completed:** 2026-07-07
- **Tasks:** 3
- **Files modified:** 13 (2 criados: `eslint.config.mjs`, `test/model/error-hierarchy.test.ts`)

## Accomplishments

- `eslint.config.js` (formato `.eslintrc` antigo, ignorado silenciosamente pelo ESLint 9 — bloqueador do lint gate de D-12) reescrito como `eslint.config.mjs`, flat config real; `npm run lint` novo, `@eslint/js` como devDependency
- Os 4 pontos de `any` explícito conhecidos (3 `catch (err: any)` + 1 `operation as any` em `src/model/index.ts`) eliminados; lint gate revelou e resolveu mais `any`/violações pré-existentes em `src/database/index.ts` e `src/types/model.ts`
- Hierarquia de erros tipada (D-01/D-04): `MongoatValidationError`, `MongoatConnectionError`, `MongoatDriverError` — cada uma com `code` default estável, override pontual, `Object.setPrototypeOf` e `instanceof MongoatError`
- Todos os throws internos de `Model`/`Database` migrados para a subclasse correta (conexão, validação, gating de método)
- `wrapDriverError` evoluído: mapeia `err.code` do driver (`11000` → `DUPLICATE_KEY`) e, para chave duplicada, redige o valor do campo da mensagem — só o nome do índice aparece, o valor completo segue em `.cause`
- `test/model/error-hierarchy.test.ts` novo cobrindo E11000 real (testcontainer), discriminação `instanceof`/`.code` e erro de conexão

## Task Commits

1. **Task 1: Flat config ESLint 9 funcional + destravar npm run lint** - `7550bb6` (feat)
2. **Task 2: Hierarquia de erros tipada com code estável + migração dos throws internos** - `a5f3051` (feat)
3. **Task 3: wrapDriverError → MongoatDriverError (code map + redação E11000) + teste de hierarquia** - `d60b8b0` (feat)

**Plan metadata:** (este commit, docs: complete plan)

## Files Created/Modified

- `eslint.config.mjs` - Flat config ESLint 9 (novo, substitui `eslint.config.js`)
- `package.json` - script `lint`, devDependency `@eslint/js@^9.39.4`
- `tsconfig.json` - `tsdown.config.ts`/`vitest.config.ts` adicionados ao `include`
- `src/errors/index.ts` - `MongoatError.code` + 3 subclasses novas (D-01/D-04)
- `src/index.ts` - barrel exporta as 3 subclasses
- `src/model/index.ts` - throws migrados; `wrapDriverError` → `MongoatDriverError` com `DRIVER_CODE_MAP`; `catch (err: unknown)`; `operation as any` → tipo estreito
- `src/database/index.ts` - throws migrados (`withTransaction`, `kGetDbName`, `KModelProxyHandler`); `KModelMap` sem `any`; `withTransaction<T>` genérico; `Boolean` → `boolean`
- `src/types/model.ts` - `ValidationQueryExpressions` vira type alias; `ModelSetup.documentDefaults` tipado com `Document`
- `test/model/error-hierarchy.test.ts` - novo, cobre E11000/instanceof/conexão
- `test/model/hooks-post-order.test.ts`, `test/model/hooks-pre-order.test.ts` - parâmetro `ctx` não usado removido
- `test/model/insert-input-isolation.test.ts` - `any` trocado por `AnyBulkWriteOperation<Doc>`/`Filter<Doc>`

## Decisions Made

- `@eslint/js@^9.39.4` em vez de `^10.0.1` (recomendação do 03-RESEARCH.md): `@eslint/js@10` declara `peerDependencies.eslint: ^10.0.0`, incompatível com o `eslint@9.39.2` já pinado no projeto — instalar a v10 quebraria a árvore de peer deps. `9.39.4` é a última da linha 9.x, sem conflito.
- `eslint.config.js` → `eslint.config.mjs`: o pacote não declara `"type": "module"`, então um `.js` de config seria CommonJS e precisaria de globals extras (`require`/`module`/`__dirname`) só para si mesmo. `.mjs` evita isso e é o formato já testado no 03-RESEARCH.md.
- `tsconfig.json` ganhou `tsdown.config.ts`/`vitest.config.ts` no `include` — sem isso, o bloco `{ files: ['**/*.ts'], parserOptions: { project: './tsconfig.json' } }` do flat config falhava com "Parsing error: file not found in any of the provided project(s)" para esses dois arquivos raiz.
- `ModelValidationSchema<T = any>` manteve o `any` (documentado, com `eslint-disable-next-line` pontual): duas alternativas sem `any` foram tentadas e descartadas por quebrarem o mapped type homomórfico `{ [k in keyof T]: ... }` — `never` colapsa `properties`/`required` para `undefined`; `Record<string, unknown> & DefaultProperties` faz `updatedAt`/`insertedAt` virarem propriedades obrigatórias extras em `properties`, quebrando toda a suíte de testes existente. Redesenhar esse generic é mudança estrutural fora do escopo do lint gate desta task (Rule 4).
- `KModelProxyHandler` "method not allowed" permanece `MongoatError` base (não `MongoatValidationError`/`MongoatConnectionError`) — o plano já especificava isso: gating de acesso via Proxy não é validação de dados nem estado de conexão; ganhou `code: 'METHOD_NOT_ALLOWED'`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `@eslint/js@^10.0.1` da pesquisa é incompatível com o `eslint@9.39.2` pinado**
- **Found during:** Task 1
- **Issue:** 03-RESEARCH.md recomendava `@eslint/js@^10.0.1`, mas essa versão declara `peerDependencies.eslint: ^10.0.0` — instalar quebraria a árvore de peer deps do projeto (eslint fica em `9.39.2`).
- **Fix:** Instalado `@eslint/js@^9.39.4` (última da linha 9.x, mesma major do eslint já pinado, sem conflito de peer).
- **Files modified:** `package.json`, `package-lock.json`
- **Verification:** `npm install` sem warnings de peer dependency; `npm run lint` funcional.
- **Committed in:** `7550bb6` (Task 1)

**2. [Rule 3 - Blocking] Lint gate revelou muito mais que os 4 erros esperados de `any`**
- **Found during:** Task 1
- **Issue:** O plano citava 4 erros conhecidos (`03-RESEARCH.md` testou apenas contra `src/model/index.ts`). Rodar `npm run lint` no projeto inteiro revelou: `eslint.config.js` quebrando a si mesmo (require/module/__dirname), `any` em `src/database/index.ts` (`KModelMap`, `withTransaction`, `result`) e `src/types/model.ts` (`ValidationQueryExpressions`, `ModelSetup.documentDefaults`, `ModelValidationSchema<T>`), `Boolean` wrapper type, interface vazia, `ctx` não usado em 2 testes de hooks, `any` em `insert-input-isolation.test.ts`, e parsing error em `tsdown.config.ts`/`vitest.config.ts` (fora do `include` do tsconfig).
- **Fix:** Cada um corrigido pontualmente (ver "Files Created/Modified" acima); `ModelValidationSchema<T = any>` foi a única exceção mantida com `any` documentado, por risco estrutural (ver "Decisions Made").
- **Files modified:** `eslint.config.mjs`, `src/database/index.ts`, `src/types/model.ts`, `tsconfig.json`, `test/model/hooks-post-order.test.ts`, `test/model/hooks-pre-order.test.ts`, `test/model/insert-input-isolation.test.ts`
- **Verification:** `npm run lint` exit 0; `npm run typecheck` verde; `npm test` 24/24 arquivos, 69/69 testes (antes da Task 3 adicionar o 25º arquivo).
- **Committed in:** `7550bb6` (Task 1)

**3. [Rule 1 - Bug] Cast solto exposto pela remoção de `any` de `KModelMap`**
- **Found during:** Task 1 (efeito colateral de tipar `Map<string, Model | any>` → `Map<string, Model>`)
- **Issue:** Dois pontos (`Database.defineModel`, `Model` constructor) já faziam cast de `Model<Document>` para `Model<ModelType>` implicitamente via o `any` do map; sem ele, `tsc` acusou "neither type sufficiently overlaps" / "Return type of constructor signature must be assignable".
- **Fix:** Aplicado o padrão de double-cast já usado no mesmo arquivo (`as unknown as Model<ModelType>`), consistente com `existing as unknown as Model<Document>` já existente na mesma função.
- **Files modified:** `src/database/index.ts`, `src/model/index.ts`
- **Verification:** `npm run typecheck` verde.
- **Committed in:** `7550bb6` (Task 1)

---

**Total deviations:** 3 auto-fixados (2 Rule 3 - bloqueantes, 1 Rule 1 - bug exposto por refactor)
**Impact on plan:** Todos os desvios foram necessários para que a acceptance criteria da Task 1 ("npm run lint termina com exit code 0 e 0 erros") fosse cumprida de fato — sem eles o lint gate ficaria parcialmente quebrado ou o typecheck regrediria. Nenhum scope creep além do necessário para o gate funcionar; a única exceção documentada (`ModelValidationSchema<T = any>`) foi deliberadamente NÃO resolvida por risco de regressão estrutural, com justificativa registrada inline no código.

## Issues Encountered

Nenhum não coberto acima pelas Deviations.

## User Setup Required

None - nenhuma configuração de serviço externo necessária.

## Next Phase Readiness

- `MongoatValidationError` (produzida aqui) está pronta para SEC-01/SEC-02 (Plano 02 — `sanitizeFilter`/`$where`, `toObjectId`).
- `MongoatDriverError` fecha SEC-03 completamente (wrap sanitizado + code + cause).
- Lint gate (`npm run lint`) agora existe de verdade — pré-requisito de QUAL-03/D-12, entregue no Plano 05 (CI).
- Nenhum bloqueio conhecido para o Plano 02.

---
*Phase: 03-blindagem-testes-ci-e-seguran-a*
*Completed: 2026-07-07*

## Self-Check: PASSED

- FOUND: `.planning/phases/03-blindagem-testes-ci-e-seguran-a/03-01-SUMMARY.md`
- FOUND: `7550bb6` (Task 1)
- FOUND: `a5f3051` (Task 2)
- FOUND: `d60b8b0` (Task 3)
