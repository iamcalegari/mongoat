# Phase 1: Fundação — Core sem bugs e build moderno - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-03 (área 1) e 2026-07-06 (áreas 2–4, retomadas de checkpoint)
**Phase:** 1-Fundação — Core sem bugs e build moderno
**Areas discussed:** Piso de Node.js e target do build, Exports e formato do pacote, Semântica do registry de models, Validação dos fixes sem suíte de testes

---

## Piso de Node.js e target do build

| Option | Description | Selected |
|--------|-------------|----------|
| Node >= 20.19 (Recomendado) | Destrava structuredClone e require(esm); floor comum em libs modernas de 2026 | ✓ |
| Node >= 22.12 | Floor mais agressivo | |
| Manter Node >= 16.20.1 | Sem breaking de engines | |

**User's choice:** Node >= 20.19
**Notes:** Bump de engines aplicado já na Fase 1 (vs. só na v1.0) — "build novo nasce com o floor definitivo; quebrar em alpha é barato". Target de compilação delegado ao Claude (alinhar ao floor; ES2023).

---

## Exports e formato do pacote

| Option | Description | Selected |
|--------|-------------|----------|
| Dual CJS + ESM (Recomendado) | Ambos os formatos com tipos separados (.d.ts/.d.mts); leitura literal do REL-02 | ✓ |
| ESM-only com require(esm) | Um build ESM; CJS usa require() nativo do floor 20.19; leitura liberal do REL-02 | |
| Você decide | Claude escolhe na pesquisa/planning | |

**User's choice:** Dual CJS + ESM

