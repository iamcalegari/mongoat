/**
 * D-09b: veredito do research desta fase (`07-RESEARCH.md` § D-09) —
 * inferência-plena de statics via `new Model({ plugins })` NÃO é viável.
 * Duas barreiras estruturais do TypeScript, ambas verificadas por
 * compilação real do `tsc` pinado no projeto:
 *
 * 1. Constructores não podem anotar tipo de retorno (`TS1093`) — elimina
 *    qualquer tentativa de o construtor "prometer" um tipo diferente do já
 *    declarado pela classe.
 * 2. O tipo de `new Model(...)` é sempre o tipo de instância NOMINAL da
 *    classe (parametrizado pelos próprios generics) — nunca reflete o
 *    valor de runtime que o `return` do construtor de fato produz (mesmo
 *    retornando um `Proxy`).
 *
 * A forma OFICIAL de tipar um static registrado por plugin é module
 * augmentation — o mesmo padrão consagrado que o Fastify usa para o mesmo
 * problema estrutural (`decorate()` + `declare module 'fastify'`). Aqui,
 * a augmentation aponta para o MESMO módulo de onde `Model` é importado
 * (`@/model`) — declaration merging `class` + `interface` do TypeScript,
 * sem nenhuma sintaxe extra do core do Mongoat.
 *
 * O "selo" do contrato de plugin não é um `apiVersion` em runtime (D-15
 * rejeitou isso explicitamente) — é a estabilidade do TIPO `.paginate()`
 * sob o semver do próprio pacote: uma mudança de assinatura é, por
 * definição, uma mudança breaking (major).
 * @see https://github.com/iamcalegari/mongoat
 */
import type { Document, WithId } from 'mongodb';

import { Database } from '@/database';
import { Model } from '@/model';
import { ModelValidationSchema } from '@/types';

import { paginate } from './paginate-plugin';

interface PostSchema {
  title: string;
}

const schema: ModelValidationSchema = {
  bsonType: 'object',
  properties: {
    title: { bsonType: 'string', description: 'Post title' },
  },
  required: ['title'],
};

export const database = new Database({ dbName: 'mongoat-example-plugins' });

export const Post = new Model<PostSchema>({
  collectionName: 'posts',
  allowedMethods: [],
  schema,
  plugins: [paginate<PostSchema>()],
});

/**
 * Declaration merging: `interface Model<ModelType>` funde com a `class
 * Model<ModelType extends Document = Document>` já exportada por
 * `@/model` — mesma aridade/constraint de generic (`<ModelType extends
 * Document>`) é o que faz o merge funcionar. Nenhuma mudança na
 * assinatura pública de `Model` foi necessária para habilitar isso.
 */
declare module '@/model' {
  interface Model<ModelType extends Document> {
    paginate(page: number, pageSize: number): Promise<WithId<ModelType>[]>;
  }
}

async function main() {
  await database.connect();
  await database.setupCollections();

  // Sem `as`/`any` no call-site — a tipagem de `.paginate()` vem
  // inteiramente da augmentation acima, não de inferência via
  // `new Model(...)` (provada inviável pelo veredito D-09).
  const firstPage = await Post.paginate(1, 10);

  console.log('First page: ', firstPage);

  await database.disconnect();
}

main();
