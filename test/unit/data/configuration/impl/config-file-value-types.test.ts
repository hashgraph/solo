// SPDX-License-Identifier: Apache-2.0

/**
 * The declared-type check used to live only in `EnvironmentConfigSource`, so a value set in
 * `~/.solo/solo-config.yaml` reached the schema unchecked. That file became a live config source when the
 * cascade was first wired up, and the `yaml` package reads YAML 1.2, where `off`, `no` and `yes` are plain
 * strings — so `skipNodePing: off` arrived as the truthy string `"off"` and switched the flag *on*,
 * the exact inversion the feature-flag work set out to remove.
 *
 * These pin the check to every source. See docs/contributing/feature-flags.md.
 */

import fs from 'node:fs';
import os from 'node:os';
import {expect} from 'chai';
import {afterEach, beforeEach, describe, it} from 'mocha';
import {OptionalDefaultConfigSource} from '../../../../../src/data/configuration/impl/optional-default-config-source.js';
import {SoloConfigSchemaDefinition} from '../../../../../src/data/schema/migration/impl/solo/solo-config-schema-definition.js';
import {ClassToObjectMapper} from '../../../../../src/data/mapper/impl/class-to-object-mapper.js';
import {ConfigKeyFormatter} from '../../../../../src/data/key/config-key-formatter.js';
import {EnvironmentAliasRegistry} from '../../../../../src/data/schema/decorators/environment-alias-registry.js';
import {EnvironmentConfigSource} from '../../../../../src/data/configuration/impl/environment-config-source.js';
import {SoloConfigSchema} from '../../../../../src/data/schema/model/solo/solo-config-schema.js';
import {PathEx} from '../../../../../src/business/utils/path-ex.js';
import {EnvironmentScope} from '../../../../helpers/environment-scope.js';

const CONFIG_FILE_NAME: string = 'solo-config.yaml';

const mapper: ClassToObjectMapper = new ClassToObjectMapper(ConfigKeyFormatter.instance());

