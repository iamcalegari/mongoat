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
      throw new MongoatError('Database not connected — call db.connect() first');
    }

    let model = Model[kDatabase].getModel(props.collectionName);

    if (!!model) {
      return model;
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

    this.collectionName = collectionName;
    this.indexes = indexes;
    this.allowedMethods = _allowedMethods;
    this.documentDefaults = documentDefaults;

    const { validationAction, validationLevel, validator } =
      this.schemaValidatorBuilder({
        schema,
        validationQueryExpressions,
      });

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
    await Promise.all(
      documents.map((doc) =>
        this.preMethod[METHODS.INSERT_MANY].bind(doc)(options)
      )
    );

    const _documents = documents.map((doc) => ({
      ...this.documentDefaults,
      ...doc,
    }));

    const collection = this.getCollectionOrThrow();
    try {
      return collection.insertMany(_documents, options);
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

  bulkWrite(
    operations: AnyBulkWriteOperation<ModelType>[],
    options?: BulkWriteOptions
  ) {
    const _operations = operations.map((operation) => {
      const anyOperarion = operation as any;

      if (anyOperarion.insertOne) {
        anyOperarion.insertOne.document = {
          ...this.documentDefaults,
          ...anyOperarion.insertOne.document,
        };
      }

      return operation;
    });

    // Retrieved outside the try block: a MongoatError thrown here (D-10 —
    // no connection) must propagate as-is, not get caught and re-wrapped
    // into a MongoError by the catch below (D-11 scope boundary).
    const collection = this.getCollectionOrThrow();

    try {
      return collection.bulkWrite(_operations, options ?? {});
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
