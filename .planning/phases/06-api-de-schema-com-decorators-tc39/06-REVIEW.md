---
phase: 06-api-de-schema-com-decorators-tc39
reviewed: 2026-07-14T14:43:45Z
depth: standard
files_reviewed: 25
files_reviewed_list:
  - scripts/smoke-decorators.mjs
  - src/errors/index.ts
  - src/index.ts
  - src/model/index.ts
  - src/schema/compile.ts
  - src/schema/decorators.ts
  - src/schema/guards.ts
  - src/schema/index.ts
  - src/schema/polyfill.ts
  - src/schema/sugars.ts
  - src/types/index.ts
  - src/types/model.ts
  - src/types/schema.ts
  - test/model/registry-config.test.ts
  - test/schema/all-optional-nested-setup.test.ts
  - test/schema/compile-equivalence.test.ts
  - test/schema/decorated-vs-plain-parity.test.ts
  - test/schema/field-hook-async.test.ts
  - test/schema/hook-decoration-errors.test.ts
  - test/schema/hooks-decorator-order.test.ts
  - test/schema/legacy-mode-guard.test.ts
  - test/schema/nested-compile.test.ts
  - test/schema/per-insert-defaults.test.ts
  - test/schema/schema-class-or-plain.test.ts
  - test/schema/sugars.test.ts
findings:
  critical: 0
  warning: 10
  info: 8
  total: 18
status: issues_found
---

# Fase 6: Code Review Report (re-review pós gap closure 06-05)

**Reviewed:** 2026-07-14T14:43:45Z
**Depth:** standard
**Files Reviewed:** 25
**Status:** issues_found

## Summary

Re-review da API de schema com decorators TC39 após o gap closure 06-05 (commits `13d2c56`, `60914a0`, `2b6e2ce`). Revisados os decorators/açúcares/compile/guards/polyfill, a integração no construtor do `Model`, os tipos, o smoke script de produção e 12 arquivos de teste (2 novos). Cross-referenciado contra `src/model/hooks.ts` (pipeline de hooks) e `src/types/hooks.ts` (shapes de `ctx` por método). Verificação local: `tsc --noEmit` passa; os 5 arquivos de teste puros de unidade passam (24 testes); um probe de tipagem externo confirma que `new Model({ schema: ClasseDecorada })` compila sem cast.

**Achados anteriores FECHADOS (verificados no código atual):**

- **CR-01 (anterior)** — wrapper do `@Pre` de campo agora é `async` e faz `document[field] = await fn(...)` (`src/schema/compile.ts:229-246`); regressão coberta por `test/schema/field-hook-async.test.ts` (unit + integração contra MongoDB real). **Fechado.**
- **WR-05 (anterior)** — guard `Object.hasOwn(document, field)` impede a materialização de campo ausente (`src/schema/compile.ts:243`); coberto pelo mesmo arquivo de teste. **Fechado** (resta um edge de `undefined` explícito — ver IN-06).
- **WR-06 (anterior)** — `compile()` omite `required` quando o array filtrado é vazio (`src/schema/compile.ts:101`); coberto por dois casos novos em `nested-compile.test.ts` e pela integração server-side em `all-optional-nested-setup.test.ts`. **Fechado.**

Os demais 7 warnings e 5 infos do review anterior **permanecem abertos** no código atual (re-verificados linha a linha, renumerados abaixo), e esta rodada adiciona 3 warnings novos (WR-08, WR-09, WR-10) e 3 infos novos (IN-06, IN-07, IN-08). O cluster dominante continua sendo o de "config comportamental descartada em silêncio" no re-registro de models (WR-02/WR-03/WR-07) e a semântica indefinida de herança/kind nos decorators (WR-01/WR-06).

## Narrative Findings (AI reviewer)

## Warnings

### WR-01: Herança de classes decoradas produz schemas inconsistentes e silenciosamente errados

