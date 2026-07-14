import { METHODS } from '@/utils/enums';
import {
  CreateIndexesOptions,
  Document,
  Filter,
  IndexSpecification,
  OptionalUnlessRequiredId,
} from 'mongodb';

import type { HookConfig, HookContextMap, OnHookError } from '@/types/hooks';
import type { SchemaClass } from '@/types/schema';

/**
 * Vendored subset of the JSON Schema Draft 4 `JSONSchema4` interface
 * (from the `json-schema` npm package), limited to the fields actually
 * used by Mongoat's `$jsonSchema` validators (`description`, `pattern`,
 * `enum`, `additionalProperties`).
 *
 * Vendoring avoids re-exporting a third-party type in the published
 * `.d.ts`/`.d.mts` — `json-schema` is not a runtime dependency (QUAL-04).
 * @see https://www.npmjs.com/package/json-schema
 */
export interface JSONSchema4Subset {
  additionalProperties?: boolean | JSONSchema4Subset;
  description?: string;
  enum?: unknown[];
  /**
   * D-02 (Fase 6): fragmentos usados pelos açúcares `@MaxLength`/`@MinLength`
   * sobre `@Prop` — mesma semântica de `$jsonSchema` do MongoDB para strings.
   */
  maxLength?: number;
  /**
   * D-02 (Fase 6): fragmento usado pelo açúcar `@Max` sobre `@Prop`.
   */
  maximum?: number;
  minLength?: number;
  /**
   * D-02 (Fase 6): fragmento usado pelo açúcar `@Min` sobre `@Prop`.
   */
  minimum?: number;
  pattern?: string;
}

export type CreateIndexProps = {
  key: IndexSpecification;
} & CreateIndexesOptions;

export interface ModelDbValidationProps {
  validationAction: string;
  validationLevel: string;
  validator: {
    $jsonSchema: ModelValidationSchema;
  };
}

export type DocumentDefaults<T extends Document> =
  | Partial<OptionalUnlessRequiredId<T>>
  | Partial<SchemaWithDefaults<OptionalUnlessRequiredId<T>>>;

export interface CreateModelProps<ModelType extends Document> {
  allowedMethods?: METHODS[];
  /**
   * Optional when `schema` is a class decorated with `@Schema('name')` — the
   * decorated class provides a default `collectionName`. When provided
   * here, it always overrides the class default (D-06).
   */
  collectionName?: string;
  documentDefaults?: DocumentDefaults<ModelType>;
  /**
   * Declarative pre/post hook registration — merged BEFORE any later
   * `.pre()`/`.post()` chainable calls (constructor hooks run first).
   */
  hooks?: { [M in METHODS]?: HookConfig<HookContextMap<ModelType>[M]> };
  indexes?: CreateIndexProps[];
  /**
   * Fallback for `fireAndForget` post-hook rejections — a `fireAndForget`
   * hook's error never propagates to the caller, so it is routed here
   * instead. When omitted, the model falls back to `console.error` (never
   * swallowed in total silence).
   */
  onHookError?: OnHookError<HookContextMap<ModelType>[METHODS]>;
  /**
   * Accepts either a plain `ModelValidationSchema` object or a class
   * decorated with `@Schema`/`@Prop` — the two schema declaration styles
   * are interchangeable and compile to the same validator.
   */
  schema: ModelValidationSchema | SchemaClass<ModelType>;
  validationQueryExpressions?: ValidationQueryExpressions;
  validity?: boolean;
}

export type ValidationQueryExpressions = Filter<Document>;

export interface ModelSetup {
  allowedMethods?: METHODS[];
  collectionName: string;
  documentDefaults?: DocumentDefaults<Document>;
  indexes?: CreateIndexProps[];
  schema: ModelValidationSchema;
  validationQueryExpressions?: ValidationQueryExpressions;
  validity?: boolean;
}

export interface DefaultProperties {
  updatedAt: Date;
  insertedAt: Date;
}

export type SchemaWithDefaults<S> = S & DefaultProperties;

export interface ModelValidationSchema<
  // `any` é intencional aqui (não um descuido): o mapped type homomórfico
  // `{ [k in keyof T]: ... }` abaixo depende de `keyof any` == `string |
  // number | symbol` para permitir QUALQUER chave de propriedade quando
  // nenhum T concreto é passado (uso normal em toda a suíte). Duas
  // alternativas foram tentadas e descartadas: `never` colapsa o mapped
  // type para `undefined` (caso especial de mapped types homomórficos
  // sobre `never`); `Record<string, unknown> & DefaultProperties` faz
  // `updatedAt`/`insertedAt` virarem propriedades OBRIGATÓRIAS extras em
  // `properties`/`required` (porque deixa de ser um `keyof` "solto" e
  // passa a herdar os required flags reais de `DefaultProperties`),
  // quebrando toda a suíte de testes que declara `properties` sem esses
  // dois campos. Mantido como exceção pontual e documentada (Rule 4 —
  // mudança estrutural do tipo genérico fica fora do escopo do lint gate
  // desta task).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  T extends DefaultProperties = any,
> extends JSONSchema4Subset {
  bsonType: string | string[];
  items?: ModelValidationSchema;
  properties?: {
    [k in keyof T]: ModelValidationSchema;
  };
  required?: (keyof T)[];
}
