# Phase 6: API de schema com decorators (TC39) - Pattern Map

**Mapped:** 2026-07-13
**Files analyzed:** 11 (novos) + 2 (modificados)
**Analogs found:** 9 / 11

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|--------------------|------|-----------|-----------------|---------------|
| `src/schema/polyfill.ts` | config/util (side-effect) | transform | `src/utils/enums.ts` (estilo de módulo minimalista) | partial |
| `src/schema/guards.ts` | utility | transform | `src/model/index.ts` (`assertNoWhere`, guard functions puras que lançam `MongoatValidationError`) | role-match |
| `src/schema/decorators.ts` | utility/factory | transform (metadata → metadata) | `src/model/index.ts` (`schemaValidatorBuilder`/`includeAdditionalPropertiesFalse`, mutação estrutural de schema) + rascunho `src/schema/index.ts` (ergonomia desejada) | role-match |
| `src/schema/sugars.ts` | utility (composable factories) | transform | `src/schema/decorators.ts` (mesma fase, `@Prop` como base) | exact (interno à fase) |
| `src/schema/compile.ts` | service (pure transform) | transform | `src/model/index.ts` (`schemaValidatorBuilder`, transform de `ModelValidationSchema` bruto → validator) | role-match |
| `src/schema/index.ts` (barrel, substitui o rascunho) | config (barrel export) | — | `src/index.ts` (barrel principal, re-exports nomeados) | exact |
| `src/types/schema.ts` | model/types | — | `src/types/model.ts` (interfaces `Props`/`Schema` suffix, JSDoc de decisões) | exact |
| `src/model/index.ts` (modificado — constructor + `insert`/`insertMany`/`bulkWrite`) | controller (CRUD orchestration) | CRUD | já existe — modificação incremental sobre si mesmo | exact |
| `src/errors/index.ts` (modificado — nenhuma classe nova, só novos `.code`) | model (error types) | — | já existe — nenhuma classe nova necessária, só valores de `code` | exact |
| `src/index.ts` (modificado — novos exports) | config (barrel) | — | já existe — modificação incremental | exact |
| `tsdown.config.ts` (novo) | config | build | nenhum análogo no repo (arquivo não existe hoje) | no analog |
| `test/schema/*.test.ts` (vários) | test | request-response/CRUD | `test/model/registry-config.test.ts`, `test/model/hooks-pre-order.test.ts`, `test/model/schema-clone.test.ts` | exact |

## Pattern Assignments

### `src/schema/polyfill.ts` (utility, side-effect)

**Analog:** nenhum arquivo existente faz side-effect polyfill puro; usar o estilo minimalista de `src/utils/enums.ts` (um arquivo, um propósito, sem classes) como referência de tamanho/formato.

**Padrão a seguir** (do próprio RESEARCH.md, Pattern/Pitfall 2, já validado):
```typescript
// side-effect only — importado antes de qualquer decorator rodar
(Symbol as unknown as { metadata: symbol }).metadata ??= Symbol('Symbol.metadata');
```
Deve ser importado como primeira linha de `src/schema/decorators.ts` (`import './polyfill';`), reproduzindo o padrão de barrel-primeiro-import já usado em `src/index.ts` (ordem de exports estável, sem lógica).

---

### `src/schema/guards.ts` (utility, transform)

**Analog:** `src/model/index.ts` — função `assertNoWhere` (linhas ~151-158)

**Padrão de guard function que lança `MongoatValidationError`:**
```typescript
// src/model/index.ts:151-158
function assertNoWhere(filter: unknown): void {
  if (findForbiddenOperator(filter, new Set(['$where']))) {
    throw new MongoatValidationError(
      'The $where operator is not allowed — it executes arbitrary JavaScript on the server',
      { code: 'FORBIDDEN_OPERATOR' }
    );
  }
}
```
**Aplicar o mesmo shape para `assertStandardDecoratorMode(context)` (D-16):** função pura, sem estado, checagem booleana seguida de `throw new MongoatValidationError(mensagem, { code: 'LEGACY_DECORATORS_MODE' })`. Import de `MongoatValidationError` idêntico ao de `src/model/index.ts:53-57`:
```typescript
import { MongoatValidationError } from '@/errors';
```

---

### `src/schema/decorators.ts` (utility/factory, metadata transform)

