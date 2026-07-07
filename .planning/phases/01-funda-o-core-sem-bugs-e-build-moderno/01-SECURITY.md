---
phase: 01
slug: funda-o-core-sem-bugs-e-build-moderno
status: verified
# threats_open = count of OPEN threats at or above workflow.security_block_on severity (the blocking gate)
threats_open: 0
asvs_level: 1
created: 2026-07-07
---

# Phase 01 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| npm registry → dev/CI | Pacotes de tooling baixados e executados durante build/test | Código de terceiros (não confiável até verificado) |
| docker registry → dev/CI | Imagem Mongo baixada e executada durante os testes | Imagem de container (oficial, tag pinada) |
| build output → npm consumers | Tarball publicado é o que consumidores CJS/ESM instalam | Código compilado + tipos `.d.ts` |
| devDependency types → published .d.ts | Tipos de terceiros podem vazar para a superfície pública | Superfície de tipos publicada |
| caller → dispatch de método (Proxy) | O Proxy é o ponto de controle de acesso (`allowedMethods`) | Chamadas de método do dev consumidor |
| config/env → seleção de banco | O nome do banco decide onde os dados são escritos | Credenciais e nomes de banco |
| schema/config do usuário → constructor do Model | Schema do dev é processado, clonado e comparado | Objetos de configuração |

---

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T-01-01-SC | Tampering | npm installs (tsdown, vitest, testcontainers, attw, tsx, publint, coverage-v8) | high | mitigate | Checkpoint blocking-human executado em 2026-07-07 (9 pacotes verificados no registro npm: nome exato, repo oficial, downloads); versões aprovadas persistidas via `package-lock.json` versionado (commit 39e3b09, removido do .gitignore) | closed |
| T-01-01-02 | Information Disclosure | `files` do package.json | medium | mitigate | `files: ["lib"]` (D-05) — tarball não contém `src/` nem configs; validado por `npm pack --dry-run` no `check:package` | closed |
| T-01-01-03 | Tampering | campo `type`/`exports` do package.json | low | accept | `"type": "commonjs"` + extensões explícitas `.mjs`/`.cjs`; validação completa entregue no plano 01-02 (attw/publint verdes) | closed |
| T-01-02-01 | Information Disclosure | `.d.ts` publicado | low | mitigate | `json-schema` vendorizado como `JSONSchema4Subset` (src/types/model.ts); grep em `lib/*.d.mts`/`*.d.cts` confirma zero `import` de json-schema (apenas menções em JSDoc); pacote removido até das devDependencies | closed |
| T-01-02-SC | Tampering | superfície de publicação (tarball) | medium | mitigate | `check:package` = `npm pack --dry-run && publint && attw --pack .` — verificado verde pelo gsd-verifier em 2026-07-07 | closed |
| T-01-02-03 | Tampering | dual-package hazard (import CJS/ESM incoerente) | medium | mitigate | Smoke de consumo real: tarball instalado em projetos CJS (`require`) e ESM (`import`) — ambos resolvem `Database`/`Model`/`MongoatError` (verificação independente do gsd-verifier) | closed |
| T-01-03-SC | Tampering | pull da imagem Docker `mongo` (testcontainers) | medium | mitigate | Tag pinada `mongo:7` (test/setup/testcontainer.ts:20), imagem oficial, nunca `latest` | closed |
| T-01-03-02 | Denial of Service | container órfão acumulando recursos | low | mitigate | Teardown do globalSetup executa `container.stop()` (test/setup/testcontainer.ts:37); verifier confirmou zero containers órfãos pós-suíte | closed |
| T-01-04-01 | Elevation of Privilege | KModelProxyHandler (guard de allowedMethods) | high | mitigate | Bind ao `target` cru (src/database/index.ts:384); regressão em test/database/proxy-binding.test.ts asserta que método fora de allowedMethods lança `MongoatError`; fix extra: constructor retorna a instância Proxy-wrapped desde o primeiro `new Model()` | closed |
| T-01-04-02 | Tampering | seleção de banco (kGetDbName) | medium | mitigate | Fallback silencioso `mongoat-test` removido; `MongoatError` lançada quando dbName ausente (src/database/index.ts:493); regressão em test/database/dbname-required.test.ts | closed |
| T-01-04-03 | Information Disclosure | mensagem de erro de dbName ausente | low | mitigate | Mensagem cita apenas as chaves de config esperadas, sem despejar o objeto `config` | closed |
| T-01-05-01 | Information Disclosure | mensagem de erro de config divergente (D-06) | medium | mitigate | Mensagem contém apenas `collectionName` + fato da divergência; teste em test/model/registry-config.test.ts asserta ausência do schema na mensagem | closed |
| T-01-05-02 | Denial of Service | `structuredClone` sobre schema não-cloneável | low | accept | Schema malformado é erro de config do dev (não input de usuário final); erro propaga com clareza; limitação documentada no código | closed |
| T-01-05-03 | Tampering | acesso à collection sem conexão | medium | mitigate | `getCollectionOrThrow()` (src/model/index.ts:360) lança `MongoatError` clara em todos os 11 métodos CRUD (D-10); regressão em test/model/connection-required.test.ts | closed |

*Status: open · closed · open — below high threshold (non-blocking)*
*Severity: critical > high > medium > low — only open threats at or above workflow.security_block_on count toward threats_open*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

**Hardening adicional (pós-review, além do registro planejado):** o fix pass do code review (commits 0e1c4a3..f1b39df) fechou também: credenciais URL-encoded na connection string (WR-09), mensagens de erro do driver sem `JSON.stringify` do erro inteiro — preservam message + `cause` via `MongoatError` (WR-11, antecipa SEC-03), `withTransaction` lança em vez de no-op silencioso (CR-02) e `config.uri`/`MONGODB_URI` honradas sem fallback silencioso para localhost (CR-01).

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-01-01 | T-01-01-03 | Dual-package hazard mitigado estruturalmente (`type: commonjs` + extensões explícitas); validação dinâmica completa entregue e verde no plano 01-02 — risco residual desprezível | Planner (01-01-PLAN.md, disposition plan-time) | 2026-07-07 |
| AR-01-02 | T-01-05-02 | `DataCloneError` em schema não-cloneável é erro de configuração do desenvolvedor consumidor, não vetor alcançável por usuário final; propagar é o comportamento correto | Planner (01-05-PLAN.md, disposition plan-time) | 2026-07-07 |

*Accepted risks do not resurface in future audit runs.*

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-07-07 | 14 | 14 | 0 | /gsd-secure-phase (orchestrator, ASVS L1 short-circuit — registro plan-time completo, evidência grep + verificação independente do gsd-verifier) |

**Nota do audit 2026-07-07:** a verificação encontrou 1 gap real em T-01-01-SC — `package-lock.json` estava no `.gitignore`, tornando o pin de versões aprovadas não-durável para clones/CI. Corrigido no mesmo passe (commit 39e3b09: lockfile versionado, `.gitignore` ajustado). Nenhuma outra divergência entre o registro planejado e a implementação.

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-07-07
