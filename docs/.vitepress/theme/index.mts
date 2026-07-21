import DefaultTheme from 'vitepress/theme';
import './custom.css';
import BenchBars from './components/BenchBars.vue';

/**
 * Tema estendido do VitePress. A arte oficial do Mongoat aparece como
 * `hero.image` na própria landing page (docs/index.md), com o glow definido
 * em custom.css — não há banner injetado por slot.
 */
export default {
  extends: DefaultTheme,
  enhanceApp({ app }) {
    // Registrado globalmente para uso na página de benchmarks
    // (docs/explanation/benchmarks.md) sem re-importar por página.
    app.component('BenchBars', BenchBars);
  },
};
