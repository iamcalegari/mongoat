---
phase: 01-funda-o-core-sem-bugs-e-build-moderno
plan: 02
subsystem: build
tags: [tsdown, rolldown, dual-package, cjs, esm, attw, publint, json-schema, tsx]

requires:
  - phase: 01-funda-o-core-sem-bugs-e-build-moderno (plan 01)
    provides: "package.json migrado para manifest dual CJS/ESM (exports map, engines, scripts build/check:package/example), tooling de build instalado (tsdown, attw, publint, tsx), tsconfig target ES2023"
provides:
  - "tsdown.config.ts — bundler configurado com entry único, formatos esm+cjs, dts dual, outDir lib"
  - "Build dual funcional: lib/index.mjs, lib/index.cjs, lib/index.d.mts, lib/index.d.cts, aliases (@/*, @utils/*, @types/*) resolvidos nativamente no bundle"
  - "npm run check:package verde (publint sem erros, attw sem problemas de resolução)"
  - "json-schema removido por completo (devDependency + import) via vendorização de JSONSchema4Subset em src/types/model.ts"
  - "Consumo real comprovado: mini-projetos CJS (require) e ESM (import) instalando o tarball via npm pack"
  - "examples/ rodam via tsx sem alterações, aliases resolvidos nativamente (A3 confirmada)"
affects: [03-blindagem-testes-seguranca, ci-cd]

tech-stack:
  added: []
  patterns:
    - "Bundler (tsdown/rolldown) exige `export type { ... }` explícito para re-exports type-only — re-exports sem o modificador `type` quebram o build com MISSING_EXPORT, mesmo quando `tsc --noEmit` passa"
    - "Vendorizar subset de tipos de terceiros em vez de confiar no bundling automático quando o objetivo é zero dependência de tipos externos no .d.ts publicado"

key-files:
  created:
    - tsdown.config.ts
  modified:
    - src/index.ts
    - src/types/index.ts
    - src/types/model.ts
    - package.json

key-decisions:
  - "tsdown resolve os path aliases (@/*, @utils/*, @types/*) nativamente via tsconfig.json, sem precisar de `alias` explícito no config (Open Question 1 do RESEARCH.md respondida: não precisa)"
  - "json-schema vendorizado (não mantido como devDependency) — attw não acusava erro porque o pacote estava presente localmente em node_modules, mas o grep no .d.ts revelava o import externo; vendorizar é a validação mais robusta e elimina a dependência por completo (QUAL-04 fechado)"
  - "examples/ não precisaram de nenhuma alteração — tsx resolve aliases nativamente (A3 confirmada), então nenhuma mudança de import foi necessária"

requirements-completed: [REL-02, QUAL-04]

coverage:
  - id: D1
    description: "Build dual CJS/ESM via tsdown com aliases resolvidos no bundle"
    requirement: "REL-02"
    verification:
      - kind: other
        ref: "npx tsdown && test -f lib/index.mjs && test -f lib/index.cjs && test -f lib/index.d.mts && test -f lib/index.d.cts && ! grep -REn \"from '@/\" lib/"
        status: pass
    human_judgment: false
  - id: D2
    description: "npm run check:package (publint + attw) verde"
    requirement: "REL-02"
    verification:
      - kind: other
        ref: "npm run check:package (exit code 0, publint 'No problems found', attw todas as células verdes)"
        status: pass
    human_judgment: false
  - id: D3
    description: "json-schema fora dos tipos publicados (vendorização de JSONSchema4Subset)"
    requirement: "QUAL-04"
    verification:
      - kind: other
        ref: "grep -REn \"from 'json-schema'\" lib/ (nenhuma ocorrência) + npx tsc --noEmit"
        status: pass
    human_judgment: false
  - id: D4
    description: "Consumo real comprovado em projetos CJS (require) e ESM (import) instalando o tarball do npm pack"
    requirement: "REL-02"
    verification:
      - kind: manual_procedural
        ref: "node index.cjs (scratch/smoke-cjs) e node index.mjs (scratch/smoke-esm), ambos exit 0 imprimindo 'function function function' para Database/Model/MongoatError"
        status: pass
    human_judgment: false
  - id: D5
    description: "examples/ executam via tsx sem erro de módulo/alias"
    verification:
      - kind: manual_procedural
        ref: "npx tsx examples/connection.ts e npx tsx examples/model/usage.ts (ambos concluíram sem erro contra MongoDB real local)"
        status: pass
    human_judgment: false

