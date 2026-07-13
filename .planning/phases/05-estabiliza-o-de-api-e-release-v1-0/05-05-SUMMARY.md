---
phase: 05-estabiliza-o-de-api-e-release-v1-0
plan: 05
subsystem: infra
tags: [npm, deprecate, release, provenance, github-actions, 2fa, registry]

# Dependency graph
requires:
  - phase: 05-estabiliza-o-de-api-e-release-v1-0 (plano 05-03)
    provides: RC 1.1.0-rc.0 validado por smoke contra o tarball publicado
  - phase: 05-estabiliza-o-de-api-e-release-v1-0 (plano 05-04)
    provides: package.json em 1.1.0 (pre-mode encerrado) e política semver publicada
provides:
  - 1.1.0 estável publicada no npm no dist-tag latest com provenance (SLSA), via CI gated
  - As 34 versões 1.0.x-alpha deprecadas no registry por versão EXATA, apontando para o guia de migração
  - scripts/deprecate-alphas.mjs (loop por versão exata, OTP interativo local + modo CI)
  - .github/workflows/deprecate-alphas.yml (writes de registry via CI gated — nunca do laptop)
affects: [fase-6-decorators, fase-7-plugins, fase-8-migrations, releases-futuras]

# Tech tracking
tech-stack:
  added: []
  patterns: [registry writes só via CI com token bypass-2FA atrás de Environment gate, deprecação por versão exata via packument]

key-files:
  created: [scripts/deprecate-alphas.mjs, .github/workflows/deprecate-alphas.yml]
  modified: [eslint.config.mjs]

key-decisions:
  - "Deprecação por versão EXATA em loop (nunca range — ranges não casam prereleases no node-semver e deprecariam zero versões silenciosamente)"
  - "Execução movida do laptop para o CI: a conta exige 2FA para writes e o registry ignora --otp para tokens; o NPM_TOKEN (bypass-2FA) só existe no CI, atrás do mesmo Environment gate do publish"
  - "Mensagem de deprecação única apontando para o guia de migração (https://iamcalegari.github.io/mongoat/migration)"

patterns-established:
  - "Toda mutação do registry (publish, deprecate) roda via GitHub Actions com Environment npm-publish (required reviewer) — o laptop nunca tem credencial de write"
  - "Verificação pós-write no registry precisa de retry: o registry é eventualmente consistente"

requirements-completed: [REL-04, REL-01]

coverage:
  - id: D1
    description: "Script de deprecação por versão exata: obtém a lista real via npm view versions --json, filtra -alpha, um npm deprecate por versão (nenhum range)"
    requirement: REL-04
    verification:
      - kind: other
        ref: "DRY_RUN=1 node scripts/deprecate-alphas.mjs → exatamente 34 comandos npm deprecate; node --check verde; grep proíbe range"
        status: pass
    human_judgment: false
  - id: D2
    description: "1.1.0 estável publicada no dist-tag latest com provenance, via CI com aprovação humana do Environment npm-publish"
    requirement: REL-04
    verification:
      - kind: e2e
        ref: "npm view @iamcalegari/mongoat dist-tags → latest=1.1.0; dist.attestations com predicateType slsa.dev/provenance/v1; tag git v1.1.0"
        status: pass
    human_judgment: false
  - id: D3
    description: "As 34 versões 1.0.x-alpha deprecadas no registry com a mensagem de descontinuação; 1.1.0 e 1.1.0-rc.0 intocadas"
    requirement: REL-04
    verification:
      - kind: e2e
        ref: "packument registry.npmjs.org: 34/34 alphas com campo deprecated; nenhuma não-alpha deprecada (varredura 2026-07-13 04:30)"
        status: pass
    human_judgment: false
  - id: D4
    description: "Pipeline changesets habilitado para releases futuras: publish automatizado no merge com aprovação de 1 clique do Environment"
    requirement: REL-01
    verification:
      - kind: e2e
        ref: "release.yml exercitado ponta-a-ponta nos publishes reais do RC (run 29141092073) e da estável 1.1.0"
        status: pass
    human_judgment: false

# Metrics
duration: ~1h de trabalho ativo em 3 sessões (2026-07-12 02:35 → 2026-07-13 04:35), incluindo pivô 2FA laptop→CI
completed: 2026-07-13
status: complete
---

# Plano 05-05: Publicação estável 1.1.0 + deprecação das alphas Summary

**1.1.0 em `latest` com provenance e as 34 alphas deprecadas por versão exata via workflow CI gated — o registry write nunca tocou o laptop**

## Performance

- **Duration:** ~1h ativo (inclui diagnóstico de 2FA e pivô para CI)
- **Started:** 2026-07-12T02:35:00-03:00 (dispatch do executor)
- **Completed:** 2026-07-13T04:30:00-03:00 (varredura 34/34 no packument)
- **Tasks:** 3 (1 auto + 2 checkpoints humanos)
- **Files modified:** 4 (script, workflow, eslint.config.mjs)

