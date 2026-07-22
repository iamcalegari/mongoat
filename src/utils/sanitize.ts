/**
 * Sanitização de filtro de input não-confiável.
 *
 * `sanitizeFilter` é um utilitário OPT-IN: o dev aplica explicitamente ao
 * filtro vindo de HTTP/JSON não confiável (query string, body) — NÃO é
 * chamado automaticamente por nenhum método do `Model`. Sanitização
 * automática agressiva quebraria queries legítimas com operadores; o guard
 * incondicional de `$where` (`assertNoWhere`, `src/model/index.ts`) é a
 * responsabilidade DIFERENTE, sempre ativa, que cobre o caso não-desligável
 *. As duas se sobrepõem em detectar `$where`, mas têm gatilhos e
 * call-sites diferentes.
 */

/**
 * Operadores que executam JavaScript arbitrário no servidor MongoDB —
 * neutralizados incondicionalmente pelo `sanitizeFilter`, em QUALQUER
 * profundidade do filtro (inclusive dentro de `$expr`, sem caso especial:
 * a varredura genérica já desce em `$expr` e encontra `$function` lá
 * dentro).
 */
const CODE_EXECUTION_OPERATORS = new Set([
  '$where',
  '$function',
  '$accumulator',
]);

/**
 * Allowlist de chaves `$` VÁLIDAS NO NÍVEL DE TOPO de um filtro MongoDB —
 * usada apenas quando `stripUnknownTopLevel` está ativo (default), para
 * decidir o que PRESERVAR nesse nível. `$gt`/`$in`/`$ne`/`$exists`/... são
 * operadores de CAMPO (só fazem sentido aninhados sob um seletor de campo,
 * ex. `{ age: { $gt: 1 } }`) — nunca aparecem como chave de topo legítima
 * de um filtro, então NÃO entram nesta lista; um `{ $ne: null }` de topo é
 * o padrão clássico de query-selector injection e é removido. Esses
 * operadores de campo continuam preservados normalmente (`$gt`, `$in`,
 * `$and`, `$or`, ...) porque este passo só inspeciona as chaves do
 * NÍVEL MAIS EXTERNO do filtro — nunca desce recursivamente — então um
 * `$gt` aninhado dentro de `$and`/`tags: { $in: [...] }` nunca é tocado
 * por este loop.
 */
const TOP_LEVEL_QUERY_OPERATORS = new Set([
  '$and',
  '$or',
  '$nor',
  '$expr',
  '$text',
  '$comment',
  '$jsonSchema',
]);

/**
 * Discriminador de "plain object" — MESMA lógica de `cloneDocumentDefaults`
 * (`src/model/index.ts`) reaproveitada aqui de propósito: instâncias de
 * classe do BSON (`ObjectId`, `Date`, `RegExp`, `Buffer`) NÃO são plain
 * objects por este critério, então o scanner/clone abaixo nunca recursa
 * nelas nem destrói seu protótipo.
 */
export function isPlainObject(
  value: unknown
): value is Record<string, unknown> {
  return (
    !!value &&
    typeof value === 'object' &&
    (Object.getPrototypeOf(value) === Object.prototype ||
      Object.getPrototypeOf(value) === null)
  );
}

/**
 * Scanner recursivo único, reusado tanto por `sanitizeFilter` (lista maior:
 * operadores de execução de código) quanto pelo guard incondicional de
 * `$where` do `Model` (`assertNoWhere`, `src/model/index.ts`) —
 * evita duplicar a lógica de percorrer objetos/arrays em qualquer
 * profundidade (`$and`/`$or`/`$nor`/`$in` etc.).
 *
 * Retorna a PRIMEIRA chave proibida encontrada (ou `undefined` se nenhuma
 * ocorrer), percorrendo arrays e plain objects recursivamente. Folhas não
 * plain-object (`ObjectId`/`Date`/`RegExp`/`Buffer`/primitivos) encerram a
 * recursão naquele ramo.
 */
