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

import {
  bootstrapTestVariables,
  getDefaultArgv,
  getTmpDir,
  HEDERA_PLATFORM_VERSION_TAG
} from '../../test_util.ts'
import { constants } from '../../../src/core/index.ts'
import * as version from '../../../version.ts'
import { getNodeLogs, sleep } from '../../../src/core/helpers.ts'
import path from 'path'
import fs from 'fs'
import { NetworkCommand } from '../../../src/commands/network.ts'
import { MINUTES, SECONDS } from '../../../src/core/constants.ts'
import { flags } from '../../../src/commands/index.ts'

describe('NetworkCommand', () => {
  const testName = 'network-cmd-e2e'
  const namespace = testName
  const applicationEnvFileContents = '# row 1\n# row 2\n# row 3'
  const applicationEnvParentDirectory = path.join(getTmpDir(), 'network-command-test')
  const applicationEnvFilePath = path.join(applicationEnvParentDirectory, 'application.env')
  const argv = getDefaultArgv()
  argv[flags.namespace.name] = namespace
  argv[flags.releaseTag.name] = HEDERA_PLATFORM_VERSION_TAG
  argv[flags.nodeAliasesUnparsed.name] = 'node1'
  argv[flags.generateGossipKeys.name] = true
  argv[flags.generateTlsKeys.name] = true
  argv[flags.deployMinio.name] = true
  argv[flags.soloChartVersion.name] = version.SOLO_CHART_VERSION
  argv[flags.force.name] = true
  argv[flags.applicationEnv.name] = applicationEnvFilePath
  // set the env variable SOLO_CHARTS_DIR if developer wants to use local Solo charts
  argv[flags.chartDirectory.name] = process.env.SOLO_CHARTS_DIR ?? undefined
  argv[flags.quiet.name] = true

  const bootstrapResp = bootstrapTestVariables(testName, argv)
  const k8 = bootstrapResp.opts.k8
  const accountManager = bootstrapResp.opts.accountManager
  const configManager = bootstrapResp.opts.configManager

  const networkCmd = bootstrapResp.cmd.networkCmd
  const clusterCmd = bootstrapResp.cmd.clusterCmd
  const initCmd = bootstrapResp.cmd.initCmd
  const nodeCmd = bootstrapResp.cmd.nodeCmd

  after(async function () {
    this.timeout(3 * MINUTES)

    await getNodeLogs(k8, namespace)
    await k8.deleteNamespace(namespace)
    await accountManager.close()
  })

  before(async () => {
    await initCmd.init(argv)
    await clusterCmd.setup(argv)
    fs.mkdirSync(applicationEnvParentDirectory, { recursive: true })
    fs.writeFileSync(applicationEnvFilePath, applicationEnvFileContents)
  })

  it('keys should be generated', async () => {
    await expect(nodeCmd.handlers.keys(argv)).to.eventually.be.ok
  })

  it('network deploy command should succeed', async () => {
    try {
      await expect(networkCmd.deploy(argv)).to.eventually.be.ok

      // check pod names should match expected values
      await expect(k8.getPodByName('network-node1-0'))
        .eventually.to.have.nested.property('metadata.name', 'network-node1-0')
      // get list of pvc using k8 listPvcsByNamespace function and print to log
      const pvcs = await k8.listPvcsByNamespace(namespace)
      networkCmd.logger.showList('PVCs', pvcs)

      expect(networkCmd.getUnusedConfigs(NetworkCommand.DEPLOY_CONFIGS_NAME)).to.deep.equal([
        flags.apiPermissionProperties.constName,
        flags.applicationEnv.constName,
        flags.applicationProperties.constName,
        flags.bootstrapProperties.constName,
        flags.chainId.constName,
        flags.log4j2Xml.constName,
        flags.profileFile.constName,
        flags.profileName.constName,
        flags.quiet.constName,
        flags.settingTxt.constName,
        'chatPath'
      ])
    } catch (e) {
      networkCmd.logger.showUserError(e)
      expect.fail()
    }
  }).timeout(4 * MINUTES)

  it('application env file contents should be in cached values file', () => {
    // @ts-ignore in order to access the private property
    const valuesYaml = fs.readFileSync(networkCmd.profileValuesFile).toString()
    const fileRows = applicationEnvFileContents.split('\n')
    for (const fileRow of fileRows) {
      expect(valuesYaml).to.contain(fileRow)
    }
  })

  it('network destroy should success', async () => {
    argv[flags.deletePvcs.name] = true
    argv[flags.deleteSecrets.name] = true
    argv[flags.force.name] = true
    configManager.update(argv)

    try {
      await expect(networkCmd.destroy(argv)).to.eventually.be.ok

      while ((await k8.getPodsByLabel(['solo.hedera.com/type=network-node'])).length > 0) {
        networkCmd.logger.debug('Pods are still running. Waiting...')
        await sleep(3 * SECONDS)
      }

      while ((await k8.getPodsByLabel(['app=minio'])).length > 0) {
        networkCmd.logger.showUser('Waiting for minio container to be deleted...')
        await sleep(3 * SECONDS)
      }

      // check if chart is uninstalled
      await expect(bootstrapResp.opts.chartManager.isChartInstalled(namespace, constants.SOLO_DEPLOYMENT_CHART))
        .to.eventually.not.be.ok

      // check if pvc are deleted
      await expect(k8.listPvcsByNamespace(namespace)).eventually.to.have.lengthOf(0)

      // check if secrets are deleted
      await expect(k8.listSecretsByNamespace(namespace)).eventually.to.have.lengthOf(0)
    } catch (e) {
      networkCmd.logger.showUserError(e)
      expect.fail()
    }
  }).timeout(2 * MINUTES)
})
