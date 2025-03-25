// SPDX-License-Identifier: Apache-2.0

import sinon from 'sinon';
import {beforeEach, describe, it} from 'mocha';
import {expect} from 'chai';

import {getTestCluster, getTestLogger, HEDERA_PLATFORM_VERSION_TAG, testLocalConfigData} from '../../test-util.js';
import {Flags as flags} from '../../../src/commands/flags.js';
import * as version from '../../../version.js';
import * as constants from '../../../src/core/constants.js';
import {type ConfigManager} from '../../../src/core/config-manager.js';
import {type ChartManager} from '../../../src/core/chart-manager.js';
import {type Helm} from '../../../src/core/helm.js';
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
import {type K8Factory} from '../../../src/integration/kube/k8-factory.js';
import {type DependencyManager} from '../../../src/core/dependency-managers/index.js';
import {resetForTest} from '../../test-container.js';
import {type ClusterChecks} from '../../../src/core/cluster-checks.js';
import {type K8ClientConfigMaps} from '../../../src/integration/kube/k8-client/resources/config-map/k8-client-config-maps.js';
import {InjectTokens} from '../../../src/core/dependency-injection/inject-tokens.js';
import {K8Client} from '../../../src/integration/kube/k8-client/k8-client.js';
import {ConsensusNode} from '../../../src/core/model/consensus-node.js';
import {NamespaceName} from '../../../src/integration/kube/resources/namespace/namespace-name.js';
import {Argv} from '../../helpers/argv-wrapper.js';
import {PathEx} from '../../../src/business/utils/path-ex.js';
import {type CertificateManager} from '../../../src/core/certificate-manager.js';
import {type PlatformInstaller} from '../../../src/core/platform-installer.js';

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

    const k8SFactoryStub = sinon.stub() as unknown as K8Factory;
    const clusterChecksStub = sinon.stub() as unknown as ClusterChecks;
    const remoteConfigManagerStub = sinon.stub() as unknown as RemoteConfigManager;
    const chartManagerStub = sinon.stub() as unknown as ChartManager;
    const certificateManagerStub = sinon.stub() as unknown as CertificateManager;
    const profileManagerStub = sinon.stub() as unknown as ProfileManager;
    const platformInstallerStub = sinon.stub() as unknown as PlatformInstaller;
    const keyManagerStub = sinon.stub() as unknown as KeyManager;
    const depManagerStub = sinon.stub() as unknown as DependencyManager;
    const helmStub = sinon.stub() as unknown as Helm;
    let containerOverrides: any;

    beforeEach(() => {
      containerOverrides = {
        K8Factory: [{useValue: k8SFactoryStub}],
        ClusterChecks: [{useValue: clusterChecksStub}],
        RemoteConfigManager: [{useValue: remoteConfigManagerStub}],
        ChartManager: [{useValue: chartManagerStub}],
        CertificateManager: [{useValue: certificateManagerStub}],
        ProfileManager: [{useValue: profileManagerStub}],
        PlatformInstaller: [{useValue: platformInstallerStub}],
        KeyManager: [{useValue: keyManagerStub}],
        DependencyManager: [{useValue: depManagerStub}],
        Helm: [{useValue: helmStub}],
      };

      resetForTest(undefined, undefined, getTestLogger(), true, containerOverrides);

      opts = {};
      opts.logger = container.resolve<SoloLogger>(InjectTokens.SoloLogger);

      opts.configManager = container.resolve<ConfigManager>(InjectTokens.ConfigManager);
      opts.configManager.update(argv.build());

      opts.k8Factory = k8SFactoryStub;
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

      clusterChecksStub.isMinioInstalled = sinon.stub();
      clusterChecksStub.isPrometheusInstalled = sinon.stub();
      clusterChecksStub.isCertManagerInstalled = sinon.stub();

      opts.depManager = depManagerStub;
      opts.localConfig = container.resolve<ConfigManager>(InjectTokens.LocalConfig);
      opts.helm = helmStub;
      opts.helm.dependency = sinon.stub();

      ListrLock.newAcquireLockTask = sinon.stub().returns({
        run: sinon.stub().returns({}),
      });

      opts.keyManager = keyManagerStub;
      opts.keyManager.prepareTLSKeyFilePaths = sinon.stub();
      opts.keyManager.copyGossipKeysToStaging = sinon.stub();
      opts.keyManager.copyNodeKeysToStaging = sinon.stub();

      opts.platformInstaller = platformInstallerStub;
      opts.platformInstaller.copyNodeKeys = sinon.stub();
      container.registerInstance(InjectTokens.PlatformInstaller, opts.platformInstaller);

      opts.profileManager = profileManagerStub;
      opts.profileManager.prepareValuesForSoloChart = sinon.stub();

      opts.certificateManager = certificateManagerStub;
      container.registerInstance(InjectTokens.CertificateManager, opts.certificateManager);

      opts.chartManager = chartManagerStub;
      opts.chartManager.isChartInstalled = sinon.stub().returns(true);
      opts.chartManager.isChartInstalled.onSecondCall().returns(false);
      opts.chartManager.install = sinon.stub().returns(true);
      opts.chartManager.uninstall = sinon.stub().returns(true);

      opts.remoteConfigManager = remoteConfigManagerStub;
      opts.remoteConfigManager.isLoaded = sinon.stub().returns(true);
      opts.remoteConfigManager.getConfigMap = sinon.stub().returns(null);
      opts.remoteConfigManager.modify = sinon.stub();

      opts.localConfig.localConfigData._clusterRefs = {'solo-e2e': 'context-1'};
      opts.localConfig.localConfigData._deployments = testLocalConfigData.deployments;

      opts.leaseManager = container.resolve<LockManager>(InjectTokens.LockManager);
      opts.leaseManager.currentNamespace = sinon.stub().returns(testName);

      GenesisNetworkDataConstructor.initialize = sinon.stub().returns(null);
    });

    afterEach(() => {
      sinon.restore();
    });

    it('Install function is called with expected parameters', async () => {
      try {
        const networkCommand = container.resolve<NetworkCommand>(NetworkCommand);
        opts.remoteConfigManager.getConsensusNodes = sinon.stub().returns([{name: 'node1'}]);
        opts.remoteConfigManager.getContexts = sinon.stub().returns(['context1']);
        opts.remoteConfigManager.getClusterRefs = sinon.stub().returns({['solo-e2e']: 'context1'});

        await networkCommand.deploy(argv.build());

        expect(opts.chartManager.install.args[0][0].name).to.equal('solo-e2e');
        expect(opts.chartManager.install.args[0][1]).to.equal(constants.SOLO_DEPLOYMENT_CHART);
        expect(opts.chartManager.install.args[0][2]).to.equal(
          constants.SOLO_TESTING_CHART_URL + '/' + constants.SOLO_DEPLOYMENT_CHART,
        );
        expect(opts.chartManager.install.args[0][3]).to.equal(version.SOLO_CHART_VERSION);
      } finally {
        sinon.restore();
      }
    });

    it('Should use local chart directory', async () => {
      try {
        argv.setArg(flags.chartDirectory, 'test-directory');
        argv.setArg(flags.force, true);
        const networkCommand = container.resolve<NetworkCommand>(NetworkCommand);

        opts.remoteConfigManager.getConsensusNodes = sinon.stub().returns([{name: 'node1'}]);
        opts.remoteConfigManager.getContexts = sinon.stub().returns(['context1']);
        opts.remoteConfigManager.getClusterRefs = sinon.stub().returns({['solo-e2e']: 'context1'});

        await networkCommand.deploy(argv.build());
        expect(opts.chartManager.install.args[0][0].name).to.equal('solo-e2e');
        expect(opts.chartManager.install.args[0][1]).to.equal(constants.SOLO_DEPLOYMENT_CHART);
        expect(opts.chartManager.install.args[0][2]).to.equal(
          PathEx.join(ROOT_DIR, 'test-directory', constants.SOLO_DEPLOYMENT_CHART),
        );
        expect(opts.chartManager.install.args[0][3]).to.equal(version.SOLO_CHART_VERSION);
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

        const networkCommand = container.resolve<NetworkCommand>(NetworkCommand);
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
