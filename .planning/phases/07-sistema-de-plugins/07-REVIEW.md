---
phase: 07-sistema-de-plugins
reviewed: 2026-07-15T00:00:00Z
depth: standard
files_reviewed: 20
files_reviewed_list:
  - src/errors/index.ts
  - src/index.ts
  - src/model/index.ts
  - src/model/plugins.ts
  - src/types/index.ts
  - src/types/model.ts
  - src/types/plugin.ts
  - examples/plugins/augmentation.ts
  - examples/plugins/paginate-plugin.ts
  - examples/plugins/timestamps-plugin.ts
  - test/model/plugins-application-order.test.ts
  - test/model/plugins-context-seal.test.ts
  - test/model/plugins-dedup.test.ts
  - test/model/plugins-fail-loud.test.ts
  - test/model/plugins-global-lock.test.ts
  - test/model/plugins-order.test.ts
  - test/model/plugins-reset.test.ts
  - test/model/plugins-resolve.test.ts
  - test/model/plugins-static-binding.test.ts
  - test/model/plugins-static-collision.test.ts
findings:
  critical: 0
  warning: 2
  info: 4
  total: 6
status: issues_found
---

# Fase 7: Relatório de Code Review

**Revisado:** 2026-07-15
**Profundidade:** standard
**Arquivos revisados:** 20
**Status:** issues_found

## Resumo

Revisão adversarial do sistema de plugins (Plano 07-01..07-04): módulo
`src/model/plugins.ts` (normalização, dedup, guarda de colisão de statics,
selo read-only do contexto, orquestrador `applyPlugins`), integração no
construtor de `Model`, registro global `Model.plugin()` / trava de ordem,
tipos públicos (`Plugin`/`PluginContext`/`PluginObject`/`PluginSetup`),
códigos de erro novos e exemplos.

A arquitetura está sólida: dedup por referência, fail-loud em `setup()`,
selo do contexto por `structuredClone`, e bind de statics delegado ao Proxy
existente estão corretos e bem cobertos por testes. As duas WARNINGs abaixo
são lacunas de robustez na guarda de colisão de statics e na identidade de
plugins anônimos — ambas afetam a **exaustividade** de garantias que o
próprio código se propõe a oferecer. Não foram encontrados BLOCKERs de
correção em uso normal.

## Narrative Findings (AI reviewer)

## Warnings

### WR-01: `registerPluginStatic` não protege contra chaves `__proto__`/`constructor` — corrompe o model em vez de lançar `STATIC_COLLISION`

**Arquivo:** `src/model/plugins.ts:140-165` (e `RESERVED_NAMES` em `:33-67`)

**Issue:** A guarda de colisão só verifica `RESERVED_NAMES` (membros do
`Model.prototype`) e o mapa `owners`. Chaves especiais do
`Object.prototype` não estão cobertas. Como `target[name] = fn` usa
atribuição por bracket com uma string vinda do autor do plugin, um plugin
que faça `ctx.static('__proto__', fn)` NÃO cai em `STATIC_COLLISION` —
`RESERVED_NAMES.has('__proto__')` é `false` — e a atribuição
`target['__proto__'] = fn` invoca o setter de `__proto__`, **trocando o
protótipo da instância do model** por `fn`. Verificado empiricamente:
após a atribuição, `model.find`, `model.insert`, etc. viram `undefined`
(a cadeia de protótipos que carregava os métodos nativos é substituída).
O model fica silenciosamente destruído em vez de falhar alto. Como
plugins podem ser pacotes npm de terceiros (o próprio valor do sistema de
plugins), isto cruza um limite de confiança e é a exata classe de ataque
(prototype pollution) que a lista `RESERVED_NAMES` existe para prevenir.
`ctx.static('constructor', fn)` é menos destrutivo mas também escapa da
guarda e cria uma own-property sombreando `Model`.

**Fix:** Rejeitar explicitamente chaves não-próprias/perigosas antes de
atribuir. Ex.:

```typescript
const FORBIDDEN_KEYS = new Set(['__proto__', 'prototype', 'constructor']);

export function registerPluginStatic(/* ... */): void {
  if (FORBIDDEN_KEYS.has(name) || RESERVED_NAMES.has(name)) {
    throw new MongoatValidationError(
      `Plugin "${pluginName}" cannot register static "${name}" — it collides with a native Model member`,
      { code: 'STATIC_COLLISION' }
    );
  }
  // ... resto igual
  // e usar atribuição segura:
  Object.defineProperty(target, name, {
    value: fn, writable: true, enumerable: true, configurable: true,
  });
}
```

