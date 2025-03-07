import {
  ClientSession,
  ClientSessionOptions,
  Db,
  Document,
  MongoClient,
  ObjectId,
  ServerApiVersion,
} from 'mongodb';

import { Model } from '../model';
import { ModelSetup } from '../model/types';
import { Methods } from '../types';
import { DatabaseConfig } from './types';

const kClient = Symbol('kClient');
const kDb = Symbol('kDb');
const kConnectionUrl = Symbol('kConnectionUrl');
const kCreateClientConnection = Symbol('kCreateClientConnection');
const kGetUrlAndDbName = Symbol('kGetUrlAndDbName');
const kGetDbName = Symbol('kGetDbName');

export class Database {
  protected [kClient]: MongoClient | undefined;
  protected [kDb]: Db | undefined;
  protected [kConnectionUrl]: string = 'mongodb://127.0.0.1:27017/';

  private static modelMap: Map<string, Model<Document>> = new Map();

  constructor(
    client?: MongoClient,
    db?: Db,
    protected config: DatabaseConfig = {}
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
  }

  connect(): Promise<string> | void {
    if (this.isConnected()) {
      return;
    }

    return this[kCreateClientConnection]({
      ...(process.env.NODE_ENV === 'production' && {
        serverApi: {
          version: ServerApiVersion.v1,
          strict: true,
          deprecationErrors: true,
        },
      }),
    });
  }

  public defineModel<ModelType extends Document>({
    allowedMethods = [],
    indexes = [],
    schema,
    collectionName,
    documentDefaults = {},
    validationQueryExpressions,
    validity = false,
  }: ModelSetup): Model<ModelType> {
    const model = Database.modelMap.get(collectionName) as Model<ModelType>;

    if (model !== undefined) {
      return model;
    }

    const _allowedMethods = validity
      ? [
          Methods.UPDATE,
          Methods.UPDATE_MANY,
          Methods.INSERT,
          Methods.FIND_MANY,
          Methods.FIND,
          Methods.FIND_BY_ID,
          Methods.DELETE,
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
    const modelValue = new Proxy(newModel, this.modelProxyHandler());

    Database.modelMap.set(collectionName, modelValue);

    return modelValue as Model<ModelType>;
  }

  private modelProxyHandler() {
    return {
      get(target: Model<Document>, prop: Methods, receiver: unknown) {
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

  public async disconnect(): Promise<void> {
    if (!this.isConnected() || !this[kClient]) {
      return;
    }

    await this[kClient].close();

    this[kDb] = undefined;
    this[kClient] = undefined;
  }

  private isConnected(): Boolean {
    return Boolean(this[kDb]) && Boolean(this[kClient]);
  }

  public getCollection<T extends Document>(collectionName: string) {
    return this[kDb]?.collection<T>(collectionName);
  }

  static toObjectId(objectId?: string | ObjectId): ObjectId {
    return new ObjectId(objectId);
  }

  static objectId(): ObjectId {
    return new ObjectId();
  }

  static async loadModels(modelsPath: string) {
    await import(modelsPath);
  }

  async setupCollections(): Promise<void> {
    const modelArray = Database.modelMap.values();

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

    await collection?.dropIndexes();

    const newIndexes = model.indexes;

    for (const newIndex of newIndexes) {
      const { key, ...options } = newIndex;

      await collection?.createIndex(key, options);
    }
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
    if (this.config.dbName) {
      return this.config.dbName;
    }

    if (process.env.MONGODB_DB_NAME) {
      return process.env.MONGODB_DB_NAME;
    }

    const isTestSingleFile = !process.env.PACKAGE;

    if (isTestSingleFile) {
      return 'mongoat-test';
    }

    return `${process.env.PACKAGE}-test-${process.env.JEST_WORKER_ID || process.env.TAP_JOB_ID}`;
  }
}
