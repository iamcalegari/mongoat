#!/usr/bin/env node
/**
 * SMOKE de produção dos decorators TC39 (gate crítico).
 *
 * Rolldown/Oxc (usados pelo tsdown) ainda NÃO fazem lowering de decorators
 * stage-3 — e vitest/esbuild FAZEM, mascarando a falha de build. Por isso
 * este script prova a cadeia de PRODUÇÃO inteira, em node real:
 *
 *   1. `npm run build` — o bundle da lib (lib/index.cjs + lib/index.mjs).
 *   2. `lib/index.cjs` e `lib/index.mjs` importam em node real sem
 *      SyntaxError (require + import dinâmico).
 *   3. Uma classe decorada consumidor-style (`@Schema` + `@Prop`) é
 *      transpilada pela MESMA cadeia de produção (tsdown + babel
 *      @babel/plugin-proposal-decorators version '2023-11') e EXECUTADA em
 *      node real, assertando o metadata compilado.
 *
 * Nota: `src/schema/**` da lib só DEFINE as funções-decorator — não usa a
 * sintaxe `@` em si; o plugin babel do build da lib é efetivamente no-op
 * hoje. O passo 3 existe exatamente por isso: prova que a sintaxe `@` de um
 * CONSUMIDOR sobrevive à cadeia tsdown+babel documentada.
 *
 * Uso: node scripts/smoke-decorators.mjs   (exit 0 = tudo verde)
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tmpDir = path.join(root, 'scripts', '.smoke-tmp');
const outDir = path.join(root, 'scripts', '.smoke-out');

function log(msg) {
  console.log(`[smoke-decorators] ${msg}`);
}

function run(cmd, args, opts = {}) {
  return execFileSync(cmd, args, { cwd: root, stdio: 'inherit', ...opts });
}

// ---------------------------------------------------------------------------
// 1. Build de produção da lib
// ---------------------------------------------------------------------------
log('step 1/3: npm run build');
run('npm', ['run', 'build']);

// ---------------------------------------------------------------------------
// 2. lib/index.cjs + lib/index.mjs importam em node real sem SyntaxError
// ---------------------------------------------------------------------------
log('step 2/3: import real do bundle (CJS + ESM)');

const cjsPath = path.join(root, 'lib', 'index.cjs');
const mjsUrl = pathToFileURL(path.join(root, 'lib', 'index.mjs')).href;

run('node', [
  '-e',
  `const m = require(${JSON.stringify(cjsPath)});` +
    `if (typeof m.Schema !== 'function' || typeof m.Prop !== 'function')` +
    `  throw new Error('CJS bundle does not export Schema/Prop');` +
    `console.log('[smoke-decorators]   CJS OK (Schema/Prop exported)');`,
]);

run('node', [
  '--input-type=module',
  '-e',
  `const m = await import(${JSON.stringify(mjsUrl)});` +
    `if (typeof m.Schema !== 'function' || typeof m.Prop !== 'function')` +
    `  throw new Error('ESM bundle does not export Schema/Prop');` +
    `console.log('[smoke-decorators]   ESM OK (Schema/Prop exported)');`,
]);

// ---------------------------------------------------------------------------
// 3. Classe decorada consumidor-style pela cadeia de produção (tsdown+babel)
// ---------------------------------------------------------------------------
log('step 3/3: classe decorada transpilada por tsdown+babel roda em node');

rmSync(tmpDir, { recursive: true, force: true });
rmSync(outDir, { recursive: true, force: true });
mkdirSync(tmpDir, { recursive: true });

// Fixture consumidor-style: usa a sintaxe `@` de verdade e importa o BUNDLE
// de produção (lib/index.mjs), não o src/ — igual a um consumidor real.
// O import relativo '../../lib/index.mjs' resolve tanto do fixture
// (scripts/.smoke-tmp/) quanto do output (scripts/.smoke-out/) — ambos a
// dois níveis da raiz — e é mantido external no bundle do fixture.
//
// NOTA: campos decorados usam `?:` em vez de `!:` de propósito — o babel
// lowera o decorator injetando um inicializador (`= _init_name(this)`) e
// re-emite o `!` do TS junto; o Oxc então rejeita "initializer + definite
// assignment assertion" ao re-parsear. Só afeta esta cadeia interna
// (babel → oxc re-parse); consumidores com tsc/esbuild não passam por ela.
const fixture = `
import { Prop, Schema } from '../../lib/index.mjs';

@Schema('smoke')
class SmokeSchema {
  @Prop({ bsonType: 'string' })
  name?: string;

  @Prop({ description: 'no bsonType on purpose' })
  free?: unknown;

  undecorated?: string;
}

const metadata = (SmokeSchema as Record<PropertyKey, unknown>)[
  Symbol.metadata as unknown as PropertyKey
] as Record<string, unknown> | undefined;

if (!metadata) {
  throw new Error('SMOKE FAIL: Symbol.metadata not attached to decorated class');
}

const meta = metadata['mongoat:schema'] as {
  properties: Record<string, Record<string, unknown>>;
  required: string[];
};

if (!meta) {
  throw new Error('SMOKE FAIL: mongoat:schema metadata entry missing');
}

const props = Object.keys(meta.properties).sort();
if (JSON.stringify(props) !== JSON.stringify(['free', 'name'])) {
  throw new Error(
    'SMOKE FAIL: unexpected properties ' + JSON.stringify(props)
  );
}
if (meta.properties.name.bsonType !== 'string') {
  throw new Error('SMOKE FAIL: name.bsonType lost in production chain');
}
if ('bsonType' in meta.properties.free) {
  throw new Error('SMOKE FAIL: free field gained a magic bsonType');
}
if (JSON.stringify([...meta.required].sort()) !== JSON.stringify(['free', 'name'])) {
  throw new Error('SMOKE FAIL: required list wrong: ' + JSON.stringify(meta.required));
}

// Schema.compile devolve o mesmo shape que o objeto plano equivalente
// escrito à mão (comparação estrutural com chaves ordenadas).
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

const compiled = (Schema as unknown as {
  compile: (cls: unknown) => unknown;
}).compile(SmokeSchema);

const plainEquivalent = {
  bsonType: 'object',
  properties: {
    name: { bsonType: 'string' },
    free: { description: 'no bsonType on purpose' },
  },
  required: ['name', 'free'],
};

if (stableStringify(compiled) !== stableStringify(plainEquivalent)) {
  throw new Error(
    'SMOKE FAIL: Schema.compile shape mismatch: ' + JSON.stringify(compiled)
  );
}

console.log('[smoke-decorators]   decorated class executed in real node — metadata + Schema.compile OK');
`;

const fixturePath = path.join(tmpDir, 'consumer.ts');
writeFileSync(fixturePath, fixture);

// MESMA cadeia de produção: tsdown + @rolldown/plugin-babel +
// @babel/plugin-proposal-decorators '2023-11' (nunca esbuild/vitest, que
// loweram decorators nativamente e mascarariam a falha do build real).
const { build } = await import('tsdown');
const { default: babel } = await import('@rolldown/plugin-babel');

await build({
  config: false, // não herdar tsdown.config.mjs (entry/clean da lib)
  entry: [fixturePath],
  outDir,
  format: ['esm'],
  dts: false,
  clean: true,
  deps: { neverBundle: [/lib[\\/]index\.mjs$/] },
  plugins: [
    babel({
      include: /\.ts$/,
      plugins: [['@babel/plugin-proposal-decorators', { version: '2023-11' }]],
    }),
  ],
});

const consumerOut = path.join(outDir, 'consumer.mjs');
run('node', [consumerOut]);

rmSync(tmpDir, { recursive: true, force: true });
rmSync(outDir, { recursive: true, force: true });

log('ALL GREEN — production chain lowers TC39 decorators and runs in real node');