duration: 30min
completed: 2026-07-07
status: complete
---

# Phase 01 Plan 02: Build dual CJS/ESM com tsdown Summary

**Build migrado de `tsc`+`tsc-alias` para `tsdown` com saída dual CJS/ESM validada por attw/publint, `json-schema` vendorizado e removido por completo, e consumo real comprovado em CJS, ESM e examples via tsx.**

## Performance

- **Duration:** ~30 min
- **Completed:** 2026-07-07T04:30:00Z
- **Tasks:** 3
- **Files modified:** 5 (`tsdown.config.ts` criado, `tsconfig.build.json` removido, `src/index.ts`, `src/types/index.ts`, `src/types/model.ts`, `package.json`)

## Accomplishments

- `tsdown.config.ts` criado (entry `src/index.ts`, formatos `esm`+`cjs`, `dts: true`, `outDir: 'lib'`) — produz `lib/index.mjs`, `lib/index.cjs`, `lib/index.d.mts`, `lib/index.d.cts` com os path aliases (`@/*`, `@utils/*`, `@types/*`) resolvidos nativamente pelo bundler, sem config extra de `alias`.
- Bug de build descoberto e corrigido: `src/index.ts` e `src/types/index.ts` re-exportavam interfaces/type-aliases (`ObjectID`, `CreateIndexProps`, `DatabaseConfig`, etc.) sem o modificador `export type`. O `tsc` tolerava isso, mas o rolldown (motor do tsdown) trata cada arquivo isoladamente e falhava com `MISSING_EXPORT` para todo re-export type-only sem o marcador explícito — bloqueava 100% do build.
- `npm run check:package` (publint + are-the-types-wrong sobre o tarball real) passa limpo: publint "No problems found", attw com todas as células verdes (node10, node16 CJS/ESM, bundler).
- `json-schema` vendorizado: mesmo com attw não acusando erro (porque o pacote ainda estava instalado localmente), o grep no `.d.ts` publicado revelava `import { JSONSchema4 } from "json-schema"` — um vazamento real que consumidores sem o pacote instalado sentiriam. Criado `JSONSchema4Subset` local em `src/types/model.ts` com o subset realmente usado (`description`, `pattern`, `enum`, `additionalProperties`), removendo o import e a devDependency por completo.
- Consumo real comprovado: tarball gerado via `npm pack`, instalado em dois mini-projetos temporários (CJS com `require`, ESM com `import`) — ambos importam `Database`, `Model`, `MongoatError` e saem com código 0.
- `examples/connection.ts` e `examples/model/usage.ts` executados via `npx tsx` sem nenhuma alteração de código — os aliases resolveram nativamente (confirma a assumption A3 do RESEARCH.md) e ambos rodaram fim-a-fim contra um MongoDB real disponível localmente (inserção, update, count).

## Task Commits

Each task was committed atomically:

1. **Task 1: Configurar tsdown e produzir build dual com aliases resolvidos** - `af9eb47` (feat)
2. **Task 2: Validar empacotamento (attw + publint) e garantir que json-schema não vaza nos tipos** - `8885a45` (feat)
3. **Task 3: Smoke de consumo CJS/ESM real e examples via tsx** - sem commit (nenhuma alteração de código necessária — ver Deviations)

## Files Created/Modified

- `tsdown.config.ts` - config do bundler: entry único, formatos esm+cjs, dts dual, outDir lib
- `tsconfig.build.json` - removido (obsoleto sob tsdown, não referenciado em nenhum script)
- `src/index.ts` - re-exports type-only marcados com `export type` (fix de build)
- `src/types/index.ts` - re-exports type-only marcados com `export type` (fix de build)
- `src/types/model.ts` - `JSONSchema4` de `json-schema` substituído por `JSONSchema4Subset` vendorizado
- `package.json` - `json-schema` removido de devDependencies (dependência morta após vendorização)

## Decisions Made

