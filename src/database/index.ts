import {
  ClientSession,
  ClientSessionOptions,
  Db,
  Document,
  MongoClient,
  ObjectId,
  ServerApiVersion,
} from 'mongodb';

import { MongoatConnectionError, MongoatError } from '@/errors';
import { Model } from '@/model';
import { DatabaseConfig } from '@/types';
import { METHODS } from '@/utils/enums';

const kClient = Symbol('kClient');
const kDb = Symbol('kDb');
const kConnecting = Symbol('kConnecting');
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
  protected [kConnecting]: Promise<string> | undefined;
  /** @private */
  protected [kConnectionUrl]: string = 'mongodb://127.0.0.1:27017/';
  /** @private */
  private static [KModelMap] = new Map<string, Model>();

  /**
   * @public
   *
   * Create a new instance of the Database class.
   * @param config An object with the configuration of the database.
   * @param client An instance of the MongoClient class.
   * @param db An instance of the Db class.
   *
   * The connection url is resolved from the `MONGODB_URI` env var first,
   * then from `config.uri`. Credentials (`MONGODB_USERNAME`/`MONGODB_PASSWORD`
   * env vars, then `config.username`/`config.password`) are optional: when
   * both are present, the `<username>`/`<password>` placeholders in the uri
   * are replaced with them; when absent, the uri is used as-is (e.g. a uri
   * with embedded credentials, an Atlas SRV string, or a local instance
   * without auth).
   *
   * Only when neither `MONGODB_URI` nor `config.uri` is provided does the
   * connection url fall back to the default 'mongodb://127.0.0.1:27017/'.
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

    // CR-01: a URI nunca deve ser descartada por falta de credenciais —
    // exigir `uri && username && password` fazia `new Database({ uri })`
    // (ou config puramente por env var) conectar silenciosamente no
    // default localhost, com risco real de escrita no banco errado.
    const uri = process.env.MONGODB_URI || this.config.uri;

    if (uri) {
      const username = process.env.MONGODB_USERNAME || this.config.username;
      const password = process.env.MONGODB_PASSWORD || this.config.password;

      // WR-09: percent-encoding obrigatório — senhas com caracteres
      // reservados de URI (`@`, `/`, `:`, `%`, `?`, `#`) quebrariam o parse
      // da connection string ou deslocariam sua semântica (tudo após `@`
      // vira host; `?` permitiria injetar opções de conexão).
      this[kConnectionUrl] =
        username && password
          ? uri
              .replace('<username>', encodeURIComponent(username))
              .replace('<password>', encodeURIComponent(password))
          : uri;
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

    // WR-08: duas chamadas concorrentes a connect() passavam ambas pelo
    // guard acima (isConnected() só vira true DEPOIS que kClient/kDb são
    // atribuídos) e criavam DOIS MongoClient — o primeiro era sobrescrito
    // sem close(), vazando o pool de conexões. Reusar a Promise em
    // andamento garante um único client por instância.
    if (this[kConnecting]) {
      return this[kConnecting];
    }

    this[kConnecting] = this[kCreateClientConnection]({
      ignoreUndefined: true,
      ...(process.env.NODE_ENV === 'production' && {
        serverApi: {
          version: ServerApiVersion.v1,
          strict: true,
          deprecationErrors: true,
        },
      }),
    }).finally(() => {
      this[kConnecting] = undefined;
    });

    return this[kConnecting];
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
   * Retrieves a model by its collection name.
   *
   * @param name - The name of the collection for which to retrieve the model.
   * @returns The model associated with the specified collection name, or undefined if it does not exist.
   */
  getModel(name: string) {
    return Database[KModelMap].get(name);
  }

  /**
   * @internal
   *
   * Clears the static model registry (`KModelMap`).
   *
   * Not part of the public API — intended for test suites that need to
   * isolate registry state between cases (D-09). Using this outside of
   * tests will make every previously registered `Model` instance
   * unreachable via `getModel()`.
   */
  static resetRegistry(): void {
    Database[KModelMap].clear();
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

  /**
   * @public
   *
   * Escape hatch honesto: devolve o `MongoClient` **cru** do driver
   * oficial. `Database` nunca é envolvida em Proxy (só `Model` é,
   * via `registerModel()`) — este getter já é "escape total" por natureza,
   * sem nenhum gating a contornar. `undefined` antes de `connect()`.
   *
   * ATENÇÃO — bypass DELIBERADO: o `MongoClient` retornado é o objeto
   * nativo do driver, fora de qualquer abstração do Mongoat. Ao chamar
   * `getClient()` você saiu da zona segura do ODM — agora é o driver puro.
   *
   * @returns O `MongoClient` nativo, ou `undefined` se ainda não conectado.
   */
  getClient(): MongoClient | undefined {
    return this[kClient];
  }

  /**
   * @public
   *
   * Escape hatch honesto: devolve o `Db` **cru** do driver oficial. Mesmo
   * trade-off de `getClient()` — sem Proxy, sem gating,
   * bypass total e deliberado. `undefined` antes de `connect()`.
   *
   * ATENÇÃO — bypass DELIBERADO: o `Db` retornado é o objeto nativo do
   * driver. Ao chamar `getDb()` você saiu da zona segura do ODM — agora é
   * o driver puro.
   *
   * @returns O `Db` nativo, ou `undefined` se ainda não conectado.
   */
  getDb(): Db | undefined {
    return this[kDb];
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

  async withTransaction<T = unknown>(
    fn: (session: ClientSession) => Promise<T> | undefined,
    options?: ClientSessionOptions
  ): Promise<T | undefined> {
    // CR-02: sem este guard, `this[kClient]?.startSession(...)` retornava
    // `undefined` com o banco desconectado e o método resolvia com
    // `undefined` SEM nunca invocar `fn` — perda de escrita silenciosa.
    // Mesmo padrão D-10 de `getCollectionOrThrow`: falhar alto pré-conexão.
    if (!this[kClient]) {
      throw new MongoatConnectionError(
        'Database not connected — call db.connect() first'
      );
    }

    const clientSession = this[kClient].startSession({ ...options });
    let result: T | undefined;

    try {
      await clientSession.withTransaction(async (session) => {
        result = await fn(session);
      });
    } finally {
      await clientSession.endSession();
    }

    return result;
  }

  /**
   * @internal
   *
   * Proxy handler interno do gating de `allowedMethods` — não faz parte da
   * API pública e não deve aparecer na Reference (`excludeInternal` no
   * typedoc.json). Chaveado por Symbol module-private; inacessível de fora.
   */
  static [KModelProxyHandler]() {
    return {
      get(target: Model<Document>, prop: METHODS, receiver: unknown) {
        if (
          target.methods.includes(prop) &&
          !target.allowedMethods.includes(prop)
        ) {
          throw new MongoatError(
            `The method "${prop}" is not allowed in "${target.collectionName}"`,
            { code: 'METHOD_NOT_ALLOWED' }
          );
        }

        const value = Reflect.get(target, prop, receiver);

        // Bind ALWAYS to `target` (the raw instance), never to `receiver`
        // (the Proxy itself) — binding to `receiver` would make every
        // internal `this.xxx` access inside the method re-enter this trap,
        // which can incorrectly re-trigger (or mask) the allowedMethods
        // guard above for internal calls (QUAL-01 — Proxy binding bug).
        if (typeof value === 'function') {
          return value.bind(target);
        }

        return value;
      },
    };
  }

  private isConnected(): boolean {
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

    if (!newIndexes.length || !collection) return;

    // WR-10: nada de `dropIndexes()` incondicional — ele destruía TODOS os
    // índices da collection (inclusive os criados fora do Mongoat por
    // DBAs/migrations) e abria uma janela sem unicidade entre o drop e o
    // recreate a cada boot. Em vez disso, diff: `createIndex` já é
    // idempotente para specs idênticas; só quando a spec de um índice
    // GERENCIADO divergiu (conflito de nome ou de key pattern) é que o
    // índice específico é derrubado e recriado.
    for (const newIndex of newIndexes) {
      const { key, ...options } = newIndex;

      try {
        await collection.createIndex(key, options);
      } catch (err) {
        const existingIndexes = await collection.listIndexes().toArray();

        const conflicting = existingIndexes.find(
          (existing) =>
            existing.name !== '_id_' &&
            (JSON.stringify(existing.key) === JSON.stringify(key) ||
              (options.name !== undefined && existing.name === options.name))
        );

        if (!conflicting) throw err;

        await collection.dropIndex(conflicting.name);
        await collection.createIndex(key, options);
      }
    }
  }

  async [kCreateClientConnection](options?: DatabaseConfig): Promise<string> {
    const { mongoDbName, mongoUrl } = this[kGetUrlAndDbName]();

    this[kClient] = await MongoClient.connect(mongoUrl, options);
    this[kDb] = this[kClient].db(mongoDbName);

    return mongoDbName;
  }

  [kGetUrlAndDbName](): {
    mongoDbName: string;
    mongoUrl: string;
  } {
    const mongoUrl = this[kConnectionUrl];
    const mongoDbName = this[kGetDbName]();

    return { mongoDbName, mongoUrl };
  }

  /**
   * @private
   *
   * Resolves the database name to connect to: `MONGODB_DB_NAME` env var
   * first, then `config.dbName`. No implicit fallback — if neither is
   * configured, throws a `MongoatConnectionError` instead of silently
   * connecting to a hardcoded test database name (D-08).
   */
  [kGetDbName](): string {
    if (process.env.MONGODB_DB_NAME) {
      return process.env.MONGODB_DB_NAME;
    }

    if (this.config.dbName) {
      return this.config.dbName;
    }

    throw new MongoatConnectionError(
      'No database name configured — set the MONGODB_DB_NAME env var or pass config.dbName',
      { code: 'MISSING_DB_NAME' }
    );
  }
}
