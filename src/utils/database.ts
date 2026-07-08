import { ObjectIdLike } from 'bson';
import { ObjectId } from 'mongodb';

import { MongoatValidationError } from '@/errors';

/**
 * Converts a given input into an ObjectId (SEC-02/D-02).
 *
 * Sem argumento (`undefined`) preserva o comportamento histórico de gerar
 * um ObjectId novo e aleatório (`new ObjectId()`) — uso legítimo para criar
 * um `_id` novo antes de inserir um documento (Open Question 1 resolvida em
 * 03-CONTEXT.md: não-breaking).
 *
 * Quando um argumento É fornecido, valida com `ObjectId.isValid` ANTES de
 * instanciar: bson@7 aceita apenas uma string de 24 hex chars, um
 * `ObjectIdLike` ou um `Uint8Array` de 12 bytes — qualquer outra coisa
 * (string malformada, número, array, etc.) lança `MongoatValidationError`
 * (`code: INVALID_OBJECT_ID`) em vez de silenciosamente gerar um id
 * aleatório que não bate com nada (Pitfall 2 / 03-RESEARCH.md).
 *
 * @param inputId - The input value to be converted, which can be a string, ObjectId, ObjectIdLike, or Uint8Array. Omit to generate a new ObjectId.
 * @returns A new ObjectId instance derived from the inputId, or a freshly generated one when omitted.
 */

export function toObjectId(
  inputId?: string | ObjectId | ObjectIdLike | Uint8Array<ArrayBufferLike> | undefined
): ObjectId {
  if (inputId === undefined) {
    return new ObjectId();
  }

  if (!ObjectId.isValid(inputId)) {
    // Nunca serializar o objeto/array inteiro (mensagem clara, sem detalhes
    // internos) — só inclui o valor cru quando é uma string curta, o caso
    // mais comum e diagnosticável.
    const preview = typeof inputId === 'string' ? ` (received "${inputId}")` : '';

    throw new MongoatValidationError(
      `Invalid ObjectId: expected a 24-character hex string, ObjectId, ObjectIdLike or 12-byte Uint8Array${preview}`,
      { code: 'INVALID_OBJECT_ID' }
    );
  }

  return new ObjectId(inputId);
}
