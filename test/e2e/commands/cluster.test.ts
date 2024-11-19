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
import sinon from 'sinon'
import { it, describe, after, before, afterEach, beforeEach } from 'mocha'
import { expect } from 'chai'

import { flags } from '../../../src/commands/index.ts'
import { bootstrapTestVariables, getDefaultArgv, HEDERA_PLATFORM_VERSION_TAG, TEST_CLUSTER } from '../../test_util.ts'
import { constants, logging } from '../../../src/core/index.ts'
import { sleep } from '../../../src/core/helpers.ts'
import * as version from '../../../version.ts'
import { MINUTES, SECONDS } from '../../../src/core/constants.ts'

describe('ClusterCommand', () => {
  // mock showUser and showJSON to silent logging during tests
  before(() => {
    sinon.stub(logging.SoloLogger.prototype, 'showUser')
    sinon.stub(logging.SoloLogger.prototype, 'showJSON')
  })

  after(() => {
    // @ts-ignore
    logging.SoloLogger.prototype.showUser.restore()
    // @ts-ignore
    logging.SoloLogger.prototype.showJSON.restore()
  })

  const testName = 'cluster-cmd-e2e'
  const namespace = testName
  const argv = getDefaultArgv()
  argv[flags.namespace.name] = namespace
  argv[flags.releaseTag.name] = HEDERA_PLATFORM_VERSION_TAG
  argv[flags.nodeAliasesUnparsed.name] = 'node1'
  argv[flags.generateGossipKeys.name] = true
  argv[flags.generateTlsKeys.name] = true
  argv[flags.clusterName.name] = TEST_CLUSTER
  argv[flags.soloChartVersion.name] = version.SOLO_CHART_VERSION
  argv[flags.force.name] = true
  // set the env variable SOLO_CHARTS_DIR if developer wants to use local Solo charts
  argv[flags.chartDirectory.name] = process.env.SOLO_CHARTS_DIR ?? undefined

  const bootstrapResp = bootstrapTestVariables(testName, argv)
  const k8 = bootstrapResp.opts.k8
  const configManager = bootstrapResp.opts.configManager
  const chartManager = bootstrapResp.opts.chartManager

  const clusterCmd = bootstrapResp.cmd.clusterCmd

  after(async function () {
    this.timeout(3 * MINUTES)

    await k8.deleteNamespace(namespace)
    argv[flags.clusterSetupNamespace.name] = constants.SOLO_SETUP_NAMESPACE
    configManager.update(argv)
    await clusterCmd.setup(argv) // restore solo-cluster-setup for other e2e tests to leverage
    do {
      await sleep(5 * SECONDS)
    } while (!await chartManager.isChartInstalled(constants.SOLO_SETUP_NAMESPACE, constants.SOLO_CLUSTER_SETUP_CHART))
  })

  beforeEach(() => {
    configManager.reset()
    configManager.update(argv)
  })

  // give a few ticks so that connections can close
  afterEach(async () => await sleep(5))

  it('should cleanup existing deployment', async () => {
    if (await chartManager.isChartInstalled(constants.SOLO_SETUP_NAMESPACE, constants.SOLO_CLUSTER_SETUP_CHART)) {
      expect(await clusterCmd.reset(argv)).to.be.true
    }
  }).timeout(MINUTES)

  it('solo cluster setup should fail with invalid cluster name', async () => {
    argv[flags.clusterSetupNamespace.name] = 'INVALID'
    configManager.update(argv)
    await expect(clusterCmd.setup(argv)).to.be.rejectedWith('Error on cluster setup')
  }).timeout(MINUTES)

  it('solo cluster setup should work with valid args', async () => {
    argv[flags.clusterSetupNamespace.name] = namespace
    configManager.update(argv)
    expect(await clusterCmd.setup(argv)).to.be.true
  }).timeout(MINUTES)

  it('function getClusterInfo should return true', () => {
    expect(clusterCmd.getClusterInfo()).to.be.ok
  }).timeout(MINUTES)

  it('function showClusterList should return right true', async () => {
    expect(clusterCmd.showClusterList()).to.be.ok
  }).timeout(MINUTES)

  it('function showInstalledChartList should return right true', async () => {
    // @ts-ignore
    await expect(clusterCmd.showInstalledChartList()).to.eventually.be.undefined
  }).timeout(MINUTES)

  // helm list would return an empty list if given invalid namespace
  it('solo cluster reset should fail with invalid cluster name', async () => {
    argv[flags.clusterSetupNamespace.name] = 'INVALID'
    configManager.update(argv)

    try {
      await expect(clusterCmd.reset(argv)).to.be.rejectedWith('Error on cluster reset')
    } catch (e) {
      clusterCmd.logger.showUserError(e)
      expect.fail()
    }
  }).timeout(MINUTES)

  it('solo cluster reset should work with valid args', async () => {
    argv[flags.clusterSetupNamespace.name] = namespace
    configManager.update(argv)
    expect(await clusterCmd.reset(argv)).to.be.true
  }).timeout(MINUTES)
})