**File:** `src/schema/decorators.ts:26-39`, `src/schema/compile.ts:44-53`, `src/model/index.ts:277-281`
**Issue:** (Persistente do review anterior — não tocado pelo 06-05.) `getOrInitMeta` evita mutar o metadata do pai via `Object.hasOwn`, mas a entrada nova que cria é **vazia** — nunca copia os campos herdados. Já as LEITURAS (`compile`, `extractDecoratorHooks`, e o marker `kMongoatSchemaClass` em `getDefaultCollectionName`) usam acesso de propriedade simples, que **percorre** a prototype chain. Resultado para `class Filha extends PaiDecorado`:
1. `Filha` com campos decorados próprios → schema compilado contém **só** os campos da filha; todo `@Prop` herdado e todo `@Pre`/`@Post` do pai são descartados em silêncio.
2. `Filha` sem decorators → `Schema.compile(Filha)` compila silenciosamente o schema **do pai** (metadata herdado via prototype chain).
3. `Filha` sem `@Schema` próprio herda o marker de `collectionName` do pai — `new Model({ schema: Filha })` sem `collectionName` explícito mira silenciosamente a **coleção do pai**.
Nada disso lança, nada é documentado, nenhum teste cobre subclassing.
**Fix:** Escolher uma semântica e impor: (a) semear a entrada nova a partir do metadata herdado (clone do `FieldMeta` do pai, hooks copiados por referência) para herança compor; ou (b) rejeitar herança explicitamente — em `@Schema`, detectar `SCHEMA_METADATA_KEY`/marker herdado e lançar `MongoatValidationError` até herança ser projetada deliberadamente. Adicionar testes em qualquer dos casos.

### WR-02: `isSameConfig` nunca compara `schemaClass` — defaults por-insert da classe são descartados em silêncio no re-registro

**File:** `src/model/index.ts:233-267`, `src/model/index.ts:454-482`
**Issue:** (Persistente.) A classe decorada do candidato (que alimenta `buildClassDefaults()` — os defaults por-insert D-12) não participa da comparação de config. Um re-registro em que validator compilado, `allowedMethods`, `documentDefaults` e `indexes` batem — mas a *fonte* do schema difere — cai no early-return de "config idêntica" e descarta os inicializadores de campo do candidato:

```typescript
new Model({ collectionName: 'x', schema: plainSchema });            // registrado primeiro
new Model({ collectionName: 'x', schema: DecoradaComCreatedAt });   // mesmo schema compilado,
// sem hooks → retorna o model do schema plano; `createdAt = new Date()` nunca roda
```

É exatamente a classe de mascaramento "config comportamental descartada" que o WR-04 da Fase 5 fechou para hooks/defaults/indexes — inicializadores de campo são config comportamental invisível ao `stableStringify`.
**Fix:** No branch de `existing`, tratar divergência de fonte de schema como conflito: se `isDecoratedSchemaClass && existing.schemaClass !== schema` (ou `!isDecoratedSchemaClass && existing.schemaClass !== undefined`), lançar `MODEL_CONFIG_CONFLICT`. Igualdade por referência da classe é a comparação honesta (inicializadores, como hooks, não têm igualdade estrutural).

### WR-03: Re-registro idêntico de classe decorada com `@Pre`/`@Post` sempre lança — falso positivo de `MODEL_CONFIG_CONFLICT`

**File:** `src/model/index.ts:443-463`
**Issue:** (Persistente.) `candidateHasHooks` inclui os hooks decorados, e qualquer candidato com hooks lança no re-registro — mesmo quando `schema` é a **mesma referência de classe** com config idêntica. Para schemas planos, `new Model(mesmasProps)` duas vezes retorna a mesma instância (contrato testado em `registry-config.test.ts:45-59`); para uma classe decorada com `@Pre`, `new Model({ schema: UserSchema })` duas vezes sempre lança. Qualquer consumidor cujo código de construção de model rode mais de uma vez por processo (re-avaliação de módulo, factory, warm start serverless) quebra especificamente para classes decoradas com hooks. O racional "funções não têm igualdade estrutural" não se aplica aqui: mesma referência de classe ⇒ hooks idênticos por identidade.
**Fix:** Antes do throw de `candidateHasHooks`, permitir o caminho de reuso quando a classe decorada é idêntica: `if (existing.schemaClass === schema && !propsDeclaramHooksProprios && isSameConfig(...)) return existing;` — só `props.hooks` num re-registro permanece incondicionalmente fatal.

### WR-04: `context.metadata` ausente produz `TypeError` críptico em vez de erro Mongoat

