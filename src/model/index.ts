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
    [METHODS.UPDATE]: () => {},
    [METHODS.UPDATE_MANY]: () => {},
    [METHODS.INSERT]: () => {},
    [METHODS.FIND_MANY]: () => {},
    [METHODS.FIND]: () => {},
    [METHODS.TOTAL]: () => {},
    [METHODS.FIND_BY_ID]: () => {},
    [METHODS.DELETE]: () => {},
    [METHODS.AGGREGATE]: () => {},
    [METHODS.INSERT_MANY]: () => {},
    [METHODS.DELETE_MANY]: () => {},
    [METHODS.BULK_WRITE]: () => {},
  };

  static [kDatabase]: Database | undefined;

  constructor(props: CreateModelProps<ModelType>) {
    if (!Model[kDatabase]) {
      throw new Error('Database not found');
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

    Model[kDatabase].registerModel(this as unknown as Model<Document>);
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
              description: 'Identificador único do registro na base de dados',
            },
            ...this.includeAdditionalPropertiesFalse(schema).properties,
          },
          required: [...((schema.required as string[]) ?? []), '_id'],
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
    const collection = Model[kDatabase]?.getCollection<ModelType>(
      this.collectionName
    ) as Collection<ModelType>;

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

    const collection = Model[kDatabase]?.getCollection<ModelType>(
      this.collectionName
    ) as Collection<ModelType>;

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

    const collection = Model[kDatabase]?.getCollection<ModelType>(
      this.collectionName
    ) as Collection<ModelType>;

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
    const collection = Model[kDatabase]?.getCollection<ModelType>(
      this.collectionName
    ) as Collection<ModelType>;

    return collection.find(filter, options).toArray() ?? [];
  }

  deleteMany(filter: Filter<ModelType>, options: DeleteOptions = {}) {
    const collection = Model[kDatabase]?.getCollection<ModelType>(
      this.collectionName
    ) as Collection<ModelType>;

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

    const collection = Model[kDatabase]?.getCollection<ModelType>(
      this.collectionName
    ) as Collection<ModelType>;

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
    documents.forEach(async (doc) => {
      await this.preMethod[METHODS.INSERT_MANY].bind(doc)(options);
    });

    const _documents = documents.map((doc) => ({
      ...this.documentDefaults,
      ...doc,
    }));

    const collection = Model[kDatabase]?.getCollection<ModelType>(
      this.collectionName
    ) as Collection<ModelType>;
    try {
      return collection.insertMany(_documents, options);
    } catch (err: any) {
      throw new MongoError(JSON.stringify(err, null, 2));
    }
  }

  find(
    filter: Filter<ModelType> = {},
    options?: FindOptions
  ): Promise<WithId<ModelType> | null> | null {
    const collection = Model[kDatabase]?.getCollection<ModelType>(
      this.collectionName
    ) as Collection<ModelType>;

    return collection.findOne(filter, options) ?? null;
  }

  findById(documentId: ObjectId | string, options?: FindOptions) {
    return this.find(
      { _id: toObjectId(documentId) } as unknown as Filter<ModelType>,
      options
    );
  }

  async delete(filter: Filter<ModelType>, options?: FindOneAndDeleteOptions) {
    const collection = Model[kDatabase]?.getCollection<ModelType>(
      this.collectionName
    ) as Collection<ModelType>;

    const result = (await collection.findOneAndDelete(filter, options ?? {}))!;

    return result?.value;
  }

  total(filter: Filter<ModelType> = {}, options: CountDocumentsOptions = {}) {
    const collection = Model[kDatabase]?.getCollection<ModelType>(
      this.collectionName
    ) as Collection<ModelType>;

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
    try {
      const collection = Model[kDatabase]?.getCollection<ModelType>(
        this.collectionName
      ) as Collection<ModelType>;

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
