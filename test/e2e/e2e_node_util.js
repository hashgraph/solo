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
  afterEach,
  beforeAll,
  describe,
  expect,
  it
} from '@jest/globals'
import { flags } from '../../src/commands/index.mjs'
import {
  accountCreationShouldSucceed,
  balanceQueryShouldSucceed,
  bootstrapNetwork,
  getDefaultArgv,
  getTestConfigManager,
  HEDERA_PLATFORM_VERSION_TAG,
  TEST_CLUSTER
} from '../test_util.js'
import { getNodeLogs, sleep } from '../../src/core/helpers.mjs'
import { NodeCommand } from '../../src/commands/node/index.mjs'
import * as NodeCommandConfigs from "../../src/commands/node/configs.mjs";

export function e2eNodeKeyRefreshTest (testName, mode, releaseTag = HEDERA_PLATFORM_VERSION_TAG) {
  const defaultTimeout = 120000

  describe(
      `NodeCommand [testName ${testName}, mode ${mode}, release ${releaseTag}]`,
      () => {
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
        argv[flags.chartDirectory.name] = process.env.SOLO_CHARTS_DIR
          ? process.env.SOLO_CHARTS_DIR
          : undefined
        argv[flags.quiet.name] = true

        const bootstrapResp = bootstrapNetwork(testName, argv)
        const accountManager = bootstrapResp.opts.accountManager
        const k8 = bootstrapResp.opts.k8
        const nodeCmd = bootstrapResp.cmd.nodeCmd

        afterEach(async () => {
          await nodeCmd.close()
          await accountManager.close()
        }, defaultTimeout)

        afterAll(async () => {
          await getNodeLogs(k8, namespace)
          await k8.deleteNamespace(namespace)
        }, 600000)

        describe(
            `Node should have started successfully [mode ${mode}, release ${releaseTag}]`,
            () => {
              balanceQueryShouldSucceed(accountManager, nodeCmd, namespace)

              accountCreationShouldSucceed(accountManager, nodeCmd, namespace)

              it(`Node Proxy should be UP [mode ${mode}, release ${releaseTag}`,
                async () => {
                  expect.assertions(1)

                  try {
                    await expect(k8.waitForPodReady(
                      ['app=haproxy-node1',
                        'solo.hedera.com/type=haproxy'],
                      1, 300, 1000)).resolves.toBeTruthy()
                  } catch (e) {
                    nodeCmd.logger.showUserError(e)
                    expect(e).toBeNull()
                  } finally {
                    await nodeCmd.close()
                  }
                }, defaultTimeout)
            })

        describe(
            `Node should refresh successfully [mode ${mode}, release ${releaseTag}]`,
            () => {
              const nodeAlias = 'node1'

              beforeAll(async () => {
                const podName = await nodeRefreshTestSetup(argv, testName, k8,
                  nodeAlias)
                if (mode === 'kill') {
                  const resp = await k8.kubeClient.deleteNamespacedPod(podName,
                    namespace)
                  expect(resp.response.statusCode).toEqual(200)
                  await sleep(20000) // sleep to wait for pod to finish terminating
                } else if (mode === 'stop') {
                  await expect(nodeCmd.handlers.stop(argv)).resolves.toBeTruthy()
                  await sleep(20000) // give time for node to stop and update its logs
                } else {
                  throw new Error(`invalid mode: ${mode}`)
                }
              }, 120000)

              nodePodShouldBeRunning(nodeCmd, namespace, nodeAlias)

              nodeShouldNotBeActive(nodeCmd, nodeAlias)

              nodeRefreshShouldSucceed(nodeAlias, nodeCmd, argv)

              balanceQueryShouldSucceed(accountManager, nodeCmd, namespace)

              accountCreationShouldSucceed(accountManager, nodeCmd, namespace)
            })

        function nodePodShouldBeRunning (nodeCmd, namespace, nodeAlias) {
          it(`${nodeAlias} should be running`, async () => {
            try {
              await expect(nodeCmd.tasks.checkNetworkNodePod(namespace,
                nodeAlias)).resolves.toBeTruthy()
            } catch (e) {
              nodeCmd.logger.showUserError(e)
              expect(e).toBeNull()
            } finally {
              await nodeCmd.close()
            }
          }, defaultTimeout)
        }

        function nodeRefreshShouldSucceed (nodeAlias, nodeCmd, argv) {
          it(`${nodeAlias} refresh should succeed`, async () => {
            try {
              await expect(nodeCmd.handlers.refresh(argv)).resolves.toBeTruthy()
              expect(nodeCmd.getUnusedConfigs(
                  NodeCommandConfigs.REFRESH_CONFIGS_NAME)).toEqual(
                [flags.devMode.constName,
                  flags.quiet.constName])
            } catch (e) {
              nodeCmd.logger.showUserError(e)
              expect(e).toBeNull()
            } finally {
              await nodeCmd.close()
              await sleep(10000) // sleep to wait for node to finish starting
            }
          }, 1200000)
        }

        function nodeShouldNotBeActive (nodeCmd, nodeAlias) {
          it(`${nodeAlias} should not be ACTIVE`, async () => {
            expect(2)
            try {
              await expect(
                nodeCmd.tasks._checkNetworkNodeActiveness(namespace, nodeAlias, { title: '' }, '', 44, undefined, 15)
              ).rejects.toThrowError()
            } catch (e) {
              expect(e).not.toBeNull()
            } finally {
              await nodeCmd.close()
            }
          }, defaultTimeout)
        }

        async function nodeRefreshTestSetup (argv, testName, k8, nodeAliases) {
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
          } else {
            throw new Error(`pod for ${nodeAliases} not found`)
          }
        }
      })
}
