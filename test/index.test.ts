import { describe, expect, it } from 'vitest';

import * as mongoat from '@/index';

/**
 * 04-01 (docs): guarda de regressão do barrel público raiz.
 *
 * Descoberto durante a geração da Reference (TypeDoc, `entryPoints:
 * ["src/index.ts"]"): `toObjectId` tinha JSDoc `@public` completo e é
 * documentado como parte da API pública em D-04/04-CONTEXT.md, mas NÃO
 * estava re-exportado de `src/index.ts` (só existia em `src/utils/index.ts`)
 * — a Reference gerada não cobriria a função (Rule 1 — bug de barrel).
 *
 * Este teste fixa a superfície pública mínima exportada do barrel raiz para
 * evitar regressão silenciosa (uma função perder a re-export sem quebrar
 * nenhum outro teste, já que os testes internos importam de `@/utils`
 * diretamente em vez do barrel público).
 */
describe('src/index.ts (barrel público raiz)', () => {
  it('exporta toObjectId (SEC-02/D-02/D-04)', () => {
    expect(typeof mongoat.toObjectId).toBe('function');
  });

  it('exporta sanitizeFilter (SEC-01/D-06/D-07)', () => {
    expect(typeof mongoat.sanitizeFilter).toBe('function');
  });

  it('exporta Database, Model, METHODS, CUSTOM_VALIDATION', () => {
    expect(typeof mongoat.Database).toBe('function');
    expect(typeof mongoat.Model).toBe('function');
    expect(mongoat.METHODS).toBeDefined();
    expect(mongoat.CUSTOM_VALIDATION).toBeDefined();
  });

  it('exporta a hierarquia de erros MongoatError', () => {
    expect(typeof mongoat.MongoatError).toBe('function');
    expect(typeof mongoat.MongoatConnectionError).toBe('function');
    expect(typeof mongoat.MongoatDriverError).toBe('function');
    expect(typeof mongoat.MongoatValidationError).toBe('function');
  });
});
