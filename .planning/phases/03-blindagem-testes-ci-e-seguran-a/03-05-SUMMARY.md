---
phase: 03-blindagem-testes-ci-e-seguran-a
plan: 05
subsystem: infra
tags: [github-actions, ci, testcontainers, docs-reconciliation, node-engines]

requires:
  - phase: 03-blindagem-testes-ci-e-seguran-a
    provides: lint funcional (Plano 01), guards de segurança e hierarquia de erros (Planos 01/02), gate de coverage v8 configurado em vitest.config.ts (Plano 04) — os scripts que este workflow orquestra
provides:
  - Prova local (fora do CI) de que a sequência completa lint → typecheck → build → test --coverage → check:package passa verde
  - .github/workflows/ci.yml — job único build-and-test em ubuntu-latest, matriz Node 20.x/22.x, triggers push + pull_request para main
  - Documentação de versão de Node reconciliada (CLAUDE.md + PROJECT.md): engines real `^20.19.0 || >=22.12.0` substitui a menção obsoleta a `>=16.20.1`
  - Seção "Error Handling" do CLAUDE.md (Conventions e Cross-Cutting Concerns) atualizada para refletir a hierarquia MongoatError/MongoatValidationError/MongoatConnectionError/MongoatDriverError entregue nos Planos 01-02, encerrando o drift de doc vs. código (D-03)
affects: []

tech-stack:
  added: []
  patterns:
    - "CI single-job (não separa unit/integração) em ubuntu-latest — testcontainers usa o Docker nativo do runner, sem bloco services: nem TESTCONTAINERS_RYUK_DISABLED"
    - "actions/setup-node@v4 com cache: 'npm' (cache nativo via hash de package-lock.json, sem actions/cache manual)"

key-files:
  created:
    - .github/workflows/ci.yml
  modified:
    - .claude/CLAUDE.md
    - .planning/PROJECT.md

key-decisions:
  - "Ambas as ocorrências de 'Error Handling' no CLAUDE.md (Conventions §154 e Architecture/Cross-Cutting Concerns §357) foram atualizadas, não só a primeira — a segunda também citava MongoError + JSON.stringify(err) e violava D-03 do mesmo jeito"
  - "Matriz de CI limitada a ['20.x', '22.x'] (última patch de cada major), sem testar o piso exato do engines (^20.19.0/>=22.12.0) — Open Question 3 do RESEARCH.md resolvida a favor de YAGNI"
  - "npm test -- --coverage (não um script novo 'test:coverage') usado no workflow — reaproveita o script 'test': 'vitest run' já existente, aciona o mesmo gate de threshold validado localmente"

patterns-established:
  - "Phase gate local (lint/typecheck/build/test --coverage/check:package) comprovado verde ANTES de escrever o workflow que o orquestra — evita depurar CI e scripts simultaneamente"

requirements-completed: [QUAL-03]

coverage:
  - id: D1
    description: "Phase gate completo (lint, typecheck, build, test com coverage, check:package) passa localmente sem nenhuma correção necessária"
    requirement: "QUAL-03"
    verification:
      - kind: other
        ref: "npm run lint && npm run typecheck && npm run build && npx vitest run --coverage && npm run check:package"
        status: pass
    human_judgment: false
  - id: D2
    description: "Workflow .github/workflows/ci.yml criado: job único em ubuntu-latest, matriz Node 20.x/22.x, triggers push+PR para main, steps na ordem install→lint→typecheck→build→test --coverage→check:package, sem services: de Mongo e sem TESTCONTAINERS_RYUK_DISABLED"
    requirement: "QUAL-03"
    verification:
      - kind: other
        ref: "node -e verificação automatizada do Task 2 (regex sobre on:/pull_request/20.x/22.x/check:package/ausência de RYUK_DISABLED) — 'ci.yml OK'"
        status: pass
    human_judgment: true
    rationale: "A execução real do workflow no GitHub Actions (matriz verde em push/PR) só é observável após merge/push ao remoto — a verificação automatizada local prova estrutura e ordem dos steps, mas não substitui a confirmação visual no Actions tab mencionada no human-check da Task 2"
  - id: D3
    description: "Versão de Node reconciliada em CLAUDE.md e PROJECT.md (D-11): engines real ^20.19.0 || >=22.12.0 substitui >=16.20.1 em todas as ocorrências"
    requirement: "QUAL-03"
    verification:
      - kind: other
        ref: "grep -n '16.20.1' .claude/CLAUDE.md .planning/PROJECT.md — sem resultados (exit 1)"
        status: pass
    human_judgment: false
  - id: D4
    description: "Seção Error Handling do CLAUDE.md (D-03) atualizada nas duas ocorrências para refletir MongoatError/subclasses, .cause preservado, discriminação por instanceof/.code; Developer Profile permanece intacta"
    verification:
      - kind: other
        ref: "grep -n 'MongoError\\|JSON.stringify(err' .claude/CLAUDE.md — sem resultados (exit 1); seção Developer Profile inspecionada visualmente, sem alteração"
        status: pass
    human_judgment: false

duration: 15min
completed: 2026-07-08
status: complete
---

# Phase 3 Plan 5: CI GitHub Actions + Reconciliação de Doc de Node Summary

