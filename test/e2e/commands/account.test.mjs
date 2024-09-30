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
 * @jest-environment steps
 */

import { AccountId, PrivateKey } from '@hashgraph/sdk'
import {
  afterAll,
  beforeAll,
  describe,
  expect,
  it
} from '@jest/globals'
import {
  constants
} from '../../../src/core/index.mjs'
import * as version from '../../../version.mjs'
import {
  bootstrapNetwork,
  getDefaultArgv,
  HEDERA_PLATFORM_VERSION_TAG,
  TEST_CLUSTER,
  testLogger
} from '../../test_util.js'
import { AccountCommand } from '../../../src/commands/account.mjs'
import { flags } from '../../../src/commands/index.mjs'
import { getNodeLogs } from '../../../src/core/helpers.mjs'

describe('AccountCommand', () => {
  const testName = 'account-cmd-e2e'
  const namespace = testName
  const defaultTimeout = 20000
  const testSystemAccounts = [[3, 5]]
  const argv = getDefaultArgv()
  argv[flags.namespace.name] = namespace
  argv[flags.releaseTag.name] = HEDERA_PLATFORM_VERSION_TAG
  argv[flags.nodeIDs.name] = 'node1'
  argv[flags.generateGossipKeys.name] = true
  argv[flags.generateTlsKeys.name] = true
  argv[flags.clusterName.name] = TEST_CLUSTER
  argv[flags.fstChartVersion.name] = version.FST_CHART_VERSION
  // set the env variable SOLO_FST_CHARTS_DIR if developer wants to use local FST charts
  argv[flags.chartDirectory.name] = process.env.SOLO_FST_CHARTS_DIR ? process.env.SOLO_FST_CHARTS_DIR : undefined
  const bootstrapResp = bootstrapNetwork(testName, argv)
  const accountCmd = new AccountCommand(bootstrapResp.opts, testSystemAccounts)
  bootstrapResp.cmd.accountCmd = accountCmd
  const k8 = bootstrapResp.opts.k8
  const accountManager = bootstrapResp.opts.accountManager
  const configManager = bootstrapResp.opts.configManager
  const nodeCmd = bootstrapResp.cmd.nodeCmd

  afterAll(async () => {
    await getNodeLogs(k8, namespace)
    await k8.deleteNamespace(namespace)
    await accountManager.close()
    await nodeCmd.close()
  }, 180000)

  describe('node proxies should be UP', () => {
    for (const nodeId of argv[flags.nodeIDs.name].split(',')) {
      it(`proxy should be UP: ${nodeId} `, async () => {
        await k8.waitForPodReady(
          [`app=haproxy-${nodeId}`, 'fullstack.hedera.com/type=haproxy'],
          1, 300, 2000)
      }, 30000)
    }
  })

  describe('account init command', () => {
    it('should succeed with init command', async () => {
      const status = await accountCmd.init(argv)
      expect(status).toBeTruthy()
    }, 180000)

    describe('special accounts should have new keys', () => {
      const genesisKey = PrivateKey.fromStringED25519(constants.GENESIS_KEY)
      const realm = constants.HEDERA_NODE_ACCOUNT_ID_START.realm
      const shard = constants.HEDERA_NODE_ACCOUNT_ID_START.shard

      beforeAll(async () => {
        await accountManager.loadNodeClient(namespace)
      }, 20000)

      afterAll(async () => {
        await accountManager.close()
      }, 20000)

      for (const [start, end] of testSystemAccounts) {
        for (let i = start; i <= end; i++) {
          it(`account ${i} should not have genesis key`, async () => {
            expect(accountManager._nodeClient).not.toBeNull()
            const accountId = `${realm}.${shard}.${i}`
            nodeCmd.logger.info(`Fetching account keys: accountId ${accountId}`)
            const keys = await accountManager.getAccountKeys(accountId)
            nodeCmd.logger.info(`Fetched account keys: accountId ${accountId}`)
            expect(keys.length).not.toEqual(0)
            expect(keys[0].toString()).not.toEqual(genesisKey.toString())
          }, 20000)
        }
      }
    })
  })

  describe('account create/update command', () => {
    let accountId1, accountId2

    it('should create account with no options', async () => {
      try {
        argv[flags.amount.name] = 200
        await expect(accountCmd.create(argv)).resolves.toBeTruthy()
        const accountInfo = accountCmd.accountInfo
        expect(accountInfo).not.toBeNull()
        expect(accountInfo.accountId).not.toBeNull()
        accountId1 = accountInfo.accountId
        expect(accountInfo.privateKey).not.toBeNull()
        expect(accountInfo.publicKey).not.toBeNull()
        expect(accountInfo.balance).toEqual(configManager.getFlag(flags.amount))
      } catch (e) {
        testLogger.showUserError(e)
        expect(e).toBeNull()
      }
    }, 40000)

    it('should create account with private key and hbar amount options', async () => {
      try {
        argv[flags.privateKey.name] = constants.GENESIS_KEY
        argv[flags.amount.name] = 777
        configManager.update(argv, true)

        await expect(accountCmd.create(argv)).resolves.toBeTruthy()

        const accountInfo = accountCmd.accountInfo
        expect(accountInfo).not.toBeNull()
        expect(accountInfo.accountId).not.toBeNull()
        accountId2 = accountInfo.accountId
        expect(accountInfo.privateKey.toString()).toEqual(constants.GENESIS_KEY)
        expect(accountInfo.publicKey).not.toBeNull()
        expect(accountInfo.balance).toEqual(configManager.getFlag(flags.amount))
      } catch (e) {
        testLogger.showUserError(e)
        expect(e).toBeNull()
      }
    }, defaultTimeout)

    it('should update account-1', async () => {
      try {
        argv[flags.amount.name] = 0
        argv[flags.accountId.name] = accountId1
        configManager.update(argv, true)

        await expect(accountCmd.update(argv)).resolves.toBeTruthy()

        const accountInfo = accountCmd.accountInfo
        expect(accountInfo).not.toBeNull()
        expect(accountInfo.accountId).toEqual(argv[flags.accountId.name])
        expect(accountInfo.privateKey).toBeUndefined()
        expect(accountInfo.publicKey).not.toBeNull()
        expect(accountInfo.balance).toEqual(200)
      } catch (e) {
        testLogger.showUserError(e)
        expect(e).toBeNull()
      }
    }, defaultTimeout)

    it('should update account-2 with accountId, amount, new private key, and standard out options', async () => {
      try {
        argv[flags.accountId.name] = accountId2
        argv[flags.privateKey.name] = constants.GENESIS_KEY
        argv[flags.amount.name] = 333
        configManager.update(argv, true)

        await expect(accountCmd.update(argv)).resolves.toBeTruthy()

        const accountInfo = accountCmd.accountInfo
        expect(accountInfo).not.toBeNull()
        expect(accountInfo.accountId).toEqual(argv[flags.accountId.name])
        expect(accountInfo.privateKey).toBeUndefined()
        expect(accountInfo.publicKey).not.toBeNull()
        expect(accountInfo.balance).toEqual(1110)
      } catch (e) {
        testLogger.showUserError(e)
        expect(e).toBeNull()
      }
    }, defaultTimeout)

    it('should be able to get account-1', async () => {
      try {
        argv[flags.accountId.name] = accountId1
        configManager.update(argv, true)

        await expect(accountCmd.get(argv)).resolves.toBeTruthy()
        const accountInfo = accountCmd.accountInfo
        expect(accountInfo).not.toBeNull()
        expect(accountInfo.accountId).toEqual(argv[flags.accountId.name])
        expect(accountInfo.privateKey).toBeUndefined()
        expect(accountInfo.publicKey).toBeTruthy()
        expect(accountInfo.balance).toEqual(200)
      } catch (e) {
        testLogger.showUserError(e)
        expect(e).toBeNull()
      }
    }, defaultTimeout)

    it('should be able to get account-2', async () => {
      try {
        argv[flags.accountId.name] = accountId2
        configManager.update(argv, true)

        await expect(accountCmd.get(argv)).resolves.toBeTruthy()
        const accountInfo = accountCmd.accountInfo
        expect(accountInfo).not.toBeNull()
        expect(accountInfo.accountId).toEqual(argv[flags.accountId.name])
        expect(accountInfo.privateKey).toBeUndefined()
        expect(accountInfo.publicKey).toBeTruthy()
        expect(accountInfo.balance).toEqual(1110)
      } catch (e) {
        testLogger.showUserError(e)
        expect(e).toBeNull()
      }
    }, defaultTimeout)

    it('should create account with ecdsa private key and set alias', async () => {
      const ecdsaPrivateKey = PrivateKey.generateECDSA()

      try {
        argv[flags.ecdsaPrivateKey.name] = ecdsaPrivateKey.toString()
        argv[flags.setAlias.name] = true
        configManager.update(argv, true)

        await expect(accountCmd.create(argv)).resolves.toBeTruthy()

        const newAccountInfo = accountCmd.accountInfo
        expect(newAccountInfo).not.toBeNull()
        expect(newAccountInfo.accountId).not.toBeNull()
        expect(newAccountInfo.privateKey.toString()).toEqual(ecdsaPrivateKey.toString())
        expect(newAccountInfo.publicKey.toString()).toEqual(ecdsaPrivateKey.publicKey.toString())
        expect(newAccountInfo.balance).toBeGreaterThan(0)

        const accountId = AccountId.fromString(newAccountInfo.accountId)
        expect(newAccountInfo.accountAlias).toEqual(`${accountId.realm}.${accountId.shard}.${ecdsaPrivateKey.publicKey.toEvmAddress()}`)

        await accountManager.loadNodeClient(namespace)
        const accountAliasInfo = await accountManager.accountInfoQuery(newAccountInfo.accountAlias)
        expect(accountAliasInfo).not.toBeNull()
      } catch (e) {
        testLogger.showUserError(e)
        expect(e).toBeNull()
      }
    }, defaultTimeout)
  })
})
