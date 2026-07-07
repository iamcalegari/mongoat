---
phase: 01-funda-o-core-sem-bugs-e-build-moderno
plan: 01
subsystem: infra
tags: [tsdown, vitest, testcontainers, are-the-types-wrong, publint, tsx, package-json, tsconfig, mongoaterror]

# Dependency graph
requires: []
provides:
  - "package.json migrado: engines Node >=20.19, files=[\"lib\"], exports dual root-only (types primeiro), scripts modernos (build/check:package/test/test:watch/typecheck/example)"
  - "json-schema movido para devDependencies (fora do runtime)"
  - "devDependencies mortas removidas (ts-jest, ts-node-dev, tsc-alias, tsconfig-paths, typescript-cached-transpile)"
  - "tooling de build/test instalado (tsdown, vitest, @vitest/coverage-v8, @testcontainers/mongodb, testcontainers, @arethetypeswrong/cli, publint, tsx, vite-tsconfig-paths)"
  - "tsconfig.json target ES2023, lib alinhada, bloco ts-node obsoleto removido"
  - "MongoatError (extends Error, com cause) exportada em @/errors e no barrel raiz"
affects: ["01-02 (tsdown.config.ts consome o exports map e scripts.build daqui)", "01-03 (vitest.config.ts/test infra consomem vitest/testcontainers instalados aqui)", "01-04, 01-05 (fixes de bugs vão lançar MongoatError)"]

# Tech tracking
tech-stack:
  added: [tsdown@0.22.3, vitest@4.1.10, "@vitest/coverage-v8@4.1.10", "@testcontainers/mongodb@12.0.4", testcontainers@12.0.4, "@arethetypeswrong/cli@0.18.4", publint@0.3.21, tsx@4.23.0, vite-tsconfig-paths@6.1.1]
  patterns:
    - "Classe de erro própria (MongoatError extends Error, preserva cause, Object.setPrototypeOf para instanceof correto)"
    - "exports map dual CJS/ESM root-only, types como primeira key de cada condition"

key-files:
  created: [src/errors/index.ts]
  modified: [package.json, tsconfig.json, src/index.ts]

key-decisions:
  - "Checkpoint de supply-chain (D-14/T-01-01-SC) aprovado pelo usuário para os 7 pacotes [SUS] com as versões exatas verificadas no npm registry em 2026-07-07 — nenhum ajuste de versão pedido."
  - "Subpath exports (./database, ./model, ./utils, ./types) removidos do package.json — decisão de discretion do plan, barrel raiz já cobre tudo (evita quadruplicar o exports map em formato dual)."
  - "Bloco ts-node do tsconfig.json removido (referenciava tsconfig-paths e typescript-cached-transpile, ambos desinstalados nesta task) — dead config, Rule 1."

patterns-established:
  - "MongoatError como base de erros novos da fase (D-11) — próximos fixes (D-06, D-08, D-10) lançam a partir dela, não Error genérico."

requirements-completed: [REL-02, QUAL-04, QUAL-01]

coverage:
  - id: D1
    description: "package.json migrado para engines Node >=20.19, files=[\"lib\"], exports dual root-only com types primeiro, scripts build/check:package/test/test:watch/typecheck/example"
    requirement: "REL-02"
    verification:
      - kind: unit
        ref: "node -e assertion script (Task 2 <verify>) — engines, files, exports shape, scripts, dead deps"
        status: pass
    human_judgment: false
  - id: D2
    description: "json-schema removido de dependencies (runtime) e movido para devDependencies"
    requirement: "QUAL-04"
    verification:
      - kind: unit
        ref: "node -e assertion (Task 2 <verify>) — !p.dependencies['json-schema']"
        status: pass
    human_judgment: false
  - id: D3
    description: "devDependencies mortas removidas (ts-jest, ts-node-dev, tsc-alias, tsconfig-paths, typescript-cached-transpile); npm ls ts-jest confirma ausência"
    verification:
      - kind: unit
        ref: "npm ls ts-jest (output: (empty))"
        status: pass
    human_judgment: false
  - id: D4
    description: "MongoatError criada (extends Error, cause preservado, instanceof correto sob ES2023) e exportada no barrel raiz src/index.ts"
    requirement: "QUAL-01"
    verification:
      - kind: unit
        ref: "grep + npx tsc --noEmit (Task 3 <verify>); assertion script via tsx (instanceof Error/MongoatError, name, cause reference, cause.message, @/errors alias resolution) — todos PASS"
        status: pass
    human_judgment: false
  - id: D5
    description: "tsconfig.json target ES2023, useUnknownInCatchVariables permanece false, TypeScript mantido em 5.9.x"
    verification:
      - kind: unit
        ref: "grep tsconfig.json (target, useUnknownInCatchVariables); npm pkg get devDependencies.typescript"
        status: pass
    human_judgment: false