**File:** `src/schema/guards.ts:19-32`, `src/schema/decorators.ts:26-39`
**Issue:** (Persistente.) `assertStandardDecoratorMode` só checa `.kind`. TypeScript 5.0/5.1 (e toolchains que implementam decorators TC39 **sem** a proposta de decorator metadata) passam um contexto com `.kind` mas `metadata: undefined`. O guard passa, e `getOrInitMeta(undefined)` estoura `TypeError: Cannot convert undefined or null to object` no `Object.hasOwn` — nas entranhas da lib, sem mensagem acionável. A constraint declarada do projeto é compatibilidade "TypeScript 5.x", e a filosofia de guard desta fase é falhar alto com `.code` estável.
**Fix:** Estender o guard (ou adicionar um irmão) para checar `context.metadata`:
```typescript
if (!(context as { metadata?: unknown }).metadata) {
  throw new MongoatValidationError(
    'Decorator context has no metadata — your toolchain implements TC39 decorators without the decorator-metadata proposal (TypeScript >= 5.2 required)',
    { code: 'LEGACY_DECORATORS_MODE' } // ou um code dedicado, ex.: MISSING_DECORATOR_METADATA
  );
}
```

### WR-05: Merge raso do `@Prop` guarda referências aninhadas do dev — desacoplamento documentado não é de fato mantido

**File:** `src/schema/decorators.ts:84-88`, `src/schema/sugars.ts:44-46`
**Issue:** (Persistente.) O comentário afirma "clone raso do fragmento recebido desacopla do objeto do dev (mutação futura do objeto original do dev não vaza para cá)" — mas spread raso só desacopla chaves de topo. Valores aninhados (arrays de `enum` — guardados por referência direta via `Enum(values)` → `Prop({ enum: values })` — subschemas inline em `type`/`items`, `properties` de fragmento inline) continuam compartilhados com o chamador. Um dev que faça `values.push('x')` depois da definição da classe altera o metadata para **toda** compilação subsequente (`Schema.compile`/`new Model`) dessa classe. O `structuredClone` de `compileProperty` no compile fotografa o estado que a referência compartilhada tiver *naquele momento* — não protege a janela decoração→compile, e resultados compilados antes/depois divergem.
**Fix:** Deep-clone do fragmento na decoração (o fragmento é dado declarativo; classes só aparecem em `type`/`items`, então clonar o caso de objeto plano dessas chaves e manter referências de classe intactas):
```typescript
const { type, items, ...rest } = fragment;
meta.properties[fieldName] = {
  ...(meta.properties[fieldName] ?? {}),
  ...structuredClone(rest),
  ...(type !== undefined ? { type: typeof type === 'function' ? type : structuredClone(type) } : {}),
  ...(items !== undefined ? { items: typeof items === 'function' ? items : structuredClone(items) } : {}),
};
```

### WR-06: Sem validação de `context.kind` — decorators aplicados a métodos/getters são registrados errado em silêncio

**File:** `src/schema/decorators.ts:64-96`, `src/schema/decorators.ts:170-192`, `src/schema/decorators.ts:216-236`, `src/schema/decorators.ts:260-284`
**Issue:** (Persistente.) O tratamento de `kind` em runtime é binário (`'field'` vs resto), mas decorators TC39 podem cair em `method`, `getter`, `setter`, `accessor` e `class`:
- `@Pre('insert', fn)` num **método/getter/accessor** cai no branch `else` e é registrado silenciosamente como hook de *classe* (`meta.classPreHooks`) — a intenção do dev (transformar aquele membro) se perde sem aviso.
- `@Post` num método é aceito como classe (o guard só rejeita `kind === 'field'`).
- `@Schema('x')` num campo passa o guard de modo padrão (contextos de campo têm `.kind`) e então ou lança um `INVALID_DECORATED_CLASS` enganoso ou chega em `(value)[kMongoatSchemaClass] = ...` com `value === undefined` → `TypeError` críptico.
- `@Prop`/`@Optional` num método registram uma property fantasma no schema.
Os tipos do TS previnem a maior parte para consumidores TS, mas esta é uma lib publicada também consumida de JavaScript.
**Fix:** Validar `context.kind` explicitamente em cada decorator: `Prop`/`Optional` exigem `'field'`; `Pre` exige `'field' | 'class'`; `Post` e `Schema` exigem `'class'`. Lançar `MongoatValidationError` (ex.: code `INVALID_DECORATOR_TARGET`) caso contrário.

