import './polyfill';

import { MongoatValidationError } from '@/errors';
import type { FieldMeta, PropFragment } from '@/types/schema';

import { compile, SCHEMA_METADATA_KEY } from './compile';
import { assertKnownHookMethod, assertStandardDecoratorMode } from './guards';

/**
 * @internal
 *
 * Marker symbol written on the decorated class by `Schema`. Lets the
 * `Model` constructor detect "decorated schema class" vs "plain schema
 * object" without instanceof checks or extra imports.
 */
export const kMongoatSchemaClass = Symbol('kMongoatSchemaClass');

/**
 * Initializes (once per class) and returns the Mongoat metadata entry.
 *
 * `Object.hasOwn` (not `in`) on purpose: decorator metadata objects inherit
 * from the parent class metadata via prototype chain — without the own-key
 * check, a subclass would silently MUTATE the parent's metadata instead of
 * starting its own entry.
 */
function getOrInitMeta(metadata: Record<PropertyKey, unknown>): FieldMeta {
  if (!Object.hasOwn(metadata, SCHEMA_METADATA_KEY)) {
    metadata[SCHEMA_METADATA_KEY] = {
      properties: {},
      required: [],
      optionalFields: [],
      fieldPreHooks: [],
      classPreHooks: [],
      classPostHooks: [],
    } satisfies FieldMeta;
  }

  return metadata[SCHEMA_METADATA_KEY] as FieldMeta;
}

/**
 * @public
 *
 * Canonical field decorator: declares the JSON Schema fragment for the
 * decorated field. The fragment is written verbatim into the compiled
 * schema — an omitted `bsonType` simply means "no type restriction" (pure
 * JSON Schema semantics, no magic default).
 *
 * Fields decorated with `Prop` are **required by default**. Fields without
 * any decorator are invisible to decorators (a TC39 limitation) and stay
 * OUT of the compiled schema entirely.
 *
 * `Prop` only records metadata — it never changes the runtime value or the
 * initializer of the field.
 *
 * @example
 * ```typescript
 * class UserSchema {
 *   @Prop({ bsonType: 'string' })
 *   username!: string;
 * }
 * ```
 */
export function Prop(fragment: PropFragment) {
  // Decorator canônico — os açúcares (@BsonType, @Description, ...)
  // são implementados por cima dele (src/schema/sugars.ts).
  return function (
    _value: undefined,
    context: ClassFieldDecoratorContext
  ): void {
    assertStandardDecoratorMode(context);

    const meta = getOrInitMeta(
      context.metadata as unknown as Record<PropertyKey, unknown>
    );
    const fieldName = String(context.name);

    // Composição: MERGE no MESMO fragmento por campo (não replace) —
    // múltiplos açúcares/`@Prop` no mesmo campo agregam um único fragmento
    // (ex.: `@BsonType('string')` + `@Pattern('^x')` → `{ bsonType, pattern }`).
    // O fragmento entra como declarado (sem default mágico de
    // bsonType); clone raso do fragmento recebido desacopla do objeto do
    // dev (mutação futura do objeto original do dev não vaza para cá).
    meta.properties[fieldName] = {
      ...(meta.properties[fieldName] ?? {}),
      ...fragment,
    };

    // Required por padrão — @Optional() (abaixo) não remove daqui
    // diretamente; ver optionalFields para o porquê.
    if (!meta.required.includes(fieldName)) {
      meta.required.push(fieldName);
    }
    // Retorna void de propósito: nenhum decorator desta fase devolve um novo
    // inicializador de campo TC39 — tudo é só metadata.
  };
}

/**
 * @public
 *
 * Marca o campo como opcional — removido de `required` no
 * `Schema.compile` (fiel ao rascunho do autor). Diferente dos demais
 * açúcares (`src/schema/sugars.ts`), `Optional` NÃO agrega um fragmento em
 * `meta.properties` — apenas registra o nome do campo em
 * `meta.optionalFields`, filtrado de `required` no compile (não no momento
 * em que o decorator roda). Isso torna o resultado idêntico independente da
 * ordem textual entre `@Optional()` e `@Prop`/um açúcar no mesmo campo —
 * ver o JSDoc de `FieldMeta.optionalFields`.
 *
 * @example
 * ```typescript
 * class UserSchema {
 *   @Optional()
 *   @Prop({ bsonType: 'string' })
 *   nickname?: string;
 * }
 * ```
 */
export function Optional() {
  return function (
    _value: undefined,
    context: ClassFieldDecoratorContext
  ): void {
    assertStandardDecoratorMode(context);

    const meta = getOrInitMeta(
      context.metadata as unknown as Record<PropertyKey, unknown>
    );
    const fieldName = String(context.name);

    if (!meta.optionalFields.includes(fieldName)) {
      meta.optionalFields.push(fieldName);
    }
  };
}

