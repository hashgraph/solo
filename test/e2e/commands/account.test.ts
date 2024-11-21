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
import { it, describe, after, before } from 'mocha'
import { expect } from 'chai'

import { AccountId, PrivateKey } from '@hashgraph/sdk'
import { constants } from '../../../src/core/index.js'
import * as version from '../../../version.js'
import {
  e2eTestSuite,
  getDefaultArgv,
  HEDERA_PLATFORM_VERSION_TAG,
  TEST_CLUSTER,
  testLogger
} from '../../test_util.js'
import { AccountCommand } from '../../../src/commands/account.js'
import { flags } from '../../../src/commands/index.js'
import { getNodeLogs } from '../../../src/core/helpers.js'
import { MINUTES, SECONDS } from '../../../src/core/constants.js'

const defaultTimeout = 20 * SECONDS

const testName = 'account-cmd-e2e'
const namespace = testName
const testSystemAccounts = [[3, 5]]
const argv = getDefaultArgv()
argv[flags.namespace.name] = namespace
argv[flags.releaseTag.name] = HEDERA_PLATFORM_VERSION_TAG
argv[flags.nodeAliasesUnparsed.name] = 'node1'
argv[flags.generateGossipKeys.name] = true
argv[flags.generateTlsKeys.name] = true
argv[flags.clusterName.name] = TEST_CLUSTER
argv[flags.soloChartVersion.name] = version.SOLO_CHART_VERSION
// set the env variable SOLO_CHARTS_DIR if developer wants to use local Solo charts
argv[flags.chartDirectory.name] = process.env.SOLO_CHARTS_DIR ?? undefined