- **Aliases resolvidos nativamente pelo tsdown** — sem precisar de `alias` explícito no `tsdown.config.ts`, respondendo a Open Question 1 do RESEARCH.md.
- **json-schema vendorizado em vez de mantido como devDependency** — o gate `attw` sozinho não detectou o vazamento (porque o pacote existia localmente em `node_modules`), mas o grep explícito no `.d.ts` publicado (exigido pelo `<verify>` do Task 2) revelou `import ... from "json-schema"`. Vendorizar o subset de ~4 campos realmente usados é mais robusto que confiar no bundling automático de tipos e fecha QUAL-04 por completo (zero dependência, runtime ou tipo).
- **examples/ mantidos sem alteração** — tsx resolveu os aliases do `tsconfig.json` nativamente (confirma A3), então não houve necessidade de flags extras ou ajuste de imports.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Re-exports type-only sem `export type` quebravam 100% do build no tsdown**
- **Found during:** Task 1 (primeira execução de `npx tsdown`)
- **Issue:** `src/index.ts` e `src/types/index.ts` re-exportavam `ObjectID`, `CreateIndexProps`, `CreateModelProps`, `DatabaseConfig`, `DefaultProperties`, `DocumentDefaults`, `ModelDbValidationProps`, `ModelSetup`, `ModelValidationSchema`, `SchemaWithDefaults`, `ValidationQueryExpressions` sem o modificador `type`. O `tsc --noEmit` tolerava (faz type-checking com contexto completo do projeto), mas o rolldown processa cada arquivo isoladamente e não consegue distinguir um re-export de tipo de um de valor sem o marcador explícito — build falhava com 21 erros `MISSING_EXPORT`.
- **Fix:** `export { Database, type ObjectID } from './database'` em `src/index.ts`; `export type { ... } from './types'` para o bloco de tipos; mesmo padrão em `src/types/index.ts` para os re-exports de `./database` e `./model`.
- **Files modified:** `src/index.ts`, `src/types/index.ts`
- **Verification:** `npx tsdown` produz os 4 artefatos sem erro; `npx tsc --noEmit` continua passando.
- **Committed in:** `af9eb47` (Task 1 commit)

**2. [Rule 1 - Bug] `json-schema` ainda vazava no `.d.ts` publicado apesar de estar em devDependencies**
- **Found during:** Task 2 (grep pós-build sobre `lib/index.d.mts`/`lib/index.d.cts`)
- **Issue:** attw não reportava nenhum problema (o pacote `json-schema` estava presente em `node_modules` no momento da checagem local), mas `lib/index.d.mts` e `lib/index.d.cts` continham `import { JSONSchema4 } from "json-schema"` como import externo — um consumidor real sem `json-schema` instalado teria erro de resolução de tipo ao importar a lib.
- **Fix:** Vendorizado `JSONSchema4Subset` (campos `description`, `pattern`, `enum`, `additionalProperties`) diretamente em `src/types/model.ts`, removendo o import de `json-schema` e a entrada correspondente de `devDependencies`.
- **Files modified:** `src/types/model.ts`, `package.json`
- **Verification:** `grep -REn "from 'json-schema'" lib/` não retorna nada; `npm run check:package` continua verde; `npx tsc --noEmit` passa.
- **Committed in:** `8885a45` (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (1 blocking, 1 bug/segurança de tipos)
**Impact on plan:** Ambos os fixes eram pré-requisitos reais para os próprios critérios de aceite do plano (build funcional e zero vazamento de `json-schema`) — sem escopo além do que o plano já previa como resultado esperado.

## Issues Encountered

- O comando de verify automatizado do Task 3 (`npx tsx --tsconfig tsconfig.json -e "import('./src/index.ts').then(...)"`) não imprime saída em modo `-e` com `import()` dinâmico assíncrono (o processo tsx parece encerrar antes do microtask do `import()` resolver nesse modo de avaliação inline) — mesmo com exit code 0 e sem erro. Confirmado que não é um problema de exports: o mesmo teste rodado como arquivo `.mjs` separado (`await import('./src/index.ts')`) imprime `exports present` normalmente. A evidência real do Task 3 (exports presentes, smokes CJS/ESM, examples rodando) foi coletada por esses caminhos equivalentes.

## User Setup Required

None - nenhuma configuração de serviço externo necessária.

## Next Phase Readiness

- Build dual CJS/ESM (REL-02) e remoção de `json-schema` (QUAL-04) completos e verificados localmente — prontos para virar gate de CI na Fase 3.
- `lib/` gerado, gitignored, não versionado — consistente com `files: ["lib"]` do `package.json`.
- Wave 2 completa; próximos planos da Fase 1 (bugs QUAL-01, testes) não dependem de nada pendente deste plano.

---
*Phase: 01-funda-o-core-sem-bugs-e-build-moderno*
*Completed: 2026-07-07*
