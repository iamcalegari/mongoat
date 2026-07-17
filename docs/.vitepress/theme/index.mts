import { h } from 'vue';
import DefaultTheme from 'vitepress/theme';
import { withBase } from 'vitepress';
import './custom.css';
import BenchBars from './components/BenchBars.vue';

/**
 * Tema estendido do VitePress: injeta a arte oficial do Mongoat
 * (`graphics/mongoat-cover-4_1-no-bg.png`, copiada para `docs/public/`) como
 * banner no topo da landing page, via o slot `home-hero-before` do tema
 * padrão. `withBase(...)` resolve o caminho respeitando `base: '/mongoat/'`
 * (funciona tanto em `docs:dev` quanto no deploy do GitHub Pages).
 */
export default {
  extends: DefaultTheme,
  enhanceApp({ app }) {
    // Registrado globalmente para uso na página de benchmarks
    // (docs/explanation/benchmarks.md) sem re-importar por página.
    app.component('BenchBars', BenchBars);
  },
  Layout() {
    return h(DefaultTheme.Layout, null, {
      'home-hero-before': () =>
        h('div', { class: 'mongoat-banner' }, [
          h('img', {
            src: withBase('/mongoat-cover-4_1-no-bg.png'),
            alt: 'Mongoat — a lightweight, type-safe MongoDB ODM',
          }),
        ]),
    });
  },
};
