# Project Research Summary

**Project:** @iamcalegari/mongoat — MongoDB ODM library
**Domain:** TypeScript npm library (thin, proxy-based MongoDB ODM sobre o driver oficial v7)
**Researched:** 2026-07-03
**Confidence:** HIGH (stack) / MEDIUM (features, architecture, pitfalls)

## Executive Summary

Mongoat é um ODM fino sobre o driver oficial `mongodb` v7, hoje em v1.0.34-alpha, com CRUD completo, hooks `pre`, validação server-side `$jsonSchema` e gating de métodos via Proxy. A pesquisa confirma que a posição "thin, fast, type-safe, native-driver-friendly" é viável e diferenciada — papr valida o modelo de wrapper fino, mongoose demonstra o custo do caminho pesado, e typegoose é o conto de advertência sobre decorators legados. O caminho para a v1.0 estável é: corrigir os bugs conhecidos, completar o sistema de hooks (post hooks, múltiplos handlers, execução async correta), repassar options nativas em todos os métodos, expor o escape hatch nativo, e só então estabilizar a API com testes + CI como gate.

A decisão-chave em aberto (decorators) tem resposta clara e unânime nas quatro dimensões: **decorators TC39 padrão (TS 5.x, sem `experimentalDecorators`, sem `reflect-metadata`), coexistindo com a API de objetos** — decorators são açúcar sintático que compila para a mesma representação interna (`ModelValidationSchema`). Tipos são explícitos nos argumentos do decorator (sem inferência via `emitDecoratorMetadata`, que é incompatível com TC39 e amarraria a lib a um caminho morto). Isso preserva a restrição de dependências mínimas e é um diferencial competitivo: nenhum ODM comparável usa TC39 ainda.

Os riscos principais: (1) o executor de hooks atual tem o bug canônico de `forEach`+async não aguardado — precisa ser corrigido ANTES de expandir o sistema de hooks, ou o bug se propaga; (2) injeção de operadores MongoDB via filtros de usuário não é mitigada pela validação `$jsonSchema` (que só protege insert/update) — exige hardening de segurança antes da v1.0; (3) o salto alpha→1.0.0 é um campo minado de semver — consumidores com `^1.0.0-alpha` resolvem para `1.0.0` automaticamente, então é obrigatório auditar a API, publicar RC e manter CHANGELOG.

## Key Findings

### Recommended Stack

Detalhes em `STACK.md`. Runtime permanece mínimo: `mongodb` ^7 + `bson` ^6, **removendo `json-schema` 0.4.0** (validação é server-side via `$jsonSchema`; pacote de 2013 é redundante). Todo o resto é devDependency.

**Core technologies:**
- TypeScript `^5.9`: decorators TC39 padrão com `Symbol.metadata` estável — sem flags experimentais, sem reflect-metadata
- tsdown `~0.12`: bundler dual CJS/ESM (sucessor explícito do tsup, que está sem manutenção)
- vitest `^4.1` + mongodb-memory-server `^11`: testes unit/integration sem Docker no CI (5–10x mais rápido que jest; substituir ts-jest)
- VitePress `^1.6` + typedoc `^0.28` + typedoc-plugin-markdown `^4`: site de docs + referência de API gerada
- @changesets/cli `^2`: versionamento/CHANGELOG deliberado via PR (melhor que semantic-release para disciplina semver)
- @arethetypeswrong/cli: gate de CI para validar resolução de types no `exports` dual

### Expected Features

Detalhes em `FEATURES.md` (inclui matriz competitiva mongoose/papr/typegoose e grafo de dependências entre features).

**Must have (table stakes):**
- post hooks em todos os métodos CRUD + múltiplos handlers por evento, async-aguardados, com propagação de erro — só `pre` com handler único = sistema pela metade
- Passthrough de options nativas do driver em todos os métodos — "thin" que engole options não é thin
- Escape hatch exposto (`model.collection`/`db`/`client`) — usuários batem nessa parede em dias
- Tipos de retorno TS precisos e consistentes (corrigir `find()`)
- Suíte de testes com CI — sinal de qualidade que gate adoção; zero testes hoje
- CHANGELOG + disciplina semver documentada — v1.0 é um contrato
- API pública documentada

**Should have (competitive):**
- API de schema com decorators TC39 padrão — nenhum ODM comparável faz isso ainda (typegoose está preso no legado)
- API dupla de schema (decorator + objeto) sem forçar migração
- Sistema de plugins model-level (papr não tem; mongoose é só schema-level) — habilita ecossistema
- Site de docs VitePress — maior sinal de qualidade para lib publicada
- Core auditado e sem bugs conhecidos + higiene npm (exports map, dual CJS/ESM)

**Defer (v2+):**
- Hooks integrados a sessões de transação (threading complexo, casos de uso incertos)
- Projection types estritos estilo papr v11 (alta complexidade, escopo de major)
- Anti-features documentadas (não construir): populate/$lookup sugar, virtuals, query builder chainable, migrations, multi-DB, singleton global, class-validator, discriminators, wrapper de change streams