describe('config file value types', (): void => {
  let temporaryDirectory: string;

  beforeEach((): void => {
    EnvironmentAliasRegistry.resetRootSchemas();
    EnvironmentAliasRegistry.registerRootSchema(SoloConfigSchema);
    temporaryDirectory = fs.mkdtempSync(PathEx.join(os.tmpdir(), 'solo-config-file-value-types-'));
  });

  afterEach((): void => {
    EnvironmentAliasRegistry.resetRootSchemas();
    fs.rmSync(temporaryDirectory, {force: true, recursive: true});
  });

  async function loadConfigFile(contents: string): Promise<SoloConfigSchema> {
    fs.writeFileSync(PathEx.join(temporaryDirectory, CONFIG_FILE_NAME), contents);

    const source: OptionalDefaultConfigSource<SoloConfigSchema> = new OptionalDefaultConfigSource<SoloConfigSchema>(
      CONFIG_FILE_NAME,
      temporaryDirectory,
      new SoloConfigSchemaDefinition(mapper),
      mapper,
    );
    await source.load();

    return source.asObject(SoloConfigSchema);
  }

  async function expectRejected(contents: string, expected: string): Promise<Error> {
    try {
      await loadConfigFile(contents);
      expect.fail('expected a type mismatch error');
    } catch (error) {
      expect(error.message).to.include(expected);
      return error as Error;
    }
  }

  describe('booleans', (): void => {
    it("rejects YAML 1.1's `off` on a boolean flag rather than reading it as truthy", async (): Promise<void> => {
      const error: Error = await expectRejected('featureFlags:\n  skipNodePing: off\n', 'not a valid boolean');

      expect(error.message).to.include('featureFlags.skipNodePing');
      expect(error.message).to.include(CONFIG_FILE_NAME);
    });

    it('rejects `no` on a boolean flag', async (): Promise<void> => {
      await expectRejected('featureFlags:\n  enableImageCache: no\n', 'not a valid boolean');
    });

    it('rejects `yes` on a boolean flag', async (): Promise<void> => {
      await expectRejected('featureFlags:\n  skipNodePing: yes\n', 'not a valid boolean');
    });

    it('accepts a real YAML boolean', async (): Promise<void> => {
      const config: SoloConfigSchema = await loadConfigFile('featureFlags:\n  skipNodePing: true\n');

      expect(config.featureFlags.skipNodePing).to.be.true;
    });

    it('accepts a quoted boolean spelling the environment also accepts', async (): Promise<void> => {
      const config: SoloConfigSchema = await loadConfigFile(
        'featureFlags:\n  skipNodePing: "1"\n  enableImageCache: "FALSE"\n',
      );

      expect(config.featureFlags.skipNodePing).to.be.true;
      expect(config.featureFlags.enableImageCache).to.be.false;
    });

    it('keeps an explicit false false rather than letting it fall through to the default', async (): Promise<void> => {
      const config: SoloConfigSchema = await loadConfigFile('featureFlags:\n  enableImageCache: false\n');

      expect(config.featureFlags.enableImageCache).to.be.false;
    });
  });

  describe('numbers', (): void => {
    it('rejects a non-numeric value on a numeric field', async (): Promise<void> => {
      const error: Error = await expectRejected('tss:\n  readyMaxAttempts: abc\n', 'not a valid number');

      expect(error.message).to.include('tss.readyMaxAttempts');
    });

    it('accepts a numeric value', async (): Promise<void> => {
      const config: SoloConfigSchema = await loadConfigFile('tss:\n  readyMaxAttempts: 12\n');

      expect(config.tss.readyMaxAttempts).to.equal(12);
    });
  });

  describe('strings', (): void => {
    it('leaves a string field that looks like a number a string', async (): Promise<void> => {
      const config: SoloConfigSchema = await loadConfigFile('helmChart:\n  version: "1.0"\n');

      expect(config.helmChart.version).to.equal('1.0');
    });

    it('leaves a string field that looks like a boolean a string', async (): Promise<void> => {
      const config: SoloConfigSchema = await loadConfigFile('helmChart:\n  directory: "true"\n');

      expect(config.helmChart.directory).to.equal('true');
    });
  });

  describe('arrays', (): void => {
    // The lexer rebuilt every array element as a subtree, but an array of scalars holds leaf nodes. Reading
    // the config back threw as soon as an operator declared a subprocess allowlist — the documented use of
    // this file — which broke every command once the file became a live source.
    it('reads a subprocess allowlist back as an array of strings', async (): Promise<void> => {
      const config: SoloConfigSchema = await loadConfigFile(
        'subprocess:\n  additionalEnvironmentVariables:\n    helm:\n      - FOO\n      - BAR\n',
      );

      expect(config.subprocess.additionalEnvironmentVariables.helm).to.deep.equal(['FOO', 'BAR']);
    });
  });

  describe('the environment reads the same values the same way', (): void => {
    it(
      'rejects `off` from an environment variable too',
      EnvironmentScope.with({SOLO_FF_SKIP_NODE_PING: 'off'}, async (): Promise<void> => {
        const source: EnvironmentConfigSource = new EnvironmentConfigSource(mapper, 'SOLO');
        try {
          await source.load();
          expect.fail('expected a type mismatch error');
        } catch (error) {
          expect(error.message).to.include('not a valid boolean');
          expect(error.message).to.include('SOLO_FF_SKIP_NODE_PING');
        }
      }),
    );

    it(
      'keeps a string-typed override a string instead of parsing it as JSON',
      EnvironmentScope.with(
        {SOLO_HELM_CHART_DIRECTORY: 'true', SOLO_HELM_CHART_VERSION: '1.0'},
        async (): Promise<void> => {
          const source: EnvironmentConfigSource = new EnvironmentConfigSource(mapper, 'SOLO');
          await source.load();

          const config: SoloConfigSchema = source.asObject(SoloConfigSchema);
          expect(config.helmChart.directory).to.equal('true');
          expect(config.helmChart.version).to.equal('1.0');
        },
      ),
    );
  });
});
