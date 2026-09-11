// SPDX-License-Identifier: Apache-2.0

import sinon, {type SinonSpyCall, type SinonStub} from 'sinon';
import {before, beforeEach, describe, it} from 'mocha';
import {expect} from 'chai';

import {getTestCluster, HEDERA_PLATFORM_VERSION_TAG} from '../../test-utility.js';
import {Flags as flags} from '../../../src/commands/flags.js';
import * as version from '../../../version.js';
import * as constants from '../../../src/core/constants.js';
import {ROOT_DIR} from '../../../src/core/constants.js';
import {type ConfigManager} from '../../../src/core/config-manager.js';
import {type ChartManager} from '../../../src/core/chart-manager.js';
import {NetworkCommand, type NetworkDeployConfigClass} from '../../../src/commands/network.js';
import {type LockManager} from '../../../src/core/lock/lock-manager.js';
import {type ProfileManager} from '../../../src/core/profile-manager.js';
import {type KeyManager} from '../../../src/core/key-manager.js';
import {ListrLock} from '../../../src/core/lock/listr-lock.js';
import {GenesisNetworkDataConstructor} from '../../../src/core/genesis-network-models/genesis-network-data-constructor.js';
import {container} from 'tsyringe-neo';
import {type SoloLogger} from '../../../src/core/logging/solo-logger.js';
import {type K8Factory} from '../../../src/integration/kube/k8-factory.js';
import {type DependencyManager} from '../../../src/core/dependency-managers/index.js';
import {resetForTest} from '../../test-container.js';
import {type ClusterChecks} from '../../../src/core/cluster-checks.js';
import {type K8ClientConfigMaps} from '../../../src/integration/kube/k8-client/resources/config-map/k8-client-config-maps.js';
import {InjectTokens} from '../../../src/core/dependency-injection/inject-tokens.js';
import {K8Client} from '../../../src/integration/kube/k8-client/k8-client.js';
import {ConsensusNode} from '../../../src/core/model/consensus-node.js';
import {NamespaceName} from '../../../src/types/namespace/namespace-name.js';
import {Argv} from '../../helpers/argv-wrapper.js';
import {type DefaultHelmClient} from '../../../src/integration/helm/impl/default-helm-client.js';
import {PathEx} from '../../../src/business/utils/path-ex.js';
import {type CertificateManager} from '../../../src/core/certificate-manager.js';
import {type PlatformInstaller} from '../../../src/core/platform-installer.js';
import fs from 'node:fs';
import {type InstanceOverrides} from '../../../src/core/dependency-injection/container-init.js';
import {ValueContainer} from '../../../src/core/dependency-injection/value-container.js';
import {type LocalConfigRuntimeState} from '../../../src/business/runtime-state/config/local/local-config-runtime-state.js';
import {type ClusterReferences} from '../../../src/types/index.js';
import {type RemoteConfigRuntimeState} from '../../../src/business/runtime-state/config/remote/remote-config-runtime-state.js';
import {StringFacade} from '../../../src/business/runtime-state/facade/string-facade.js';
import {SemanticVersion} from '../../../src/business/utils/semantic-version.js';
import {HelmChartValues} from '../../../src/integration/helm/model/values.js';
import {Duration} from '../../../src/core/time/duration.js';

const testName: string = 'network-cmd-unit';
const namespace: NamespaceName = NamespaceName.of(testName);
const argv: Argv = Argv.getDefaultArgv(namespace);
const realK8Factory: K8Factory = container.resolve(InjectTokens.K8Factory);

argv.setArg(flags.consensusNodeVersion, HEDERA_PLATFORM_VERSION_TAG);
argv.setArg(flags.nodeAliasesUnparsed, 'node1');
argv.setArg(flags.deployment, 'deployment');
argv.setArg(flags.generateGossipKeys, true);
argv.setArg(flags.generateTlsKeys, true);
argv.setArg(flags.clusterRef, getTestCluster());
argv.setArg(flags.soloChartVersion, version.SOLO_CHART_VERSION);
argv.setArg(flags.force, true);
argv.setArg(flags.clusterSetupNamespace, constants.SOLO_SETUP_NAMESPACE.name);
argv.setArg(flags.chartDirectory, undefined);
if (new SemanticVersion<string>(version.HEDERA_PLATFORM_VERSION).lessThan('v0.61.0')) {
  argv.setArg(flags.consensusNodeVersion, 'v0.61.0');
}

