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
import {it, describe, after} from 'mocha';
import {expect} from 'chai';

import {Flags as flags} from '../../../src/commands/flags.js';
import {e2eTestSuite, getDefaultArgv, HEDERA_PLATFORM_VERSION_TAG} from '../../test_util.js';
import {
  PREPARE_UPGRADE_CONFIGS_NAME,
  DOWNLOAD_GENERATED_FILES_CONFIGS_NAME,
} from '../../../src/commands/node/configs.js';
import {MINUTES} from '../../../src/core/constants.js';

const namespace = 'node-upgrade';
const argv = getDefaultArgv();
argv[flags.nodeAliasesUnparsed.name] = 'node1,node2,node3';
argv[flags.generateGossipKeys.name] = true;
argv[flags.generateTlsKeys.name] = true;
argv[flags.persistentVolumeClaims.name] = true;
// set the env variable SOLO_CHARTS_DIR if developer wants to use local solo charts
argv[flags.chartDirectory.name] = process.env.SOLO_CHARTS_DIR ? process.env.SOLO_CHARTS_DIR : undefined;
argv[flags.releaseTag.name] = HEDERA_PLATFORM_VERSION_TAG;
argv[flags.namespace.name] = namespace;

const upgradeArgv = getDefaultArgv();

e2eTestSuite(namespace, argv, undefined, undefined, undefined, undefined, undefined, undefined, true, bootstrapResp => {
  describe('Node upgrade', async () => {
    const nodeCmd = bootstrapResp.cmd.nodeCmd;
    const accountCmd = bootstrapResp.cmd.accountCmd;
    const k8 = bootstrapResp.opts.k8;

    after(async function () {
      this.timeout(10 * MINUTES);

      await k8.getNodeLogs(namespace);
      await k8.deleteNamespace(namespace);
    });

    it('should succeed with init command', async () => {
      const status = await accountCmd.init(argv);
      expect(status).to.be.ok;
    }).timeout(8 * MINUTES);

    it('should prepare network upgrade successfully', async () => {
      await nodeCmd.handlers.prepareUpgrade(upgradeArgv);
      expect(nodeCmd.getUnusedConfigs(PREPARE_UPGRADE_CONFIGS_NAME)).to.deep.equal([flags.devMode.constName]);
    }).timeout(5 * MINUTES);

    it('should download generated files successfully', async () => {
      await nodeCmd.handlers.downloadGeneratedFiles(upgradeArgv);
      expect(nodeCmd.getUnusedConfigs(DOWNLOAD_GENERATED_FILES_CONFIGS_NAME)).to.deep.equal([
        flags.devMode.constName,
        'allNodeAliases',
      ]);
    }).timeout(5 * MINUTES);

    it('should upgrade all nodes on the network successfully', async () => {
      await nodeCmd.handlers.freezeUpgrade(upgradeArgv);
      expect(nodeCmd.getUnusedConfigs(PREPARE_UPGRADE_CONFIGS_NAME)).to.deep.equal([flags.devMode.constName]);

      await bootstrapResp.opts.accountManager.close();
    }).timeout(5 * MINUTES);
  });
});
