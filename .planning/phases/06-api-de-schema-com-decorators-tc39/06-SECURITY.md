---
phase: 06
slug: api-de-schema-com-decorators-tc39
status: verified
# threats_open = count of OPEN threats at or above workflow.security_block_on severity (the blocking gate)
threats_open: 0
asvs_level: 1
created: 2026-07-14
---

# Phase 06 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| Build-time supply chain (npm install → tsdown/babel) | Código de terceiros roda no build; um pacote sequestrado executaria no processo de build/publish | Código-fonte / artefatos de build (alta sensibilidade — publish com provenance) |
| Declaração de schema (classe decorada) → `Schema.compile` → `$jsonSchema` | Uma classe mal-compilada gera um validator server-side incorreto, enfraquecendo a fronteira de validação do MongoDB | Definições de schema / regras de validação |
| App do dev → `Model.insert` → MongoDB | Documento potencialmente derivado de input de usuário final cruza para o driver; a validação `$jsonSchema` server-side é a fronteira de confiança | Documentos de usuário (potencialmente sensíveis) |
| Declaração de hook (`@Pre`/`@Post`) → pipeline de hooks → driver | Um hook de segurança (hash/auditoria) que não dispara, dispara fora de ordem, ou grava Promise pendente quebra garantia de integridade (ex.: senha em claro) | Credenciais / campos protegidos por transforms |

---

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T-06-SC | Tampering | npm devDeps `@babel/core`, `@babel/plugin-proposal-decorators`, `@rolldown/plugin-babel` | high | mitigate | Checkpoint `blocking-human` aprovado pelo autor antes do `npm install` (versões verificadas no registry oficial); pacotes em devDependencies (build-time only), nunca runtime | closed |
| T-06-01-01 | Tampering / Denial of correctness | Guard de modo legado (experimentalDecorators produziria schema vazio silencioso) | medium | mitigate | `assertStandardDecoratorMode` (src/schema/guards.ts) na entrada de `@Schema`/`@Prop` + `test/schema/legacy-mode-guard.test.ts` | closed |
| T-06-01-02 | Tampering | `Schema.compile` divergente do objeto plano → validator server-side mais fraco | medium | mitigate | Equivalência byte-a-byte em `test/schema/compile-equivalence.test.ts` + clone-antes-de-mutar do metadata | closed |
| T-06-02-01 | Repudiation / Tampering | Hook de segurança descartado em silêncio numa re-registração de Model | high | mitigate | Fail-loud `MODEL_CONFIG_CONFLICT` quando candidato declara hooks (src/model/index.ts) + `test/model/registry-config.test.ts` | closed |
| T-06-02-02 | Tampering | Chaves `undefined` serializadas como BSON `Undefined` confundindo `$jsonSchema` | medium | mitigate | `ownDefinedProperties` filtra `undefined` antes do merge (src/model/index.ts) + `test/schema/per-insert-defaults.test.ts` | closed |
| T-06-02-03 | Tampering / sub-validação | Paridade quebrada classe decorada × objeto plano → validação server-side divergente | medium | mitigate | `test/schema/decorated-vs-plain-parity.test.ts` contra MongoDB real | closed |
| T-06-03-01 | Tampering / sub-validação | Campo sem decorator fica fora do schema compilado — dev acha que valida quando não valida | medium | mitigate | Comportamento coberto por teste (`compile-equivalence.test.ts`, campo não-decorado); documentação explícita pendente nos guias (follow-up de docs, não bloqueante) | closed |
| T-06-03-02 | Tampering | Açúcar mapeado para chave JSON Schema errada → restrição ignorada pelo servidor | medium | mitigate | Teste unit por açúcar com chave exata em `test/schema/sugars.test.ts` + equivalência byte-a-byte | closed |
| T-06-03-03 | Tampering | Compile recursivo sem `additionalProperties: false` em subschemas | low | accept | `schemaValidatorBuilder`/`includeAdditionalPropertiesFalse` já recursiona no Model; compile só entrega o shape — coberto pelo teste de paridade Mongo-real | closed |
| T-06-04-01 | Repudiation / Tampering | Hook decorado (`@Pre('insert', hashPassword)`) descartado em silêncio numa re-registração | high | mitigate | `candidateHasHooks` inclui hooks decorados → `MODEL_CONFIG_CONFLICT` fail-loud + `test/schema/hook-decoration-errors.test.ts` | closed |
| T-06-04-02 | Tampering / Denial of correctness | Hook registrado em método inexistente nunca dispara (segurança silenciosamente ausente) | medium | mitigate | `assertKnownHookMethod` lança `INVALID_HOOK_METHOD` na decoração (src/schema/guards.ts, decorators.ts) + teste dedicado | closed |
| T-06-04-03 | Tampering | Ordem de hooks não-determinística — @Pre de validação rodaria após a transformação | medium | mitigate | Ordem determinística fixada no wiring + `test/schema/hooks-decorator-order.test.ts` (sentinelas contra Mongo real) | closed |
| T-06-05-01 | Tampering / Information Disclosure | Wrapper do `@Pre` de campo grava Promise pendente → senha em claro/descartada | high | mitigate | Wrapper `async` + `document[field] = await fn(...)` (src/schema/compile.ts:229-246) + `test/schema/field-hook-async.test.ts` (unit + integração); re-verificado empiricamente em 2026-07-14 (06-VERIFICATION passed) | closed |
| T-06-05-02 | Tampering | Materialização de campo ausente derrota a validação `required` do MongoDB | high | mitigate | Guard `Object.hasOwn(document, field)` (src/schema/compile.ts:243) + teste de integração: campo required ausente segue rejeitado | closed |
| T-06-05-03 | Denial of correctness / Availability | `required: []` aninhado rejeitado pelo `$jsonSchema` no `setupCollection` | medium | mitigate | `...(required.length > 0 ? { required } : {})` (src/schema/compile.ts:101) + `test/schema/all-optional-nested-setup.test.ts` contra Mongo real | closed |
| T-06-05-SC | Tampering | Instalação de pacotes npm no gap closure | low | accept | Fechamento de gaps não instalou nenhuma dependência nova — zero superfície de supply-chain adicionada | closed |

*Status: open · closed · open — below high threshold (non-blocking)*
*Severity: critical > high > medium > low — only open threats at or above workflow.security_block_on count toward threats_open*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-06-01 | T-06-03-03 | `additionalProperties: false` recursivo já é aplicado pelo Model (`schemaValidatorBuilder`), não pelo compile; paridade coberta por teste contra Mongo real | Planner (06-03-PLAN, disposition accept) | 2026-07-13 |
| AR-06-02 | T-06-05-SC | Gap closure 06-05 não instala dependências — nenhuma superfície nova de supply-chain | Planner (06-05-PLAN, disposition accept) | 2026-07-14 |

*Accepted risks do not resurface in future audit runs.*

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-07-14 | 16 | 16 | 0 | /gsd-secure-phase (orquestrador, short-circuit ASVS L1 — registro plan-time completo, mitigações verificadas por grep + suíte 168/168 + 06-VERIFICATION passed 14/14) |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-07-14
