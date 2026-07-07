---
quick_id: 260707-mfp
title: "Corrigir CR-01/API-01 — options passthrough em find/findById/delete/bulkWrite"
status: complete
date: 2026-07-07
commit: b51c4c9
source: 02-REVIEW.md CR-01 + 02-VERIFICATION.md Gap #1
---

# Quick Task 260707-mfp — Summary

## O que foi feito

Fechado o único gap bloqueante da Fase 2 (CR-01 / Gap #1 da `02-VERIFICATION.md`):
o passthrough de `options` estava quebrado em 4 dos 12 métodos CRUD.

### Mudanças

1. **`src/model/index.ts`** — default `= {}` uniforme nas assinaturas públicas de
   `find`, `findById`, `delete` e `bulkWrite` (alinhando com os outros 8 métodos).
   Os `rawFind`/`rawFindById`/`rawDelete`/`rawBulkWrite` passaram de `options?:`
   para `options:`, e o `?? {}` agora redundante foi removido de `rawDelete`/
   `rawBulkWrite`.

2. **`src/types/hooks.ts`** — `HookContextMap` para `FIND`, `FIND_BY_ID`, `DELETE`
   e `BULK_WRITE` de `options?:` (opcional) para `options:` (sempre presente). O
   tipo passa a refletir o runtime corrigido e o contrato documentado em
   `src/types/hooks.ts:80-83`.

3. **`test/model/options-passthrough.test.ts`** — 2 casos novos: pre-hook que muta
   `ctx.options.projection` (redação de campo) em `find` e em `delete`, ambos com o
   caller **omitindo** `options`. Antes do fix, esse cenário lançava
   `TypeError: Cannot set properties of undefined`.

## Verificação

| Check | Comando | Resultado |
|---|---|---|
| Typecheck estrito | `npx tsc --noEmit` | exit 0 |
| Teste do arquivo alvo | `npx vitest run test/model/options-passthrough.test.ts` | 6/6 passa (4 originais + 2 novos) |
| Suíte da fase | `npx vitest run test/model/ test/database/` | 68/68 passa, 23 arquivos (antes: 66) |
| Prettier | `npx prettier --write` (arquivos tocados) | formatado |

## Impacto

- **Truth #4 / API-01** da Fase 2 agora é entregue por completo: os 12 métodos
  aceitam e repassam `options`, e um pre-hook pode mutar `ctx.options` de forma
  confiável mesmo quando o caller não passa options.
- Resolve o risco de segurança citado no review: hook de redação de campo sensível
  não é mais um no-op silencioso em `find`/`delete`.

## Próximo passo

Re-verificar a Fase 2 (`/gsd-execute-phase 2` ou re-rodar o verificador) — com o
Gap #1 fechado, os 5 critérios do ROADMAP devem passar (5/5). Após verde, marcar a
Fase 2 completa e avançar para a Fase 3 (Blindagem — testes, CI e segurança).

## Notas

- Warnings não-bloqueantes do `02-REVIEW.md` (WR-01 gating via `ctx.model`, WR-02
  `onHookError` que lança, WR-03 `isSameConfig` ignora hooks, WR-04 exemplo com
  timestamp congelado; INs) permanecem em aberto — a verificação os classificou
  como não-bloqueantes e alguns envolvem decisões de design a tratar em fase futura.
