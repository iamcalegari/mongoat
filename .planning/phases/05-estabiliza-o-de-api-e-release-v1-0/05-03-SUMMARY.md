---
phase: 05-estabiliza-o-de-api-e-release-v1-0
plan: 03
subsystem: infra
tags: [changesets, npm, release, provenance, oidc, github-actions, smoke-test]

# Dependency graph
requires:
  - phase: 05-estabiliza-o-de-api-e-release-v1-0 (plano 05-01)
    provides: API pública auditada/congelada e versão-alvo reconciliada para 1.1.0
  - phase: 05-estabiliza-o-de-api-e-release-v1-0 (plano 05-02)
    provides: pipeline changesets + release.yml com provenance (OIDC) e gate de Environment npm-publish
provides:
  - 1.1.0-rc.0 publicado no npm no dist-tag `rc` (latest preservado), com provenance, via release.yml gated
  - Changeset consolidado tipo minor consumido pelo bump (fonte do 1.1.0)
  - scripts/smoke-rc.mjs — smoke de import CJS+ESM contra o tarball realmente publicado
  - Dry-run real de `changeset version` confirmando a mecânica 1.0.34-alpha → 1.1.0
affects: [05-04, 05-05, release-estavel, deprecacao-alphas]

# Tech tracking
tech-stack:
  added: []
  patterns: [pre-mode rc do changesets (pre enter rc → version), smoke contra tarball publicado em dir temporário]

key-files:
  created: [scripts/smoke-rc.mjs, .changeset/pre.json]
  modified: [package.json]

key-decisions:
  - "Dry-run do changeset version em branch descartável antes de confiar no bump (Open Question 1) — confirmou 1.0.34-alpha → 1.1.0"
  - "UM changeset consolidado minor para a 1.1.0 (Pattern 1; changelog:false — corpo não vira changelog público)"
  - "Publish do RC só via release.yml gated no CI com provenance — nunca do laptop (D-04)"
  - "Smoke valida o tarball PUBLICADO (npm install @rc em dir temporário), não o working tree (D-02)"

patterns-established:
  - "smoke-rc.mjs: instala o pacote do registry em mkdtemp e importa nos dois formatos (require + import), checando Database/Model"
  - "Fluxo RC: changeset pre enter rc → changeset version → push → release.yml → aprovação humana do Environment npm-publish"

requirements-completed: [REL-03]

coverage:
  - id: D1
    description: "Dry-run real de changeset version confirmou o bump 1.0.34-alpha → 1.1.0 e foi revertido; changeset consolidado minor criado"
    requirement: REL-03
    verification:
      - kind: other
        ref: "commit cf78f46 + node -e semver.inc('1.0.34-alpha','minor')==='1.1.0'"
        status: pass
    human_judgment: false
  - id: D2
    description: "Pre-mode rc ativo e package.json bumpado para 1.1.0-rc.0 via changeset version (não manual)"
    requirement: REL-03
    verification:
      - kind: other
        ref: "commit 6a66850 (package.json 1.1.0-rc.0 + .changeset/pre.json); superado por 2d8f5d2 (exit pre-mode, 05-04)"
        status: pass
    human_judgment: false
  - id: D3
    description: "1.1.0-rc.0 publicado no dist-tag rc (não latest) com provenance, via release.yml gated (run 29141092073, aprovação humana do Environment npm-publish)"
    requirement: REL-03
    verification:
      - kind: e2e
        ref: "npm view @iamcalegari/mongoat dist-tags → rc=1.1.0-rc.0"
        status: pass
    human_judgment: false
  - id: D4
    description: "Smoke CJS+ESM contra o tarball publicado: instala @rc e importa Database/Model nos dois formatos"
    requirement: REL-03
    verification:
      - kind: e2e
        ref: "node scripts/smoke-rc.mjs → PASS (CJS OK + ESM OK)"
        status: pass
    human_judgment: false
  - id: D5
    description: "Empacotamento validado: attw + publint verdes na 1.1.0"
    requirement: REL-03
    verification:
      - kind: automated_ui
        ref: "npm run check:package → attw 🟢 (node10/node16-CJS/node16-ESM/bundler) + publint 'No problems found'"
        status: pass
    human_judgment: false

# Metrics
duration: ~40min (Tasks 1-2: 2026-07-11 01:10-01:12; gate humano + publish: 2026-07-11 ~14:01; smoke/validação final: 2026-07-12 02:32)
completed: 2026-07-12
status: complete
---

# Plano 05-03: Publicação do RC 1.1.0-rc.0 Summary

