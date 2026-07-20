import { describe, expect, it } from 'vitest';

import { sanitizeFilter } from '@/utils';

/**
 * Unit puro, sem driver — `sanitizeFilter` é uma função síncrona sobre
 * objetos planos. Cobre: remoção incondicional dos operadores de execução
 * de código em qualquer profundidade, preservação de operadores de query
 * legítimos, o modo `stripUnknownTopLevel` (default on/desligável), e a
 * não-mutação do filtro de entrada.
 */
describe('sanitizeFilter — operadores de execução de código (sempre removidos)', () => {
  it('remove $where de topo, mantém campos normais', () => {
    const result = sanitizeFilter({ $where: 'this.a === this.b', name: 'a' });

    expect(result).toEqual({ name: 'a' });
  });

  it('remove $function aninhado dentro de $expr (scanner recursivo)', () => {
    const result = sanitizeFilter({
      $expr: { $function: { body: 'function() { return true; }' } },
    });

    expect(result).toEqual({ $expr: {} });
  });

  it('remove $where dentro de um array em $and, preserva o restante', () => {
    const result = sanitizeFilter({
      $and: [{ $where: 'x' }, { age: { $gt: 1 } }],
    });

    expect(result).toEqual({ $and: [{}, { age: { $gt: 1 } }] });
  });

  it('remove $accumulator de topo, preserva $in', () => {
    const result = sanitizeFilter({
      $accumulator: { init: () => 0 },
      tags: { $in: [1, 2] },
    });

    expect(result).toEqual({ tags: { $in: [1, 2] } });
  });
});

describe('sanitizeFilter — stripUnknownTopLevel (default true)', () => {
  it('remove $ne de topo por padrão (não está na allowlist de topo)', () => {
    const result = sanitizeFilter({ $ne: null, name: 'a' });

    expect(result).toEqual({ name: 'a' });
  });

  it('preserva $or (operador lógico conhecido)', () => {
    const filter = { $or: [{ age: { $gt: 1 } }, { age: { $lt: 0 } }] };
    const result = sanitizeFilter(filter);

    expect(result).toEqual(filter);
  });

  it('stripUnknownTopLevel: false preserva chaves $ de topo desconhecidas, mas ainda remove operadores de execução de código', () => {
    const result = sanitizeFilter(
      { $ne: null, $where: 'x', name: 'a' },
      { stripUnknownTopLevel: false }
    );

    expect(result).toEqual({ $ne: null, name: 'a' });
  });
});

describe('sanitizeFilter — não muta o original / preserva instâncias BSON-like', () => {
  it('não muta o objeto de filtro original', () => {
    const original = { $where: 'x', name: 'a' };
    const result = sanitizeFilter(original);

    expect(original).toEqual({ $where: 'x', name: 'a' });
    expect(result).not.toBe(original);
    expect(result).toEqual({ name: 'a' });
  });

  it('não recursa em uma instância de classe (não plain object) — passa por referência intacta', () => {
    class Tag {
      constructor(public value: string) {}
    }

    const tag = new Tag('legítimo');
    const result = sanitizeFilter({ tag, name: 'a' });

    expect(result.tag).toBe(tag);
  });
});
