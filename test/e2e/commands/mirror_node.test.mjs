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
  afterAll, afterEach, describe,
  expect,
  it
} from '@jest/globals'
import { flags } from '../../../src/commands/index.mjs'
import {
  constants
} from '../../../src/core/index.mjs'
import {
  bootstrapNetwork,
  getDefaultArgv,
  TEST_CLUSTER
} from '../../test_util.js'
import * as version from '../../../version.mjs'
import { sleep } from '../../../src/core/helpers.mjs'
import { MirrorNodeCommand } from '../../../src/commands/mirror_node.mjs'

describe('MirrorNodeCommand', () => {
  const testName = 'mirror-cmd-e2e'
  const namespace = testName
  const argv = getDefaultArgv()
  argv[flags.namespace.name] = namespace
  argv[flags.releaseTag.name] = 'v0.47.0-alpha.0'
  argv[flags.keyFormat.name] = constants.KEY_FORMAT_PEM

  argv[flags.nodeIDs.name] = 'node0,node1,node2'
  argv[flags.generateGossipKeys.name] = true
  argv[flags.generateTlsKeys.name] = true
  argv[flags.clusterName.name] = TEST_CLUSTER
  argv[flags.fstChartVersion.name] = version.FST_CHART_VERSION
  argv[flags.force.name] = true
  argv[flags.relayReleaseTag.name] = flags.relayReleaseTag.definition.defaultValue

  const bootstrapResp = bootstrapNetwork(testName, argv)
  const k8 = bootstrapResp.opts.k8
  const mirrorNodeCmd = new MirrorNodeCommand(bootstrapResp.opts)

  afterAll(async () => {
    await k8.deleteNamespace(namespace)
  })

  afterEach(async () => {
    await sleep(5) // give a few ticks so that connections can close
  })

  it('mirror node deploy should succeed', async () => {
    expect.assertions(1)
    try {
      await expect(mirrorNodeCmd.deploy(argv)).resolves.toBeTruthy()
    } catch (e) {
      mirrorNodeCmd.logger.showUserError(e)
      expect(e).toBeNull()
    }
  }, 360000)

  it('mirror node destroy should succeed', async () => {
    expect.assertions(1)
    try {
      await expect(mirrorNodeCmd.destroy(argv)).resolves.toBeTruthy()
    } catch (e) {
      mirrorNodeCmd.logger.showUserError(e)
      expect(e).toBeNull()
    }
  }, 60000)
})
