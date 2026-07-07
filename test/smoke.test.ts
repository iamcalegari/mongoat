import { describe, expect, it } from 'vitest';

import { Database } from '@/database';
import { Model } from '@/model';
import { METHODS } from '@/utils/enums';

/**
 * Smoke test da infra de teste da Fase 1 (D-12/D-13).
 *
 * Prova a cadeia inteira infra → driver: sobe/conecta num MongoDB real
 * (container gerenciado pelo globalSetup em test/setup/testcontainer.ts),
 * registra um Model simples, insere um documento e o lê de volta.
 *
 * Serve de template para os testes de regressão dos plans 04/05 — pode ser
 * removido/substituído quando eles adicionarem as suítes reais.
 */
describe('infra de teste (smoke)', () => {
  it('insere e lê um documento contra o Mongo do container', async () => {
    const db = new Database({
      uri: process.env.MONGODB_URI,
      dbName: process.env.MONGODB_DB_NAME,
    });

    await db.connect();

    interface SmokeDocument {
      name: string;
    }

    const model = new Model<SmokeDocument>({
      collectionName: 'smoke',
      allowedMethods: [METHODS.INSERT, METHODS.FIND],
      schema: {
        bsonType: 'object',
        properties: {
          name: { bsonType: 'string' },
        },
        required: ['name'],
      },
    });

    await db.setupCollections();

    const inserted = await model.insert({ name: 'mongoat' });
    const found = await model.find({ name: 'mongoat' });

    expect(found?._id.toString()).toBe(inserted._id.toString());
    expect(found?.name).toBe('mongoat');

    await db.disconnect();
  });
});