### WR-07: `onHookError` divergente é descartado em silêncio no re-registro

**File:** `src/model/index.ts:443-482`
**Issue:** (Persistente.) `candidateHasHooks` cobre `props.hooks` e hooks decorados, mas não `props.onHookError`. Um re-registro com config idêntica que forneça um `onHookError` **diferente** (função, invisível ao `stableStringify`, e materialmente comportamental — decide para onde vão os erros de post-hook `fireAndForget`) cai no early-return de "config idêntica" e é descartado, mantendo o handler do primeiro registro. Mesma classe de mascaramento de WR-02/WR-03.
**Fix:** Tratar `props.onHookError` presente num re-registro como hooks: incluir `props.onHookError !== undefined` na condição de fail-loud (ou comparar por referência contra `existing.onHookError` e só lançar em divergência).

### WR-08: `@Pre` de campo é aceito para os 10 métodos sem `ctx.document` — hook que despacha mas é no-op garantido

**File:** `src/schema/compile.ts:229-246`, `src/schema/guards.ts:45-54`, `src/schema/decorators.ts:170-192`
**Issue:** (Novo — exposto pela forma final do wrapper pós-06-05.) Só `INSERT` e `INSERT_MANY` carregam `ctx.document` (`src/types/hooks.ts:88-152`). Um `@Pre` de **campo** declarado com qualquer um dos outros 10 métodos (`update`, `updateMany`, `bulkWrite`, `find`, ...) passa por `assertKnownHookMethod`, é registrado, despacha — e é um no-op garantido para sempre (o wrapper retorna cedo sem `ctx.document`). Um dev que escreva `@Pre(METHODS.UPDATE, (v) => hash(v))` num campo espera o `$set` transformado; nada acontece, silenciosamente. Isso é exatamente a classe de silêncio que a D-14 declarou querer eliminar ("um hook que nunca dispara, silenciosamente"). O comentário no wrapper racionaliza como "o dev pode reaproveitar o mesmo method em contextos sem documento", mas para `kind === 'field'` não existe caso de uso legítimo de um método sem documento — o hook não tem O QUE transformar, nunca.
**Fix:** Na decoração, quando `context.kind === 'field'`, restringir `method` aos métodos com documento no ctx (`METHODS.INSERT`, `METHODS.INSERT_MANY`) e lançar `MongoatValidationError` (code `INVALID_HOOK_METHOD` ou dedicado) para os demais — mesma disciplina fail-loud-na-decoração da D-14. O no-op silencioso em runtime pode permanecer como defesa em profundidade.

### WR-09: Wrapper do `@Pre` de campo grava retorno `undefined` — `fn` sem `return` destrói o campo em silêncio

**File:** `src/schema/compile.ts:244`
**Issue:** (Novo.) O wrapper atribui incondicionalmente `document[field] = await fn(document[field], ctx)`. O contrato dos pre-hooks de classe/config é "return value is ignored" (`src/types/hooks.ts:29-34`); um dev habituado a ele que escreva um transform de campo que muta sem retornar (`@Pre('insert', (value) => { audit(value); })`) sobrescreve o valor do campo com `undefined`. O driver (com `ignoreUndefined: false`, o default) serializa a chave como o tipo BSON `Undefined` depreciado — falhando a validação `bsonType` com um erro confuso, ou (num schema sem `bsonType`) persistindo lixo no lugar do valor original. É destruição silenciosa de dado por um erro de contrato fácil de cometer, com falha longe da causa.
**Fix:** Alinhar com a convenção do pipeline de post-hooks ("`undefined` só observa"): só atribuir quando o retorno for `!== undefined`:
```typescript
const transformed = await fn(document[field], ctx);
if (transformed !== undefined) {
  document[field] = transformed;
}
```
Documentar no JSDoc de `@Pre` que um transform de campo que retorna `undefined` deixa o valor intacto (e que remoção de campo não é suportada por esta via).

### WR-10: IDs internos de planejamento em JSDoc de símbolos exportados — vazam para a Reference pública via TypeDoc

