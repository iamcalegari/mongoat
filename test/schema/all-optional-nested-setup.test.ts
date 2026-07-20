import { Document } from 'mongodb';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { Database } from '@/database';
import { Model } from '@/model';
import { Optional, Prop, Schema } from '@/schema';
import { CreateModelProps } from '@/types';
import { METHODS } from '@/utils/enums';

/**
 * `Schema.compile` de uma classe aninhada totalmente opcional
 * omite `required` quando vazio — este teste prova o efeito
 * SERVER-SIDE dessa correção: o `$jsonSchema` resultante é ACEITO pelo
 * `setupCollection` (createCollection/collMod) contra MongoDB real. Uma
 * comparação deep-equal puramente unitária (nested-compile.test.ts) NÃO
 * captura esta rejeição — o MongoDB só recusa `required: []` aninhado no
 * momento em que valida o schema no servidor, por isso o teste de
 * integração é indispensável para fechar o gap.
 */
interface Doc extends Document {
  name?: string;
  profile?: { nickname?: string; age?: number };
  tags?: { label?: string }[];
}

@Schema('all_optional_nested_profile')
class AllOptionalProfile {
  @Optional()
  @Prop({ bsonType: 'string' })
  nickname?: string;

  @Optional()
  @Prop({ bsonType: 'int' })
  age?: number;
}

@Schema('all_optional_nested_tag')
class AllOptionalTag {
  @Optional()
  @Prop({ bsonType: 'string' })
  label?: string;
}

@Schema('all_optional_nested_type')
class ParentWithProfile {
  @Prop({ bsonType: 'string' })
  name?: string;

  // @Optional() aqui é NO NÍVEL DO PAI (o campo `profile` em si pode faltar
  // do documento) — independente de AllOptionalProfile ter todos os seus
  // PRÓPRIOS campos opcionais (o gap testado é a chave `required`
  // vazia DENTRO do subschema aninhado, não a obrigatoriedade do campo pai).
  @Optional()
  @Prop({ type: AllOptionalProfile })
  profile?: AllOptionalProfile;
}

@Schema('all_optional_nested_items')
class ParentWithTags {
  @Prop({ bsonType: 'string' })
  name?: string;

  @Optional()
  @Prop({ bsonType: 'array', items: AllOptionalTag })
  tags?: AllOptionalTag[];
}

describe('setupCollection — classe aninhada totalmente opcional é aceita pelo $jsonSchema', () => {
  let db: Database;
  let modelWithProfile: Model<Doc>;
  let modelWithTags: Model<Doc>;

  beforeAll(async () => {
    db = new Database({
      uri: process.env.MONGODB_URI,
      dbName: process.env.MONGODB_DB_NAME,
    });

    await db.connect();

    modelWithProfile = new Model<Doc>({
      schema: ParentWithProfile,
      allowedMethods: [METHODS.INSERT],
    } as unknown as CreateModelProps<Doc>);

    modelWithTags = new Model<Doc>({
      schema: ParentWithTags,
      allowedMethods: [METHODS.INSERT],
    } as unknown as CreateModelProps<Doc>);

    // Antes da correção, isto rejeitaria com um erro de
    // criação/validação de coleção — required: [] aninhado é inválido
    // para o $jsonSchema do MongoDB.
    await expect(
      db.setupCollection(modelWithProfile as unknown as Model)
    ).resolves.not.toThrow();
    await expect(
      db.setupCollection(modelWithTags as unknown as Model)
    ).resolves.not.toThrow();
  });

  afterAll(async () => {
    Database.resetRegistry();
    await db.disconnect();
  });

  it('objeto aninhado presente com campos opcionais omitidos é aceito (via @Prop({ type }))', async () => {
    const inserted = await modelWithProfile.insert({
      name: 'alice',
      profile: {},
    });

    expect(inserted.name).toBe('alice');
    expect(inserted.profile).toEqual({});
  });

  it('objeto aninhado inteiro omitido é aceito (via @Prop({ type }))', async () => {
    const inserted = await modelWithProfile.insert({ name: 'bob' });

    expect(inserted.name).toBe('bob');
    expect(inserted.profile).toBeUndefined();
  });

  it('array de itens aninhados totalmente opcionais é aceito (via items:)', async () => {
    const inserted = await modelWithTags.insert({
      name: 'carol',
      tags: [{}],
    });

    expect(inserted.name).toBe('carol');
    expect(inserted.tags).toEqual([{}]);
  });

  it('campo de array de itens aninhados omitido é aceito (via items:)', async () => {
    const inserted = await modelWithTags.insert({ name: 'dave' });

    expect(inserted.name).toBe('dave');
    expect(inserted.tags).toBeUndefined();
  });
});
