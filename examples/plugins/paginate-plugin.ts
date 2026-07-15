/**
 * Plugin que registra um static `paginate(page, pageSize)` via
 * `ctx.static(...)` — usa o escape hatch `this.getCollection()` para tocar
 * a `Collection` nativa do driver oficial diretamente. `this` dentro do
 * static já vem bound ao model pelo mesmo Proxy trap que faz o bind dos 12
 * métodos nativos (D-12) — nenhum `.bind()` manual aqui.
 *
 * O autor do plugin declara o SHAPE do static (`PaginateStatic`) só como
 * documentação/referência — a tipagem que o CONSUMIDOR efetivamente
 * enxerga no call-site vem de module augmentation (ver `augmentation.ts`,
 * D-09b), não deste tipo.
 * @see https://github.com/iamcalegari/mongoat
 */
import type { Document, WithId } from 'mongodb';

import type { Model } from '@/model';
import type { Plugin } from '@/types';

export type PaginateStatic<ModelType extends Document> = (
  page: number,
  pageSize: number
) => Promise<WithId<ModelType>[]>;

export function paginate<
  ModelType extends Document = Document,
>(): Plugin<ModelType> {
  return {
    name: 'paginate',
    setup(ctx) {
      ctx.static(
        'paginate',
        async function (
          this: Model<ModelType>,
          page: number,
          pageSize: number
        ) {
          return this.getCollection()
            .find({})
            .skip((page - 1) * pageSize)
            .limit(pageSize)
            .toArray();
        }
      );
    },
  };
}
