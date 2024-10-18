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
import { it, describe, after, before, afterEach } from 'mocha'
import { expect } from 'chai'

import { flags } from '../../src/commands/index.ts'
import {
  accountCreationShouldSucceed,
  balanceQueryShouldSucceed,
  e2eTestSuite,
  getDefaultArgv,
  getTestConfigManager,
  HEDERA_PLATFORM_VERSION_TAG,
  TEST_CLUSTER
} from '../test_util.ts'
import { getNodeLogs, sleep } from '../../src/core/helpers.ts'
import { NodeCommand } from '../../src/commands/node.ts'
import { MINUTES, SECONDS } from '../../src/core/constants.ts'
import type { NodeAlias } from '../../src/types/aliases.ts'
import { NodeAliases } from '../../src/types/aliases.ts'
import type { ListrTaskWrapper } from 'listr2'
import type { K8 } from '../../src/core/index.ts'

export function e2eNodeKeyRefreshTest (testName: string, mode: string, releaseTag = HEDERA_PLATFORM_VERSION_TAG) {
  const namespace = testName
  const argv = getDefaultArgv()
  argv[flags.namespace.name] = namespace
  argv[flags.releaseTag.name] = releaseTag
  argv[flags.nodeAliasesUnparsed.name] = 'node1,node2,node3'
  argv[flags.generateGossipKeys.name] = true
  argv[flags.generateTlsKeys.name] = true
  argv[flags.clusterName.name] = TEST_CLUSTER
  argv[flags.devMode.name] = true
  // set the env variable SOLO_CHARTS_DIR if developer wants to use local Solo charts
  argv[flags.chartDirectory.name] = process.env.SOLO_CHARTS_DIR ?? undefined
  argv[flags.quiet.name] = true

  e2eTestSuite(testName, argv, undefined, undefined, undefined, undefined, undefined, undefined, true, (bootstrapResp) => {
    const defaultTimeout = 2 * MINUTES

    describe(`NodeCommand [testName ${testName}, mode ${mode}, release ${releaseTag}]`, async () => {
      const accountManager = bootstrapResp.opts.accountManager
      const k8 = bootstrapResp.opts.k8
      const nodeCmd = bootstrapResp.cmd.nodeCmd

      afterEach(async function () {
        this.timeout(defaultTimeout)

        await nodeCmd.close()
        await accountManager.close()
      })

      after(async function () {
        this.timeout(10 * MINUTES)

        await getNodeLogs(k8, namespace)
        await k8.deleteNamespace(namespace)
      })

      describe(`Node should have started successfully [mode ${mode}, release ${releaseTag}]`, () => {
        balanceQueryShouldSucceed(accountManager, nodeCmd, namespace)

        accountCreationShouldSucceed(accountManager, nodeCmd, namespace)

        it(`Node Proxy should be UP [mode ${mode}, release ${releaseTag}`, async () => {
          try {
            await expect(k8.waitForPodReady(
                ['app=haproxy-node1',
                  'solo.hedera.com/type=haproxy'],
                1, 300, 1000)).to.eventually.be.ok
          } catch (e) {
            nodeCmd.logger.showUserError(e)
            expect.fail()
          } finally {
            await nodeCmd.close()
          }
        }).timeout(defaultTimeout)
      })

      describe(`Node should refresh successfully [mode ${mode}, release ${releaseTag}]`, () => {
        const nodeAlias = 'node1'

        before(async function () {
          this.timeout(2 * MINUTES)

          const podName = await nodeRefreshTestSetup(argv, testName, k8, nodeAlias)
          if (mode === 'kill') {
            const resp = await k8.kubeClient.deleteNamespacedPod(podName,
                namespace)
            expect(resp.response.statusCode).to.equal(200)
            await sleep(20 * SECONDS) // sleep to wait for pod to finish terminating
          } else if (mode === 'stop') {
            await expect(nodeCmd.stop(argv)).to.eventually.be.ok
            await sleep(20 * SECONDS) // give time for node to stop and update its logs
          } else {
            throw new Error(`invalid mode: ${mode}`)
          }
        })

        nodePodShouldBeRunning(nodeCmd, namespace, nodeAlias)

        nodeShouldNotBeActive(nodeCmd, nodeAlias)

        nodeRefreshShouldSucceed(nodeAlias, nodeCmd, argv)

        balanceQueryShouldSucceed(accountManager, nodeCmd, namespace)

        accountCreationShouldSucceed(accountManager, nodeCmd, namespace)
      })

      function nodePodShouldBeRunning (nodeCmd: NodeCommand, namespace: string, nodeAlias: NodeAlias) {
        it(`${nodeAlias} should be running`, async () => {
          try {
            // @ts-ignore to access tasks which is a private property
            await expect(nodeCmd.tasks.checkNetworkNodePod(namespace,
                nodeAlias)).to.eventually.be.ok
          } catch (e) {
            nodeCmd.logger.showUserError(e)
            expect.fail()
          } finally {
            await nodeCmd.close()
          }
        }).timeout(defaultTimeout)
      }

      function nodeRefreshShouldSucceed (nodeAlias: NodeAlias, nodeCmd: NodeCommand, argv: Record<any, any>) {
        it(`${nodeAlias} refresh should succeed`, async () => {
          try {
            await expect(nodeCmd.refresh(argv)).to.eventually.be.ok
            expect(nodeCmd.getUnusedConfigs(
                NodeCommand.REFRESH_CONFIGS_NAME)).to.deep.equal([
              flags.devMode.constName,
              flags.quiet.constName
            ])
          } catch (e) {
            nodeCmd.logger.showUserError(e)
            expect.fail()
          } finally {
            await nodeCmd.close()
            await sleep(10 * SECONDS) // sleep to wait for node to finish starting
          }
        }).timeout(20 * MINUTES)
      }

      function nodeShouldNotBeActive (nodeCmd: NodeCommand, nodeAlias: NodeAlias) {
        it(`${nodeAlias} should not be ACTIVE`, async () => {
          expect(2)
          try {
            await expect(
                nodeCmd.checkNetworkNodeActiveness(namespace, nodeAlias, { title: '' } as ListrTaskWrapper<any, any, any>,
                    '', 44, undefined, 15)
            ).to.be.rejected
          } catch (e) {
            expect(e).not.to.be.null
          } finally {
            await nodeCmd.close()
          }
        }).timeout(defaultTimeout)
      }

      async function nodeRefreshTestSetup (argv: Record<any, any>, testName: string, k8: K8, nodeAliases: string) {
        argv[flags.nodeAliasesUnparsed.name] = nodeAliases
        const configManager = getTestConfigManager(`${testName}-solo.yaml`)
        configManager.update(argv, true)

        const podArray = await k8.getPodsByLabel(
            [`app=network-${nodeAliases}`,
              'solo.hedera.com/type=network-node'])

        if (podArray.length > 0) {
          const podName = podArray[0].metadata.name
          k8.logger.info(`nodeRefreshTestSetup: podName: ${podName}`)
          return podName
        }
        throw new Error(`pod for ${nodeAliases} not found`)

      }
    })
  })
}
