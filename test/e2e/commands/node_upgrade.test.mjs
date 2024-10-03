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
import { afterAll, describe, expect, it } from '@jest/globals'
import { flags } from '../../../src/commands/index.mjs'
import {
  bootstrapNetwork,
  getDefaultArgv,
  HEDERA_PLATFORM_VERSION_TAG
} from '../../test_util.js'
import { getNodeLogs } from '../../../src/core/helpers.mjs'
import { PREPARE_UPGRADE_CONFIGS_NAME, DOWNLOAD_GENERATED_FILES_CONFIGS_NAME } from '../../../src/commands/node/configs.mjs'

describe('Node upgrade', () => {
  const namespace = 'node-upgrade'
  const argv = getDefaultArgv()
  argv[flags.nodeIDs.name] = 'node1,node2,node3'
  argv[flags.generateGossipKeys.name] = true
  argv[flags.generateTlsKeys.name] = true
  argv[flags.persistentVolumeClaims.name] = true
  // set the env variable SOLO_FST_CHARTS_DIR if developer wants to use local FST charts
  argv[flags.chartDirectory.name] = process.env.SOLO_FST_CHARTS_DIR ? process.env.SOLO_FST_CHARTS_DIR : undefined
  argv[flags.releaseTag.name] = HEDERA_PLATFORM_VERSION_TAG
  argv[flags.namespace.name] = namespace

  const upgradeArgv = getDefaultArgv()

  const bootstrapResp = bootstrapNetwork(namespace, argv)
  const nodeCmd = bootstrapResp.cmd.nodeCmd
  const accountCmd = bootstrapResp.cmd.accountCmd
  const k8 = bootstrapResp.opts.k8

  afterAll(async () => {
    await getNodeLogs(k8, namespace)
    await k8.deleteNamespace(namespace)
  }, 600000)

  it('should succeed with init command', async () => {
    const status = await accountCmd.init(argv)
    expect(status).toBeTruthy()
  }, 450000)

  it('should prepare network upgrade successfully', async () => {
    await nodeCmd.prepareUpgrade(upgradeArgv)
    expect(nodeCmd.getUnusedConfigs(PREPARE_UPGRADE_CONFIGS_NAME)).toEqual([
      flags.devMode.constName
    ])
  }, 300000)

  it('should download generated files successfully', async () => {
    await nodeCmd.downloadGeneratedFiles(upgradeArgv)
    expect(nodeCmd.getUnusedConfigs(DOWNLOAD_GENERATED_FILES_CONFIGS_NAME)).toEqual([
      flags.devMode.constName,
      'allNodeAliases'
    ])
  }, 300000)

  it('should upgrade all nodes on the network successfully', async () => {
    await nodeCmd.freezeUpgrade(upgradeArgv)
    expect(nodeCmd.getUnusedConfigs(PREPARE_UPGRADE_CONFIGS_NAME)).toEqual([
      flags.devMode.constName
    ])
    await nodeCmd.accountManager.close()
  }, 300000)
})
