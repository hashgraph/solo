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
import { flags } from '../../../src/commands/index.mjs'
import {
  accountCreationShouldSucceed,
  balanceQueryShouldSucceed,
  bootstrapNetwork,
  getDefaultArgv,
  HEDERA_PLATFORM_VERSION_TAG,
  TEST_CLUSTER
} from '../../test_util.js'
import * as version from '../../../version.mjs'
import { getNodeLogs, sleep } from '../../../src/core/helpers.mjs'
import { MirrorNodeCommand } from '../../../src/commands/mirror_node.mjs'
import * as core from '../../../src/core/index.mjs'
import { Status, TopicCreateTransaction, TopicMessageSubmitTransaction } from '@hashgraph/sdk'
import * as http from 'http'
import { MINUTES, SECONDS } from '../../../src/core/constants.mjs'

describe('MirrorNodeCommand', () => {
  const testName = 'mirror-cmd-e2e'
  const namespace = testName

  const argv = getDefaultArgv()
  argv[flags.namespace.name] = namespace
  argv[flags.releaseTag.name] = HEDERA_PLATFORM_VERSION_TAG

  argv[flags.nodeIDs.name] = 'node1' // use a single node to reduce resource during e2e tests
  argv[flags.generateGossipKeys.name] = true
  argv[flags.generateTlsKeys.name] = true
  argv[flags.clusterName.name] = TEST_CLUSTER
  argv[flags.fstChartVersion.name] = version.FST_CHART_VERSION
  argv[flags.force.name] = true
  argv[flags.relayReleaseTag.name] = flags.relayReleaseTag.definition.defaultValue
  // set the env variable SOLO_FST_CHARTS_DIR if developer wants to use local FST charts
  argv[flags.chartDirectory.name] = process.env.SOLO_FST_CHARTS_DIR ?? undefined
  argv[flags.quiet.name] = true

  const bootstrapResp = bootstrapNetwork(testName, argv)
  const k8 = bootstrapResp.opts.k8
  const mirrorNodeCmd = new MirrorNodeCommand(bootstrapResp.opts)
  const downloader = new core.PackageDownloader(mirrorNodeCmd.logger)
  const accountManager = bootstrapResp.opts.accountManager

  const testMessage = 'Mirror node test message'
  let portForwarder = null
  let newTopicId = null

  before(() => {
    bootstrapResp.opts.logger.showUser(`------------------------- START: ${testName} ----------------------------`)
  })

  after(async function () {
    this.timeout(3 * MINUTES)

    await getNodeLogs(k8, namespace)
    await k8.deleteNamespace(namespace)
    await accountManager.close()

    bootstrapResp.opts.logger.showUser(`------------------------- END: ${testName} ----------------------------`)
  })

  // give a few ticks so that connections can close
  afterEach(async () => await sleep(500))

  balanceQueryShouldSucceed(accountManager, mirrorNodeCmd, namespace)

  it('mirror node deploy should success', async () => {
    try {
      await expect(mirrorNodeCmd.deploy(argv)).to.eventually.be.ok
    } catch (e) {
      mirrorNodeCmd.logger.showUserError(e)
      expect(e).to.be.null
    }

    expect(mirrorNodeCmd.getUnusedConfigs(MirrorNodeCommand.DEPLOY_CONFIGS_NAME)).to.deep.equal([
      flags.hederaExplorerTlsHostName.constName,
      flags.hederaExplorerTlsLoadBalancerIp.constName,
      flags.profileFile.constName,
      flags.profileName.constName,
      flags.quiet.constName,
      flags.tlsClusterIssuerType.constName
    ])
  }).timeout(10 * MINUTES)

  it('mirror node API should be running', async () => {
    await accountManager.loadNodeClient(namespace)
    try {
      // find hedera explorer pod
      const pods = await k8.getPodsByLabel(['app.kubernetes.io/name=hedera-explorer'])
      const explorerPod = pods[0]

      portForwarder = await k8.portForward(explorerPod.metadata.name, 8_080, 8_080)
      await sleep(2 * SECONDS)

      // check if mirror node api server is running
      const apiURL = 'http://127.0.0.1:8080/api/v1/transactions'
      await expect(downloader.urlExists(apiURL)).to.eventually.be.ok
      await sleep(2 * SECONDS)
    } catch (e) {
      mirrorNodeCmd.logger.showUserError(e)
      expect(e).to.be.null
    }
  }).timeout(1 * MINUTES)

  it('Explorer GUI should be running', async () => {
    try {
      const guiURL = 'http://127.0.0.1:8080/localnet/dashboard'
      await expect(downloader.urlExists(guiURL)).to.eventually.be.ok
      await sleep(2 * SECONDS)

      mirrorNodeCmd.logger.debug('mirror node API and explorer GUI are running')
    } catch (e) {
      mirrorNodeCmd.logger.showUserError(e)
      expect(e).to.be.null
    }
  }).timeout(1 * MINUTES)

  it('Create topic and submit message should success', async () => {
    try {
      // Create a new public topic and submit a message
      const txResponse = await new TopicCreateTransaction().execute(accountManager._nodeClient)
      const receipt = await txResponse.getReceipt(accountManager._nodeClient)
      newTopicId = receipt.topicId
      mirrorNodeCmd.logger.debug(`Newly created topic ID is: ${newTopicId}`)

      const submitResponse = await new TopicMessageSubmitTransaction({
        topicId: newTopicId,
        message: testMessage
      }).execute(accountManager._nodeClient)

      const submitReceipt = await submitResponse.getReceipt(accountManager._nodeClient)
      expect(submitReceipt.status).to.equal(Status.Success)
    } catch (e) {
      mirrorNodeCmd.logger.showUserError(e)
      expect(e).to.be.null
    }
  }).timeout(1 * MINUTES)

  // trigger some extra transactions to trigger MirrorNode to fetch the transactions
  accountCreationShouldSucceed(accountManager, mirrorNodeCmd, namespace)
  accountCreationShouldSucceed(accountManager, mirrorNodeCmd, namespace)

  it('Check submit message result should success', async () => {
    try {
      const queryURL = `http://localhost:8080/api/v1/topics/${newTopicId}/messages`
      let received = false
      let receivedMessage = ''

      // wait until the transaction reached consensus and retrievable from the mirror node API
      while (!received) {
        const req = http.request(queryURL,
          { method: 'GET', timeout: 100, headers: { Connection: 'close' } },
          (res) => {
            res.setEncoding('utf8')
            res.on('data', (chunk) => {
              // convert chunk to json object
              const obj = JSON.parse(chunk)
              if (obj.messages.length === 0) {
                mirrorNodeCmd.logger.debug('No messages yet')
              } else {
                // convert message from base64 to utf-8
                const base64 = obj.messages[0].message
                const buff = Buffer.from(base64, 'base64')
                receivedMessage = buff.toString('utf-8')
                mirrorNodeCmd.logger.debug(`Received message: ${receivedMessage}`)
                received = true
              }
            })
          })
        req.on('error', (e) => {
          mirrorNodeCmd.logger.debug(`problem with request: ${e.message}`)
        })
        req.end() // make the request
        await sleep(2 * SECONDS)
      }
      await sleep(SECONDS)
      expect(receivedMessage).to.equal(testMessage)
      await k8.stopPortForward(portForwarder)
    } catch (e) {
      mirrorNodeCmd.logger.showUserError(e)
      expect(e).to.be.null
    }
  }).timeout(5 * MINUTES)

  it('mirror node destroy should success', async () => {
    try {
      await expect(mirrorNodeCmd.destroy(argv)).to.eventually.be.ok
    } catch (e) {
      mirrorNodeCmd.logger.showUserError(e)
      expect(e).to.be.null
    }
  }).timeout(1 * MINUTES)

  it('should apply the mirror node version from the --mirror-node-version flag', async () => {
    const mirrorNodeVersion = '0.111.1'
    const customArgv = { [flags.mirrorNodeVersion.constName]: mirrorNodeVersion, ...argv }

    const valuesArg = await mirrorNodeCmd.prepareValuesArg(customArgv)

    expect(valuesArg).to.contain(`--set global.image.tag=${mirrorNodeVersion}`)
  }).timeout(5 * SECONDS)

  it('should not apply the mirror node version from the --mirror-node-version flag if left empty', async () => {
    const mirrorNodeVersion = ''
    const customArgv = { [flags.mirrorNodeVersion.constName]: mirrorNodeVersion, ...argv }

    const valuesArg = await mirrorNodeCmd.prepareValuesArg(customArgv)

    expect(valuesArg).not.to.contain('--set global.image.tag=')
  }).timeout(5 * SECONDS)
})