### WR-02: Dois plugins anônimos (ou dois `PluginObject` sem `name`) colidem com `DUPLICATE_PLUGIN_NAME` — o formato bare-function documentado quebra

**Arquivo:** `src/model/plugins.ts:75-128` (`normalizePlugin` + `resolvePluginList`); `src/types/plugin.ts:55-67`

**Issue:** `normalizePlugin` mapeia qualquer função sem nome para
`name: '<anonymous>'`, e `PluginObject.name` é **opcional**
(`src/types/plugin.ts:65`). O dedup por nome em `resolvePluginList`
(`:112-120`) trata dois plugins de nomes iguais mas referências diferentes
como erro `DUPLICATE_PLUGIN_NAME`. Consequência: passar dois setups
anônimos legítimos — `plugins: [() => {...}, () => {...}]`, que é
exatamente o formato `PluginSetup` (bare function) que o tipo público
promove — lança `DUPLICATE_PLUGIN_NAME` porque **ambos** normalizam para
`'<anonymous>'`. O mesmo vale para dois `{ setup }` sem `name`. O usuário
recebe um erro de "nome duplicado" sem nunca ter declarado um nome,
mascarando a causa real.

**Fix:** Não deduplicar por nome quando o nome for o sentinela
`'<anonymous>'` (dois anônimos são plugins genuinamente distintos, já
distinguidos pelo dedup por referência); ou exigir `name` para
`PluginObject` e documentar que bare functions anônimas não são suportadas
em quantidade > 1. Ex. mínimo:

```typescript
const ANONYMOUS = '<anonymous>';
// ...
if (pluginName !== ANONYMOUS && existingRefForName && existingRefForName !== original) {
  throw new MongoatValidationError(/* DUPLICATE_PLUGIN_NAME */);
}
if (pluginName !== ANONYMOUS) {
  byName.set(pluginName, original);
}
```

## Info

### IN-01: String sentinela `'<anonymous>'` duplicada em três locais

**Arquivo:** `src/model/plugins.ts:79`, `:112`, `:220`

**Issue:** O literal `'<anonymous>'` aparece em `normalizePlugin`,
`resolvePluginList` e `applyPlugins`. Magic string repetido — uma mudança
futura precisa ser feita em três pontos e pode divergir.

**Fix:** Extrair `const ANONYMOUS_PLUGIN_NAME = '<anonymous>';` no topo do
módulo e referenciar nos três locais.

### IN-02: Derivação de `pluginName` duplicada entre `resolvePluginList` e `applyPlugins`

**Arquivo:** `src/model/plugins.ts:112` e `:220`

**Issue:** `normalized.name ?? '<anonymous>'` é recomputado em
`applyPlugins` apesar de `resolvePluginList` já ter resolvido o nome (e
validado unicidade) com a mesma expressão. Fonte de verdade duplicada.

**Fix:** Fazer `resolvePluginList` devolver o `name` já resolvido junto de
`{ original, normalized }` (ex. `resolvedName`) e reusá-lo em
`applyPlugins`, em vez de recalcular.

### IN-03: JSDoc público de `CreateModelProps.collectionName` cita ID de planejamento interno `(D-06)`

**Arquivo:** `src/types/model.ts:63-68`

**Issue:** `CreateModelProps` é exportado no barrel público
(`src/index.ts`) e processado pelo TypeDoc. O JSDoc de `collectionName`
contém "it always overrides the class default (D-06)". Pela convenção do
projeto (memória "JSDoc público sem IDs internos"), símbolos exportados
não devem citar IDs de planejamento — eles vazam para `docs/api/`.
Pré-existente (Fase 6), mas presente em arquivo sob revisão. O novo campo
`plugins` (`:83-90`), por contraste, está limpo.

**Fix:** Remover "(D-06)" do JSDoc; se o contexto for útil, mover para um
comentário `//` inline (não capturado pelo TypeDoc).

### IN-04: `examples/plugins/augmentation.ts` — `main()` invocado no import sem `.catch()`

**Arquivo:** `examples/plugins/augmentation.ts:84`

**Issue:** `main()` é chamada no top-level do módulo e retorna uma Promise
não tratada — qualquer rejeição (ex.: falha de conexão) vira unhandled
rejection. Além disso, importar o arquivo dispara uma tentativa de conexão
como efeito colateral. Aceitável para exemplo executável, mas inconsistente
com um padrão fail-safe.

**Fix:** `main().catch((err) => { console.error(err); process.exitCode = 1; });`

---

_Revisado: 2026-07-15_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
