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
import { AccountBalanceQuery, AccountCreateTransaction, Hbar, PrivateKey } from '@hashgraph/sdk'
import {
  afterAll,
  beforeAll,
  describe,
  expect,
  it
} from '@jest/globals'
import { ClusterCommand } from '../../../src/commands/cluster.mjs'
import { flags } from '../../../src/commands/index.mjs'
import { InitCommand } from '../../../src/commands/init.mjs'
import { NetworkCommand } from '../../../src/commands/network.mjs'
import { NodeCommand } from '../../../src/commands/node.mjs'
import { DependencyManager, HelmDependencyManager } from '../../../src/core/dependency_managers/index.mjs'
import {
  ChartManager,
  Helm,
  K8,
  PackageDownloader,
  PlatformInstaller,
  constants,
  KeyManager, Zippy
} from '../../../src/core/index.mjs'
import {
  bootstrapNetwork,
  getDefaultArgv,
  getTestCacheDir,
  getTestConfigManager,
  TEST_CLUSTER,
  testLogger
} from '../../test_util.js'
import { AccountManager } from '../../../src/core/account_manager.mjs'

describe.each([
  ['v0.42.5', constants.KEY_FORMAT_PFX]
  // ['v0.47.0-alpha.0', constants.KEY_FORMAT_PFX],
  // ['v0.47.0-alpha.0', constants.KEY_FORMAT_PEM]
])('NodeCommand', (testRelease, testKeyFormat) => {
  const testName = 'node-cmd-e2e'
  const namespace = testName
  const helm = new Helm(testLogger)
  const chartManager = new ChartManager(helm, testLogger)
  const configManager = getTestConfigManager(`${testName}-solo.config`)
  const cacheDir = getTestCacheDir(testName)

  // set argv with defaults
  const argv = getDefaultArgv()
  argv[flags.releaseTag.name] = testRelease
  argv[flags.keyFormat.name] = testKeyFormat
  argv[flags.nodeIDs.name] = 'node0,node1,node2'
  argv[flags.cacheDir.name] = cacheDir
  argv[flags.generateGossipKeys.name] = false
  argv[flags.generateTlsKeys.name] = true
  argv[flags.clusterName.name] = TEST_CLUSTER
  argv[flags.namespace.name] = namespace
  argv[flags.fstChartVersion.name] = 'v0.22.0'

  // prepare dependency manger registry
  const downloader = new PackageDownloader(testLogger)
  const zippy = new Zippy(testLogger)
  const helmDepManager = new HelmDependencyManager(downloader, zippy, testLogger)
  const depManagerMap = new Map().set(constants.HELM, helmDepManager)
  const depManager = new DependencyManager(testLogger, depManagerMap)

  const k8 = new K8(configManager, testLogger)
  const platformInstaller = new PlatformInstaller(testLogger, k8)
  const keyManager = new KeyManager(testLogger)
  const accountManager = new AccountManager(testLogger, k8, constants)

  const opts = {
    logger: testLogger,
    helm,
    k8,
    chartManager,
    configManager,
    downloader,
    platformInstaller,
    depManager,
    keyManager,
    accountManager
  }
  const nodeCmd = new NodeCommand(opts)
  const initCmd = new InitCommand(opts)
  const clusterCmd = new ClusterCommand(opts)
  const networkCmd = new NetworkCommand(opts)

  beforeAll(async () => {
    configManager.update(argv)
  })

  afterAll(async () => {
    await k8.deleteNamespace(namespace)
    await accountManager.close()
  })

  describe(`Node should start successfully [release ${testRelease}, keyFormat: ${testKeyFormat}]`, () => {
    bootstrapNetwork(argv, namespace, k8, initCmd, clusterCmd, networkCmd, nodeCmd)

    it('Balance query should succeed', async () => {
      expect.assertions(2)

      try {
        await accountManager.loadNodeClient(namespace)
        expect(accountManager._nodeClient).not.toBeNull()

        const balance = await new AccountBalanceQuery()
          .setAccountId(accountManager._nodeClient.getOperator().accountId)
          .execute(accountManager._nodeClient)

        expect(balance.hbars).not.toBeNull()
      } catch (e) {
        nodeCmd.logger.showUserError(e)
        expect(e).toBeNull()
      }
    }, 120000)

    it('Account creation should succeed', async () => {
      expect.assertions(2)

      try {
        expect(accountManager._nodeClient).not.toBeNull()
        const accountKey = PrivateKey.generate()

        let transaction = await new AccountCreateTransaction()
          .setNodeAccountIds([constants.HEDERA_NODE_ACCOUNT_ID_START])
          .setInitialBalance(new Hbar(0))
          .setKey(accountKey.publicKey)
          .freezeWith(accountManager._nodeClient)

        transaction = await transaction.sign(accountKey)
        const response = await transaction.execute(accountManager._nodeClient)
        const receipt = await response.getReceipt(accountManager._nodeClient)

        expect(receipt.accountId).not.toBeNull()
      } catch (e) {
        nodeCmd.logger.showUserError(e)
        expect(e).toBeNull()
      }
    }, 20000)
  })
})