**Workflow GitHub Actions single-job (Node 20.x/22.x, testcontainers via Docker nativo) rodando o phase gate completo em push/PR para main, mais reconciliação da versão de Node e da seção Error Handling em CLAUDE.md/PROJECT.md**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-07-07T23:38:00-03:00 (aprox.)
- **Completed:** 2026-07-07T23:51:25-03:00
- **Tasks:** 2
- **Files modified:** 3 (`.github/workflows/ci.yml` criado, `.claude/CLAUDE.md` e `.planning/PROJECT.md` editados)

## Accomplishments
- Phase gate local (`lint → typecheck → build → vitest run --coverage → check:package`) comprovado 100% verde antes de escrever o workflow, sem nenhuma correção necessária — coverage real 94.4%/85.38%/97.41%/94.52% (stmts/branches/funcs/lines), bem acima dos thresholds 80/80/80/70; `check:package` com publint "No problems found" e attw 🟢 em todos os alvos (node10, node16 CJS/ESM, bundler)
- `.github/workflows/ci.yml` criado: job único `build-and-test` em `ubuntu-latest`, matriz `node-version: ['20.x', '22.x']`, triggers `push`/`pull_request` para `main`, steps `checkout → setup-node (cache npm) → npm ci → lint → typecheck → build → test --coverage → check:package`, sem `services:` de Mongo e sem `TESTCONTAINERS_RYUK_DISABLED`
- Divergência de versão de Node (D-11) reconciliada: `.claude/CLAUDE.md` (seções Constraints, Runtime, Platform Requirements) e `.planning/PROJECT.md` (Constraints) não citam mais `>=16.20.1`, refletem `^20.19.0 || >=22.12.0`
- Seção "Error Handling" do `.claude/CLAUDE.md` reconciliada nas duas ocorrências (Conventions §154 e Architecture/Cross-Cutting Concerns §357) com a hierarquia real entregue nos Planos 01/02 (D-03): `MongoatError`/`MongoatValidationError`/`MongoatConnectionError`/`MongoatDriverError`, `.message` sanitizada, `.cause` preservado, discriminação por `instanceof`/`.code`

## Task Commits

Each task was committed atomically:

1. **Task 1: Provar o phase gate localmente + reconciliar versão de Node na doc (D-11)** - `68e2b18` (docs)
2. **Task 2: Workflow CI GitHub Actions single-job com matriz 20.x/22.x (D-12/D-13)** - `855f500` (feat)

_Nenhum deviation exigiu commit extra além dos 2 planejados._

## Files Created/Modified
- `.github/workflows/ci.yml` - Workflow CI: job único, matriz Node 20.x/22.x, phase gate completo, triggers push+PR para main
- `.claude/CLAUDE.md` - Versão de Node reconciliada (3 ocorrências: Constraints, Runtime, Platform Requirements) + seção Error Handling reescrita (2 ocorrências) refletindo a hierarquia MongoatError
- `.planning/PROJECT.md` - Versão de Node reconciliada (Constraints)

## Decisions Made
- Ambas as ocorrências de "Error Handling" no CLAUDE.md (não só a primeira) foram corrigidas — a segunda seção também citava `MongoError`/`JSON.stringify(err)` e violava D-03 do mesmo jeito que a primeira
- Matriz de CI limitada a `['20.x', '22.x']` (última patch de cada major), sem testar o piso exato `^20.19.0`/`>=22.12.0` — resolve a Open Question 3 do RESEARCH.md a favor de YAGNI, conforme já indicado pelo próprio plano
- `npm test -- --coverage` reaproveita o script `test: "vitest run"` já existente em vez de criar um script `test:coverage` novo — menos superfície em `package.json`

## Deviations from Plan

None - plano executado exatamente como escrito. O phase gate local já estava 100% verde na primeira tentativa (nenhuma correção de Rule 1/2/3 foi necessária).

## Issues Encountered

None. O git status no início da sessão apontava `M src/model/index.ts` e um `where-rejection.test.ts` não rastreado, mas ambos já estavam commitados em sessões anteriores (verificado via `git status` limpo e `git ls-files` — o snapshot inicial estava desatualizado em relação ao estado real do repo).

## User Setup Required

None - nenhuma configuração de serviço externo necessária. O workflow não requer secrets (testcontainers usa o Docker já disponível no runner `ubuntu-latest`).

## Next Phase Readiness
- QUAL-03 fechado: CI roda lint/typecheck/build/test com coverage/check:package em push e PR para `main`, quebrando o build em qualquer regressão
- D-11 (versão de Node) e D-03 (Error Handling doc) reconciliados — nenhum drift de doc pendente relacionado a esta fase
- Observabilidade real do workflow no GitHub Actions (matriz 20.x/22.x verde) só é confirmável após push/merge do commit `855f500` ao remoto `origin/main` — branch local está 103 commits à frente de `origin/main` no momento deste plano; recomenda-se `git push` e checagem visual do Actions tab como próximo passo fora do escopo desta fase
- Fase 3 (Blindagem — testes, CI e segurança) completa: 5/5 planos executados (QUAL-02, QUAL-03, SEC-01, SEC-02, SEC-03, SEC-04 cobertos entre os Planos 01-05)

---
*Phase: 03-blindagem-testes-ci-e-seguran-a*
*Completed: 2026-07-08*

## Self-Check: PASSED
