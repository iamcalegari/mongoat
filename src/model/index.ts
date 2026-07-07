import { AsyncLocalStorage } from 'node:async_hooks';

import {
  AggregateOptions,
  AnyBulkWriteOperation,
  BulkWriteOptions,
  BulkWriteResult,
  Collection,
  CountDocumentsOptions,
  DeleteOptions,
  DeleteResult,
  Document,
  Filter,
  FindOneAndDeleteOptions,
  FindOneAndUpdateOptions,
  FindOptions,
  InsertManyResult,
  InsertOneOptions,
  ObjectId,
  OptionalUnlessRequiredId,
  UpdateFilter,
  UpdateOptions,
  UpdateResult,
  WithId,
} from 'mongodb';

import {
  buildContext,
  defaultOnHookError,
  runPostHooks,
  runPreHooks,
} from '@/model/hooks';
import {
  CreateIndexProps,
  CreateModelProps,
  DefaultProperties,
  DocumentDefaults,
  ModelDbValidationProps,
  ModelValidationSchema,
  ValidationQueryExpressions,
} from '@/types/model';
import {
  HookConfig,
  HookContextMap,
  HookFn,
  HookRegistry,
  OnHookError,
} from '@/types/hooks';
import { METHODS } from '@/utils/enums';
import { Database } from '@/database';
import { MongoatError } from '@/errors';
import { toObjectId } from '@/utils';

const kDatabase = Symbol('kDatabase');
const kHookContext = Symbol('kHookContext');

/**
 * WR-05: serialização com chaves ordenadas. `JSON.stringify` puro é sensível
 * à ordem de inserção das chaves — o mesmo schema declarado com `properties`
 * em ordem distinta em dois módulos geraria um falso `MongoatError:
 * already registered with a different configuration`. Ordenar as chaves de
 * objetos planos (arrays preservam a ordem, que é semântica) torna a
 * comparação estrutural, não posicional.
 */
function stableStringify(value: unknown): string {
  return JSON.stringify(value, (_key, val) =>
    val && typeof val === 'object' && !Array.isArray(val)
      ? Object.keys(val as Record<string, unknown>)
          .sort()
          .reduce((acc: Record<string, unknown>, key) => {
            acc[key] = (val as Record<string, unknown>)[key];
            return acc;
          }, {})
      : val
  );
}

/**
 * WR-11: wrap mínimo de erros do driver até a hierarquia de erros da Fase 3
 * (SEC-04). O padrão anterior — `new MongoError(JSON.stringify(err, null,
 * 2))` — destruía a informação do erro: para `Error`s genéricos,
 * `JSON.stringify(err)` produz `'{}'` (`message`/`stack` são propriedades
 * não-enumeráveis), então o erro lançado tinha mensagem `{}` e a stack
 * original era descartada. Agora a mensagem original é preservada e o erro
 * original inteiro segue acessível via `cause`.
 */
function wrapDriverError(err: unknown): MongoatError {
  return new MongoatError(err instanceof Error ? err.message : String(err), {
    cause: err,
  });
}

/**
 * WR-06: deep-clone de `documentDefaults` restrito a plain objects/arrays.
 *
 * `this.documentDefaults` guardava a referência do usuário e os merges eram
 * spreads rasos — um default aninhado (ex.: `{ meta: { source: 'api' } }`)
 * era COMPARTILHADO por todos os documentos inseridos; um pre-hook que
 * mutasse `this.meta.source` poluía o default permanentemente para todos os
 * inserts futuros. Mesma classe de vazamento por referência corrigida no
 * schema (`structuredClone` em `schemaValidatorBuilder`).
 *
 * Não usa `structuredClone` de propósito: defaults podem conter instâncias
 * de classe do BSON (ex.: `ObjectId`), cujo protótipo o `structuredClone`
 * destruiria. Plain objects/arrays são clonados em profundidade; qualquer
 * outra coisa (primitivos, `Date`, `ObjectId`, …) passa por referência.
 */
function cloneDocumentDefaults<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map(cloneDocumentDefaults) as unknown as T;
  }

  if (
    value &&
    typeof value === 'object' &&
    (Object.getPrototypeOf(value) === Object.prototype ||
      Object.getPrototypeOf(value) === null)
  ) {
    const cloned: Record<string, unknown> = {};

    for (const [key, entry] of Object.entries(value)) {
      cloned[key] = cloneDocumentDefaults(entry);
    }

    return cloned as T;
  }

  return value;
}

