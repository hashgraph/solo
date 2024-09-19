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
  accountCreationShouldSucceed,
  balanceQueryShouldSucceed,
  bootstrapNetwork,
  getDefaultArgv,
  getNodeIdsPrivateKeysHash, getTmpDir,
  HEDERA_PLATFORM_VERSION_TAG
} from '../test_util.js'
import { flags } from '../../src/commands/index.mjs'
import { getNodeLogs } from '../../src/core/helpers.mjs'
import { NodeCommand } from '../../src/commands/node.mjs'

export function testSeparateNodeAdd (namespacePostfix, hederaImage) {
  describe(`Node add [${namespacePostfix}] via separated commands should success`, () => {
    const defaultTimeout = 120000
    const namespace = `node-add-separated-${namespacePostfix}`
    const argv = getDefaultArgv()
    argv[flags.hederaImage.name] = hederaImage
    argv[flags.nodeIDs.name] = 'node1,node2,node3'
    argv[flags.generateGossipKeys.name] = true
    argv[flags.generateTlsKeys.name] = true
    // set the env variable SOLO_FST_CHARTS_DIR if developer wants to use local FST charts
    argv[flags.chartDirectory.name] = process.env.SOLO_FST_CHARTS_DIR
      ? process.env.SOLO_FST_CHARTS_DIR
      : undefined
    argv[flags.releaseTag.name] = HEDERA_PLATFORM_VERSION_TAG
    argv[flags.namespace.name] = namespace
    argv[flags.force.name] = true
    argv[flags.persistentVolumeClaims.name] = true

    const argvPrepare = Object.assign({}, argv)

    const tempDir = 'contextDir'
    argvPrepare[flags.outputDir.name] = tempDir

    const argvExecute = getDefaultArgv()
    argvExecute[flags.hederaImage.name] = hederaImage
    argvExecute[flags.inputDir.name] = tempDir

    const bootstrapResp = bootstrapNetwork(namespace, argv)
    const nodeCmd = bootstrapResp.cmd.nodeCmd
    const accountCmd = bootstrapResp.cmd.accountCmd
    const networkCmd = bootstrapResp.cmd.networkCmd
    const k8 = bootstrapResp.opts.k8
    let existingServiceMap
    let existingNodeIdsPrivateKeysHash

    afterAll(async () => {
      await getNodeLogs(k8, namespace)
      await nodeCmd.accountManager.close()
      await nodeCmd.stop(argv)
      await networkCmd.destroy(argv)
      await k8.deleteNamespace(namespace)
    }, 600000)

    it('cache current version of private keys', async () => {
      existingServiceMap = await nodeCmd.accountManager.getNodeServiceMap(
        namespace)
      existingNodeIdsPrivateKeysHash = await getNodeIdsPrivateKeysHash(
        existingServiceMap, namespace, k8, getTmpDir())
    }, defaultTimeout)

    it('should succeed with init command', async () => {
      const status = await accountCmd.init(argv)
      expect(status).toBeTruthy()
    }, 450000)

    it('should add a new node to the network via the segregated commands successfully',
      async () => {
        await nodeCmd.addPrepare(argvPrepare)
        await nodeCmd.addSubmitTransactions(argvExecute)
        await nodeCmd.addExecute(argvExecute)
        const expectedUnusedConfigs = [
          flags.app.constName,
          flags.chainId.constName,
          flags.devMode.constName,
          flags.generateGossipKeys.constName,
          flags.generateTlsKeys.constName,
          flags.gossipEndpoints.constName,
          flags.grpcEndpoints.constName,
          flags.adminKey.constName,
          'curDate',
          'freezeAdminPrivateKey'
        ]
        if (bootstrapResp.opts.configManager.getFlag(flags.hederaImage)) {
          expectedUnusedConfigs.push(flags.localBuildPath.constName)
        }
        expect(nodeCmd.getUnusedConfigs(
          NodeCommand.ADD_CONFIGS_NAME).sort()).toEqual(
          expectedUnusedConfigs.sort())
        await nodeCmd.accountManager.close()
      }, 800000)

    balanceQueryShouldSucceed(nodeCmd.accountManager, nodeCmd, namespace)

    accountCreationShouldSucceed(nodeCmd.accountManager, nodeCmd, namespace)

    it('existing nodes private keys should not have changed', async () => {
      const currentNodeIdsPrivateKeysHash = await getNodeIdsPrivateKeysHash(
        existingServiceMap, namespace, k8, getTmpDir())

      for (const [nodeId, existingKeyHashMap] of
        existingNodeIdsPrivateKeysHash.entries()) {
        const currentNodeKeyHashMap = currentNodeIdsPrivateKeysHash.get(
          nodeId)

        for (const [keyFileName, existingKeyHash] of
          existingKeyHashMap.entries()) {
          expect(`${nodeId}:${keyFileName}:${currentNodeKeyHashMap.get(
                  keyFileName)}`).toEqual(
                  `${nodeId}:${keyFileName}:${existingKeyHash}`)
        }
      }
    }, defaultTimeout)
  })
}
