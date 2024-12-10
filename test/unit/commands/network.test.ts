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

import {ClusterCommand} from '../../../src/commands/cluster.js';
import {
  BASE_TEST_DIR,
  bootstrapTestVariables,
  getDefaultArgv,
  HEDERA_PLATFORM_VERSION_TAG,
  TEST_CLUSTER,
  testLogger
} from '../../test_util.js';
import {Flags as flags} from '../../../src/commands/flags.js';
import * as version from '../../../version.js';
import * as constants from '../../../src/core/constants.js';
import {ConfigManager} from '../../../src/core/config_manager.js';
import {SoloLogger} from '../../../src/core/logging.js';
import {ChartManager} from '../../../src/core/chart_manager.js';
import {Helm} from '../../../src/core/helm.js';
import {ROOT_DIR, SOLO_HOME_DIR, SOLO_TESTING_CHART, SOLO_TESTING_CHART_URL} from '../../../src/core/constants.js';
import path from 'path';
import {NetworkCommand} from '../../../src/commands/network.js';
import {LeaseManager} from "../../../src/core/lease/lease_manager.js";
import {IntervalLeaseRenewalService} from "../../../src/core/lease/interval_lease_renewal.js";
import chalk from "chalk";
import {RemoteConfigValidator} from "../../../src/core/config/remote/remote_config_validator.js";
import {RemoteConfigManager} from "../../../src/core/config/remote/remote_config_manager.js";
import {LocalConfig} from "../../../src/core/config/local_config.js";
import * as k8s from "@kubernetes/client-node";

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
      // opts = getBaseCommandOpts();
      // opts.logger = new SoloLogger();
      // opts.helm = new Helm(opts.logger);
      // opts.helm.dependency = sinon.stub();
      // opts.k8 = sinon.stub();
      // opts.k8.readNamespacedLease = sinon.stub().returns(k8s.V1Lease);
      // opts.chartManager = sinon.stub();
      // opts.keyManager = sinon.stub();
      // opts.platformInstaller = sinon.stub();
      // opts.profileManager = sinon.stub();
      // opts.certificateManager = sinon.stub();
      //
      // opts.chartManager = new ChartManager(opts.helm, opts.logger);
      // opts.chartManager.isChartInstalled = sinon.stub().returns(false);
      // opts.chartManager.install = sinon.stub().returns(true);
      // const localConfig = new LocalConfig(path.join(BASE_TEST_DIR, 'local-config.yaml'), opts.logger, opts.configManager);
      // opts.remoteConfigManager = new RemoteConfigManager(opts.k8, opts.logger, localConfig, opts.configManager);
      //
      // // opts.remoteConfigManager.buildLoadTask = sinon.stub().returns({
      // //   title: 'Load remote config',
      // //   task: async (_, task): Promise<void> => {
      // //     task.output = 'Remote config loaded';
      // //   },
      // // });
      //
      // opts.configManager = new ConfigManager(opts.logger);
      // opts.leaseManager = new LeaseManager(opts.k8, opts.configManager, opts.logger, new IntervalLeaseRenewalService());
      // opts.leaseManager.currentNamespace = sinon.stub().returns(testName);
      // opts.depManager = sinon.stub();
      // opts.localConfig = sinon.stub();
      // // opts.remoteConfigManager = sinon.stub();
    });

    it('Install function is called with expected parameters', async () => {
      const networkCommand = bootstrapResp.cmd.networkCmd;
      await networkCommand.deploy(argv);
      expect(opts.chartManager.install.args[0][0]).to.equal(constants.SOLO_SETUP_NAMESPACE);
      expect(opts.chartManager.install.args[0][1]).to.equal(constants.SOLO_CLUSTER_SETUP_CHART);
      expect(opts.chartManager.install.args[0][2]).to.equal(
        path.join(constants.SOLO_TESTING_CHART, constants.SOLO_CLUSTER_SETUP_CHART),
      );
      expect(opts.chartManager.install.args[0][3]).to.equal(version.SOLO_CHART_VERSION);
    });

    // it('Should use local chart directory', async () => {
    //   argv[flags.chartDirectory.name] = 'test-directory';
    //   argv[flags.force.name] = true;
    //
    //   const networkCommand = new NetworkCommand(opts);
    //   await networkCommand.deploy(argv);
    //   expect(opts.chartManager.install.args[0][0]).to.equal(constants.SOLO_SETUP_NAMESPACE);
    //   expect(opts.chartManager.install.args[0][1]).to.equal(constants.SOLO_CLUSTER_SETUP_CHART);
    //   expect(opts.chartManager.install.args[0][2]).to.equal(
    //     path.join(ROOT_DIR, 'test-directory', constants.SOLO_CLUSTER_SETUP_CHART),
    //   );
    //   expect(opts.chartManager.install.args[0][3]).to.equal(version.SOLO_CHART_VERSION);
    // });
  });
});
