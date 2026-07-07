# Phase 2: Sistema de hooks completo e API thin nativa - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-07
**Phase:** 2-Sistema de hooks completo e api thin nativa
**Areas discussed:** API de registro & ordem, Post-hook (observar vs transformar), Erros (propagação/fireAndForget/recursão), Escape hatch & bypass do gating

---

## API de registro & ordem

| Option | Description | Selected |
|--------|-------------|----------|
| Métodos encadeáveis .pre()/.post() | Acumula via chamadas encadeadas; mantém assinatura atual (agora acumulativa), imperativa | |
| Declarativo no construtor | new Model({ hooks: { insert: { pre: [...], post: [...] } } }); tudo num lugar, casa com plugins | |
| Ambos (construtor + encadeáveis) | Construtor para o caso comum, .pre()/.post() para registro tardio/condicional | ✓ |

**User's choice:** Ambos (construtor + encadeáveis)
**Notes:** O `.pre()` atual sobrescreve (1 handler) e passa a acumular — breaking de comportamento aceitável em alpha.

---

## Contrato do hook (assinatura)

| Option | Description | Selected |
|--------|-------------|----------|
| Objeto de contexto explícito (ctx) | (ctx) => {} com filter, doc, options, result, metadados; sem this mágico | ✓ |
| Manter this = alvo (compat) | Preserva .bind(); menor mudança, mas escala mal para múltiplos hooks e contexto rico | |
| Você decide | Deixar mecânica para pesquisa/planning | |

**User's choice:** Objeto de contexto explícito (ctx)
**Notes:** Formato exato do ctx por método fica para a pesquisa/planning.

---

## Post-hook: observar vs transformar

| Option | Description | Selected |
|--------|-------------|----------|
| Pode transformar (via ctx.result) | Post-hook reatribui/muta ctx.result; valor final ao caller é o ctx.result pós-hooks | |
| Só observa (result imutável) | Lê ctx.result para efeitos colaterais; retorno ao caller é sempre o cru do driver | |
| Observa por padrão, transforma opt-in | Leitura por padrão; transformar exige sinal explícito | ✓ |

**User's choice:** Observa por padrão, transforma opt-in
**Notes:** Mecanismo do opt-in (retorno do hook vs flag no registro) → pesquisa.

---

## Erros: fireAndForget

| Option | Description | Selected |
|--------|-------------|----------|
| Callback opcional onHookError | onHookError(err, ctx); sem callback → console.error fallback | ✓ |
| console.error e segue | Sempre console.error; simples, mas acopla ao console | |
| Engole em silêncio total | Erro descartado sem ruído; esconde bugs de hook | |

**User's choice:** Callback opcional onHookError (com fallback console.error)
**Notes:** Travado por requisito: pre-hook aborta antes do driver, post-hook propaga por padrão; só o fireAndForget desvia para onHookError.

---

## Guard de recursão

| Option | Description | Selected |
|--------|-------------|----------|
| Chamada aninhada roda sem hooks (modo raw) | Reentrância executa sem re-disparar hooks; completa a chamada, evita loop | ✓ |
| Lança MongoatError explícito | Detecta reentrância e lança; força uso do escape hatch para I/O em hook | |
| Limite de profundidade configurável | Permite N níveis; mais flexível, mais complexo | |

**User's choice:** Chamada aninhada roda sem hooks (modo raw)
**Notes:** Comportamento implícito a documentar; implementação (flag de reentrância por contexto) a critério do planning.

---

## Escape hatch & bypass do gating

| Option | Description | Selected |
|--------|-------------|----------|
| Escape total (bypass de tudo) | getCollection()/getClient()/getDb() = driver cru, sem hooks e sem gating | ✓ |
| Bypassa hooks, mantém gating | Collection ainda respeita allowedMethods via wrapper; vaza abstração, complica tipo | |
| Você decide | Nível de bypass e naming para pesquisa/planning | |

**User's choice:** Escape total (bypass de tudo)
**Notes:** Alinhado ao core value (acesso direto ao driver nativo). Naming (getCollection vs .raw/.native) → planning.

---

## Claude's Discretion

- Mecanismo do opt-in de transformação do post-hook (retorno vs flag).
- Formato e tipagem do `ctx` por método.
- Implementação do modo raw / flag de reentrância do guard de recursão.
- Naming/forma do escape hatch (`getCollection` vs `.raw`/`.native`).
- Design da tipagem genérica de options/retornos precisos (API-01/API-04, largamente mecânica).
- Ordem exata entre hooks do construtor vs encadeáveis.

## Deferred Ideas

- Hooks em transações (session no ctx) — v2.
- Hierarquia completa de erros + sanitização das mensagens do driver — Fase 3 (SEC-03/SEC-04).
- PluginContext tipado/selado — Fase 6 (PLUG-03).
