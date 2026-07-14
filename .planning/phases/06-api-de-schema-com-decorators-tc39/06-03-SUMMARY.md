---
phase: 06-api-de-schema-com-decorators-tc39
plan: 03
subsystem: api
tags: [typescript, tc39-decorators, json-schema, mongodb, sugars, nested-schema]

# Dependency graph
requires:
  - phase: 06-01
    provides: módulo src/schema/ com @Schema/@Prop metadata-only, Schema.compile público, SchemaClass<T>, cadeia de build (tsdown+babel) e suíte (vitest+babel) validadas para decorators TC39
provides:
  - Conjunto completo de açúcares composáveis sobre @Prop (D-02) — BsonType, Description, Pattern, Optional, Enum, Min, Max, MinLength, MaxLength — exportados do barrel principal (D-15)
  - Merge (não replace) de fragmentos por campo em meta.properties — múltiplos açúcares/@Prop no mesmo campo agregam um único fragmento
  - @Optional() (D-04) — remove o campo de required de forma idempotente independente da ordem textual dos decorators, via meta.optionalFields filtrado no compile
  - Compile recursivo de nested/arrays (D-05) — @Prop({ type: ClasseDecorada }) e @Prop({ items: ClasseDecorada }) compilam recursivamente via Schema.compile; subschema JSON Schema inline aceito verbatim como escape hatch
  - JSONSchema4Subset (src/types/model.ts) estendido com minimum/maximum/minLength/maxLength — chaves usadas pelos novos açúcares de constraint
affects: [06-04, plugins, migrations, documentation]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "açúcar = função fina que retorna Prop({ ...fragment }) — sem factory genérica prematura (uma função por export)"
    - "campos que precisam de comportamento além de agregar fragmento (ex.: @Optional) NÃO retornam Prop(...) — mutam uma seção separada do FieldMeta e a resolução final acontece no compile, nunca na decoração"
    - "clone por campo (compileProperty) em vez de clone do objeto properties inteiro de uma vez — necessário quando um fragmento pode conter um valor não-cloneável por structuredClone (uma classe/function)"
    - "chaves Mongoat-only no fragmento de @Prop (type/items widened para NestedSchemaValue) que nunca sobrevivem verbatim ao ModelValidationSchema final — são sempre resolvidas/substituídas no compile"

key-files:
  created:
    - src/schema/sugars.ts
    - test/schema/sugars.test.ts
    - test/schema/nested-compile.test.ts
  modified:
    - src/schema/decorators.ts
    - src/schema/compile.ts
    - src/schema/index.ts
    - src/index.ts
    - src/types/schema.ts
    - src/types/model.ts

key-decisions:
  - "@Optional() implementado como decorator SEPARADO de Prop (não um açúcar-fragmento) — registra o nome do campo em meta.optionalFields; a filtragem contra required só acontece no Schema.compile (não no momento em que o decorator roda), o que garante idempotência independente de @Optional estar escrito ANTES ou DEPOIS de @Prop/um açúcar no mesmo campo textualmente"
  - "Prop() mudou de replace (`meta.properties[campo] = {...fragment}`) para merge (`{...existing, ...fragment}`) — pré-requisito estrutural para a composição de múltiplos açúcares no mesmo campo (D-02, Test 4 do plano)"
  - "type é tratado como 'a property inteira É o subschema resolvido' (Object.assign por cima do resto do fragmento) — um bsonType eventualmente declarado ao lado de type é sobrescrito pelo bsonType:'object' vindo do compile recursivo; items só popula a chave items, o bsonType:'array' do array continua sendo responsabilidade do dev"
  - "Detecção de 'é classe decorada' em type/items feita via typeof value === 'function' (sem precisar do marker kMongoatSchemaClass) — evita importar de decorators.ts em compile.ts, preservando a direção única de import decorators→compile estabelecida no 06-01"
  - "JSONSchema4Subset (src/types/model.ts) ganhou minimum/maximum/minLength/maxLength — fora do files_modified original do plano (que listava só src/types/schema.ts), mas necessário para o compile tipar corretamente o fragmento por campo (Rule 2 — tipagem crítica ausente para uma feature que o próprio plano exige)"

