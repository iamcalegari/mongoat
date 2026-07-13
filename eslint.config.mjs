import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

// Flat config real para ESLint 9 (o `eslint.config.js` anterior era formato
// `.eslintrc` antigo — ESLint 9 o ignorava silenciosamente, ver
// 03-RESEARCH.md Pitfall 1). `.mjs` evita qualquer necessidade de
// `require`/`module`/`__dirname` (o pacote não declara "type": "module",
// então um `.js` aqui seria interpretado como CommonJS pelo Node ao
// carregar a config, exigindo globals extras só para o próprio arquivo de
// config). `tseslint.config(...)` combina `eslint.configs.recommended`
// (@eslint/js) + `tseslint.configs.recommended` e aplica type-aware parsing
// via `parserOptions.project`.
export default tseslint.config(
  {
    ignores: [
      'lib/**',
      'node_modules/**',
      'coverage/**',
      '**/*.d.ts',
      // Artefatos gerados do site de docs (VitePress build/cache + Reference
      // do TypeDoc) — não são código-fonte, não devem ser lintados.
      'docs/.vitepress/dist/**',
      'docs/.vitepress/cache/**',
      'docs/api/**',
    ],
  },
  eslint.configs.recommended,
  tseslint.configs.recommended,
  {
    files: ['**/*.ts'],
    languageOptions: {
      parserOptions: {
        project: './tsconfig.json',
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    // Scripts Node standalone (smoke-rc, deprecate-alphas): o recommended puro
    // não define ambiente algum, então os globals de runtime do Node precisam
    // ser declarados aqui (sem isso: no-undef em process/console).
    files: ['scripts/**/*.mjs'],
    languageOptions: {
      globals: {
        process: 'readonly',
        console: 'readonly',
      },
    },
  }
);
