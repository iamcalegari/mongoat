import { Document } from 'mongodb';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { Database } from '@/database';
import { Model } from '@/model';
import { ModelValidationSchema } from '@/types';
import { METHODS } from '@/utils/enums';

/**
 * Regressão de WR-02 (Code Review da Fase 01).
 *
 * Bugs originais (divergências de `insertMany`/`bulkWrite` em relação a
 * `insert()`):
 * 1. O pre-hook de `insertMany` era vinculado ao objeto CRU do chamador
 *    (`.bind(doc)`) — mutações do hook vazavam para o array de entrada.
 * 2. O hook rodava ANTES do merge com `documentDefaults`, então `this`
 *    dentro do hook não enxergava os defaults (em `insert()`, enxerga).
 * 3. `bulkWrite` reatribuía `insertOne.document` DENTRO do objeto de
 *    operação do chamador, mutando o array de entrada.
 */
interface Doc extends Document {
  name: string;
  status?: string;
  seenStatus?: string;
}

const schema: ModelValidationSchema = {
  bsonType: 'object',
  properties: {
    name: { bsonType: 'string' },
    status: { bsonType: 'string' },
    seenStatus: { bsonType: 'string' },
  },
  required: ['name'],
};

describe('Model — insertMany/bulkWrite não mutam o input e hooks enxergam defaults (WR-02)', () => {
  let db: Database;
  let model: Model<Doc>;

  beforeAll(async () => {
    db = new Database({
      uri: process.env.MONGODB_URI,
      dbName: process.env.MONGODB_DB_NAME,
    });

    await db.connect();

    model = new Model<Doc>({
      collectionName: 'insert_input_isolation',
      allowedMethods: [
        METHODS.INSERT_MANY,
        METHODS.BULK_WRITE,
        METHODS.FIND_MANY,
      ],
      documentDefaults: { status: 'default-status' },
      schema,
    });

    await db.setupCollection(model as unknown as Model);
  });

  afterAll(async () => {
    Database.resetRegistry();
    await db.disconnect();
  });

  it('insertMany: hook enxerga documentDefaults via this e mutações não vazam para o array do chamador', async () => {
    model.pre(METHODS.INSERT_MANY, (ctx) => {
      // `ctx.document` deve ser a cópia já mesclada com os defaults (como
      // em insert()). Migrado para o contrato de `ctx` explícito (D-03).
      ctx.document!.seenStatus = ctx.document!.status;
      ctx.document!.name = `${ctx.document!.name}-hooked`;
    });

    const input: Doc[] = [{ name: 'a' }, { name: 'b' }];

    await model.insertMany(input);

    // Input do chamador intacto — sem defaults nem mutações do hook.
    expect(input).toEqual([{ name: 'a' }, { name: 'b' }]);

    const persisted = await model.findMany({}, { sort: { name: 1 } });

    expect(persisted.map((doc) => doc.name)).toEqual(['a-hooked', 'b-hooked']);
    expect(persisted.every((doc) => doc.seenStatus === 'default-status')).toBe(
      true
    );

    model.pre(METHODS.INSERT_MANY, () => {});
  });

  it('bulkWrite: operações do chamador não são mutadas ao aplicar documentDefaults', async () => {
    const operations = [
      { insertOne: { document: { name: 'bulk-a' } } },
      { insertOne: { document: { name: 'bulk-b' } } },
    ];

    await model.bulkWrite(operations as any);

    // Objetos de operação do chamador intactos — sem defaults injetados.
    expect(operations).toEqual([
      { insertOne: { document: { name: 'bulk-a' } } },
      { insertOne: { document: { name: 'bulk-b' } } },
    ]);

    const persisted = await model.findMany({ name: /^bulk-/ } as any);

    expect(persisted).toHaveLength(2);
    expect(persisted.every((doc) => doc.status === 'default-status')).toBe(
      true
    );
  });

  // Regressão de WR-06 (Code Review da Fase 01): `documentDefaults` era
  // guardado por referência e os merges eram spreads rasos — um default
  // aninhado era compartilhado entre TODOS os inserts; um hook que mutasse
  // `this.meta.source` poluía o default permanentemente.
  it('default aninhado mutado por um hook não vaza para inserts subsequentes (WR-06)', async () => {
    interface MetaDoc extends Document {
      name: string;
      meta?: { source: string };
    }

    const metaModel = new Model<MetaDoc>({
      collectionName: 'insert_defaults_clone',
      allowedMethods: [METHODS.INSERT],
      documentDefaults: { meta: { source: 'api' } },
      schema: {
        bsonType: 'object',
        properties: {
          name: { bsonType: 'string' },
          meta: {
            bsonType: 'object',
            properties: { source: { bsonType: 'string' } },
          },
        },
        required: ['name'],
      },
    });

    await db.setupCollection(metaModel as unknown as Model);

    metaModel.pre(METHODS.INSERT, (ctx) => {
      // Sob o bug, isto mutava a instância COMPARTILHADA do default.
      ctx.document.meta!.source = 'mutated-by-hook';
    });

    const first = await metaModel.insert({ name: 'first' });
    expect(first.meta?.source).toBe('mutated-by-hook');

    // D-01 (Fase 2): `.pre()` passou a ACUMULAR em vez de sobrescrever —
    // não há mais como "resetar" o hook registrando um no-op por cima, e
    // o hook acima seguirá mutando `ctx.document.meta` em todo insert
    // subsequente. A asserção original (segundo insert com default
    // intacto) deixou de ser observável pela SAÍDA do model; o invariante
    // de WR-06 (o default INTERNO compartilhado nunca é corrompido pela
    // mutação do hook no clone por-insert) é verificado diretamente.
    expect(metaModel.documentDefaults.meta?.source).toBe('api');
  });
});
