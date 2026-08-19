import {
  ClientSession,
  ClientSessionOptions,
  Db,
  Document,
  MongoClient,
  MongoClientOptions,
  ObjectId,
} from 'mongodb';

import {
  MongoatConnectionError,
  MongoatError,
  MongoatValidationError,
} from '@/errors';
import {
  diffConfig,
  getConfigPlugins,
  Model,
  samePluginList,
  snapshotConfig,
} from '@/model';
import { kProxySelf } from '@/model/hooks';
import { DatabaseConfig } from '@/types';
import { METHODS } from '@/utils/enums';
import {
  applyCollectionIndexes,
  applyCollectionValidator,
} from '@utils/database';

const kClient = Symbol('kClient');
const kDb = Symbol('kDb');
const kConnecting = Symbol('kConnecting');
const kConnectionUrl = Symbol('kConnectionUrl');
const kCreateClientConnection = Symbol('kCreateClientConnection');
const kGetUrlAndDbName = Symbol('kGetUrlAndDbName');
const kGetDbName = Symbol('kGetDbName');
const KModelProxyHandler = Symbol('KModelProxyHandler');
const KModelMap = Symbol('KModelMap');

/**
 * @internal
 *
 * The `DatabaseConfig` fields that belong to Mongoat and are NOT driver
 * options. They have to be stripped before the rest of the config reaches
 * `MongoClient`, because the driver refuses keys it does not know:
 * `new MongoClient(url, { uri })` throws
 * `MongoParseError: option uri is not supported`. Forwarding the config
 * verbatim would therefore break every consumer that passes a `uri` — which
 * is the documented way to configure the connection.
 *
 * `satisfies Record<MongoatOnlyConfigKey, true>` is a compile-time
 * exhaustiveness gate rather than a hand-kept list: adding a Mongoat-specific
 * field to `DatabaseConfig` without listing it here fails the build, instead
 * of silently leaking that field to the driver at runtime.
 */
type MongoatOnlyConfigKey = keyof Omit<
  DatabaseConfig,
  keyof MongoClientOptions
>;

const MONGOAT_ONLY_CONFIG_KEYS = {
  dbName: true,
  password: true,
  uri: true,
  username: true,
} satisfies Record<MongoatOnlyConfigKey, true>;

/**
 * @internal
 *
 * Narrows a `DatabaseConfig` down to the options `MongoClient` accepts, by
 * dropping the Mongoat-only fields listed in `MONGOAT_ONLY_CONFIG_KEYS`.
 * Never mutates the caller's config object.
 */
