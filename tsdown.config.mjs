import babel from '@rolldown/plugin-babel';
import { defineConfig } from 'tsdown';

// Config em `.mjs` (JavaScript ESM puro), carregado com `--config-loader
// native` (ver script `build` no package.json) — os dois juntos evitam a
// dependência opcional `unrun`:
//   - Em Node < 22.12 (sem type-stripping nativo) o tsdown escolhe o loader
//     de config `unrun` por padrão (uma peerDependency OPCIONAL que o
//     `npm ci` NÃO instala), quebrando o build no CI na matriz Node 20.x
//     ("Failed to import module unrun").
//   - `--config-loader native` força o import() nativo do arquivo de config;
//     como este arquivo é `.mjs` (JS puro, sem sintaxe TS), o Node 20 o
//     importa diretamente, sem type-stripping e sem loader externo.
// `type` não está declarado no package.json (CommonJS default), então precisa
// ser `.mjs` — um `.js` seria tratado como CommonJS e o `import` acima falharia.
export default defineConfig({
  // The `mongoat` key below is the shebang CLI bin, coexisting with the
  // library entry. Using the `Record<string, string>` entry form (instead
  // of an array) pins the output chunk name to the key, flattening
  // `src/bin/mongoat.ts` to `lib/mongoat.{cjs,mjs}` — an array entry
  // preserves the source directory structure (`lib/bin/mongoat.cjs`
  // instead), which would not match the `bin.mongoat` path declared in
  // package.json (verified at implementation time; Assumption A3).
  entry: { index: 'src/index.ts', mongoat: 'src/bin/mongoat.ts' },
  format: ['esm', 'cjs'],
  outDir: 'lib',
  dts: true,
  clean: true,
  plugins: [
    // Rolldown/Oxc ainda NÃO fazem lowering de decorators TC39 stage-3 (o
    // parser aceita a sintaxe, mas não há transform — só decorators legados
    // de `experimentalDecorators` são suportados; ver oxc-project/oxc#9170).
    // Sem este plugin, qualquer sintaxe `@Decorator` em `src/schema/**`
    // sairia crua no bundle e quebraria com SyntaxError em node real.
    // O filtro `include` restringe o Babel a `src/schema/**` — o resto do
    // codebase não usa decorators e continua passando só pelo Oxc.
    // `version: '2023-11'` é a revisão da proposta stage-3 compatível com o
    // que o TypeScript 5.x emite (NUNCA usar 'legacy', que é a proposta
    // stage-1 antiga, divergente do TS moderno).
    babel({
      include: /src[\\/]schema[\\/].*\.ts$/,
      plugins: [['@babel/plugin-proposal-decorators', { version: '2023-11' }]],
    }),
  ],
});
