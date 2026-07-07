---
phase: 02-sistema-de-hooks-completo-e-api-thin-nativa
reviewed: 2026-07-07T18:35:00Z
depth: standard
files_reviewed: 21
files_reviewed_list:
  - src/database/index.ts
  - src/index.ts
  - src/model/hooks.ts
  - src/model/index.ts
  - src/types/hooks.ts
  - src/types/index.ts
  - src/types/model.ts
  - examples/model/model.ts
  - examples/model/usage.ts
  - test/database/escape-hatch.test.ts
  - test/model/escape-hatch.test.ts
  - test/model/hooks-error-propagation.test.ts
  - test/model/hooks-fire-and-forget.test.ts
  - test/model/hooks-post-order.test.ts
  - test/model/hooks-pre-order.test.ts
  - test/model/hooks-recursion-guard.test.ts
  - test/model/options-passthrough.test.ts
  - test/model/connection-required.test.ts
  - test/model/insert-input-isolation.test.ts
  - test/model/insertmany-hooks.test.ts
findings:
  critical: 1
  warning: 4
  info: 4
  total: 9
status: issues_found
---

# Fase 2: Relatório de Code Review

**Revisado:** 2026-07-07T18:35:00Z
**Profundidade:** standard
**Arquivos revisados:** 21
**Status:** issues_found

## Sumário

Revisão adversarial do pipeline completo de hooks (pre/post, múltiplos handlers,
registro dual construtor + `.pre()`/`.post()`, execução sequencial, guard de
recursão via `AsyncLocalStorage` por instância, semântica de erro assimétrica,
`fireAndForget`) e da API thin nativa (escape hatch `getCollection`/`getClient`/
`getDb` + passthrough tipado de options).

**As restrições arquiteturais centrais foram respeitadas:**
- O enum `METHODS` permanece com 12 membros — nenhum nome de escape hatch
  (`getCollection`/`getClient`/`getDb`) vazou para ele; o gating do
  `KModelProxyHandler` continua intacto e não foi alterado para tratar os escape
  hatches como caso especial (eles passam por já não estarem no enum). Correto.
- O guard de recursão é per-instance (`private [kHookContext] =
  new AsyncLocalStorage(...)`), NÃO um flag booleano global/estático — a
  isolação de contexto entre operações concorrentes no mesmo model está correta.
- Zero novas dependências de runtime (`node:async_hooks` é nativo).
- `insertMany` preserva `Promise.all` ENTRE documentos e roda hooks
  sequencialmente DENTRO de cada documento (via `runPreHooks`).
- `fireAndForget` é verdadeiramente não-aguardado e roteia erros para
  `onHookError`/`console.error` — nunca um `.catch(() => {})` vazio.

Apesar disso, a revisão encontrou **1 defeito de correção que anula parcialmente
uma entrega central da fase** (passthrough de `ctx.options`), além de quebras de
uniformidade no contrato de hooks, uma brecha de gating por `ctx.model`, e riscos
de robustez. Detalhes abaixo.

## Structural Findings (fallow)

Nenhum bloco `<structural_findings>` foi fornecido para esta revisão.

## Narrative Findings (AI reviewer)

## Critical Issues

### CR-01: `ctx.options` é `undefined` em `find`/`findById`/`delete`/`bulkWrite` — passthrough de options quebra silenciosamente (ou lança) para 4 dos 12 métodos

**Arquivo:** `src/model/index.ts:773`, `:790`, `:816`, `:856`

**Issue:** O contrato documentado em `src/types/hooks.ts:80-83` afirma que
"`ctx.options`/`ctx.filter`/`ctx.document(s)` are the SAME reference used in the
driver call — a pre-hook mutation reaches the driver (API-01)". Esse invariante
NÃO vale para `find`, `findById`, `delete` e `bulkWrite`: diferentemente dos
outros 8 métodos (que fazem `options: XOptions = {}`), esses quatro declaram
`options?: XOptions` sem default. Quando o caller não passa options, o `ctx`
construído por `buildContext` recebe `options: undefined`. Consequências:

- Um pre-hook que mute in-place (`ctx.options.limit = 1`) lança
  `TypeError: Cannot set properties of undefined`, abortando a operação.
- Um hook defensivo (`if (ctx.options) ctx.options.projection = { secret: 0 }`)
  vira **no-op silencioso** — a option NUNCA é aplicada. Isto é relevante para
  segurança: um hook de `find` cuja função é forçar uma `projection` que redige
  um campo sensível falha em silêncio, e o campo vaza no resultado. Falha
  silenciosa de uma option de redação é exatamente a classe de defeito que a fase
  se propõe a evitar ("ctx.options mutation reaching the driver" é foco nomeado).

