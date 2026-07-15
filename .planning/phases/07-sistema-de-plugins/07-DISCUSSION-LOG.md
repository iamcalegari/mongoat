# Phase 7: Sistema de plugins - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-15
**Phase:** 7-Sistema de plugins
**Areas discussed:** Forma do contrato de plugin, Ordem e deduplicação, Statics (colisões e tipagem), Falhas e testabilidade, Statics × driver nativo, Plugin × classe decorada (F6), onHookError / fireAndForget, Contrato selado (versionamento)

---

## Forma do contrato de plugin

| Option | Description | Selected |
|--------|-------------|----------|
| Objeto { name, setup } | name estável alimenta dedup/erros; factory para opções | |
| Função pura (ctx) => void | identidade por referência; nome via fn.name (frágil) | |
| Ambos, normalizados | aceita função OU objeto; normaliza para objeto internamente | ✓ |

**User's choice:** Ambos, normalizados (D-01)
**Notes:** Opções via factory pattern — função que recebe opções e retorna o plugin, zero API extra (D-02). PluginContext expõe metadados read-only (collectionName + allowedMethods/schema congelados) além do registro pre/post/static (D-03). Registrada nota técnica: setup() é síncrono (construtor do Model é síncrono).

---

## Ordem e deduplicação

| Option | Description | Selected |
|--------|-------------|----------|
| Globais primeiro | Model.plugin() antes de plugins[]; base global, especialização local | ✓ |
| Locais primeiro | plugins[] do model antes dos globais | |

**User's choice:** Globais primeiro (D-05)
**Notes:** Hooks de plugin entram ANTES do config na ordem D-11 da Fase 6: decorators → PLUGINS → config → chained (D-06). Dedup por referência: mesmo plugin aplica 1x; nomes iguais com referências diferentes = erro DUPLICATE_PLUGIN_NAME (D-07).

Sub-decisão (pipeline):

| Option | Description | Selected |
|--------|-------------|----------|
| Antes do config | decorators → PLUGINS → config → chained | ✓ |
| Depois do config | decorators → config → PLUGINS → chained | |

Sub-decisão (dedup):

| Option | Description | Selected |
|--------|-------------|----------|
| Dedup por referência | mesma referência aplica 1x; nome duplicado com ref diferente erra | ✓ |
| Erro em qualquer duplicata | qualquer duplicata (ref ou nome) lança | |
| Aplica N vezes (sem dedup) | cada aparição aplica de novo | |

---

## Statics (colisões e tipagem)

| Option | Description | Selected |
|--------|-------------|----------|
| Nativo protegido, plugin→plugin erra | colisão com nativo sempre lança; 2 plugins mesmo static = STATIC_COLLISION | ✓ |
| Last-write-wins entre plugins | nativo protegido, mas último plugin sobrescreve | |
| Namespace isolado | statics sob model.plugins.x | |

**User's choice:** Nativo protegido, plugin→plugin erra (D-08)

Sub-decisão (tipagem):

| Option | Description | Selected |
|--------|-------------|----------|
| Generic no construtor infere | tipo de new Model soma statics de cada plugin; autor declara shape | ✓ |
| Interface merging manual | consumidor declara via augmentation/cast | |
| Runtime-only (não tipados) | statics são any/index signature | |

**User's choice:** Generic no construtor infere (D-09)
**Notes:** Flag de research registrado no CONTEXT — inferência através do retorno Proxy do construtor é não-trivial em TS; fallback documentado é interface merging.

---

## Falhas e testabilidade

| Option | Description | Selected |
|--------|-------------|----------|
| Fail-loud na construção | erro no setup aborta new Model; PLUGIN_SETUP_FAILED + cause | ✓ |
| Coletar e reportar em lote | aplica todos, agrega erros no fim | |

**User's choice:** Fail-loud na construção (D-10)

Sub-decisão (reset de teste):

| Option | Description | Selected |
|--------|-------------|----------|
| Reset interno + doc de teste | Model[kResetPlugins]() Symbol-keyed, fora do barrel | ✓ |
| Método público Model.resetPlugins() | reset no barrel público | |
| Sem reset dedicado | re-import/vi.resetModules | |

**User's choice:** Reset interno + doc de teste (D-11)
**Notes:** Endereça área frágil "registry estático sem reset" do CONCERNS.md.

---

## Statics × driver nativo

| Option | Description | Selected |
|--------|-------------|----------|
| `this` do model no static | statics bound ao model; this.getCollection()/this.find() | ✓ |
| Handle no PluginContext | ctx.getCollection() capturado em clausura | |

**User's choice:** `this` do model no static (D-12)
**Notes:** Reusa o binding do Proxy (value.bind(target)) e o escape hatch da Fase 2 — zero API nova.

---

## Plugin × classe decorada (F6)

| Option | Description | Selected |
|--------|-------------|----------|
| Ortogonal — mesmo caminho | plugins operam sobre o Model construído, independem de como o schema foi definido | ✓ |
| Decorator @Use na classe também | segunda via de aplicar plugin via decorator | |

**User's choice:** Ortogonal — mesmo caminho (D-13)
**Notes:** PluginContext.schema read-only reflete o schema já compilado (Schema.compile). Sem decorator @Use — uma única via (o construtor).

---

## onHookError / fireAndForget

| Option | Description | Selected |
|--------|-------------|----------|
| Herdam tudo; onHookError é do model | hooks de plugin = hooks normais; política de erro única por model | ✓ |
| Plugin pode definir onHookError | plugin registra própria política de erro | |

**User's choice:** Herdam tudo; onHookError é do model (D-14)

---

## Contrato selado: versionamento

| Option | Description | Selected |
|--------|-------------|----------|
| Sem versão formal; semver do pacote | selo = imutabilidade + estabilidade do tipo sob semver do pacote | ✓ |
| Campo apiVersion no contrato | core checa apiVersion em runtime | |

**User's choice:** Sem versão formal; semver do pacote (D-15)

---

## Claude's Discretion

- Codes/mensagens exatos dos novos erros (DUPLICATE_PLUGIN_NAME, STATIC_COLLISION, PLUGIN_SETUP_FAILED).
- Nomes internos dos Symbols (kResetPlugins, storage da lista global, flag de trava do PLUG-02).
- Mecânica interna do PluginContext (como pre/post/static alimentam arrays/mapa; congelamento read-only sem cópia profunda desnecessária).
- Assinatura precisa do generic de inferência de statics + decisão final inferência-plena vs. interface-merging (dirigida pelo research).
- Onde vive o flag de "primeiro model construído" e redação da mensagem de erro de ordem do PLUG-02.
- Interação com isSameConfig (WR-04 do 05-REVIEW) no re-registro do mesmo collectionName.

## Deferred Ideas

- Decorator @Use(plugin) na classe — rejeitado (D-13); candidato a fase própria se houver demanda.
- apiVersion / versionamento formal do contrato — rejeitado (D-15); reconsiderar se ecossistema de terceiros exigir.
- Migrations (Fase 8) — já roadmapeado.
