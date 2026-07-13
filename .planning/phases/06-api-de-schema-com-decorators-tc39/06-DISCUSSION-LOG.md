# Phase 6: API de schema com decorators (TC39) - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-13
**Phase:** 6-api-de-schema-com-decorators-tc39
**Areas discussed:** Declaração de tipo por campo, Divisão classe × config do Model, Semântica do @Pre, Instâncias e defaults de campo, Erros de uso incorreto, Naming e exports, DX do tsconfig

---

## Declaração de tipo por campo

| Option | Description | Selected |
|--------|-------------|----------|
| @Prop base + açúcares | @Prop({...}) canônico com shape do ModelValidationSchema; @BsonType/@Description/etc. como açúcares composáveis | ✓ |
| Só @Prop genérico | Um único decorator, menos superfície, mais verboso | |
| Só decorators dedicados | Fiel ao rascunho, sem genérico; casos avançados exigiriam mais decorators | |

**User's choice:** @Prop base + açúcares (recomendada)

| Option | Description | Selected |
|--------|-------------|----------|
| Sem restrição de tipo | Semântica JSON Schema pura: campo sem bsonType aceita qualquer tipo | ✓ |
| Default 'string' | Convenção implícita ergonômica, mas surpreende em não-strings | |
| Erro no compile | Fail-loud: bsonType obrigatório | |

**User's choice:** Sem restrição de tipo (recomendada)

| Option | Description | Selected |
|--------|-------------|----------|
| Required por padrão + @Optional | Como no rascunho (gender?); coerente com a validação estrita | ✓ |
| Opcional por padrão + @Required | Menos estrito, diverge do rascunho | |

**User's choice:** Required por padrão + @Optional (recomendada)

| Option | Description | Selected |
|--------|-------------|----------|
| Classes aninhadas | @Prop({ type/items: Classe }), compile recursivo | |
| Objeto JSON Schema inline | Subschema cru no @Prop | |
| Ambos | Classes como caminho principal + inline como escape hatch | ✓ |

**User's choice:** Ambos

| Option | Description | Selected |
|--------|-------------|----------|
| Só os do rascunho | @BsonType, @Description, @Pattern, @Optional | |
| Conjunto estendido | + @Enum, @Min/@Max, @MinLength/@MaxLength | ✓ |

**User's choice:** Conjunto estendido

---

## Divisão classe × config do Model

| Option | Description | Selected |
|--------|-------------|----------|
| Collection default na classe | @Schema('users') define default; config sobrescreve; operacional fica no config | ✓ |
| Classe só marca o shape | @Schema() sem args; collectionName sempre no config | |
| Tudo na classe | @Schema({ collection, indexes, allowedMethods }) | |

**User's choice:** Collection default na classe (recomendada)
**Notes:** DECO-04 (schema: aceita classe OU objeto, transparente) já estava travado pelo requisito — não rediscutido.

| Option | Description | Selected |
|--------|-------------|----------|
| Público no barrel | Schema.compile exportado (introspecção/debug/testes) | ✓ |
| Interno (@internal) | Fora do contrato público | |

**User's choice:** Público no barrel (recomendada)

---

## Semântica do @Pre

| Option | Description | Selected |
|--------|-------------|----------|
| Classe + campo | Classe = ctx completo; campo = açúcar (value, ctx) => novoValor | ✓ |
| Só na classe | DECO-02 literal; menos escopo | |

**User's choice:** Classe + campo (recomendada)

| Option | Description | Selected |
|--------|-------------|----------|
| Sim, @Pre + @Post | Simetria com a API de objetos; @Post só na classe | ✓ |
| Só @Pre | DECO-02 literal | |

**User's choice:** Sim, @Pre + @Post (recomendada)

| Option | Description | Selected |
|--------|-------------|----------|
| Decorators primeiro | campo → classe → config → .pre() encadeados | ✓ |
| Você decide | Planner define a ordem | |

**User's choice:** Decorators primeiro (recomendada)

---

## Instâncias e defaults de campo

| Option | Description | Selected |
|--------|-------------|----------|
| Avaliados por insert | Instancia a classe a cada insert; timestamps frescos (mata o footgun) | ✓ |
| Colhidos 1x no compile | Estáticos; reintroduz o footgun de new Date() congelado | |
| Classe só declaração | Inicializadores ignorados; defaults só no config | |

**User's choice:** Avaliados por insert (recomendada)

| Option | Description | Selected |
|--------|-------------|----------|
| Doc > config > classe | Config operacional sobrescreve declaração (mesma lógica do collectionName) | ✓ |
| Doc > classe > config | Classe vence; inverte a lógica da área anterior | |
| Conflito = erro | Fail-loud na construção | |

**User's choice:** Doc > config > classe (recomendada)

---

## Erros de uso incorreto

| Option | Description | Selected |
|--------|-------------|----------|
| Híbrido | Erros locais na decoração; estruturais no compile/construção | ✓ |
| Tudo imediato | Máximo fail-loud, mas não cobre validações estruturais | |
| Tudo agregado no compile | Uma lista de erros; stack não aponta a linha | |

**User's choice:** Híbrido (recomendada)

---

## Naming e exports

| Option | Description | Selected |
|--------|-------------|----------|
| Símbolo único no barrel | Schema = decorator + .compile estático; tudo no barrel principal | ✓ |
| Símbolos separados | Schema + compileSchema() | |

**User's choice:** Símbolo único no barrel (recomendada)

---

## DX do tsconfig

| Option | Description | Selected |
|--------|-------------|----------|
| Guard em runtime + docs | Detecta assinatura legada (sem context.kind) e lança erro claro | ✓ |
| Só documentação | Requisitos no site/README; erro legado fica difícil de diagnosticar | |

**User's choice:** Guard em runtime + docs (recomendada)

---

## Claude's Discretion

- Codes exatos dos novos erros (INVALID_HOOK_METHOD, INVALID_DECORATED_CLASS, LEGACY_DECORATORS_MODE — nomes finais em consistência com o enum existente)
- Colisão de nomes genéricos no barrel (Optional/Enum/Min...) + orientação de aliasing
- Mecânica interna de metadata do compile (context.metadata/Symbol.metadata vs registro próprio)
- Interação do registro de models (isSameConfig) com classes decoradas (atenção ao WR-04 do 05-REVIEW)

## Deferred Ideas

- Decorator de índice (@Index na classe) — não solicitado; indexes permanecem no config. Candidato a minor futura se houver demanda.
