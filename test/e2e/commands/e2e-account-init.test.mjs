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

import {afterEach, describe, expect, it} from '@jest/globals'
import {ConfigManager, constants, K8, logging} from '../../../src/core/index.mjs'
import { e2eNodeKeyRefreshAddTest } from '../e2e_node_util.js'
import {bootstrapTestVariables, getDefaultArgv, TEST_CLUSTER} from "../../test_util.js";
import {flags} from "../../../src/commands/index.mjs";
import {AccountManager} from "../../../src/core/account_manager.mjs";
import {AccountCommand} from "../../../src/commands/account.mjs";

describe('NodeCommand', () => {
  const testLogger = logging.NewLogger('debug')
  const argv = getDefaultArgv()
  argv[flags.namespace.name] = 'solo-e2e'
  argv[flags.nodeIDs.name] = 'node0,node1,node2'
  argv[flags.generateGossipKeys.name] = true
  argv[flags.generateTlsKeys.name] = true
  argv[flags.clusterName.name] = TEST_CLUSTER
  // set the env variable SOLO_FST_CHARTS_DIR if developer wants to use local FST charts
  argv[flags.chartDirectory.name] = process.env.SOLO_FST_CHARTS_DIR ? process.env.SOLO_FST_CHARTS_DIR : undefined

  const bootstrapResp = bootstrapTestVariables('solo-e2e', argv)
  const accountManager = bootstrapResp.opts.accountManager

  const configManager = new ConfigManager(testLogger)
  configManager.update(argv, true)

  // const k8 = new K8(configManager, testLogger)
  // const accountManager = new AccountManager(testLogger, k8)


  const accountCmd = new AccountCommand(bootstrapResp.opts)

  afterEach(async () => {
    await accountManager.close()
  }, 120000)

  it('should succeed with init command', async () => {
    const status = await accountCmd.init(argv)
    expect(status).toBeTruthy()
  }, 180000)
})
