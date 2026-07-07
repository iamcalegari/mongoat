---
quick_id: 260707-mfp
title: "Corrigir CR-01/API-01 — options passthrough em find/findById/delete/bulkWrite"
created: 2026-07-07
status: planned
source: 02-REVIEW.md CR-01 + 02-VERIFICATION.md Gap #1
tasks: 1
---

# Quick Task 260707-mfp: Corrigir CR-01/API-01 (blocker da Fase 2)

## Contexto

A verificação da Fase 2 (`02-VERIFICATION.md`, status `gaps_found`) e o code review
(`02-REVIEW.md`, CR-01) identificaram o mesmo defeito bloqueante: 4 dos 12 métodos
CRUD — `find`, `findById`, `delete` e `bulkWrite` — declaram `options?: XOptions`
**sem** o default `= {}` presente nos outros 8 métodos. Quando o caller omite
`options`, `ctx.options` fica `undefined`, quebrando o contrato documentado
(`src/types/hooks.ts:80-83`) de que um pre-hook pode mutar `ctx.options` e a mutação
chega ao driver (API-01). Consequências reproduzidas empiricamente contra Mongo real:
mutação in-place lança `TypeError`; hook defensivo (`if (ctx.options)`) vira no-op
silencioso e vaza campo sensível.

## Task 1 — Uniformizar o default `= {}` e alinhar tipos + testes

**Files:**
- `src/model/index.ts` — assinaturas públicas `find`, `findById`, `delete`, `bulkWrite`
  (e os `rawX` correspondentes, para consistência com os outros 8 métodos)
- `src/types/hooks.ts` — `HookContextMap` para `FIND`, `FIND_BY_ID`, `DELETE`, `BULK_WRITE`
- `test/model/options-passthrough.test.ts` — novos casos cobrindo `find` e `delete`

**Action:**
1. Trocar `options?: FindOptions` → `options: FindOptions = {}` em `find` e `findById`;
   `options?: FindOneAndDeleteOptions` → `options: FindOneAndDeleteOptions = {}` em `delete`;
   `options?: BulkWriteOptions` → `options: BulkWriteOptions = {}` em `bulkWrite`.
   Remover o `?`/`?? {}` dos `rawFind`, `rawFindById`, `rawDelete`, `rawBulkWrite`
   (agora `options` sempre presente).
2. Em `HookContextMap`, trocar `options?:` por `options:` (sempre presente) nos 4 métodos.
3. Acrescentar casos em `options-passthrough.test.ts`: pre-hook mutando `ctx.options`
   em `find` (`projection` que redige campo) e em `delete` (option nativa observável),
   ambos **sem** o caller passar `options`.

**Verify:**
- `npx tsc --noEmit` → exit 0
- `npx vitest run test/model/options-passthrough.test.ts` → todos verdes
- `npx vitest run test/model/ test/database/` → suíte da fase permanece verde

**Done:**
- Os 12 métodos têm `options` sempre-presente; `ctx.options` nunca é `undefined`.
- `HookContextMap` reflete `options:` (não-opcional) nos 4 métodos.
- Novos testes provam mutação de `ctx.options` chegando ao driver em `find` e `delete`.

## must_haves

- **truth:** Um pre-hook pode mutar `ctx.options` em `find`/`findById`/`delete`/`bulkWrite`
  mesmo quando o caller não passou `options`, e a mutação chega ao driver.
- **artifact:** `src/model/index.ts`, `src/types/hooks.ts`, `test/model/options-passthrough.test.ts`.
- **key_link:** `find`/`delete` públicos → `ctx.options` (default `{}`) → `rawFind`/`rawDelete` → driver.
