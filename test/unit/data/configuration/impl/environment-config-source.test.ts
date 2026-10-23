// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {afterEach, beforeEach, describe, it} from 'mocha';
import {container} from 'tsyringe-neo';
import {EnvironmentConfigSource} from '../../../../../src/data/configuration/impl/environment-config-source.js';
import {InjectTokens} from '../../../../../src/core/dependency-injection/inject-tokens.js';
import {type ObjectMapper} from '../../../../../src/data/mapper/api/object-mapper.js';
import {EnvironmentAliasRegistry} from '../../../../../src/data/schema/decorators/environment-alias-registry.js';
import {SoloConfigSchema} from '../../../../../src/data/schema/model/solo/solo-config-schema.js';
import {EnvironmentScope} from '../../../../helpers/environment-scope.js';

describe('EnvironmentConfigSource', (): void => {
  function loadWithPrefix(prefix: string): Promise<EnvironmentConfigSource> {
    const source: EnvironmentConfigSource = new EnvironmentConfigSource(
      container.resolve<ObjectMapper>(InjectTokens.ObjectMapper),
      prefix,
    );
    return source.load().then((): EnvironmentConfigSource => source);
  }

  beforeEach((): void => {
    EnvironmentAliasRegistry.resetRootSchemas();
    EnvironmentAliasRegistry.registerRootSchema(SoloConfigSchema);
  });

  afterEach((): void => {
    EnvironmentAliasRegistry.resetRootSchemas();
  });

  it(
    'reads a config key from its prefixed environment variable name',
    EnvironmentScope.with({ENV_TSS_READY_MAX_ATTEMPTS: '7'}, async (): Promise<void> => {
      const source: EnvironmentConfigSource = await loadWithPrefix('ENV');

      expect(source.prefix).to.equal('ENV');
      expect(source.properties().get('tss.readyMaxAttempts')).to.equal('7');
    }),
  );

  it(
    'ignores a prefixed variable that no config key generates',
    // Regression (PR #6021 review): every SOLO_* variable used to be split on '_' into a config key, so an
    // unrelated pair such as these two produced 'charts.dir' and 'charts.dir.flag' — a leaf under a leaf,
    // which the lexer cannot represent. Startup then failed for every command, 'solo --help' included.
    // The pairs here are the shapes that crashed: leaf-under-leaf, and a numeric segment that made the
    // lexer build an array node and then try to hang a leaf off it.
    EnvironmentScope.with(
      {
        SOLO_CHARTS_DIR: '/tmp/charts',
        SOLO_CHARTS_DIR_FLAG: 'true',
        SOLO_RELEASE_TAG: 'v1',
        SOLO_RELEASE_TAG_NO_V: '1',
        SOLO_E2E_1: 'x',
        SOLO_E2E_NAME: 'y',
      },
      async (): Promise<void> => {
        const source: EnvironmentConfigSource = await loadWithPrefix('SOLO');

        expect([...source.propertyNames()]).to.be.empty;
      },
    ),
  );

  it(
    'ignores names the separator rules cannot produce, rather than failing to read them',
    // Every one of these used to reach the key lexer. The dashed and lowercase forms threw
    // "Failed to read environment variable"; the rest became junk config keys.
    EnvironmentScope.with(
      {
        'SOLO_FOO-BAR': 'dashed, not a POSIX identifier',
        SOLO_myVar: 'mixed case',
        // Deliberately not the lowercase spelling of a declared key: process.env is case-insensitive on
        // Windows, so that would set the real key and prove nothing about this code.
        solo_lowercase_name: 'lowercase',
        SOLO_: 'bare prefix, empty key',
        SOLO: 'the prefix alone',
        SOLO__DOUBLE: 'empty segment between separators',
        _SOLO_LEADING: 'leading separator, so not prefixed at all',
        SOLO_TSS_READY_MAX_ATTEMPTS_EXTRA: 'extends a declared name',
        SOLO_TSS_READY: 'truncates a declared name',
        SOLO_TSS: 'names an intermediate node, not a leaf',
      },
      async (): Promise<void> => {
        const source: EnvironmentConfigSource = await loadWithPrefix('SOLO');

        expect([...source.propertyNames()]).to.be.empty;
      },
    ),
  );

  it(
    'still reads the declared key when unknown variables surround it',
    EnvironmentScope.with(
      {
        SOLO_CHARTS_DIR: '/tmp/charts',
        SOLO_CHARTS_DIR_FLAG: 'true',
        SOLO_TSS_READY_MAX_ATTEMPTS: '7',
        SOLO_TSS_READY_MAX_ATTEMPTS_EXTRA: 'ignored',
      },
      async (): Promise<void> => {
        const source: EnvironmentConfigSource = await loadWithPrefix('SOLO');

        expect([...source.propertyNames()]).to.deep.equal(['tss.readyMaxAttempts']);
      },
    ),
  );

  it(
    'ignores an environment override of the subprocess passthrough list',
    // subprocess.* controls environment filtering for external commands, so it must not be
    // settable by the environment being filtered - otherwise anything able to set a variable
    // could switch the filter off using the filter's own configuration (issue #5895).
    EnvironmentScope.with(
      {
        SOLO_SUBPROCESS_ADDITIONAL_ENVIRONMENT_VARIABLES_HELM: '["LD_PRELOAD"]',
        SOLO_TSS_READY_MAX_ATTEMPTS: '7',
      },
      async (): Promise<void> => {
        const source: EnvironmentConfigSource = await loadWithPrefix('SOLO');

        expect(source.properties().has('subprocess.additionalEnvironmentVariables.helm')).to.be.false;
        // An unrelated key from the same source still loads, proving the filter is targeted.
        expect(source.properties().has('tss.readyMaxAttempts')).to.be.true;
      },
    ),
  );
});
