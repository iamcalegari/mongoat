import babel from '@rolldown/plugin-babel';
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
  plugins: [
    tsconfigPaths(),
    // Decorators TC39 stage-3 na suíte: o Vite 8 (rolldown-vite) transforma
    // com Oxc, que ainda NÃO lowera decorators stage-3 (o parser aceita a
    // sintaxe, mas não há transform) — sem este plugin, qualquer arquivo de
    // teste com `@Schema`/`@Prop` quebra com SyntaxError ao ser executado.
    // Usa a MESMA cadeia babel do build de produção (tsdown.config.mjs):
    // @babel/plugin-proposal-decorators version '2023-11' — semântica de
    // lowering idêntica entre suíte e bundle publicado.
    babel({
      include: /(?:src|test)[\\/]schema[\\/].*\.ts$/,
      plugins: [['@babel/plugin-proposal-decorators', { version: '2023-11' }]],
    }),
  ],
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    globalSetup: ['./test/setup/testcontainer.ts'],
    // Subir o container Mongo na primeira execução pode demorar; timeout
    // generoso evita falso-negativo em máquinas mais lentas/CI.
    testTimeout: 60000,
    // D-10: gate de cobertura, só aplicado quando a suíte roda com
    // `--coverage` (`npm test` puro não paga o custo de instrumentação).
    // Thresholds são o PONTO DE PARTIDA definido em 03-CONTEXT.md/
    // 03-RESEARCH.md (Wave 0 Gaps) — deliberadamente abaixo de 100%, que
    // incentivaria testes vazios só para inflar o número. O gate falha o
    // build (`process.exitCode = 1`) se a suíte cair abaixo do mínimo —
    // consumido como gate real pelo CI no Plano 05.
    coverage: {
      provider: 'v8',
      thresholds: {
        lines: 80,
        functions: 80,
        statements: 80,
        branches: 70,
      },
    },
  },
});
