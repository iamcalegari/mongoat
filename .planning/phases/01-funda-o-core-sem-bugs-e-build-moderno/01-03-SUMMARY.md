---
phase: 01-funda-o-core-sem-bugs-e-build-moderno
plan: 03
subsystem: testing
tags: [vitest, testcontainers, mongodb, vite-tsconfig-paths, path-aliases]

# Dependency graph
requires:
  - phase: 01-01
    provides: "package.json com scripts test/test:watch, vitest e @testcontainers/mongodb instalados nas versões pinadas"
provides:
  - "vitest.config.ts operacional com resolução de path aliases (@/*, @utils/*, @types/*, @test/*)"
  - "test/setup/testcontainer.ts — helper de globalSetup/teardown que sobe/derruba um MongoDB real via Docker"
  - "test/smoke.test.ts — template de teste de regressão contra Mongo real (insert + find)"
  - "tsconfig.json com test/**/* incluído (pré-requisito para o vite-tsconfig-paths resolver aliases em arquivos de teste)"
affects: [01-04, 01-05]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "globalSetup do vitest como função default-export assíncrona que retorna a função de teardown"
    - "directConnection=true na URI de testcontainers/mongodb (replica set de nó único) para evitar reconexão no hostname interno do container"

key-files:
  created:
    - vitest.config.ts
    - test/setup/testcontainer.ts
    - test/smoke.test.ts
  modified:
    - tsconfig.json

key-decisions:
  - "vite-tsconfig-paths só resolve aliases em arquivos cobertos pelo include do tsconfig.json — test/**/* precisou ser adicionado"
  - "resolve.tsconfigPaths nativo do Vite 8 habilitado como fallback, junto do plugin vite-tsconfig-paths (o plugin sozinho não resolveu os aliases nesta combinação de versões)"
  - "URI de conexão do container ganha directConnection=true para contornar o SDAM discovery do replica set de nó único (senão o driver reconecta pelo hostname interno do container, inacessível do host)"

patterns-established:
  - "Testes de regressão contra Mongo real usam process.env.MONGODB_URI/MONGODB_DB_NAME, populados pelo globalSetup — nenhum teste precisa gerenciar o ciclo de vida do container diretamente"

requirements-completed: [QUAL-01]

coverage:
  - id: D1
    description: "vitest.config.ts resolve os path aliases do projeto e configura o globalSetup do container Mongo"
    requirement: "QUAL-01"
    verification:
      - kind: unit
        ref: "npx vitest run test/smoke.test.ts (aliases @/database, @/model, @utils/enums resolvidos com sucesso)"
        status: pass
    human_judgment: false
  - id: D2
    description: "test/setup/testcontainer.ts sobe um MongoDB real via @testcontainers/mongodb (mongo:7), expõe a URI aos testes e encerra o container no teardown"
    requirement: "QUAL-01"
    verification:
      - kind: integration
        ref: "npx vitest run test/smoke.test.ts (setup/teardown do container; docker ps -a confirma ausência de containers órfãos após a run)"
        status: pass
    human_judgment: false
  - id: D3
    description: "test/smoke.test.ts prova a infra ponta a ponta: insere e lê um documento contra o Mongo real do container"
    requirement: "QUAL-01"
    verification:
      - kind: integration
        ref: "test/smoke.test.ts#insere e lê um documento contra o Mongo do container"
        status: pass
    human_judgment: false

duration: 20min
completed: 2026-07-07
status: complete
---

# Phase 01 Plan 03: Infraestrutura de Teste (vitest + testcontainers) Summary

**vitest configurado com resolução de path aliases via vite-tsconfig-paths + Vite 8 native fallback, container MongoDB real (mongo:7) gerenciado por globalSetup/teardown, e smoke test verde provando insert/find contra o banco do container.**

## Performance

- **Duration:** ~20 min
- **Started:** 2026-07-07T04:34:00Z
- **Completed:** 2026-07-07T04:43:03Z
- **Tasks:** 2
- **Files modified:** 4 (3 criados, 1 modificado)

## Accomplishments
- `vitest.config.ts` resolve `@/*`, `@utils/*`, `@types/*`, `@test/*` e roda o `globalSetup` do container Mongo com `testTimeout` de 60s
- `test/setup/testcontainer.ts` sobe `MongoDBContainer('mongo:7')` (tag versionada, nunca `latest`), expõe `MONGODB_URI`/`MONGODB_DB_NAME` e para o container no teardown — zero containers órfãos
- `test/smoke.test.ts` prova a cadeia infra → driver: conecta, registra um `Model`, insere e lê um documento contra o Mongo real
- `npm test` (script `vitest run`) roda verde de ponta a ponta

