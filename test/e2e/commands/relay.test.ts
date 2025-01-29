/**
 * Copyright (C) 2025 Hedera Hashgraph, LLC
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
import {after, afterEach, describe} from 'mocha';
import {expect} from 'chai';
import each from 'mocha-each';

import {Flags as flags} from '../../../src/commands/flags.js';
import {e2eTestSuite, getDefaultArgv, HEDERA_PLATFORM_VERSION_TAG, TEST_CLUSTER} from '../../test_util.js';
import * as version from '../../../version.js';
import {sleep} from '../../../src/core/helpers.js';
import {RelayCommand} from '../../../src/commands/relay.js';
import {Duration} from '../../../src/core/time/duration.js';

const testName = 'relay-cmd-e2e';
const namespace = testName;
const argv = getDefaultArgv();
argv[flags.namespace.name] = namespace;
argv[flags.releaseTag.name] = HEDERA_PLATFORM_VERSION_TAG;
argv[flags.nodeAliasesUnparsed.name] = 'node1,node2';
argv[flags.generateGossipKeys.name] = true;
argv[flags.generateTlsKeys.name] = true;
argv[flags.clusterName.name] = TEST_CLUSTER;
argv[flags.soloChartVersion.name] = version.SOLO_CHART_VERSION;
argv[flags.force.name] = true;
argv[flags.relayReleaseTag.name] = flags.relayReleaseTag.definition.defaultValue;
argv[flags.quiet.name] = true;

e2eTestSuite(testName, argv, undefined, undefined, undefined, undefined, undefined, undefined, true, bootstrapResp => {
  describe('RelayCommand', async () => {
    const k8 = bootstrapResp.opts.k8;
    const configManager = bootstrapResp.opts.configManager;
    const relayCmd = new RelayCommand(bootstrapResp.opts);

    after(async () => {
      await k8.getNodeLogs(namespace);
      await k8.deleteNamespace(namespace);
    });

    afterEach(async () => await sleep(Duration.ofMillis(5)));

    each(['node1', 'node1,node2']).it('relay deploy and destroy should work with $value', async function (relayNodes) {
      this.timeout(Duration.ofMinutes(5).toMillis());

      argv[flags.nodeAliasesUnparsed.name] = relayNodes;
      configManager.update(argv);

      // test relay deploy
      try {
        expect(await relayCmd.deploy(argv)).to.be.true;
      } catch (e) {
        relayCmd.logger.showUserError(e);
        expect.fail();
      }
      expect(relayCmd.getUnusedConfigs(RelayCommand.DEPLOY_CONFIGS_NAME)).to.deep.equal([
        flags.profileFile.constName,
        flags.profileName.constName,
        flags.quiet.constName,
      ]);
      await sleep(Duration.ofMillis(500));

      // test relay destroy
      try {
        expect(await relayCmd.destroy(argv)).to.be.true;
      } catch (e) {
        relayCmd.logger.showUserError(e);
        expect.fail();
      }
    });
  });
});
