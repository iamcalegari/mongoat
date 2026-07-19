import type { Db } from 'mongodb';

import { MongoatValidationError } from '@/errors';
import { MIGRATION_ERROR_CODES } from '@/migrate/errors';
import { Model } from '@/model';
import { Schema } from '@/schema';
import type {
  MigrationSchemaHelpers,
  MigrationSchemaTarget,
} from '@/types/migrate';
import type {
  ModelValidationSchema,
  ValidationQueryExpressions,
} from '@/types/model';
import type { SchemaClass } from '@/types/schema';
import {
  applyCollectionIndexes,
  applyCollectionValidator,
  buildJsonSchemaValidator,
} from '@utils/database';

/**
 * @internal
 *
 * Builds `ctx.schema` — the only sanctioned way a migration applies a
 * collection validator/index set. Every helper here is a thin wrapper over
 * the SAME `@utils/database` functions `Model`/`Database` already use
 * (`buildJsonSchemaValidator`, `applyCollectionValidator`,
 * `applyCollectionIndexes`) — there is no code path here that re-derives or
 * hand-rolls a second, potentially weaker, validator.
 *
 * Mirrors `Database#setupCollection`'s orchestration shape
 * (`src/database/index.ts`) but branches on the shape of `target`: a
 * registered `Model` instance already carries a fully-built
 * `validator`/`indexes` (read directly), while a decorated schema class or a
 * plain `ModelValidationSchema` object carries only the raw fragment — it is
 * routed through the exact same augmentation pipeline (`Schema.compile` when
 * needed, then `buildJsonSchemaValidator`) that the `Model` constructor
 * itself runs, so the resulting `$jsonSchema` is byte-identical either way.
 * `applyValidator`'s raw-schema/decorated-class branch also accepts an
 * `options.validationQueryExpressions` — the same channel `CreateModelProps`
 * already exposes as a sibling of `schema` — threaded straight into
 * `buildJsonSchemaValidator` so a migration applying a raw schema produces
 * the exact same validator a `Model` declaring the same expressions would.
 *
 * @param db - The connected native `Db` to apply validators/indexes against.
 * @returns The `MigrationSchemaHelpers` object exposed as `ctx.schema`.
 */
export function createMigrationSchemaHelpers(db: Db): MigrationSchemaHelpers {
  return {
    /**
     * Applies the validator for `target` to `collectionName` via `collMod`.
     *
     * `target instanceof Model` reads the already-built `.validator`/
     * `.validationAction`/`.validationLevel` straight off the instance — the
     * exact triple `Database#setupCollection` applies for that model. A
     * `Model` already embeds its own `validationQueryExpressions` in that
     * built validator, so passing `options.validationQueryExpressions`
     * together with a `Model` target is rejected as ambiguous input — pass a
     * raw schema/decorated class instead, or omit `options`.
     *
     * Otherwise `target` is a decorated schema class or a plain
     * `ModelValidationSchema`: a decorated class is first run through
     * `Schema.compile` to get the raw fragment (properties + filtered
     * `required` — no `_id`, no `additionalProperties: false`), then that
     * fragment — same as a plain schema object passed directly — is run
     * through `buildJsonSchemaValidator` together with
     * `options?.validationQueryExpressions`, which performs the SAME
     * augmentation (`_id` injection, recursive `additionalProperties:
     * false`, `required` merge, and `validationQueryExpressions` merge) the
     * `Model` constructor performs. This is the fix for a migration silently
     * applying a weaker validator than `Model` enforces at runtime:
     * `Schema.compile`'s own doc comment is explicit that augmentation is
     * not its job, so its raw output is never passed straight to `collMod`.
     */
    async applyValidator(
      collectionName: string,
      target: MigrationSchemaTarget,
      options?: { validationQueryExpressions?: ValidationQueryExpressions }
    ): Promise<void> {
      if (target instanceof Model) {
        if (options?.validationQueryExpressions) {
          throw new MongoatValidationError(
            'Cannot pass validationQueryExpressions in options when target is a ' +
              'registered Model instance — the Model already carries its own ' +
              'validationQueryExpressions in its built validator, so combining both ' +
              'sources would be ambiguous. Pass a raw schema/decorated class instead, ' +
              'or omit options.',
            { code: MIGRATION_ERROR_CODES.MIGRATION_VALIDATOR_OPTIONS_CONFLICT }
          );
        }

        await applyCollectionValidator(db, collectionName, {
          validationAction: target.validationAction,
          validationLevel: target.validationLevel,
          validator: target.validator,
        });

        return;
      }

      const rawSchema: ModelValidationSchema =
        typeof target === 'function'
          ? Schema.compile(target as SchemaClass)
          : (target as ModelValidationSchema);

      const validator = buildJsonSchemaValidator({
        schema: rawSchema,
        validationQueryExpressions: options?.validationQueryExpressions,
      });

      await applyCollectionValidator(db, collectionName, validator);
    },

    /**
     * Applies the managed index set for `target` to `collectionName` via
     * the shared diff-based `applyCollectionIndexes` (never an unconditional
     * `dropIndexes()`).
     *
     * `target instanceof Model` reads `.indexes` straight off the instance —
     * the exact set `Database#setupCollection` applies for that model. A
     * decorated schema class or a plain `ModelValidationSchema` carries no
     * index metadata (indexes are declared on `CreateModelProps`, not on the
     * schema itself), so for either of those shapes this is a documented
     * no-op: derive/apply indexes for a raw schema target by registering it
     * as a `Model` first.
     */
    async applyIndexes(
      collectionName: string,
      target: MigrationSchemaTarget
    ): Promise<void> {
      const indexes = target instanceof Model ? target.indexes : [];

      await applyCollectionIndexes(db, collectionName, indexes);
    },
  };
}
