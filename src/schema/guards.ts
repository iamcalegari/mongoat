import { MongoatValidationError } from '@/errors';

/**
 * @public
 *
 * Asserts that a decorator was invoked in standard TC39 mode (TypeScript
 * 5.x default). With `experimentalDecorators: true` the decorator function
 * is called with the legacy `(target, propertyKey, descriptor)` signature —
 * never with a context object carrying `.kind`.
 *
 * Throws `MongoatValidationError` with code `LEGACY_DECORATORS_MODE` when
 * the context does not look like a standard TC39 decorator context, instead
 * of silently producing an empty/broken schema.
 */
// D-16: guard de runtime contra o modo legado — primeira linha de TODO
// decorator exportado. Mesmo shape de `assertNoWhere` (guard pura que lança
// MongoatValidationError com `.code` estável).
export function assertStandardDecoratorMode(context: unknown): void {
  const isStandardMode =
    !!context && typeof context === 'object' && 'kind' in context;

  if (!isStandardMode) {
    throw new MongoatValidationError(
      'Decorator invoked in legacy mode (experimentalDecorators) — remove ' +
        '"experimentalDecorators" from your tsconfig.json. Mongoat only ' +
        'supports standard TC39 decorators (TypeScript 5.x). ' +
        'See: https://iamcalegari.github.io/mongoat/',
      { code: 'LEGACY_DECORATORS_MODE' }
    );
  }
}