/**
 * @public
 *
 * Registra um hook `pre` no pipeline de hooks JÁ EXISTENTE do Model
 * (nenhum novo dispatch) — aplicável em CLASSE e em CAMPO:
 * - Nível de CLASSE: `fn` recebe o `ctx` COMPLETO, mesmo contrato de
 *   `.pre()`/`props.hooks` (`(ctx) => void | unknown | Promise<...>`).
 * - Nível de CAMPO: açúcar que transforma SÓ o valor do campo — `fn` tem a
 *   assinatura `(value, ctx) => novoValor`. NÃO retorna um novo
 *   inicializador de campo TC39 (o mecanismo de field-initializer do TC39
 *   nunca é usado aqui) — apenas grava metadata; o registro real no
 *   pipeline acontece em `extractDecoratorHooks`
 *   (`src/schema/compile.ts`), consumido pelo constructor do `Model`.
 *
 * A ORDEM de execução final por método é campo → classe → hooks do
 * config do Model → `.pre()`/`.post()` encadeados — fixada no wiring do
 * `Model`, não aqui (este decorator só ACUMULA metadata).
 *
 * `method` é validado contra o enum `METHODS` JÁ NA DECORAÇÃO — um
 * nome de método inexistente estoura `MongoatValidationError` com
 * `code: 'INVALID_HOOK_METHOD'` imediatamente, em vez de registrar um hook
 * que nunca dispara.
 *
 * @example
 * ```typescript
 * class UserSchema {
 *   @Pre('insert', (value, ctx) => hashPassword(value))
 *   @Prop({ bsonType: 'string' })
 *   password!: string;
 * }
 * ```
 */
export function Pre(method: string, fn: (...args: unknown[]) => unknown) {
  return function (
    _value: unknown,
    context: ClassDecoratorContext | ClassFieldDecoratorContext
  ): void {
    assertStandardDecoratorMode(context);
    assertKnownHookMethod(method);

    const meta = getOrInitMeta(
      context.metadata as unknown as Record<PropertyKey, unknown>
    );

    if (context.kind === 'field') {
      meta.fieldPreHooks.push({ field: String(context.name), method, fn });
      return;
    }

    meta.classPreHooks.push({ method, fn });
    // Retorna void de propósito — mesma disciplina de `Prop`/`Optional`:
    // decorators desta fase só acumulam metadata, nunca alteram o
    // valor/inicializador do campo ou substituem a classe.
  };
}

/**
 * @public
 *
 * Simétrico a `@Pre`, mas SÓ no nível de CLASSE — post por campo não
 * tem semântica clara (não há um "valor de campo" simétrico ao resultado de
 * uma operação inteira). `fn` recebe o `ctx` completo, mesmo contrato de
 * `.post()`/`props.hooks`; aplicar `@Post` a um campo lança
 * `MongoatValidationError`.
 *
 * `method` é validado contra o enum `METHODS` já na decoração — mesmo
 * guard de `@Pre`.
 *
 * @example
 * ```typescript
 * @Post('insert', (ctx) => auditLog(ctx))
 * @Schema('users')
 * class UserSchema {
 *   @Prop({ bsonType: 'string' })
 *   username!: string;
 * }
 * ```
 */
export function Post(method: string, fn: (...args: unknown[]) => unknown) {
  return function (
    _value: unknown,
    context: ClassDecoratorContext | ClassFieldDecoratorContext
  ): void {
    assertStandardDecoratorMode(context);
    assertKnownHookMethod(method);

    if (context.kind === 'field') {
      throw new MongoatValidationError(
        '@Post is only supported at the class level — per-field post hooks have no clear semantics'
      );
    }

    const meta = getOrInitMeta(
      context.metadata as unknown as Record<PropertyKey, unknown>
    );

    meta.classPostHooks.push({ method, fn });
  };
}

/**
 * @public
 *
 * Class decorator that closes a decorated schema class. Runs AFTER all
 * field decorators (a TC39 spec guarantee), so it sees the fully populated
 * metadata.
 *
 * The optional `collectionName` becomes the default collection name for
 * models created from this class (the model config can still override it).
 *
 * Throws `MongoatValidationError` with code `INVALID_DECORATED_CLASS` when
 * the class has no decorated field — an empty schema is always a mistake.
 *
 * @example
 * ```typescript
 * @Schema('users')
 * class UserSchema {
 *   @Prop({ bsonType: 'string' })
 *   username!: string;
 * }
 * ```
 */
export function Schema(collectionName?: string) {
  return function (value: unknown, context: ClassDecoratorContext): void {
    assertStandardDecoratorMode(context);

    const meta = getOrInitMeta(
      context.metadata as unknown as Record<PropertyKey, unknown>
    );

    if (Object.keys(meta.properties).length === 0) {
      // Erro estrutural detectável já na decoração (o @Schema roda ao
      // DEFINIR a classe) — falha alto aqui, não espera o compile.
      throw new MongoatValidationError(
        'Class decorated with @Schema has no decorated field — add at least one @Prop (or sugar decorator) to a field',
        { code: 'INVALID_DECORATED_CLASS' }
      );
    }

    // Marker interno para o Model detectar "classe decorada" e
    // herdar o collectionName default. Mutação direta — a classe original é
    // preservada (decorator retorna void).
    (value as Record<PropertyKey, unknown>)[kMongoatSchemaClass] = {
      collectionName,
    };
  };
}

// Símbolo único — `Schema` é a função-decorator E carrega o estático
// `Schema.compile` (API pública de introspecção/debug/testes).
Schema.compile = compile;
