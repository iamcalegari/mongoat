import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

/**
 * Configuração base do vitest.
 *
 * Resolve os path aliases do `tsconfig.json` (@/*, @utils/*, @types/*,
 * @test/*), já que o vitest não lê `paths` do tsconfig nativamente
 * (RESEARCH.md — Pitfall 5). Usa o plugin `vite-tsconfig-paths` e também
 * habilita `resolve.tsconfigPaths` nativo do Vite 8 como fallback — nesta
 * combinação de versões (vite-tsconfig-paths 6.1.1 + vite 8) o plugin
 * sozinho não resolveu os aliases (import de `@/*` falhava com "Cannot find
 * package"); a opção nativa fecha a lacuna.
 *
 * O backend de teste é um MongoDB real via Docker (@testcontainers/mongodb),
 * subido/derrubado pelo globalSetup abaixo (D-13) — sem servidor Mongo
 * em memória.
 */
export default defineConfig({
  plugins: [tsconfigPaths()],
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    globalSetup: ['./test/setup/testcontainer.ts'],
    // Subir o container Mongo na primeira execução pode demorar; timeout
    // generoso evita falso-negativo em máquinas mais lentas/CI.
    testTimeout: 60000,
  },
});