**File:** `src/schema/decorators.ts:100-118` (`Optional`), `src/schema/decorators.ts:139-168` (`Pre`), `src/schema/decorators.ts:194-214` (`Post`), `src/schema/sugars.ts:1-82` (todos os açúcares), `src/types/model.ts:14-42` (`JSONSchema4Subset`), `src/types/model.ts:62-67` (`CreateModelProps.collectionName`)
**Issue:** (Novo — violação de convenção explícita do projeto.) A regra do projeto é: JSDoc de símbolos exportados não pode citar IDs de planejamento (D-0x, WR-0x, QUAL-0x, "Fase X"...), porque vazam para `docs/api/` via TypeDoc; apenas comentários inline `//` e blocos `@private`/`@internal` podem. Os blocos `@public` de `Optional` ("D-04: ..."), `Pre` ("D-09/D-11/D-14"), `Post` ("D-10/D-14"), de **todos** os 8 açúcares ("Sugar over `@Prop({...})` (D-02)"), do `JSONSchema4Subset` ("QUAL-04", "D-02 (Fase 6)") e de `CreateModelProps.collectionName` ("(D-06)") citam IDs internos. Os blocos `@internal` (`FieldMeta`, `extractDecoratorHooks`, `SCHEMA_METADATA_KEY`) estão conformes e não são afetados.
**Fix:** Mover as referências de decisão para comentários `//` dentro do corpo das funções (padrão já usado em `Prop`/`Schema`, cujos JSDoc públicos estão limpos) e reescrever os JSDoc públicos em termos de comportamento, sem IDs.

## Info

### IN-01: `Pre`/`Post` aceitam `method: string` — sem checagem de `METHODS` em compile-time

**File:** `src/schema/decorators.ts:170`, `src/schema/decorators.ts:216`
**Issue:** (Persistente.) O guard de runtime (`assertKnownHookMethod`) pega typos, mas só na avaliação da classe. Tipar o parâmetro como `` METHODS | `${METHODS}` `` dá a mesma garantia no editor/compilador de graça; e `fn: (...args: unknown[]) => unknown` descarta a tipagem de `HookFn`/ctx que `.pre()`/`.post()` já oferecem.
**Fix:** Estreitar `method` e considerar tipar `fn` por nível (classe: `(ctx) => unknown`; campo: `(value, ctx) => unknown`) via overloads.

### IN-02: Smoke script deixa dirs temporários em falha e não é Windows-safe

**File:** `scripts/smoke-decorators.mjs:78-206`
**Issue:** (Persistente; impacto reduzido — `scripts/.smoke-tmp/` e `.smoke-out/` estão no `.gitignore:79-81`.) O `rmSync` de limpeza (linhas 205-206) só roda em sucesso — qualquer passo falhando deixa os dirs para trás. `execFileSync('npm', ...)` falha no Windows (`npm` é `npm.cmd` e `execFileSync` não resolve sem `shell: true`).
**Fix:** Envolver o corpo do passo 3 em `try/finally` para a limpeza; usar `process.platform === 'win32' ? 'npm.cmd' : 'npm'` (ou `{ shell: true }`) se contribuidores Windows importarem.

### IN-03: `PropFragment.type` sombreia a keyword `type` do JSON Schema e `resolveNestedSchema` aceita lixo

**File:** `src/types/schema.ts:41-44`, `src/schema/compile.ts:145-151`
**Issue:** (Persistente.) O `$jsonSchema` do MongoDB suporta a keyword `type` do JSON Schema; o Mongoat repropõe a chave para classes aninhadas (coerente com o `ModelValidationSchema` vendorizado, mas vale documentar para devs migrando schemas manuais). Em runtime, um não-função/não-objeto forçado (`type: 'string'` de JS) chega em `Object.assign(compiled, structuredClone('string'))`, produzindo lixo indexado por posição em vez de erro.
**Fix:** Em `resolveNestedSchema`, lançar `MongoatValidationError` quando `value` não é função nem objeto plano; documentar o sombreamento da keyword `type` no JSDoc de `@Prop`.

### IN-04: Casts `as unknown as CreateModelProps<Doc>` nos testes estão mortos — inclusive nos testes NOVOS do gap closure