**1.1.0-rc.0 publicado no dist-tag `rc` com provenance via release.yml gated, validado por smoke CJS+ESM real contra o tarball do registry (attw + publint verdes)**

## Performance

- **Duration:** ~40min de trabalho ativo, distribuído em 3 sessões (bloqueio de 2FA no meio)
- **Started:** 2026-07-11T01:10:53-03:00 (cf78f46)
- **Completed:** 2026-07-12T02:32:00-03:00 (smoke + check:package verdes)
- **Tasks:** 3 (2 auto + 1 checkpoint humano)
- **Files modified:** 3 (package.json, .changeset/pre.json, scripts/smoke-rc.mjs)

## Accomplishments

- RC `1.1.0-rc.0` publicado no npm no dist-tag `rc` com provenance (OIDC/Sigstore), via release.yml com aprovação humana do Environment `npm-publish` (run 29141092073) — `latest` não se moveu no publish do RC
- Smoke real contra o tarball publicado: `npm install @iamcalegari/mongoat@rc` em diretório temporário + import CJS (`require`) e ESM (`import`) expondo `Database`/`Model` — PASS
- Dry-run do `changeset version` em branch descartável confirmou a mecânica de bump `1.0.34-alpha → 1.1.0` antes de qualquer mudança real (Open Question 1 fechada)
- `npm run check:package` verde: attw 🟢 em node10/node16-CJS/node16-ESM/bundler; publint sem problemas

## Task Commits

1. **Task 1: Dry-run + changeset consolidado + smoke script** - `cf78f46` (chore)
2. **Task 2: Pre-mode rc e bump 1.1.0-rc.0** - `6a66850` (chore)
3. **Task 3: Publish gated do RC (checkpoint humano)** - sem commit no repo (write no registry npm via CI; aprovação do Environment npm-publish em 2026-07-11 ~14:01)

## Files Created/Modified

- `scripts/smoke-rc.mjs` - Smoke de import CJS+ESM contra o tarball publicado no dist-tag rc (D-02)
- `.changeset/pre.json` - Ativação do pre-mode rc (posteriormente removido pelo `pre exit` no release estável — 05-04)
- `package.json` - Bump 1.0.34-alpha → 1.1.0-rc.0 via `changeset version` (nunca manual)

## Decisions Made

- Publish exclusivamente via CI gated (release.yml + Environment npm-publish com required reviewer) — o laptop nunca publica (D-04)
- RC no dist-tag `rc` para manter `latest` nas alphas até a promoção deliberada (D-02)
- Token npm com bypass de 2FA para automação + gate humano compensatório no Environment (ver Issues)

## Deviations from Plan

### Fechamento retroativo (safe-resume close-out)

- **O quê:** As Tasks 1–2 foram commitadas e o gate humano da Task 3 foi aprovado em sessões anteriores (2026-07-11), mas o executor não chegou a escrever o SUMMARY — o plano ficou "incompleto" no tracking com o trabalho de produção já feito.
- **Resolução:** Este SUMMARY foi escrito via close-out manual do safe_resume_gate em 2026-07-12, após re-validar todos os must_haves contra o estado real (npm dist-tags, smoke, check:package). Nenhum trabalho foi re-executado (publish é irreversível).

**Total deviations:** 1 (processo, não escopo)
**Impact on plan:** Nenhum no código/registry — todos os must_haves verificados verdes.

## Issues Encountered

- **Publish bloqueado por 2FA na primeira tentativa** (2026-07-11 ~02:24): o `changesets/action` não consegue responder ao prompt de OTP no CI. Resolvido habilitando bypass-2FA no token granular de publish e compensando com required reviewer no Environment `npm-publish` (gate humano preservado).
- **Aprovação do gate via API:** o endpoint do GitHub para aprovar pending deployments tem formato de resposta peculiar; aprovação confirmada e run 29141092073 concluiu com sucesso.

## User Setup Required

None — NPM_TOKEN e Environment `npm-publish` já configurados no 05-02.

## Next Phase Readiness

- Pipeline de release validado ponta-a-ponta com um publish real de baixo risco — pré-requisito do publish estável cumprido
- **Nota:** o bump rc→estável (Task 1 do 05-04) e o publish da 1.1.0 em `latest` (Task 2 do 05-05) também já ocorreram fora do tracking (commit 2d8f5d2 + release CI de 2026-07-11 16:46) — os planos 05-04/05-05 devem reconciliar isso nos seus próprios fechamentos
- Pendências reais da fase: página de política semver (05-04 Task 2) e deprecação das 34 alphas (05-05 Tasks 1 e 3)

---
*Phase: 05-estabiliza-o-de-api-e-release-v1-0*
*Completed: 2026-07-12*