## Accomplishments

- As **34 versões `1.0.x-alpha` deprecadas** no registry por versão exata, cada uma com a mensagem apontando para o guia de migração — `1.1.0` e `1.1.0-rc.0` intocadas (varredura completa do packument: 34/34, nenhuma não-alpha)
- **1.1.0 estável em `latest` com provenance SLSA** confirmada (reconciliada — publicada via release.yml gated em 2026-07-11 após aprovação humana)
- `scripts/deprecate-alphas.mjs`: lista real de versões via `npm view versions --json`, loop por versão exata (guard contra o Pitfall 1 — range não casa prereleases), dry-run auditável, OTP interativo com re-prompt local e modo CI não-interativo
- `.github/workflows/deprecate-alphas.yml`: workflow_dispatch atrás do Environment `npm-publish` (required reviewer), com dry-run de auditoria antes do write e amostragem com retry depois

## Task Commits

1. **Task 1: Script de deprecação por versão exata** - `c9838d6` (feat)
2. **Task 2: Publish 1.1.0 estável (checkpoint humano)** - sem commit (gate já aprovado e executado antes desta sessão; evidência: registry + tag v1.1.0 + commit `2d8f5d2`)
3. **Task 3: Deprecação das 34 alphas (checkpoint humano)** - executada via run 29232155429 do workflow `deprecate-alphas.yml` (aprovação humana do Environment)

**Commits de suporte:** `fa7e2c5` (OTP no script), `4ca4221` (workflow CI + modo não-interativo), `15e8c97` (globals de Node no eslint — CI estava vermelho para scripts/*.mjs)

## Files Created/Modified

- `scripts/deprecate-alphas.mjs` - Deprecação por versão exata com dry-run, OTP interativo (local) e modo CI
- `.github/workflows/deprecate-alphas.yml` - Workflow gated para o write irreversível no registry
- `eslint.config.mjs` - Globals de Node (`process`, `console`) para `scripts/**/*.mjs`

## Decisions Made

- **Registry writes só via CI**: a conta npm exige 2FA para writes e o registry ignora `--otp` quando a autenticação é por token; em vez de manejar token com bypass no laptop, a deprecação rodou no CI com o `NPM_TOKEN` existente, atrás do mesmo gate humano do publish — endurecendo a postura D-04 (nenhuma credencial de write no laptop)
- Retry com backoff na verificação pós-write (registry eventualmente consistente)

## Deviations from Plan

### 1. Task 2 já satisfeita fora do tracking

O publish da 1.1.0 ocorreu em 2026-07-11 (~16:46), antes desta execução, via release.yml com aprovação humana. Verificado nesta sessão: `latest=1.1.0`, provenance SLSA presente, tag `v1.1.0`. Sem pausa no checkpoint — apenas verificação e documentação.

### 2. Execução da deprecação movida do laptop para o CI (Task 3)

- **Planejado:** autor executa `node scripts/deprecate-alphas.mjs` autenticado como owner no laptop.
- **Ocorrido:** duas tentativas locais falharam com E403 (política 2FA: para tokens o `--otp` é ignorado; o token local não tem bypass-2FA).
- **Resolução:** workflow `deprecate-alphas.yml` (workflow_dispatch + Environment npm-publish) usando o token bypass-2FA do CI; usuário disparou e aprovou o gate. Mesma garantia humana, credencial mais bem contida.

**Total deviations:** 2 (1 reconciliação, 1 mudança de mecanismo com segurança igual ou melhor)
**Impact on plan:** Nenhum nos must_haves — todos verificados verdes contra o registry real.

## Issues Encountered

- **CI vermelho por lint nos scripts** (`no-undef` em `process`/`console`): o flat config não declarava globals de Node para `scripts/**/*.mjs` (o `smoke-rc.mjs` do 05-03 já vinha acusando). Corrigido em `15e8c97`; CI verde em seguida (run 29232075288).
- **Run 29232155429 marcou `failure` no passo de amostragem** apesar da deprecação completa: lag de replicação do registry — a amostra rodou segundos após o último PUT. Confirmação independente via packument: 34/34. O passo ganhou retry com backoff para o histórico.

## User Setup Required

None — NPM_TOKEN e Environment `npm-publish` já existiam (05-02).

## Next Phase Readiness

- REL-01/REL-03/REL-04 completos: a "v1.0 do roadmap" está materializada como npm **1.1.0** (latest, provenance), com RC validado, política semver publicada e linha alpha aposentada
- Releases futuras: fluxo changesets normal (changeset → Version PR → merge → publish gated de 1 clique); para zero-clique, remover o required reviewer do Environment
- Fases 6–8 (decorators, plugins, migrations) desbloqueadas sobre a API estável

---
*Phase: 05-estabiliza-o-de-api-e-release-v1-0*
*Completed: 2026-07-13*
