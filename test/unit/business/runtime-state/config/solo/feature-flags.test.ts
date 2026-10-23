// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {afterEach, beforeEach, describe, it} from 'mocha';
import {container} from 'tsyringe-neo';
import {FeatureFlags} from '../../../../../../src/business/runtime-state/config/solo/feature-flags.js';
import {InjectTokens} from '../../../../../../src/core/dependency-injection/inject-tokens.js';
import {type ConfigProvider} from '../../../../../../src/data/configuration/api/config-provider.js';
import {resetForTest} from '../../../../../test-container.js';

async function flagsFromEnvironment(variables: Record<string, string>): Promise<FeatureFlags> {
  for (const [key, value] of Object.entries(variables)) {
    process.env[key] = value;
  }
  resetForTest();
  await container.resolve<ConfigProvider>(InjectTokens.ConfigProvider).config().refresh();
  return container.resolve<FeatureFlags>(InjectTokens.FeatureFlags);
}

describe('FeatureFlags', (): void => {
  let featureFlags: FeatureFlags;
  let configProvider: ConfigProvider;

  beforeEach((): void => {
    resetForTest();
    featureFlags = container.resolve<FeatureFlags>(InjectTokens.FeatureFlags);
    configProvider = container.resolve<ConfigProvider>(InjectTokens.ConfigProvider);
  });

  it('is resolvable from the container', (): void => {
    expect(featureFlags).to.be.instanceOf(FeatureFlags);
  });

  it('reads defaults before the config sources are loaded', (): void => {
    expect(featureFlags.enableImageCache).to.be.true;
    expect(featureFlags.skipNodePing).to.be.false;
  });

  it('reads through to the config provider rather than a constructor snapshot', async (): Promise<void> => {
    await configProvider.config().refresh();
    expect(featureFlags.enableImageCache).to.be.true;
  });
});

describe('FeatureFlags – setting one flag must not blank the others', (): void => {
  let savedEnvironment: NodeJS.ProcessEnv;

  beforeEach((): void => {
    savedEnvironment = {...process.env};
  });

  afterEach((): void => {
    for (const key of ['SKIP_NODE_PING', 'ENABLE_IMAGE_CACHE']) {
      if (key in savedEnvironment) {
        process.env[key] = savedEnvironment[key];
      } else {
        delete process.env[key];
      }
    }
  });

  it('leaves the opt-out image cache on when an unrelated flag is set', async (): Promise<void> => {
    const flags: FeatureFlags = await flagsFromEnvironment({SKIP_NODE_PING: 'true'});

    expect(flags.skipNodePing).to.be.true;
    expect(flags.enableImageCache, 'enableImageCache must still default to true').to.be.true;
    expect(flags.copyWrapsLibraryInParallel).to.be.false;
    expect(flags.disableBlockNodeIntegration).to.be.false;
  });

  it('applies two flags at once without dropping either', async (): Promise<void> => {
    const flags: FeatureFlags = await flagsFromEnvironment({SKIP_NODE_PING: 'true', ENABLE_IMAGE_CACHE: 'false'});

    expect(flags.skipNodePing).to.be.true;
    expect(flags.enableImageCache).to.be.false;
  });
});
