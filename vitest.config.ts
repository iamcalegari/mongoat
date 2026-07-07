import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

/**
 * Configuração base do vitest.
 *
 * Resolve os path aliases do `tsconfig.json` (@/*, @utils/*, @types/*,
 * @test/*) via `vite-tsconfig-paths`, já que o vitest não lê `paths` do
 * tsconfig nativamente (RESEARCH.md — Pitfall 5).
 *
 * O backend de teste é um MongoDB real via Docker (@testcontainers/mongodb),
 * subido/derrubado pelo globalSetup abaixo (D-13) — sem servidor Mongo
 * em memória.
 */
export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globalSetup: ['./test/setup/testcontainer.ts'],
    // Subir o container Mongo na primeira execução pode demorar; timeout
    // generoso evita falso-negativo em máquinas mais lentas/CI.
    testTimeout: 60000,
  },
});