**Analog primário:** rascunho do autor `src/schema/index.ts` (ergonomia-alvo, linhas 1-44) — usar como especificação de API pública, NÃO como implementação (o rascunho é só comentário JSDoc sem código real).

**Analog de implementação:** `src/model/index.ts` — `includeAdditionalPropertiesFalse` (linhas 457-475), padrão de mutação recursiva de schema:
```typescript
// src/model/index.ts:457-475
private includeAdditionalPropertiesFalse(
  schema: ModelValidationSchema
): ModelValidationSchema {
  if (schema.bsonType === 'object' && !schema.additionalProperties) {
    schema.additionalProperties = false;
  }
  if (schema.items) {
    this.includeAdditionalPropertiesFalse(schema.items);
  }
  if (schema.properties) {
    Object.keys(schema.properties).forEach((key) => {
      this.includeAdditionalPropertiesFalse((schema.properties ?? {})[key]);
    });
  }
  return schema;
}
```
**Aplicar:** mesma disciplina de "helper privado recursivo + mutação controlada" para o compile recursivo de nested schemas (D-05). Erros estruturais (`INVALID_DECORATED_CLASS`) seguem o padrão de `MongoatValidationError` acima. Comentários de decisão (`// D-XX:`) devem seguir o mesmo estilo de comentário encontrado em `src/model/index.ts` (referência a D-xx/WR-xx explicando o "porquê", nunca em JSDoc público — ver `code_context` do CONTEXT.md).

---

### `src/schema/sugars.ts` (utility, composable factories)

**Analog:** o próprio `@Prop` de `src/schema/decorators.ts` desta fase — os açúcares (`@BsonType`, `@Description`, `@Pattern`, `@Optional`, `@Enum`, `@Min`/`@Max`, `@MinLength`/`@MaxLength`) são funções finas que retornam `Prop({ ...fragment })`. Não há analog externo — o padrão é interno à fase (RESEARCH.md, Pattern 1).

**Padrão de composição (do RESEARCH.md, adaptado ao estilo do projeto):**
```typescript
export function BsonType(bsonType: string | string[]) {
  return Prop({ bsonType });
}
export function Description(description: string) {
  return Prop({ description });
}
```
Manter uma função por export, sem abstrair em uma factory genérica prematuramente — consistente com "Function Design: single responsibility" do CLAUDE.md.

---

### `src/schema/compile.ts` (service, pure transform)

**Analog:** `src/model/index.ts` — `schemaValidatorBuilder` (linhas 419-455), mesmo formato de "recebe schema bruto, devolve estrutura pronta para o driver":
```typescript
// src/model/index.ts:419-455
private schemaValidatorBuilder({
  schema,
  validationQueryExpressions = {},
}: { ... }): ModelDbValidationProps {
  const clonedSchema = structuredClone(schema);
  return {
    validationAction: 'error',
    validationLevel: 'strict',
    validator: { $jsonSchema: { ...this.includeAdditionalPropertiesFalse(clonedSchema).properties, ... } },
  };
}
```
**Aplicar:** `Schema.compile(cls)` deve seguir o mesmo padrão — função pura, sem I/O, lança `MongoatValidationError` em erro estrutural (classe sem `@Schema`/sem campos), devolve exatamente `ModelValidationSchema` (mesmo tipo que `schemaValidatorBuilder` já consome). **Não duplicar** `additionalProperties: false`/`_id`/`required` — isso já é responsabilidade de `schemaValidatorBuilder` no `Model`; `compile()` deve parar no `ModelValidationSchema` "cru" equivalente ao objeto plano que o dev escreveria à mão (D-03, DECO-03).

---

### `src/schema/index.ts` (barrel, substitui o rascunho comentado)

**Analog:** `src/index.ts` — barrel principal, re-exports nomeados agrupados por categoria:
```typescript
// src/index.ts:1-28
export { Database, type ObjectID } from './database';
export { MongoatConnectionError, MongoatDriverError, MongoatError, MongoatValidationError } from './errors';
export { Model } from './model';
export type { CreateIndexProps, CreateModelProps, ... } from './types';
export { CUSTOM_VALIDATION, METHODS, sanitizeFilter, toObjectId } from './utils';
export type { SanitizeFilterOptions } from './utils';
```
**Aplicar:** `src/schema/index.ts` deve reexportar `Schema, Prop, Pre, Post` + todos os açúcares de `decorators.ts`/`sugars.ts`, e então `src/index.ts` (barrel raiz) reexporta a partir de `src/schema` seguindo o MESMO padrão de agrupamento por linha lógica — sem introduzir um subpath novo (D-15 — subpaths foram removidos na 1.1.0).