### Architecture Approach

Detalhes em `ARCHITECTURE.md`. O Proxy permanece como **gate guard síncrono** (allow/deny por nome de método); todo pipeline async vive dentro do corpo dos métodos. Decorators são um frontend de metadata (`context.metadata` → `Symbol.metadata` → `Schema.compile(cls)`) que emite o mesmo `ModelValidationSchema` da API de objetos — camada isolada em `src/schema/`, sem acoplamento com Model/Database.

**Major components:**
1. Schema layer (`src/schema/`) — decorators + compiler → `ModelValidationSchema` (puramente aditivo)
2. Model layer (`src/model/`) — CRUD + hook pipeline (`preHooks`/`postHooks: Record<METHODS, HookFn[]>`, execução sequencial com `await`, short-circuit em erro) + plugin registry (plugins aplicados na construção, ANTES do wrap do Proxy)
3. Proxy guard — inalterado estruturalmente; métodos fora do enum METHODS (ex.: `getCollection`) passam sem gating = escape hatch seguro por definição
4. Database layer — conexão, registry, setup de collections + novos `getClient()`/`getDb()`

### Critical Pitfalls

Detalhes em `PITFALLS.md` (11 pitfalls com sinais de alerta e mapeamento por fase).

1. **Hook chain não aguardado** (`insertMany` forEach+async, já confirmado no código) — corrigir na fase de bugs ANTES de expandir hooks; testar valor transformado no banco
2. **Recursão infinita via hooks chamando métodos do model** — guard no executor de hooks + escape hatch construído antes (hooks que precisam consultar o banco usam o driver cru)
3. **Erros de post-hook engolidos** — propagar por padrão; `fireAndForget` só como opt-in explícito
4. **Escolha da API de decorators é irreversível pós-publicação** — TC39 com tipos explícitos, decidido ANTES de implementar; validar em build esbuild/tsdown, não só no runner de testes
5. **Injeção de operadores via filtros** (`$gt:''`, `$where`) — sanitização de filtros + strip incondicional de `$where`; `$jsonSchema` NÃO protege queries
6. **Semver no salto alpha→v1.0** — auditoria de compatibilidade, `v1.0.0-rc.1`, CHANGELOG completo, `npm deprecate` dos alphas
7. **Dual ESM/CJS mal configurado** — `types` primeiro em cada condition; `are-the-types-wrong` como gate de CI; smoke tests CJS+ESM

## Implications for Roadmap

Based on research, suggested phase structure:

### Phase 1: Fundação — bugs + tooling
**Rationale:** os bugs conhecidos (hooks não aguardados, binding do Proxy, `find()` inconsistente, race do registry) corrompem qualquer feature construída em cima; a migração de tooling (vitest, tsdown, drop json-schema, TS 5.9) cria a base para testar tudo que vem depois
**Delivers:** core sem bugs conhecidos + harness de testes funcionando + build dual configurado
**Addresses:** bug-free audited core, npm hygiene (FEATURES)
**Avoids:** Pitfalls 1, 9 (hook não aguardado; race do registry)

### Phase 2: Sistema de hooks completo + API thin
**Rationale:** tudo depende do pipeline de hooks (arrays pre/post, múltiplos handlers, contrato de erro, guard de recursão); options passthrough e escape hatch são aditivos e desbloqueiam hooks úteis e testes de integração
**Delivers:** pre/post hooks em todos os métodos, options nativas em tudo, `getCollection()`/`getClient()`/`getDb()`
**Uses:** HookContext/HookFn types, runHooks() (ARCHITECTURE)
**Avoids:** Pitfalls 2, 3 (recursão; erros engolidos)

### Phase 3: Suíte de testes + CI
**Rationale:** v1.0 sem testes é bloqueador de confiança; testes só fazem sentido depois que o pipeline de hooks está correto (testar código sabidamente quebrado gera cobertura enganosa)
**Delivers:** cobertura unit+integration (memory-server), GitHub Actions, coverage report
**Uses:** vitest + mongodb-memory-server v11 (STACK)

### Phase 4: Hardening de segurança
**Rationale:** injeção de operadores é risco real e não mitigado; precisa vir antes do contrato de estabilidade da v1.0
**Delivers:** sanitização de filtros (strip `$where` incondicional), `ObjectId.isValid` antes de conversão, sanitização de mensagens de erro, guia de segurança
**Avoids:** Pitfall 5 + security mistakes table (PITFALLS)

### Phase 5: Estabilização de API + release v1.0
**Rationale:** o salto alpha→estável exige auditoria deliberada; changesets + attw + RC period são o mecanismo
**Delivers:** auditoria da API pública (diff alpha vs v1.0), deprecações (`Model.create`, `Database.defineModel`), CHANGELOG, pipeline changesets, gate are-the-types-wrong, `v1.0.0-rc` → `v1.0.0` no npm
**Avoids:** Pitfalls 6, 7

