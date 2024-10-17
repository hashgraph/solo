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
 * @mocha-environment steps
 */
import { it, describe, after } from 'mocha'
import { expect } from 'chai'

import { flags } from '../../../src/commands/index.ts'
import {
  accountCreationShouldSucceed,
  balanceQueryShouldSucceed,
  bootstrapNetwork,
  getDefaultArgv,
  HEDERA_PLATFORM_VERSION_TAG
} from '../../test_util.ts'
import { getNodeLogs, getTmpDir } from '../../../src/core/helpers.ts'
import { HEDERA_HAPI_PATH, MINUTES, ROOT_CONTAINER } from '../../../src/core/constants.ts'
import fs from 'fs'
import type { PodName } from '../../../src/types/aliases.ts'
import * as NodeCommandConfigs from '../../../src/commands/node/configs.ts'

describe('Node delete', async () => {
  const namespace = 'node-delete'
  const nodeAlias = 'node1'
  const argv = getDefaultArgv()
  argv[flags.nodeAliasesUnparsed.name] = 'node1,node2,node3,node4'
  argv[flags.nodeAlias.name] = nodeAlias
  argv[flags.generateGossipKeys.name] = true
  argv[flags.generateTlsKeys.name] = true
  argv[flags.persistentVolumeClaims.name] = true
  // set the env variable SOLO_CHARTS_DIR if developer wants to use local Solo charts
  argv[flags.chartDirectory.name] = process.env.SOLO_CHARTS_DIR ?? undefined
  argv[flags.releaseTag.name] = HEDERA_PLATFORM_VERSION_TAG
  argv[flags.namespace.name] = namespace
  argv[flags.quiet.name] = true
  const bootstrapResp = await bootstrapNetwork(namespace, argv)
  const nodeCmd = bootstrapResp.cmd.nodeCmd
  const accountCmd = bootstrapResp.cmd.accountCmd
  const k8 = bootstrapResp.opts.k8

  after(async function () {
    this.timeout(10 * MINUTES)
    await getNodeLogs(k8, namespace)
    await k8.deleteNamespace(namespace)
  })

  it('should succeed with init command', async () => {
    const status = await accountCmd.init(argv)
    expect(status).to.be.ok
  }).timeout(8 * MINUTES)

  it('should delete a node from the network successfully', async () => {
    await nodeCmd.handlers.delete(argv)
    expect(nodeCmd.getUnusedConfigs(NodeCommandConfigs.DELETE_CONFIGS_NAME)).to.deep.equal([
      flags.app.constName,
      flags.devMode.constName,
      flags.endpointType.constName,
      flags.quiet.constName
    ])

    // @ts-ignore in order to access the private member
    await nodeCmd.accountManager.close()
  }).timeout(10 * MINUTES)

  // @ts-ignore in order to access the private member
  balanceQueryShouldSucceed(nodeCmd.accountManager, nodeCmd, namespace)

  // @ts-ignore in order to access the private member
  accountCreationShouldSucceed(nodeCmd.accountManager, nodeCmd, namespace)

  it('config.txt should no longer contain removed node alias name', async () => {
    // read config.txt file from first node, read config.txt line by line, it should not contain value of nodeAlias
    const pods = await k8.getPodsByLabel(['solo.hedera.com/type=network-node'])
    const podName = pods[0].metadata.name as PodName
    const tmpDir = getTmpDir()
    await k8.copyFrom(podName, ROOT_CONTAINER, `${HEDERA_HAPI_PATH}/config.txt`, tmpDir)
    const configTxt = fs.readFileSync(`${tmpDir}/config.txt`, 'utf8')
    console.log('config.txt:', configTxt)
    expect(configTxt).not.to.contain(nodeAlias)
  }).timeout(10 * MINUTES)
})
