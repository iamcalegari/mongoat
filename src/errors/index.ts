/**
 * @public
 *
 * Base error class for all errors raised by Mongoat itself (config
 * conflicts, missing connection, missing dbName, etc.).
 *
 * Extends the native `Error` and preserves an optional `cause`
 * (the original error, if any) so consumers can inspect the root cause
 * without losing the original stack trace.
 *
 * Every `MongoatError` (and subclass) carries a stable `code` string
 * — the dev programs against `.code`, independent of `.message` (which can
 * change without breaking semver). Defaults to `'MONGOAT_ERROR'` for the
 * base class; each subclass below overrides its own default.
 *
 * Subclasses let the dev discriminate the error kind via
 * `instanceof`:
 * - `MongoatValidationError` — schema/ObjectId/filtro inválido.
 * - `MongoatConnectionError` — sem conexão / dbName ausente.
 * - `MongoatDriverError` — wrap sanitizado de um erro do driver.
 */
export class MongoatError extends Error {
  readonly code: string;

  constructor(message: string, options?: { cause?: unknown; code?: string }) {
    super(message, { cause: options?.cause });
    this.name = 'MongoatError';
    this.code = options?.code ?? 'MONGOAT_ERROR';
    // Necessário mesmo com target ES2022+: consumidores da lib publicada
    // podem transpilar/bundlar para um target mais baixo (ES5/CommonJS
    // antigo) fora do controle do Mongoat — sem isto, `instanceof` quebra
    // no bundle do CONSUMIDOR, não no nosso próprio build.
    Object.setPrototypeOf(this, MongoatError.prototype);
  }
}

/**
 * @public
 *
 * Erro de validação: schema/ObjectId inválido, filtro proibido
 * (`$where`/operadores de execução de código), configuração de model
 * divergente no registro, uso incorreto dos decorators de schema.
 *
 * `code` default: `'VALIDATION_FAILED'` — override pontual disponível
 * (ex.: `INVALID_OBJECT_ID`, `FORBIDDEN_OPERATOR`, `MODEL_CONFIG_CONFLICT`,
 * `INVALID_DECORATED_CLASS` — classe sem campo decorado/não decorada com
 * `@Schema`, `LEGACY_DECORATORS_MODE` — decorator invocado sob
 * `experimentalDecorators`, `INVALID_HOOK_METHOD` — `@Pre`/`@Post`
 * declarado com um nome de método que não existe no enum de métodos
 * suportados, detectado já na decoração da classe, `DUPLICATE_PLUGIN_NAME`
 * — dois plugins com o mesmo nome mas referências diferentes,
 * `STATIC_COLLISION` — um static de plugin colide com um método nativo do
 * model ou com um static já registrado por outro plugin,
 * `PLUGIN_SETUP_FAILED` — o `setup()` de um plugin lançou durante a
 * construção do model, `PLUGIN_REGISTERED_TOO_LATE` — um plugin global foi
 * registrado depois que o primeiro model já foi construído).
 */
export class MongoatValidationError extends MongoatError {
  constructor(message: string, options?: { cause?: unknown; code?: string }) {
    super(message, {
      cause: options?.cause,
      code: options?.code ?? 'VALIDATION_FAILED',
    });
    this.name = 'MongoatValidationError';
    Object.setPrototypeOf(this, MongoatValidationError.prototype);
  }
}

/**
 * @public
 *
 * Erro de conexão: `Database` não conectada, `dbName` ausente, sessão de
 * transação indisponível.
 *
 * `code` default: `'NOT_CONNECTED'` — override pontual disponível (ex.:
 * `MISSING_DB_NAME`).
 */
export class MongoatConnectionError extends MongoatError {
  constructor(message: string, options?: { cause?: unknown; code?: string }) {
    super(message, {
      cause: options?.cause,
      code: options?.code ?? 'NOT_CONNECTED',
    });
    this.name = 'MongoatConnectionError';
    Object.setPrototypeOf(this, MongoatConnectionError.prototype);
  }
}

/**
 * @public
 *
 * Wrap sanitizado de um erro re-lançado pelo driver `mongodb`.
 * `.message` é estável e nunca inclui stack trace/detalhes internos; o
 * erro original do driver fica preservado em `.cause` para quem quiser
 * inspecionar. Nunca construído a partir de `JSON.stringify(err)`.
 *
 * `code` default: `'DRIVER_ERROR'` — códigos numéricos conhecidos do driver
 * são mapeados para valores estáveis (ex.: `11000` → `'DUPLICATE_KEY'`).
 */
export class MongoatDriverError extends MongoatError {
  constructor(message: string, options?: { cause?: unknown; code?: string }) {
    super(message, {
      cause: options?.cause,
      code: options?.code ?? 'DRIVER_ERROR',
    });
    this.name = 'MongoatDriverError';
    Object.setPrototypeOf(this, MongoatDriverError.prototype);
  }
}
