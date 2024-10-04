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

import { bootstrapTestVariables, getDefaultArgv, HEDERA_PLATFORM_VERSION_TAG, TEST_CLUSTER } from '../../test_util.js'
import { constants, logging } from '../../../src/core/index.mjs'
import { flags } from '../../../src/commands/index.mjs'
import { sleep } from '../../../src/core/helpers.mjs'
import * as version from '../../../version.mjs'
import { MINUTES, SECONDS } from '../../../src/core/constants.mjs';

describe('ClusterCommand', () => {
  // mock showUser and showJSON to silent logging during tests
  before(() => {
    sinon.stub(logging.SoloLogger.prototype, 'showUser')
    sinon.stub(logging.SoloLogger.prototype, 'showJSON')
  })

  after(() => {
    logging.SoloLogger.prototype.showUser.restore()
    logging.SoloLogger.prototype.showJSON.restore()
  })

  const testName = 'cluster-cmd-e2e'
  const namespace = testName

  const argv = getDefaultArgv()
  argv[flags.namespace.name] = namespace
  argv[flags.releaseTag.name] = HEDERA_PLATFORM_VERSION_TAG
  argv[flags.nodeIDs.name] = 'node1'
  argv[flags.generateGossipKeys.name] = true
  argv[flags.generateTlsKeys.name] = true
  argv[flags.clusterName.name] = TEST_CLUSTER
  argv[flags.fstChartVersion.name] = version.FST_CHART_VERSION
  argv[flags.force.name] = true
  // set the env variable SOLO_FST_CHARTS_DIR if developer wants to use local FST charts
  argv[flags.chartDirectory.name] = process.env.SOLO_FST_CHARTS_DIR ?? undefined

  const bootstrapResp = bootstrapTestVariables(testName, argv)
  const k8 = bootstrapResp.opts.k8
  const configManager = bootstrapResp.opts.configManager
  const chartManager = bootstrapResp.opts.chartManager

  const clusterCmd = bootstrapResp.cmd.clusterCmd

  after(async function () {
    this.timeout(3 * MINUTES)

    await k8.deleteNamespace(namespace)
    argv[flags.clusterSetupNamespace.name] = constants.FULLSTACK_SETUP_NAMESPACE
    configManager.update(argv, true)
    await clusterCmd.setup(argv) // restore fullstack-cluster-setup for other e2e tests to leverage
    do {
      await sleep(5 * SECONDS)
    } while (!await chartManager.isChartInstalled(constants.FULLSTACK_SETUP_NAMESPACE, constants.FULLSTACK_CLUSTER_SETUP_CHART))
  })

  beforeEach(() => configManager.reset())

  // give a few ticks so that connections can close
  afterEach(async () => await sleep(5))

  it('should cleanup existing deployment', async () => {
    if (await chartManager.isChartInstalled(constants.FULLSTACK_SETUP_NAMESPACE, constants.FULLSTACK_CLUSTER_SETUP_CHART)) {
      await expect(clusterCmd.reset(argv)).to.be.ok
    }
  }).timeout(1 * MINUTES)

  it('solo cluster setup should fail with invalid cluster name', async () => {
    argv[flags.clusterSetupNamespace.name] = 'INVALID'
    configManager.update(argv, true)
    await expect(clusterCmd.setup(argv)).to.eventually.be.rejectedWith('Error on cluster setup')
  }).timeout(1 * MINUTES)

  it('solo cluster setup should work with valid args', async () => {
    argv[flags.clusterSetupNamespace.name] = namespace
    configManager.update(argv, true)
    await expect(clusterCmd.setup(argv)).to.eventually.be.ok
  }).timeout(1 * MINUTES)

  it('function getClusterInfo should return true', async () => {
    await expect(clusterCmd.getClusterInfo()).to.eventually.be.ok
  }).timeout(1 * MINUTES)

  it('function showClusterList should return right true', async () => {
    await expect(clusterCmd.showClusterList()).to.eventually.be.ok
  }).timeout(1 * MINUTES)

  it('function showInstalledChartList should return right true', async () => {
    await expect(clusterCmd.showInstalledChartList()).to.eventually.be.undefined
  }).timeout(1 * MINUTES)

  // helm list would return an empty list if given invalid namespace
  it('solo cluster reset should fail with invalid cluster name', async () => {
    argv[flags.clusterSetupNamespace.name] = 'INVALID'
    configManager.update(argv, true)

    try {
      await expect(clusterCmd.reset(argv)).to.eventually.be.rejectedWith('Error on cluster reset')
    } catch (e) {
      clusterCmd.logger.showUserError(e)
      expect(e).to.be.null
    }
  }).timeout(1 * MINUTES)

  it('solo cluster reset should work with valid args', async () => {
    argv[flags.clusterSetupNamespace.name] = namespace
    configManager.update(argv, true)
    await expect(clusterCmd.reset(argv)).to.eventually.be.ok
  }).timeout(1 * MINUTES)
})
