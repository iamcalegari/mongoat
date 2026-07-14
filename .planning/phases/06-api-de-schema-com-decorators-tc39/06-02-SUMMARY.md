---
phase: 06-api-de-schema-com-decorators-tc39
plan: 02
subsystem: api
tags: [typescript, tc39-decorators, model-constructor, json-schema, mongodb]

# Dependency graph
requires:
  - phase: 06-01
    provides: módulo src/schema/ com @Schema/@Prop, Schema.compile público, SchemaClass<T>, kMongoatSchemaClass marker, cadeia de build (tsdown+babel) e suíte (vitest+babel) validadas para decorators TC39
provides:
  - Model construtor aceita `schema: ModelValidationSchema | SchemaClass<T>` de forma transparente (DECO-04) — classe decorada e objeto plano coexistem como cidadãs de primeira classe
  - collectionName default resolvido de `@Schema('nome')`, sobrescrevível pelo config do Model (D-06); collectionName opcional em CreateModelProps quando a classe fornece o default
  - defaults por-insert de classe decorada: inicializador de campo avaliado FRESCO por documento (D-12), com precedência doc > documentDefaults(config) > inicializador da classe (D-13)
  - ownDefinedProperties/buildClassDefaults filtram chaves undefined antes do merge — nenhum campo sem inicializador é injetado como BSON Undefined (Pitfall 3)
  - WR-04 fechado — re-registração de uma collectionName já existente que declara hooks (props.hooks) falha alto com MODEL_CONFIG_CONFLICT em vez de descartar o hook em silêncio
affects: [06-03, 06-04, plugins, migrations]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "detecção runtime de schema class vs objeto plano via `typeof schema === 'function'`, resolvida ANTES de schemaValidatorBuilder (que segue 100% alheio a decorators)"
    - "instanciação fresca de classe decorada POR DOCUMENTO (não por chamada) em insert/insertMany/bulkWrite — cada doc do batch tem o próprio inicializador"
    - "filtro de undefined isolado num helper puro (ownDefinedProperties) reaproveitado por um único método privado (buildClassDefaults) — nenhuma duplicação entre os 3 pontos de merge"
    - "flags booleanas extensíveis (candidateHasHooks) para fechar um WR aberto sem introduzir comparação estrutural de funções"

key-files:
  created: []
  modified:
    - src/types/model.ts
    - src/model/index.ts
    - test/model/registry-config.test.ts
    - test/schema/schema-class-or-plain.test.ts
    - test/schema/decorated-vs-plain-parity.test.ts
    - test/schema/per-insert-defaults.test.ts

key-decisions:
  - "Hidratação de defaults por-insert (D-12) escopada SÓ no nível raiz — a classe do `schema:` do Model é instanciada, mas classes decoradas ANINHADAS (@Prop({ type: OutraClasse })) não são instanciadas recursivamente para colher inicializadores; documentado como escopo explícito desta fase (Open Question 1 do 06-RESEARCH.md), não um bug pendente. Nested defaults seguem disponíveis via `documentDefaults` do config."
  - "candidateHasHooks deixado extensível de propósito: hoje só olha `props.hooks`, mas o Plano 06-04 (@Pre/@Post na classe) vai marcá-lo `true` também quando a classe decorada declarar hooks — o branch fail-loud do WR-04 já está pronto para os dois casos sem mudança estrutural."
  - "kMongoatSchemaClass importado diretamente de `@/schema/decorators` (não do barrel público `@/schema`) — marker interno, nunca deve vazar como export público; Model já é código interno do próprio pacote, então o import direto não viola D-15 (barrel único para a API pública dos decorators)."
  - "Mensagem de erro de collectionName ausente em inglês, alinhada ao restante das mensagens de MongoatError do código (PT só nos comentários internos, nunca nas mensagens voltadas ao consumidor)."

patterns-established:
  - "Resolução de config (schema/collectionName) sempre ANTES de qualquer I/O ou registro — mantém o constructor 100% síncrono (D-07) mesmo com a etapa extra de Schema.compile"
  - "isSameConfig() nunca tenta comparar hooks estruturalmente — WR-04 é resolvido com uma flag categórica (tem hooks / não tem), não com uma tentativa de deep-equal de funções"

