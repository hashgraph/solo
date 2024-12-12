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
import {it, describe, after, before} from 'mocha';
import {expect} from 'chai';

import {bootstrapTestVariables, getDefaultArgv, getTmpDir, HEDERA_PLATFORM_VERSION_TAG} from '../../test_util.js';
import * as constants from '../../../src/core/constants.js';
import * as version from '../../../version.js';
import {sleep} from '../../../src/core/helpers.js';
import path from 'path';
import fs from 'fs';
import {NetworkCommand} from '../../../src/commands/network.js';
import {Flags as flags} from '../../../src/commands/flags.js';
import {Duration} from '../../../src/core/time/duration.js';

describe('NetworkCommand', () => {
  const testName = 'network-cmd-e2e';
  const namespace = testName;
  const applicationEnvFileContents = '# row 1\n# row 2\n# row 3';
  const applicationEnvParentDirectory = path.join(getTmpDir(), 'network-command-test');
  const applicationEnvFilePath = path.join(applicationEnvParentDirectory, 'application.env');
  const argv = getDefaultArgv();
  argv[flags.namespace.name] = namespace;
  argv[flags.releaseTag.name] = HEDERA_PLATFORM_VERSION_TAG;
  argv[flags.nodeAliasesUnparsed.name] = 'node1';
  argv[flags.generateGossipKeys.name] = true;
  argv[flags.generateTlsKeys.name] = true;
  argv[flags.deployMinio.name] = true;
  argv[flags.soloChartVersion.name] = version.SOLO_CHART_VERSION;
  argv[flags.force.name] = true;
  argv[flags.applicationEnv.name] = applicationEnvFilePath;
  // set the env variable SOLO_CHARTS_DIR if developer wants to use local Solo charts
  argv[flags.chartDirectory.name] = process.env.SOLO_CHARTS_DIR ?? undefined;
  argv[flags.quiet.name] = true;

  const bootstrapResp = bootstrapTestVariables(testName, argv);
  const k8 = bootstrapResp.opts.k8;
  const accountManager = bootstrapResp.opts.accountManager;
  const configManager = bootstrapResp.opts.configManager;

  const networkCmd = bootstrapResp.cmd.networkCmd;
  const clusterCmd = bootstrapResp.cmd.clusterCmd;
  const initCmd = bootstrapResp.cmd.initCmd;
  const nodeCmd = bootstrapResp.cmd.nodeCmd;

  after(async function () {
    this.timeout(Duration.ofMinutes(3).toMillis());

    await k8.getNodeLogs(namespace);
    await k8.deleteNamespace(namespace);
    await accountManager.close();
  });

  before(async () => {
    await initCmd.init(argv);
    await clusterCmd.setup(argv);
    fs.mkdirSync(applicationEnvParentDirectory, {recursive: true});
    fs.writeFileSync(applicationEnvFilePath, applicationEnvFileContents);
  });

  it('keys should be generated', async () => {
    expect(await nodeCmd.handlers.keys(argv)).to.be.true;
  });

  it('network deploy command should succeed', async () => {
    try {
      expect(await networkCmd.deploy(argv)).to.be.true;

      // check pod names should match expected values
      await expect(k8.getPodByName('network-node1-0')).eventually.to.have.nested.property(
        'metadata.name',
        'network-node1-0',
      );
      // get list of pvc using k8 listPvcsByNamespace function and print to log
      const pvcs = await k8.listPvcsByNamespace(namespace);
      networkCmd.logger.showList('PVCs', pvcs);

      expect(networkCmd.getUnusedConfigs(NetworkCommand.DEPLOY_CONFIGS_NAME)).to.deep.equal([
        flags.apiPermissionProperties.constName,
        flags.applicationEnv.constName,
        flags.applicationProperties.constName,
        flags.bootstrapProperties.constName,
        flags.chainId.constName,
        flags.log4j2Xml.constName,
        flags.profileFile.constName,
        flags.profileName.constName,
        flags.quiet.constName,
        flags.settingTxt.constName,
        flags.grpcTlsKeyPath.constName,
        flags.grpcWebTlsKeyPath.constName,
      ]);
    } catch (e) {
      networkCmd.logger.showUserError(e);
      expect.fail();
    }
  }).timeout(Duration.ofMinutes(4).toMillis());

  it('application env file contents should be in cached values file', () => {
    // @ts-ignore in order to access the private property
    const valuesYaml = fs.readFileSync(networkCmd.profileValuesFile).toString();
    const fileRows = applicationEnvFileContents.split('\n');
    for (const fileRow of fileRows) {
      expect(valuesYaml).to.contain(fileRow);
    }
  });

  it('network destroy should success', async () => {
    argv[flags.deletePvcs.name] = true;
    argv[flags.deleteSecrets.name] = true;
    argv[flags.force.name] = true;
    configManager.update(argv);

    try {
      const destroyResult = await networkCmd.destroy(argv);
      expect(destroyResult).to.be.true;

      while ((await k8.getPodsByLabel(['solo.hedera.com/type=network-node'])).length > 0) {
        networkCmd.logger.debug('Pods are still running. Waiting...');
        await sleep(Duration.ofSeconds(3));
      }

      while ((await k8.getPodsByLabel(['app=minio'])).length > 0) {
        networkCmd.logger.showUser('Waiting for minio container to be deleted...');
        await sleep(Duration.ofSeconds(3));
      }

      // check if chart is uninstalled
      const chartInstalledStatus = await bootstrapResp.opts.chartManager.isChartInstalled(
        namespace,
        constants.SOLO_DEPLOYMENT_CHART,
      );
      expect(chartInstalledStatus).to.be.false;

      // check if pvc are deleted
      await expect(k8.listPvcsByNamespace(namespace)).eventually.to.have.lengthOf(0);

      // check if secrets are deleted
      await expect(k8.listSecretsByNamespace(namespace)).eventually.to.have.lengthOf(0);
    } catch (e) {
      networkCmd.logger.showUserError(e);
      expect.fail();
    }
  }).timeout(Duration.ofMinutes(2).toMillis());
});
