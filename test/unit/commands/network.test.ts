/**
 * SPDX-License-Identifier: Apache-2.0
 */
import sinon from 'sinon';
import {beforeEach, describe, it} from 'mocha';
import {expect} from 'chai';

import {getDefaultArgv, HEDERA_PLATFORM_VERSION_TAG, TEST_CLUSTER} from '../../test_util.js';
import {Flags as flags} from '../../../src/commands/flags.js';
import * as version from '../../../version.js';
import * as constants from '../../../src/core/constants.js';
import {type ConfigManager} from '../../../src/core/config_manager.js';
import {type ChartManager} from '../../../src/core/chart_manager.js';
import {type Helm} from '../../../src/core/helm.js';
import path from 'path';
import {NetworkCommand} from '../../../src/commands/network.js';
import {type LeaseManager} from '../../../src/core/lease/lease_manager.js';
import {type RemoteConfigManager} from '../../../src/core/config/remote/remote_config_manager.js';
import {type ProfileManager} from '../../../src/core/profile_manager.js';
import {type KeyManager} from '../../../src/core/key_manager.js';
import {ROOT_DIR} from '../../../src/core/constants.js';
import {ListrLease} from '../../../src/core/lease/listr_lease.js';
import {GenesisNetworkDataConstructor} from '../../../src/core/genesis_network_models/genesis_network_data_constructor.js';
import {container} from 'tsyringe-neo';
import {type SoloLogger} from '../../../src/core/logging.js';
import {type K8Factory} from '../../../src/core/kube/k8_factory.js';
import {type DependencyManager} from '../../../src/core/dependency_managers/index.js';
import {type LocalConfig} from '../../../src/core/config/local_config.js';
import {resetForTest} from '../../test_container.js';
import {type ClusterChecks} from '../../../src/core/cluster_checks.js';
import {type K8ClientConfigMaps} from '../../../src/core/kube/k8_client/resources/config_map/k8_client_config_maps.js';
import {InjectTokens} from '../../../src/core/dependency_injection/inject_tokens.js';
import {K8Client} from '../../../src/core/kube/k8_client/k8_client.js';
import {ConsensusNode} from '../../../src/core/model/consensus_node.js';

const testName = 'network-cmd-unit';
const argv = getDefaultArgv();

argv[flags.releaseTag.name] = HEDERA_PLATFORM_VERSION_TAG;
argv[flags.nodeAliasesUnparsed.name] = 'node1';
argv[flags.deployment.name] = 'deployment';
argv[flags.generateGossipKeys.name] = true;
argv[flags.generateTlsKeys.name] = true;
argv[flags.clusterRef.name] = TEST_CLUSTER;
argv[flags.soloChartVersion.name] = version.SOLO_CHART_VERSION;
argv[flags.force.name] = true;
argv[flags.clusterSetupNamespace.name] = constants.SOLO_SETUP_NAMESPACE.name;
argv[flags.chartDirectory.name] = undefined;

