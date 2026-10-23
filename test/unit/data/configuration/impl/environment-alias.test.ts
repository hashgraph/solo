// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {afterEach, beforeEach, describe, it} from 'mocha';
import {EnvironmentConfigSource} from '../../../../../src/data/configuration/impl/environment-config-source.js';
import {ClassToObjectMapper} from '../../../../../src/data/mapper/impl/class-to-object-mapper.js';
import {ConfigKeyFormatter} from '../../../../../src/data/key/config-key-formatter.js';
import {SoloConfigSchema} from '../../../../../src/data/schema/model/solo/solo-config-schema.js';
import {EnvironmentAliasRegistry} from '../../../../../src/data/schema/decorators/environment-alias-registry.js';
import {ConfigurationError} from '../../../../../src/data/configuration/api/configuration-error.js';
import {EnvironmentScope} from '../../../../../test/helpers/environment-scope.js';

const mapper: ClassToObjectMapper = new ClassToObjectMapper(ConfigKeyFormatter.instance());

describe('EnvironmentAliasRegistry – alias resolution', (): void => {
  beforeEach((): void => {
    EnvironmentAliasRegistry.resetRootSchemas();
    EnvironmentAliasRegistry.registerRootSchema(SoloConfigSchema);
  });

  afterEach((): void => {
    EnvironmentAliasRegistry.resetRootSchemas();
  });

  it('reconstructs full config paths into canonical stripped keys', (): void => {
    const aliasMap: ReadonlyMap<string, string> = EnvironmentAliasRegistry.aliasMap();
    expect(aliasMap.get('SOLO_FF_SKIP_NODE_PING')).to.equal('featureFlags.skipNodePing');
    expect(aliasMap.get('EXPERIMENTAL_COPY_WRAPS_LIB_IN_PARALLEL')).to.equal('featureFlags.copyWrapsLibraryInParallel');
  });

  it(
    'a fixed alias sets the field (SOLO_FF_SKIP_NODE_PING -> featureFlags.skipNodePing)',
    EnvironmentScope.with({SOLO_FF_SKIP_NODE_PING: 'true'}, async (): Promise<void> => {
      const source: EnvironmentConfigSource = new EnvironmentConfigSource(mapper, 'SOLO');
      await source.load();
      const schema: SoloConfigSchema = source.asObject(SoloConfigSchema);
      expect(schema?.featureFlags?.skipNodePing).to.be.true;
    }),
  );

  it(
    'a legacy unprefixed alias sets the field (ENABLE_IMAGE_CACHE -> featureFlags.enableImageCache)',
    EnvironmentScope.with({ENABLE_IMAGE_CACHE: 'false'}, async (): Promise<void> => {
      const source: EnvironmentConfigSource = new EnvironmentConfigSource(mapper, 'SOLO');
      await source.load();
      const schema: SoloConfigSchema = source.asObject(SoloConfigSchema);
      expect(schema?.featureFlags?.enableImageCache).to.be.false;
    }),
  );

  it(
    'the generated SOLO_* name wins when both it and the alias are set',
    EnvironmentScope.with(
      {SOLO_FEATURE_FLAGS_SKIP_NODE_PING: 'false', SOLO_FF_SKIP_NODE_PING: 'true'},
      async (): Promise<void> => {
        const source: EnvironmentConfigSource = new EnvironmentConfigSource(mapper, 'SOLO');
        await source.load();
        const schema: SoloConfigSchema = source.asObject(SoloConfigSchema);
        expect(schema?.featureFlags?.skipNodePing).to.be.false;
      },
    ),
  );
});

class ReusedLeafSchema {
  @EnvironmentAliasRegistry.alias('DUP_ALIAS_FOR_TEST')
  public value?: string;
}

class ReusedRootSchema {
  public first: ReusedLeafSchema = new ReusedLeafSchema();
  public second: ReusedLeafSchema = new ReusedLeafSchema();
}

describe('EnvironmentAliasRegistry – fail-fast on reused schema types', (): void => {
  afterEach((): void => {
    EnvironmentAliasRegistry.resetRootSchemas();
  });

  it('throws when one alias resolves to more than one config key', (): void => {
    EnvironmentAliasRegistry.resetRootSchemas();
    EnvironmentAliasRegistry.registerRootSchema(ReusedRootSchema);
    expect((): ReadonlyMap<string, string> => EnvironmentAliasRegistry.aliasMap()).to.throw(ConfigurationError);
  });
});
