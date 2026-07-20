/**
 * Plugin parametrizável via factory pattern: uma função comum que
 * recebe opções e devolve o plugin (objeto `{ name, setup }`) — nenhuma API
 * extra do core é necessária para suportar opções. O autor do plugin tipa
 * as próprias opções (`TimestampsOptions`) livremente, como qualquer código
 * TypeScript comum.
 * @see https://github.com/iamcalegari/mongoat
 */
import type { Document, UpdateFilter } from 'mongodb';

import type { Plugin } from '@/types';
import { METHODS } from '@/utils/enums';

export interface TimestampsOptions {
  createdField?: string;
  updatedField?: string;
}

/**
 * Registra um pre hook de `insert` (grava o campo de criação) e um pre hook
 * de `update` (grava o campo de atualização a cada chamada). Composição
 * pura sobre `ctx.pre` — o mesmo canal de efeito que qualquer plugin usa
 * para hooks.
 */
export function timestamps<ModelType extends Document = Document>(
  options: TimestampsOptions = {}
): Plugin<ModelType> {
  const createdField = options.createdField ?? 'createdAt';
  const updatedField = options.updatedField ?? 'updatedAt';

  return {
    name: 'timestamps',
    setup(ctx) {
      ctx.pre(METHODS.INSERT, (c) => {
        (c.document as Record<string, unknown>)[createdField] = new Date();
      });

      ctx.pre(METHODS.UPDATE, (c) => {
        const update = c.update as UpdateFilter<Document> & {
          $set?: Record<string, unknown>;
        };

        c.update = {
          ...update,
          $set: { ...update.$set, [updatedField]: new Date() },
        } as UpdateFilter<ModelType>;
      });
    },
  };
}
