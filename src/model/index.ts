import {
  AggregateOptions,
  AnyBulkWriteOperation,
  BulkWriteOptions,
  Collection,
  CountDocumentsOptions,
  DeleteOptions,
  Document,
  Filter,
  FindOneAndDeleteOptions,
  FindOneAndUpdateOptions,
  FindOptions,
  InsertOneOptions,
  MongoError,
  ObjectId,
  OptionalUnlessRequiredId,
  UpdateFilter,
  UpdateOptions,
  WithId,
} from 'mongodb';

import {
  CreateIndexProps,
  CreateModelProps,
  DefaultProperties,
  DocumentDefaults,
  ModelDbValidationProps,
  ModelValidationSchema,
  ValidationQueryExpressions,
} from '@/types/model';
import { METHODS } from '@/utils/enums';
import { Database } from '@/database';
import { MongoatError } from '@/errors';
import { toObjectId } from '@/utils';

const kDatabase = Symbol('kDatabase');

/**
 * Lightweight structural comparison used by the `Model` constructor to
 * detect a divergent re-registration of an already-registered
 * `collectionName` (D-06). Compares only the fields that define a model's
 * identity — `allowedMethods` (order-independent) and the fully-built
 * `validator` (which already embeds the schema + validationQueryExpressions)
 * — via `JSON.stringify`. Deliberately hand-rolled instead of pulling in a
 * deep-equal dependency (`lodash.isequal`/`fast-deep-equal`): the surface
 * being compared is small and known, and a generic deep-equal lib would
 * violate the project's "minimum runtime dependencies" constraint.
 */
function isSameConfig(
  existing: Model<Document>,
  candidate: {
    allowedMethods: METHODS[];
    validator: { $jsonSchema: ModelValidationSchema };
  }
): boolean {
  const sameAllowedMethods =
    JSON.stringify([...existing.allowedMethods].sort()) ===
    JSON.stringify([...candidate.allowedMethods].sort());

  const sameValidator =
    JSON.stringify(existing.validator) === JSON.stringify(candidate.validator);

  return sameAllowedMethods && sameValidator;
}

export class Model<ModelType extends Document = Document> {
  collectionName!: string;

  indexes!: CreateIndexProps[];

  validator!: { $jsonSchema: ModelValidationSchema };

  validationAction!: string;

  validationLevel!: string;

  methods!: string[];

  allowedMethods!: METHODS[];

  documentDefaults!: DocumentDefaults<ModelType>;

  preMethod: Record<METHODS, Function> = {
    [METHODS.UPDATE]: () => { },
    [METHODS.UPDATE_MANY]: () => { },
    [METHODS.INSERT]: () => { },
    [METHODS.FIND_MANY]: () => { },
    [METHODS.FIND]: () => { },
    [METHODS.TOTAL]: () => { },
    [METHODS.FIND_BY_ID]: () => { },
    [METHODS.DELETE]: () => { },
    [METHODS.AGGREGATE]: () => { },
    [METHODS.INSERT_MANY]: () => { },
    [METHODS.DELETE_MANY]: () => { },
    [METHODS.BULK_WRITE]: () => { },
  };

  static [kDatabase]: Database | undefined;

  constructor(props: CreateModelProps<ModelType>) {
    if (!Model[kDatabase]) {
      throw new MongoatError(
        'Database not connected — call db.connect() first'
      );
    }

    const {
      allowedMethods = [],
      collectionName,
      documentDefaults = {} as DocumentDefaults<ModelType>,
      indexes = [],
      schema,
      validationQueryExpressions,
      validity,
    } = props;

    const _allowedMethods = validity
      ? [
        METHODS.DELETE,
        METHODS.FIND,
        METHODS.FIND_BY_ID,
        METHODS.FIND_MANY,
        METHODS.INSERT,
        METHODS.TOTAL,
        METHODS.UPDATE,
        METHODS.UPDATE_MANY,
      ]
      : allowedMethods;

    // Built before the existing-registration check (still fully
    // synchronous — no `await` between this and `registerModel()` below,
    // D-07) so `isSameConfig` has the fully-resolved validator to compare
    // against when the collection is already registered (D-06).
    const { validationAction, validationLevel, validator } =
      this.schemaValidatorBuilder({
        schema,
        validationQueryExpressions,
      });

    // D-06: a second `new Model(...)` for an already-registered
    // collectionName used to be silently ignored (`if (!!model) return
    // model;`), discarding whatever config it was called with — even a
    // config that conflicts with the first registration. Now the
    // candidate config is compared against the registered one:
    // identical → reuse the existing (Proxy-wrapped) instance;
    // divergent → fail loudly instead of masking the mismatch.
    const existing = Model[kDatabase].getModel(collectionName);

    if (existing) {
      if (
        isSameConfig(existing as unknown as Model<Document>, {
          allowedMethods: _allowedMethods,
          validator,
        })
      ) {
        return existing;
      }

      // Only the collectionName + the fact of divergence — never the
      // schema content itself (Information Disclosure, T-01-05-01).
      throw new MongoatError(
        `Model "${collectionName}" already registered with a different configuration`
      );
    }

    this.collectionName = collectionName;
    this.indexes = indexes;
    this.allowedMethods = _allowedMethods;
    this.documentDefaults = documentDefaults;
    this.validator = validator;
    this.validationAction = validationAction;
    this.validationLevel = validationLevel;
    this.methods = Object.values(METHODS);

    // registerModel() wraps `this` in the KModelProxyHandler Proxy and
    // stores it in the registry — return that wrapped instance instead of
    // letting the constructor implicitly return the raw `this`. Without
    // this, `new Model(...)` would hand callers an unproxied instance on
    // first construction, silently bypassing the allowedMethods guard
    // (only the second `new Model(...)` call for the same collectionName,
    // which hits the early-return registry lookup above, would return the
    // proxy). See Phase 1 Plan 04 (QUAL-01 — Proxy binding).
    return Model[kDatabase].registerModel(
      this as unknown as Model<Document>
    ) as unknown as Model<ModelType>;
  }