O teste `options-passthrough.test.ts` só exercita `findMany`/`insertMany` (ambos
com default `{}`), então esse buraco fica latente — não há teste que mute
`ctx.options` em `find`/`delete`/`findById`/`bulkWrite`.

**Fix:** dar default `{}` uniforme aos quatro métodos, alinhando com os outros
oito e com o contrato de "mesma referência":

```typescript
find(filter: Filter<ModelType> = {}, options: FindOptions = {}): Promise<WithId<ModelType> | null> { ... }

findById(documentId: ObjectId | string, options: FindOptions = {}): Promise<WithId<ModelType> | null> { ... }

delete(filter: Filter<ModelType>, options: FindOneAndDeleteOptions = {}): Promise<WithId<ModelType> | null> { ... }

bulkWrite(operations: AnyBulkWriteOperation<ModelType>[], options: BulkWriteOptions = {}): Promise<BulkWriteResult> { ... }
```

Atualizar também os tipos correspondentes em `HookContextMap`
(`src/types/hooks.ts`) de `options?:` para `options:` nesses quatro métodos, para
o TS refletir que `ctx.options` está sempre presente. Acrescentar um caso de
teste em `options-passthrough.test.ts` que mute `ctx.options` em `find` e em
`delete`.

## Warnings

### WR-01: hooks acessam a instância CRUA (não-proxied) via `ctx.model` — o gating de `allowedMethods` é contornável de dentro de um hook

**Arquivo:** `src/model/index.ts` (todos os métodos, ex. `:541`, `:560`) +
`src/model/hooks.ts:96-106`

**Issue:** O `KModelProxyHandler` faz bind de todos os métodos a `target` (a
instância crua) — correto para evitar re-entrância do trap (QUAL-01). Consequência
colateral: dentro de qualquer método público, `this` é a instância crua, e
`buildContext(METHODS.X, this, ...)` grava `ctx.model = this` (crua). Logo, dentro
de um hook, `ctx.model` é a instância SEM Proxy. Uma chamada
`ctx.model.delete(...)` a partir de um hook de um model cujo `allowedMethods` não
inclui `DELETE` executa normalmente — o trap de gating nunca dispara porque o
objeto exposto ao hook não é o Proxy. O gating, anunciado como garantia de
runtime, é assim contornável por qualquer hook (código do autor, portanto baixa
explorabilidade — mas é uma inconsistência real de uma invariante central e não
está documentada como "escape").

**Fix:** se o gating deve valer também para chamadas re-entrantes a partir de
hooks, expor o Proxy em `ctx.model` (recuperando-o de `Database.getModel(
this.collectionName)`), mantendo o bind a `target` internamente. Se o bypass é
intencional (paridade com o escape hatch), documentá-lo explicitamente no JSDoc
de `HookContextMap`/`ctx.model`, tal como `getCollection()` documenta o seu.

### WR-02: `fireAndForget` — se `onHookError` lançar, gera unhandledRejection

**Arquivo:** `src/model/hooks.ts:69-77`

**Issue:** O dispatch de `fireAndForget` termina em
`.catch((err) => onHookError(err, ctx))`. `onHookError` é fornecido pelo usuário
(`CreateModelProps.onHookError`) e tipado para retornar `void`, mas nada impede
que lance. Se lançar (ou retornar uma Promise rejeitada), o erro escapa sem
handler subsequente → unhandledRejection, que na configuração padrão do Node pode
derrubar o processo. Ironicamente, o mecanismo criado para nunca engolir erro em
silêncio pode transformar um erro de hook em crash de processo.

**Fix:** blindar a rota de erro, ex.:

```typescript
.catch((err) => {
  try {
    onHookError(err, ctx);
  } catch (handlerErr) {
    console.error(handlerErr);
  }
});
```

### WR-03: `isSameConfig` ignora `hooks` (e `onHookError`) — re-registro com hooks divergentes é descartado em silêncio

**Arquivo:** `src/model/index.ts:143-177` (comparação) e `:281-298` +
`:315-332` (registro de hooks)

**Issue:** A checagem D-06 (falhar alto em re-registro divergente) compara
`allowedMethods`, `validator`, `documentDefaults` e `indexes`, mas NÃO os
`hooks` declarativos nem `onHookError`. O bloco `if (existing) { if (isSameConfig)
return existing; ... }` roda ANTES do bloco `if (props.hooks)`. Portanto, um
segundo `new Model({ collectionName: 'x', ...mesmoConfig, hooks: {...outros} })`
é considerado "config igual", retorna a primeira instância e **descarta
silenciosamente os hooks declarativos e o `onHookError` do segundo construtor** —
exatamente a classe de mascaramento silencioso que D-06 se propôs a eliminar.

