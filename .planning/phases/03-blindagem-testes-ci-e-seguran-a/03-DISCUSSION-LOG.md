# Phase 3: Blindagem — testes, CI e segurança - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-07
**Phase:** 3-Blindagem — testes, CI e segurança
**Areas discussed:** Política de erros (SEC-02 + SEC-03)

---

## Seleção de áreas

| Área | Descrição | Discutida |
|------|-----------|-----------|
| sanitizeFilter / $where (SEC-01) | Automático vs opt-in; o que bloquear além de `$where` | Claude's Discretion |
| Política de erros (SEC-02 + SEC-03) | Hierarquia tipada vs base; validação ObjectId; sanitização; code estável | ✓ |
| Cobertura de testes (QUAL-02) | Threshold como gate; profundidade de concorrência | Claude's Discretion |
| CI GitHub Actions (QUAL-03) | Matriz Node; Docker/integração; gate attw/publint | Claude's Discretion |

**User's choice:** Discutir apenas "Política de erros"; as demais delegadas à discrição do Claude.

---

## Política de erros (SEC-02 + SEC-03)

### Hierarquia de erros

| Option | Description | Selected |
|--------|-------------|----------|
| Hierarquia tipada | Subclasses de MongoatError (Validation/Connection/Driver); catch por `instanceof` | ✓ |
| Só base + campo code | Manter só MongoatError, discriminar por `code` | |

**User's choice:** Hierarquia tipada → D-01.

### Validação de ObjectId

| Option | Description | Selected |
|--------|-------------|----------|
| Lançar erro tipado | `ObjectId.isValid`; inválido → MongoatValidationError; findById propaga (fail-loud) | ✓ |
| Retornar null | findById com id inválido resolve `null`, sem lançar | |

**User's choice:** Lançar erro tipado → D-02.

### Sanitização (SEC-03)

| Option | Description | Selected |
|--------|-------------|----------|
| Mensagem limpa + cause | message estável/sanitizada; erro original em `.cause`; sem stringify do erro inteiro | ✓ |
| Mensagem genérica, sem cause | Mensagem fixa genérica, sem `cause` | |

**User's choice:** Mensagem limpa + cause → D-03.

### Código de erro estável

| Option | Description | Selected |
|--------|-------------|----------|
| Sim, code estável | Cada erro carrega `code` estável (string); dev programa contra o code | ✓ |
| Não, instanceof basta | Sem campo `code`; discriminação só por subclasse | |

**User's choice:** Sim, code estável → D-04.

---

## Claude's Discretion

Áreas delegadas pelo autor, com decisões registradas no CONTEXT.md:
- **sanitizeFilter / $where (SEC-01):** `$where` rejeitado incondicionalmente pela lib em todos os métodos com filter (D-05); `sanitizeFilter` como utilitário opt-in exportado (D-06); escopo = vetores de execução de código + strip configurável de `$`-keys de topo, preservando operadores de query (D-07).
- **Cobertura de testes (QUAL-02):** manter testcontainers, não mongodb-memory-server (D-08); cobrir os 12 métodos + Database com happy path + erro + concorrência (D-09); threshold ~80% via coverage-v8 como gate (D-10).
- **CI (QUAL-03):** matriz Node 20+22 alinhada ao `engines` real (D-11); job único no ubuntu-latest com Docker: lint+typecheck+build+test+`check:package` (D-12); triggers push+PR para main (D-13).

## Deferred Ideas

- Warnings advisory da Fase 2 (WR-01/WR-03/WR-04); WR-02 (onHookError → unhandledRejection) forte candidato ao hardening da Fase 3.
- Connection pooling exposto em DatabaseConfig (v2).
- `CUSTOM_VALIDATION.UNIQUE` nunca implementado (fora do escopo v1).