patterns-established:
  - "Escape hatch de nested schema (D-05): um valor não-function passado a type/items é um subschema JSON Schema já pronto — clonado (nunca mutado) e usado verbatim, sem recompilação"
  - "required é sempre computado no compile, nunca mutado incrementalmente pelos decorators de campo — abre a porta para qualquer decorator futuro que precise afetar required sem se preocupar com ordem de aplicação"

requirements-completed: [DECO-01, DECO-03]

coverage:
  - id: D1
    description: "@BsonType/@Description/@Pattern compõem @Prop e produzem o fragmento de schema correto por campo"
    requirement: DECO-01
    verification:
      - kind: unit
        ref: "test/schema/sugars.test.ts#@BsonType/@Description/@Pattern produzem o fragmento correto na property do campo"
        status: pass
    human_judgment: false
  - id: D2
    description: "@Optional() remove o campo da lista required do schema compilado; campos permanecem required por padrão sem ele, independente da ordem textual do decorator no campo"
    requirement: DECO-01
    verification:
      - kind: unit
        ref: "test/schema/sugars.test.ts#@Optional() remove o campo de required; sem @Optional o campo permanece required"
        status: pass
    human_judgment: false
  - id: D3
    description: "@Enum/@Min/@Max/@MinLength/@MaxLength produzem enum/minimum/maximum/minLength/maxLength no fragmento compilado"
    requirement: DECO-01
    verification:
      - kind: unit
        ref: "test/schema/sugars.test.ts#@Enum/@Min/@Max/@MinLength/@MaxLength produzem enum/minimum/maximum/minLength/maxLength"
        status: pass
    human_judgment: false
  - id: D4
    description: "Múltiplos açúcares no mesmo campo compõem um único fragmento agregado (merge, não replace)"
    requirement: DECO-01
    verification:
      - kind: unit
        ref: "test/schema/sugars.test.ts#múltiplos açúcares no mesmo campo compõem um único fragmento agregado"
        status: pass
    human_judgment: false
  - id: D5
    description: "@Prop({ type: NestedSchemaClass }) compila recursivamente o subschema aninhado; @Prop({ items: NestedSchemaClass }) compila o schema de itens do array"
    requirement: DECO-03
    verification:
      - kind: unit
        ref: "test/schema/nested-compile.test.ts#@Prop({ type: NestedSchemaClass }) compila recursivamente o subschema aninhado"
        status: pass
      - kind: unit
        ref: "test/schema/nested-compile.test.ts#@Prop({ items: NestedSchemaClass }) compila o schema de itens do array"
        status: pass
    human_judgment: false
  - id: D6
    description: "Subschema JSON Schema inline passado a @Prop é aceito como escape hatch e entra no schema compilado sem alteração"
    requirement: DECO-03
    verification:
      - kind: unit
        ref: "test/schema/nested-compile.test.ts#subschema JSON Schema inline é aceito verbatim como escape hatch (D-05)"
        status: pass
    human_judgment: false
  - id: D7
    description: "Schema.compile de uma classe com açúcares e aninhamento produz o mesmo ModelValidationSchema do objeto plano equivalente escrito à mão"
    requirement: DECO-03
    verification:
      - kind: unit
        ref: "test/schema/sugars.test.ts#equivalência DECO-03: Schema.compile com açúcares é byte-a-byte igual ao objeto plano equivalente"
        status: pass
      - kind: unit
        ref: "test/schema/nested-compile.test.ts#equivalência DECO-03 com aninhamento: Schema.compile é byte-a-byte igual ao objeto plano equivalente"
        status: pass
    human_judgment: false

# Metrics
duration: 5min
completed: 2026-07-13
status: complete
---

# Phase 6 Plan 03: Açúcares composáveis e compile recursivo Summary

**Conjunto completo de açúcares TC39 sobre `@Prop` (`@BsonType`, `@Description`, `@Pattern`, `@Optional`, `@Enum`, `@Min`/`@Max`, `@MinLength`/`@MaxLength`) compondo por merge, e `Schema.compile` recursivo para schemas/arrays aninhados — equivalência byte-a-byte com o objeto plano preservada mesmo com composição e aninhamento**