---

### `src/types/schema.ts` (types)

**Analog:** `src/types/model.ts` — estilo de interface com JSDoc explicando decisões de design (ex.: comentário sobre `ModelValidationSchema<T>` linhas 86-102) e naming `XxxProps`/`XxxSchema`.

**Padrão de JSDoc explicativo em tipo genérico complexo:**
```typescript
// src/types/model.ts:86-102
export interface ModelValidationSchema<
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  T extends DefaultProperties = any,
> extends JSONSchema4Subset {
  bsonType: string | string[];
  ...
}
```
**Aplicar:** `SchemaClass<T>` (marker type para "classe decorada") deve seguir o mesmo nível de comentário justificando escolhas de tipo (ex.: por que `typeof schema === 'function'` é suficiente para detectar, ver Pattern 4 do RESEARCH.md).

---

### `src/model/index.ts` (modificado — constructor + `insert`/`insertMany`/`bulkWrite`)

**Analog:** o próprio arquivo — mudança incremental sobre padrão já estabelecido.

**Detecção de schema class vs objeto plano (D-08) — inserir no constructor, ANTES de `schemaValidatorBuilder`:**
```typescript
// src/model/index.ts:303-341 (constructor atual) — ponto de inserção
const {
  allowedMethods = [],
  collectionName,
  documentDefaults = {} as DocumentDefaults<ModelType>,
  indexes = [],
  schema,                    // <- aqui: schema pode ser ModelValidationSchema | SchemaClass<T>
  validationQueryExpressions,
  validity,
} = props;

// NOVO: resolver antes de chamar schemaValidatorBuilder
const isDecoratedSchemaClass = typeof schema === 'function';
const resolvedSchema = isDecoratedSchemaClass
  ? Schema.compile(schema as Function)
  : (schema as ModelValidationSchema);
```

**Filtragem de `undefined` nos defaults de instância (Pattern 5, D-12/D-13) — mesmo ponto de merge de `insert()`:**
```typescript
// src/model/index.ts:746-749 (padrão de merge já existente, a estender)
const mergedDocument = {
  ...cloneDocumentDefaults(this.documentDefaults),
  ...document,
} as OptionalUnlessRequiredId<ModelType>;
```
Inserir uma camada ANTES desta (`classDefaults`, filtrados via `ownDefinedProperties`) seguindo a MESMA ordem de precedência (`classDefaults` → `documentDefaults` → `document` do usuário, D-13) — reaproveitar `cloneDocumentDefaults` já existente para os defaults do config, sem duplicar a lógica de clone para os da classe (a classe já é instanciada fresca por insert, D-12, então não precisa de clone adicional).

**Erro de config divergente (WR-04, hooks agora comparados) — reusar `isSameConfig`/`MODEL_CONFIG_CONFLICT`:**
```typescript
// src/model/index.ts:363-370
throw new MongoatValidationError(
  `Model "${collectionName}" already registered with a different configuration`,
  { code: 'MODEL_CONFIG_CONFLICT' }
);
```
Estender `isSameConfig` (linhas 210-244) para também comparar `hooks` via `stableStringify` — mesmo padrão de comparação estrutural já usado para `validator`/`documentDefaults`.

---

### `src/errors/index.ts` (modificado — só novos `.code`, nenhuma classe nova)

**Analog:** o próprio arquivo — `MongoatValidationError` já cobre todos os erros de decorator (D-14/D-16); não criar subclasse nova.

