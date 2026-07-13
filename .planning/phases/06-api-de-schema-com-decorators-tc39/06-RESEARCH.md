# Phase 6: API de schema com decorators (TC39) - Research

**Researched:** 2026-07-13
**Domain:** TypeScript 5.x TC39 stage-3 decorators aplicados a schema-as-class, compilando para `ModelValidationSchema`; cadeia de build (tsdown/Rolldown/Oxc) para essa sintaxe
**Confidence:** MEDIUM — a semântica de decorators TC39 no TypeScript é HIGH/CITED (docs oficiais); a viabilidade de BUILD via tsdown (Rolldown/Oxc) é o maior risco da fase e está documentada como gap conhecido e não resolvido nas próprias ferramentas (achado central desta pesquisa)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Declaração de tipo por campo
- **D-01:** `@Prop({ ... })` é o decorator **canônico**, aceitando o shape do `ModelValidationSchema` por campo; os demais são açúcares composáveis implementados por cima dele.
- **D-02:** Conjunto de açúcares desta fase (estendido): `@BsonType`, `@Description`, `@Pattern`, `@Optional` (do rascunho) + `@Enum`, `@Min`/`@Max`, `@MinLength`/`@MaxLength`. Casos não cobertos usam `@Prop` genérico.
- **D-03:** `bsonType` omitido = **sem restrição de tipo** (semântica JSON Schema pura — o campo entra no validator só com o que foi declarado; sem default mágico, sem erro).
- **D-04:** Campos são **required por padrão**; `@Optional()` remove da lista `required` (fiel ao rascunho). Nota técnica: campos **sem nenhum decorator ficam fora do schema compilado** — decorators TC39 só enxergam o que decoram; documentar esse comportamento.
- **D-05:** Nested/arrays: **ambos os caminhos** — classes decoradas aninhadas como caminho principal (`@Prop({ type: AddressSchema })` / `@Prop({ items: AddressSchema })`, compile recursivo) E subschema JSON Schema inline aceito no `@Prop` como escape hatch.

#### Divisão classe × config do Model
- **D-06:** `@Schema('users')` define o `collectionName` **default**; o config do Model pode omiti-lo (herda da classe) ou **sobrescrever**. `indexes`/`allowedMethods`/`documentDefaults` permanecem no config (operacional ≠ shape) — sem duplicação obrigatória.
- **D-07:** `Schema.compile` é **API pública** exportada no barrel (introspecção/debug/testes — coerente com a filosofia thin/escape-hatch).
- **D-08 (locked por DECO-04, não rediscutido):** `schema:` no config aceita classe decorada OU objeto plano, transparente.

#### Semântica de hooks (@Pre/@Post)
- **D-09:** `@Pre` aplica-se em **classe E campo**: na classe recebe o `ctx` completo (mesmo contrato do pipeline da Fase 2); no campo é açúcar que transforma **só o valor do campo** (`(value, ctx) => novoValor` — ex.: hashPassword do rascunho).
- **D-10:** `@Post` simétrico incluído nesta fase, **só no nível da classe** (post por campo não tem semântica clara).
- **D-11:** Ordem de execução determinística e documentada por método: (1) `@Pre` de campo → (2) `@Pre` de classe → (3) hooks do config do Model → (4) `.pre()`/`.post()` encadeados.

#### Instâncias e defaults de campo
- **D-12:** Inicializadores de campo viram defaults **avaliados POR INSERT** (o Model instancia a classe a cada insert para colher valores frescos) — `createdAt = new Date()` funciona naturalmente e **resolve o footgun de timestamp congelado** documentado nos guias de documentDefaults.
- **D-13:** Precedência de defaults: **doc do usuário > documentDefaults do config > inicializadores da classe** (config operacional sobrescreve declaração — mesma lógica do collectionName em D-06).

#### Erros de uso incorreto
- **D-14:** Política **híbrida**: erros locais estouram **na decoração** (ex.: `@Pre('metodoInexistente')` — stack aponta a linha da classe); erros estruturais estouram **no compile/construção do Model** (ex.: classe sem `@Schema`, classe sem campos decorados). Sempre `MongoatValidationError` com `.code` estável (Fase 3).

#### Naming e exports
- **D-15:** **Símbolo único**: `Schema` é a função-decorator E carrega `Schema.compile` estático. Todos os decorators saem do **barrel principal** (subpaths foram removidos na 1.1.0 — não reintroduzir).

#### DX do tsconfig
- **D-16:** **Guard em runtime** contra o modo legado: decorators detectam a ausência do `context.kind` TC39 (assinatura de `experimentalDecorators`) e lançam `MongoatValidationError` com mensagem apontando o fix no tsconfig + página de docs com os requisitos (TS 5.x, sem `experimentalDecorators`).

### Claude's Discretion
- Codes exatos dos novos erros (ex.: `INVALID_HOOK_METHOD`, `INVALID_DECORATED_CLASS`, `LEGACY_DECORATORS_MODE`) — nomear em consistência com o enum existente.
- Checagem de colisão de nomes genéricos no barrel (`Optional`, `Enum`, `Min`...) e orientação de aliasing de import na documentação.
- Mecânica interna do compile (metadata storage via `context.metadata`/`Symbol.metadata` vs registro próprio) — decisão do research/planner respeitando "sem reflect-metadata, sem deps novas".
- Interação do registro de models (`isSameConfig`) com classes decoradas — atenção ao WR-04 aberto do 05-REVIEW (isSameConfig ignora hooks).

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope. (Decorators de índice — ex.: `@Index` na classe — não foram discutidos nem solicitados; indexes permanecem no config por D-06. Se surgir demanda, é candidato a minor futura.)
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| DECO-01 | Dev pode definir schema via decorators TC39 padrão (`@Schema`, `@Prop`/`@BsonType`, `@Description`, `@Optional`, `@Pattern`) sem `reflect-metadata` e sem flags experimentais no tsconfig | Ver "Standard Stack", "Architecture Patterns" (padrão metadata-only decorator), "Common Pitfalls" (build tooling gap), "Code Examples" |
| DECO-02 | Dev pode registrar hooks no nível da classe via `@Pre` | Ver "Architecture Patterns" (Pattern 2 — hooks via decorator reaproveitando pipeline Fase 2), D-09/D-11 |
| DECO-03 | Classes decoradas compilam (`Schema.compile`) para o mesmo `ModelValidationSchema` da API de objetos; as duas APIs coexistem como cidadãs de primeira classe | Ver "Architecture Patterns" (Pattern 1 — class decorator agrega metadata), "Code Examples" |
| DECO-04 | Construtor do Model aceita classe decorada ou objeto plano de forma transparente | Ver "Architecture Patterns" (Pattern 4 — detecção de schema class vs objeto), integração com `isSameConfig`/WR-04 |
</phase_requirements>

## Summary