  /** @deprecated */
  static create<ModelType extends Document>(
    props: CreateModelProps<ModelType>
  ): Model<ModelType> {
    return new Model(props);
  }

  private schemaValidatorBuilder({
    schema,
    validationQueryExpressions = {},
  }: {
    schema: ModelValidationSchema;
    validationQueryExpressions?: ValidationQueryExpressions;
    validity?: boolean;
  }): ModelDbValidationProps {
    // Clonar antes de mutar — `includeAdditionalPropertiesFalse` mutates
    // its argument in-place; sem o clone, um objeto de schema reusado
    // (por referência) em dois models vazaria a mutação de volta para o
    // objeto do usuário (QUAL-01). `structuredClone` é global desde Node
    // 17 (sem import) e cobre o shape de `ModelValidationSchema` (plain
    // objects/arrays/strings/booleans — sem funções nem tipos
    // não-cloneáveis).
    const clonedSchema = structuredClone(schema);

    return {
      validationAction: 'error',
      validationLevel: 'strict',
      validator: {
        $jsonSchema: {
          additionalProperties: false,
          bsonType: 'object',
          properties: {
            _id: {
              bsonType: 'objectId',
              description: 'Id of the document in the database',
            },
            ...this.includeAdditionalPropertiesFalse(clonedSchema).properties,
          },
          required: [...((clonedSchema.required as string[]) ?? []), '_id'],
        },
        ...validationQueryExpressions,
      },
    };
  }

  private includeAdditionalPropertiesFalse(
    schema: ModelValidationSchema
  ): ModelValidationSchema {
    if (schema.bsonType === 'object' && !schema.additionalProperties) {
      schema.additionalProperties = false;
    }

    if (schema.items) {
      this.includeAdditionalPropertiesFalse(schema.items);
    }

    if (schema.properties) {
      Object.keys(schema.properties).forEach((key) => {
        this.includeAdditionalPropertiesFalse((schema.properties ?? {})[key]);
      });
    }

    return schema;
  }

  /**
   * @private
   *
   * Retrieves the collection for this model, throwing a typed
   * `MongoatError` instead of handing callers an `undefined` collection
   * (D-10). Without this guard, calling a CRUD method before
   * `db.connect()` let the unchecked `as Collection<ModelType>` cast
   * through, and the driver threw a cryptic `TypeError` on the first
   * property access on `undefined`.
   */
  private getCollectionOrThrow(): Collection<ModelType> {
    const collection = Model[kDatabase]?.getCollection<ModelType>(
      this.collectionName
    );

    if (!collection) {
      throw new MongoatError(
        'Database not connected — call db.connect() first'
      );
    }

    return collection;
  }

  pre<T extends ModelType>(
    methodName: METHODS,
    transformer: (
      this: UpdateFilter<T> & T,
      args: FindOneAndUpdateOptions &
        FindOptions &
        DeleteOptions &
        InsertOneOptions &
        BulkWriteOptions &
        ModelType
    ) => void
  ) {
    this.preMethod[methodName] = transformer;
  }

  aggregate(pipeline: Document[], options: AggregateOptions = {}) {
    const collection = this.getCollectionOrThrow();

    return collection.aggregate(pipeline, options).toArray();
  }

  async update(
    filter: Filter<ModelType>,
    update: UpdateFilter<ModelType>,
    options: FindOneAndUpdateOptions = {}
  ) {
    const _update = { ...update };

    await this.preMethod[METHODS.UPDATE].bind(_update)({
      ...filter,
      ...options,
    });

    const collection = this.getCollectionOrThrow();

    const doc = (await collection.findOneAndUpdate(
      filter,
      _update as UpdateFilter<ModelType>,
      {
        returnDocument: 'after',
        ...options,
      }
    ))!;

    return doc;
  }