## Task Commits

Cada task foi commitada atomicamente:

1. **Task 1: Configurar vitest com resolução de path aliases** - `b5b0524` (feat)
2. **Task 2: Helper de container Mongo (setup/teardown) + smoke test verde** - `72677c9` (feat)

**Plan metadata:** (commit final desta etapa, ver STATE.md/ROADMAP.md)

## Files Created/Modified
- `vitest.config.ts` - config do test runner: plugin `vite-tsconfig-paths` + `resolve.tsconfigPaths` nativo, `globalSetup` apontando para o helper do container, `testTimeout: 60000`
- `test/setup/testcontainer.ts` - globalSetup/teardown: sobe `mongo:7` via `@testcontainers/mongodb`, expõe a URI (com `directConnection=true`) e o dbName via env, para o container ao final
- `test/smoke.test.ts` - teste de fumaça: `Database` + `Model` simples, insert + find contra o Mongo do container
- `tsconfig.json` - adicionado `test/**/*` ao array `include` (necessário para o `vite-tsconfig-paths` processar arquivos de teste)

## Decisions Made
- **vite-tsconfig-paths respeita o `include`/`exclude` do tsconfig.json:** o plugin ignorava silenciosamente qualquer arquivo fora do `include` original (`src/utils`, `examples`, `src/**/*`) — `test/**/*` precisou ser adicionado para os testes conseguirem importar `@/database`, `@/model` etc.
- **`resolve.tsconfigPaths: true` (nativo do Vite 8) habilitado como fallback junto do plugin:** nesta combinação exata de versões (`vite-tsconfig-paths@6.1.1` + `vite@8.1.3`, trazido transitivamente pelo `vitest@4.1.10`), o plugin sozinho não resolvia os aliases (erro "Cannot find package '@/database'"); a opção nativa do Vite fechou a lacuna sem precisar trocar de plugin.
- **`directConnection=true` na URI de conexão:** o container do `@testcontainers/mongodb` sobe como replica set de nó único (exigência da própria imagem para health check/transações). Sem essa flag, o driver MongoDB faz SDAM discovery e tenta reconectar usando o hostname interno anunciado pelo replica set (o ID do container), inalcançável a partir do host — a flag trata a URI como servidor único e evita esse hop.
- **`new Database({ uri, dbName, username: 'mongoat', password: 'mongoat' })` no smoke test:** o construtor do `Database` só aplica `config.uri`/env `MONGODB_URI` quando `uri`, `username` E `password` estão todos presentes no objeto de config (comportamento pré-existente, fora do escopo desta fase — não é um dos 5 bugs de QUAL-01 nem um dos itens D-01..D-16). Como username/password dummy não colidem com placeholders reais na connection string do testcontainers (sem auth), esse é o uso correto da API pública atual para satisfazer a condição sem alterar `src/database/index.ts`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `tsconfig.json` não incluía `test/**/*`, quebrando a resolução de aliases nos testes**
- **Found during:** Task 2 (verificação `npx vitest run test/smoke.test.ts`)
- **Issue:** Todo import de alias (`@/database`, `@/model`, `@utils/enums`) em arquivos dentro de `test/` falhava com `Cannot find package '@/database'` — o `vite-tsconfig-paths` usa o `include`/`exclude` do `tsconfig.json` para decidir quais arquivos processa, e `test/` não estava no `include` original.
- **Fix:** Adicionado `"test/**/*"` ao array `include` de `tsconfig.json`.
- **Files modified:** `tsconfig.json`
- **Verification:** `npx vitest run test/smoke.test.ts` passou a resolver os aliases; `npm run typecheck` e `npm run build` continuam limpos (test/ não entra no build, `tsdown.config.ts` usa `src/index.ts` como entry).
- **Committed in:** `72677c9` (parte do commit da Task 2)