## Performance

- **Duration:** ~5 min (execução)
- **Started:** 2026-07-13T23:33:40-03:00 (commit RED)
- **Completed:** 2026-07-13T23:37:34-03:00 (commit GREEN da Task 3)
- **Tasks:** 3 (1 TDD RED + 2 auto/GREEN)
- **Files modified:** 8 (2 test novos, 1 src novo, 5 src modificados)

## Accomplishments

- **9 açúcares completos sobre `@Prop` (D-02):** `src/schema/sugars.ts` traz uma função fina por açúcar (`BsonType`, `Description`, `Pattern`, `Enum`, `Min`, `Max`, `MinLength`, `MaxLength`), cada uma só um `return Prop({ ...fragment })` — sem factory genérica prematura, seguindo o padrão do `06-PATTERNS.md`. `Optional` (o único que não é um fragmento simples) fica em `decorators.ts`, onde `meta`/`getOrInitMeta` já são acessíveis.
- **Composição de múltiplos açúcares no mesmo campo (Test 4 do plano):** `Prop()` deixou de fazer *replace* (`meta.properties[campo] = {...fragment}`) e passou a fazer *merge* (`{...existing, ...fragment}`) — `@BsonType('string')` + `@Pattern('^x')` + `@Description(...)` no mesmo campo agregam um único fragmento com as três chaves, em vez do último decorator aplicado apagar os anteriores.
- **`@Optional()` idempotente independente de ordem (D-04):** em vez de remover o campo de `required` no MOMENTO em que o decorator roda (frágil — dependeria de `@Optional` rodar DEPOIS de `@Prop`), `Optional()` só registra o nome em `meta.optionalFields`; a filtragem real acontece em `Schema.compile`, que só roda depois que TODOS os decorators de campo já aplicaram (garantia da spec TC39). Testado explicitamente com `@Optional` escrito ANTES e DEPOIS de `@Prop` no mesmo campo — ambos os casos removem de `required`.
- **Compile recursivo de nested/arrays (D-05):** `@Prop({ type: NestedSchemaClass })` compila recursivamente a classe aninhada via `Schema.compile` e substitui o shape da property por `{ bsonType: 'object', properties, required }`; `@Prop({ items: NestedSchemaClass })` faz o mesmo para a chave `items` de um array. Um subschema JSON Schema inline (objeto plano, não uma classe) passado em `type`/`items` é aceito verbatim como escape hatch — clonado, mas NUNCA recompilado.
- **Equivalência DECO-03 preservada com composição e aninhamento:** dois testes de `stableStringify` byte-a-byte (um só com açúcares, outro com açúcares + aninhamento de 2 níveis + array) confirmam que `Schema.compile` de uma classe decorada continua produzindo exatamente o mesmo `ModelValidationSchema` que um dev escreveria à mão com a API de objetos.

## Task Commits

Each task was committed atomically:

1. **Task 1 (TDD RED): testes de composição de açúcares e compile aninhado** — `ebdf665` (test)
2. **Task 2: açúcares composáveis + @Optional (D-04)** — `9a9ddb3` (feat)
3. **Task 3: compile recursivo de nested/arrays (D-05)** — `0645dff` (feat)

_REFACTOR não foi necessário (GREEN de cada task saiu limpo — Task 2 focou em composição/`@Optional`, Task 3 focou em recursão, sem sobreposição)._

## TDD Gate Compliance

- RED gate: `ebdf665` (`test(06-03)`) — 9 testes novos (5 em `sugars.test.ts`, 4 em `nested-compile.test.ts`) falhando pelo motivo certo: `Module '"@/schema"' has no exported member 'BsonType'|'Optional'|...` (símbolos ainda não existiam) e `Object literal may only specify known properties, and 'type'/'minimum' does not exist` (tipos ainda não estendidos).
- GREEN gate: `9a9ddb3` (Task 2 — sugars + Optional, `sugars.test.ts` 5/5 verde; `nested-compile.test.ts` ainda RED pelo motivo certo — `DataCloneError` ao tentar `structuredClone` uma classe) + `0645dff` (Task 3 — compile recursivo, `nested-compile.test.ts` 4/4 verde). Suíte completa 152/152 ao final da Task 3.