Esta fase adiciona uma segunda forma de declarar schema — decorators TC39 padrão — que compila para exatamente o mesmo `ModelValidationSchema` já usado pela API de objetos. TypeScript 5.9.3 (já pinado no projeto) implementa essa sintaxe nativamente e por padrão (sem `experimentalDecorators`, sem `reflect-metadata`) desde a 5.0, e o mecanismo oficial para "campos decoram, classe agrega" é `context.metadata`/`Symbol.metadata` (TS 5.2+) — a alternativa correta ao registro-próprio-hand-rolled, e a única forma sancionada pelo TC39 de fazer decorators de campo conversarem com o decorator de classe sem `reflect-metadata`.

O achado mais importante desta pesquisa, e o principal risco técnico da fase, **não é sobre a sintaxe de decorators em si — é sobre a cadeia de build**. O projeto builda com `tsdown` (Rolldown + Oxc). Confirmado via documentação oficial do próprio tsdown e via issue aberta no repositório do `oxc-project`: **Rolldown/Oxc ainda NÃO sabem fazer lowering (transpilar) de decorators TC39 stage-3** — o parser aceita a sintaxe, mas não há transform para ela (apenas decorators legados/`experimentalDecorators` são suportados). Como nenhum runtime JS (V8/Node incluído) executa essa sintaxe nativamente ainda, isso significa que sem uma mitigação, `npm run build` produziria um `.mjs`/`.cjs` com sintaxe de decorator ainda presente — que quebraria com `SyntaxError` em qualquer `node` que tentasse importar o pacote. A mitigação documentada (README oficial de `@rolldown/plugin-babel`) é registrar um plugin Babel (`@babel/plugin-proposal-decorators`, `version: '2023-11'`) filtrado só para os arquivos que declaram decorators, dentro de `tsdown.config.ts` — isso NÃO introduz dependência de runtime (fica em `devDependencies`, roda só em build-time) e não conflita com a constraint do projeto de "mínimo possível de dependências de runtime".

Um segundo achado de alto impacto, específico deste domínio (não coberto pela documentação de decorators): o driver `mongodb` **serializa chaves com valor `undefined` por padrão** (`ignoreUndefined` é `false` por padrão). Como toda classe TC39 com `useDefineForClassFields` (ativo por padrão em target ES2022+) define TODO campo declarado como propriedade própria — mesmo sem inicializador, valendo `undefined` — instanciar a classe decorada a cada insert (D-12) e fazer spread ingênuo (`{...new SchemaClass()}`) injetaria chaves `undefined` para todo campo sem valor, que o driver serializaria como BSON `Undefined` (tipo depreciado) em vez de omitir a chave — quebrando a validação `$jsonSchema` para required fields e/ou violando `bsonType`. A mitigação é filtrar entradas com valor `undefined` antes do merge — documentada em detalhe abaixo.

**Primary recommendation:** Implementar os decorators como **puramente coletores de metadata** via `context.metadata`/`Symbol.metadata` (com polyfill de uma linha, sem `reflect-metadata`); nenhum decorator desta fase precisa alterar o valor runtime do campo via o mecanismo de field-initializer do TC39 — inclusive `@Pre` de campo é açúcar que apenas REGISTRA um hook a ser executado pelo pipeline de hooks já existente (Fase 2), não uma transformação de inicializador. Antes de qualquer task de decorators, validar em uma spike de Wave 0 que o pipeline `tsc --noEmit` (typecheck) + `tsdown build` (com o plugin Babel) + `node` real produzem uma classe decorada funcional ponta-a-ponta — esse é o risco que mais pode invalidar o plano se descoberto tarde.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Declaração de schema via decorators (`@Schema`, `@Prop`, açúcares) | API / Library (novo módulo `src/schema/`) | — | Puramente compile-time/declarativo; roda no processo do dev-consumidor, não em um servidor separado |
| Agregação de metadata por campo → schema compilado (`Schema.compile`) | API / Library | — | Lógica pura de transformação de dados (metadata → `ModelValidationSchema`), sem I/O |
| Registro de hooks via `@Pre`/`@Post` de classe | API / Library | — | Reaproveita o pipeline de hooks existente do `Model` (mesmo tier da Fase 2) |
| Detecção classe decorada vs objeto plano no construtor do `Model` | API / Library | — | Ponto de integração único: `CreateModelProps.schema` |
| Validação server-side do schema compilado (`$jsonSchema`) | Database / Storage | API / Library | Inalterado desta fase — o compile produz o MESMO artefato que já é enviado ao MongoDB hoje |
| Build/lowering da sintaxe de decorators (tsdown/Rolldown/Oxc + Babel) | Build tooling (não é uma camada de runtime da lib) | — | Concern puramente de packaging; não existe em runtime do consumidor, mas é pré-requisito para a lib sequer rodar |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| typescript | 5.9.3 (já pinado no projeto) | Compilador — implementa decorators TC39 stage-3 nativamente, sem flags | `experimentalDecorators` default `false` já é o comportamento atual do projeto; nenhuma mudança de tsconfig necessária para "ligar" o modo TC39 [VERIFIED: npm registry — `npm view typescript version` confirma 5.9.3 já instalado] |

Nenhuma nova dependência de **runtime** é necessária — consistente com D-01..D-16 e com a constraint do projeto ("mínimo possível de dependências de runtime"). Toda a mecânica de decorators (contexto, `context.metadata`) é 100% nativa do TypeScript/JS, sem lib externa.

### Supporting (devDependencies — necessárias só para o BUILD funcionar)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@rolldown/plugin-babel` | `0.2.3` | Plugin do Rolldown (usado internamente pelo tsdown) que roda Babel sobre arquivos específicos antes do bundling | Registrado em `tsdown.config.ts`, filtrado (`include`) só para os arquivos de `src/schema/**` que declaram decorators [CITED: npm README oficial `@rolldown/plugin-babel`] |
| `@babel/core` | `^7.29.0` (`7.29.7` verificado) | Motor de transformação exigido como peer pelo plugin acima | Só em build-time; `@babel/core@8.0.1` (latest) também satisfaz o peer (`^7.29.0 \|\| ^8.0.0-rc.1`), mas a linha 7.x é a opção mais madura/testada [VERIFIED: npm registry] |
| `@babel/plugin-proposal-decorators` | `^7.29.0` (`7.29.7` verificado) | Plugin Babel que faz o lowering real da sintaxe de decorators stage-3 (`version: '2023-11'`) para JS puro | Config: `{ plugins: [['@babel/plugin-proposal-decorators', { version: '2023-11' }]] }` [CITED: babeljs.io docs oficiais — "2023-11" é a versão recomendada atual da proposta] |
| `@types/babel__core` | latest | Tipos para `@babel/core` ao configurar o plugin em TS (`tsdown.config.ts`) | Só devDependency, exigida pelo próprio README do `@rolldown/plugin-babel` quando o projeto usa TypeScript |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `context.metadata`/`Symbol.metadata` (TC39 oficial) | Registro próprio (módulo-level accumulator array, sem Symbol.metadata) | Evitaria o polyfill de `Symbol.metadata` e a entrada de `lib` no tsconfig, mas é uma reimplementação hand-rolled de exatamente o problema que o TC39 já resolveu (propagar dados de decorators de campo para o decorator de classe); mais frágil e não documentável como "padrão" |
| `@rolldown/plugin-babel` + Babel para lowering | Trocar o bundler de build (ex.: voltar para `tsup`/esbuild puro) | esbuild suporta decorators stage-3 desde a v0.21 nativamente (sem Babel) — mas trocar de `tsdown` para outro bundler é uma mudança de build tooling MUITO maior que o escopo desta fase (REL-02/Fase 1 já fixou tsdown); manter tsdown + plugin cirúrgico é a opção aditiva mínima |
| `@babel/plugin-proposal-decorators` versão `'2023-11'` | versão `'legacy'` do plugin Babel | `'legacy'` implementa a proposta stage-1 antiga (equivalente a `experimentalDecorators`) — incompatível com o que o TypeScript 5.x emite por padrão; a doc do Babel alerta explicitamente sobre discrepâncias entre Babel e TypeScript no modo legacy |

