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
import { flags } from '../../../src/commands/index.mjs'
import {
  bootstrapNetwork,
  getDefaultArgv,
  HEDERA_PLATFORM_VERSION_TAG,
  TEST_CLUSTER
} from '../../test_util.js'
import * as version from '../../../version.mjs'
import { getNodeLogs, sleep } from '../../../src/core/helpers.mjs'
import { RelayCommand } from '../../../src/commands/relay.mjs'
import { MINUTES } from '../../../src/core/constants.mjs'

describe('RelayCommand', () => {
  const testName = 'relay-cmd-e2e'
  const namespace = testName

  const argv = getDefaultArgv()
  argv[flags.namespace.name] = namespace
  argv[flags.releaseTag.name] = HEDERA_PLATFORM_VERSION_TAG
  argv[flags.nodeAliasesUnparsed.name] = 'node1,node2'
  argv[flags.generateGossipKeys.name] = true
  argv[flags.generateTlsKeys.name] = true
  argv[flags.clusterName.name] = TEST_CLUSTER
  argv[flags.fstChartVersion.name] = version.FST_CHART_VERSION
  argv[flags.force.name] = true
  argv[flags.relayReleaseTag.name] = flags.relayReleaseTag.definition.defaultValue
  argv[flags.quiet.name] = true

  const bootstrapResp = bootstrapNetwork(testName, argv)
  const k8 = bootstrapResp.opts.k8
  const configManager = bootstrapResp.opts.configManager
  const relayCmd = new RelayCommand(bootstrapResp.opts)

  after(async function () {
    this.timeout(3 * MINUTES)

    await getNodeLogs(k8, namespace)
    await k8.deleteNamespace(namespace)
  })

  afterEach(async () => await sleep(5))

  const relayNodesTests = ['node1', 'node1,node2']

  relayNodesTests.forEach((relayNodes) => {
    it(`relay deploy and destroy should work with ${relayNodes}`, async () => {
      argv[flags.nodeAliasesUnparsed.name] = relayNodes
      configManager.update(argv)

      // test relay deploy
      try {
        await expect(relayCmd.deploy(argv)).to.eventually.be.ok
      } catch (e) {
        relayCmd.logger.showUserError(e)
        expect(e).to.be.null
      }
      expect(relayCmd.getUnusedConfigs(RelayCommand.DEPLOY_CONFIGS_NAME)).to.deep.equal([
        flags.profileFile.constName,
        flags.profileName.constName,
        flags.quiet.constName
      ])
      await sleep(500)

      // test relay destroy
      try {
        await expect(relayCmd.destroy(argv)).to.eventually.be.ok
      } catch (e) {
        relayCmd.logger.showUserError(e)
        expect(e).to.be.null
      }
    }).timeout(5 * MINUTES)
  })
})