## Files Created/Modified

- `src/schema/sugars.ts` (novo) — 8 açúcares (`BsonType`, `Description`, `Pattern`, `Enum`, `Min`, `Max`, `MinLength`, `MaxLength`), cada um `Prop({ ...fragment })`
- `src/schema/decorators.ts` — `Prop` faz merge (não replace) em `meta.properties[campo]`; novo `Optional()` registra em `meta.optionalFields`; `getOrInitMeta` inicializa `optionalFields: []`
- `src/schema/compile.ts` — `required` filtrado contra `optionalFields` no compile; `compileProperty`/`resolveNestedSchema` (novas funções privadas) resolvem `type`/`items` por campo — classe decorada compila recursivamente via `compile()`, objeto plano é aceito verbatim (clonado); clone deixou de ser `structuredClone(meta.properties)` de uma vez e passou a ser por campo (`compileProperty`), porque `structuredClone` não sabe clonar uma `function`/classe
- `src/schema/index.ts` / `src/index.ts` — barrel reexporta os 8 açúcares + `Optional` (D-15, sem subpaths novos)
- `src/types/schema.ts` — `NestedSchemaValue` (`SchemaClass | ModelValidationSchema`), `PropFragment` (widening de `type`/`items` para `NestedSchemaValue`), `FieldMeta.optionalFields`
- `src/types/model.ts` — `JSONSchema4Subset` ganha `minimum`/`maximum`/`minLength`/`maxLength`
- `test/schema/sugars.test.ts` (novo) — 5 testes: fragmento básico, `@Optional` (ordem normal e invertida), constraints, composição multi-açúcar, equivalência DECO-03
- `test/schema/nested-compile.test.ts` (novo) — 4 testes: `type` aninhado, `items` de array, escape hatch inline, equivalência DECO-03 com aninhamento

## Decisions Made

- **`@Optional()` como decorator separado, não um açúcar-fragmento:** ao contrário dos outros 8 açúcares (que só chamam `Prop({...})`), `Optional` precisa manipular `meta.optionalFields` diretamente — colocado em `decorators.ts` (onde `getOrInitMeta`/`meta` já são acessíveis), reexportado de `sugars`-adjacente no barrel para manter a API pública consistente (`import { Optional } from '@iamcalegari/mongoat'`).
- **Merge em vez de replace no `Prop()`:** pré-requisito estrutural para D-02 Test 4 (composição). Sem essa mudança, dois açúcares no mesmo campo se sobrescreveriam (o último decorator aplicado "ganharia").
- **`type` sobrescreve o shape inteiro da property; `items` só popula a chave `items`:** decisão de design não explicitamente detalhada no plano, mas necessária para a semântica fazer sentido — um campo com `@Prop({ type: Address, description: '...' })` deveria ter `bsonType: 'object'` (vindo do `Address` compilado) mesmo que o dev não tenha declarado `bsonType` explicitamente ao lado; `description` (uma chave sibling, não conflitante) sobrevive porque `Object.assign` só sobrescreve as chaves que vêm do subschema resolvido (`bsonType`, `properties`, `required`, ...), nunca remove `description` do fragmento original.
- **Detecção "é classe decorada" via `typeof value === 'function'`, sem `kMongoatSchemaClass`:** evita importar de `decorators.ts` dentro de `compile.ts`, preservando a disciplina "decorators→compile em direção única, sem ciclo" estabelecida no 06-01. Um valor de `type`/`items` só pode ser, pelo contrato da API, uma classe decorada OU um subschema plano — nunca uma função arbitrária não relacionada.
- **`JSONSchema4Subset` estendido em `src/types/model.ts` (fora do `files_modified` original do plano):** o plano listava só `src/types/schema.ts` para "tipos dos fragmentos de açúcar", mas `minimum`/`maximum`/`minLength`/`maxLength` são chaves do `ModelValidationSchema`/`$jsonSchema` em si (não só do fragmento do decorator) — sem a extensão, `npm run typecheck` falhava tanto no compile quanto nos testes que fazem `toEqual({ ..., minimum: 1 })` contra o tipo `ModelValidationSchema`. Tratado como Rule 2 (tipagem crítica ausente para uma feature que o próprio plano exige).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical functionality] `JSONSchema4Subset` sem `minimum`/`maximum`/`minLength`/`maxLength`**
- **Found during:** Task 1 (RED) — `npm run typecheck` acusava `Object literal may only specify known properties, and 'minimum' does not exist in type 'ModelValidationSchema<any>'`
- **Issue:** O plano listava `src/types/schema.ts` como o único arquivo de tipos a modificar, mas as 4 chaves de constraint (`minimum`/`maximum`/`minLength`/`maxLength`) são chaves reais do `$jsonSchema`/`ModelValidationSchema`, definidas em `src/types/model.ts` (`JSONSchema4Subset`), não em `schema.ts`
- **Fix:** Adicionadas as 4 chaves em `JSONSchema4Subset` (`src/types/model.ts`), documentadas como "usadas pelos açúcares @Min/@Max/@MinLength/@MaxLength (Fase 6)" — mesmo padrão de vendoring do resto da interface
- **Files modified:** src/types/model.ts
- **Verification:** `npm run typecheck` exit 0; `test/schema/sugars.test.ts` (Test 3) verde
- **Committed in:** `9a9ddb3` (commit da Task 2)

