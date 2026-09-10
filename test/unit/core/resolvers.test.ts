// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {beforeEach, describe, it} from 'mocha';

import {container} from 'tsyringe-neo';
import {type ConfigManager} from '../../../src/core/config-manager.js';
import {Flags as flags} from '../../../src/commands/flags.js';
import {Resolvers} from '../../../src/core/resolvers.js';
import {InjectTokens} from '../../../src/core/dependency-injection/inject-tokens.js';
import {resetTestContainer} from '../../test-container.js';
import {type LocalConfigRuntimeState} from '../../../src/business/runtime-state/config/local/local-config-runtime-state.js';
import {type DeploymentName} from '../../../src/types/index.js';

interface FakeDeployment {
  name: string;
  namespace: string;
  clusters: string[];
}

function fakeLocalConfig(deployments: FakeDeployment[]): LocalConfigRuntimeState {
  return {
    configuration: {
      deployments,
    },
  } as unknown as LocalConfigRuntimeState;
}

describe('Resolvers', (): void => {
  let configManager: ConfigManager;

  beforeEach((): void => {
    // Use resetTestContainer() instead of container.clearInstances():
    // wiping instances directly breaks the DI registrations of subsequent test files.
    resetTestContainer();
    configManager = container.resolve(InjectTokens.ConfigManager);
    configManager.reset();
  });

  describe('promptTheUserForDeployment', (): void => {
    it('should return the deployment flag when it is already set', async (): Promise<void> => {
      configManager.setFlag(flags.deployment, 'explicit-deployment');

      const deploymentName: DeploymentName = await Resolvers.promptTheUserForDeployment(
        configManager,
        undefined,
        fakeLocalConfig([{name: 'other-deployment', namespace: 'solo-e2e', clusters: ['cluster-1']}]),
      );

      expect(deploymentName).to.equal('explicit-deployment');
    });

    it('should auto-select the deployment when the local config contains exactly one', async (): Promise<void> => {
      const deploymentName: DeploymentName = await Resolvers.promptTheUserForDeployment(
        configManager,
        undefined,
        fakeLocalConfig([{name: 'sole-deployment', namespace: 'solo-e2e', clusters: ['cluster-1']}]),
      );

      expect(deploymentName).to.equal('sole-deployment');
      expect(configManager.getFlag(flags.deployment)).to.equal('sole-deployment');
    });

    it('should throw a missing argument error in quiet mode when no deployment can be resolved', async (): Promise<void> => {
      configManager.setFlag(flags.quiet, true);

      try {
        await Resolvers.promptTheUserForDeployment(configManager, undefined, fakeLocalConfig([]));
        expect.fail('Expected an error to be thrown');
      } catch (error: unknown) {
        expect((error as Error).message).to.include('deployment is required');
      }
    });
  });
});
