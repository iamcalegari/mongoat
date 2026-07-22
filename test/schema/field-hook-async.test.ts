import { Document } from 'mongodb';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { Database } from '@/database';
import { MongoatDriverError } from '@/errors';
import { Model } from '@/model';
import { extractDecoratorHooks } from '@/schema/compile';
import { Pre, Prop, Schema } from '@/schema';
import { CreateModelProps } from '@/types';
import { METHODS } from '@/utils/enums';

/**
 * O `@Pre` de campo precisa AGUARDAR um transform
 * assíncrono (ex.: `hashPassword`) antes de gravar `document[field]` — sem o
 * `await`, o BSON serializa uma Promise pendente (objeto vazio/descartado)
 * em vez do valor resolvido. O wrapper também NUNCA pode materializar um
 * campo AUSENTE do documento (`fn(undefined, ctx)`), sob pena de mascarar a
 * validação `required` do MongoDB.
 */
interface Doc extends Document {
  username?: string;
  password?: string;
}

// Exemplo-bandeira do JSDoc de `@Pre` (src/schema/decorators.ts) — transform
// genuinamente assíncrono, nunca resolvido de forma síncrona.
async function hashPassword(value: unknown): Promise<string> {
  return `hashed:${value as string}`;
}

@Schema('field_hook_async')
class UserSchema {
  @Prop({ bsonType: 'string' })
  username?: string;

  @Pre(METHODS.INSERT, async (value: unknown) => hashPassword(value))
  @Prop({ bsonType: 'string' })
  password?: string;
}

describe('extractDecoratorHooks — @Pre de campo aguarda transform assíncrono', () => {
  describe('unit: wrapper do @Pre de campo aguarda fn async antes de gravar document[field]', () => {
    it('ctx.document[field] termina como o valor RESOLVIDO, nunca uma Promise pendente', async () => {
      const { pre } = extractDecoratorHooks(UserSchema);
      const fieldHook = pre.find((entry) => entry.method === METHODS.INSERT);

      expect(fieldHook).toBeDefined();

      const ctx = { document: { password: 'plain' } };

      // O wrapper devolvido por extractDecoratorHooks é assíncrono — só
      // depois do await é que ctx.document.password deve estar resolvido.
      await fieldHook?.fn(ctx);

      expect(ctx.document.password).toBe('hashed:plain');
    });

    it('campo AUSENTE do documento nunca é materializado (Object.hasOwn guard)', async () => {
      const { pre } = extractDecoratorHooks(UserSchema);
      const fieldHook = pre.find((entry) => entry.method === METHODS.INSERT);

      const ctx = {
        document: { username: 'alice' } as Record<string, unknown>,
      };

      await fieldHook?.fn(ctx);

      expect(Object.hasOwn(ctx.document, 'password')).toBe(false);
    });
  });

  describe('integração contra MongoDB real', () => {
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
      } as unknown as CreateModelProps<Doc>);

      await db.setupCollection(model as unknown as Model);
    });

    afterAll(async () => {
      Database.resetRegistry();
      await db.disconnect();
    });

    it('um @Pre de campo async persiste o valor resolvido, nunca uma Promise/objeto vazio', async () => {
      const inserted = await model.insert({
        username: 'alice',
        password: 'plain',
      });

      // O documento devolvido pelo insert já reflete o pipeline de pre
      // hooks (mesma disciplina de hooks-decorator-order.test.ts) — prova
      // direta de que o BSON nunca viu uma Promise pendente: uma Promise
      // não resolvida serializaria como `{}` no MongoDB, nunca como a
      // string esperada.
      expect(inserted.password).toBe('hashed:plain');
      expect(typeof inserted.password).toBe('string');
    });

    it('campo required com @Pre de campo ausente do doc de entrada segue rejeitado pelo required do MongoDB', async () => {
      const missingPasswordDoc = { username: 'bob' };

      await expect(
        model.insert(missingPasswordDoc as unknown as Doc)
      ).rejects.toThrow(MongoatDriverError);
    });
  });
});