**Installation:**
```bash
npm install -D @rolldown/plugin-babel@0.2.3 @babel/core@^7.29.0 @babel/plugin-proposal-decorators@^7.29.0 @types/babel__core
```

**Version verification:** Confirmado via `npm view <pkg> version` no momento desta pesquisa (2026-07-13):
- `@rolldown/plugin-babel` → `0.2.3` (publicado 2026-04-13, ~2.3M downloads/semana)
- `@babel/core` → `7.29.7` na linha 7.x (`8.0.1` é a `latest` tag, Babel 8 já é GA)
- `@babel/plugin-proposal-decorators` → `7.29.7` na linha 7.x (`8.0.2` é a `latest` tag)
- `@types/babel__core` → mantido atualizado via DefinitelyTyped

## Package Legitimacy Audit

| Package | Registry | Age (versão pinada) | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|----------------------|-----------|--------------|---------|-------------|
| `@rolldown/plugin-babel` | npm | publicado 2026-04-13 | ~2.33M/semana | github.com/rolldown/plugins | OK | Aprovado |
| `@babel/core` | npm | versão 7.29.7 publicada 2026-06-17 | ~132.5M/semana | github.com/babel/babel | SUS ("too-new") | Flagged — planner deve inserir `checkpoint:human-verify` antes do install |
| `@babel/plugin-proposal-decorators` | npm | versão 7.29.7 publicada 2026-06-18 | ~16.8M/semana | github.com/babel/babel | SUS ("too-new") | Flagged — planner deve inserir `checkpoint:human-verify` antes do install |
| `@types/babel__core` | npm | publicado 2023-11-20 | ~91.4M/semana | github.com/DefinitelyTyped/DefinitelyTyped | OK | Aprovado |

**Packages removed due to [SLOP] verdict:** nenhum.
**Packages flagged as suspicious [SUS]:** `@babel/core`, `@babel/plugin-proposal-decorators` — ambos flagados exclusivamente pelo sinal "too-new" (a *versão pinada* foi publicada há poucas semanas), não por sinais de nome/pacote suspeito. Ambos são pacotes do monorepo oficial `babel/babel`, com dezenas de milhões de downloads semanais e mais de uma década de histórico — o "too-new" reflete apenas o ciclo de release recente da 7.29.x, não risco de slopsquatting. Ainda assim, seguindo o protocolo, o planner deve gatear a instalação com `checkpoint:human-verify` (confirmar que a versão pinada corresponde ao changelog oficial do Babel antes de rodar `npm install`).

*Nomes de pacote descobertos via WebFetch do README oficial do `@rolldown/plugin-babel` (não apenas WebSearch genérico) e via docs oficiais do Babel — tratados como `[CITED: fonte oficial]` em vez de `[ASSUMED]`, mas a instalação real segue exigindo o checkpoint acima por causa do verdict SUS.*

## Architecture Patterns

### System Architecture Diagram

```text
                     ┌─────────────────────────────────────────────┐
                     │        Dev autora uma classe TS             │
                     │  @Schema('users')                           │
                     │  class UserSchema {                         │
                     │    @Prop({bsonType:'string'}) username: str  │
                     │    @Pre('insert', hashPassword) password: str│
                     │    @Optional() gender?: string               │
                     │  }                                           │
                     └───────────────┬───────────────────────────────┘
                                      │ (1) decorators de CAMPO aplicam
                                      │     primeiro (ordem textual),
                                      │     cada um grava em
                                      │     context.metadata[campo]
                                      ▼
                     ┌─────────────────────────────────────────────┐
                     │   context.metadata (objeto compartilhado     │
                     │   entre TODOS os decorators desta classe)    │
                     │   { properties: {...}, required: [...],      │
                     │     fieldPreHooks: [...], classPreHooks: []} │
                     └───────────────┬───────────────────────────────┘
                                      │ (2) decorator de CLASSE roda
                                      │     por último (@Schema),
                                      │     lê o metadata acumulado
                                      ▼
                     ┌─────────────────────────────────────────────┐
                     │  UserSchema[Symbol.metadata] fica disponível │
                     │  (marker interno + collectionName default)   │
                     └───────────────┬───────────────────────────────┘
                                      │ (3) dev usa a classe como
                                      │     `schema:` no construtor
                                      │     do Model — OU chama
                                      │     Schema.compile(UserSchema)
                                      │     diretamente (API pública)
                                      ▼
                     ┌─────────────────────────────────────────────┐
                     │   new Model({ schema: UserSchema, ... })     │
                     │   → detecta: typeof schema === 'function'    │
                     │     e tem o marker interno → é uma classe     │
                     │     decorada, não objeto plano (D-08)        │
                     │   → Schema.compile(schema) → ModelValidation-│
                     │     Schema (MESMO shape que a API de objetos)│
                     │   → extrai hooks decorados (campo+classe)    │
                     │     → this.hooks[method].pre ANTES de        │
                     │       props.hooks/config (D-11)              │
                     └───────────────┬───────────────────────────────┘
                                      │ (4) fluxo IDÊNTICO ao já      │
                                      │     existente — mesmo         │
                                      │     schemaValidatorBuilder,   │
                                      │     mesmo pipeline de hooks   │
                                      ▼
                     ┌─────────────────────────────────────────────┐
                     │   MongoDB $jsonSchema validator (inalterado) │
                     └─────────────────────────────────────────────┘

  Fluxo de INSERT com schema decorado (D-12/D-13):
  Model.insert(userDoc)
    → new UserSchema()                 // instancia fresca por insert
    → filtra chaves com valor undefined (campos sem initializer!)
    → merge: {...classInstanceDefaults, ...documentDefaults(config), ...userDoc}
    → segue o MESMO caminho de sempre (pre-hooks → driver → post-hooks)
```

