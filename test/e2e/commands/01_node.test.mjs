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
import {
  AccountBalanceQuery,
  AccountCreateTransaction,
  Hbar,
  PrivateKey
} from '@hashgraph/sdk'
import {
  afterAll,
  afterEach, beforeAll,
  describe,
  expect,
  it
} from '@jest/globals'
import path from 'path'
import { flags } from '../../../src/commands/index.mjs'
import { NodeCommand } from '../../../src/commands/node.mjs'
import { DependencyManager, HelmDependencyManager } from '../../../src/core/dependency_managers/index.mjs'
import {
  ChartManager,
  ConfigManager,
  Helm,
  K8,
  PackageDownloader,
  PlatformInstaller,
  constants,
  KeyManager, Zippy
} from '../../../src/core/index.mjs'
import { ShellRunner } from '../../../src/core/shell_runner.mjs'
import { getTestCacheDir, testLogger } from '../../test_util.js'
import { AccountManager } from '../../../src/core/account_manager.mjs'
import { sleep } from '../../../src/core/helpers.mjs'

describe.each([
  ['v0.42.5', constants.KEY_FORMAT_PFX]
  // ['v0.47.0-alpha.0', constants.KEY_FORMAT_PFX],
  // ['v0.47.0-alpha.0', constants.KEY_FORMAT_PEM]
])('NodeCommand', (testRelease, testKeyFormat) => {
  const helm = new Helm(testLogger)
  const chartManager = new ChartManager(helm, testLogger)
  const configManager = new ConfigManager(testLogger, path.join(getTestCacheDir(), 'solo.config'))

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

  const nodeCmd = new NodeCommand({
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
  })

  const cacheDir = getTestCacheDir()

  describe(`node start should succeed [release ${testRelease}, keyFormat: ${testKeyFormat}]`, () => {
    const argv = {}
    argv[flags.releaseTag.name] = testRelease
    argv[flags.keyFormat.name] = testKeyFormat
    argv[flags.nodeIDs.name] = 'node0,node1,node2'
    argv[flags.cacheDir.name] = cacheDir
    argv[flags.force.name] = false
    argv[flags.chainId.name] = constants.HEDERA_CHAIN_ID
    argv[flags.generateGossipKeys.name] = false
    argv[flags.generateTlsKeys.name] = true
    argv[flags.applicationProperties.name] = flags.applicationProperties.definition.defaultValue
    argv[flags.apiPermissionProperties.name] = flags.apiPermissionProperties.definition.defaultValue
    argv[flags.bootstrapProperties.name] = flags.bootstrapProperties.definition.defaultValue
    argv[flags.settingTxt.name] = flags.settingTxt.definition.defaultValue
    argv[flags.log4j2Xml.name] = flags.log4j2Xml.definition.defaultValue
    argv[flags.namespace.name] = 'solo-e2e'
    argv[flags.clusterName.name] = 'kind-solo-e2e'
    argv[flags.clusterSetupNamespace.name] = 'solo-e2e-cluster'
    argv[flags.updateAccountKeys.name] = true
    argv[flags.fstChartVersion.name] = flags.fstChartVersion.definition.defaultValue
    argv[flags.deployHederaExplorer.name] = true
    argv[flags.deployMirrorNode.name] = true
    configManager.update(argv)
    const nodeIds = argv[flags.nodeIDs.name].split(',')

    afterEach(async () => {
      await sleep(5) // give a few ticks so that connections can close
    })

    it('should pre-generate keys', async () => {
      if (argv[flags.keyFormat.name] === constants.KEY_FORMAT_PFX) {
        const shellRunner = new ShellRunner(testLogger)
        await shellRunner.run(`resources/scripts/gen-legacy-keys.sh ${nodeIds.join(',')} ${path.join(cacheDir, 'keys')}`)
      }
    }, 60000)

    it('node setup should succeed', async () => {
      expect.assertions(1)
      try {
        await expect(nodeCmd.setup(argv)).resolves.toBeTruthy()
      } catch (e) {
        nodeCmd.logger.showUserError(e)
        expect(e).toBeNull()
      }
    }, 60000)

    it('node start should succeed', async () => {
      expect.assertions(1)
      try {
        await expect(nodeCmd.start(argv)).resolves.toBeTruthy()
      } catch (e) {
        nodeCmd.logger.showUserError(e)
        expect(e).toBeNull()
      }
    }, 600000)

    describe('only genesis account should have genesis key for all special accounts', () => {
      const genesisKey = PrivateKey.fromStringED25519(constants.GENESIS_KEY)
      const realm = constants.HEDERA_NODE_ACCOUNT_ID_START.realm
      const shard = constants.HEDERA_NODE_ACCOUNT_ID_START.shard

      beforeAll(async () => {
        await accountManager.loadNodeClient(argv[flags.namespace.name])
      })

      afterAll(async () => {
        await accountManager.close()
        await sleep(5000) // sometimes takes a while to close all sockets
      }, 10000)

      for (const [start, end] of constants.SYSTEM_ACCOUNTS) {
        for (let i = start; i <= end; i++) {
          it(`special account ${i} should not have genesis key`, async () => {
            expect(accountManager._nodeClient).not.toBeNull()

            const accountId = `${realm}.${shard}.${i}`
            nodeCmd.logger.info(`getAccountKeys: accountId ${accountId}`)
            const keys = await accountManager.getAccountKeys(accountId)

            expect(keys[0].toString()).not.toEqual(genesisKey.toString())
          }, 60000)
        }
      }
    })

    describe('use the node client to interact with the Hedera network', () => {
      beforeAll(async () => {
        await accountManager.loadNodeClient(argv[flags.namespace.name])
      })

      afterAll(async () => {
        await accountManager.close()
        await sleep(5000) // sometimes takes a while to close all sockets
      }, 10000)

      it('balance query should succeed', async () => {
        expect.assertions(2)

        try {
          expect(accountManager._nodeClient).not.toBeNull()

          const balance = await new AccountBalanceQuery()
            .setAccountId(accountManager._nodeClient.getOperator().accountId)
            .execute(accountManager._nodeClient)

          expect(balance.hbars).not.toBeNull()
        } catch (e) {
          nodeCmd.logger.showUserError(e)
          expect(e).toBeNull()
        }
      }, 20000)

      it('account creation should succeed', async () => {
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

    it('checkNetworkNodeProxyUp should succeed', async () => {
      expect.assertions(1)
      try {
        await expect(nodeCmd.checkNetworkNodeProxyUp('solo-e2e', 'node0')).resolves.toBeTruthy()
      } catch (e) {
        nodeCmd.logger.showUserError(e)
        expect(e).toBeNull()
      }
    }, 20000)
  })
})
