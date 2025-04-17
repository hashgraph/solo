// SPDX-License-Identifier: Apache-2.0

import sinon from 'sinon';
import {beforeEach, describe, it} from 'mocha';
import {expect} from 'chai';

import {HEDERA_PLATFORM_VERSION_TAG, getTestCluster} from '../../test-utility.js';
import {Flags as flags} from '../../../src/commands/flags.js';
import * as version from '../../../version.js';
import * as constants from '../../../src/core/constants.js';
import {ConfigManager} from '../../../src/core/config-manager.js';
import {ChartManager} from '../../../src/core/chart-manager.js';
import {container} from 'tsyringe-neo';
import {resetForTest} from '../../test-container.js';
import {LocalConfig} from '../../../src/core/config/local/local-config.js';
import {K8Client} from '../../../src/integration/kube/k8-client/k8-client.js';
import {K8ClientFactory} from '../../../src/integration/kube/k8-client/k8-client-factory.js';
import {DependencyManager} from '../../../src/core/dependency-managers/index.js';
import {NamespaceName} from '../../../src/integration/kube/resources/namespace/namespace-name.js';
import {InjectTokens} from '../../../src/core/dependency-injection/inject-tokens.js';
import {Argv} from '../../helpers/argv-wrapper.js';
import {DefaultHelmClient} from '../../../src/integration/helm/impl/default-helm-client.js';
import {LocalConfigDataWrapper} from '../../../src/core/config/local/local-config-data-wrapper.js';
import {type EmailAddress} from '../../../src/core/config/remote/types.js';
import {ClusterCommandHandlers} from '../../../src/commands/cluster/handlers.js';
import {SoloWinstonLogger} from '../../../src/core/logging/solo-winston-logger.js';
import {type SoloLogger} from '../../../src/core/logging/solo-logger.js';
import {getSoloVersion} from '../../../version.js';

const getBaseCommandOptions = (context: string) => {
  const options = {
    logger: sandbox.createStubInstance<SoloLogger>(SoloWinstonLogger),
    helm: sandbox.createStubInstance(DefaultHelmClient),
    k8Factory: sandbox.createStubInstance(K8ClientFactory),
    chartManager: sandbox.createStubInstance(ChartManager),
    configManager: sandbox.createStubInstance(ConfigManager),
    depManager: sandbox.createStubInstance(DependencyManager),
    localConfig: sandbox.createStubInstance(LocalConfig),
  };
  options.k8Factory.default.returns(new K8Client(context));
  return options;
};

const testName = 'cluster-cmd-unit';
const namespace = NamespaceName.of(testName);
const argv = Argv.getDefaultArgv(namespace);
const sandbox = sinon.createSandbox();

argv.setArg(flags.namespace, namespace.name);
argv.setArg(flags.deployment, `${namespace.name}-deployment`);
argv.setArg(flags.releaseTag, HEDERA_PLATFORM_VERSION_TAG);
argv.setArg(flags.nodeAliasesUnparsed, 'node1');
argv.setArg(flags.generateGossipKeys, true);
argv.setArg(flags.generateTlsKeys, true);
argv.setArg(flags.clusterRef, getTestCluster());
argv.setArg(flags.soloChartVersion, version.SOLO_CHART_VERSION);
argv.setArg(flags.force, true);
argv.setArg(flags.clusterSetupNamespace, constants.SOLO_SETUP_NAMESPACE.name);

describe('ClusterCommand unit tests', () => {
  before(() => {
    resetForTest(namespace.name);
  });

  describe('Chart Install Function is called correctly', () => {
    let options: any;

    afterEach(() => {
      sandbox.restore();
    });

    beforeEach(() => {
      const k8Client = new K8Client(undefined);
      const context = k8Client.contexts().readCurrent();
      options = getBaseCommandOptions(context);
      options.logger = container.resolve(InjectTokens.SoloLogger);
      options.helm = container.resolve(InjectTokens.Helm);
      options.chartManager = container.resolve(InjectTokens.ChartManager);
      options.helm.dependency = sandbox.stub();

      options.chartManager.isChartInstalled = sandbox.stub().returns(false);
      options.chartManager.install = sandbox.stub().returns(true);

      options.configManager = container.resolve(InjectTokens.ConfigManager);
      options.remoteConfigManager = sandbox.stub();

      options.remoteConfigManager.currentCluster = 'solo-e2e';
      options.localConfig.localConfigData = new LocalConfigDataWrapper(
        'test@test.com' as EmailAddress,
        getSoloVersion(),
        {},
        {'solo-e2e': 'context-1'},
      );
    });

    it('Install function is called with expected parameters', async () => {
      const clusterCommandHandlers = container.resolve(ClusterCommandHandlers) as ClusterCommandHandlers;
      await clusterCommandHandlers.setup(argv.build());

      expect(options.chartManager.install.args[0][0].name).to.equal(constants.SOLO_SETUP_NAMESPACE.name);
      expect(options.chartManager.install.args[0][1]).to.equal(constants.SOLO_CLUSTER_SETUP_CHART);
      expect(options.chartManager.install.args[0][2]).to.equal(constants.SOLO_CLUSTER_SETUP_CHART);
      expect(options.chartManager.install.args[0][3]).to.equal(constants.SOLO_TESTING_CHART_URL);
    });

    it('Should use local chart directory', async () => {
      argv.setArg(flags.chartDirectory, 'test-directory');
      argv.setArg(flags.force, true);

      const clusterCommandHandlers = container.resolve(ClusterCommandHandlers) as ClusterCommandHandlers;
      await clusterCommandHandlers.setup(argv.build());

      expect(options.chartManager.install.args[0][2]).to.equal(constants.SOLO_CLUSTER_SETUP_CHART);
    });
  });
});