### Recommended Project Structure
```
src/
├── schema/
│   ├── index.ts          # barrel do módulo: Schema, Prop, Pre, Post, açúcares
│   ├── polyfill.ts        # side-effect: Symbol.metadata ??= Symbol('Symbol.metadata')
│   ├── decorators.ts      # implementação de @Schema, @Prop, @Pre, @Post
│   ├── sugars.ts          # @BsonType, @Description, @Pattern, @Optional, @Enum, @Min/@Max, @MinLength/@MaxLength (compõem @Prop)
│   ├── compile.ts         # Schema.compile(cls) → ModelValidationSchema; extractDecoratorHooks(cls) (interno)
│   └── guards.ts          # detecção de modo legado (D-16), marker de "é classe decorada" (D-08)
├── model/index.ts         # (alterado) detecção schema class vs objeto no construtor; merge com defaults filtrando undefined
└── types/
    └── schema.ts           # tipos: SchemaClass<T>, contexto interno de metadata
```

### Pattern 1: `@Schema`/`@Prop` como decorators PURAMENTE de metadata (não transformam valor de campo)
**What:** Nenhum decorator desta fase precisa retornar um novo inicializador para o campo (o mecanismo TC39 de field-decorator-retorna-`(value)=>novoValor`). Todos apenas escrevem em `context.metadata` — mesmo `@Pre` de campo, que NÃO transforma o campo no momento da instanciação; ele registra uma função de hook a ser executada pelo pipeline de hooks já existente no `insert()`.
**When to use:** Sempre, nesta fase — mantém o design simples e evita edge cases do mecanismo de field-initializer (ordem de aplicação, interação com `@Optional`, etc.).
**Example:**
```typescript
// src/schema/decorators.ts
// Baseado no mecanismo oficial documentado em
// https://www.typescriptlang.org/docs/handbook/release-notes/typescript-5-2.html
import './polyfill'; // garante Symbol.metadata antes de qualquer decorator rodar

interface FieldMeta {
  properties: Record<string, unknown>;
  required: string[];
  fieldPreHooks: { field: string; method: string; fn: Function }[];
  classPreHooks: { method: string; fn: Function }[];
}

function getOrInitMeta(metadata: Record<PropertyKey, unknown>): FieldMeta {
  const key = 'mongoat:schema';
  if (!metadata[key]) {
    metadata[key] = {
      properties: {},
      required: [],
      fieldPreHooks: [],
      classPreHooks: [],
    } satisfies FieldMeta;
  }
  return metadata[key] as FieldMeta;
}

export function Prop(fragment: Record<string, unknown>) {
  return function (_value: undefined, context: ClassFieldDecoratorContext) {
    assertStandardDecoratorMode(context); // D-16
    const meta = getOrInitMeta(context.metadata);
    meta.properties[String(context.name)] = fragment;
    meta.required.push(String(context.name)); // D-04: required por padrão
    // retorna void — não altera o valor/inicializador do campo
  };
}
```

### Pattern 2: `@Schema` (class decorator) roda por ÚLTIMO e agrega tudo
**What:** Decorators de classe sempre executam depois de TODOS os decorators de membro daquela classe (garantia da especificação TC39, não uma escolha de implementação) — por isso `@Schema` pode ler com segurança o `context.metadata` totalmente populado por `@Prop`/`@Pre`/açúcares.
**When to use:** Ponto único de "fechamento" do schema — grava o `collectionName` default (D-06) e marca a classe com um símbolo interno (`kMongoatSchemaClass`) para detecção posterior no `Model` (D-08).
**Example:**
```typescript
// src/schema/decorators.ts
const kMongoatSchemaClass = Symbol('kMongoatSchemaClass');

export function Schema(collectionName?: string) {
  return function (value: Function, context: ClassDecoratorContext) {
    assertStandardDecoratorMode(context); // D-16

    const meta = getOrInitMeta(context.metadata);

    if (Object.keys(meta.properties).length === 0) {
      // D-14: erro ESTRUTURAL — mas note-se que aqui ainda estamos na
      // fase de DECORAÇÃO da classe (@Schema roda ao definir a classe,
      // não ao construir o Model) — então mesmo esse "erro estrutural"
      // já pode ser lançado neste ponto, não precisa esperar o compile.
      throw new MongoatValidationError(
        'Classe decorada com @Schema não tem nenhum campo decorado com @Prop/açúcares',
        { code: 'INVALID_DECORATED_CLASS' }
      );
    }

    (value as unknown as Record<symbol, unknown>)[kMongoatSchemaClass] = {
      collectionName,
    };
    // value NÃO é substituído — mutação direta é suficiente; decorators de
    // classe podem retornar void para manter a classe original.
  };
}

Schema.compile = function compile(cls: Function): ModelValidationSchema {
  const meta = (cls as unknown as { [Symbol.metadata]?: Record<PropertyKey, unknown> })[
    Symbol.metadata
  ]?.['mongoat:schema'] as FieldMeta | undefined;

  if (!meta) {
    throw new MongoatValidationError(
      'Classe não decorada com @Schema — Schema.compile só aceita classes decoradas',
      { code: 'INVALID_DECORATED_CLASS' }
    );
  }

  return {
    bsonType: 'object',
    properties: meta.properties,
    required: meta.required,
  } as ModelValidationSchema;
};
```

### Pattern 3: Guard de modo legado (D-16) — checar `context.kind`
**What:** Com `experimentalDecorators: true`, a função-decorator é chamada com `(target, propertyKey, descriptor)` — NUNCA um objeto de contexto com `.kind`. A checagem oficial (documentada em múltiplas fontes independentes) é `typeof context === 'object' && 'kind' in context`.
**When to use:** Primeira linha de TODO decorator exportado (`@Schema`, `@Prop`, `@Pre`, açúcares) — falha alto e cedo em vez de produzir um schema vazio/quebrado silenciosamente.
**Example:**
```typescript
// src/schema/guards.ts
export function assertStandardDecoratorMode(context: unknown): void {
  const isStandardMode =
    !!context && typeof context === 'object' && 'kind' in (context as object);

  if (!isStandardMode) {
    throw new MongoatValidationError(
      'Decorator usado em modo legado (experimentalDecorators) — remova ' +
        '"experimentalDecorators" do tsconfig.json. Mongoat só suporta ' +
        'decorators TC39 padrão (TypeScript 5.x). Veja: <link para docs>',
      { code: 'LEGACY_DECORATORS_MODE' }
    );
  }
}
```

