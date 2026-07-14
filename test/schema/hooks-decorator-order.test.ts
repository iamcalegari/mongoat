import { Document } from 'mongodb';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { Database } from '@/database';
import { Model } from '@/model';
import { Post, Pre, Prop, Schema } from '@/schema';
import { CreateModelProps } from '@/types';
import { METHODS } from '@/utils/enums';

/**
 * D-11 (Plano 06-04): ordem determinística de execução de hooks por método —
 * (1) `@Pre` de campo → (2) `@Pre` de classe → (3) hooks do config do Model
 * → (4) `.pre()`/`.post()` encadeados. Integração contra MongoDB real: o
 * `@Pre` de campo TRANSFORMA o valor persistido (não retorna um novo
 * inicializador TC39 — apenas registra um hook no pipeline já existente da
 * Fase 2); o `@Pre` de classe recebe o `ctx` COMPLETO (mesmo contrato de
 * `.pre()`).
 */
interface Doc extends Document {
  name?: string;
  password?: string;
}

const executionOrder: string[] = [];
let classHookSawDocumentName: unknown;
let postHookRan = false;

@Post(METHODS.INSERT, () => {
  postHookRan = true;
})
@Pre(METHODS.INSERT, (ctx) => {
  executionOrder.push('class');
  const typedCtx = ctx as { document: Doc };
  classHookSawDocumentName = typedCtx.document?.name;
})
@Schema('hooks_decorator_order')
class UserSchema {
  @Prop({ bsonType: 'string' })
  name?: string;

  @Pre(METHODS.INSERT, (value) => {
    executionOrder.push('field');
    return `hashed(${value as string})`;
  })
  @Prop({ bsonType: 'string' })
  password?: string;
}

describe('Model — ordem determinística de hooks decorados no insert (D-11)', () => {
  let db: Database;
  let model: Model<Doc>;

  beforeAll(async () => {
    db = new Database({
      uri: process.env.MONGODB_URI,
      dbName: process.env.MONGODB_DB_NAME,
    });

    await db.connect();

    model = new Model<Doc>({
      schema: UserSchema,
      allowedMethods: [METHODS.INSERT],
      hooks: {
        [METHODS.INSERT]: {
          pre: [
            () => {
              executionOrder.push('config');
            },
          ],
        },
      },
    } as unknown as CreateModelProps<Doc>);

    model.pre(METHODS.INSERT, () => {
      executionOrder.push('chained');
    });

    await db.setupCollection(model as unknown as Model);
  });

  afterAll(async () => {
    Database.resetRegistry();
    await db.disconnect();
  });

  it('ordem de execução no insert é campo → classe → config → encadeado (D-11); @Pre de campo transforma o valor persistido; @Pre de classe vê o ctx completo', async () => {
    const inserted = await model.insert({ name: 'alice', password: 'plain' });

    expect(executionOrder).toEqual(['field', 'class', 'config', 'chained']);
    expect(inserted.password).toBe('hashed(plain)');
    expect(classHookSawDocumentName).toBe('alice');
    expect(postHookRan).toBe(true);
  });
});
