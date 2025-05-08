import {
  ClientSession,
  ClientSessionOptions,
  Db,
  Document,
  MongoClient,
  ObjectId,
  ServerApiVersion,
} from 'mongodb';

import { Model } from '@/model';
import { DatabaseConfig, ModelSetup } from '@/types';
import { METHODS } from '@/utils/enums';

const kClient = Symbol('kClient');
const kDb = Symbol('kDb');
const kConnectionUrl = Symbol('kConnectionUrl');
const kCreateClientConnection = Symbol('kCreateClientConnection');
const kGetUrlAndDbName = Symbol('kGetUrlAndDbName');
const kGetDbName = Symbol('kGetDbName');
const KModelProxyHandler = Symbol('KModelProxyHandler');
const KModelMap = Symbol('KModelMap');

export type ObjectID = ObjectId;

export class Database {
  /** @private */
  protected [kClient]: MongoClient | undefined;
  /** @private */
  protected [kDb]: Db | undefined;
  /** @private */
  protected [kConnectionUrl]: string = 'mongodb://127.0.0.1:27017/';
  /** @private */
  private static [KModelMap] = new Map<string, Model | any>();

  /**
   * @public
   *
   * Create a new instance of the Database class.
   * @param config An object with the configuration of the database.
   * @param client An instance of the MongoClient class.
   * @param db An instance of the Db class.
   *
   * If the config object has the uri, username and password properties, the
   * connection url will be created by replacing the placeholders in the uri
   * with the given values.
   *
   * If the config object does not have the uri property, the connection url
   * will be set to the default value of 'mongodb://127.0.0.1:27017/'.
   *
   * If the client and db parameters are not provided, the instances of the
   * MongoClient and Db classes will be created automatically.
   *
   */
  constructor(
    protected config: DatabaseConfig = {},
    client?: MongoClient,
    db?: Db
  ) {
    this[kClient] = client;
    this[kDb] = db;

    if (this.config.uri && this.config.username && this.config.password) {
      const username = process.env.MONGODB_USERNAME || this.config.username;
      const password = process.env.MONGODB_PASSWORD || this.config.password;
      const uri = process.env.MONGODB_URI || this.config.uri;

      this[kConnectionUrl] = uri
        .replace('<username>', username)
        .replace('<password>', password);
    }

    if (!Model.hasDatabase()) Model.setDatabase(this);
  }

  static async loadModels(modelsPath: string) {
    await import(modelsPath);
  }

  /**
   * @public
   *
   * Connect to the database. If the connection is already established, the
   * method does nothing and returns nothing. If the connection is not
   * established, the method returns a promise that resolves to a string
   * containing the connection name.
   *
   * If the NODE_ENV environment variable is set to 'production', the
   * connection is established with the server API version 1, strict mode
   * enabled, and deprecation errors enabled.
   *
   * @returns A promise that resolves to a string containing the connection name,
   * or nothing if the connection is already established.
   */
  connect(): Promise<string> | void {
    if (this.isConnected()) {
      return;
    }

    return this[kCreateClientConnection]({
      ignoreUndefined: true,
      ...(process.env.NODE_ENV === 'production' && {
        serverApi: {
          version: ServerApiVersion.v1,
          strict: true,
          deprecationErrors: true,
        },
      }),
    });
  }

  /**
   * @public
   *
   * Disconnect from the database.
   *
   * If the database connection is not established, the method does nothing.
   *
   * @returns A promise that resolves to nothing.
   */
  async disconnect(): Promise<void> {
    if (!this.isConnected() || !this[kClient]) {
      return;
    }

    await this[kClient].close();

    this[kDb] = undefined;
    this[kClient] = undefined;
  }

  /**
   * @public
   *
   * Returns information about the database.
   *
   * The information returned is the result of the `db.stats()` method.
   *
   * @returns A promise that resolves to an object containing information about the database, or nothing if the connection is not established.
   */
  info() {
    return this[kDb]?.stats();
  }

  /**
   * @deprecated Use the constructor of the `Model` class instead.
   *
   * Creates a new Model or returns an existing one if one with the same collection name already exists.
   *
   * @param collectionName - The name of the collection.
   * @param schema - The schema of the collection. If `validity` is true, the schema is used to validate documents when they are inserted or updated.
   * @param indexes - An array of indexes to create on the collection.
   * @param allowedMethods - An array of methods that are allowed to be called on the model.
   * If `validity` is true, the allowed methods are set to the following:
   * - DELETE
   * - FIND
   * - FIND_BY_ID
   * - FIND_MANY
   * - INSERT
   * - TOTAL
   * - UPDATE
   * - UPDATE_MANY
   * @param documentDefaults - An object with key-value pairs of default values for each new document that is inserted into the collection.
   * @param validationQueryExpressions - A function that returns an object with query expressions that are used to validate documents when they are inserted or updated.
   * @param validity - Whether the model should be valid or not. If true, the model will validate documents when they are inserted or updated.
   *
   * @returns A model with the given properties.
   */
  static defineModel<ModelType extends Document>({
    allowedMethods = [],
    indexes = [],
    schema,
    collectionName,
    documentDefaults = {},
    validationQueryExpressions,
    validity = false,
  }: ModelSetup): Model<ModelType> {
    let model = Database[KModelMap].get(collectionName);

    if (!!model) {
      return model;
    }

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

    const newModel = Model.create({
      allowedMethods: _allowedMethods,
      collectionName,
      documentDefaults,
      indexes,
      schema,
      validationQueryExpressions,
      validity,
    });

    model = new Proxy(newModel, this[KModelProxyHandler]());

    Database[KModelMap].set(collectionName, model);

    return model as Model<ModelType>;
  }