---

**Total deviations:** 1 (Rule 2, tipagem)
**Impact on plan:** Nenhum scope creep — a extensão é aditiva, restrita a 4 propriedades opcionais numa interface já vendorizada, necessária para os próprios testes do plano tiparem corretamente.

## Issues Encountered

- Ao implementar o compile recursivo (Task 3), a primeira tentativa manteve `structuredClone(meta.properties)` de uma vez só — quebrou com `DataCloneError` assim que um fragmento passou a conter uma CLASSE (function) em `type`/`items` (`structuredClone` não sabe clonar funções). Corrigido movendo o clone para DENTRO de `compileProperty` (por campo, excluindo `type`/`items` do `structuredClone` via destructuring antes de clonar o resto).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `src/schema/sugars.ts` e o padrão "açúcar = `Prop({...fragment})`" prontos para o Plano 06-04 (`@Pre`/`@Post`) seguir o mesmo estilo, se aplicável a algum açúcar de hook.
- `PropFragment`/`NestedSchemaValue` (`src/types/schema.ts`) já modelam o contrato de aninhamento — qualquer decorator futuro que precise referenciar outra classe decorada (não só `type`/`items`) pode reutilizar `NestedSchemaValue`.
- Hidratação recursiva de defaults para classes aninhadas (`@Prop({ type: OutraClasse })`) permanece fora de escopo desta fase (decisão já registrada no 06-02-SUMMARY.md, reafirmada aqui) — só o SHAPE do schema é recursivo, não a instanciação de defaults por-insert.
- Nota de aliasing de import (Code Examples do 06-RESEARCH.md): `Optional`, `Min`, `Max`, `Enum` são nomes genéricos que podem colidir com outras libs de validação (`class-validator`, NestJS) no namespace de import do consumidor — orientação para a documentação futura: `import { Optional as MongoatOptional, Min as MongoatMin } from '@iamcalegari/mongoat'`. Não há colisão dentro do próprio barrel do Mongoat.

## Self-Check: PASSED

- Arquivos verificados em disco: src/schema/sugars.ts, test/schema/{sugars,nested-compile}.test.ts — FOUND
- Commits verificados: ebdf665, 9a9ddb3, 0645dff — FOUND
- Verificação do plano: suíte completa 152/152 verde; `npm run typecheck` exit 0; `npm run build` verde (CJS+ESM); `npm run lint` limpo; `package.json` `exports` mantém apenas `.` (D-15)

---
*Phase: 06-api-de-schema-com-decorators-tc39*
*Completed: 2026-07-13*

## Self-Check: PASSED (verified)

- FOUND: SUMMARY.md, src/schema/sugars.ts, test/schema/sugars.test.ts, test/schema/nested-compile.test.ts
- FOUND: ebdf665, 9a9ddb3, 0645dff