### Phase 6: API de schema com decorators
**Rationale:** puramente aditiva sobre a base estável; a decisão TC39+coexistência já está tomada pela pesquisa; publicável como minor
**Delivers:** `@Schema`/`@BsonType`/`@Description`/`@Optional`/`@Pattern`/`@Pre` + `Schema.compile()` + integração transparente no construtor do Model
**Uses:** context.metadata/Symbol.metadata pattern (STACK, ARCHITECTURE)
**Avoids:** Pitfalls 4, 10

### Phase 7: Sistema de plugins
**Rationale:** depende dos hook arrays; contrato `PluginContext` selado definido antes da implementação evita API creep
**Delivers:** `plugins[]` no construtor + `Model.plugin()` global (com enforcement de ordem), interface PluginContext tipada e selada
**Avoids:** Pitfall 8

### Phase 8: Site de documentação
**Rationale:** docs contra API estável não desperdiçam esforço; amplifica o sinal de qualidade de tudo que veio antes
**Delivers:** site VitePress com quick start, guias (hooks, plugins, decorators, segurança, escape hatch), referência TypeDoc gerada, guia de migração do alpha

### Phase Ordering Rationale

- O grafo de dependências de FEATURES.md é explícito: post hooks ← executor async correto; plugins ← post hooks; decorators ← schema de objetos (compilam para ele); v1.0 ← testes + bugs + passthrough + escape hatch; docs ← API estável
- Build order de ARCHITECTURE.md: bugs → hook pipeline → options → escape hatch → testes → schema compiler → decorator integration → plugins → estabilização
- Pitfalls mapeiam 1:1 nas fases (tabela Pitfall-to-Phase em PITFALLS.md); os dois pontos de não-retorno (escolha de decorators, contrato semver v1.0) ficam em fases dedicadas com decisão documentada antes de código

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 6 (Decorators):** validar `Symbol.metadata` polyfill/guard para runtimes < ES2022 e comportamento do transform de decorators no tsdown/rolldown em build real (não só no runner de testes)
- **Phase 5 (Release):** confirmar config exata do `exports` field contra `@arethetypeswrong/cli` quando o build tsdown estiver de pé; cache de binários do mongodb-memory-server no CI

Phases with standard patterns (skip research-phase):
- **Phase 1 (Bugs/tooling):** bugs já diagnosticados linha a linha em CONCERNS.md; migração vitest/tsdown bem documentada
- **Phase 3 (Testes/CI):** padrões estabelecidos (memory-server + GitHub Actions)
- **Phase 4 (Segurança):** checklist OWASP/MongoDB já mapeado em PITFALLS.md
- **Phase 8 (Docs):** VitePress + typedoc-plugin-markdown tem quick start oficial

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Verificado contra docs oficiais, npm registry, typegoose known-issues, TS release notes |
| Features | MEDIUM | Docs oficiais de mongoose/papr/typegoose cross-checked; norma de "v1.0 quality" é consenso de comunidade, não spec |
| Architecture | MEDIUM | Codebase lido diretamente (HIGH nos pontos de Proxy/escape hatch); padrões de hooks/plugins vêm de mongoose/feathers docs |
| Pitfalls | MEDIUM | Cross-verificado em múltiplas fontes; bugs locais confirmados no código (HIGH) |

**Overall confidence:** MEDIUM-HIGH

### Gaps to Address

- Versão mínima de MongoDB suportada — afeta binário do memory-server no CI e comportamentos testáveis; decidir na fase de testes
- `Schema.compile()` público vs interno — decidir na fase de decorators (afeta superfície da API v1.x)
- `Object.freeze(model.validator)` pós-setup para prevenir mutação por plugins — decidir na fase de plugins
- Dual build no gate da v1.0 vs logo após — STACK recomenda no release; FEATURES considera não-bloqueante; decidir no roadmap/planning da Phase 5

## Sources

### Primary (HIGH confidence)
- TypeScript 5.0/5.2/5.9 release notes — decorators TC39, Symbol.metadata
- TC39 proposal-decorator-metadata (GitHub) — status do padrão
- typegoose known-issues — incompatibilidade TC39 documentada pelo próprio projeto
- Mongoose middleware/plugins docs — semântica pre/post, ordering, error short-circuit
- semver.org — spec
- OWASP NoSQL injection testing guide — vetores de injeção
- .planning/codebase/CONCERNS.md — bugs locais confirmados por análise direta do código

### Secondary (MEDIUM confidence)
- pkgpulse: tsup vs tsdown 2026; changesets vs semantic-release 2026
- AppSignal (jun/2025): mongodb-memory-server testing
- papr / Plex Labs blog — filosofia thin-wrapper, projection types
- typedoc-plugin-markdown.org — integração VitePress oficial
- lirantal.com — dual ESM/CJS publishing 2025

### Tertiary (LOW confidence)
- Posts de blog individuais (LogRocket decorators, thecodebarbarian post hooks) — cross-checked com docs oficiais

---
*Research completed: 2026-07-03*
*Ready for roadmap: yes*
