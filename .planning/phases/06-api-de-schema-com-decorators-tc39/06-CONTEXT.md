# Phase 6: API de schema com decorators (TC39) - Context

**Gathered:** 2026-07-13
**Status:** Ready for planning

<domain>
## Phase Boundary

O dev pode definir schemas com **decorators TC39 padrão** (TS 5.x nativo — sem `reflect-metadata`, sem `experimentalDecorators`) como alternativa de primeira classe à API de objetos. Uma classe decorada compila (`Schema.compile`) para o **mesmo** `ModelValidationSchema` da API de objetos; o construtor do Model aceita classe decorada ou objeto plano de forma transparente (DECO-01..04). Feature **aditiva** (minor 1.x) — zero breaking na superfície congelada da 1.1.0; arquitetura Proxy/registry intacta; nenhuma dependência de runtime nova.

</domain>

<decisions>
## Implementation Decisions

### Declaração de tipo por campo
- **D-01:** `@Prop({ ... })` é o decorator **canônico**, aceitando o shape do `ModelValidationSchema` por campo; os demais são açúcares composáveis implementados por cima dele.
- **D-02:** Conjunto de açúcares desta fase (estendido): `@BsonType`, `@Description`, `@Pattern`, `@Optional` (do rascunho) + `@Enum`, `@Min`/`@Max`, `@MinLength`/`@MaxLength`. Casos não cobertos usam `@Prop` genérico.
- **D-03:** `bsonType` omitido = **sem restrição de tipo** (semântica JSON Schema pura — o campo entra no validator só com o que foi declarado; sem default mágico, sem erro).
- **D-04:** Campos são **required por padrão**; `@Optional()` remove da lista `required` (fiel ao rascunho). Nota técnica: campos **sem nenhum decorator ficam fora do schema compilado** — decorators TC39 só enxergam o que decoram; documentar esse comportamento.
- **D-05:** Nested/arrays: **ambos os caminhos** — classes decoradas aninhadas como caminho principal (`@Prop({ type: AddressSchema })` / `@Prop({ items: AddressSchema })`, compile recursivo) E subschema JSON Schema inline aceito no `@Prop` como escape hatch.

### Divisão classe × config do Model
- **D-06:** `@Schema('users')` define o `collectionName` **default**; o config do Model pode omiti-lo (herda da classe) ou **sobrescrever**. `indexes`/`allowedMethods`/`documentDefaults` permanecem no config (operacional ≠ shape) — sem duplicação obrigatória.
- **D-07:** `Schema.compile` é **API pública** exportada no barrel (introspecção/debug/testes — coerente com a filosofia thin/escape-hatch).
- **D-08 (locked por DECO-04, não rediscutido):** `schema:` no config aceita classe decorada OU objeto plano, transparente.

### Semântica de hooks (@Pre/@Post)
- **D-09:** `@Pre` aplica-se em **classe E campo**: na classe recebe o `ctx` completo (mesmo contrato do pipeline da Fase 2); no campo é açúcar que transforma **só o valor do campo** (`(value, ctx) => novoValor` — ex.: hashPassword do rascunho).
- **D-10:** `@Post` simétrico incluído nesta fase, **só no nível da classe** (post por campo não tem semântica clara).
- **D-11:** Ordem de execução determinística e documentada por método: (1) `@Pre` de campo → (2) `@Pre` de classe → (3) hooks do config do Model → (4) `.pre()`/`.post()` encadeados.

### Instâncias e defaults de campo
- **D-12:** Inicializadores de campo viram defaults **avaliados POR INSERT** (o Model instancia a classe a cada insert para colher valores frescos) — `createdAt = new Date()` funciona naturalmente e **resolve o footgun de timestamp congelado** documentado nos guias de documentDefaults.
- **D-13:** Precedência de defaults: **doc do usuário > documentDefaults do config > inicializadores da classe** (config operacional sobrescreve declaração — mesma lógica do collectionName em D-06).

### Erros de uso incorreto
- **D-14:** Política **híbrida**: erros locais estouram **na decoração** (ex.: `@Pre('metodoInexistente')` — stack aponta a linha da classe); erros estruturais estouram **no compile/construção do Model** (ex.: classe sem `@Schema`, classe sem campos decorados). Sempre `MongoatValidationError` com `.code` estável (Fase 3).

### Naming e exports
- **D-15:** **Símbolo único**: `Schema` é a função-decorator E carrega `Schema.compile` estático. Todos os decorators saem do **barrel principal** (subpaths foram removidos na 1.1.0 — não reintroduzir).

