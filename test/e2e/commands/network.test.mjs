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
  afterAll,
  beforeAll,
  describe,
  expect,
  it
} from '@jest/globals'
import {
  bootstrapTestVariables,
  getDefaultArgv,
  getTmpDir,
  HEDERA_PLATFORM_VERSION_TAG
} from '../../test_util.js'
import {
  constants
} from '../../../src/core/index.mjs'
import { flags } from '../../../src/commands/index.mjs'
import * as version from '../../../version.mjs'
import { sleep } from '../../../src/core/helpers.mjs'
import path from 'path'
import fs from 'fs'

describe('NetworkCommand', () => {
  const testName = 'network-cmd-e2e'
  const namespace = testName
  const applicationEnvFileContents = '# row 1\n# row 2\n# row 3'
  const applicationEnvParentDirectory = path.join(getTmpDir(), 'network-command-test')
  const applicationEnvFilePath = path.join(applicationEnvParentDirectory, 'application.env')
  const argv = getDefaultArgv()
  argv[flags.namespace.name] = namespace
  argv[flags.releaseTag.name] = HEDERA_PLATFORM_VERSION_TAG
  argv[flags.keyFormat.name] = constants.KEY_FORMAT_PEM
  argv[flags.nodeIDs.name] = 'node0'
  argv[flags.generateGossipKeys.name] = true
  argv[flags.generateTlsKeys.name] = true
  argv[flags.deployMinio.name] = true
  argv[flags.fstChartVersion.name] = version.FST_CHART_VERSION
  argv[flags.force.name] = true
  argv[flags.applicationEnv.name] = applicationEnvFilePath
  // set the env variable SOLO_FST_CHARTS_DIR if developer wants to use local FST charts
  argv[flags.chartDirectory.name] = process.env.SOLO_FST_CHARTS_DIR ? process.env.SOLO_FST_CHARTS_DIR : undefined

  const bootstrapResp = bootstrapTestVariables(testName, argv)
  const k8 = bootstrapResp.opts.k8
  const accountManager = bootstrapResp.opts.accountManager
  const configManager = bootstrapResp.opts.configManager

  const networkCmd = bootstrapResp.cmd.networkCmd
  const clusterCmd = bootstrapResp.cmd.clusterCmd

  afterAll(async () => {
    await k8.deleteNamespace(namespace)
    await accountManager.close()
  })

  beforeAll(async () => {
    await clusterCmd.setup(argv)
    fs.mkdirSync(applicationEnvParentDirectory, { recursive: true })
    fs.writeFileSync(applicationEnvFilePath, applicationEnvFileContents)
  })

  it('network deploy command should succeed', async () => {
    expect.assertions(2)
    try {
      await expect(networkCmd.deploy(argv)).resolves.toBeTruthy()

      // check pod names should match expected values
      await expect(k8.getPodByName('network-node0-0'))
        .resolves.toHaveProperty('metadata.name', 'network-node0-0')
      // get list of pvc using k8 listPvcsByNamespace function and print to log
      const pvcs = await k8.listPvcsByNamespace(namespace)
      networkCmd.logger.showList('PVCs', pvcs)
    } catch (e) {
      networkCmd.logger.showUserError(e)
      expect(e).toBeNull()
    }
  }, 240000)

  it('application env file contents should be in cached values file', async () => {
    expect.assertions(3)
    const valuesYaml = fs.readFileSync(networkCmd.profileValuesFile).toString()
    const fileRows = applicationEnvFileContents.split('\n')
    for (const fileRow of fileRows) {
      expect(valuesYaml).toContain(fileRow)
    }
  })

  it('network destroy should success', async () => {
    argv[flags.deletePvcs.name] = true
    configManager.update(argv, true)

    expect.assertions(3)
    try {
      await expect(networkCmd.destroy(argv)).resolves.toBeTruthy()

      while ((await k8.getPodsByLabel(['fullstack.hedera.com/type=network-node'])).length > 0) {
        networkCmd.logger.debug('Pods are still running. Waiting...')
        await sleep(3000)
      }

      while ((await k8.getPodsByLabel(['app=minio'])).length > 0) {
        networkCmd.logger.showUser('Waiting for minio container to be deleted...')
        await sleep(3000)
      }

      // check if chart is uninstalled
      await expect(bootstrapResp.opts.chartManager.isChartInstalled(namespace, constants.FULLSTACK_DEPLOYMENT_CHART))
        .resolves.toBeFalsy()

      // check if pvc are deleted
      await expect(k8.listPvcsByNamespace(namespace)).resolves.toHaveLength(0)
    } catch (e) {
      networkCmd.logger.showUserError(e)
      expect(e).toBeNull()
    }
  }, 120000)
})