duration: 25min
completed: 2026-07-07
status: complete
---

# Phase 1 Plan 01: Fundação de tooling, manifesto dual e MongoatError Summary

**Manifesto npm migrado para Node >=20.19 com exports dual CJS/ESM root-only, tooling de build/test moderno instalado (tsdown, vitest, testcontainers), json-schema fora do runtime, e nova classe MongoatError como base de erros da fase.**

## Performance

- **Duration:** 25 min (sessão de continuação, após checkpoint de supply-chain aprovado)
- **Started:** 2026-07-07T04:05:00Z (retomada)
- **Completed:** 2026-07-07T04:30:00Z
- **Tasks:** 3 (1 checkpoint aprovado + 2 auto)
- **Files modified:** 3 (package.json, tsconfig.json, src/index.ts) + 1 criado (src/errors/index.ts)

## Accomplishments
- Checkpoint de legitimidade de supply-chain (Task 1) aprovado pelo usuário — 7 pacotes [SUS] confirmados contra o npm registry com as versões exatas (tsdown 0.22.3, vitest 4.1.10, @testcontainers/mongodb 12.0.4, testcontainers 12.0.4, @arethetypeswrong/cli 0.18.4, tsx 4.23.0, @vitest/coverage-v8 4.1.10) antes de qualquer `npm install`.
- `package.json` migrado: `engines.node` = `"^20.19.0 || >=22.12.0"` (D-01), `files: ["lib"]` (D-05), exports map dual root-only com `types` primeiro em cada condition (D-03), subpath exports removidos, scripts `build` (tsdown), `check:package` (attw+publint), `test`/`test:watch` (vitest), `typecheck` (tsc --noEmit), `example` (tsx).
- `json-schema` movido de `dependencies` para `devDependencies` (QUAL-04) — import já era type-only.
- Dead devDependencies removidas: `ts-jest`, `ts-node-dev`, `tsc-alias`, `tsconfig-paths`, `typescript-cached-transpile` (D-12).
- `tsconfig.json`: `target` → `ES2023`, `lib` → `["ES2023"]` (D-02); bloco `ts-node` obsoleto removido (referenciava pacotes já desinstalados).
- `MongoatError` criada em `src/errors/index.ts` (extends `Error`, aceita `{ cause }`, `Object.setPrototypeOf` para `instanceof` correto) e exportada no barrel raiz `src/index.ts` (D-11) — base para os fixes de erro das próximas tasks (D-06, D-08, D-10).

## Task Commits

Cada task foi commitada atomicamente:

1. **Task 1: Verificar legitimidade dos pacotes de tooling antes de instalar** — checkpoint `human-verify`/`blocking-human`, sem arquivos modificados (nenhum commit; aprovação registrada nesta Summary e nos metadados do checkpoint resolvido).
2. **Task 2: Migrar package.json e tsconfig target** — `b3f7e91` (feat)
3. **Task 3: Criar MongoatError e exportar no barrel** — `5a51a93` (feat)

**Plan metadata:** commit de fechamento a seguir (docs: complete plan)