**Fix:** ou incluir `hooks`/`onHookError` na comparação de `isSameConfig` (falhar
alto se divergirem), ou — se re-registro deve reaproveitar a instância — mesclar
os hooks declarativos do segundo construtor na registry existente antes de
retornar `existing`. Documentar a decisão.

### WR-04: exemplo `documentDefaults: { insertedAt: new Date() }` congela o timestamp no load do módulo

**Arquivo:** `examples/model/model.ts:62-64`

**Issue:** `new Date()` é avaliado UMA vez, no import do módulo. Como
`documentDefaults` guarda valores estáticos (e `cloneDocumentDefaults` passa
`Date`/`ObjectId` por referência — `src/model/index.ts:106`), TODO documento
inserido recebe o mesmo `insertedAt` = hora de start do processo, não a hora real
do insert. O exemplo, cujo campo se chama `insertedAt`, ensina um padrão
incorreto. Além disso, `updatedAt` está no schema mas nunca é setado. Como
`documentDefaults` não suporta factories, não há como o exemplo obter um timestamp
por-insert com a API atual — o que também sinaliza uma limitação da feature.

**Fix:** no exemplo, aplicar o timestamp por-insert via hook em vez de default
estático, ex.:

```typescript
User.pre(METHODS.INSERT, (ctx) => {
  const now = new Date();
  ctx.document.insertedAt = now;
  ctx.document.updatedAt = now;
});
```

E/ou avaliar suportar defaults como função (`() => new Date()`) numa fase futura.

## Info

### IN-01: clone raso de `update`/operações não-`insertOne` — mutações aninhadas por hook vazam para o objeto do caller

**Arquivo:** `src/model/index.ts:559`, `:589` (`{ ...update }`) e `:861-878`
(`bulkWrite`)

**Issue:** `update`/`updateMany` fazem `_update = { ...update }` (clone raso): uma
mutação de hook em `ctx.update.$set.campo` altera o `$set` compartilhado com o
objeto original do caller. Em `bulkWrite`, apenas operações `insertOne` são
clonadas; operações `updateOne`/`deleteOne` etc. seguem por referência, então
mutações de hook nelas vazam para o array de entrada. Inconsistente com a
isolação de input já garantida para `insert`/`insertMany` (WR-02/WR-06 da Fase 1).

**Fix:** documentar que só o nível superior é isolado, ou aplicar clone
consistente onde o vazamento por referência importa.

### IN-02: transform via retorno em post-hook `fireAndForget` é comportamento morto/enganoso

**Arquivo:** `src/model/hooks.ts:71-75`

**Issue:** No caminho `fireAndForget`, o `.then((returned) => { if (returned !==
undefined) ctx.result = returned; })` tenta transformar `ctx.result` — mas o
caller já recebeu o `ctx.result` de forma síncrona (o dispatch não é aguardado).
A mutação chega tarde demais e nunca afeta o valor devolvido. É código
enganoso: sugere que um `fireAndForget` pode transformar o resultado, o que é
impossível por definição.

**Fix:** no ramo `fireAndForget`, apenas invocar `fn(ctx)` para efeito colateral e
ignorar o retorno (não atribuir a `ctx.result`); documentar que `fireAndForget`
nunca transforma o resultado.

### IN-03: `examples/model/usage.ts` chama `main()` sem `.catch` — unhandledRejection em erro

**Arquivo:** `examples/model/usage.ts:58`

**Issue:** `main();` no top-level sem `.catch(...)`. Qualquer erro (falha de
conexão, validação) vira unhandledRejection e a conexão pode não ser fechada
(`disconnect()` só roda no caminho feliz). Exemplo ensina padrão frágil.

**Fix:**

```typescript
main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
```

### IN-04: casts `as unknown as` e `catch (err: any)` recorrentes reduzem a segurança de tipos

**Arquivo:** `src/model/index.ts` (múltiplos: `:343`, `:499`, `:507`, `:682`,
`:766`, `:900`, etc.)

**Issue:** O projeto roda em `strict: true`, mas o pipeline usa muitos
`as unknown as ...` (em `runHooked`/`executeHooked`/retornos) e `catch (err: any)`
nos blocos de driver. Os casts são em parte inerentes ao mapeamento genérico
`HookContextMap[M]`, mas escondem qualquer regressão de tipo entre o `ctx`
construído e o realmente lido no `rawFn`. Baixo impacto; anotado por completude.

**Fix:** onde viável, tipar `catch (err: unknown)` e estreitar; concentrar os
casts genéricos num único ponto helper já tipado.

---

_Revisado: 2026-07-07T18:35:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Profundidade: standard_
