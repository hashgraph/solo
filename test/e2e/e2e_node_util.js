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

import {
  AccountCreateTransaction,
  Hbar,
  HbarUnit,
  PrivateKey
} from '@hashgraph/sdk'
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it
} from '@jest/globals'
import { flags } from '../../src/commands/index.mjs'
import {
  constants, Templates
} from '../../src/core/index.mjs'
import {
  balanceQueryShouldSucceed,
  bootstrapNetwork,
  getDefaultArgv,
  getTestConfigManager,
  getTmpDir,
  HEDERA_PLATFORM_VERSION_TAG,
  TEST_CLUSTER
} from '../test_util.js'
import { getNodeLogs, sleep } from '../../src/core/helpers.mjs'
import path from 'path'
import fs from 'fs'
import crypto from 'crypto'
import { ROOT_CONTAINER } from '../../src/core/constants.mjs'
import { NodeCommand } from '../../src/commands/node.mjs'

export function e2eNodeKeyRefreshAddTest (keyFormat, testName, mode, releaseTag = HEDERA_PLATFORM_VERSION_TAG) {
  const defaultTimeout = 120000

  describe(`NodeCommand [testName ${testName}, mode ${mode}, keyFormat: ${keyFormat}, release ${releaseTag}]`, () => {
    const namespace = testName
    const argv = getDefaultArgv()
    argv[flags.namespace.name] = namespace
    argv[flags.releaseTag.name] = releaseTag
    argv[flags.keyFormat.name] = keyFormat
    argv[flags.nodeIDs.name] = 'node0,node1,node2,node3'
    argv[flags.generateGossipKeys.name] = true
    argv[flags.generateTlsKeys.name] = true
    argv[flags.clusterName.name] = TEST_CLUSTER
    // set the env variable SOLO_FST_CHARTS_DIR if developer wants to use local FST charts
    argv[flags.chartDirectory.name] = process.env.SOLO_FST_CHARTS_DIR ? process.env.SOLO_FST_CHARTS_DIR : undefined

    const bootstrapResp = bootstrapNetwork(testName, argv)
    const accountManager = bootstrapResp.opts.accountManager
    const k8 = bootstrapResp.opts.k8
    const nodeCmd = bootstrapResp.cmd.nodeCmd

    afterEach(async () => {
      await nodeCmd.close()
      await accountManager.close()
    }, defaultTimeout)

    afterAll(async () => {
      await getNodeLogs(k8, namespace)
      await k8.deleteNamespace(namespace)
    }, 180000)

    describe(`Node should have started successfully [mode ${mode}, release ${releaseTag}, keyFormat: ${keyFormat}]`, () => {
      balanceQueryShouldSucceed(accountManager, nodeCmd, namespace)

      accountCreationShouldSucceed(accountManager, nodeCmd, namespace)

      it(`Node Proxy should be UP [mode ${mode}, release ${releaseTag}, keyFormat: ${keyFormat}`, async () => {
        expect.assertions(1)

        try {
          await expect(k8.waitForPodReady(
            ['app=haproxy-node0', 'fullstack.hedera.com/type=haproxy'],
            1, 300, 1000)).resolves.toBeTruthy()
        } catch (e) {
          nodeCmd.logger.showUserError(e)
          expect(e).toBeNull()
        } finally {
          await nodeCmd.close()
        }
      }, defaultTimeout)
    })

    describe(`Node should refresh successfully [mode ${mode}, release ${releaseTag}, keyFormat: ${keyFormat}]`, () => {
      const nodeId = 'node0'

      beforeAll(async () => {
        const podName = await nodeRefreshTestSetup(argv, testName, k8, nodeId)
        if (mode === 'kill') {
          const resp = await k8.kubeClient.deleteNamespacedPod(podName, namespace)
          expect(resp.response.statusCode).toEqual(200)
          await sleep(20000) // sleep to wait for pod to finish terminating
        } else if (mode === 'stop') {
          await expect(nodeCmd.stop(argv)).resolves.toBeTruthy()
          await sleep(20000) // give time for node to stop and update its logs
        } else {
          throw new Error(`invalid mode: ${mode}`)
        }
      }, 120000)

      nodePodShouldBeRunning(nodeCmd, namespace, nodeId)

      nodeShouldNotBeActive(nodeCmd, nodeId)

      nodeRefreshShouldSucceed(nodeId, nodeCmd, argv)

      balanceQueryShouldSucceed(accountManager, nodeCmd, namespace)

      accountCreationShouldSucceed(accountManager, nodeCmd, namespace)
    })

    describe(`Should add a new node to the network [release ${releaseTag}, keyFormat: ${keyFormat}]`, () => {
      const nodeId = 'node4'
      let existingServiceMap
      let existingNodeIdsPrivateKeysHash

      beforeAll(async () => {
        argv[flags.nodeIDs.name] = nodeId
        const configManager = getTestConfigManager(`${testName}-solo.config`)
        configManager.update(argv, true)
        existingServiceMap = await accountManager.getNodeServiceMap(namespace)
        existingNodeIdsPrivateKeysHash = await getNodeIdsPrivateKeysHash(existingServiceMap, namespace, keyFormat, k8, getTmpDir())
      }, defaultTimeout)

      it(`${nodeId} should not exist`, async () => {
        try {
          await expect(nodeCmd.checkNetworkNodePod(namespace, nodeId, 10, 50)).rejects.toThrowError(`no pod found for nodeId: ${nodeId}`)
        } catch (e) {
          nodeCmd.logger.showUserError(e)
          expect(e).toBeNull()
        } finally {
          await nodeCmd.close()
        }
      }, 180000)

      balanceQueryShouldSucceed(accountManager, nodeCmd, namespace)

      accountCreationShouldSucceed(accountManager, nodeCmd, namespace)

      it(`add ${nodeId} to the network`, async () => {
        try {
          await expect(nodeCmd.add(argv)).resolves.toBeTruthy()
        } catch (e) {
          nodeCmd.logger.showUserError(e)
          expect(e).toBeNull()
        } finally {
          await nodeCmd.close()
          await sleep(10000) // sleep to wait for node to finish starting
        }
      }, 600000)

      balanceQueryShouldSucceed(accountManager, nodeCmd, namespace)

      accountCreationShouldSucceed(accountManager, nodeCmd, namespace)

      it('existing nodes private keys should not have changed', async () => {
        const currentNodeIdsPrivateKeysHash = await getNodeIdsPrivateKeysHash(existingServiceMap, namespace, keyFormat, k8, getTmpDir())

        for (const [nodeId, existingKeyHashMap] of existingNodeIdsPrivateKeysHash.entries()) {
          const currentNodeKeyHashMap = currentNodeIdsPrivateKeysHash.get(nodeId)

          for (const [keyFileName, existingKeyHash] of existingKeyHashMap.entries()) {
            expect(`${nodeId}:${keyFileName}:${currentNodeKeyHashMap.get(keyFileName)}`).toEqual(
                `${nodeId}:${keyFileName}:${existingKeyHash}`)
          }
        }
      }, defaultTimeout)
    })
  })

  function accountCreationShouldSucceed (accountManager, nodeCmd, namespace) {
    it('Account creation should succeed', async () => {
      expect.assertions(3)

      try {
        await accountManager.loadNodeClient(namespace)
        expect(accountManager._nodeClient).not.toBeNull()
        const privateKey = PrivateKey.generate()
        const amount = 100

        const newAccount = await new AccountCreateTransaction()
          .setKey(privateKey)
          .setInitialBalance(Hbar.from(amount, HbarUnit.Hbar))
          .execute(accountManager._nodeClient)

        // Get the new account ID
        const getReceipt = await newAccount.getReceipt(accountManager._nodeClient)
        const accountInfo = {
          accountId: getReceipt.accountId.toString(),
          privateKey: privateKey.toString(),
          publicKey: privateKey.publicKey.toString(),
          balance: amount
        }

        expect(accountInfo.accountId).not.toBeNull()
        expect(accountInfo.balance).toEqual(amount)
      } catch (e) {
        nodeCmd.logger.showUserError(e)
        expect(e).toBeNull()
      }
    }, defaultTimeout)
  }

  function nodePodShouldBeRunning (nodeCmd, namespace, nodeId) {
    it(`${nodeId} should be running`, async () => {
      try {
        await expect(nodeCmd.checkNetworkNodePod(namespace, nodeId)).resolves.toBeTruthy()
      } catch (e) {
        nodeCmd.logger.showUserError(e)
        expect(e).toBeNull()
      } finally {
        await nodeCmd.close()
      }
    }, defaultTimeout)
  }

  function nodeRefreshShouldSucceed (nodeId, nodeCmd, argv) {
    it(`${nodeId} refresh should succeed`, async () => {
      try {
        await expect(nodeCmd.refresh(argv)).resolves.toBeTruthy()
        expect(nodeCmd.getUnusedConfigs(NodeCommand.REFRESH_CONFIGS_NAME)).toEqual([])
      } catch (e) {
        nodeCmd.logger.showUserError(e)
        expect(e).toBeNull()
      } finally {
        await nodeCmd.close()
        await sleep(10000) // sleep to wait for node to finish starting
      }
    }, 1200000)
  }

  function nodeShouldNotBeActive (nodeCmd, nodeId) {
    it(`${nodeId} should not be ACTIVE`, async () => {
      expect(2)
      try {
        await expect(nodeCmd.checkNetworkNodeState(nodeId, 5)).rejects.toThrowError()
      } catch (e) {
        expect(e).not.toBeNull()
      } finally {
        await nodeCmd.close()
      }
    }, defaultTimeout)
  }

  async function nodeRefreshTestSetup (argv, testName, k8, nodeId) {
    argv[flags.nodeIDs.name] = nodeId
    const configManager = getTestConfigManager(`${testName}-solo.config`)
    configManager.update(argv, true)

    const podArray = await k8.getPodsByLabel(
      [`app=network-${nodeId}`, 'fullstack.hedera.com/type=network-node'])

    if (podArray.length > 0) {
      const podName = podArray[0].metadata.name
      k8.logger.info(`nodeRefreshTestSetup: podName: ${podName}`)
      return podName
    } else {
      throw new Error(`pod for ${nodeId} not found`)
    }
  }

  async function getNodeIdsPrivateKeysHash (networkNodeServicesMap, namespace, keyFormat, k8, destDir) {
    const dataKeysDir = `${constants.HEDERA_HAPI_PATH}/data/keys`
    const tlsKeysDir = constants.HEDERA_HAPI_PATH
    const nodeKeyHashMap = new Map()
    for (const networkNodeServices of networkNodeServicesMap.values()) {
      const keyHashMap = new Map()
      const nodeId = networkNodeServices.nodeName
      const uniqueNodeDestDir = path.join(destDir, nodeId)
      if (!fs.existsSync(uniqueNodeDestDir)) {
        fs.mkdirSync(uniqueNodeDestDir, { recursive: true })
      }
      switch (keyFormat) {
        case constants.KEY_FORMAT_PFX:
          await addKeyHashToMap(k8, nodeId, dataKeysDir, uniqueNodeDestDir, keyHashMap, Templates.renderGossipPfxPrivateKeyFile(nodeId))
          break
        case constants.KEY_FORMAT_PEM:
          await addKeyHashToMap(k8, nodeId, dataKeysDir, uniqueNodeDestDir, keyHashMap, Templates.renderGossipPemPrivateKeyFile(constants.SIGNING_KEY_PREFIX, nodeId))
          await addKeyHashToMap(k8, nodeId, dataKeysDir, uniqueNodeDestDir, keyHashMap, Templates.renderGossipPemPrivateKeyFile(constants.AGREEMENT_KEY_PREFIX, nodeId))
          break
        default:
          throw new Error(`invalid keyFormat: ${keyFormat}`)
      }
      await addKeyHashToMap(k8, nodeId, tlsKeysDir, uniqueNodeDestDir, keyHashMap, 'hedera.key')
      nodeKeyHashMap.set(nodeId, keyHashMap)
    }
    return nodeKeyHashMap
  }

  async function addKeyHashToMap (k8, nodeId, keyDir, uniqueNodeDestDir, keyHashMap, privateKeyFileName) {
    await k8.copyFrom(
      Templates.renderNetworkPodName(nodeId),
      ROOT_CONTAINER,
      path.join(keyDir, privateKeyFileName),
      uniqueNodeDestDir)
    const keyBytes = await fs.readFileSync(path.join(uniqueNodeDestDir, privateKeyFileName))
    const keyString = keyBytes.toString()
    keyHashMap.set(privateKeyFileName, crypto.createHash('sha256').update(keyString).digest('base64'))
  }
}