_Nota: Task 3 tem `tdd="true"`, mas a infraestrutura de testes persistente (vitest.config.ts, test/) é escopo do plan 01-03 (`files_modified` daquele plano). Seguindo o `<verify>` explícito desta task (grep + `npx tsc --noEmit`), o ciclo RED/GREEN foi conduzido com um script de asserção ad-hoc via `tsx` (não commitado — script de verificação, não de teste permanente): RED confirmado (`Cannot find module '/home/alan/Dev/mongoat/src/errors'`) antes da implementação; GREEN confirmado (todas as 5 asserções de comportamento PASS, incluindo `instanceof`, `name`, preservação de `cause` e resolução do alias `@/errors`) após. Um único commit `feat` foi criado, alinhado ao `files_modified` declarado no frontmatter do plano (sem arquivo de teste permanente nesta task)._

## Files Created/Modified
- `package.json` - engines, files, exports (dual CJS/ESM), scripts, deps migrados
- `tsconfig.json` - target ES2023, lib alinhada, bloco ts-node obsoleto removido
- `src/errors/index.ts` (novo) - classe `MongoatError`
- `src/index.ts` - re-exporta `MongoatError`

## Decisions Made
- Checkpoint de supply-chain aprovado com as versões exatas verificadas no npm registry (2026-07-07); nenhum ajuste solicitado pelo usuário.
- Subpath exports removidos do `package.json` (Claude's Discretion do plano) — barrel raiz já cobre todo o público, e mantê-los quadruplicaria o exports map em formato dual.
- Bloco `ts-node` do `tsconfig.json` removido por referenciar `tsconfig-paths`/`typescript-cached-transpile`, ambos desinstalados nesta mesma task (Rule 1 — dead config causada diretamente pela mudança).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Removido bloco `ts-node` obsoleto do tsconfig.json**
- **Found during:** Task 2 (migração de package.json/tsconfig)
- **Issue:** `tsconfig.json` mantinha um bloco `"ts-node": { "compiler": "typescript-cached-transpile", "require": ["tsconfig-paths/register"] }` que referenciava dois pacotes recém-desinstalados nesta mesma task (D-12) — config morta e potencialmente quebrada se algo ainda invocasse `ts-node` diretamente.
- **Fix:** Bloco `ts-node` removido inteiramente; `examples` já migrou para `tsx` (D-16), que não consome esse bloco.
- **Files modified:** tsconfig.json
- **Verification:** `npx tsc --noEmit` passa; grep confirma ausência do bloco.
- **Committed in:** `b3f7e91` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 bug — Rule 1)
**Impact on plan:** Correção necessária e diretamente causada pela remoção de devDependencies desta mesma task. Sem scope creep.

## Issues Encountered
None - todas as versões aprovadas no checkpoint existiam exatamente como especificado no npm registry; instalação, desinstalação e edições de manifesto ocorreram sem fricção.

## User Setup Required

None - Docker (pré-requisito para os testcontainers da Fase 1, plan 03) já confirmado ativo neste ambiente (`docker ps` respondeu OK), nenhuma ação adicional do usuário requerida nesta plan.

## Next Phase Readiness
- `package.json`/`tsconfig.json` prontos para o plan 01-02 consumir (`tsdown.config.ts`, migração de `examples/` e `src/types/model.ts`).
- `vitest`/`@testcontainers/mongodb`/`testcontainers`/`vite-tsconfig-paths` já instalados, prontos para o plan 01-03 configurar `vitest.config.ts` e `test/`.
- `MongoatError` disponível para os fixes de bug dos plans 01-04/01-05 (D-06, D-08, D-10).
- Nenhum bloqueio identificado.

---
*Phase: 01-funda-o-core-sem-bugs-e-build-moderno*
*Completed: 2026-07-07*

## Self-Check: PASSED

- FOUND: src/errors/index.ts
- FOUND: package.json
- FOUND: tsconfig.json
- FOUND: src/index.ts
- FOUND commit: b3f7e91
- FOUND commit: 5a51a93