**File:** `test/schema/schema-class-or-plain.test.ts:62-65`, `test/schema/decorated-vs-plain-parity.test.ts:53-56`, `test/schema/per-insert-defaults.test.ts:53-56`, `test/schema/hooks-decorator-order.test.ts:61-73`, `test/schema/field-hook-async.test.ts:82-85`, `test/schema/all-optional-nested-setup.test.ts:81-89`
**Issue:** (Persistente, agora com evidência.) Verificado nesta rodada por probe externo: `new Model<Doc>({ schema: ClasseDecorada, allowedMethods })` **compila sem cast** sob o tsconfig do projeto — `CreateModelProps.schema` já aceita `SchemaClass<ModelType>` e `collectionName` já é opcional. Os double-casts são código morto que esconde regressões de tipo exatamente na API que esta fase entrega — e os dois testes novos do 06-05 copiaram o padrão em vez de removê-lo.
**Fix:** Remover os casts dos 6 arquivos (o `typecheck` continua verde, confirmado).

### IN-05: `buildClassDefaults` instancia classes do consumidor com zero args — construtores com parâmetros obrigatórios falham no insert

**File:** `src/model/index.ts:648-656`, `src/types/schema.ts:15-17`
**Issue:** (Persistente.) `SchemaClass<T> = new (...args: never[]) => T` aceita construtores com parâmetros obrigatórios (contravariância: `never` é atribuível a qualquer tipo de parâmetro), então o TS nunca acusa uma classe de schema cujo construtor precisa de argumentos — ela estoura (ou produz defaults errados) dentro de `insert`/`insertMany`/`bulkWrite`, por documento, longe do ponto de registro.
**Fix:** Sondar uma vez na construção do Model (chamar `buildClassDefaults()` no constructor e descartar o resultado, envolvendo erro de instanciação num `MongoatValidationError` com `.code` estável) e/ou documentar que classes de schema devem ser construtíveis sem args.

### IN-06: Chave presente com valor `undefined` explícito ainda materializa `fn(undefined)` — edge remanescente do WR-05 fechado

**File:** `src/schema/compile.ts:243-245`
**Issue:** (Novo.) O guard `Object.hasOwn` protege campo **ausente**, mas `insert({ username, password: undefined })` cria a chave própria `password` no documento mesclado → `hasOwn` passa → `fn(undefined, ctx)` roda e grava o resultado (ex.: `hashed:undefined`), que então **passa** o `required` do servidor. É o mesmo mascaramento do WR-05 anterior, alcançável pelo caminho do `undefined` explícito (fácil de produzir com spread de objeto parcial: `{ ...form }`).
**Fix:** Trocar o guard por `Object.hasOwn(document, field) && document[field] !== undefined` (coerente com `ownDefinedProperties`, que já trata `undefined` como "ausente" no merge de defaults), ou documentar o comportamento como intencional.

### IN-07: Polyfill usa `Symbol('Symbol.metadata')` não-registrado em vez de `Symbol.for` — divergência da convenção de fallback do ecossistema

**File:** `src/schema/polyfill.ts:16-18`
**Issue:** (Novo.) O helper `applyDecs2311` do Babel (a mesma cadeia `2023-11` validada pelo smoke script) usa `Symbol.metadata || Symbol.for("Symbol.metadata")` como fallback. Para o fluxo do próprio Mongoat a ordem de import garante consistência (o consumidor importa os decorators antes de decorar), mas num processo onde OUTRO pacote já gravou metadata sob `Symbol.for('Symbol.metadata')` antes do polyfill do Mongoat rodar, os dois "Symbol.metadata" divergem — split de metadata entre pacotes. `Symbol.for('Symbol.metadata')` é estritamente mais interoperável e igualmente coberto pelo `??=`.
**Fix:** `(Symbol as ...).metadata ??= Symbol.for('Symbol.metadata');`

### IN-08: Comentário do merge de `insert()` promete isolamento que o spread raso do doc do usuário não entrega

**File:** `src/model/index.ts:899-912`
**Issue:** (Novo.) O comentário afirma que "os pre-hooks veem/mutam a cópia já mesclada com os defaults (não o objeto original do chamador)" — verdadeiro para chaves de topo (o `mergedDocument` é objeto novo; os *defaults* são clonados em profundidade), mas o `...document` do chamador é spread raso: um pre-hook que mute `ctx.document.nested.x` muta o objeto aninhado do **chamador**. A garantia documentada não vale para valores aninhados do doc do usuário.
**Fix:** Corrigir o comentário (garantia limitada a chaves de topo e defaults) ou estender `cloneDocumentDefaults` ao documento do usuário — cientes do custo por insert.

---

_Reviewed: 2026-07-14T14:43:45Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