### DX do tsconfig
- **D-16:** **Guard em runtime** contra o modo legado: decorators detectam a ausência do `context.kind` TC39 (assinatura de `experimentalDecorators`) e lançam `MongoatValidationError` com mensagem apontando o fix no tsconfig + página de docs com os requisitos (TS 5.x, sem `experimentalDecorators`).

### Claude's Discretion
- Codes exatos dos novos erros (ex.: `INVALID_HOOK_METHOD`, `INVALID_DECORATED_CLASS`, `LEGACY_DECORATORS_MODE`) — nomear em consistência com o enum existente.
- Checagem de colisão de nomes genéricos no barrel (`Optional`, `Enum`, `Min`...) e orientação de aliasing de import na documentação.
- Mecânica interna do compile (metadata storage via `context.metadata`/`Symbol.metadata` vs registro próprio) — decisão do research/planner respeitando "sem reflect-metadata, sem deps novas".
- Interação do registro de models (`isSameConfig`) com classes decoradas — atenção ao WR-04 aberto do 05-REVIEW (isSameConfig ignora hooks).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Visão do autor
- `src/schema/index.ts` — rascunho comentado da API de decorators (direção desejada: `@Schema('users')`, `@Description`, `@Pattern`, `@Optional`, `@Pre` em campo). As decisões acima refinam este rascunho.

### Contratos a preservar (aditivo sobre a 1.1.0)
- `docs/explanation/versioning.md` — política semver publicada: superfície pública = barrel `src/index.ts`; adições são minor; nada pode quebrar.
- `src/index.ts` — barrel congelado na 1.1.0 (checar colisões de nomes ao adicionar exports).
- `src/types/model.ts` — `ModelValidationSchema` (o alvo do compile) e `CreateModelProps`.
- `src/model/index.ts` — pipeline de hooks da Fase 2 (contrato ctx, registro acumulativo, ordem) e `documentDefaults`.

### Requisitos
- `.planning/REQUIREMENTS.md` §DECO-01..04 — requisitos da fase.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- Pipeline pre/post da Fase 2 (`src/model/index.ts`): decorators de hook são só mais uma porta de REGISTRO — reutilizar o mesmo mecanismo acumulativo/ordem/erros; nada novo no dispatch.
- Hierarquia de erros da Fase 3 (`MongoatValidationError` + `.code`): reutilizar para todos os erros de decorator (D-14, D-16).
- `documentDefaults` existente: D-12/D-13 se integram ao mesmo ponto de aplicação de defaults no insert (defaults por-insert da classe entram ANTES do merge com config).
- Suíte vitest + testcontainers: padrão para os testes de equivalência DECO-03 (compile(classe) ≡ objeto plano equivalente contra Mongo real).

### Established Patterns
- Validação server-side estrita (`additionalProperties: false` recursivo) — o compile deve produzir exatamente o mesmo shape que a API de objetos produz hoje.
- Zero dependências de runtime novas; TS 5.9 já suporta decorators TC39 nativamente (target ES2022, `module: NodeNext` — sem mudanças de build esperadas; validar no research).
- JSDoc público sem IDs internos de planejamento (memória do projeto): os decorators exportados terão JSDoc — não citar D-xx/DECO-xx neles.

### Integration Points
- `Model` constructor (`CreateModelProps.schema`): ponto de detecção classe-decorada vs objeto plano (D-08).
- Registro global de models no `Database` (reuso por collection + `isSameConfig`): classes decoradas passam pelo mesmo caminho após o compile.
- Barrel `src/index.ts`: novos exports (Schema, Prop, Pre, Post, açúcares) — adição minor.

</code_context>

<specifics>
## Specific Ideas

- O rascunho do autor em `src/schema/index.ts` é a referência de ergonomia: classe implements interface do documento, açúcares por campo, `@Pre('insert', hashPassword)` direto no campo `password`.
- Defaults por-insert (D-12) foram escolhidos deliberadamente para matar o footgun de `documentDefaults` estáticos com `new Date()` — tema de sessão inteira de docs (guia document-defaults + tutorial).

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope. (Decorators de índice — ex.: `@Index` na classe — não foram discutidos nem solicitados; indexes permanecem no config por D-06. Se surgir demanda, é candidato a minor futura.)

</deferred>

---

*Phase: 6-api-de-schema-com-decorators-tc39*
*Context gathered: 2026-07-13*