export function findForbiddenOperator(
  value: unknown,
  forbidden: ReadonlySet<string>
): string | undefined {
  if (Array.isArray(value)) {
    for (const item of value) {
      const hit = findForbiddenOperator(item, forbidden);

      if (hit) return hit;
    }

    return undefined;
  }

  if (isPlainObject(value)) {
    for (const [key, val] of Object.entries(value)) {
      if (forbidden.has(key)) return key;

      const hit = findForbiddenOperator(val, forbidden);

      if (hit) return hit;
    }
  }

  return undefined;
}

/**
 * Deep-clone restrito a plain objects/arrays — MESMO padrão de
 * `cloneDocumentDefaults` (`src/model/index.ts`). Não usa
 * `structuredClone`: um filtro pode conter instâncias de classe do BSON
 * (`ObjectId`, `Date`, `RegExp`), cujo protótipo `structuredClone`
 * destruiria. `sanitizeFilter` nunca muta o filtro original do dev — opera
 * sempre sobre este clone.
 */
function cloneFilter<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((entry) => cloneFilter(entry)) as unknown as T;
  }

  if (isPlainObject(value)) {
    const cloned: Record<string, unknown> = {};

    for (const [key, entry] of Object.entries(value)) {
      cloned[key] = cloneFilter(entry);
    }

    return cloned as T;
  }

  return value;
}

function stripCodeExecutionOperators(value: unknown): void {
  if (Array.isArray(value)) {
    value.forEach(stripCodeExecutionOperators);

    return;
  }

  if (isPlainObject(value)) {
    for (const key of Object.keys(value)) {
      if (CODE_EXECUTION_OPERATORS.has(key)) {
        delete value[key];
        continue;
      }

      stripCodeExecutionOperators(value[key]);
    }
  }
}

/**
 * @public
 *
 * Opções de `sanitizeFilter`.
 */
export interface SanitizeFilterOptions {
  /**
   * Remove chaves de topo iniciadas por `$` que não estejam na allowlist de
   * operadores de query conhecidos — proteção contra query-selector
   * injection clássico (ex.: `{ $ne: null }` injetado como valor de um
   * campo esperado como string). Default: `true`.
   */
  stripUnknownTopLevel?: boolean;
}

/**
 * @public
 *
 * Sanitiza um filtro de input não-confiável. OPT-IN — o dev chama
 * explicitamente antes de montar/passar o filtro a um método do `Model`;
 * nenhum método do `Model` chama isto automaticamente.
 *
 * SEMPRE neutraliza (qualquer profundidade, dentro de `$and`/`$or`/`$nor`/
 * arrays, inclusive dentro de `$expr`): `$where`, `$function`,
 * `$accumulator` — os três vetores de execução de JavaScript arbitrário no
 * servidor MongoDB.
 *
 * Quando `stripUnknownTopLevel` é `true` (default), TAMBÉM remove chaves
 * de topo iniciadas por `$` que não estejam na allowlist de operadores de
 * query conhecidos (`$gt`, `$in`, `$and`, `$or`, `$expr`, ...) — protege
 * contra query-selector injection clássico. Desligável via
 * `{ stripUnknownTopLevel: false }`; mesmo desligado, os operadores de
 * execução de código continuam sendo removidos incondicionalmente.
 *
 * PRESERVA operadores de query normais em qualquer profundidade (`$gt`,
 * `$in`, `$and`, `$or`, ...) — senão seria inútil para queries legítimas.
 * Nunca muta o filtro de entrada (opera sobre um clone); instâncias BSON
 * (`ObjectId`/`Date`/`RegExp`/`Buffer`) não são recursadas nem têm o
 * protótipo destruído.
 *
 * @param filter - Filtro potencialmente vindo de input não-confiável.
 * @param options - Ver `SanitizeFilterOptions`.
 * @returns Um NOVO objeto de filtro sanitizado — o `filter` original não é
 * modificado.
 */
export function sanitizeFilter<T extends Record<string, unknown>>(
  filter: T,
  options: SanitizeFilterOptions = {}
): T {
  const { stripUnknownTopLevel = true } = options;
  const clone = cloneFilter(filter);

  stripCodeExecutionOperators(clone);

  if (stripUnknownTopLevel) {
    for (const key of Object.keys(clone)) {
      if (key.startsWith('$') && !TOP_LEVEL_QUERY_OPERATORS.has(key)) {
        delete (clone as Record<string, unknown>)[key];
      }
    }
  }

  return clone;
}