requirements-completed: [DECO-04]

coverage:
  - id: D1
    description: "new Model({ schema: ClasseDecorada }) e new Model({ schema: objetoPlano }) produzem o MESMO validator (bit-a-bit) — as duas APIs são transparentes para o construtor"
    requirement: DECO-04
    verification:
      - kind: unit
        ref: "test/schema/schema-class-or-plain.test.ts#classe decorada e objeto plano equivalente produzem o MESMO validator"
        status: pass
    human_judgment: false
  - id: D2
    description: "@Schema('nome') fornece o collectionName default; config do Model pode omitir (herda) ou sobrescrever; ausência dos dois falha alto"
    requirement: DECO-04
    verification:
      - kind: unit
        ref: "test/schema/schema-class-or-plain.test.ts#D-06: classe decorada sem collectionName no config herda o default de @Schema"
        status: pass
      - kind: unit
        ref: "test/schema/schema-class-or-plain.test.ts#D-06: collectionName no config sobrescreve o default de @Schema"
        status: pass
      - kind: unit
        ref: "test/schema/schema-class-or-plain.test.ts#classe decorada sem collectionName no config nem em @Schema lança MongoatValidationError"
        status: pass
    human_judgment: false
  - id: D3
    description: "Model construído com classe decorada valida/rejeita documentos contra MongoDB real exatamente como o Model equivalente por objeto plano (doc válido aceito, tipo errado rejeitado, required ausente rejeitado — mesmo comportamento do $jsonSchema)"
    requirement: DECO-04
    verification:
      - kind: integration
        ref: "test/schema/decorated-vs-plain-parity.test.ts (3 testes: válido aceito, tipo errado rejeitado, required ausente rejeitado — Mongo real via testcontainers)"
        status: pass
    human_judgment: false
  - id: D4
    description: "Inicializador de campo (createdAt = new Date()) avaliado FRESCO por insert — dois inserts consecutivos produzem valores diferentes (D-12)"
    requirement: DECO-04
    verification:
      - kind: integration
        ref: "test/schema/per-insert-defaults.test.ts#dois inserts consecutivos produzem createdAt DIFERENTES (fresco por insert, D-12)"
        status: pass
    human_judgment: false
  - id: D5
    description: "Precedência de defaults no insert: doc do usuário > documentDefaults do config > inicializadores da classe (D-13)"
    requirement: DECO-04
    verification:
      - kind: integration
        ref: "test/schema/per-insert-defaults.test.ts#precedência D-13: doc do usuário sobrescreve o inicializador da classe"
        status: pass
      - kind: integration
        ref: "test/schema/per-insert-defaults.test.ts#precedência D-13: documentDefaults do config sobrescreve o inicializador da classe, mas não o doc do usuário"
        status: pass
    human_judgment: false
  - id: D6
    description: "Campo declarado sem inicializador (valor undefined) não é injetado no documento — falha por required, não por bsonType/serialização de BSON Undefined (Pitfall 3)"
    requirement: DECO-04
    verification:
      - kind: integration
        ref: "test/schema/per-insert-defaults.test.ts#campo required sem inicializador nem valor do usuário falha por required — não por bsonType/serialização de BSON Undefined (Pitfall 3)"
        status: pass
    human_judgment: false
  - id: D7
    description: "WR-04: hook declarado numa re-registração do mesmo collectionName nunca é descartado em silêncio — falha alto com MODEL_CONFIG_CONFLICT; re-registro sem hooks e config idêntica continua reusando a instância"
    verification:
      - kind: unit
        ref: "test/model/registry-config.test.ts#new Model() com props.hooks presente na re-registração da mesma collectionName lança MongoatError/MODEL_CONFIG_CONFLICT em vez de descartar o hook (WR-04)"
        status: pass
      - kind: unit
        ref: "test/model/registry-config.test.ts#new Model() SEM hooks e config idêntica continua reusando a instância existente mesmo quando a primeira registração declarou hooks"
        status: pass
    human_judgment: false

# Metrics
duration: 15min
completed: 2026-07-13
status: complete
---

# Phase 6 Plan 02: Integração da API de decorators ao Model Summary