### Pattern 4: Detecção classe-decorada vs objeto-plano no `Model` (D-08)
**What:** `CreateModelProps.schema` passa a aceitar `ModelValidationSchema | SchemaClass<T>`. A distinção é: uma classe decorada é uma `function` que carrega o marker interno gravado pelo Pattern 2; um objeto plano tem `bsonType` diretamente.
**When to use:** No construtor do `Model`, ANTES de `schemaValidatorBuilder` (que continua recebendo só `ModelValidationSchema`, sem saber nada sobre decorators).
**Example:**
```typescript
// src/model/index.ts (trecho do constructor)
const isDecoratedSchemaClass = typeof schema === 'function';

const resolvedSchema = isDecoratedSchemaClass
  ? Schema.compile(schema as Function)
  : (schema as ModelValidationSchema);

const resolvedCollectionName =
  collectionName ??
  (isDecoratedSchemaClass ? getDefaultCollectionName(schema as Function) : undefined);

if (!resolvedCollectionName) {
  throw new MongoatValidationError(
    'collectionName é obrigatório — forneça no config do Model ou via @Schema("nome")',
    { code: 'VALIDATION_FAILED' }
  );
}
```

### Pattern 5: Defaults por-insert filtrando `undefined` (D-12/D-13 + pitfall do driver)
**What:** Instanciar a classe decorada a cada insert dá os inicializadores "frescos", mas TODO campo declarado sem valor vira propriedade própria com valor `undefined` (semântica `useDefineForClassFields`, ativa por padrão em target ES2022+). Sem filtrar, esses `undefined` seriam serializados pelo driver (que NÃO ignora `undefined` por padrão) como BSON `Undefined`.
**When to use:** No ponto de merge de defaults do `insert()`/`insertMany()`/`bulkWrite()`, só quando o `Model` foi construído com uma classe decorada.
**Example:**
```typescript
// src/model/index.ts — nova função auxiliar
function ownDefinedProperties(instance: object): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(instance).filter(([, value]) => value !== undefined)
  );
}

// dentro de insert():
const classDefaults = this.schemaClass
  ? ownDefinedProperties(new (this.schemaClass as new () => object)())
  : {};

const mergedDocument = {
  ...classDefaults, // D-12/D-13: menor precedência
  ...cloneDocumentDefaults(this.documentDefaults),
  ...document, // doc do usuário: maior precedência
} as OptionalUnlessRequiredId<ModelType>;
```

### Anti-Patterns to Avoid
- **Usar `reflect-metadata` ou `emitDecoratorMetadata`:** viola DECO-01 explicitamente e adiciona uma dependência de runtime pesada (proibida pela constraint do projeto) — `context.metadata`/`Symbol.metadata` resolve o MESMO problema (propagar dados entre decorators) sem essa dependência.
- **Retornar um novo inicializador de campo do TC39 para implementar `@Pre` de campo:** desnecessário — o hook já é executado pelo pipeline existente (Fase 2); usar o mecanismo de field-initializer criaria DOIS caminhos de transformação de valor divergentes (um no momento da instanciação da classe, outro no pipeline de hooks), violando D-11 (ordem determinística).
- **Assumir que o build atual (`tsdown`) já suporta a sintaxe sem mudança nenhuma:** confirmado que NÃO suporta (ver Common Pitfalls) — qualquer plano que não inclua a mitigação do bundler vai falhar silenciosamente até a primeira tentativa real de `npm run build` + `node lib/index.cjs`.
- **Spread ingênuo de uma instância de classe decorada em um documento a inserir:** injeta chaves `undefined` que o driver serializa (ver Pattern 5 e Common Pitfalls).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Propagar dados de decorators de campo para o decorator de classe | Um accumulator global module-level (array "corrente" resetado a cada `@Schema`) | `context.metadata`/`Symbol.metadata` (TC39 oficial, TS 5.2+) | É exatamente o mecanismo desenhado pelo TC39 para este problema; hand-rolled quebra com decorators aninhados/reentrância e não é o "padrão" que DECO-01 pede |
| Detectar modo legado de decorators | Inspecionar `arguments.length` ou heurísticas de tipo do 1º argumento | Checar `typeof context === 'object' && 'kind' in context` no 2º argumento | É a checagem documentada e usada na comunidade (múltiplas fontes independentes convergem na mesma checagem) |
| Lowering de decorators stage-3 para JS executável | Escrever um transform AST próprio (via oxc-parser ou babel puro, sem o plugin) | `@rolldown/plugin-babel` + `@babel/plugin-proposal-decorators` dentro do `tsdown.config.ts` | Reimplementar um transform de decorators é uma sub-tarefa de compilador — enorme superfície de bugs; o plugin oficial já resolve isso e é mantido pelo próprio time do Rolldown |

**Key insight:** Tudo nesta fase que PARECE precisar de metaprogramação pesada (reflection, transforms customizados) já tem um mecanismo oficial e nativo do TC39/TypeScript — a única peça realmente "artesanal" e sem solução pronta é o lowering de build, e mesmo essa tem um plugin oficial mantido pelo mesmo time do bundler já em uso.

## Common Pitfalls

### Pitfall 1: tsdown/Rolldown/Oxc não fazem lowering de decorators TC39 stage-3
**What goes wrong:** `npm run build` produz `lib/index.mjs`/`lib/index.cjs` com a sintaxe `@Decorator` ainda presente (Oxc só faz *parse*, não *transform*, dessa sintaxe). Qualquer `node` que tentar `require`/`import` o pacote publicado recebe `SyntaxError: Unexpected token '@'` (ou similar) — o pacote fica literalmente quebrado em produção mesmo que `tsc --noEmit` (usado só para typecheck) passe sem erro.
**Why it happens:** O time do `oxc-project` decidiu deliberadamente adiar a implementação do transform de decorators stage-3 (não é falta de suporte a decorators em geral — decorators legados/`experimentalDecorators` E emissão de metadata JÁ são suportados; só o stage-3 "novo" falta) por instabilidade histórica da proposta e custo de manutenção. Situação confirmada em issue aberta no repo `oxc-project/oxc` (nenhuma indicação de resolução até o momento desta pesquisa).
**How to avoid:** Registrar `@rolldown/plugin-babel` com `@babel/plugin-proposal-decorators` (`version: '2023-11'`) em `tsdown.config.ts`, com `include`/filtro restrito aos arquivos de `src/schema/**` (evita rodar Babel sobre o resto do codebase, que não usa decorators). Task de Wave 0 obrigatória: escrever uma classe decorada mínima, rodar `npm run build` de verdade, e `node -e "require('./lib/index.cjs')"` (e o equivalente ESM) para confirmar que builda E roda antes de investir nas demais tasks da fase.
**Warning signs:** `tsc --noEmit` passa mas `npm run build` gera um arquivo que, ao ser executado com `node`, lança `SyntaxError`; ou o build "passa" silenciosamente mas o comportamento do decorator em runtime não bate com o esperado pelo typecheck (sinal de que o Babel e o TypeScript divergem sutilmente na proposta implementada — mitigado ao fixar `version: '2023-11'`, a versão atual da proposta, evitando o modo `'legacy'` que a própria doc do Babel alerta ser divergente do TS).

