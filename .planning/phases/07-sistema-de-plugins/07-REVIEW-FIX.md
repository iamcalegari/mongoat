---
phase: 07-sistema-de-plugins
review_source: 07-REVIEW.md
fixed_at: 2026-07-15
fix_scope: critical_warning
findings_in_scope: 2
fixed: 2
skipped: 0
iteration: 1
status: all_fixed
---

# Code Review Fix Report — Fase 07 (Sistema de plugins)

Correções aplicadas a partir de `07-REVIEW.md` (escopo `critical_warning`: os 2 WARNING; os 4 INFO ficaram fora de escopo). Commit único de código: `79bf050`.

> Nota de processo: o `gsd-code-fixer` foi interrompido por limite de sessão **após completar as edições** no worktree isolado, mas **antes de commitar**. O orquestrador recuperou as edições do worktree, revalidou (tsc + suíte + eslint) e commitou. Nenhuma edição foi perdida.

## Fixed

### WR-01 — Prototype pollution em `registerPluginStatic` (Warning → também ameaça de segurança T-07-01, high)
**Arquivo:** `src/model/plugins.ts`

`RESERVED_NAMES` enumerava nomes de métodos mas omitia as chaves especiais de `Object.prototype`. `ctx.static('__proto__', fn)` escapava da guarda e a atribuição `target['__proto__'] = fn` invocava o setter de `__proto__`, **substituindo o protótipo da instância** e apagando os métodos nativos (`find`/`insert` → `undefined`); como não lançava, `applyPlugins` não abortava e um model corrompido era registrado silenciosamente (interação com T-07-04).

**Correção (defesa em profundidade, duas camadas):**
1. Novo `FORBIDDEN_STATIC_KEYS = { '__proto__', 'prototype', 'constructor' }` checado ANTES de qualquer atribuição — colidir com qualquer uma lança `STATIC_COLLISION`.
2. `target[name] = fn` → `Object.defineProperty(target, name, { value: fn, writable, enumerable, configurable })` — um descritor de dado nunca dispara o setter de `__proto__`, então mesmo uma chave que escapasse da guarda definiria uma own-property inócua em vez de mutar a cadeia de protótipos.

**Testes (`test/model/plugins-static-collision.test.ts`):** `__proto__`, `constructor` e `prototype` cada um lança `STATIC_COLLISION`; após a tentativa de `__proto__`, um model limpo preserva `find`/`insert` como funções.

### WR-02 — Colisão de plugins anônimos (Warning)
**Arquivo:** `src/model/plugins.ts`

Dois `PluginSetup` anônimos legítimos (`plugins: [() => {}, () => {}]`, forma bare-function documentada) lançavam `DUPLICATE_PLUGIN_NAME` porque ambos normalizavam para o sentinela `'<anonymous>'` e o dedup por nome os tratava como o mesmo plugin com referências diferentes.

**Correção:** `resolvePluginList` pula o dedup por nome quando `pluginName === '<anonymous>'`. O dedup por referência (`seen` map) continua colapsando duplicatas verdadeiras (mesma referência de função); anônimos distintos passam a coexistir.

**Teste (`test/model/plugins-dedup.test.ts`):** dois bare-functions anônimos distintos aplicam ambos (spies chamados 1×) sem lançar.

## Skipped (fora de escopo `critical_warning`)
Os 4 INFO de `07-REVIEW.md` não foram tocados (sentinela `'<anonymous>'` duplicada ×3, derivação de `pluginName` duplicada, JSDoc de `collectionName` vazando `(D-06)` para o TypeDoc, `main()` sem `.catch()` em `examples/plugins/augmentation.ts`). Rodar `/gsd-code-review 7 --fix --all` para incluí-los.

## Verificação pós-fix
- `npx tsc --noEmit`: limpo
- `npm test` (`vitest run`): **214/214** (55 arquivos; 209 → 214, +5 casos novos)
- `npx eslint`: limpo nos 3 arquivos alterados