/**
 * Lightweight structural comparison used by the `Model` constructor to
 * detect a divergent re-registration of an already-registered
 * `collectionName` (D-06). Compares the fields that define a model's
 * behavior — `allowedMethods` (order-independent), the fully-built
 * `validator` (which already embeds the schema + validationQueryExpressions),
 * `documentDefaults` and `indexes` (WR-04) — via `JSON.stringify`.
 * Deliberately hand-rolled instead of pulling in a deep-equal dependency
 * (`lodash.isequal`/`fast-deep-equal`): the surface being compared is small
 * and known, and a generic deep-equal lib would violate the project's
 * "minimum runtime dependencies" constraint.
 */
function isSameConfig(
  existing: Model<Document>,
  candidate: {
    allowedMethods: METHODS[];
    documentDefaults: DocumentDefaults<Document>;
    indexes: CreateIndexProps[];
    validator: { $jsonSchema: ModelValidationSchema };
  }
): boolean {
  const sameAllowedMethods =
    JSON.stringify([...existing.allowedMethods].sort()) ===
    JSON.stringify([...candidate.allowedMethods].sort());

  const sameValidator =
    stableStringify(existing.validator) ===
    stableStringify(candidate.validator);

  // WR-04: `documentDefaults` e `indexes` afetam materialmente o
  // comportamento do model — uma re-registração com defaults/índices
  // diferentes também deve falhar alto em vez de ser descartada em
  // silêncio (mesma classe de mascaramento que D-06 eliminou).
  const sameDocumentDefaults =
    stableStringify(existing.documentDefaults) ===
    stableStringify(candidate.documentDefaults);

  // Indexes usam JSON.stringify puro de propósito: a ordem das chaves em um
  // índice composto (`{ a: 1, b: 1 }` vs `{ b: 1, a: 1 }`) é SEMÂNTICA no
  // MongoDB — ordená-las equipararia índices genuinamente diferentes.
  const sameIndexes =
    JSON.stringify(existing.indexes) === JSON.stringify(candidate.indexes);

  return (
    sameAllowedMethods && sameValidator && sameDocumentDefaults && sameIndexes
  );
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

  /**
   * Hook registry (replaces `preMethod: Record<METHODS, Function>`) — one
   * `{ pre: []; post: [] }` array pair per `METHODS` value, populated by
   * the declarative `hooks` constructor option (D-01) and by the
   * chainable `.pre()`/`.post()` (D-02: construtor primeiro).
   */
  hooks: HookRegistry<ModelType> = Object.fromEntries(
    Object.values(METHODS).map((method) => [method, { pre: [], post: [] }])
  ) as unknown as HookRegistry<ModelType>;

  /**
   * Fallback destination for `fireAndForget` post-hook rejections
   * (D-06/HOOK-04) — resolved once in the constructor from
   * `props.onHookError`, falling back to `defaultOnHookError`
   * (`console.error`) so an error never disappears in total silence.
   * Threaded through a single point (`executeHooked` → `runPostHooks`),
   * not touched by any of the 12 CRUD methods individually.
   */
  onHookError: OnHookError<HookContextMap<ModelType>[METHODS]> =
    defaultOnHookError;

  static [kDatabase]: Database | undefined;

  /**
   * D-07 — per-instance `AsyncLocalStorage` reentrancy guard (Pattern 5).
   * A hook (or an internal method delegation, e.g. `findById` → `find`)
   * that calls another method of THIS SAME model runs inside the same
   * async context established by the outer method's dispatch, so it sees
   * `{ raw: true }` in the store and skips that method's own hook
   * pipeline instead of re-entering it. Scoped per Model instance (not
   * global/static) so concurrent calls on the SAME model never leak
   * reentrancy state into each other's async chains (a boolean instance
   * flag would).
   */
  private [kHookContext] = new AsyncLocalStorage<{ raw: true }>();

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
          documentDefaults: documentDefaults as DocumentDefaults<Document>,
          indexes,
          validator,
        })
      ) {
        return existing as unknown as Model<ModelType>;
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
    // WR-06: nunca guardar a referência do chamador — mutações posteriores
    // no objeto original não devem vazar para os inserts do model.
    this.documentDefaults = cloneDocumentDefaults(documentDefaults);
    this.validator = validator;
    this.validationAction = validationAction;
    this.validationLevel = validationLevel;
    this.methods = Object.values(METHODS);
    this.onHookError = props.onHookError ?? defaultOnHookError;

    // D-01/D-02: hooks declarados no construtor populam a registry ANTES
    // de qualquer `.pre()`/`.post()` encadeável chamado depois (que só
    // faz `push`, nunca sobrescreve — ver `pre()`/`post()` abaixo).
    if (props.hooks) {
      for (const [method, config] of Object.entries(props.hooks) as [
        METHODS,
        HookConfig<HookContextMap<ModelType>[METHODS]>,
      ][]) {
        if (config.pre) {
          this.hooks[method].pre.push(...config.pre);
        }

        if (config.post) {
          this.hooks[method].post.push(
            ...config.post.map((entry) =>
              typeof entry === 'function' ? { fn: entry } : entry
            )
          );
        }
      }
    }

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

  /**
   * @public
   *
   * Escape hatch honesto (D-08/API-02): devolve a `Collection<ModelType>`
   * **crua** do driver oficial. Reaproveita `getCollectionOrThrow()` — o
   * mesmo fail-loud pré-conexão de `MongoatError` ("Database not connected
   * — call db.connect() first") usado internamente por todos os métodos
   * CRUD (D-10).
   *
   * ATENÇÃO — bypass DELIBERADO e TOTAL: a `Collection` retornada não
   * passa pelo pipeline de hooks (pre/post nunca disparam para chamadas
   * feitas diretamente nela) **nem** pelo gating de `allowedMethods` (esta
   * função nunca é adicionada ao enum `METHODS`, então o
   * `KModelProxyHandler` já a deixa passar sem checagem nenhuma). Ao
   * chamar `getCollection()` você saiu da zona segura do ODM — agora é o
   * driver puro, coerente com o core value do Mongoat de nunca bloquear
   * o acesso ao driver nativo do MongoDB.
   *
   * @returns A `Collection<ModelType>` nativa do driver `mongodb`.
   */
  getCollection(): Collection<ModelType> {
    return this.getCollectionOrThrow();
  }

  pre<M extends METHODS>(
    method: M,
    fn: HookFn<HookContextMap<ModelType>[M]>
  ): this {
    // D-01: acumula (push), nunca sobrescreve — encadeável (D-02: depois
    // dos hooks declarados no construtor).
    this.hooks[method].pre.push(fn);

    return this;
  }

  post<M extends METHODS>(
    method: M,
    fn: HookFn<HookContextMap<ModelType>[M]>,
    options: { fireAndForget?: boolean } = {}
  ): this {
    this.hooks[method].post.push({ fn, fireAndForget: options.fireAndForget });

    return this;
  }

  /**
   * @private
   *
   * Runs the pre → driver → post pipeline for a single-ctx method (every
   * CRUD method except `insertMany`, which needs a per-document pre-hook
   * pass — see `insertMany()`). `rawFn` reads its arguments from `ctx`
   * (not from the original public-method parameters) so a pre-hook
   * mutation of `ctx.options`/`ctx.filter`/`ctx.document` reaches the
   * driver call (Pitfall 4).
   */
  private async executeHooked<M extends METHODS>(
    method: M,
    ctx: HookContextMap<ModelType>[M],
    rawFn: () => unknown
  ): Promise<unknown> {
    await runPreHooks(this.hooks[method].pre, ctx);

    const result = await rawFn();
    (ctx as unknown as { result?: unknown }).result = result;

    await runPostHooks(
      this.hooks[method].post,
      ctx,
      this.onHookError as OnHookError<HookContextMap<ModelType>[M]>
    );

    return (ctx as unknown as { result?: unknown }).result;
  }

  /**
   * @private
   *
   * Reentrancy dispatch shared by every CRUD method except `insertMany`
   * (Pattern 5/D-07): if this Model's async context is already marked
   * `raw` (this call is nested inside a hook, or inside another
   * already-hooked method of the same instance — e.g. `findById` →
   * `find`), skip straight to `rawFn` — no hooks re-fire, no new async
   * context opens. Otherwise, open a fresh `{ raw: true }` context and run
   * the full pre → driver → post pipeline via `executeHooked`.
   */
  private runHooked<M extends METHODS>(
    method: M,
    ctx: HookContextMap<ModelType>[M],
    rawFn: (ctx: HookContextMap<ModelType>[M]) => unknown
  ): unknown {
    const store = this[kHookContext].getStore();

    if (store?.raw) {
      return rawFn(ctx);
    }

    return this[kHookContext].run({ raw: true }, () =>
      this.executeHooked(method, ctx, () => rawFn(ctx))
    );
  }

  aggregate(
    pipeline: Document[],
    options: AggregateOptions = {}
  ): Promise<Document[]> {
    const ctx = buildContext(METHODS.AGGREGATE, this, { pipeline, options });

    return this.runHooked(METHODS.AGGREGATE, ctx, (c) =>
      this.rawAggregate(c.pipeline, c.options)
    ) as Promise<Document[]>;
  }

  private rawAggregate(pipeline: Document[], options: AggregateOptions) {
    const collection = this.getCollectionOrThrow();

    return collection.aggregate(pipeline, options).toArray();
  }

  update(
    filter: Filter<ModelType>,
    update: UpdateFilter<ModelType>,
    options: FindOneAndUpdateOptions = {}
  ): Promise<WithId<ModelType> | null> {
    const _update = { ...update };
    const ctx = buildContext(METHODS.UPDATE, this, {
      filter,
      update: _update,
      options,
    });

    return this.runHooked(METHODS.UPDATE, ctx, (c) =>
      this.rawUpdate(c.filter, c.update, c.options)
    ) as Promise<WithId<ModelType> | null>;
  }

  private async rawUpdate(
    filter: Filter<ModelType>,
    update: UpdateFilter<ModelType>,
    options: FindOneAndUpdateOptions
  ) {
    const collection = this.getCollectionOrThrow();

    return (await collection.findOneAndUpdate(filter, update, {
      returnDocument: 'after',
      ...options,
    }))!;
  }

  updateMany(
    filter: Filter<ModelType>,
    update: UpdateFilter<ModelType>,
    options: UpdateOptions = {}
  ): Promise<UpdateResult> {
    const _update = { ...update };
    const ctx = buildContext(METHODS.UPDATE_MANY, this, {
      filter,
      update: _update,
      options,
    });

    return this.runHooked(METHODS.UPDATE_MANY, ctx, (c) =>
      this.rawUpdateMany(c.filter, c.update, c.options)
    ) as Promise<UpdateResult>;
  }

  private async rawUpdateMany(
    filter: Filter<ModelType>,
    update: UpdateFilter<ModelType>,
    options: UpdateOptions
  ) {
    const collection = this.getCollectionOrThrow();

    return (await collection.updateMany(filter, update, { ...options }))!;
  }

  findMany(
    filter: Filter<ModelType> = {},
    options: FindOptions = {}
  ): Promise<WithId<ModelType>[]> {
    const ctx = buildContext(METHODS.FIND_MANY, this, { filter, options });

    return this.runHooked(METHODS.FIND_MANY, ctx, (c) =>
      this.rawFindMany(c.filter, c.options)
    ) as Promise<WithId<ModelType>[]>;
  }

  private rawFindMany(filter: Filter<ModelType>, options: FindOptions) {
    const collection = this.getCollectionOrThrow();

    // WR-07: sem `?? []` — `toArray()` retorna uma Promise, que nunca é
    // nullish; o fallback era código morto que mentia sobre um retorno
    // síncrono `[]` impossível.
    return collection.find(filter, options).toArray();
  }

  deleteMany(
    filter: Filter<ModelType>,
    options: DeleteOptions = {}
  ): Promise<DeleteResult> {
    const ctx = buildContext(METHODS.DELETE_MANY, this, { filter, options });

    return this.runHooked(METHODS.DELETE_MANY, ctx, (c) =>
      this.rawDeleteMany(c.filter, c.options)
    ) as Promise<DeleteResult>;
  }

  private rawDeleteMany(filter: Filter<ModelType>, options: DeleteOptions) {
    const collection = this.getCollectionOrThrow();

    return collection.deleteMany(filter, options);
  }

  insert(
    document: OptionalUnlessRequiredId<ModelType>,
    options: InsertOneOptions = {}
  ): Promise<WithId<ModelType> & DefaultProperties> {
    // WR-06: clone por insert — o spread raso compartilharia defaults
    // aninhados entre todos os documentos (e com o próprio model). Feito
    // ANTES do ctx ser montado, então os pre-hooks veem/mutam a cópia já
    // mesclada com os defaults (não o objeto original do chamador).
    const mergedDocument = {
      ...cloneDocumentDefaults(this.documentDefaults),
      ...document,
    } as OptionalUnlessRequiredId<ModelType>;

    const ctx = buildContext(METHODS.INSERT, this, {
      document: mergedDocument,
      options,
    });

    return this.runHooked(METHODS.INSERT, ctx, (c) =>
      this.rawInsert(c.document, c.options)
    ) as Promise<WithId<ModelType> & DefaultProperties>;
  }

  private async rawInsert(
    document: OptionalUnlessRequiredId<ModelType>,
    options: InsertOneOptions
  ) {
    const collection = this.getCollectionOrThrow();

    try {
      const { insertedId } = await collection.insertOne(document, options);

      return { _id: insertedId, ...document } as unknown as WithId<ModelType> &
        DefaultProperties;
    } catch (err: unknown) {
      throw wrapDriverError(err);
    }
  }

  /**
   * `insertMany` is special-cased instead of going through
   * `runHooked`/`executeHooked` (Pitfall 1 / A4): pre hooks run PER
   * DOCUMENT — `Promise.all` parallelizes ACROSS documents (preserved
   * from the Fase 1 fix), while the pre hooks of the SAME document run
   * sequentially via `runPreHooks`. Post hooks run ONCE for the whole
   * batch, against a single `ctx.result` (`InsertManyResult`) — there is
   * no per-document result to hand each post hook.
   */
  async insertMany(
    documents: OptionalUnlessRequiredId<ModelType>[],
    options: BulkWriteOptions = {}
  ): Promise<InsertManyResult<ModelType>> {
    // WR-06: clone por documento — cada doc precisa da própria instância
    // dos defaults aninhados.
    const _documents = documents.map((doc) => ({
      ...cloneDocumentDefaults(this.documentDefaults),
      ...doc,
    })) as OptionalUnlessRequiredId<ModelType>[];

    const store = this[kHookContext].getStore();

    if (store?.raw) {
      return this.rawInsertMany(_documents, options);
    }

    return this[kHookContext].run({ raw: true }, async () => {
      // Pitfall 1: paralelo ENTRE documentos, sequencial DENTRO de cada
      // documento — nunca `Promise.all` para os hooks de UM documento.
      await Promise.all(
        _documents.map((document) => {
          const preCtx = buildContext(METHODS.INSERT_MANY, this, {
            document,
            documents: _documents,
            options,
          });

          return runPreHooks(this.hooks[METHODS.INSERT_MANY].pre, preCtx);
        })
      );

      const postCtx = buildContext(METHODS.INSERT_MANY, this, {
        documents: _documents,
        options,
      });

      // Pitfall 4: ler de `postCtx.options` (não do parâmetro `options`
      // original) — consistente com os outros 11 métodos, todos que lêem
      // `c.options` na chamada ao driver dentro do `rawFn` passado a
      // `runHooked`. Como cada `preCtx` por documento compartilha a MESMA
      // referência de `options` (Pattern 3), uma mutação in-place feita
      // por um pre-hook (`ctx.options.campo = x`) já é visível aqui
      // independentemente de qual variável é lida — mas ler explicitamente
      // de `postCtx.options` documenta a intenção e fecha o pitfall por
      // completo, não só "por coincidência de referência compartilhada".
      postCtx.result = await this.rawInsertMany(_documents, postCtx.options);

      await runPostHooks(
        this.hooks[METHODS.INSERT_MANY].post,
        postCtx,
        this.onHookError as OnHookError<
          HookContextMap<ModelType>[METHODS.INSERT_MANY]
        >
      );

      return postCtx.result as InsertManyResult<ModelType>;
    });
  }

  private async rawInsertMany(
    documents: OptionalUnlessRequiredId<ModelType>[],
    options: BulkWriteOptions
  ) {
    const collection = this.getCollectionOrThrow();

    try {
      // WR-01: `return await` — sem ele, a Promise rejeitada do driver
      // escapava do try/catch (código morto).
      return await collection.insertMany(documents, options);
    } catch (err: unknown) {
      throw wrapDriverError(err);
    }
  }

  find(
    filter: Filter<ModelType> = {},
    options: FindOptions = {}
  ): Promise<WithId<ModelType> | null> {
    const ctx = buildContext(METHODS.FIND, this, { filter, options });

    return this.runHooked(METHODS.FIND, ctx, (c) =>
      this.rawFind(c.filter, c.options)
    ) as Promise<WithId<ModelType> | null>;
  }

  private rawFind(filter: Filter<ModelType>, options: FindOptions) {
    const collection = this.getCollectionOrThrow();

    return collection.findOne(filter, options);
  }

  findById(
    documentId: ObjectId | string,
    options: FindOptions = {}
  ): Promise<WithId<ModelType> | null> {
    const ctx = buildContext(METHODS.FIND_BY_ID, this, {
      documentId,
      options,
    });

    return this.runHooked(METHODS.FIND_BY_ID, ctx, (c) =>
      this.rawFindById(c.documentId, c.options)
    ) as Promise<WithId<ModelType> | null>;
  }

  private rawFindById(documentId: ObjectId | string, options: FindOptions) {
    // Delega ao `find()` público — a chamada roda dentro do mesmo
    // contexto `{ raw: true }` já aberto por `findById`'s dispatch
    // (Pattern 5/D-07), então `find()` também pula seu próprio pipeline
    // de hooks (não apenas o gating do Proxy, já pulado por estar
    // vinculado a `target` — ver QUAL-01).
    return this.find(
      { _id: toObjectId(documentId) } as unknown as Filter<ModelType>,
      options
    );
  }

  delete(
    filter: Filter<ModelType>,
    options: FindOneAndDeleteOptions = {}
  ): Promise<WithId<ModelType> | null> {
    const ctx = buildContext(METHODS.DELETE, this, { filter, options });

    return this.runHooked(METHODS.DELETE, ctx, (c) =>
      this.rawDelete(c.filter, c.options)
    ) as Promise<WithId<ModelType> | null>;
  }

  private rawDelete(
    filter: Filter<ModelType>,
    options: FindOneAndDeleteOptions
  ) {
    const collection = this.getCollectionOrThrow();

    // mongodb@7 `findOneAndDelete` resolves the matched document directly
    // (`WithId<ModelType> | null`) — the driver's pre-v5 `{ value }`
    // wrapper no longer exists.
    return collection.findOneAndDelete(filter, options);
  }

  total(
    filter: Filter<ModelType> = {},
    options: CountDocumentsOptions = {}
  ): Promise<number> {
    const ctx = buildContext(METHODS.TOTAL, this, { filter, options });

    return this.runHooked(METHODS.TOTAL, ctx, (c) =>
      this.rawTotal(c.filter, c.options)
    ) as Promise<number>;
  }

  private rawTotal(filter: Filter<ModelType>, options: CountDocumentsOptions) {
    const collection = this.getCollectionOrThrow();

    return collection.countDocuments(filter, options);
  }

  bulkWrite(
    operations: AnyBulkWriteOperation<ModelType>[],
    options: BulkWriteOptions = {}
  ): Promise<BulkWriteResult> {
    // WR-02: clonar a operação em vez de reatribuir `insertOne.document`
    // in-place — a versão anterior mutava os objetos de operação do
    // próprio chamador (o map retornava as mesmas referências).
    const _operations = operations.map((operation) => {
      // Tipo estreito (em vez de `any`) que expõe apenas `insertOne.document`
      // — o único campo de `InsertOneModel<ModelType>` (ver mongodb.d.ts)
      // que este bloco de fato lê/escreve.
      const insertOperation = operation as AnyBulkWriteOperation<ModelType> & {
        insertOne?: { document: OptionalUnlessRequiredId<ModelType> };
      };

      if (insertOperation.insertOne) {
        return {
          ...insertOperation,
          insertOne: {
            ...insertOperation.insertOne,
            document: {
              // WR-06: clone por operação (ver comentário em insert()).
              ...cloneDocumentDefaults(this.documentDefaults),
              ...insertOperation.insertOne.document,
            },
          },
        } as AnyBulkWriteOperation<ModelType>;
      }

      return operation;
    });

    const ctx = buildContext(METHODS.BULK_WRITE, this, {
      operations: _operations,
      options,
    });

    return this.runHooked(METHODS.BULK_WRITE, ctx, (c) =>
      this.rawBulkWrite(c.operations, c.options)
    ) as Promise<BulkWriteResult>;
  }

  private async rawBulkWrite(
    operations: AnyBulkWriteOperation<ModelType>[],
    options: BulkWriteOptions
  ) {
    const collection = this.getCollectionOrThrow();

    try {
      // WR-01: `return await` — ver comentário equivalente em insertMany.
      return await collection.bulkWrite(operations, options);
    } catch (err: unknown) {
      throw wrapDriverError(err);
    }
  }

  static hasDatabase() {
    return !!Model[kDatabase];
  }

  static setDatabase(database: Database) {
    Model[kDatabase] = database;
  }
}
