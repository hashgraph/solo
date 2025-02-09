/**
 * SPDX-License-Identifier: Apache-2.0
 */
import sinon from 'sinon';
import {describe, it, beforeEach} from 'mocha';
import {expect} from 'chai';

import {getDefaultArgv, HEDERA_PLATFORM_VERSION_TAG, TEST_CLUSTER} from '../../test_util.js';
import {Flags as flags} from '../../../src/commands/flags.js';
import * as version from '../../../version.js';
import * as constants from '../../../src/core/constants.js';
import {ConfigManager} from '../../../src/core/config_manager.js';
import {ChartManager} from '../../../src/core/chart_manager.js';
import {Helm} from '../../../src/core/helm.js';
import path from 'path';
import {NetworkCommand} from '../../../src/commands/network.js';
import {LeaseManager} from '../../../src/core/lease/lease_manager.js';
import {RemoteConfigManager} from '../../../src/core/config/remote/remote_config_manager.js';
import {ProfileManager} from '../../../src/core/profile_manager.js';
import {KeyManager} from '../../../src/core/key_manager.js';
import {ROOT_DIR} from '../../../src/core/constants.js';
import {ListrLease} from '../../../src/core/lease/listr_lease.js';
import {GenesisNetworkDataConstructor} from '../../../src/core/genesis_network_models/genesis_network_data_constructor.js';
import {container} from 'tsyringe-neo';
import {SoloLogger} from '../../../src/core/logging.js';
import {type K8} from '../../../src/core/kube/k8.js';
import {PlatformInstaller} from '../../../src/core/platform_installer.js';
import {CertificateManager} from '../../../src/core/certificate_manager.js';
import {DependencyManager} from '../../../src/core/dependency_managers/index.js';
import {LocalConfig} from '../../../src/core/config/local_config.js';
import {resetForTest} from '../../test_container.js';
import {ClusterChecks} from '../../../src/core/cluster_checks.js';
import {type K8ClientConfigMaps} from '../../../src/core/kube/k8_client/k8_client_config_maps.js';

const testName = 'network-cmd-unit';
const argv = getDefaultArgv();

argv[flags.releaseTag.name] = HEDERA_PLATFORM_VERSION_TAG;
argv[flags.nodeAliasesUnparsed.name] = 'node1';
argv[flags.deployment.name] = 'deployment';
argv[flags.generateGossipKeys.name] = true;
argv[flags.generateTlsKeys.name] = true;
argv[flags.clusterName.name] = TEST_CLUSTER;
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

      opts.logger = container.resolve(SoloLogger);

      opts.configManager = container.resolve(ConfigManager);
      opts.configManager.update(argv);

      opts.k8 = sinon.stub() as unknown as K8;
      opts.k8.namespaces = sinon.stub().returns({
        has: sinon.stub().returns(true),
      });
      opts.k8.configMaps = sinon.stub() as unknown as K8ClientConfigMaps;
      opts.k8.configMaps.read = sinon.stub();
      opts.k8.pods = sinon.stub().returns({
        waitForRunningPhase: sinon.stub(),
        waitForReadyStatus: sinon.stub(),
      });
      opts.k8.leases = sinon.stub().returns({
        read: sinon.stub(),
      });
      const clusterChecksStub = sinon.stub() as unknown as ClusterChecks;
      clusterChecksStub.isMinioInstalled = sinon.stub();
      clusterChecksStub.isPrometheusInstalled = sinon.stub();
      clusterChecksStub.isCertManagerInstalled = sinon.stub();
      container.registerInstance(ClusterChecks, clusterChecksStub);

      opts.k8.logger = opts.logger;
      container.registerInstance('K8', opts.k8);

      opts.depManager = sinon.stub() as unknown as DependencyManager;
      container.registerInstance(DependencyManager, opts.depManager);
      opts.localConfig = container.resolve(LocalConfig);
      opts.helm = container.resolve(Helm);
      opts.helm.dependency = sinon.stub();

      ListrLease.newAcquireLeaseTask = sinon.stub().returns({
        run: sinon.stub().returns({}),
      });

      opts.keyManager = container.resolve(KeyManager);
      opts.keyManager.copyGossipKeysToStaging = sinon.stub();
      opts.keyManager.copyNodeKeysToStaging = sinon.stub();

      opts.platformInstaller = sinon.stub();
      opts.platformInstaller.copyNodeKeys = sinon.stub();
      container.registerInstance(PlatformInstaller, opts.platformInstaller);

      opts.profileManager = container.resolve(ProfileManager);
      opts.profileManager.prepareValuesForSoloChart = sinon.stub();

      opts.certificateManager = sinon.stub();
      container.registerInstance(CertificateManager, opts.certificateManager);

      opts.chartManager = container.resolve(ChartManager);
      opts.chartManager.isChartInstalled = sinon.stub().returns(true);
      opts.chartManager.isChartInstalled.onSecondCall().returns(false);
      opts.chartManager.install = sinon.stub().returns(true);
      opts.chartManager.uninstall = sinon.stub().returns(true);

      opts.remoteConfigManager = container.resolve(RemoteConfigManager);
      opts.remoteConfigManager.getConfigMap = sinon.stub().returns(null);

      opts.leaseManager = container.resolve(LeaseManager);
      opts.leaseManager.currentNamespace = sinon.stub().returns(testName);

      GenesisNetworkDataConstructor.initialize = sinon.stub().returns(null);
    });

    it('Install function is called with expected parameters', async () => {
      const networkCommand = new NetworkCommand(opts);
      await networkCommand.deploy(argv);

      expect(opts.chartManager.install.args[0][0].name).to.equal(opts.localConfig.getCurrentDeployment().namespace);
      expect(opts.chartManager.install.args[0][1]).to.equal(constants.SOLO_DEPLOYMENT_CHART);
      expect(opts.chartManager.install.args[0][2]).to.equal(
        constants.SOLO_TESTING_CHART_URL + '/' + constants.SOLO_DEPLOYMENT_CHART,
      );
      expect(opts.chartManager.install.args[0][3]).to.equal(version.SOLO_CHART_VERSION);
    });

    it('Should use local chart directory', async () => {
      argv[flags.chartDirectory.name] = 'test-directory';
      argv[flags.force.name] = true;

      const networkCommand = new NetworkCommand(opts);
      await networkCommand.deploy(argv);
      expect(opts.chartManager.install.args[0][0].name).to.equal(opts.localConfig.getCurrentDeployment().namespace);
      expect(opts.chartManager.install.args[0][1]).to.equal(constants.SOLO_DEPLOYMENT_CHART);
      expect(opts.chartManager.install.args[0][2]).to.equal(
        path.join(ROOT_DIR, 'test-directory', constants.SOLO_DEPLOYMENT_CHART),
      );
      expect(opts.chartManager.install.args[0][3]).to.equal(version.SOLO_CHART_VERSION);
    });
  });
});