  /**
   * Retrieves a model by its collection name.
   *
   * @param name - The name of the collection for which to retrieve the model.
   * @returns The model associated with the specified collection name, or undefined if it does not exist.
   */
  getModel(name: string) {
    return Database[KModelMap].get(name);
  }

  /**
   * Registers a model in the database model map.
   *
   * This method is used internally by the `Model` class constructor to register a model
   * in the database. If you want to register a model manually, you can use this
   * method.
   *
   * @param model - The model to be registered.
   */
  registerModel(model: Model<Document>) {
    const newModel = new Proxy(model, Database[KModelProxyHandler]());
    Database[KModelMap].set(model.collectionName, newModel);

    return newModel;
  }

  getCollection<T extends Document>(collectionName: string) {
    return this[kDb]?.collection<T>(collectionName);
  }

  async setupCollections(): Promise<void> {
    const modelArray = Database[KModelMap].values();

    for (const model of modelArray) {
      await this.setupCollection(model);
    }
  }

  async setupCollection(model: Model<Document>): Promise<void> {
    const collectionExists = await this.collectionExists(model.collectionName);

    if (!collectionExists) {
      await this[kDb]?.createCollection(model.collectionName);
    }

    if (model.validator) {
      await this.setupValidators(model);
    }

    await this.setupIndexes(model);
  }

  async cleanCollections() {
    if (!this[kDb]) {
      return;
    }

    const collectionsInfo = await this[kDb].collections();

    if (!collectionsInfo) {
      return;
    }

    for (const { collectionName } of collectionsInfo) {
      const collection = this[kDb]?.collection(collectionName);
      const count = (await collection?.countDocuments()) ?? 0;

      if (count <= 0) {
        continue;
      }

      await collection?.deleteMany({});
    }
  }

  async withTransaction(
    fn: (session: ClientSession) => Promise<any> | undefined,
    options?: ClientSessionOptions
  ) {
    const clientSession = this[kClient]?.startSession({ ...options });
    let result: any;

    try {
      await clientSession?.withTransaction(async (session) => {
        result = await fn(session);
      });
      clientSession?.endSession();
    } catch (err) {
      clientSession?.endSession();
      throw err;
    }

    return result;
  }

  static [KModelProxyHandler]() {
    return {
      get(target: Model<Document>, prop: METHODS, receiver: unknown) {
        if (
          target.methods.includes(prop) &&
          !target.allowedMethods.includes(prop)
        ) {
          throw new Error(
            `The method "${prop}" is not allowed in "${target.collectionName}"`
          );
        }

        const originalMethod = target[prop as unknown as keyof typeof target];

        if (typeof originalMethod === 'function') {
          Reflect.get(target, prop, receiver).bind(target);
        }

        return Reflect.get(target, prop, receiver);
      },
    };
  }

  private isConnected(): Boolean {
    return Boolean(this[kDb]) && Boolean(this[kClient]);
  }

  private async collectionExists(collectionName: string): Promise<boolean> {
    const collectionNames = await this[kDb]
      ?.listCollections()
      .map((collInfo) => collInfo.name)
      .toArray();

    return Boolean(
      collectionNames?.some((collName) => collName === collectionName)
    );
  }

  private async setupValidators(model: Model<Document>) {
    const validators = {
      validator: model.validator,
      validationAction: model.validationAction,
      validationLevel: model.validationLevel,
    };

    await this[kDb]?.command({
      collMod: model.collectionName,
      ...validators,
    });
  }

  private async setupIndexes(model: Model<Document>) {
    const collection = this[kDb]?.collection(model.collectionName);

    const newIndexes = model.indexes;

    if (!newIndexes.length) return;

    await collection?.dropIndexes();

    for (const newIndex of newIndexes) {
      const { key, ...options } = newIndex;

      await collection?.createIndex(key, options);
    }
  }

  async [kCreateClientConnection](options?: DatabaseConfig): Promise<string> {
    const { mongoDbName, mongoUrl } = await this[kGetUrlAndDbName]();

    this[kClient] = await MongoClient.connect(mongoUrl, options);
    this[kDb] = this[kClient].db(mongoDbName);

    return mongoDbName;
  }

  async [kGetUrlAndDbName](): Promise<{
    mongoDbName: string;
    mongoUrl: string;
  }> {
    const mongoUrl = this[kConnectionUrl];
    const mongoDbName = await this[kGetDbName]();

    return { mongoDbName, mongoUrl };
  }

  [kGetDbName](): Promise<string> | string {
    if (process.env.MONGODB_DB_NAME) {
      return process.env.MONGODB_DB_NAME;
    }

    if (this.config.dbName) {
      return this.config.dbName;
    }

    const isTestSingleFile = !process.env.PACKAGE;

    if (isTestSingleFile) {
      return 'mongoat-test';
    }

    return `${process.env.PACKAGE}-test-${process.env.JEST_WORKER_ID || process.env.TAP_JOB_ID}`;
  }
}