**`new Model({ schema: ClasseDecorada })` e `new Model({ schema: objetoPlano })` agora coexistem transparentemente — mesmo validator, defaults por-insert frescos e seguros (createdAt = new Date() por documento), e WR-04 (hooks descartados em silêncio) fechado**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-07-13T23:14:00-03:00 (aprox.)
- **Completed:** 2026-07-13T23:26:08-03:00
- **Tasks:** 3 (1 TDD RED + 2 auto/GREEN)
- **Files modified:** 6 (2 src, 4 test)

## Accomplishments

- **Construtor do Model aceita os dois caminhos de schema (DECO-04, D-08):** `typeof schema === 'function'` detecta classe decorada; `Schema.compile(schema)` roda ANTES de `schemaValidatorBuilder`, que segue 100% alheio à existência de decorators — nenhuma duplicação de lógica de validator entre os dois caminhos.
- **collectionName default de `@Schema('nome')` (D-06):** `CreateModelProps.collectionName` virou opcional; `getDefaultCollectionName(cls)` lê o marker `kMongoatSchemaClass` gravado por `@Schema`; config explícito sempre sobrescreve o default da classe; ausência dos dois lança `MongoatValidationError(VALIDATION_FAILED)`.
- **Defaults por-insert frescos e seguros (D-12/D-13 + Pitfall 3):** `buildClassDefaults()` instancia `this.schemaClass` fresco POR DOCUMENTO (não uma vez por chamada) em `insert`/`insertMany`/`bulkWrite`; `ownDefinedProperties` filtra chaves `undefined` antes do merge, então um campo sem inicializador simplesmente NÃO entra no documento (o servidor rejeita por `required`, nunca por uma serialização BSON `Undefined` confusa). Precedência confirmada contra Mongo real: `classDefaults` (menor) → `documentDefaults` do config → doc do usuário (maior).
- **WR-04 fechado:** `candidateHasHooks` detecta `props.hooks` numa re-registração de `collectionName` já existente e falha alto com `MODEL_CONFIG_CONFLICT` em vez de tentar comparar funções estruturalmente ou (o bug original) descartar o hook em silêncio pelo early-return de `isSameConfig`. Deixado extensível: o Plano 06-04 (`@Pre`/`@Post` de classe) só precisa marcar a mesma flag `true`, sem mudança estrutural no branch de re-registro.
- **Paridade end-to-end provada contra MongoDB real:** `decorated-vs-plain-parity.test.ts` insere o MESMO documento (válido, tipo errado, required ausente) em um Model por classe decorada e um Model por objeto plano equivalente — os dois se comportam identicamente perante o `$jsonSchema` do servidor.

## Task Commits

Each task was committed atomically:

1. **Task 1 (TDD RED): testes de detecção, paridade Mongo real, defaults por-insert e WR-04** — `2e98002` (test)
2. **Task 2: Constructor do Model aceita classe decorada + collectionName default (D-06/D-08)** — `a241b28` (feat)
3. **Task 3: Defaults por-insert filtrando undefined (D-12/D-13) + WR-04 hooks fail-loud** — `d4f355a` (feat)

_REFACTOR não foi necessário (GREEN já saiu limpo — cada Task 2/3 focou num aspecto isolado do constructor/merge sem sobreposição)._

## TDD Gate Compliance

- RED gate: `2e98002` (`test(06-02)`) — 4 testes de `schema-class-or-plain.test.ts` + 3 de `decorated-vs-plain-parity.test.ts` + 4 de `per-insert-defaults.test.ts` + 1 novo de `registry-config.test.ts` falhando pelo motivo certo (`DataCloneError` em `structuredClone(schema)` quando `schema` é uma função, e hook silenciosamente descartado no WR-04).
- GREEN gate: `a241b28` (Task 2, D-08/D-06) + `d4f355a` (Task 3, D-12/D-13/Pitfall 3/WR-04) — suíte completa 143/143 verde ao final da Task 3.

## Files Created/Modified

