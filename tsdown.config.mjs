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
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  outDir: 'lib',
  dts: true,
  clean: true,
});
