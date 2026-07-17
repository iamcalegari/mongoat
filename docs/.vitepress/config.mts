import { defineConfig } from 'vitepress';

// Gerado pelo TypeDoc (`npm run predocs:*`, ver typedoc.json na raiz) —
// NÃO editar à mão, é regenerado a cada build (docs/api/ é gitignorado).
import typedocSidebar from '../api/typedoc-sidebar.json';

/**
 * Config VitePress do site de documentação do Mongoat (04-01/DOCS-01).
 *
 * `base: '/mongoat/'` é OBRIGATÓRIO (Pitfall 2 do 04-RESEARCH.md): GitHub
 * Pages serve project pages em `usuario.github.io/repo/`, um subpath — sem
 * isso os assets quebram só depois do deploy (funciona normalmente em
 * `docs:dev`, que ignora `base`).
 *
 * Nav/sidebar seguem os 4 quadrantes formais do Diátaxis (D-02) + Home +
 * Migration. A Reference (`/api/`) é a única seção gerada (TypeDoc); as
 * demais são escritas à mão (preenchidas nas Waves 2 deste plano).
 */
export default defineConfig({
  title: 'Mongoat',
  description: 'A lightweight, type-safe MongoDB ODM for Node.js/TypeScript',
  base: '/mongoat/',

  // Favicon: medalhão quadrado do símbolo do Mongoat (cabra no círculo verde),
  // recortado da arte oficial — a arte widescreen do banner virava um borrão
  // ilegível quando reduzida a 16/32px na aba. `head` links NÃO são
  // auto-prefixados pelo VitePress, então o `base` (/mongoat/) entra explícito
  // no href. Dois tamanhos: 32px afiado para a aba, 512px para bookmarks/apple.
  head: [
    [
      'link',
      {
        rel: 'icon',
        type: 'image/png',
        sizes: '32x32',
        href: '/mongoat/mongoat-icon-32.png',
      },
    ],
    [
      'link',
      {
        rel: 'icon',
        type: 'image/png',
        sizes: '512x512',
        href: '/mongoat/mongoat-icon.png',
      },
    ],
    ['link', { rel: 'apple-touch-icon', href: '/mongoat/mongoat-icon.png' }],
  ],

  themeConfig: {
    search: {
      provider: 'local',
    },

    nav: [
      { text: 'Home', link: '/' },
      { text: 'Tutorials', link: '/tutorials/getting-started' },
      { text: 'How-to', link: '/how-to/hooks' },
      { text: 'Reference', link: '/api/' },
      { text: 'Explanation', link: '/explanation/thin-odm-philosophy' },
      { text: 'Benchmarks', link: '/explanation/benchmarks' },
      { text: 'Versioning', link: '/explanation/versioning' },
      { text: 'Migration', link: '/migration' },
    ],

    sidebar: {
      '/tutorials/': [
        {
          text: 'Tutorials',
          items: [{ text: 'Getting started', link: '/tutorials/getting-started' }],
        },
      ],
      '/how-to/': [
        {
          text: 'How-to guides',
          items: [
            { text: 'Register pre/post hooks', link: '/how-to/hooks' },
            { text: 'Document defaults & timestamps', link: '/how-to/document-defaults' },
            { text: 'Define indexes & validation', link: '/how-to/indexes-validation' },
            { text: 'Run aggregation pipelines', link: '/how-to/aggregation' },
            { text: 'Batch writes with bulkWrite', link: '/how-to/bulk-write' },
            { text: 'Use transactions & sessions', link: '/how-to/transactions' },
            { text: 'Sanitize untrusted filters', link: '/how-to/sanitize-filters' },
            { text: 'Handle errors', link: '/how-to/handle-errors' },
            { text: 'Use the native escape hatch', link: '/how-to/escape-hatch' },
          ],
        },
      ],
      '/explanation/': [
        {
          text: 'Explanation',
          items: [
            { text: 'The thin ODM philosophy', link: '/explanation/thin-odm-philosophy' },
            { text: 'Why Proxy gating', link: '/explanation/proxy-gating' },
            { text: 'Server-side validation', link: '/explanation/server-side-validation' },
            { text: 'Benchmarks', link: '/explanation/benchmarks' },
            { text: 'Stability & versioning', link: '/explanation/versioning' },
          ],
        },
      ],
      '/api/': [
        {
          text: 'Reference',
          items: typedocSidebar,
        },
      ],
    },

    socialLinks: [{ icon: 'github', link: 'https://github.com/iamcalegari/mongoat' }],
  },
});