### Pitfall 2: `Symbol.metadata` não existe em nenhum runtime atual — precisa de polyfill
**What goes wrong:** Sem polyfill, `context.metadata` chega como `undefined` em todo decorator (porque o TypeScript compilado usa `Symbol.metadata` como chave, e se o símbolo não existir o valor vira `void 0`) — qualquer tentativa de escrever em `context.metadata[chave]` lança `TypeError: Cannot set properties of undefined`.
**Why it happens:** `Symbol.metadata` é ele mesmo uma proposta TC39 separada (decorator metadata), ainda não implementada nativamente por V8/Node em nenhuma versão suportada pelo projeto (`^20.19.0 || >=22.12.0`).
**How to avoid:** Um polyfill de uma linha (`(Symbol as any).metadata ??= Symbol('Symbol.metadata')`) como side-effect import no topo do módulo `src/schema/index.ts` — garante que, por ordem de avaliação de módulos ESM/CJS, o polyfill roda antes de qualquer decorator (`Prop`, `Schema`, etc.) ser sequer importado pelo código do consumidor.
**Warning signs:** `TypeError` mencionando `Symbol.metadata` ou "Cannot set properties of undefined (setting '...')" nos primeiros testes de decorator.

### Pitfall 3: Instanciar a classe decorada a cada insert injeta chaves `undefined`
**What goes wrong:** `new SchemaClass()` define TODO campo declarado como propriedade própria — mesmo sem inicializador — valendo `undefined`. Um spread ingênuo (`{...new SchemaClass(), ...userDoc}`) injeta essas chaves no documento; o driver `mongodb` NÃO ignora `undefined` por padrão (`ignoreUndefined: false` é o default) e serializa como BSON `Undefined`, o que tende a violar `bsonType`/`required` do `$jsonSchema` de forma confusa (o campo "está lá" mas com um tipo BSON depreciado que não bate com nenhum `bsonType` declarado).
**Why it happens:** Semântica de `useDefineForClassFields` (ativa por padrão em target ES2022+, que já é o target do projeto) — todo campo de classe é `[[DefineOwnProperty]]`, não `[[Set]]` condicional.
**How to avoid:** Filtrar `Object.entries(instance).filter(([, v]) => v !== undefined)` antes de usar a instância como camada de defaults (ver Pattern 5). Escrever teste de integração (contra Mongo real, via testcontainers) inserindo um documento onde um campo `required` não tem inicializador nem é fornecido pelo usuário — deve falhar por `required`, não por `bsonType`/serialização confusa.
**Warning signs:** Erro de validação do MongoDB mencionando um campo que o dev não esperava estar presente no documento; ou testes de `$jsonSchema` falhando com uma mensagem de tipo em vez de "required" para um campo opcional-por-omissão.

### Pitfall 4: `isSameConfig` (WR-04 aberto) ignora hooks — agora mais perigoso com decorators
**What goes wrong:** Uma classe decorada com `@Pre` de classe/campo, ao ser usada para re-registrar um `collectionName` já existente com schema/validator idêntico, tem seus hooks descartados em silêncio pelo caminho de early-return do `isSameConfig` (que hoje só compara `allowedMethods`/`validator`/`documentDefaults`/`indexes` — não `hooks`). Isso já era um warning aberto (WR-04, `05-REVIEW.md`) para a API de objetos, mas decorators tornam esse cenário MUITO mais comum (é natural declarar `@Pre` diretamente na classe de schema, então toda re-importação do mesmo model corre esse risco).
**Why it happens:** Funções não são comparáveis estruturalmente por `JSON.stringify` (usado pelo resto do `isSameConfig`) — a comparação foi deliberadamente escopada para excluir hooks até agora.
**How to avoid:** Esta fase é o momento natural para fechar WR-04 junto (mesmo escopo de código: o construtor do `Model` já precisa mexer na extração de hooks decorados) — lançar `MongoatValidationError(MODEL_CONFIG_CONFLICT)` quando a config candidata (decorador OU `props.hooks`) declara hooks e já existe uma instância registrada, em vez de descartar silenciosamente.
**Warning signs:** Um hook de segurança (ex.: hash de senha via `@Pre('insert', hashPassword)` no campo) simplesmente não dispara e nenhum erro é lançado — o pior tipo de bug (mascarado, relacionado a segurança).

## Code Examples

### Colisão de nomes genéricos no barrel — orientação de aliasing
```typescript
// Sugars como @Optional, @Min, @Max, @Enum são nomes comuns em bibliotecas
// de validação (class-validator, NestJS). Documentar este padrão de import:
import { Optional as MongoatOptional, Min as MongoatMin } from '@iamcalegari/mongoat';
```
Não há colisão dentro do PRÓPRIO barrel do Mongoat (`Schema` decorator e o tipo já
existente `SchemaWithDefaults` são identificadores distintos) — o risco é só
de colisão no NAMESPACE DE IMPORT do consumidor, se ele também usa outra lib
de decorators no mesmo arquivo.