- `src/types/model.ts` — `CreateModelProps.schema` aceita `ModelValidationSchema | SchemaClass<ModelType>`; `collectionName` opcional; import de `SchemaClass` de `@/types/schema`
- `src/model/index.ts` — detecção `isDecoratedSchemaClass`/`resolvedSchema`/`resolvedCollectionName` no constructor; `getDefaultCollectionName(cls)`; campo privado `schemaClass`; `ownDefinedProperties`/`buildClassDefaults()`; camada `classDefaults` no merge de `insert`/`insertMany`/`bulkWrite`; `candidateHasHooks` + branch fail-loud de WR-04
- `test/model/registry-config.test.ts` — 2 novos casos: hooks numa re-registração falham alto (WR-04); re-registro sem hooks e config idêntica continua reusando a instância
- `test/schema/schema-class-or-plain.test.ts` (novo) — 4 testes unitários de detecção classe/objeto e D-06
- `test/schema/decorated-vs-plain-parity.test.ts` (novo) — 3 testes de integração (Mongo real) de paridade de validação
- `test/schema/per-insert-defaults.test.ts` (novo) — 4 testes de integração (Mongo real) de D-12/D-13/Pitfall 3

## Decisions Made

- **Hidratação de defaults só no nível raiz (Open Question 1 do 06-RESEARCH.md):** a classe passada em `schema:` do Model é instanciada fresca por insert, mas classes decoradas ANINHADAS (referenciadas via `@Prop({ type: OutraClasse })`, D-05) não são instanciadas recursivamente — só o shape do schema é compilado recursivamente (responsabilidade de `Schema.compile`), não a hidratação de inicializadores aninhados. Documentado aqui como escopo explícito desta fase (MVP), não uma lacuna descoberta tarde; nested defaults seguem disponíveis via `documentDefaults` do config, caminho já existente.
- **candidateHasHooks extensível:** hoje só examina `props.hooks`, preparado para o Plano 06-04 também marcar `true` quando a classe decorada declarar `@Pre`/`@Post` de classe — o branch fail-loud do WR-04 não precisa de nenhuma mudança estrutural para cobrir esse caso.
- **kMongoatSchemaClass importado diretamente de `@/schema/decorators`** (não do barrel público `@/schema`) — é um marker `@internal`, nunca deve virar export público; o import direto entre módulos internos do próprio pacote não viola D-15 (barrel único é sobre a API pública consumida por terceiros).

## Deviations from Plan

None — plano executado exatamente como especificado. As três tasks (RED → constructor → defaults/WR-04) seguiram a sequência e os pontos de integração descritos no PLAN.md/RESEARCH.md sem necessidade de fix reativo (Rules 1-3) nem decisão arquitetural fora de escopo (Rule 4).

## Issues Encountered

None. A única superfície nova que exigiu atenção foi o teste de Pitfall 3 (per-insert-defaults.test.ts), que inspeciona `err.cause.errInfo.details.schemaRulesNotSatisfied` (estrutura real do `MongoServerError` do MongoDB para `$jsonSchema`) — confirmado empiricamente contra o container real na primeira execução, sem necessidade de ajuste.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `this.schemaClass` já é guardado no Model — pronto para o Plano 06-04 (`@Pre`/`@Post` de classe/campo) reaproveitar sem precisar re-detectar a classe decorada.
- `candidateHasHooks` deixado extensível — 06-04 só precisa estender a condição, sem tocar no branch de re-registro em si.
- Paridade classe-decorada/objeto-plano provada ponta-a-ponta (unit + integração contra Mongo real); qualquer regressão futura na compilação/merge de defaults tem cobertura de teste já em `test/schema/`.
- Hidratação de defaults aninhados (classes decoradas dentro de `@Prop({ type: ... })`) segue fora de escopo — candidato explícito para uma minor futura se houver demanda (ver Decisions Made).

## Self-Check: PASSED

- Arquivos verificados em disco: src/types/model.ts, src/model/index.ts, test/model/registry-config.test.ts, test/schema/{schema-class-or-plain,decorated-vs-plain-parity,per-insert-defaults}.test.ts — FOUND
- Commits verificados: 2e98002, a241b28, d4f355a — FOUND
- Verificação do plano: suíte completa 143/143 verde; `npm run typecheck` exit 0; `npm run build` verde (CJS+ESM); `npm run lint` limpo

---
*Phase: 06-api-de-schema-com-decorators-tc39*
*Completed: 2026-07-13*