| Option | Description | Selected |
|--------|-------------|----------|
| Bundler de lib (Recomendado) | tsup ou tsdown: um comando gera ESM + CJS + tipos, resolve @/* e elimina tsc-alias | ✓ |
| tsc duplo + tsc-alias | Dois tsconfigs e pós-processamento; sem dependência nova, mais frágil | |
| Você decide | Claude escolhe | |

**User's choice:** Bundler de lib (tsup vs tsdown fica para a pesquisa)

| Option | Description | Selected |
|--------|-------------|----------|
| Só entry raiz (Recomendado) | Remove subpaths antes da v1.0; menos superfície semver; attw trivial | |
| Manter os 4 subpaths | Preserva import granular; cada subpath precisa de entry ESM+CJS+tipos | |
| Você decide | Claude decide no planning pelo custo do exports map | ✓ |

**User's choice:** Você decide (Claude's discretion)

| Option | Description | Selected |
|--------|-------------|----------|
| Só lib/ (Recomendado) | Publica apenas o build + README/LICENSE; pacote menor | ✓ |
| lib/ + sourcemaps + src/ | Mantém src para sourcemaps resolverem no debug | |
| Você decide | Claude decide no planning | |

**User's choice:** Só lib/

---

## Semântica do registry de models

| Option | Description | Selected |
|--------|-------------|----------|
| Existente + erro se divergir (Recomendado) | Singleton por collection mantido; erro claro se a config da 2ª chamada divergir; check-and-set atômico | ✓ |
| Existente sempre (atual, atomizado) | Só conserta a race; config divergente segue ignorada em silêncio | |
| Erro sempre em duplicata | Registro único explícito (estilo OverwriteModelError do Mongoose); breaking | |

**User's choice:** Existente + erro se divergir

| Option | Description | Selected |
|--------|-------------|----------|
| Setup explícito documentado (Recomendado) | Fluxo registrar → connect → setupCollections; model tardio exige setupCollection manual | ✓ |
| Auto-setup no registro pós-connect | Conveniente, mas async escondido no constructor | |
| Lazy na primeira operação | Setup aguardado no 1º uso; check em todo método CRUD | |

**User's choice:** Setup explícito documentado

| Option | Description | Selected |
|--------|-------------|----------|
| Sim — erro claro (Recomendado) | Remove fallback de teste (mongoat-test); sem dbName explícito → erro descritivo | ✓ |
| Sim — mas só warn + default neutro | Mantém fallback com aviso | |
| Deixar para a Fase 3 (segurança) | Registra como concern | |

**User's choice:** Sim — erro claro (descoberta da análise promovida a bug da Fase 1)

| Option | Description | Selected |
|--------|-------------|----------|
| Sim, mínimo p/ testes (Recomendado) | Reset/clear do registry (possivelmente @internal) junto do fix de race | ✓ |
| Não — deixar para quando doer | Só a Fase 3 decide | |
| Você decide | Claude decide no planning | |

**User's choice:** Sim, mínimo p/ testes

| Option | Description | Selected |
|--------|-------------|----------|
| Erro claro e tipado (Recomendado) | Operação sem conexão lança "Database not connected — call db.connect() first" | ✓ |
| Manter comportamento atual | TypeError críptico do cast as Collection | |
| Você decide | Claude decide | |

**User's choice:** Erro claro e tipado

| Option | Description | Selected |
|--------|-------------|----------|
| Sim, MongoatError base (Recomendado) | Classe própria com cause para os novos erros da Fase 1; re-wrap do driver fica p/ Fase 3 | ✓ |
| Não — Error nativo por enquanto | Hierarquia toda na Fase 3 | |
| Você decide | Claude decide | |

**User's choice:** Sim, MongoatError base

---

## Validação dos fixes sem suíte de testes

| Option | Description | Selected |
|--------|-------------|----------|
| Testes mínimos já na Fase 1 (Recomendado) | Antecipa vitest; semente da suíte da Fase 3; remove ts-jest morto | ✓ |
| Smoke scripts em examples/ | Validação manual não repetível | |
| Validação manual ad-hoc | Sem artefato permanente | |

**User's choice:** Testes mínimos já na Fase 1

| Option | Description | Selected |
|--------|-------------|----------|
| Script npm com attw + publint (Recomendado) | check:package sobre o npm pack; mesmo script entra na CI da Fase 3 | ✓ |
| attw manual quando necessário | Sem script mantido | |
| Você decide | Claude decide | |

**User's choice:** Script npm com attw + publint

| Option | Description | Selected |
|--------|-------------|----------|
| Sim, smoke de consumo (Recomendado) | Mini-projetos CJS (require) e ESM (import) instalam o tarball | ✓ |
| Não — attw + publint bastam | Só análise estática | |
| Você decide | Claude decide | |

**User's choice:** Sim, smoke de consumo

| Option | Description | Selected |
|--------|-------------|----------|
| Só regressão dos fixes (Recomendado) | Um teste por bug corrigido; escopo fechado | |
| Fixes + happy-path CRUD básico | Regressão + smoke de CRUD por método público | ✓ |
| Você decide | Claude decide | |

**User's choice:** Fixes + happy-path CRUD básico (usuário optou por mais cobertura que o recomendado)

| Option | Description | Selected |
|--------|-------------|----------|
| mongodb-memory-server (Recomendado) | Sem Docker; alinhado à pesquisa da Fase 3 | |
| Docker (testcontainers/compose) | Mongo real em container; exige Docker | ✓ |
| Mongo local já instalado | Não reproduzível | |

**User's choice:** Docker (testcontainers/compose) — divergiu da recomendação e da pesquisa

| Option | Description | Selected |
|--------|-------------|----------|
| Docker vira o padrão do projeto (Recomendado) | Substitui memory-server na Fase 1 E na Fase 3; roadmap ajustado no planning da Fase 3 | ✓ |
| Docker só na Fase 1 | Migração p/ memory-server na Fase 3 (retrabalho) | |
| Voltar p/ memory-server | Reverter e realinhar à pesquisa | |

**User's choice:** Docker vira o padrão do projeto (resolução do conflito com o critério da Fase 3)

| Option | Description | Selected |
|--------|-------------|----------|
| Atualizar e rodar como smoke (Recomendado) | examples/ atualizados p/ o novo build e executados uma vez | ✓ |
| Só garantir que compilam | Typecheck sem execução | |
| Ignorar na Fase 1 | Ficam para a Fase 7 (docs) | |

**User's choice:** Atualizar e rodar como smoke

---

## Claude's Discretion

- Target exato de compilação (alinhado ao floor Node 20.19; ES2023 como referência)
- tsup vs tsdown (pesquisa decide)
- Manter ou remover os subpath exports (custo do exports map)
- Design interno do fix de race e da API de reset do registry
- Mecânica da clonagem de schema (structuredClone)

## Deferred Ideas

- Ajuste do critério da Fase 3 no ROADMAP (memory-server → Docker) — decorrência de decisão, aplicar no planning da Fase 3
- Hierarquia completa de erros + sanitização de mensagens do driver — Fase 3 (SEC-04)
