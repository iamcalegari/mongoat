---
phase: 07-sistema-de-plugins
plan: 04
subsystem: api
tags: [typescript, plugin-system, model, module-augmentation, testcontainers]

# Dependency graph
requires:
  - phase: 07-02
    provides: "Aplicação de plugins locais no construtor do Model, ANTES do wrap do Proxy (PLUG-01)"
  - phase: 07-01
    provides: "Tipos Plugin/PluginContext, módulo puro src/model/plugins.ts (registerPluginStatic, applyPlugins)"
provides:
  - "Prova de integração (MongoDB real via testcontainers) de que um static registrado por plugin (`ctx.static`) tem `this` bound ao model — mesmo Proxy trap `value.bind(target)` que já faz o bind dos 12 métodos nativos (D-12), sem nenhum `.bind()` manual em `registerPluginStatic`"
  - "Exemplo canônico de factory pattern parametrizável (D-02): `timestamps(options)` devolve um plugin sem nenhuma API extra do core"
  - "Exemplo canônico de module augmentation (D-09b) tipando `.paginate()` sem cast/any no call-site — fecha o veredito do 07-RESEARCH.md de que a inferência-plena via `new Model({ plugins })` NÃO é viável (TS1093 + tipo de instância fixo de `new ClassName(...)`)"
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "declare module '@/model' { interface Model<ModelType extends Document> { ... } } — declaration merging class+interface do TypeScript é a forma oficial de tipar statics de plugin, mesma solução usada pelo Fastify (decorate()/declare module 'fastify')"
    - "Static de plugin declara `this: Model<ModelType>` explicitamente na assinatura da função registrada via ctx.static — documenta a superfície disponível (this.getCollection(), this.find(), ...) sem exigir bind manual"

key-files:
  created:
    - test/model/plugins-static-binding.test.ts
    - examples/plugins/timestamps-plugin.ts
    - examples/plugins/paginate-plugin.ts
    - examples/plugins/augmentation.ts
  modified: []

key-decisions:
  - "Campo `order` do schema de teste usa bsonType 'int' com inteiros JS literais (padrão já comprovado em test/model/crud-error-coverage.test.ts) — evita o risco (não verificado neste plano) de o driver serializar como Double e falhar a validação $jsonSchema"
  - "timestamps-plugin.ts: c.update é castado via `UpdateFilter<Document> & { $set?: ... }` e a reatribuição final via `as UpdateFilter<ModelType>` — o tipo genérico ModelType (default Document) não permite acesso direto a $set sem alargar o shape; cast pontual documentado inline, sem afetar tipagem pública"
  - "augmentation.ts: Post construído com `allowedMethods: []` — nenhum método nativo gated é chamado no exemplo, só o static de plugin (que não passa pelo enum METHODS/gating), então o array vazio é suficiente e mais honesto que listar métodos não usados"

requirements-completed: [PLUG-01]

coverage:
  - id: D1
    description: "Static de plugin (ctx.static) chamado via a instância Proxy-wrapped tem `this` bound ao model — this.getCollection() funciona contra MongoDB real, provado por paginação de documentos inseridos de fato"
    requirement: "PLUG-01"
    verification:
      - kind: integration
        ref: "test/model/plugins-static-binding.test.ts#model.paginate() (static de plugin) tem `this` bound ao model — this.getCollection() funciona contra dados reais"
        status: pass
    human_judgment: false
  - id: D2
    description: "Factory pattern parametrizável (D-02) demonstrado em examples/plugins/timestamps-plugin.ts — zero API extra no core"
    verification:
      - kind: other
        ref: "npx tsc --noEmit (type-checa examples/plugins/timestamps-plugin.ts)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Module augmentation (D-09b) tipando .paginate() sem cast/any no call-site em examples/plugins/augmentation.ts — inferência via construtor documentada como inviável"
    verification:
      - kind: other
        ref: "npx tsc --noEmit (type-checa examples/plugins/augmentation.ts, resolve .paginate() via declare module)"
        status: pass
    human_judgment: false

duration: 20min
completed: 2026-07-15
status: complete
---

# Phase 07 Plan 04: Bind de statics via Proxy (D-12) + exemplos de factory e module augmentation (D-09b) Summary

**Teste de integração contra MongoDB real prova que um static registrado por plugin herda o bind automático do Proxy trap (D-12); três exemplos novos (`timestamps`, `paginate`, `augmentation`) demonstram o factory pattern (D-02) e fecham o veredito D-09b — module augmentation (`declare module '@/model'`) é a forma oficial de tipar `.paginate()` sem anotação no call-site, já que a inferência-plena via `new Model({ plugins })` foi provada inviável no `07-RESEARCH.md`.**

## Performance