describe('NetworkCommand unit tests', (): void => {
  before(async (): Promise<void> => {
    const sourceDirectory: string = PathEx.joinWithRealPath('test', 'data');
    const destinationDirectory: string = PathEx.join(sourceDirectory, 'tmp', 'templates');

    if (!fs.existsSync(destinationDirectory)) {
      fs.mkdirSync(destinationDirectory, {recursive: true});
    }

    fs.copyFileSync(
      PathEx.joinWithRealPath(sourceDirectory, constants.APPLICATION_PROPERTIES),
      PathEx.join(destinationDirectory, constants.APPLICATION_PROPERTIES),
    );
  });

  describe('Chart Install Function is called correctly', (): void => {
    let options: any;

    const k8SFactoryStub: K8Factory = sinon.stub() as any;
    const clusterChecksStub: ClusterChecks = sinon.stub() as any;
    const remoteConfigStub: RemoteConfigRuntimeState = sinon.stub() as any;
    const chartManagerStub: ChartManager = sinon.stub() as any;
    const certificateManagerStub: CertificateManager = sinon.stub() as any;
    const profileManagerStub: ProfileManager = sinon.stub() as any;
    const platformInstallerStub: PlatformInstaller = sinon.stub() as any;
    const keyManagerStub: KeyManager = sinon.stub() as any;
    const depManagerStub: DependencyManager = sinon.stub() as any;
    const helmStub: DefaultHelmClient = sinon.stub() as any;
    let containerOverrides: InstanceOverrides;

    beforeEach(async (): Promise<void> => {
      argv.setArg(flags.chartDirectory, undefined);
      argv.setArg(flags.networkDeploymentValuesFile, undefined);

      containerOverrides = new Map<symbol, ValueContainer>([
        [InjectTokens.K8Factory, new ValueContainer(InjectTokens.K8Factory, k8SFactoryStub)],
        [InjectTokens.ClusterChecks, new ValueContainer(InjectTokens.ClusterChecks, clusterChecksStub)],
        [
          InjectTokens.RemoteConfigRuntimeState,
          new ValueContainer(InjectTokens.RemoteConfigRuntimeState, remoteConfigStub),
        ],
        [InjectTokens.ChartManager, new ValueContainer(InjectTokens.ChartManager, chartManagerStub)],
        [InjectTokens.CertificateManager, new ValueContainer(InjectTokens.CertificateManager, certificateManagerStub)],
        [InjectTokens.ProfileManager, new ValueContainer(InjectTokens.ProfileManager, profileManagerStub)],
        [InjectTokens.PlatformInstaller, new ValueContainer(InjectTokens.PlatformInstaller, platformInstallerStub)],
        [InjectTokens.KeyManager, new ValueContainer(InjectTokens.KeyManager, keyManagerStub)],
        [InjectTokens.DependencyManager, new ValueContainer(InjectTokens.DependencyManager, depManagerStub)],
        [InjectTokens.Helm, new ValueContainer(InjectTokens.Helm, helmStub)],
      ]);

      resetForTest(undefined, undefined, true, containerOverrides);

      options = {
        logger: container.resolve<SoloLogger>(InjectTokens.SoloLogger),
        configManager: container.resolve<ConfigManager>(InjectTokens.ConfigManager),
      };

      options.configManager.update(argv.build());

      options.k8Factory = k8SFactoryStub as K8Factory;
      const k8Stub: SinonStub = sinon.stub();

      options.k8Factory.default = sinon.stub().returns(k8Stub);
      options.k8Factory.default().namespaces = sinon.stub().returns({
        has: sinon.stub().returns(true),
      });
      options.k8Factory.default().contexts = sinon.stub().returns({
        readCurrent: sinon
          .stub()
          .returns(
            new K8Client(undefined, realK8Factory.default().getKubectlExecutablePath()).contexts().readCurrent(),
          ),
      });
      options.k8Factory.default().configMaps = sinon.stub() as unknown as K8ClientConfigMaps;
      options.k8Factory.default().configMaps.read = sinon.stub();
      options.k8Factory.default().pods = sinon.stub().returns({
        waitForRunningPhase: sinon.stub(),
        waitForReadyStatus: sinon.stub(),
      });
      options.k8Factory.default().secrets = sinon.stub().returns({
        createOrReplace: sinon.stub().resolves(true),
      });
      options.k8Factory.default().leases = sinon.stub().returns({
        read: sinon.stub(),
      });
      options.k8Factory.default().logger = options.logger;

      options.k8Factory.getK8 = sinon.stub().returns(k8Stub);
      options.k8Factory.getK8().namespaces = sinon.stub().returns({
        has: sinon.stub().returns(true),
      });
      options.k8Factory.getK8().configMaps = sinon.stub() as unknown as K8ClientConfigMaps;
      options.k8Factory.getK8().configMaps.read = sinon.stub();
      options.k8Factory.getK8().pods = sinon.stub().returns({
        waitForRunningPhase: sinon.stub(),
        waitForReadyStatus: sinon.stub(),
      });
      options.k8Factory.getK8().secrets = sinon.stub().returns({
        createOrReplace: sinon.stub().resolves(true),
      });
      options.k8Factory.getK8().leases = sinon.stub().returns({
        read: sinon.stub(),
      });
      options.k8Factory.getK8().manifests = sinon.stub().returns({
        applyManifest: sinon.stub().resolves(),
        patchObject: sinon.stub().resolves(),
      });
      options.k8Factory.getK8().logger = options.logger;

      options.k8Factory.default().clusters = sinon.stub().returns({
        list: sinon.stub().returns([{name: 'solo-e2e'}]),
      });
      options.k8Factory.default().clusters().readCurrent = sinon.stub().returns('solo-e2e');

      clusterChecksStub.isMinioInstalled = sinon.stub();
      clusterChecksStub.isCertManagerInstalled = sinon.stub();
      container.registerInstance(InjectTokens.ClusterChecks, clusterChecksStub);

      container.registerInstance(InjectTokens.K8Factory, options.k8Factory);

      options.depManager = sinon.stub() as unknown as DependencyManager;
      container.registerInstance<DependencyManager>(InjectTokens.DependencyManager, options.depManager);
      options.localConfig = container.resolve<LocalConfigRuntimeState>(InjectTokens.LocalConfigRuntimeState);
      options.helm = container.resolve<DefaultHelmClient>(InjectTokens.Helm);
      options.helm.dependency = sinon.stub();

      ListrLock.newAcquireLockTask = sinon.stub().returns({
        run: sinon.stub().returns({}),
      });

      options.keyManager = container.resolve<KeyManager>(InjectTokens.KeyManager);
      options.keyManager.prepareTlsKeyFilePaths = sinon.stub();

      options.platformInstaller = platformInstallerStub;
      options.platformInstaller.copyNodeKeys = sinon.stub();
      container.registerInstance(InjectTokens.PlatformInstaller, options.platformInstaller);

      options.profileManager = container.resolve<ProfileManager>(InjectTokens.ProfileManager);
      options.profileManager.prepareValuesForSoloChart = sinon.stub().resolves(new HelmChartValues());

      options.certificateManager = certificateManagerStub;
      options.certificateManager.prepareValuesForSoloChart = sinon.stub().resolves(new HelmChartValues());
      container.registerInstance(InjectTokens.CertificateManager, options.certificateManager);

      options.chartManager = container.resolve<ChartManager>(InjectTokens.ChartManager);
      options.chartManager.isChartInstalled = sinon
        .stub()
        .callsFake(async (_namespace: NamespaceName, releaseName: string): Promise<boolean> => {
          if (releaseName === constants.MINIO_OPERATOR_RELEASE_NAME) {
            return false;
          }

          if (releaseName === constants.SOLO_DEPLOYMENT_CHART) {
            return true;
          }

          return false;
        });
      options.chartManager.upgrade = sinon.stub().returns(true);
      options.chartManager.install = sinon.stub().returns(true);
      options.chartManager.uninstall = sinon.stub().returns(true);

      options.remoteConfig = container.resolve<RemoteConfigRuntimeState>(InjectTokens.RemoteConfigRuntimeState);
      options.remoteConfig.isLoaded = sinon.stub().returns(true);
      options.remoteConfig.getConfigMap = sinon.stub().resolves();
      options.remoteConfig.persist = sinon.stub();
      options.remoteConfig.loadAndValidate = sinon.stub();
      options.remoteConfig.getNamespace = sinon.stub();

      options.remoteConfig.configuration = {
        components: {changeNodePhase: sinon.stub(), getNewComponentId: sinon.stub(), addNewComponent: sinon.stub()},
        versions: {consensusNode: '0.0.0'},
      };

      await options.localConfig.load();
      options.localConfig.configuration.clusterRefs.set('solo-e2e', new StringFacade('context-1'));

      options.leaseManager = container.resolve<LockManager>(InjectTokens.LockManager);
      options.leaseManager.currentNamespace = sinon.stub().returns(testName);

      // stub through sinon so that afterEach's restore puts the real method back for other test files
      sinon.stub(GenesisNetworkDataConstructor, 'initialize').resolves();
    });

    afterEach((): void => {
      sinon.restore();
    });

    it('Install function is called with expected parameters', async (): Promise<void> => {
      try {
        const networkCommand: NetworkCommand = container.resolve(NetworkCommand);
        options.remoteConfig.getConsensusNodes = sinon
          .stub()
          .returns([
            new ConsensusNode('node1', 0, 'solo-e2e', 'solo-e2e', 'context1', 'base', 'pattern', 'fqdn', [], []),
          ]);
        options.remoteConfig.getContexts = sinon.stub().returns(['context1']);
        const stubbedClusterReferences: ClusterReferences = new Map([['solo-e2e', 'context1']]);
        options.remoteConfig.getClusterRefs = sinon.stub().returns(stubbedClusterReferences);
        options.remoteConfig.updateComponentVersion = sinon.stub();
        options.remoteConfig.configuration.state = {};
        // @ts-expect-error - TS2341: to mock
        networkCommand.getBlockNodes = sinon.stub().returns([]);
        // @ts-expect-error - TS2341: to mock
        networkCommand.ensurePodLogsCrd = sinon.stub().returns(true);
        // @ts-expect-error - TS2341: to mock
        networkCommand.ensurePrometheusOperatorCrds = sinon.stub().returns(true);

        // @ts-expect-error - TS2341: to mock
        networkCommand.componentFactory = {
          createNewEnvoyProxyComponent: sinon.stub(),
          createNewHaProxyComponent: sinon.stub(),
        };

        await networkCommand.deploy(argv.build());

        expect(options.chartManager.upgrade.args[0][0].name).to.equal('solo-e2e');
        expect(options.chartManager.upgrade.args[0][1]).to.equal(constants.SOLO_DEPLOYMENT_CHART);
        expect(options.chartManager.upgrade.args[0][2]).to.equal(constants.SOLO_DEPLOYMENT_CHART);
        expect(options.chartManager.upgrade.args[0][3]).to.equal(constants.SOLO_TESTING_CHART_URL);
      } finally {
        sinon.restore();
      }
    });

    it('retries the solo-deployment chart install after a transient failure', async (): Promise<void> => {
      try {
        // collapse the retry backoff so the test does not wait for the real delay
        const ofSecondsStub: SinonStub = sinon.stub(Duration, 'ofSeconds');
        ofSecondsStub.callThrough();
        ofSecondsStub.withArgs(constants.NETWORK_CHART_INSTALL_RETRY_DELAY_SECS).returns(Duration.ofMillis(1));

        const networkCommand: NetworkCommand = container.resolve(NetworkCommand);
        options.remoteConfig.getConsensusNodes = sinon
          .stub()
          .returns([
            new ConsensusNode('node1', 0, 'solo-e2e', 'solo-e2e', 'context1', 'base', 'pattern', 'fqdn', [], []),
          ]);
        options.remoteConfig.getContexts = sinon.stub().returns(['context1']);
        const stubbedClusterReferences: ClusterReferences = new Map([['solo-e2e', 'context1']]);
        options.remoteConfig.getClusterRefs = sinon.stub().returns(stubbedClusterReferences);
        options.remoteConfig.updateComponentVersion = sinon.stub();
        options.remoteConfig.configuration.state = {};
        // @ts-expect-error - TS2341: to mock
        networkCommand.getBlockNodes = sinon.stub().returns([]);
        // @ts-expect-error - TS2341: to mock
        networkCommand.ensurePodLogsCrd = sinon.stub().returns(true);
        // @ts-expect-error - TS2341: to mock
        networkCommand.ensurePrometheusOperatorCrds = sinon.stub().returns(true);

        // @ts-expect-error - TS2341: to mock
        networkCommand.componentFactory = {
          createNewEnvoyProxyComponent: sinon.stub(),
          createNewHaProxyComponent: sinon.stub(),
        };

        const upgradeStub: SinonStub = sinon.stub();
        upgradeStub.resolves(true);
        upgradeStub
          .onFirstCall()
          .rejects(new Error('Post "https://127.0.0.1:6443/apis/monitoring.grafana.com/v1alpha2/podlogs": EOF'));
        options.chartManager.upgrade = upgradeStub;

        await networkCommand.deploy(argv.build());

        const upgradeCalls: SinonSpyCall[] = upgradeStub
          .getCalls()
          .filter((call: SinonSpyCall): boolean => call.args[1] === constants.SOLO_DEPLOYMENT_CHART);
        expect(upgradeCalls).to.have.lengthOf(2);

        const uninstallCalls: SinonSpyCall[] = options.chartManager.uninstall
          .getCalls()
          .filter((call: SinonSpyCall): boolean => call.args[1] === constants.SOLO_DEPLOYMENT_CHART);
        // one uninstall for the pre-existing release plus one clean-up between the failed and retried attempts
        expect(uninstallCalls).to.have.lengthOf(2);
      } finally {
        sinon.restore();
      }
    });

    it('normalizes duplicate comma-joined consensus-node-version values before semantic parsing', async (): Promise<void> => {
      const originalConsensusNodeVersion: string = argv.getArg<string>(flags.consensusNodeVersion);
      try {
        argv.setArg(flags.consensusNodeVersion, 'v0.73.0,v0.73.0');
        const networkCommand: NetworkCommand = container.resolve(NetworkCommand);
        options.remoteConfig.getConsensusNodes = sinon.stub().returns([{name: 'node1'}]);
        options.remoteConfig.getContexts = sinon.stub().returns(['context1']);
        const stubbedClusterReferences: ClusterReferences = new Map([['solo-e2e', 'context1']]);
        options.remoteConfig.getClusterRefs = sinon.stub().returns(stubbedClusterReferences);
        options.remoteConfig.updateComponentVersion = sinon.stub();
        options.remoteConfig.configuration.state = {};
        // @ts-expect-error - TS2341: to mock
        networkCommand.getBlockNodes = sinon.stub().returns([]);
        // @ts-expect-error - TS2341: to mock
        networkCommand.ensurePodLogsCrd = sinon.stub().returns(true);
        // @ts-expect-error - TS2341: to mock
        networkCommand.ensurePrometheusOperatorCrds = sinon.stub().returns(true);

        // @ts-expect-error - TS2341: to mock
        networkCommand.componentFactory = {
          createNewEnvoyProxyComponent: sinon.stub(),
          createNewHaProxyComponent: sinon.stub(),
        };

        await networkCommand.deploy(argv.build());

        expect(options.remoteConfig.persist.called).to.equal(true);
        expect(options.remoteConfig.configuration.versions.consensusNode.toString()).to.equal('0.73.0');
      } finally {
        argv.setArg(flags.consensusNodeVersion, originalConsensusNodeVersion);
        sinon.restore();
      }
    });

    it('Should use local chart directory', async (): Promise<void> => {
      try {
        argv.setArg(flags.chartDirectory, 'test-directory');
        argv.setArg(flags.force, true);
        const networkCommand: NetworkCommand = container.resolve(NetworkCommand);

        options.remoteConfig.getConsensusNodes = sinon
          .stub()
          .returns([
            new ConsensusNode('node1', 0, 'solo-e2e', 'solo-e2e', 'context1', 'base', 'pattern', 'fqdn', [], []),
          ]);
        options.remoteConfig.getContexts = sinon.stub().returns(['context1']);
        options.remoteConfig.updateComponentVersion = sinon.stub();
        const stubbedClusterReferences: ClusterReferences = new Map([['solo-e2e', 'context1']]);
        options.remoteConfig.getClusterRefs = sinon.stub().returns(stubbedClusterReferences);
        options.remoteConfig.configuration.state = {};

        // @ts-expect-error - TS2341: to mock
        networkCommand.ensurePodLogsCrd = sinon.stub().returns(true);
        // @ts-expect-error - TS2341: to mock
        networkCommand.ensurePrometheusOperatorCrds = sinon.stub().returns(true);
        // @ts-expect-error - TS2341: to mock
        networkCommand.getBlockNodes = sinon.stub().returns([]);

        // @ts-expect-error - TS2341: to mock
        networkCommand.componentFactory = {
          createNewEnvoyProxyComponent: sinon.stub(),
          createNewHaProxyComponent: sinon.stub(),
        };

        await networkCommand.deploy(argv.build());
        expect(options.chartManager.upgrade.args[0][0].name).to.equal('solo-e2e');
        expect(options.chartManager.upgrade.args[0][1]).to.equal(constants.SOLO_DEPLOYMENT_CHART);
        expect(options.chartManager.upgrade.args[0][2]).to.equal(constants.SOLO_DEPLOYMENT_CHART);
        expect(options.chartManager.upgrade.args[0][3]).to.equal(PathEx.join(ROOT_DIR, 'test-directory'));
      } finally {
        sinon.restore();
      }
    });

    it('Should use prepare config correctly for all clusters', async (): Promise<void> => {
      try {
        const common: string = PathEx.join('test', 'data', 'test-values.yaml');
        const values1: string = PathEx.join('test', 'data', 'test-values1.yaml');
        const values2: string = PathEx.join('test', 'data', 'test-values2.yaml');
        argv.setArg(flags.networkDeploymentValuesFile, `${common},cluster=${values1},cluster=${values2}`);
        argv.setArg(flags.chartDirectory, 'test-directory');
        argv.setArg(flags.force, true);

        const task: SinonStub = sinon.stub();

        options.remoteConfig.getConsensusNodes = sinon
          .stub()
          .returns([
            new ConsensusNode('node1', 0, 'solo-e2e', 'cluster', 'context-1', 'base', 'pattern', 'fqdn', [], []),
          ]);

        options.remoteConfig.getContexts = sinon.stub().returns(['context-1']);
        const stubbedClusterReferences: ClusterReferences = new Map<string, string>([['cluster', 'context1']]);
        options.remoteConfig.getClusterRefs = sinon.stub().returns(stubbedClusterReferences);

        const networkCommand: NetworkCommand = container.resolve(NetworkCommand);
        // @ts-expect-error - to mock
        networkCommand.getBlockNodes = sinon.stub().returns([]);
        networkCommand.configManager.update(argv.build());

        // @ts-expect-error - to access private method
        const config: NetworkDeployConfigClass = await networkCommand.prepareConfig(task, argv.build());

        expect(config.chartValuesMap).to.not.empty;
        expect(config.chartValuesMap['cluster']).to.not.empty;

        const chartValueArguments: string[] = config.chartValuesMap['cluster'].toArguments();

        const indexOfValueArgumentEndingWith: (suffix: string) => number = (suffix: string): number =>
          chartValueArguments.findIndex((argument: string): boolean => argument.endsWith(suffix));

        const soloDeploymentValuesFileIndex: number = indexOfValueArgumentEndingWith(
          PathEx.join('solo-deployment', 'values.yaml'),
        );
        const soloValuesFileIndex: number = indexOfValueArgumentEndingWith(
          PathEx.join('resources', 'solo-values.yaml'),
        );
        const commonValuesFileIndex: number = indexOfValueArgumentEndingWith(
          PathEx.join('test', 'data', 'test-values.yaml'),
        );
        const values1FileIndex: number = indexOfValueArgumentEndingWith(
          PathEx.join('test', 'data', 'test-values1.yaml'),
        );
        const values2FileIndex: number = indexOfValueArgumentEndingWith(
          PathEx.join('test', 'data', 'test-values2.yaml'),
        );

        expect(soloDeploymentValuesFileIndex).to.not.equal(-1);
        expect(soloValuesFileIndex).to.not.equal(-1);
        expect(commonValuesFileIndex).to.not.equal(-1);
        expect(values1FileIndex).to.not.equal(-1);
        expect(values2FileIndex).to.not.equal(-1);

        // chart values file should precede the values file passed in the command
        expect(soloDeploymentValuesFileIndex).to.be.lt(values1FileIndex);
        expect(soloDeploymentValuesFileIndex).to.be.lt(values2FileIndex);

        expect(soloValuesFileIndex).to.be.lt(commonValuesFileIndex);
        expect(commonValuesFileIndex).to.be.lt(values1FileIndex);
        expect(values1FileIndex).to.be.lt(values2FileIndex);
      } finally {
        sinon.restore();
      }
    });

    it('sets static IP chart values for haproxy, envoy, and network node services', async (): Promise<void> => {
      const originalHaproxyIps: string = argv.getArg<string>(flags.haproxyIps);
      const originalEnvoyIps: string = argv.getArg<string>(flags.envoyIps);
      const originalNetworkNodeIps: string = argv.getArg<string>(flags.networkNodeIps);

      try {
        argv.setArg(flags.haproxyIps, 'node1=172.19.1.0,node2=172.19.2.0');
        argv.setArg(flags.envoyIps, 'node1=172.19.1.2,node2=172.19.2.2');
        argv.setArg(flags.networkNodeIps, 'node1=172.19.1.1,node2=172.19.2.1');

        const task: SinonStub = sinon.stub();
        options.remoteConfig.getConsensusNodes = sinon
          .stub()
          .returns([
            new ConsensusNode('node1', 0, 'solo-e2e-c1', 'cluster1', 'context-1', 'base', 'pattern', 'fqdn1', [], []),
            new ConsensusNode('node2', 1, 'solo-e2e-c2', 'cluster2', 'context-2', 'base', 'pattern', 'fqdn2', [], []),
          ]);
        options.remoteConfig.getContexts = sinon.stub().returns(['context-1', 'context-2']);
        options.remoteConfig.getClusterRefs = sinon.stub().returns(
          new Map<string, string>([
            ['cluster1', 'context-1'],
            ['cluster2', 'context-2'],
          ]),
        );

        const networkCommand: NetworkCommand = container.resolve(NetworkCommand);
        // @ts-expect-error - to mock
        networkCommand.getBlockNodes = sinon.stub().returns([]);
        networkCommand.configManager.update(argv.build());

        // @ts-expect-error - to access private method
        const config: NetworkDeployConfigClass = await networkCommand.prepareConfig(task, argv.build());

        expect(config.chartValuesMap['cluster1'].toArguments()).to.include.members([
          'hedera.nodes[0].haproxyStaticIP=172.19.1.0',
          'hedera.nodes[0].envoyProxyStaticIP=172.19.1.2',
          'hedera.nodes[0].networkNodeStaticIP=172.19.1.1',
        ]);
        expect(config.chartValuesMap['cluster2'].toArguments()).to.include.members([
          'hedera.nodes[0].haproxyStaticIP=172.19.2.0',
          'hedera.nodes[0].envoyProxyStaticIP=172.19.2.2',
          'hedera.nodes[0].networkNodeStaticIP=172.19.2.1',
        ]);
      } finally {
        argv.setArg(flags.haproxyIps, originalHaproxyIps);
        argv.setArg(flags.envoyIps, originalEnvoyIps);
        argv.setArg(flags.networkNodeIps, originalNetworkNodeIps);
        sinon.restore();
      }
    });

    it('keeps MinIO enabled for CN 0.74+ when no block node is deployed', async (): Promise<void> => {
      const originalConsensusNodeVersion: string = argv.getArg<string>(flags.consensusNodeVersion);

      try {
        argv.setArg(flags.consensusNodeVersion, 'v0.74.0');

        const task: SinonStub = sinon.stub();
        options.remoteConfig.getConsensusNodes = sinon
          .stub()
          .returns([
            new ConsensusNode('node1', 0, 'solo-e2e', 'cluster', 'context-1', 'base', 'pattern', 'fqdn', [], []),
          ]);
        options.remoteConfig.getContexts = sinon.stub().returns(['context-1']);
        options.remoteConfig.getClusterRefs = sinon.stub().returns(new Map<string, string>([['cluster', 'context1']]));

        const networkCommand: NetworkCommand = container.resolve(NetworkCommand);
        // @ts-expect-error - to mock
        networkCommand.getBlockNodes = sinon.stub().returns([]);
        networkCommand.configManager.update(argv.build());

        // @ts-expect-error - to access private method
        const config: NetworkDeployConfigClass = await networkCommand.prepareConfig(task, argv.build());
        const chartValueArguments: string[] = config.chartValuesMap['cluster'].toArguments();

        expect(config.minioEnabled).to.equal(true);
        expect(chartValueArguments).to.not.include('cloud.minio.enabled=false');
        expect(chartValueArguments).to.not.include('defaults.sidecars.recordStreamUploader.enabled=false');
        expect(chartValueArguments).to.not.include('defaults.sidecars.eventStreamUploader.enabled=false');
        expect(chartValueArguments).to.not.include('defaults.sidecars.blockstreamUploader.enabled=false');
      } finally {
        argv.setArg(flags.consensusNodeVersion, originalConsensusNodeVersion);
        sinon.restore();
      }
    });

    it('disables MinIO for CN 0.74+ when a block node is deployed', async (): Promise<void> => {
      const originalConsensusNodeVersion: string = argv.getArg<string>(flags.consensusNodeVersion);

      try {
        argv.setArg(flags.consensusNodeVersion, 'v0.74.0');

        const task: SinonStub = sinon.stub();
        options.remoteConfig.getConsensusNodes = sinon
          .stub()
          .returns([
            new ConsensusNode('node1', 0, 'solo-e2e', 'cluster', 'context-1', 'base', 'pattern', 'fqdn', [], []),
          ]);
        options.remoteConfig.getContexts = sinon.stub().returns(['context-1']);
        options.remoteConfig.getClusterRefs = sinon.stub().returns(new Map<string, string>([['cluster', 'context1']]));

        const networkCommand: NetworkCommand = container.resolve(NetworkCommand);
        // @ts-expect-error - to mock
        networkCommand.getBlockNodes = sinon.stub().returns([{}]);
        networkCommand.configManager.update(argv.build());

        // @ts-expect-error - to access private method
        const config: NetworkDeployConfigClass = await networkCommand.prepareConfig(task, argv.build());
        const chartValueArguments: string[] = config.chartValuesMap['cluster'].toArguments();

        expect(config.minioEnabled).to.equal(false);
        expect(chartValueArguments).to.include('cloud.minio.enabled=false');
        expect(chartValueArguments).to.include('defaults.sidecars.recordStreamUploader.enabled=false');
        expect(chartValueArguments).to.include('defaults.sidecars.eventStreamUploader.enabled=false');
        expect(chartValueArguments).to.include('defaults.sidecars.blockstreamUploader.enabled=false');
      } finally {
        argv.setArg(flags.consensusNodeVersion, originalConsensusNodeVersion);
        sinon.restore();
      }
    });

    it('keeps MinIO enabled for CN 0.74+ with block nodes when TSS is disabled', async (): Promise<void> => {
      const originalConsensusNodeVersion: string = argv.getArg<string>(flags.consensusNodeVersion);
      const originalTssEnabled: boolean = argv.getArg<boolean>(flags.tssEnabled);

      try {
        argv.setArg(flags.consensusNodeVersion, 'v0.74.0');
        argv.setArg(flags.tssEnabled, false);

        const task: SinonStub = sinon.stub();
        options.remoteConfig.getConsensusNodes = sinon
          .stub()
          .returns([
            new ConsensusNode('node1', 0, 'solo-e2e', 'cluster', 'context-1', 'base', 'pattern', 'fqdn', [], []),
          ]);
        options.remoteConfig.getContexts = sinon.stub().returns(['context-1']);
        options.remoteConfig.getClusterRefs = sinon.stub().returns(new Map<string, string>([['cluster', 'context1']]));

        const networkCommand: NetworkCommand = container.resolve(NetworkCommand);
        // @ts-expect-error - to mock
        networkCommand.getBlockNodes = sinon.stub().returns([{}]);
        networkCommand.configManager.update(argv.build());

        // @ts-expect-error - to access private method
        const config: NetworkDeployConfigClass = await networkCommand.prepareConfig(task, argv.build());
        const chartValueArguments: string[] = config.chartValuesMap['cluster'].toArguments();

        expect(config.minioEnabled).to.equal(true);
        expect(chartValueArguments).to.not.include('cloud.minio.enabled=false');
        expect(chartValueArguments).to.not.include('defaults.sidecars.recordStreamUploader.enabled=false');
        expect(chartValueArguments).to.not.include('defaults.sidecars.eventStreamUploader.enabled=false');
        expect(chartValueArguments).to.not.include('defaults.sidecars.blockstreamUploader.enabled=false');
      } finally {
        argv.setArg(flags.consensusNodeVersion, originalConsensusNodeVersion);
        argv.setArg(flags.tssEnabled, originalTssEnabled);
        sinon.restore();
      }
    });

    it('keeps MinIO enabled for CN 0.74+ with block nodes when block stream mode is BOTH', async (): Promise<void> => {
      const originalConsensusNodeVersion: string = argv.getArg<string>(flags.consensusNodeVersion);
      const originalBlockStreamMode: string | undefined = process.env.BLOCK_STREAM_STREAM_MODE;

      try {
        argv.setArg(flags.consensusNodeVersion, 'v0.74.0');
        process.env.BLOCK_STREAM_STREAM_MODE = 'BOTH';

        const task: SinonStub = sinon.stub();
        options.remoteConfig.getConsensusNodes = sinon
          .stub()
          .returns([
            new ConsensusNode('node1', 0, 'solo-e2e', 'cluster', 'context-1', 'base', 'pattern', 'fqdn', [], []),
          ]);
        options.remoteConfig.getContexts = sinon.stub().returns(['context-1']);
        options.remoteConfig.getClusterRefs = sinon.stub().returns(new Map<string, string>([['cluster', 'context1']]));

        const networkCommand: NetworkCommand = container.resolve(NetworkCommand);
        // @ts-expect-error - to mock
        networkCommand.getBlockNodes = sinon.stub().returns([{}]);
        networkCommand.configManager.update(argv.build());

        // @ts-expect-error - to access private method
        const config: NetworkDeployConfigClass = await networkCommand.prepareConfig(task, argv.build());
        const chartValueArguments: string[] = config.chartValuesMap['cluster'].toArguments();

        expect(config.minioEnabled).to.equal(true);
        expect(chartValueArguments).to.not.include('cloud.minio.enabled=false');
        expect(chartValueArguments).to.not.include('defaults.sidecars.recordStreamUploader.enabled=false');
        expect(chartValueArguments).to.not.include('defaults.sidecars.eventStreamUploader.enabled=false');
        expect(chartValueArguments).to.not.include('defaults.sidecars.blockstreamUploader.enabled=false');
      } finally {
        argv.setArg(flags.consensusNodeVersion, originalConsensusNodeVersion);
        if (originalBlockStreamMode === undefined) {
          delete process.env.BLOCK_STREAM_STREAM_MODE;
        } else {
          process.env.BLOCK_STREAM_STREAM_MODE = originalBlockStreamMode;
        }
        sinon.restore();
      }
    });
  });
});
