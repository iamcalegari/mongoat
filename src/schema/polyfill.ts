/**
 * @internal
 *
 * Side-effect module: guarantees `Symbol.metadata` exists before any
 * Mongoat decorator runs.
 *
 * `Symbol.metadata` belongs to a separate TC39 proposal (decorator
 * metadata) that no Node.js version supported by Mongoat implements
 * natively yet — without it, `context.metadata` arrives as `undefined`
 * inside every decorator and any write to it throws a `TypeError`.
 *
 * `??=` makes this a no-op on engines that already ship the symbol.
 * This file MUST be imported (for its side effect) before any decorator
 * is defined or applied — it is the first import of `src/schema/decorators.ts`.
 */
(Symbol as unknown as { metadata: symbol }).metadata ??= Symbol(
  'Symbol.metadata'
);

export {};
