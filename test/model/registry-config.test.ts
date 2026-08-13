import { Document } from 'mongodb';
import { beforeEach, describe, expect, it } from 'vitest';

import { Database } from '@/database';
import { MongoatError } from '@/errors';
import { Model } from '@/model';
import { Prop, Schema } from '@/schema';
import { CreateModelProps, ModelValidationSchema } from '@/types';
import { METHODS } from '@/utils/enums';

/**
 * Bug original: `if (!!model) return model;` ignorava silenciosamente uma
 * segunda `new Model(props)` para a mesma collection com config DIVERGENTE
 * (schema/allowedMethods diferentes) — as novas props eram descartadas sem
 * qualquer aviso. Fix: `isSameConfig()` compara a config recebida com a
 * registrada; se igual, reaproveita a instância existente; se divergente,
 * lança `MongoatError` (sem despejar o schema na mensagem — Information
 * Disclosure).
 *
 * Usa `Database.resetRegistry()` para isolar cada caso.
 */
interface Doc extends Document {
  name: string;
}

const schema: ModelValidationSchema = {
  bsonType: 'object',
  properties: { name: { bsonType: 'string' } },
  required: ['name'],
};

describe('Model — registro atômico com detecção de config divergente', () => {
  beforeEach(() => {
    Database.resetRegistry();

    if (!Model.hasDatabase()) {
      new Database({
        uri: process.env.MONGODB_URI,
        dbName: process.env.MONGODB_DB_NAME,
      });
    }
  });

  it('new Model() com a MESMA config para uma collection já registrada retorna a instância existente', () => {
    const first = new Model<Doc>({
      collectionName: 'registry_config_same',
      allowedMethods: [METHODS.FIND],
      schema,
    });

    const second = new Model<Doc>({
      collectionName: 'registry_config_same',
      allowedMethods: [METHODS.FIND],
      schema,
    });

    expect(second).toBe(first);
  });

  it('new Model() com config DIVERGENTE para uma collection já registrada lança MongoatError sem despejar o schema', () => {
    new Model<Doc>({
      collectionName: 'registry_config_divergent',
      allowedMethods: [METHODS.FIND],
      schema,
    });

    const divergentSchema: ModelValidationSchema = {
      bsonType: 'object',
      properties: {
        name: { bsonType: 'string' },
        extraDivergentField: { bsonType: 'string' },
      },
      required: ['name'],
    };

    let caughtError: unknown;

    try {
      new Model<Doc>({
        collectionName: 'registry_config_divergent',
        allowedMethods: [METHODS.FIND, METHODS.INSERT],
        schema: divergentSchema,
      });
    } catch (err) {
      caughtError = err;
    }

    expect(caughtError).toBeInstanceOf(MongoatError);
    expect((caughtError as Error).message).toContain(
      'registry_config_divergent'
    );
    expect((caughtError as Error).message).toContain('different configuration');
    expect((caughtError as Error).message).not.toContain('extraDivergentField');
  });

  // Regressão: a comparação usava
  // `JSON.stringify` puro, sensível à ordem de inserção das chaves — o mesmo
  // schema declarado com `properties` em ordem distinta gerava um falso
  // "already registered with a different configuration".
  it('new Model() com o MESMO schema declarado com chaves em ordem diferente reusa a instância', () => {
    const first = new Model<Doc>({
      collectionName: 'registry_config_key_order',
      allowedMethods: [METHODS.FIND],
      schema: {
        bsonType: 'object',
        properties: {
          name: { bsonType: 'string' },
          tag: { bsonType: 'string' },
        },
        required: ['name'],
      },
    });

    const second = new Model<Doc>({
      collectionName: 'registry_config_key_order',
      allowedMethods: [METHODS.FIND],
      schema: {
        properties: {
          tag: { bsonType: 'string' },
          name: { bsonType: 'string' },
        },
        required: ['name'],
        bsonType: 'object',
      },
    });

    expect(second).toBe(first);
  });

  // Regressão: `isSameConfig` comparava
  // apenas allowedMethods + validator — re-registração com mesmo schema mas
  // documentDefaults ou indexes diferentes retornava a primeira instância
  // silenciosamente, descartando os novos defaults/índices sem aviso.
  it('new Model() com mesmos schema/métodos mas documentDefaults DIVERGENTES lança MongoatError', () => {
    new Model<Doc>({
      collectionName: 'registry_config_defaults_divergent',
      allowedMethods: [METHODS.FIND],
      documentDefaults: { name: 'active' },
      schema,
    });

    expect(
      () =>
        new Model<Doc>({
          collectionName: 'registry_config_defaults_divergent',
          allowedMethods: [METHODS.FIND],
          documentDefaults: { name: 'draft' },
          schema,
        })
    ).toThrow(MongoatError);
  });

  it('new Model() com mesmos schema/métodos mas indexes DIVERGENTES lança MongoatError', () => {
    new Model<Doc>({
      collectionName: 'registry_config_indexes_divergent',
      allowedMethods: [METHODS.FIND],
      indexes: [{ key: { name: 1 } }],
      schema,
    });

    expect(
      () =>
        new Model<Doc>({
          collectionName: 'registry_config_indexes_divergent',
          allowedMethods: [METHODS.FIND],
          indexes: [{ key: { name: 1 }, unique: true }],
          schema,
        })
    ).toThrow(MongoatError);
  });

  // `isSameConfig` nunca
  // comparou `hooks` — funções não são comparáveis estruturalmente via
  // `stableStringify`. Uma re-registração do MESMO collectionName que
  // declara `props.hooks` costumava cair no early-return de config
  // "idêntica" (allowedMethods/validator/documentDefaults/indexes batiam) e
  // o hook era descartado em silêncio, sem nenhum aviso — o pior tipo de
  // bug para um hook de segurança (ex.: hash de senha). Fix: o branch de
  // re-registro agora falha alto com MODEL_CONFIG_CONFLICT sempre que o
  // candidato declara hooks para uma collectionName já registrada, em vez
  // de tentar comparar as funções.
  it('new Model() com props.hooks presente na re-registração da mesma collectionName lança MongoatError/MODEL_CONFIG_CONFLICT em vez de descartar o hook', () => {
    const first = new Model<Doc>({
      collectionName: 'registry_config_hooks_conflict',
      allowedMethods: [METHODS.FIND],
      schema,
    });

    let caughtError: unknown;

    try {
      new Model<Doc>({
        collectionName: 'registry_config_hooks_conflict',
        allowedMethods: [METHODS.FIND],
        schema,
        hooks: {
          [METHODS.FIND]: {
            pre: [() => {}],
          },
        },
      });
    } catch (err) {
      caughtError = err;
    }

    expect(caughtError).toBeInstanceOf(MongoatError);
    expect((caughtError as MongoatError).code).toBe('MODEL_CONFIG_CONFLICT');
    // O hook NÃO foi silenciosamente anexado à instância já registrada.
    expect(first.hooks[METHODS.FIND].pre).toHaveLength(0);
  });

  it('new Model() SEM hooks e config idêntica continua reusando a instância existente mesmo quando a primeira registração declarou hooks', () => {
    const first = new Model<Doc>({
      collectionName: 'registry_config_hooks_reuse',
      allowedMethods: [METHODS.FIND],
      schema,
      hooks: {
        [METHODS.FIND]: {
          pre: [() => {}],
        },
      },
    });

    const second = new Model<Doc>({
      collectionName: 'registry_config_hooks_reuse',
      allowedMethods: [METHODS.FIND],
      schema,
    });

    expect(second).toBe(first);
    // O hook declarado na primeira registração continua intacto.
    expect(first.hooks[METHODS.FIND].pre).toHaveLength(1);
  });

  // `onHookError` escapava por completo da comparação de re-registro: o
  // `get` trap do Proxy de gating religa a função a cada acesso, então
  // comparar `existing.onHookError` diretamente contra a referência
  // recebida sempre daria `false` — um handler trocado silenciosamente
  // nunca era detectado.
  it('new Model() com referência de onHookError DIVERGENTE na re-registração lança MongoatError/MODEL_CONFIG_CONFLICT nomeando o campo', () => {
    const handlerA = () => {};
    const handlerB = () => {};

    new Model<Doc>({
      collectionName: 'registry_config_hookerror_divergent',
      allowedMethods: [METHODS.FIND],
      schema,
      onHookError: handlerA,
    });

    let caughtError: unknown;

    try {
      new Model<Doc>({
        collectionName: 'registry_config_hookerror_divergent',
        allowedMethods: [METHODS.FIND],
        schema,
        onHookError: handlerB,
      });
    } catch (err) {
      caughtError = err;
    }

    expect(caughtError).toBeInstanceOf(MongoatError);
    expect((caughtError as MongoatError).code).toBe('MODEL_CONFIG_CONFLICT');
    expect((caughtError as Error).message).toContain('onHookError');
  });

  // Caminho feliz que prova que a comparação por identidade não introduz um
  // falso positivo: a MESMA referência de handler nas duas construções
  // continua reusando a instância existente.
  it('new Model() com a MESMA referência de onHookError nas duas construções reusa a instância existente', () => {
    const handler = () => {};

    const first = new Model<Doc>({
      collectionName: 'registry_config_hookerror_reuse_same_ref',
      allowedMethods: [METHODS.FIND],
      schema,
      onHookError: handler,
    });

    const second = new Model<Doc>({
      collectionName: 'registry_config_hookerror_reuse_same_ref',
      allowedMethods: [METHODS.FIND],
      schema,
      onHookError: handler,
    });

    expect(second).toBe(first);
  });

  // Protege contra a regressão de comparar o handler JÁ RESOLVIDO
  // (`defaultOnHookError`) em vez do recebido — se a comparação lesse
  // `this.onHookError` (sempre preenchido pelo fallback), duas omissões
  // comparariam a MESMA referência resolvida por coincidência; o teste
  // continuaria passando mesmo com o bug. O caminho feliz mais comum
  // (nenhuma das duas construções passa `onHookError`) não pode regredir.
  it('new Model() com onHookError OMITIDO nas duas construções continua reusando a instância existente', () => {
    const first = new Model<Doc>({
      collectionName: 'registry_config_hookerror_reuse_omitted',
      allowedMethods: [METHODS.FIND],
      schema,
    });

    const second = new Model<Doc>({
      collectionName: 'registry_config_hookerror_reuse_omitted',
      allowedMethods: [METHODS.FIND],
      schema,
    });

    expect(second).toBe(first);
  });

  // A classe de schema decorada também escapava por completo da
  // comparação — apenas o `validator` já compilado era comparado
  // estruturalmente, então duas classes decoradas DIFERENTES que produzem
  // o MESMO validador (mesmas propriedades, mesmos tipos) passavam pela
  // comparação sem serem notadas. Isola a identidade da classe do
  // conteúdo do schema: as duas classes abaixo compilam para validadores
  // estruturalmente idênticos, então só a comparação por referência
  // detecta a divergência.
  it('new Model() com classe de schema decorada DIVERGENTE (mesmo validador compilado) na re-registração lança MongoatError/MODEL_CONFIG_CONFLICT nomeando o campo', () => {
    @Schema()
    class SchemaA {
      @Prop({ bsonType: 'string' })
      name?: string;
    }

    @Schema()
    class SchemaB {
      @Prop({ bsonType: 'string' })
      name?: string;
    }

    new Model<Doc>({
      collectionName: 'registry_config_schema_class_divergent',
      allowedMethods: [METHODS.FIND],
      schema: SchemaA,
    } as unknown as CreateModelProps<Doc>);

    let caughtError: unknown;

    try {
      new Model<Doc>({
        collectionName: 'registry_config_schema_class_divergent',
        allowedMethods: [METHODS.FIND],
        schema: SchemaB,
      } as unknown as CreateModelProps<Doc>);
    } catch (err) {
      caughtError = err;
    }

    expect(caughtError).toBeInstanceOf(MongoatError);
    expect((caughtError as MongoatError).code).toBe('MODEL_CONFIG_CONFLICT');
    expect((caughtError as Error).message).toContain('schema');
  });

  // A mensagem de divergência nomeia TODOS os campos que divergiram
  // simultaneamente, e nunca o valor que cada um carregava — só o NOME de
  // propriedade de `CreateModelProps`, nunca o conteúdo.
  it('mensagem de divergência nomeia os dois campos divergentes e não vaza os valores', () => {
    new Model<Doc>({
      collectionName: 'registry_config_message_two_fields',
      allowedMethods: [METHODS.FIND],
      documentDefaults: { name: 'valor-marcador-original' },
      indexes: [{ key: { name: 1 } }],
      schema,
    });

    let caughtError: unknown;

    try {
      new Model<Doc>({
        collectionName: 'registry_config_message_two_fields',
        allowedMethods: [METHODS.FIND],
        documentDefaults: { name: 'valor-marcador-divergente' },
        indexes: [{ key: { name: 1 }, unique: true }],
        schema,
      });
    } catch (err) {
      caughtError = err;
    }

    expect(caughtError).toBeInstanceOf(MongoatError);
    expect((caughtError as MongoatError).code).toBe('MODEL_CONFIG_CONFLICT');
    expect((caughtError as Error).message).toContain('documentDefaults');
    expect((caughtError as Error).message).toContain('indexes');
    expect((caughtError as Error).message).not.toContain(
      'valor-marcador-original'
    );
    expect((caughtError as Error).message).not.toContain(
      'valor-marcador-divergente'
    );
  });
});