- **Duration:** ~20 min
- **Started:** 2026-07-15T12:57:00Z (aprox.)
- **Completed:** 2026-07-15T13:17:00Z
- **Tasks:** 2 (Task 1 auto, Task 2 auto)
- **Files modified:** 4 (todos novos)

## Accomplishments
- `test/model/plugins-static-binding.test.ts`: plugin registra um static `paginate(page, pageSize)` cujo corpo usa `this.getCollection()`; construído com `new Model({ plugins: [...] })`, conectado a um MongoDB real via testcontainers, 5 documentos inseridos e 3 páginas consecutivas de `model.paginate(...)` assertadas exatamente — prova ponta a ponta de que o Proxy trap (`value.bind(target)`, `src/database/index.ts:357-358`) já cobre statics de plugin, sem nenhuma mudança de código de produção.
- `examples/plugins/timestamps-plugin.ts`: factory `timestamps(options?)` que devolve um plugin registrando pre hooks de `insert`/`update` — demonstra D-02 (composição pura, zero API extra no core).
- `examples/plugins/paginate-plugin.ts`: plugin que registra o static `paginate` via `ctx.static`, usando `this.getCollection()` diretamente — o autor do plugin declara `PaginateStatic<ModelType>` só como documentação de referência, não como o mecanismo real de tipagem do consumidor.
- `examples/plugins/augmentation.ts`: `declare module '@/model' { interface Model<ModelType extends Document> { paginate(...): Promise<WithId<ModelType>[]> } }` funde com a `class Model` existente — `Post.paginate(1, 10)` type-checa sem `as`/`any`, fechando o veredito D-09b com um exemplo executável/type-checável. Inclui nota inline sobre D-15 (selo por semver do pacote, sem `apiVersion`).
- `npx tsc --noEmit` (inclui `examples/`) e `npm test` (209/209 testes, 55 arquivos) verdes ao final da wave.

## Task Commits

Each task was committed atomically:

1. **Task 1: Teste de integração — bind de static de plugin via Proxy (D-12)** - `9afcda8` (test)
2. **Task 2: Exemplos — factory pattern (D-02) + module augmentation D-09b** - `8ea57f7` (docs)

**Plan metadata:** (commit a seguir) `docs: complete plan`

## Files Created/Modified
- `test/model/plugins-static-binding.test.ts` - Integração (testcontainers) provando bind de static de plugin via Proxy (D-12) (novo)
- `examples/plugins/timestamps-plugin.ts` - Factory parametrizável (D-02) registrando pre hooks de insert/update (novo)
- `examples/plugins/paginate-plugin.ts` - Plugin registrando static `paginate` via `this.getCollection()` (novo)
- `examples/plugins/augmentation.ts` - `declare module '@/model'` tipando `.paginate()` sem cast/any (D-09b) (novo)

## Decisions Made
- Campo `order` do schema de teste em `plugins-static-binding.test.ts` usa `bsonType: 'int'` com inteiros JS literais — padrão já validado em `test/model/crud-error-coverage.test.ts`, evita depender de um comportamento de serialização BSON não verificado neste plano.
- `timestamps-plugin.ts`: cast pontual de `c.update` para acessar `$set` com segurança de tipos, já que o `Plugin<ModelType = Document>` genérico não expõe a forma concreta do `$set` sem alargar o shape — decisão de implementação local ao exemplo, sem impacto na API pública.
- `augmentation.ts`: `Post` construído com `allowedMethods: []` (nenhum método nativo gated é chamado no exemplo — só o static de plugin, que não passa pelo gating de `METHODS`).

## Deviations from Plan

None - plano executado exatamente como escrito. As duas decisões de tipagem acima em `timestamps-plugin.ts` são preenchimento de detalhe de implementação (cast pontual para acessar `$set`), não desvios de comportamento especificado no plano.

## Issues Encountered
- `npx prettier --check` sinalizou um problema de formatação em `examples/plugins/paginate-plugin.ts` (assinatura de função com múltiplos parâmetros e `this` anotado excedendo a largura de linha) — corrigido com `npx prettier --write`, sem mudança de comportamento.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Fase 07 (sistema de plugins) tem seus 3 requisitos (PLUG-01, PLUG-02, PLUG-03) cobertos pelos 4 planos: fundação de tipos (07-01), construtor local (07-02), `Model.plugin()` global (07-03), bind de statics + exemplos de tipagem (07-04).
- `examples/plugins/` está pronto para servir de base a um guia de plugins em uma fase futura de documentação (citado no objetivo do plano, mas fora do escopo desta fase).
- Nenhum bloqueio conhecido para a próxima fase (08 — migrations).

---
*Phase: 07-sistema-de-plugins*
*Completed: 2026-07-15*
