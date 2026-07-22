import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('node:module', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:module')>();

  return {
    ...actual,
    // Forces the CLI's tsx-resolution helper down its "tsx is not
    // installed" branch WITHOUT touching the real optional peer this repo
    // actually has installed — the only way a unit test can observe the
    // resulting runtime error message.
    createRequire: (...args: Parameters<typeof actual.createRequire>) => {
      const real = actual.createRequire(...args);
      const patched = ((id: string) => real(id)) as unknown as NodeRequire;

      patched.resolve = ((
        specifier: string,
        options?: { paths?: string[] }
      ) => {
        if (specifier === 'tsx/cli') {
          throw new Error("Cannot find module 'tsx/cli'");
        }

        return real.resolve(specifier, options);
      }) as typeof real.resolve;

      return patched;
    },
  };
});

import { parseBooleanEnv, resolveMigrateConfig } from '@/bin/mongoat';
import { MongoatError, MongoatValidationError } from '@/errors';
import {
  loadConfigFile,
  normalizeConfigExport,
  resolveConfigPath,
  validateConfigShape,
} from '@/migrate/config';

/**
 * Contrato do loader de config da CLI de migrations: descoberta no cwd,
 * carregamento de `.json`/`.js`, normalização de interop ESM/CJS e
 * validação strict do shape resultante.
 *
 * Todo cwd de teste é criado com `mkdtempSync` sob `tmpdir()` e removido no
 * `finally`; nunca trocando o diretório de trabalho do processo de teste —
 * esse é estado global e tornaria a execução paralela de arquivos do
 * Vitest não-determinística. Cada função sob teste recebe o cwd como
 * parâmetro explícito.
 */