e2eTestSuite(testName, argv, undefined, undefined, undefined, undefined, undefined, undefined, true, (bootstrapResp) => {
  describe('AccountCommand', async () => {
    const accountCmd = new AccountCommand(bootstrapResp.opts, testSystemAccounts)
    bootstrapResp.cmd.accountCmd = accountCmd
    const k8 = bootstrapResp.opts.k8
    const accountManager = bootstrapResp.opts.accountManager
    const configManager = bootstrapResp.opts.configManager
    const nodeCmd = bootstrapResp.cmd.nodeCmd

    after(async function () {
      this.timeout(3 * MINUTES)

      await getNodeLogs(k8, namespace)
      await k8.deleteNamespace(namespace)
      await accountManager.close()
      await nodeCmd.close()
    })

    describe('node proxies should be UP', () => {
      for (const nodeAlias of argv[flags.nodeAliasesUnparsed.name].split(',')) {
        it(`proxy should be UP: ${nodeAlias} `, async () => {
          await k8.waitForPodReady(
              [`app=haproxy-${nodeAlias}`, 'solo.hedera.com/type=haproxy'],
              1, 300, 2 * SECONDS)
        }).timeout(30 * SECONDS)
      }
    })

    describe('account init command', () => {
      it('should succeed with init command', async () => {
        const status = await accountCmd.init(argv)
        expect(status).to.be.ok
      }).timeout(3 * MINUTES)

      describe('special accounts should have new keys', () => {
        const genesisKey = PrivateKey.fromStringED25519(constants.GENESIS_KEY)
        const realm = constants.HEDERA_NODE_ACCOUNT_ID_START.realm
        const shard = constants.HEDERA_NODE_ACCOUNT_ID_START.shard

        before(async function () {
          this.timeout(20 * SECONDS)
          await accountManager.loadNodeClient(namespace)
        })

        after(async function () {
          this.timeout(20 * SECONDS)
          await accountManager.close()
        })

        for (const [start, end] of testSystemAccounts) {
          for (let i = start; i <= end; i++) {
            it(`account ${i} should not have genesis key`, async () => {
              expect(accountManager._nodeClient).not.to.be.null

              const accountId = `${realm}.${shard}.${i}`
              nodeCmd.logger.info(`Fetching account keys: accountId ${accountId}`)
              const keys = await accountManager.getAccountKeys(accountId)
              nodeCmd.logger.info(`Fetched account keys: accountId ${accountId}`)

              expect(keys.length).not.to.equal(0)
              expect(keys[0].toString()).not.to.equal(genesisKey.toString())
            }).timeout(20 * SECONDS)
          }
        }
      })
    })

    describe('account create/update command', () => {
      let accountId1: string, accountId2: string

      it('should create account with no options', async () => {
        try {
          argv[flags.amount.name] = 200
          expect(await accountCmd.create(argv)).to.be.true

          // @ts-ignore to access the private property
          const accountInfo = accountCmd.accountInfo

          expect(accountInfo).not.to.be.null
          expect(accountInfo.accountId).not.to.be.null

          accountId1 = accountInfo.accountId

          expect(accountInfo.privateKey).not.to.be.null
          expect(accountInfo.publicKey).not.to.be.null
          expect(accountInfo.balance).to.equal(configManager.getFlag(flags.amount))
        } catch (e) {
          testLogger.showUserError(e)
          expect.fail()
        }
      }).timeout(40 * SECONDS)

      it('should create account with private key and hbar amount options', async () => {
        try {
          argv[flags.ed25519PrivateKey.name] = constants.GENESIS_KEY
          argv[flags.amount.name] = 777
          configManager.update(argv)

          expect(await accountCmd.create(argv)).to.be.true

          // @ts-ignore to access the private property
          const accountInfo = accountCmd.accountInfo
          expect(accountInfo).not.to.be.null
          expect(accountInfo.accountId).not.to.be.null
          accountId2 = accountInfo.accountId
          expect(accountInfo.privateKey.toString()).to.equal(constants.GENESIS_KEY)
          expect(accountInfo.publicKey).not.to.be.null
          expect(accountInfo.balance).to.equal(configManager.getFlag(flags.amount))
        } catch (e) {
          testLogger.showUserError(e)
          expect.fail()
        }
      }).timeout(defaultTimeout)

      it('should update account-1', async () => {
        try {
          argv[flags.amount.name] = 0
          argv[flags.accountId.name] = accountId1
          configManager.update(argv)

          expect(await accountCmd.update(argv)).to.be.true

          // @ts-ignore to access the private property
          const accountInfo = accountCmd.accountInfo
          expect(accountInfo).not.to.be.null
          expect(accountInfo.accountId).to.equal(argv[flags.accountId.name])
          expect(accountInfo.privateKey).to.be.undefined
          expect(accountInfo.publicKey).not.to.be.null
          expect(accountInfo.balance).to.equal(200)
        } catch (e) {
          testLogger.showUserError(e)
          expect.fail()
        }
      }).timeout(defaultTimeout)

      it('should update account-2 with accountId, amount, new private key, and standard out options', async () => {
        try {
          argv[flags.accountId.name] = accountId2
          argv[flags.ed25519PrivateKey.name] = constants.GENESIS_KEY
          argv[flags.amount.name] = 333
          configManager.update(argv)

          expect(await accountCmd.update(argv)).to.be.true

          // @ts-ignore to access the private property
          const accountInfo = accountCmd.accountInfo
          expect(accountInfo).not.to.be.null
          expect(accountInfo.accountId).to.equal(argv[flags.accountId.name])
          expect(accountInfo.privateKey).to.be.undefined
          expect(accountInfo.publicKey).not.to.be.null
          expect(accountInfo.balance).to.equal(1_110)
        } catch (e) {
          testLogger.showUserError(e)
          expect.fail()
        }
      }).timeout(defaultTimeout)

      it('should be able to get account-1', async () => {
        try {
          argv[flags.accountId.name] = accountId1
          configManager.update(argv)

          expect(await accountCmd.get(argv)).to.be.true
          // @ts-ignore to access the private property
          const accountInfo = accountCmd.accountInfo
          expect(accountInfo).not.to.be.null
          expect(accountInfo.accountId).to.equal(argv[flags.accountId.name])
          expect(accountInfo.privateKey).to.be.undefined
          expect(accountInfo.publicKey).to.be.ok
          expect(accountInfo.balance).to.equal(200)
        } catch (e) {
          testLogger.showUserError(e)
          expect.fail()
        }
      }).timeout(defaultTimeout)

      it('should be able to get account-2', async () => {
        try {
          argv[flags.accountId.name] = accountId2
          configManager.update(argv)

          expect(await accountCmd.get(argv)).to.be.true
          // @ts-ignore to access the private property
          const accountInfo = accountCmd.accountInfo
          expect(accountInfo).not.to.be.null
          expect(accountInfo.accountId).to.equal(argv[flags.accountId.name])
          expect(accountInfo.privateKey).to.be.undefined
          expect(accountInfo.publicKey).to.be.ok
          expect(accountInfo.balance).to.equal(1_110)
        } catch (e) {
          testLogger.showUserError(e)
          expect.fail()
        }
      }).timeout(defaultTimeout)

      it('should create account with ecdsa private key and set alias', async () => {
        const ecdsaPrivateKey = PrivateKey.generateECDSA()

        try {
          argv[flags.ecdsaPrivateKey.name] = ecdsaPrivateKey.toString()
          argv[flags.setAlias.name] = true
          configManager.update(argv)

          expect(await accountCmd.create(argv)).to.be.true

          // @ts-ignore to access the private property
          const newAccountInfo = accountCmd.accountInfo
          expect(newAccountInfo).not.to.be.null
          expect(newAccountInfo.accountId).not.to.be.null
          expect(newAccountInfo.privateKey.toString()).to.equal(ecdsaPrivateKey.toString())
          expect(newAccountInfo.publicKey.toString()).to.equal(ecdsaPrivateKey.publicKey.toString())
          expect(newAccountInfo.balance).to.be.greaterThan(0)

          const accountId = AccountId.fromString(newAccountInfo.accountId)
          expect(newAccountInfo.accountAlias).to.equal(`${accountId.realm}.${accountId.shard}.${ecdsaPrivateKey.publicKey.toEvmAddress()}`)

          await accountManager.loadNodeClient(namespace)
          const accountAliasInfo = await accountManager.accountInfoQuery(newAccountInfo.accountAlias)
          expect(accountAliasInfo).not.to.be.null
        } catch (e) {
          testLogger.showUserError(e)
          expect.fail()
        }
      }).timeout(defaultTimeout)
    })
  })
})
