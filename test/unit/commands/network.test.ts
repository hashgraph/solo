// SPDX-License-Identifier: Apache-2.0

import sinon from 'sinon';
import {beforeEach, describe, it} from 'mocha';
import {expect} from 'chai';

import {getTestCluster, HEDERA_PLATFORM_VERSION_TAG} from '../../test-util.js';
import {Flags as flags} from '../../../src/commands/flags.js';
import * as version from '../../../version.js';
import * as constants from '../../../src/core/constants.js';
import {type ConfigManager} from '../../../src/core/config-manager.js';
import {type ChartManager} from '../../../src/core/chart-manager.js';
import {NetworkCommand} from '../../../src/commands/network.js';
import {type LockManager} from '../../../src/core/lock/lock-manager.js';
import {type RemoteConfigManager} from '../../../src/core/config/remote/remote-config-manager.js';
import {type ProfileManager} from '../../../src/core/profile-manager.js';
import {type KeyManager} from '../../../src/core/key-manager.js';
import {ROOT_DIR} from '../../../src/core/constants.js';
import {ListrLock} from '../../../src/core/lock/listr-lock.js';
import {GenesisNetworkDataConstructor} from '../../../src/core/genesis-network-models/genesis-network-data-constructor.js';
import {container} from 'tsyringe-neo';
import {type SoloLogger} from '../../../src/core/logging.js';
import {type K8Factory} from '../../../src/core/kube/k8-factory.js';
import {type DependencyManager} from '../../../src/core/dependency-managers/index.js';
import {type LocalConfig} from '../../../src/core/config/local-config.js';
import {resetForTest} from '../../test-container.js';
import {type ClusterChecks} from '../../../src/core/cluster-checks.js';
import {type K8ClientConfigMaps} from '../../../src/core/kube/k8-client/resources/config-map/k8-client-config-maps.js';
import {InjectTokens} from '../../../src/core/dependency-injection/inject-tokens.js';
import {K8Client} from '../../../src/core/kube/k8-client/k8-client.js';
import {ConsensusNode} from '../../../src/core/model/consensus-node.js';
import {NamespaceName} from '../../../src/core/kube/resources/namespace/namespace-name.js';
import {Argv} from '../../helpers/argv-wrapper.js';
import {type DefaultHelmClient} from '../../../src/core/helm/impl/DefaultHelmClient.js';
import {PathEx} from '../../../src/business/utils/path-ex.js';

const testName = 'network-cmd-unit';
const namespace = NamespaceName.of(testName);
const argv = Argv.getDefaultArgv(namespace);

argv.setArg(flags.releaseTag, HEDERA_PLATFORM_VERSION_TAG);
argv.setArg(flags.nodeAliasesUnparsed, 'node1');
argv.setArg(flags.deployment, 'deployment');
argv.setArg(flags.generateGossipKeys, true);
argv.setArg(flags.generateTlsKeys, true);
argv.setArg(flags.clusterRef, getTestCluster());
argv.setArg(flags.soloChartVersion, version.SOLO_CHART_VERSION);
argv.setArg(flags.force, true);
argv.setArg(flags.clusterSetupNamespace, constants.SOLO_SETUP_NAMESPACE.name);
argv.setArg(flags.chartDirectory, undefined);

describe('NetworkCommand unit tests', () => {
  describe('Chart Install Function is called correctly', () => {
    let opts: any;

    beforeEach(() => {
      resetForTest();
      opts = {};

      opts.logger = container.resolve<SoloLogger>(InjectTokens.SoloLogger);

      opts.configManager = container.resolve<ConfigManager>(InjectTokens.ConfigManager);
      opts.configManager.update(argv.build());

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
      opts.helm = container.resolve<DefaultHelmClient>(InjectTokens.Helm);
      opts.helm.dependency = sinon.stub();

      ListrLock.newAcquireLockTask = sinon.stub().returns({
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

      opts.leaseManager = container.resolve<LockManager>(InjectTokens.LockManager);
      opts.leaseManager.currentNamespace = sinon.stub().returns(testName);

      GenesisNetworkDataConstructor.initialize = sinon.stub().returns(null);
    });

    afterEach(() => {
      sinon.restore();
    });

    it('Install function is called with expected parameters', async () => {
      try {
        const networkCommand = new NetworkCommand(opts);
        opts.remoteConfigManager.getConsensusNodes = sinon.stub().returns([{name: 'node1'}]);
        opts.remoteConfigManager.getContexts = sinon.stub().returns(['context1']);
        opts.remoteConfigManager.getClusterRefs = sinon.stub().returns({['solo-e2e']: 'context1'});

        await networkCommand.deploy(argv.build());

        expect(opts.chartManager.install.args[0][0].name).to.equal('solo-e2e');
        expect(opts.chartManager.install.args[0][1]).to.equal(constants.SOLO_DEPLOYMENT_CHART);
        expect(opts.chartManager.install.args[0][2]).to.equal(constants.SOLO_DEPLOYMENT_CHART);
        expect(opts.chartManager.install.args[0][3]).to.equal(constants.SOLO_TESTING_CHART_URL);
      } finally {
        sinon.restore();
      }
    });

    it('Should use local chart directory', async () => {
      try {
        argv.setArg(flags.chartDirectory, 'test-directory');
        argv.setArg(flags.force, true);
        const networkCommand = new NetworkCommand(opts);

        opts.remoteConfigManager.getConsensusNodes = sinon.stub().returns([{name: 'node1'}]);
        opts.remoteConfigManager.getContexts = sinon.stub().returns(['context1']);
        opts.remoteConfigManager.getClusterRefs = sinon.stub().returns({['solo-e2e']: 'context1'});

        await networkCommand.deploy(argv.build());
        expect(opts.chartManager.install.args[0][0].name).to.equal('solo-e2e');
        expect(opts.chartManager.install.args[0][1]).to.equal(constants.SOLO_DEPLOYMENT_CHART);
        expect(opts.chartManager.install.args[0][2]).to.equal(constants.SOLO_DEPLOYMENT_CHART);
        expect(opts.chartManager.install.args[0][3]).to.equal(PathEx.join(ROOT_DIR, 'test-directory'));
      } finally {
        sinon.restore();
      }
    });

    it('Should use prepare config correctly for all clusters', async () => {
      try {
        const common = PathEx.join('test', 'data', 'test-values.yaml');
        const values1 = PathEx.join('test', 'data', 'test-values1.yaml');
        const values2 = PathEx.join('test', 'data', 'test-values2.yaml');
        argv.setArg(flags.networkDeploymentValuesFile, `${common},cluster=${values1},cluster=${values2}`);
        argv.setArg(flags.chartDirectory, 'test-directory');
        argv.setArg(flags.force, true);

        const task = sinon.stub();

        opts.remoteConfigManager.getConsensusNodes = sinon
          .stub()
          .returns([new ConsensusNode('node1', 0, 'solo-e2e', 'cluster', 'context-1', 'base', 'pattern', 'fqdn')]);
        opts.remoteConfigManager.getContexts = sinon.stub().returns(['context-1']);
        opts.remoteConfigManager.getClusterRefs = sinon.stub().returns({['cluster']: 'context-1'});

        const networkCommand = new NetworkCommand(opts);
        const config = await networkCommand.prepareConfig(task, argv.build());

        expect(config.valuesArgMap).to.not.empty;
        expect(config.valuesArgMap['cluster']).to.not.empty;
        expect(config.valuesArgMap['cluster'].indexOf(PathEx.join('solo-deployment', 'values.yaml'))).to.not.equal(-1);
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