  async updateMany(
    filter: Filter<ModelType>,
    update: UpdateFilter<ModelType>,
    options: UpdateOptions = {}
  ) {
    const _update = {
      ...update,
    };

    await this.preMethod[METHODS.UPDATE_MANY].bind(_update)(options);

    const collection = this.getCollectionOrThrow();

    const updateResult = (await collection.updateMany(
      filter,
      _update as UpdateFilter<ModelType>,
      {
        ...options,
      }
    ))!;

    return updateResult;
  }

  findMany(filter: Filter<ModelType> = {}, options: FindOptions = {}) {
    const collection = this.getCollectionOrThrow();

    return collection.find(filter, options).toArray() ?? [];
  }

  deleteMany(filter: Filter<ModelType>, options: DeleteOptions = {}) {
    const collection = this.getCollectionOrThrow();

    return collection.deleteMany(filter, options);
  }

  async insert(
    document: OptionalUnlessRequiredId<ModelType>,
    options: InsertOneOptions = {}
  ) {
    let _document = {
      ...this.documentDefaults,
      ...document,
    };

    await this.preMethod[METHODS.INSERT].bind(_document)(options);

    const collection = this.getCollectionOrThrow();

    try {
      const { insertedId } = await collection.insertOne(_document, options);

      return { _id: insertedId, ..._document } as unknown as WithId<ModelType> &
        DefaultProperties;
    } catch (err: any) {
      throw new MongoError(JSON.stringify(err, null, 2));
    }
  }

  async insertMany(
    documents: OptionalUnlessRequiredId<ModelType>[],
    options: BulkWriteOptions = {}
  ) {
    // WR-02: merge dos defaults ANTES dos hooks, e hooks vinculados às
    // CÓPIAS — mesmo comportamento de insert(): o hook enxerga os
    // documentDefaults via `this` e as mutações do hook não vazam para o
    // array de entrada do chamador.
    const _documents = documents.map((doc) => ({
      ...this.documentDefaults,
      ...doc,
    }));

    await Promise.all(
      _documents.map((doc) =>
        this.preMethod[METHODS.INSERT_MANY].bind(doc)(options)
      )
    );

    const collection = this.getCollectionOrThrow();
    try {
      // WR-01: sem o `await`, a Promise rejeitada do driver escapava do
      // try/catch (código morto) — mesma classe do bug de hooks não
      // aguardados. `return await` garante que rejeições passem pelo catch.
      return await collection.insertMany(_documents, options);
    } catch (err: any) {
      throw new MongoError(JSON.stringify(err, null, 2));
    }
  }

  find(
    filter: Filter<ModelType> = {},
    options?: FindOptions
  ): Promise<WithId<ModelType> | null> {
    const collection = this.getCollectionOrThrow();

    return collection.findOne(filter, options);
  }

  findById(documentId: ObjectId | string, options?: FindOptions) {
    return this.find(
      { _id: toObjectId(documentId) } as unknown as Filter<ModelType>,
      options
    );
  }

  async delete(filter: Filter<ModelType>, options?: FindOneAndDeleteOptions) {
    const collection = this.getCollectionOrThrow();

    // mongodb@7 `findOneAndDelete` resolves the matched document directly
    // (`WithId<ModelType> | null`) — the driver's pre-v5 `{ value }`
    // wrapper no longer exists. Returning `result?.value` here always
    // resolved to `undefined`, silently swallowing every deleted document
    // (Rule 1 fix — found exercising D-12 happy-path CRUD for `delete`).
    return collection.findOneAndDelete(filter, options ?? {});
  }

  total(filter: Filter<ModelType> = {}, options: CountDocumentsOptions = {}) {
    const collection = this.getCollectionOrThrow();

    return collection.countDocuments(filter, options);
  }

  async bulkWrite(
    operations: AnyBulkWriteOperation<ModelType>[],
    options?: BulkWriteOptions
  ) {
    // WR-02: clonar a operação em vez de reatribuir `insertOne.document`
    // in-place — a versão anterior mutava os objetos de operação do
    // próprio chamador (o map retornava as mesmas referências).
    const _operations = operations.map((operation) => {
      const anyOperation = operation as any;

      if (anyOperation.insertOne) {
        return {
          ...anyOperation,
          insertOne: {
            ...anyOperation.insertOne,
            document: {
              ...this.documentDefaults,
              ...anyOperation.insertOne.document,
            },
          },
        } as AnyBulkWriteOperation<ModelType>;
      }

      return operation;
    });

    // Retrieved outside the try block: a MongoatError thrown here (D-10 —
    // no connection) must propagate as-is, not get caught and re-wrapped
    // into a MongoError by the catch below (D-11 scope boundary).
    const collection = this.getCollectionOrThrow();

    try {
      // WR-01: `return await` — ver comentário equivalente em insertMany.
      return await collection.bulkWrite(_operations, options ?? {});
    } catch (err: any) {
      throw new MongoError(JSON.stringify(err, null, 2));
    }
  }

  static hasDatabase() {
    return !!Model[kDatabase];
  }

  static setDatabase(database: Database) {
    Model[kDatabase] = database;
  }
}