**2. [Rule 3 - Blocking] Plugin `vite-tsconfig-paths` sozinho não resolvia os aliases**
- **Found during:** Task 1/Task 2 (debug incremental antes de escrever o smoke test)
- **Issue:** Mesmo com o `include` corrigido, o import de aliases continuava falhando nesta combinação de versões (`vite-tsconfig-paths@6.1.1` + `vite@8.1.3` via `vitest@4.1.10`) — o warning do próprio vitest já sugeria a alternativa nativa.
- **Fix:** Adicionado `resolve: { tsconfigPaths: true }` em `vitest.config.ts`, mantendo o plugin como redundância.
- **Files modified:** `vitest.config.ts`
- **Verification:** teste de debug isolado (`@utils/enums`) resolveu corretamente após a mudança; removido antes do commit final.
- **Committed in:** `b5b0524`/`72677c9`

**3. [Rule 3 - Blocking] Conexão ao container falhava com `ENOTFOUND <container-id>`**
- **Found during:** Task 2 (primeira execução do smoke test contra o container real)
- **Issue:** `getConnectionString()` do `@testcontainers/mongodb` retorna `host:mappedPort`, mas como o container roda como replica set de nó único, o driver MongoDB faz SDAM discovery e tenta reconectar usando o hostname interno anunciado pelo `rs.status()` (o ID do container Docker) — inalcançável a partir do host.
- **Fix:** Anexado `?directConnection=true` à URI exposta em `MONGODB_URI`, forçando o driver a tratar a conexão como servidor único sem discovery de replica set.
- **Files modified:** `test/setup/testcontainer.ts`
- **Verification:** `npx vitest run test/smoke.test.ts` passou de `MongoServerSelectionError: getaddrinfo ENOTFOUND` para verde.
- **Committed in:** `72677c9`

---

**Total deviations:** 3 auto-fixed (todos Rule 3 - blocking issues descobertos durante a verificação da própria task)
**Impact on plan:** Todos os ajustes eram necessários para a infra funcionar como especificado no plan (`must_haves.truths`); nenhum tocou código de runtime da lib (`src/`) nem alterou o escopo de QUAL-01. Sem scope creep.

## Issues Encountered
Nenhum além dos documentados em "Deviations from Plan" — todos resolvidos dentro da própria execução das tasks.

## User Setup Required
None - Docker já estava disponível e em execução na máquina (validado no planning); nenhuma configuração externa adicional é necessária para rodar `npm test`.

## Requirements Note

Este plan lista `requirements: [QUAL-01]` no frontmatter porque entrega a infra de teste que QUAL-01 exige (D-12/D-13) — mas **não fecha QUAL-01 sozinho**: os 5 bugs em si só são corrigidos nos plans 04 e 05. `gsd-tools query requirements.mark-complete QUAL-01` marcaria o checkbox como concluído prematuramente (3 dos 5 bugs ainda não corrigidos); a marcação foi revertida manualmente em `REQUIREMENTS.md` para manter `QUAL-01` como `[ ]` até os plans 04/05 fecharem os fixes. A tabela de rastreabilidade (linha "QUAL-01 | Phase 1 | In Progress...") já refletia isso corretamente e não precisou de ajuste.

## Next Phase Readiness
- Infra de teste operacional: `npm test` roda verde, container sobe/derruba sem deixar órfãos, aliases resolvem em qualquer arquivo dentro de `test/`.
- Plans 04 e 05 podem escrever os testes de regressão dos 5 bugs de QUAL-01 diretamente sobre essa base (import de `@/database`/`@/model` + `process.env.MONGODB_URI`/`MONGODB_DB_NAME` já populados pelo `globalSetup`).
- `test/smoke.test.ts` pode ser removido/substituído quando os plans 04/05 adicionarem as suítes reais de regressão e o happy-path CRUD (D-12).
- Nota para o comportamento observado (fora do escopo desta fase, não bloqueante): o construtor de `Database` só aplica `config.uri`/`MONGODB_URI` quando `uri`, `username` e `password` estão todos presentes no objeto de config — qualquer teste futuro que construa `Database` diretamente de env vars precisa seguir o mesmo padrão usado em `test/smoke.test.ts` (passar username/password dummy junto do `uri`).

---
*Phase: 01-funda-o-core-sem-bugs-e-build-moderno*
*Completed: 2026-07-07*

## Self-Check: PASSED

- FOUND: vitest.config.ts
- FOUND: test/setup/testcontainer.ts
- FOUND: test/smoke.test.ts
- FOUND: tsconfig.json
- FOUND: .planning/phases/01-funda-o-core-sem-bugs-e-build-moderno/01-03-SUMMARY.md
- FOUND commit: b5b0524
- FOUND commit: 72677c9
