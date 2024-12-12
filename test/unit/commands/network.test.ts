/**
 * Copyright (C) 2024 Hedera Hashgraph, LLC
 *
 * Licensed under the Apache License, Version 2.0 (the ""License"");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an ""AS IS"" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 */
import sinon from 'sinon';
import {describe, it, beforeEach} from 'mocha';
import {expect} from 'chai';

import {
  bootstrapTestVariables,
  getDefaultArgv,
  HEDERA_PLATFORM_VERSION_TAG,
  TEST_CLUSTER,
  testLogger,
} from '../../test_util.js';
import {Flags as flags} from '../../../src/commands/flags.js';
import * as version from '../../../version.js';
import * as constants from '../../../src/core/constants.js';
import {ConfigManager} from '../../../src/core/config_manager.js';
import {ChartManager} from '../../../src/core/chart_manager.js';
import {Helm} from '../../../src/core/helm.js';
import path from 'path';
import {NetworkCommand} from '../../../src/commands/network.js';
import {LeaseManager} from '../../../src/core/lease/lease_manager.js';
import {IntervalLeaseRenewalService} from '../../../src/core/lease/interval_lease_renewal.js';
import {RemoteConfigManager} from '../../../src/core/config/remote/remote_config_manager.js';
import {ProfileManager} from '../../../src/core/profile_manager.js';
import {KeyManager} from '../../../src/core/key_manager.js';
import {ROOT_DIR} from '../../../src/core/constants.js';
import {ListrLease} from '../../../src/core/lease/listr_lease.js';

const getBaseCommandOpts = () => ({
  logger: sinon.stub(),
  helm: sinon.stub(),
  k8: sinon.stub(),
  chartManager: sinon.stub(),
  configManager: sinon.stub(),
  depManager: sinon.stub(),
  localConfig: sinon.stub(),
});

const testName = 'network-cmd-unit';
const namespace = testName;
const argv = getDefaultArgv();

argv[flags.namespace.name] = namespace;
argv[flags.releaseTag.name] = HEDERA_PLATFORM_VERSION_TAG;
argv[flags.nodeAliasesUnparsed.name] = 'node1';
argv[flags.generateGossipKeys.name] = true;
argv[flags.generateTlsKeys.name] = true;
argv[flags.clusterName.name] = TEST_CLUSTER;
argv[flags.soloChartVersion.name] = version.SOLO_CHART_VERSION;
argv[flags.force.name] = true;
argv[flags.clusterSetupNamespace.name] = constants.SOLO_SETUP_NAMESPACE;
argv[flags.chartDirectory.name] = undefined;

describe('NetworkCommand unit tests', () => {
  describe('Chart Install Function is called correctly', () => {
    let opts: any;

    const bootstrapResp = bootstrapTestVariables(testName, argv);

    beforeEach(() => {
      opts = getBaseCommandOpts();
      opts.logger = testLogger;
      opts.helm = new Helm(opts.logger);
      opts.helm.dependency = sinon.stub();

      opts.configManager = new ConfigManager(testLogger);
      opts.configManager.update(argv);
      opts.k8 = sinon.stub();
      opts.k8.hasNamespace = sinon.stub().returns(true);
      opts.k8.getNamespacedConfigMap = sinon.stub().returns(null);
      opts.k8.waitForPodReady = sinon.stub();
      opts.k8.waitForPods = sinon.stub();
      opts.k8.readNamespacedLease = sinon.stub();

      ListrLease.newAcquireLeaseTask = sinon.stub().returns({
        run: sinon.stub().returns({}),
      });

      opts.keyManager = new KeyManager(testLogger);
      opts.keyManager.copyGossipKeysToStaging = sinon.stub();
      opts.keyManager.copyNodeKeysToStaging = sinon.stub();
      opts.platformInstaller = sinon.stub();
      opts.platformInstaller.copyNodeKeys = sinon.stub();

      opts.profileManager = new ProfileManager(testLogger, opts.configManager);
      opts.profileManager.prepareValuesForSoloChart = sinon.stub();
      opts.certificateManager = sinon.stub();

      opts.chartManager = new ChartManager(opts.helm, opts.logger);
      opts.chartManager.isChartInstalled = sinon.stub().returns(true);
      opts.chartManager.isChartInstalled.onSecondCall().returns(false);

      opts.chartManager.install = sinon.stub().returns(true);
      opts.remoteConfigManager = new RemoteConfigManager(opts.k8, opts.logger, opts.localConfig, opts.configManager);

      opts.configManager = new ConfigManager(opts.logger);
      opts.leaseManager = new LeaseManager(opts.k8, opts.configManager, opts.logger, new IntervalLeaseRenewalService());
      opts.leaseManager.currentNamespace = sinon.stub().returns(testName);
    });

    it('Install function is called with expected parameters', async () => {
      const networkCommand = new NetworkCommand(opts);
      await networkCommand.deploy(argv);

      expect(opts.chartManager.install.args[0][0]).to.equal(testName);
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
      expect(opts.chartManager.install.args[0][0]).to.equal(testName);
      expect(opts.chartManager.install.args[0][1]).to.equal(constants.SOLO_DEPLOYMENT_CHART);
      expect(opts.chartManager.install.args[0][2]).to.equal(
        path.join(ROOT_DIR, 'test-directory', constants.SOLO_DEPLOYMENT_CHART),
      );
      expect(opts.chartManager.install.args[0][3]).to.equal(version.SOLO_CHART_VERSION);
    });
  });
});