function toMongoClientOptions(config: DatabaseConfig): MongoClientOptions {
  const clientOptions: Record<string, unknown> = { ...config };

  for (const key of Object.keys(MONGOAT_ONLY_CONFIG_KEYS)) {
    delete clientOptions[key];
  }

  return clientOptions as MongoClientOptions;
}

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
   * Beyond those four fields, `DatabaseConfig` extends `MongoClientOptions`:
   * anything else set here is forwarded to `MongoClient` by `connect()`,
   * overriding Mongoat's own defaults. That is where `serverApi` is opted
   * into — see `connect()`.
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

    // A URI nunca deve ser descartada por falta de credenciais —
    // exigir `uri && username && password` fazia `new Database({ uri })`
    // (ou config puramente por env var) conectar silenciosamente no
    // default localhost, com risco real de escrita no banco errado.
    const uri = process.env.MONGODB_URI || this.config.uri;

    if (uri) {
      const username = process.env.MONGODB_USERNAME || this.config.username;
      const password = process.env.MONGODB_PASSWORD || this.config.password;

      // Percent-encoding obrigatório — senhas com caracteres
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
   * Every driver option given to the constructor is forwarded to
   * `MongoClient` here — `DatabaseConfig` extends `MongoClientOptions`, so
   * the whole driver surface is configurable there — minus the four
   * Mongoat-specific fields (`uri`, `dbName`, `username`, `password`), which
   * Mongoat consumes itself. Precedence is explicit: Mongoat supplies
   * DEFAULTS and the constructor's config overrides them, key by key. The
   * only default is `ignoreUndefined: true`, which a caller can now switch
   * off by passing `ignoreUndefined: false`.
   *
   * No `serverApi` is configured. Declaring MongoDB's Stable API is the
   * application's decision, never the ODM's, and it is expressed with the
   * driver's own option:
   *
   * ```ts
   * new Database({ uri, dbName, serverApi: { version: ServerApiVersion.v1 } });
   * ```
   *
   * Adding `strict: true` there makes the server reject every command outside
   * Stable API v1 — `$vectorSearch`, `createSearchIndex` and
   * `listSearchIndexes` among them, each failing with
   * `code: 323 (APIStrictError)`. Opt into it only when the application knows
   * it uses nothing outside the API.
   *
   * @returns A promise that resolves to a string containing the connection name,
   * or nothing if the connection is already established.
   */
  connect(): Promise<string> | void {
    if (this.isConnected()) {
      return;
    }

    // Duas chamadas concorrentes a connect() passavam ambas pelo
    // guard acima (isConnected() só vira true DEPOIS que kClient/kDb são
    // atribuídos) e criavam DOIS MongoClient — o primeiro era sobrescrito
    // sem close(), vazando o pool de conexões. Reusar a Promise em
    // andamento garante um único client por instância.
    if (this[kConnecting]) {
      return this[kConnecting];
    }

    // O config do construtor era montado e descartado: `connect()` construía
    // o objeto de opções do zero, então qualquer `MongoClientOptions` passada
    // ao construtor nunca chegava ao driver (`ignoreUndefined` só parecia
    // funcionar porque o valor hardcoded aqui coincidia com o que as
    // aplicações passavam). Defaults do Mongoat vêm PRIMEIRO para que o
    // config do chamador vença em toda chave.
    this[kConnecting] = this[kCreateClientConnection]({
      ignoreUndefined: true,
      ...toMongoClientOptions(this.config),
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
   * isolate registry state between cases. Using this outside of
   * tests will make every previously registered `Model` instance
   * unreachable via `getModel()`.
   */
  static resetRegistry(): void {
    Database[KModelMap].clear();
  }

  /**
   * Registers a model in the database model map.
   *
   * This method is used internally by the `Model` class constructor to
   * register a model. If you want to register a model manually, you can use
   * this method too — but a `collectionName` that is already occupied is no
   * longer replaced unconditionally:
   *
   * - Passing back the SAME reference already stored for that
   *   `collectionName` is idempotent — it is returned as-is, no check runs.
   * - A model carrying any hook (`pre` or `post`, of any origin — declared,
   *   decorated, or added by a plugin) throws `MongoatValidationError` with
   *   `code: 'MODEL_CONFIG_CONFLICT'`.
   * - A model carrying a `plugins` list that diverges (by reference or
   *   order) from the one already registered also throws
   *   `MongoatValidationError` with `code: 'MODEL_CONFIG_CONFLICT'` — the
   *   same plugins comparison the `Model` constructor runs on
   *   re-registration, including for a plugin that registers only a
   *   `static` (no hook at all).
   * - Otherwise, the candidate's config is compared field-by-field against
   *   the registered one (the same comparison the `Model` constructor runs
   *   on re-registration): identical → the existing instance is returned
   *   unchanged; divergent → throws `MongoatValidationError` with
   *   `code: 'MODEL_CONFIG_CONFLICT'`, naming the divergent fields.
   *
   * A free `collectionName` is unaffected — it still creates the Proxy,
   * stores it, and returns it, exactly as before.
   *
   * @param model - The model to be registered.
   */
  registerModel(model: Model<Document>) {
    const existing = Database[KModelMap].get(model.collectionName);

    // Re-registering the EXACT reference already in the registry is
    // idempotence, not conflict — passing back what `getModel()` just
    // handed you is the most natural reading of "register manually", and
    // without this short-circuit the hooks guard below would throw for any
    // model that declares a hook, even on a harmless repeat call.
    if (existing === model) {
      return existing;
    }

    if (existing) {
      // A model with hooks from ANY origin never silently replaces an
      // occupied collectionName — checked BEFORE the config comparison,
      // mirroring the constructor's guard order. Unlike the constructor
      // (where "has hooks" means "declared in THIS construction", still a
      // props object), here it means "the received instance carries hooks
      // of any origin — declared, decorated, or plugin-registered",
      // because what arrives is an already-built instance with no
      // provenance left to distinguish.
      const candidateHasHooks = Object.values(model.hooks).some(
        ({ pre, post }) => pre.length > 0 || post.length > 0
      );

      if (candidateHasHooks) {
        throw new MongoatValidationError(
          `Model "${model.collectionName}" already registered — hooks declared on a re-registration are never silently discarded`,
          { code: 'MODEL_CONFIG_CONFLICT' }
        );
      }

      // Same "plugins never silently discarded" guarantee the constructor
      // enforces, and the same `samePluginList` comparison — `diffConfig`
      // deliberately never compares `plugins` (see its `case 'plugins'`),
      // so without this the candidate's plugin list had zero comparison of
      // any kind here, and a plugin contributing only a `static` (no hook,
      // so invisible to the guard above) was silently discarded.
      const candidatePlugins = getConfigPlugins(model);

      if (
        candidatePlugins.length > 0 &&
        !samePluginList(existing, candidatePlugins)
      ) {
        throw new MongoatValidationError(
          `Model "${model.collectionName}" already registered — plugins declared on a re-registration are never silently discarded`,
          { code: 'MODEL_CONFIG_CONFLICT' }
        );
      }

      // Same comparison the constructor runs — not a copy — so the two
      // registration paths cannot drift apart when a property is added.
      const divergentFields = diffConfig(existing, snapshotConfig(model));

      if (divergentFields.length === 0) {
        // Identical config: reuse the already-registered instance. No new
        // Proxy is created, the registry entry is untouched, and the
        // received (unregistered) model is never written into — writing
        // `kProxySelf` onto it would lie about its registration state.
        return existing;
      }

      throw new MongoatValidationError(
        `Model "${model.collectionName}" already registered with a different configuration (${divergentFields.join(', ')})`,
        { code: 'MODEL_CONFIG_CONFLICT' }
      );
    }

    const newModel = new Proxy(model, Database[KModelProxyHandler]());
    Database[KModelMap].set(model.collectionName, newModel);

    // Lets `ctx.model` (built by `buildContext`, `@/model/hooks`) hand a
    // hook the same gated Proxy an external caller gets, instead of the raw
    // instance — bracket notation over an escape-hatch cast because `Model`
    // does not declare a Symbol index signature.
    (model as unknown as Record<symbol, Model<Document>>)[kProxySelf] =
      newModel;

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
    // Sem este guard, `this[kClient]?.startSession(...)` retornava
    // `undefined` com o banco desconectado e o método resolvia com
    // `undefined` SEM nunca invocar `fn` — perda de escrita silenciosa.
    // Mesmo padrão de `getCollectionOrThrow`: falhar alto pré-conexão.
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
        // guard above for internal calls.
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
    if (!this[kDb]) return;

    await applyCollectionValidator(this[kDb], model.collectionName, {
      validationAction: model.validationAction,
      validationLevel: model.validationLevel,
      validator: model.validator,
    });
  }

  private async setupIndexes(model: Model<Document>) {
    if (!this[kDb]) return;

    // `applyCollectionIndexes` (`@utils/database`) diffs instead of
    // an unconditional `dropIndexes()` — see its own doc comment.
    await applyCollectionIndexes(
      this[kDb],
      model.collectionName,
      model.indexes
    );
  }

  async [kCreateClientConnection](
    options?: MongoClientOptions
  ): Promise<string> {
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
   * connecting to a hardcoded test database name.
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