describe('NetworkCommand unit tests', () => {
  describe('Chart Install Function is called correctly', () => {
    let opts: any;

    beforeEach(() => {
      resetForTest();
      opts = {};

      opts.logger = container.resolve<SoloLogger>(InjectTokens.SoloLogger);

      opts.configManager = container.resolve<ConfigManager>(InjectTokens.ConfigManager);
      opts.configManager.update(argv);

      opts.k8Factory = sinon.stub() as unknown as K8Factory;
      const k8Stub = sinon.stub();

      opts.k8Factory.default = sinon.stub().returns(k8Stub);
      opts.k8Factory.default().namespaces = sinon.stub().returns({
        has: sinon.stub().returns(true),
      });
      opts.k8Factory.default().contexts = sinon.stub().returns({
        readCurrent: sinon.stub().returns(new K8Client(undefined).contexts().readCurrent()),
      });
      opts.k8Factory.default().configMaps = sinon.stub() as unknown as K8ClientConfigMaps;
      opts.k8Factory.default().configMaps.read = sinon.stub();
      opts.k8Factory.default().pods = sinon.stub().returns({
        waitForRunningPhase: sinon.stub(),
        waitForReadyStatus: sinon.stub(),
      });
      opts.k8Factory.default().leases = sinon.stub().returns({
        read: sinon.stub(),
      });
      opts.k8Factory.default().logger = opts.logger;

      opts.k8Factory.getK8 = sinon.stub().returns(k8Stub);
      opts.k8Factory.getK8().namespaces = sinon.stub().returns({
        has: sinon.stub().returns(true),
      });
      opts.k8Factory.getK8().configMaps = sinon.stub() as unknown as K8ClientConfigMaps;
      opts.k8Factory.getK8().configMaps.read = sinon.stub();
      opts.k8Factory.getK8().pods = sinon.stub().returns({
        waitForRunningPhase: sinon.stub(),
        waitForReadyStatus: sinon.stub(),
      });
      opts.k8Factory.getK8().leases = sinon.stub().returns({
        read: sinon.stub(),
      });
      opts.k8Factory.getK8().logger = opts.logger;

      opts.k8Factory.default().clusters = sinon.stub().returns({
        list: sinon.stub().returns([{name: 'solo-e2e'}]),
      });
      opts.k8Factory.default().clusters().readCurrent = sinon.stub().returns('solo-e2e');

      const clusterChecksStub = sinon.stub() as unknown as ClusterChecks;
      clusterChecksStub.isMinioInstalled = sinon.stub();
      clusterChecksStub.isPrometheusInstalled = sinon.stub();
      clusterChecksStub.isCertManagerInstalled = sinon.stub();
      container.registerInstance(InjectTokens.ClusterChecks, clusterChecksStub);

      container.registerInstance(InjectTokens.K8Factory, opts.k8Factory);

      opts.depManager = sinon.stub() as unknown as DependencyManager;
      container.registerInstance<DependencyManager>(InjectTokens.DependencyManager, opts.depManager);
      opts.localConfig = container.resolve<LocalConfig>(InjectTokens.LocalConfig);
      opts.helm = container.resolve<Helm>(InjectTokens.Helm);
      opts.helm.dependency = sinon.stub();

      ListrLease.newAcquireLeaseTask = sinon.stub().returns({
        run: sinon.stub().returns({}),
      });

      opts.keyManager = container.resolve<KeyManager>(InjectTokens.KeyManager);
      opts.keyManager.copyGossipKeysToStaging = sinon.stub();
      opts.keyManager.copyNodeKeysToStaging = sinon.stub();

      opts.platformInstaller = sinon.stub();
      opts.platformInstaller.copyNodeKeys = sinon.stub();
      container.registerInstance(InjectTokens.PlatformInstaller, opts.platformInstaller);

      opts.profileManager = container.resolve<ProfileManager>(InjectTokens.ProfileManager);
      opts.profileManager.prepareValuesForSoloChart = sinon.stub();

      opts.certificateManager = sinon.stub();
      container.registerInstance(InjectTokens.CertificateManager, opts.certificateManager);

      opts.chartManager = container.resolve<ChartManager>(InjectTokens.ChartManager);
      opts.chartManager.isChartInstalled = sinon.stub().returns(true);
      opts.chartManager.isChartInstalled.onSecondCall().returns(false);
      opts.chartManager.install = sinon.stub().returns(true);
      opts.chartManager.uninstall = sinon.stub().returns(true);

      opts.remoteConfigManager = container.resolve<RemoteConfigManager>(InjectTokens.RemoteConfigManager);
      opts.remoteConfigManager.getConfigMap = sinon.stub().returns(null);

      opts.localConfig.clusterRefs = {'solo-e2e': 'context-1'};

      opts.leaseManager = container.resolve<LeaseManager>(InjectTokens.LeaseManager);
      opts.leaseManager.currentNamespace = sinon.stub().returns(testName);

      GenesisNetworkDataConstructor.initialize = sinon.stub().returns(null);
    });

    afterEach(() => {
      sinon.restore();
    });

    it('Install function is called with expected parameters', async () => {
      const networkCommand = new NetworkCommand(opts);
      sinon.stub(networkCommand, 'getConsensusNodes').returns([]);
      sinon.stub(networkCommand, 'getContexts').returns([]);
      await networkCommand.deploy(argv);

      expect(opts.chartManager.install.args[0][0].name).to.equal(constants.SOLO_TEST_CLUSTER);
      expect(opts.chartManager.install.args[0][1]).to.equal(constants.SOLO_DEPLOYMENT_CHART);
      expect(opts.chartManager.install.args[0][2]).to.equal(
        constants.SOLO_TESTING_CHART_URL + '/' + constants.SOLO_DEPLOYMENT_CHART,
      );
      expect(opts.chartManager.install.args[0][3]).to.equal(version.SOLO_CHART_VERSION);
    });

    it('Should use local chart directory', async () => {
      try {
        argv[flags.chartDirectory.name] = 'test-directory';
        argv[flags.force.name] = true;

        sinon.stub(NetworkCommand.prototype, 'getConsensusNodes').returns([]);
        sinon.stub(NetworkCommand.prototype, 'getContexts').returns([]);
        const networkCommand = new NetworkCommand(opts);
        await networkCommand.deploy(argv);
        expect(opts.chartManager.install.args[0][0].name).to.equal(constants.SOLO_TEST_CLUSTER);
        expect(opts.chartManager.install.args[0][1]).to.equal(constants.SOLO_DEPLOYMENT_CHART);
        expect(opts.chartManager.install.args[0][2]).to.equal(
          path.join(ROOT_DIR, 'test-directory', constants.SOLO_DEPLOYMENT_CHART),
        );
        expect(opts.chartManager.install.args[0][3]).to.equal(version.SOLO_CHART_VERSION);
      } finally {
        sinon.restore();
      }
    });

    it('Should use prepare config correctly for all clusters', async () => {
      try {
        const common = path.join('test', 'data', 'test-values.yaml');
        const values1 = path.join('test', 'data', 'test-values1.yaml');
        const values2 = path.join('test', 'data', 'test-values2.yaml');
        argv[flags.networkDeploymentValuesFile.name] = `${common},cluster=${values1},cluster=${values2}`;
        argv[flags.chartDirectory.name] = 'test-directory';
        argv[flags.force.name] = true;

        const task = sinon.stub();

        sinon
          .stub(NetworkCommand.prototype, 'getConsensusNodes')
          .returns([new ConsensusNode('node1', 0, 'solo-e2e', 'cluster', 'context-1', 'base', 'pattern', 'fqdn')]);
        const networkCommand = new NetworkCommand(opts);
        const config = await networkCommand.prepareConfig(task, argv);

        expect(config.valuesArgMap).to.not.empty;
        expect(config.valuesArgMap['cluster']).to.not.empty;
        expect(config.valuesArgMap['cluster'].indexOf('solo-deployment/values.yaml')).to.not.equal(-1);
        expect(config.valuesArgMap['cluster'].indexOf('values.yaml')).to.not.equal(-1);
        expect(config.valuesArgMap['cluster'].indexOf('test-values1.yaml')).to.not.equal(-1);
        expect(config.valuesArgMap['cluster'].indexOf('test-values2.yaml')).to.not.equal(-1);

        // chart values file should precede the values file passed in the command
        expect(config.valuesArgMap['cluster'].indexOf('solo-deployment/values.yaml')).to.be.lt(
          config.valuesArgMap['cluster'].indexOf('test-values1.yaml'),
        );
        expect(config.valuesArgMap['cluster'].indexOf('solo-deployment/values.yaml')).to.be.lt(
          config.valuesArgMap['cluster'].indexOf('test-values2.yaml'),
        );

        expect(config.valuesArgMap['cluster'].indexOf('values.yaml')).to.be.lt(
          config.valuesArgMap['cluster'].indexOf('test-values1.yaml'),
        );
        expect(config.valuesArgMap['cluster'].indexOf('test-values1.yaml')).to.be.lt(
          config.valuesArgMap['cluster'].indexOf('test-values2.yaml'),
        );
        expect(config.valuesArgMap['cluster'].indexOf('values.yaml')).to.be.lt(
          config.valuesArgMap['cluster'].indexOf('test-values2.yaml'),
        );
      } finally {
        sinon.restore();
      }
    });
  });
});
