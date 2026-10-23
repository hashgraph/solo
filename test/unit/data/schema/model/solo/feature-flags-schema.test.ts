// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {describe, it} from 'mocha';
import {SoloConfigSchema} from '../../../../../../src/data/schema/model/solo/solo-config-schema.js';
import {FeatureFlagsSchema} from '../../../../../../src/data/schema/model/solo/feature-flags-schema.js';
import {EnvironmentAliasRegistry} from '../../../../../../src/data/schema/decorators/environment-alias-registry.js';

describe('FeatureFlagsSchema', (): void => {
  it('defaults every flag off except the opt-out image cache', (): void => {
    const flags: FeatureFlagsSchema = new FeatureFlagsSchema();

    expect(flags.copyWrapsLibraryInParallel).to.be.false;
    expect(flags.skipNodePing).to.be.false;
    expect(flags.disableBlockNodeIntegration).to.be.false;
    expect(flags.enableImageCache).to.be.true;
  });

  it('is always materialised on a default SoloConfigSchema', (): void => {
    expect(new SoloConfigSchema().featureFlags).to.be.instanceOf(FeatureFlagsSchema);
  });

  it('keeps every legacy environment variable name working', (): void => {
    EnvironmentAliasRegistry.resetRootSchemas();
    EnvironmentAliasRegistry.registerRootSchema(SoloConfigSchema);
    const aliases: ReadonlyMap<string, string> = EnvironmentAliasRegistry.aliasMap();

    // Set by CI workflows and user scripts; renaming a property must never drop these.
    expect(aliases.get('EXPERIMENTAL_COPY_WRAPS_LIB_IN_PARALLEL')).to.equal('featureFlags.copyWrapsLibraryInParallel');
    expect(aliases.get('SKIP_NODE_PING')).to.equal('featureFlags.skipNodePing');
    expect(aliases.get('DISABLE_IMPORTER_SPRING_PROFILES')).to.equal('featureFlags.disableBlockNodeIntegration');
    expect(aliases.get('ENABLE_IMAGE_CACHE')).to.equal('featureFlags.enableImageCache');

    expect(aliases.get('SOLO_FF_SKIP_NODE_PING')).to.equal('featureFlags.skipNodePing');
    expect(aliases.get('SOLO_FF_DISABLE_BLOCK_NODE_INTEGRATION')).to.equal('featureFlags.disableBlockNodeIntegration');
    expect(aliases.get('SOLO_FF_ENABLE_IMAGE_CACHE')).to.equal('featureFlags.enableImageCache');

    EnvironmentAliasRegistry.resetRootSchemas();
  });

  describe('withDefaults', (): void => {
    it('fills in flags the config system left unset', (): void => {
      const flags: FeatureFlagsSchema = FeatureFlagsSchema.withDefaults({skipNodePing: true});

      expect(flags.skipNodePing).to.be.true;
      expect(flags.enableImageCache).to.be.true;
      expect(flags.copyWrapsLibraryInParallel).to.be.false;
      expect(flags.disableBlockNodeIntegration).to.be.false;
    });

    it('keeps an explicit false rather than treating it as unset', (): void => {
      expect(FeatureFlagsSchema.withDefaults({enableImageCache: false}).enableImageCache).to.be.false;
    });

    it('returns all defaults when nothing is configured', (): void => {
      expect({...FeatureFlagsSchema.withDefaults()}).to.deep.equal({...new FeatureFlagsSchema()});
    });
  });
});