### Guard de modo legado — teste de regressão recomendado
```typescript
// Simula o modo legado chamando o decorator manualmente com a assinatura antiga
it('lança LEGACY_DECORATORS_MODE quando context não tem .kind', () => {
  expect(() => Prop({ bsonType: 'string' })(undefined as never, {} as never)).not.toThrow();
  // ^ contexto vazio {} ainda "parece" um objeto sem 'kind' -> deve lançar
  expect(() =>
    Prop({ bsonType: 'string' })('target' as never, 'propertyKey' as never)
  ).toThrow(/LEGACY_DECORATORS_MODE/);
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| `experimentalDecorators` + `reflect-metadata` (padrão de libs como TypeORM/NestJS legado) | Decorators TC39 stage-3 nativos + `context.metadata`/`Symbol.metadata` | TypeScript 5.0 (mar/2023) ligou stage-3 por padrão; TS 5.2 (ago/2023) adicionou `context.metadata` | Elimina a dependência pesada `reflect-metadata` e o flag experimental — exatamente o que DECO-01 exige |
| esbuild/tsup builds com decorators "só funcionavam" | Rolldown/Oxc (usado por tsdown) ainda não fazem lowering de stage-3 — regressão temporária na cadeia de ferramentas | esbuild suporta desde 0.21 (mai/2024); Oxc ainda não, a partir da adoção do Rolldown pelo tsdown | Precisa do plugin Babel como ponte até o Oxc implementar (sem previsão) |

**Deprecado/desatualizado:**
- `reflect-metadata` + `emitDecoratorMetadata`: mecanismo do modo legado; não deve ser usado nem mencionado como dependência desta lib (D-01/DECO-01 são explícitos sobre isso).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | A versão `'2023-11'` do `@babel/plugin-proposal-decorators` produz um lowering runtime-compatível com o que o `tsc`/tipo-checker do TypeScript 5.9.3 assume (sem discrepâncias de comportamento observável) | Standard Stack, Common Pitfalls (Pitfall 1) | Se houver discrepância sutil, o build passa mas o comportamento de um decorator em runtime (ex.: ordem de `addInitializer`, semântica exata de metadata) diverge do que os tipos do TypeScript garantem — só descoberto em teste de integração real; mitigado pela task de Wave 0 recomendada |
| A2 | Nenhuma versão do Node.js no range suportado (`^20.19.0 \|\| >=22.12.0`) implementa `Symbol.metadata` nativamente | Common Pitfalls (Pitfall 2), Architecture Pattern 3 | Se alguma versão já suportar nativamente, o polyfill (`??=`) é inofensivo (no-op) — risco baixo mesmo se a assunção estiver errada |
| A3 | A checagem `typeof context === 'object' && 'kind' in context` cobre 100% dos casos de modo legado (não há um cenário onde `experimentalDecorators` produza um 2º argumento parecido com um contexto TC39) | Architecture Pattern 3 (D-16) | Se houver um caso não coberto, o guard de D-16 não dispara e o dev recebe um erro genérico mais tarde (schema vazio/malformado) em vez de uma mensagem clara — degrada UX do erro, mas não corrompe dados |

**Se esta tabela estivesse vazia:** não está — as três entradas acima concentram o risco residual desta pesquisa; nenhuma envolve política de negócio/segurança, só comportamento de toolchain, e todas têm mitigação de teste recomendada.

## Open Questions

1. **Hidratação de defaults (D-12) recursa em classes decoradas ANINHADAS?**
   - What we know: D-12 é claro para campos de TOPO da classe principal (o `Model` instancia a classe raiz a cada insert).
   - What's unclear: Se `@Prop({ type: AddressSchema })` referencia outra classe decorada (D-05, nested), CONTEXT.md não decide explicitamente se o Model também deve instanciar `AddressSchema` recursivamente para colher inicializadores aninhados, ou se isso fica fora de escopo desta fase (só o `compile` recursivo do SHAPE do schema é decidido, não a hidratação recursiva de defaults).
   - Recommendation: Escopar esta fase (MVP) para hidratação de defaults **só no nível raiz**; documentar explicitamente que campos aninhados decorados não recebem inicializadores de instância automaticamente (o dev pode usar `documentDefaults` do config para isso, caminho já existente). Levantar como candidato de minor futura se houver demanda.

2. **O que acontece se o mesmo `collectionName` for registrado uma vez via classe decorada e outra via objeto plano equivalente?**
   - What we know: DECO-03 exige que ambas as APIs produzam o MESMO `ModelValidationSchema` — então `isSameConfig` (comparação estrutural via `stableStringify`) deveria considerá-los idênticos se o schema compilado bater bit-a-bit.
   - What's unclear: Se há alguma diferença sutil de serialização entre um objeto escrito à mão e um objeto produzido por `Schema.compile` (ex.: ordem de chaves, campos extras) que faria `stableStringify` divergir mesmo com shapes "logicamente" iguais.
   - Recommendation: Task de teste de equivalência dedicada (já antecipada em `code_context` do CONTEXT.md — "testes de equivalência DECO-03") comparando `Schema.compile(ClasseDecorada)` com o objeto plano escrito à mão para o MESMO schema, byte-a-byte via `stableStringify`.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Runtime da lib e dos testes | ✓ | v22.22.2 (dentro do range `^20.19.0 \|\| >=22.12.0`) | — |
| TypeScript | Decorators TC39 nativos, typecheck | ✓ | 5.9.3 | — |
| tsdown (Rolldown/Oxc) | Build de produção | ✓ (mas SEM suporte a lowering de decorators stage-3 — ver Pitfall 1) | tsdown 0.22.3 / rolldown 1.1.4 | `@rolldown/plugin-babel` + `@babel/plugin-proposal-decorators` (ver Standard Stack) |
| Vite/Vitest (esbuild) | Suíte de testes | ✓ | vite 8.1.3 / esbuild 0.28.1 (esbuild JÁ suporta decorators stage-3 nativamente desde 0.21) | — (nenhum fallback necessário para os testes — só o BUILD de produção precisa do plugin Babel) |
| MongoDB (via testcontainers) | Testes de integração (validação `$jsonSchema`, pitfall de `undefined`) | ✓ (infra já existente da Fase 3) | — | — |

**Missing dependencies with no fallback:**
- Nenhuma — o único gap real (lowering de decorators no build de produção) já tem fallback identificado e verificado (plugin Babel oficial).

**Missing dependencies with fallback:**
- Suporte a decorators stage-3 no tsdown/Rolldown/Oxc → fallback: `@rolldown/plugin-babel` + `@babel/plugin-proposal-decorators` (`version: '2023-11'`), filtrado a `src/schema/**`.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest ^4.1.10 (já configurado) |
| Config file | `vitest.config.ts` (aliases via `vite-tsconfig-paths`, backend Mongo real via testcontainers) |
| Quick run command | `npm test -- test/schema` (uma vez criado o diretório) |
| Full suite command | `npm test` (`vitest run`) |

### Phase Requirement → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| DECO-01 | Classe decorada com `@Schema`/`@Prop`/açúcares compila sem `reflect-metadata` nem flags experimentais | unit | `vitest run test/schema/decorators-basic.test.ts` | ❌ Wave 0 |
| DECO-01 | Guard de modo legado lança `LEGACY_DECORATORS_MODE` quando `context.kind` ausente | unit | `vitest run test/schema/legacy-mode-guard.test.ts` | ❌ Wave 0 |
| DECO-01 | Build real (`tsdown`) + execução em `node` real de uma classe decorada mínima (spike de bundler) | integration/smoke | script ad-hoc (`npm run build && node -e "require('./lib/index.cjs')"`) — não é um teste vitest, é uma verificação de pipeline | ❌ Wave 0 — CRÍTICO, ver Pitfall 1 |
| DECO-02 | Hooks `@Pre` de campo e de classe disparam na ordem D-11 (campo → classe → config → chainable) | integration (Mongo real) | `vitest run test/schema/hooks-decorator-order.test.ts` | ❌ Wave 0 |
| DECO-03 | `Schema.compile(Classe)` produz `ModelValidationSchema` byte-a-byte igual ao objeto plano equivalente | unit | `vitest run test/schema/compile-equivalence.test.ts` | ❌ Wave 0 |
| DECO-03 | Model construído com classe decorada valida/rejeita documentos exatamente como o equivalente via objeto plano, contra MongoDB real | integration (Mongo real) | `vitest run test/schema/decorated-vs-plain-parity.test.ts` | ❌ Wave 0 |
| DECO-04 | Construtor do `Model` aceita classe decorada OU objeto plano de forma transparente (mesmo `collectionName`, mesma config) | unit | `vitest run test/model/schema-class-or-plain.test.ts` | ❌ Wave 0 |
| DECO-04 + Pitfall 3 | Insert com schema decorado não injeta campos `undefined`; `createdAt = new Date()` é fresco por insert (D-12) | integration (Mongo real) | `vitest run test/schema/per-insert-defaults.test.ts` | ❌ Wave 0 |
| WR-04 (follow-up) | Re-registro do mesmo `collectionName` com hooks divergentes (via decorator OU `props.hooks`) falha alto, não é descartado em silêncio | unit | `vitest run test/model/registry-config.test.ts` (estender o já existente) | parcial — arquivo existe, cobertura de hooks precisa ser adicionada |

### Sampling Rate
- **Per task commit:** `npm test -- test/schema` (ou o subconjunto relevante)
- **Per wave merge:** `npm test` (suíte completa) + `npm run typecheck` + `npm run build` seguido do smoke-test manual de `require`/`import` real (não coberto por vitest)
- **Phase gate:** Suíte completa verde + `npm run check:package` (`attw`) confirmando que os novos exports (`Schema`, `Prop`, `Pre`, `Post`, açúcares) não quebram o dual CJS/ESM

### Wave 0 Gaps
- [ ] `test/schema/` — diretório novo, ainda não existe
- [ ] `src/schema/polyfill.ts` — side-effect `Symbol.metadata` polyfill, precisa existir antes de qualquer decorator
- [ ] `tsdown.config.ts` — ainda não existe no repo (build hoje roda com config default do tsdown) — precisa ser criado para registrar o plugin Babel
- [ ] Spike de bundler (não-vitest): validar `npm run build` + execução real em `node` de uma classe decorada mínima ANTES de qualquer outra task da fase — este é o gap que mais pode invalidar o plano se descoberto tarde

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-------------------|
| V2 Authentication | Não | Fora de escopo — decorators são só uma segunda forma de declarar schema, sem superfície de autenticação |
| V3 Session Management | Não | Idem |
| V4 Access Control | Não | Idem — `allowedMethods`/Proxy gating permanecem inalterados e no config, não no decorator (D-06) |
| V5 Input Validation | Sim (indireto) | O schema compilado por decorators alimenta o MESMO `$jsonSchema` strict (`additionalProperties: false` recursivo) já usado pela API de objetos — nenhuma nova superfície de validação, mas o comportamento "campo sem decorator fica fora do schema" (D-04) é uma armadilha de sub-validação que precisa ser MUITO bem documentada (um dev pode achar que um campo está protegido quando não está) |
| V6 Cryptography | Não | `@Pre('insert', hashPassword)` é só um EXEMPLO de uso no rascunho do autor — a lib não implementa hashing, só o mecanismo de hook (mesmo do já existente pipeline da Fase 2); qualquer criptografia é responsabilidade do hook fornecido pelo dev |

### Known Threat Patterns for este stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|----------------------|
| Campo esperado como validado, mas silenciosamente fora do schema por falta de decorator (D-04) | Tampering (indireto — sub-validação permite dados fora do formato esperado) | Documentação MUITO explícita ("campos sem decorator não entram no schema compilado") + considerar um lint/teste de exemplo nos guias que demonstre o comportamento, evitando que vire uma surpresa em produção |
| Hook de segurança (`@Pre` de hash/auditoria) descartado em silêncio por WR-04 (`isSameConfig` não compara hooks) | Repudiation / Tampering | Fechar WR-04 nesta fase (ver Pitfall 4) — falhar alto em vez de descartar hooks silenciosamente numa re-registração |
| Guard de modo legado (D-16) ausente ou mal implementado permite decorators "funcionarem" silenciosamente em modo `experimentalDecorators`, produzindo um schema vazio/incorreto sem erro | Tampering / Denial of correctness | Guard explícito (Pattern 3) + teste de regressão simulando o modo legado |

## Sources

### Primary (HIGH confidence)
- `typescriptlang.org/docs/handbook/release-notes/typescript-5-2.html` (oficial) — decorator metadata, `context.metadata`/`Symbol.metadata`, exemplo de uso, requisito de `lib`/polyfill
- `npm view <pkg> version` — versões reais confirmadas no registry para `typescript`, `@rolldown/plugin-babel`, `@babel/core`, `@babel/plugin-proposal-decorators`, `@types/babel__core`
- Código-fonte do próprio projeto: `src/model/index.ts`, `src/types/model.ts`, `src/schema/index.ts` (rascunho do autor), `src/index.ts`, `src/errors/index.ts`, `.planning/phases/05-.../05-REVIEW.md` (WR-04)

### Secondary (MEDIUM confidence)
- `tsdown.dev/options/target` (docs oficiais do tsdown, via WebFetch) — confirma que Rolldown/Oxc não suportam lowering de decorators stage-3
- GitHub issue `oxc-project/oxc#9170` (via WebFetch) — status oficial da decisão do time do Oxc de adiar o transform de decorators
- `babeljs.io/docs/babel-plugin-proposal-decorators` (via WebFetch) — opções de `version`, recomendação de `'2023-11'`
- README oficial de `@rolldown/plugin-babel` no npm (via `npm view readme`) — exemplo de uso exato com `@babel/plugin-proposal-decorators`
- `mongodb.com/docs/drivers/node/current/data-formats/bson/undefined-values/` (via WebSearch) — comportamento default `ignoreUndefined: false`

### Tertiary (LOW confidence)
- Artigos de blog de terceiros sobre decorators TC39 (ethelab.com, LogRocket, Medium, etc.) — usados só para triangular terminologia (context.kind, addInitializer), não como fonte única de nenhuma claim estrutural

## Metadata

**Confidence breakdown:**
- Standard stack (decorators nativos do TS): HIGH — documentação oficial do TypeScript, sem dependência de runtime nova
- Build tooling (tsdown/Babel workaround): MEDIUM — cross-verificado via docs oficiais do tsdown + issue do oxc-project + README oficial do plugin, mas é um gap ATIVO e não resolvido nas ferramentas (pode mudar de status a qualquer novo release do Oxc) — recomendado re-verificar no início da execução da fase, não só no planning
- Pitfall do driver MongoDB (`undefined` serializado) — MEDIUM — confirmado via doc oficial do driver, mas não testado neste momento contra o driver `mongodb@7.0.0` real do projeto (recomendado como teste de Wave 0, não como fato assumido)
- Arquitetura de hooks via decorator (reaproveitando pipeline Fase 2): HIGH — decisão já travada em CONTEXT.md (D-09/D-11), só falta implementação

**Research date:** 2026-07-13
**Valid until:** ~14 dias para a parte de build tooling (Oxc/Rolldown está em desenvolvimento ativo nessa área — reverificar `oxc-project/oxc#9170` e `tsdown.dev/options/target` antes de executar, caso a fase comece depois de 2026-07-27); ~90 dias para a parte de sintaxe TC39/TypeScript (estável, sem sinais de mudança iminente)
