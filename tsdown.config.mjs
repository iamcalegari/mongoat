import { defineConfig } from 'tsdown';

// Config em `.mjs` (JavaScript ESM puro) de propósito: um `tsdown.config.ts`
// exige que o tsdown carregue TypeScript, o que em Node < 22.12 (sem
// type-stripping nativo) cai no loader opcional `unrun` — uma peerDependency
// opcional do tsdown que o `npm ci` NÃO instala, quebrando o build no CI
// (matriz Node 20.x). Um `.mjs` é importado nativamente por qualquer Node
// suportado, sem loader nem dependência extra. `type` não está declarado no
// package.json (CommonJS default), então precisa ser `.mjs` — um `.js` seria
// tratado como CommonJS e o `import` acima falharia.
export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  outDir: 'lib',
  dts: true,
  clean: true,
});
