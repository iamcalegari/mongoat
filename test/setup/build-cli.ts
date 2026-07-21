import { execFileSync } from 'node:child_process';
import path from 'node:path';

const PROJECT_ROOT = path.resolve(__dirname, '../..');

/**
 * Constrói o pacote UMA VEZ antes de qualquer arquivo de teste rodar.
 *
 * Os testes que exercitam a CLI de verdade (`spawnSync` sobre
 * `lib/mongoat.cjs`) precisam do bundle construído. Cada um deles fazia o
 * próprio `npm run build` no `beforeAll` — e como `prebuild` é
 * `rimraf ./lib` e o vitest roda arquivos em paralelo, o build de um
 * arquivo apagava `lib/` no meio do `spawnSync` de outro, que então
 * falhava com `ERR_MODULE_NOT_FOUND`. A falha era intermitente: só aparecia
 * quando as janelas se sobrepunham, o que depende de timing de máquina.
 *
 * Centralizar aqui elimina a janela: quando o primeiro arquivo de teste
 * começa, o build já terminou e ninguém mais apaga `lib/`.
 */
export async function setup(): Promise<void> {
  try {
    execFileSync('npm', ['run', 'build'], {
      cwd: PROJECT_ROOT,
      stdio: 'pipe',
      encoding: 'utf-8',
    });
  } catch (err) {
    // Re-emite a saída do build: com `stdio: 'pipe'` e sem isto, uma quebra
    // de build falharia com um "Command failed" pelado, sem os diagnósticos
    // do `tsc`/tsdown que dizem o que de fato quebrou.
    const e = err as { stdout?: string; stderr?: string };

    throw new Error(`build failed:\n${e.stdout ?? ''}${e.stderr ?? ''}`);
  }
}