**Padrão de novo `.code` sem nova classe:**
```typescript
// src/errors/index.ts:47-56 — reusar tal como está
export class MongoatValidationError extends MongoatError {
  constructor(message: string, options?: { cause?: unknown; code?: string }) {
    super(message, { cause: options?.cause, code: options?.code ?? 'VALIDATION_FAILED' });
    ...
  }
}
```
Novos códigos (`INVALID_HOOK_METHOD`, `INVALID_DECORATED_CLASS`, `LEGACY_DECORATORS_MODE`, `MODEL_CONFIG_CONFLICT` já existe) só precisam ser passados via `{ code: '...' }` nos `throw new MongoatValidationError(...)` dos novos arquivos — nenhuma mudança estrutural em `src/errors/index.ts` é necessária, só documentar os novos códigos no JSDoc da classe (seguindo o estilo das linhas 37-46).

---

### `test/schema/*.test.ts` (novos arquivos de teste)

**Analogs:**
- `test/model/registry-config.test.ts` — para o teste de `isSameConfig`/`MODEL_CONFIG_CONFLICT` estendido a hooks decorados (WR-04 follow-up).
- `test/model/hooks-pre-order.test.ts` — para o teste de ordem D-11 (`@Pre` de campo → classe → config → chainable).
- `test/model/schema-clone.test.ts` — para o teste de equivalência DECO-03 (`Schema.compile` vs objeto plano, `stableStringify`/deep-equal byte-a-byte).
- `test/model/crud-happy-path.test.ts` — para o teste de integração Mongo real de insert com classe decorada (defaults por-insert, filtragem de `undefined`).

Seguir a MESMA estrutura de setup (testcontainers, `vitest`) já usada nesses arquivos — não reinventar bootstrap de Mongo real; usar `test/setup/` existente.

## Shared Patterns

### Erros de validação (`MongoatValidationError` + `.code` estável)
**Source:** `src/errors/index.ts:47-56`
**Apply to:** `src/schema/guards.ts`, `src/schema/decorators.ts`, `src/schema/compile.ts`, `src/model/index.ts` (novos throws)
```typescript
throw new MongoatValidationError('mensagem sem detalhes internos', { code: 'CODE_ESTAVEL' });
```

### Comentários de decisão (justificar "porquê", nunca IDs em JSDoc público)
**Source:** `src/model/index.ts` (padrão pervasivo, ex. linhas 63-69, 160-174, 198-209)
**Apply to:** todos os arquivos novos de `src/schema/` — comentários `//` explicando trade-offs podem citar D-xx/WR-xx; JSDoc `/** @public */`/`/** @private */` de símbolos exportados NÃO pode (memória do projeto: "public-jsdoc-no-internal-ids").

### Clone antes de mutação estrutural (nunca mutar o objeto do dev)
**Source:** `src/model/index.ts:427-434` (`structuredClone(schema)` antes de `includeAdditionalPropertiesFalse`), `cloneDocumentDefaults` (linhas 160-196)
**Apply to:** `Schema.compile()` — qualquer schema/metadata lido de `context.metadata` que seja repassado ao `Model` deve ser copiado, nunca mutado in-place, mesma disciplina de QUAL-01/WR-06.

### Barrel exports agrupados, sem subpaths novos
**Source:** `src/index.ts`
**Apply to:** `src/schema/index.ts` (barrel do módulo) e a atualização do barrel raiz — D-15 é explícito: tudo sai do barrel principal, subpaths não voltam.

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `tsdown.config.ts` | config (build) | build | Arquivo de config de build não existe hoje no repo (projeto builda com defaults do tsdown) — planner deve seguir diretamente o exemplo do RESEARCH.md (`@rolldown/plugin-babel` + `@babel/plugin-proposal-decorators`, filtro `include` restrito a `src/schema/**`), não há analog interno. |
| `src/schema/polyfill.ts` | utility (side-effect) | transform | Nenhum arquivo do projeto hoje faz polyfill de side-effect puro; usar o exemplo já validado do RESEARCH.md (Pitfall 2) como fonte primária em vez de um analog de código. |

## Metadata

**Analog search scope:** `src/`, `test/model/`, `test/schema/` (inexistente ainda), `.planning/phases/06-.../06-RESEARCH.md`, `.planning/phases/06-.../06-CONTEXT.md`
**Files scanned:** `src/schema/index.ts`, `src/model/index.ts`, `src/model/hooks.ts`, `src/types/model.ts`, `src/errors/index.ts`, `src/index.ts`, `src/utils/enums.ts`, `src/database/index.ts`, `test/model/*.test.ts` (listagem)
**Pattern extraction date:** 2026-07-13
