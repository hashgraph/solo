// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {beforeEach, describe, it} from 'mocha';
import sinon, {type SinonStub} from 'sinon';

import {NodeCommandConfigs} from '../../../../src/commands/node/configs.js';
import {type ConfigManager} from '../../../../src/core/config-manager.js';
import {type LocalConfigRuntimeState} from '../../../../src/business/runtime-state/config/local/local-config-runtime-state.js';
import {type RemoteConfigRuntimeStateApi} from '../../../../src/business/runtime-state/api/remote-config-runtime-state-api.js';
import {type K8Factory} from '../../../../src/integration/kube/k8-factory.js';
import {type AccountManager} from '../../../../src/core/account-manager.js';
import {type SoloLogger} from '../../../../src/core/logging/solo-logger.js';
import {type AnyObject, type ArgvStruct} from '../../../../src/types/aliases.js';
import {SemanticVersion} from '../../../../src/business/utils/semantic-version.js';
import {ComponentTypes} from '../../../../src/core/config/remote/enumerations/component-types.js';
import {DeploymentPhase} from '../../../../src/data/schema/model/remote/deployment-phase.js';
import {ComponentVersionIncompatibleSoloError} from '../../../../src/core/errors/classes/validation/component-version-incompatible-solo-error.js';

type ConfigBuilder = (argv: ArgvStruct, context_: AnyObject, task?: unknown) => Promise<unknown>;

/**
 * `node add`, `node refresh` and `node setup` install the consensus node version they are given, so each must reject
 * one that cannot run alongside the deployed block node before touching the cluster.
 */
describe('NodeCommandConfigs component version compatibility', (): void => {
  let warn: SinonStub;
  let showUser: SinonStub;
  let builderConfig: {releaseTag: string; force: boolean};

  const createConfigs: () => NodeCommandConfigs = (): NodeCommandConfigs => {
    const configManager: ConfigManager = {
      getConfig: (): typeof builderConfig => builderConfig,
    } as unknown as ConfigManager;

    const remoteConfig: RemoteConfigRuntimeStateApi = {
      configuration: {
        versions: {consensusNode: new SemanticVersion<string>('0.0.0')},
        state: {consensusNodes: []},
      },
      getComponentPhasesMap: (): Map<ComponentTypes, DeploymentPhase> =>
        new Map([[ComponentTypes.BlockNode, DeploymentPhase.DEPLOYED]]),
      getComponentVersion: (): SemanticVersion<string> => new SemanticVersion<string>('0.44.2'),
    } as unknown as RemoteConfigRuntimeStateApi;

    // The builders fail on the unstubbed local config right after the compatibility check, which is all these
    // tests need to reach.
    return new NodeCommandConfigs(
      configManager,
      {} as LocalConfigRuntimeState,
      remoteConfig,
      {} as K8Factory,
      {} as AccountManager,
      {warn, showUser} as unknown as SoloLogger,
    );
  };

  const builders: Array<[string, (configs: NodeCommandConfigs) => ConfigBuilder]> = [
    ['add', (configs: NodeCommandConfigs): ConfigBuilder => configs.addConfigBuilder.bind(configs) as ConfigBuilder],
    [
      'refresh',
      (configs: NodeCommandConfigs): ConfigBuilder => configs.refreshConfigBuilder.bind(configs) as ConfigBuilder,
    ],
    [
      'setup',
      (configs: NodeCommandConfigs): ConfigBuilder => configs.setupConfigBuilder.bind(configs) as ConfigBuilder,
    ],
  ];

  beforeEach((): void => {
    warn = sinon.stub();
    showUser = sinon.stub();
  });

  for (const [command, builder] of builders) {
    it(`node ${command} rejects a consensus node version the deployed block node cannot verify`, async (): Promise<void> => {
      builderConfig = {releaseTag: 'v0.79.0', force: false};

      await expect(builder(createConfigs())({flags: []} as unknown as ArgvStruct, {})).to.be.rejectedWith(
        ComponentVersionIncompatibleSoloError,
      );
    });

    it(`node ${command} only warns when --force is set`, async (): Promise<void> => {
      builderConfig = {releaseTag: 'v0.79.0', force: true};

      await expect(builder(createConfigs())({flags: []} as unknown as ArgvStruct, {})).to.not.be.rejectedWith(
        ComponentVersionIncompatibleSoloError,
      );
      expect(warn).to.have.been.calledWithMatch(/Bypassing the component version compatibility check/);
      expect(showUser).to.have.been.calledWithMatch(/Bypassing the component version compatibility check/);
    });
  }
});