describe('mongoat config loader', () => {
  let stdoutSpy: ReturnType<typeof vi.spyOn>;
  let stderrSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    stdoutSpy = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => true);
    stderrSpy = vi
      .spyOn(process.stderr, 'write')
      .mockImplementation(() => true);
  });

  afterEach(() => {
    stdoutSpy.mockRestore();
    stderrSpy.mockRestore();
  });

  function makeTmpDir(): string {
    return mkdtempSync(path.join(tmpdir(), 'mongoat-config-loader-'));
  }

  describe('resolveConfigPath', () => {
    it('an empty cwd resolves to undefined without throwing', async () => {
      const dir = makeTmpDir();
      try {
        await expect(resolveConfigPath(dir)).resolves.toBeUndefined();
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('a cwd with only mongoat.config.json resolves to its absolute path', async () => {
      const dir = makeTmpDir();
      try {
        const configPath = path.join(dir, 'mongoat.config.json');
        writeFileSync(configPath, '{}', 'utf-8');

        await expect(resolveConfigPath(dir)).resolves.toBe(configPath);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('a cwd with only mongoat.config.js resolves to its absolute path', async () => {
      const dir = makeTmpDir();
      try {
        const configPath = path.join(dir, 'mongoat.config.js');
        writeFileSync(configPath, 'module.exports = {};', 'utf-8');

        await expect(resolveConfigPath(dir)).resolves.toBe(configPath);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('a cwd with both mongoat.config.json and mongoat.config.js fails loud listing both files', async () => {
      const dir = makeTmpDir();
      try {
        const jsonPath = path.join(dir, 'mongoat.config.json');
        const jsPath = path.join(dir, 'mongoat.config.js');
        writeFileSync(jsonPath, '{}', 'utf-8');
        writeFileSync(jsPath, 'module.exports = {};', 'utf-8');

        let caught: unknown;
        try {
          await resolveConfigPath(dir);
        } catch (err) {
          caught = err;
        }

        expect(caught).toBeInstanceOf(MongoatValidationError);
        const err = caught as MongoatValidationError;
        expect(err.code).toBe('AMBIGUOUS_CONFIG');
        expect(err.message).toContain('mongoat.config.json');
        expect(err.message).toContain('mongoat.config.js');
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('a relative explicit path is resolved against the given cwd, not process.cwd()', async () => {
      const dir = makeTmpDir();
      try {
        const configPath = path.join(dir, 'custom.config.json');
        writeFileSync(configPath, '{}', 'utf-8');

        await expect(
          resolveConfigPath(dir, 'custom.config.json')
        ).resolves.toBe(configPath);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('an explicit path with an unsupported extension fails loud before touching the filesystem', async () => {
      const dir = makeTmpDir();
      try {
        // Nenhum arquivo é criado — se a checagem de extensão não rodasse
        // primeiro, a tentativa de acesso ao filesystem produziria
        // CONFIG_NOT_FOUND, não INVALID_CONFIG_PATH.
        let caught: unknown;
        try {
          await resolveConfigPath(dir, path.join(dir, 'mongoat.config.yaml'));
        } catch (err) {
          caught = err;
        }

        expect(caught).toBeInstanceOf(MongoatValidationError);
        expect((caught as MongoatValidationError).code).toBe(
          'INVALID_CONFIG_PATH'
        );
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('an explicit path pointing to a nonexistent file fails loud as not found', async () => {
      const dir = makeTmpDir();
      try {
        let caught: unknown;
        try {
          await resolveConfigPath(dir, path.join(dir, 'mongoat.config.json'));
        } catch (err) {
          caught = err;
        }

        expect(caught).toBeInstanceOf(MongoatValidationError);
        expect((caught as MongoatValidationError).code).toBe(
          'CONFIG_NOT_FOUND'
        );
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('an explicit path bypasses the cwd probe entirely', async () => {
      const dir = makeTmpDir();
      const otherDir = makeTmpDir();
      try {
        const probedPath = path.join(dir, 'mongoat.config.json');
        writeFileSync(probedPath, '{"dir":"probed"}', 'utf-8');

        const explicitPath = path.join(otherDir, 'explicit.config.json');
        writeFileSync(explicitPath, '{"dir":"explicit"}', 'utf-8');

        await expect(resolveConfigPath(dir, explicitPath)).resolves.toBe(
          explicitPath
        );
      } finally {
        rmSync(dir, { recursive: true, force: true });
        rmSync(otherDir, { recursive: true, force: true });
      }
    });
  });

  describe('loadConfigFile', () => {
    it('loads a well-formed .json config by reading and parsing, never via dynamic import', async () => {
      // O nome do diretório contém um caractere ('#') que quebraria uma URL
      // crua não-codificada se o caminho fosse passado para `import()` — o
      // carregamento de `.json` nunca passa por ali, então funciona mesmo
      // assim.
      const dir = makeTmpDir();
      try {
        const oddDir = path.join(dir, 'weird#dir');
        mkdirSync(oddDir);
        const configPath = path.join(oddDir, 'mongoat.config.json');
        writeFileSync(
          configPath,
          JSON.stringify({ dir: 'db/migrations' }),
          'utf-8'
        );

        const result = await loadConfigFile(configPath);

        expect(result).toEqual({ dir: 'db/migrations' });
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('a malformed .json config fails loud with the original parse error preserved as cause', async () => {
      const dir = makeTmpDir();
      try {
        const configPath = path.join(dir, 'mongoat.config.json');
        writeFileSync(configPath, '{ not valid json', 'utf-8');

        let caught: unknown;
        try {
          await loadConfigFile(configPath);
        } catch (err) {
          caught = err;
        }

        expect(caught).toBeInstanceOf(MongoatError);
        const err = caught as MongoatError;
        expect(err.code).toBe('CONFIG_LOAD_FAILED');
        expect(err.cause).toBeDefined();
        expect(typeof err.cause).not.toBe('string');
        expect(err.cause).toBeInstanceOf(Error);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('loads a CommonJS .js config via module.exports', async () => {
      const dir = makeTmpDir();
      try {
        const configPath = path.join(dir, 'mongoat.config.js');
        writeFileSync(configPath, "module.exports = { dir: 'x' };", 'utf-8');

        const result = await loadConfigFile(configPath);

        expect(result).toEqual({ dir: 'x' });
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('loads an ESM .js config via export default under a "type": "module" package.json', async () => {
      const dir = makeTmpDir();
      try {
        writeFileSync(
          path.join(dir, 'package.json'),
          JSON.stringify({ type: 'module' }),
          'utf-8'
        );
        const configPath = path.join(dir, 'mongoat.config.js');
        writeFileSync(configPath, "export default { dir: 'x' };", 'utf-8');

        const result = await loadConfigFile(configPath);

        expect(result).toEqual({ dir: 'x' });
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('writes exactly one informational line to stderr with the loaded path, and stdout stays untouched', async () => {
      const dir = makeTmpDir();
      try {
        const configPath = path.join(dir, 'mongoat.config.json');
        writeFileSync(configPath, '{}', 'utf-8');

        await loadConfigFile(configPath);

        const stderrOutput = stderrSpy.mock.calls
          .map((call: unknown[]) => call[0])
          .join('');
        const occurrences = stderrOutput.split(configPath).length - 1;

        expect(occurrences).toBe(1);
        expect(stdoutSpy).not.toHaveBeenCalled();
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('when resolveConfigPath finds nothing, nothing is written to stderr', async () => {
      const dir = makeTmpDir();
      try {
        const resolved = await resolveConfigPath(dir);

        expect(resolved).toBeUndefined();
        expect(stderrSpy).not.toHaveBeenCalled();
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });
  });

  describe('normalizeConfigExport', () => {
    it('unwraps a single ESM default export', () => {
      expect(normalizeConfigExport({ default: { dir: 'x' } })).toEqual({
        dir: 'x',
      });
    });

    it('unwraps a double-wrapped compiled-ESM-under-CJS default export', () => {
      expect(
        normalizeConfigExport({
          default: { __esModule: true, default: { dir: 'x' } },
        })
      ).toEqual({ dir: 'x' });
    });

    it('preserves a legitimate "default" data key when the interop marker is absent', () => {
      expect(normalizeConfigExport({ default: { default: 'v' } })).toEqual({
        default: 'v',
      });
    });

    it('leaves a namespace without a "default" key unchanged', () => {
      expect(normalizeConfigExport({ dir: 'x' })).toEqual({ dir: 'x' });
    });
  });

  describe('validateConfigShape', () => {
    it.each(['lockTtlMS', 'Dir', 'collectionName'])(
      'rejects an unknown key ("%s"), citing it and the allowed key list',
      (key) => {
        let caught: unknown;
        try {
          validateConfigShape({ [key]: 'value' }, 'mongoat.config.json');
        } catch (err) {
          caught = err;
        }

        expect(caught).toBeInstanceOf(MongoatValidationError);
        const err = caught as MongoatValidationError;
        expect(err.code).toBe('INVALID_CONFIG_SHAPE');
        expect(err.message).toContain(key);
        expect(err.message).toContain('dir');
        expect(err.message).toContain('collection');
        expect(err.message).toContain('lockTtlMs');
        expect(err.message).toContain('allowNoTransaction');
      }
    );

    const wrongTypeCases: Array<[string, unknown]> = [
      ['dir', 123],
      ['collection', 123],
      ['allowNoTransaction', 'yes'],
    ];

    it.each(wrongTypeCases)(
      'rejects a wrong-typed "%s" value',
      (field, value) => {
        let caught: unknown;
        try {
          validateConfigShape({ [field]: value }, 'mongoat.config.json');
        } catch (err) {
          caught = err;
        }

        expect(caught).toBeInstanceOf(MongoatValidationError);
        expect((caught as MongoatValidationError).code).toBe(
          'INVALID_CONFIG_SHAPE'
        );
      }
    );

    it.each([0, -1, 1.5, 'not-a-number'])(
      'rejects an invalid lockTtlMs value (%p)',
      (value) => {
        let caught: unknown;
        try {
          validateConfigShape({ lockTtlMs: value }, 'mongoat.config.json');
        } catch (err) {
          caught = err;
        }

        expect(caught).toBeInstanceOf(MongoatValidationError);
        expect((caught as MongoatValidationError).code).toBe(
          'INVALID_CONFIG_SHAPE'
        );
      }
    );

    const nonObjectCases: unknown[] = ['not an object', 42, null, ['array']];

    it.each(nonObjectCases)('rejects a non-object export (%p)', (raw) => {
      let caught: unknown;
      try {
        validateConfigShape(raw, 'mongoat.config.json');
      } catch (err) {
        caught = err;
      }

      expect(caught).toBeInstanceOf(MongoatValidationError);
      expect((caught as MongoatValidationError).code).toBe(
        'INVALID_CONFIG_SHAPE'
      );
    });

    it('rejects a prototype-pollution key as unknown, leaving Object.prototype untouched', () => {
      // Chave montada a partir de partes para não deixar o literal na
      // fonte deste arquivo de teste. `JSON.parse` (ao contrário de um
      // literal de objeto) cria uma propriedade PRÓPRIA com esse nome —
      // o mesmo formato que `loadConfigFile` produziria para um
      // `mongoat.config.json` malicioso.
      const prototypePollutionKey = `${'_'.repeat(2)}proto${'_'.repeat(2)}`;
      const raw: unknown = JSON.parse(
        `{"${prototypePollutionKey}": {"polluted": true}}`
      );

      let caught: unknown;
      try {
        validateConfigShape(raw, 'mongoat.config.json');
      } catch (err) {
        caught = err;
      }

      expect(caught).toBeInstanceOf(MongoatValidationError);
      expect((caught as MongoatValidationError).code).toBe(
        'INVALID_CONFIG_SHAPE'
      );
      expect(Object.prototype).not.toHaveProperty('polluted');
    });

    it('returns a new object containing only the four known fields', () => {
      const raw = {
        dir: 'db/migrations',
        collection: '_migrations',
        lockTtlMs: 5000,
        allowNoTransaction: true,
      };

      const result = validateConfigShape(raw, 'mongoat.config.json');

      expect(result).toEqual(raw);
      expect(result).not.toBe(raw);
    });
  });

  describe('shape validation rejects empty and unsafe values', () => {
    it('rejects an empty "dir"', () => {
      expect(() => validateConfigShape({ dir: '' }, '/x')).toThrowError(
        MongoatValidationError
      );
      expect(() => validateConfigShape({ dir: '   ' }, '/x')).toThrowError(
        /must be a non-empty string/
      );
    });

    it('rejects an empty "collection"', () => {
      expect(() => validateConfigShape({ collection: '' }, '/x')).toThrowError(
        /must be a non-empty string/
      );
    });

    it('rejects a collection name the driver would only fail on later', () => {
      for (const bad of ['has$dollar', 'system.profile', 'nul\0byte']) {
        expect(() =>
          validateConfigShape({ collection: bad }, '/x')
        ).toThrowError(/not a valid MongoDB collection name/);
      }
    });

    it('still accepts a normal collection name', () => {
      expect(validateConfigShape({ collection: '_migrations' }, '/x')).toEqual({
        collection: '_migrations',
      });
    });

    it('uses a consistent article in the "not a plain object" message', () => {
      expect(() => validateConfigShape('hello', '/x')).toThrowError(
        /received a string/
      );
      expect(() => validateConfigShape(42, '/x')).toThrowError(
        /received a number/
      );
      expect(() => validateConfigShape([], '/x')).toThrowError(
        /received an array/
      );
    });
  });

  describe('explicit --config path containment', () => {
    it('rejects a relative path that escapes the working directory', async () => {
      const dir = makeTmpDir();
      try {
        let caught: unknown;
        try {
          await resolveConfigPath(dir, '../outside.js');
        } catch (err) {
          caught = err;
        }

        expect(caught).toBeInstanceOf(MongoatValidationError);
        expect((caught as MongoatValidationError).code).toBe(
          'INVALID_CONFIG_PATH'
        );
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('still accepts an absolute path outside the cwd as an explicit escape hatch', async () => {
      const dir = makeTmpDir();
      const other = makeTmpDir();
      try {
        const abs = path.join(other, 'mongoat.config.json');
        writeFileSync(abs, '{}', 'utf-8');

        await expect(resolveConfigPath(dir, abs)).resolves.toBe(abs);
      } finally {
        rmSync(dir, { recursive: true, force: true });
        rmSync(other, { recursive: true, force: true });
      }
    });
  });

  describe('cwd probe ignores a non-file candidate', () => {
    it('skips a DIRECTORY named like a config file', async () => {
      const dir = makeTmpDir();
      try {
        // A directory whose name collides with a config basename must not be
        // treated as a config file — nor trip the ambiguity error alongside a
        // real one.
        mkdirSync(path.join(dir, 'mongoat.config.js'));
        const realConfig = path.join(dir, 'mongoat.config.json');
        writeFileSync(realConfig, '{}', 'utf-8');

        await expect(resolveConfigPath(dir)).resolves.toBe(realConfig);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });
  });

  describe('parseBooleanEnv names the variable it was given', () => {
    it('quotes the caller-supplied var name and code on an invalid value', () => {
      let caught: unknown;
      try {
        parseBooleanEnv(
          'perhaps',
          'SOME_OTHER_FLAG',
          'INVALID_SOME_OTHER_FLAG'
        );
      } catch (err) {
        caught = err;
      }

      expect(caught).toBeInstanceOf(MongoatValidationError);
      expect((caught as MongoatValidationError).code).toBe(
        'INVALID_SOME_OTHER_FLAG'
      );
      expect((caught as Error).message).toContain('SOME_OTHER_FLAG');
    });
  });

  describe('mensagens sem jargão de planejamento interno', () => {
    // Guarda genérica: replica as três regexes já usadas em
    // test/migrate/lock-acquisition.test.ts — toda mensagem nova precisa
    // satisfazê-las, já que é lida por quem OPERA a lib.
    const assertNoPlanningJargon = (message: string): void => {
      expect(message).not.toMatch(/\b[A-Z]{2,5}-\d{2}\b/);
      expect(message).not.toMatch(/\bD-\d{1,2}\b/);
      expect(message).not.toMatch(
        /\b(Fase|Phase|Plano|Plan|Task|Wave|Pitfall|Pattern)\s+\d/i
      );
      // Non-numbered process vocabulary — the class that slipped past the
      // numbered patterns above. Only unambiguous process words are matched
      // bare (a case-insensitive `\bPattern\b` would false-positive on
      // identifiers like `TSX_LOADER_PATTERN`).
      expect(message).not.toMatch(/\b(phase|fase|pitfall)\b/i);
      expect(message).not.toMatch(/\b(RED|GREEN) note\b/i);
      expect(message).not.toMatch(/\bimplementation task\b/i);
    };

    it('the AMBIGUOUS_CONFIG message stays free of planning identifiers', async () => {
      const dir = makeTmpDir();
      try {
        writeFileSync(path.join(dir, 'mongoat.config.json'), '{}', 'utf-8');
        writeFileSync(
          path.join(dir, 'mongoat.config.js'),
          'module.exports = {};',
          'utf-8'
        );

        let caught: unknown;
        try {
          await resolveConfigPath(dir);
        } catch (err) {
          caught = err;
        }

        assertNoPlanningJargon((caught as Error).message);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('the INVALID_CONFIG_PATH message stays free of planning identifiers', async () => {
      const dir = makeTmpDir();
      try {
        let caught: unknown;
        try {
          await resolveConfigPath(dir, path.join(dir, 'mongoat.config.yaml'));
        } catch (err) {
          caught = err;
        }

        assertNoPlanningJargon((caught as Error).message);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('the CONFIG_NOT_FOUND message stays free of planning identifiers', async () => {
      const dir = makeTmpDir();
      try {
        let caught: unknown;
        try {
          await resolveConfigPath(dir, path.join(dir, 'mongoat.config.json'));
        } catch (err) {
          caught = err;
        }

        assertNoPlanningJargon((caught as Error).message);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('the CONFIG_LOAD_FAILED message stays free of planning identifiers', async () => {
      const dir = makeTmpDir();
      try {
        const configPath = path.join(dir, 'mongoat.config.json');
        writeFileSync(configPath, '{ not valid json', 'utf-8');

        let caught: unknown;
        try {
          await loadConfigFile(configPath);
        } catch (err) {
          caught = err;
        }

        assertNoPlanningJargon((caught as Error).message);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('the INVALID_CONFIG_SHAPE message stays free of planning identifiers', () => {
      let caught: unknown;
      try {
        validateConfigShape({ unknownField: 'value' }, 'mongoat.config.json');
      } catch (err) {
        caught = err;
      }

      assertNoPlanningJargon((caught as Error).message);
    });

    it('the INVALID_ALLOW_NO_TRANSACTION message stays free of planning identifiers', () => {
      let caught: unknown;
      try {
        parseBooleanEnv('maybe');
      } catch (err) {
        caught = err;
      }

      assertNoPlanningJargon((caught as Error).message);
    });

    it('the TSX_NOT_AVAILABLE message stays free of planning identifiers', async () => {
      const dir = makeTmpDir();
      try {
        writeFileSync(
          path.join(dir, 'mongoat.config.ts'),
          'export default {};',
          'utf-8'
        );

        let caught: unknown;
        try {
          // A `.ts` config alone is enough to trigger the tsx-resolution
          // checkpoint, before the file is ever loaded — no `.ts` migration
          // needed. `createRequire` is mocked at the top of this file so
          // `tsx/cli` cannot be resolved, forcing the "not installed" branch.
          await resolveMigrateConfig({}, dir);
        } catch (err) {
          caught = err;
        }

        expect(caught).toBeInstanceOf(MongoatError);
        expect((caught as MongoatError).code).toBe('TSX_NOT_AVAILABLE');
        assertNoPlanningJargon((caught as Error).message);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    describe('static scan of the CLI config source files', () => {
      // Mensagens de erro só cobrem o que RODA em tempo de execução —
      // um identificador de planejamento vazado num comentário de JSDoc
      // nunca dispararia nenhuma das asserções acima, mas chegaria intacto
      // na documentação de API gerada (o pacote é público). Lendo o
      // conteúdo INTEIRO dos dois arquivos-fonte da CLI de config e
      // aplicando as MESMAS regexes fecha essa lacuna — reutiliza os
      // literais de `assertNoPlanningJargon` acima para que os dois lugares
      // nunca divirjam com o tempo.
      const PROJECT_ROOT = path.resolve(__dirname, '../..');

      it.each([['src/migrate/config.ts'], ['src/bin/mongoat.ts']] as const)(
        '%s never leaks a planning identifier, comments included',
        (relativePath) => {
          const content = readFileSync(
            path.join(PROJECT_ROOT, relativePath),
            'utf-8'
          );

          assertNoPlanningJargon(content);
        }
      );
    });
  });
});
