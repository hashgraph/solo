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
import {it, describe, after, before, afterEach} from 'mocha';
import {expect} from 'chai';

import {Flags as flags} from '../../src/commands/flags.js';
import {
  accountCreationShouldSucceed,
  balanceQueryShouldSucceed,
  e2eTestSuite,
  getDefaultArgv,
  HEDERA_PLATFORM_VERSION_TAG,
  TEST_CLUSTER,
  testLogger,
} from '../test_util.js';
import {sleep} from '../../src/core/helpers.js';
import * as NodeCommandConfigs from '../../src/commands/node/configs.js';
import type {NodeAlias} from '../../src/types/aliases.js';
import type {ListrTaskWrapper} from 'listr2';
import {ConfigManager} from '../../src/core/config_manager.js';
import {type K8} from '../../src/core/k8.js';
import {type NodeCommand} from '../../src/commands/node/index.js';
import {Duration} from '../../src/core/time/duration.js';
import {StatusCodes} from 'http-status-codes';

export function e2eNodeKeyRefreshTest(testName: string, mode: string, releaseTag = HEDERA_PLATFORM_VERSION_TAG) {
  const namespace = testName;
  const argv = getDefaultArgv();
  argv[flags.namespace.name] = namespace;
  argv[flags.releaseTag.name] = releaseTag;
  argv[flags.nodeAliasesUnparsed.name] = 'node1,node2,node3';
  argv[flags.generateGossipKeys.name] = true;
  argv[flags.generateTlsKeys.name] = true;
  argv[flags.clusterName.name] = TEST_CLUSTER;
  argv[flags.devMode.name] = true;
  // set the env variable SOLO_CHARTS_DIR if developer wants to use local Solo charts
  argv[flags.chartDirectory.name] = process.env.SOLO_CHARTS_DIR ?? undefined;
  argv[flags.quiet.name] = true;

  e2eTestSuite(
    testName,
    argv,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    true,
    bootstrapResp => {
      const defaultTimeout = Duration.ofMinutes(2).toMillis();

      describe(`NodeCommand [testName ${testName}, mode ${mode}, release ${releaseTag}]`, async () => {
        const accountManager = bootstrapResp.opts.accountManager;
        const k8 = bootstrapResp.opts.k8;
        const nodeCmd = bootstrapResp.cmd.nodeCmd;

        afterEach(async function () {
          this.timeout(defaultTimeout);

          await nodeCmd.close();
          await accountManager.close();
        });

        after(async function () {
          this.timeout(Duration.ofMinutes(10).toMillis());

          await k8.getNodeLogs(namespace);
          await k8.deleteNamespace(namespace);
        });

        describe(`Node should have started successfully [mode ${mode}, release ${releaseTag}]`, () => {
          balanceQueryShouldSucceed(accountManager, nodeCmd, namespace);

          accountCreationShouldSucceed(accountManager, nodeCmd, namespace);

          it(`Node Proxy should be UP [mode ${mode}, release ${releaseTag}`, async () => {
            try {
              const labels = ['app=haproxy-node1', 'solo.hedera.com/type=haproxy'];
              const readyPods = await k8.waitForPodReady(labels, 1, 300, 1000);
              expect(readyPods).to.not.be.null;
              expect(readyPods).to.not.be.undefined;
              expect(readyPods.length).to.be.greaterThan(0);
            } catch (e) {
              nodeCmd.logger.showUserError(e);
              expect.fail();
            } finally {
              await nodeCmd.close();
            }
          }).timeout(defaultTimeout);
        });

        describe(`Node should refresh successfully [mode ${mode}, release ${releaseTag}]`, () => {
          const nodeAlias = 'node1';

          before(async function () {
            this.timeout(Duration.ofMinutes(2).toMillis());

            const podName = await nodeRefreshTestSetup(argv, testName, k8, nodeAlias);
            if (mode === 'kill') {
              const resp = await k8.kubeClient.deleteNamespacedPod(podName, namespace);
              expect(resp.response.statusCode).to.equal(StatusCodes.OK);
              await sleep(Duration.ofSeconds(20)); // sleep to wait for pod to finish terminating
            } else if (mode === 'stop') {
              expect(await nodeCmd.handlers.stop(argv)).to.be.true;
              await sleep(Duration.ofSeconds(20)); // give time for node to stop and update its logs
            } else {
              throw new Error(`invalid mode: ${mode}`);
            }
          });

          nodePodShouldBeRunning(nodeCmd, namespace, nodeAlias);

          nodeShouldNotBeActive(nodeCmd, nodeAlias);

          nodeRefreshShouldSucceed(nodeAlias, nodeCmd, argv);

          balanceQueryShouldSucceed(accountManager, nodeCmd, namespace);

          accountCreationShouldSucceed(accountManager, nodeCmd, namespace);
        });

        function nodePodShouldBeRunning(nodeCmd: NodeCommand, namespace: string, nodeAlias: NodeAlias) {
          it(`${nodeAlias} should be running`, async () => {
            try {
              // @ts-ignore to access tasks which is a private property
              expect(await nodeCmd.tasks.checkNetworkNodePod(namespace, nodeAlias)).to.equal(`network-${nodeAlias}-0`);
            } catch (e) {
              nodeCmd.logger.showUserError(e);
              expect.fail();
            } finally {
              await nodeCmd.close();
            }
          }).timeout(defaultTimeout);
        }

        function nodeRefreshShouldSucceed(nodeAlias: NodeAlias, nodeCmd: NodeCommand, argv: Record<any, any>) {
          it(`${nodeAlias} refresh should succeed`, async () => {
            try {
              expect(await nodeCmd.handlers.refresh(argv)).to.be.true;
              expect(nodeCmd.getUnusedConfigs(NodeCommandConfigs.REFRESH_CONFIGS_NAME)).to.deep.equal([
                flags.devMode.constName,
                flags.quiet.constName,
              ]);
            } catch (e) {
              nodeCmd.logger.showUserError(e);
              expect.fail();
            } finally {
              await nodeCmd.close();
              await sleep(Duration.ofSeconds(10)); // sleep to wait for node to finish starting
            }
          }).timeout(Duration.ofMinutes(20).toMillis());
        }

        function nodeShouldNotBeActive(nodeCmd: NodeCommand, nodeAlias: NodeAlias) {
          it(`${nodeAlias} should not be ACTIVE`, async () => {
            expect(2);
            try {
              await expect(
                nodeCmd.tasks._checkNetworkNodeActiveness(
                  namespace,
                  nodeAlias,
                  {title: ''} as ListrTaskWrapper<any, any, any>,
                  '',
                  44,
                  undefined,
                  15,
                ),
              ).to.be.rejected;
            } catch (e) {
              expect(e).not.to.be.null;
            } finally {
              await nodeCmd.close();
            }
          }).timeout(defaultTimeout);
        }

        async function nodeRefreshTestSetup(argv: Record<any, any>, testName: string, k8: K8, nodeAliases: string) {
          argv[flags.nodeAliasesUnparsed.name] = nodeAliases;
          const configManager = new ConfigManager(testLogger);
          configManager.update(argv);

          const podArray = await k8.getPodsByLabel([`app=network-${nodeAliases}`, 'solo.hedera.com/type=network-node']);

          if (podArray.length > 0) {
            const podName = podArray[0].metadata.name;
            k8.logger.info(`nodeRefreshTestSetup: podName: ${podName}`);
            return podName;
          }
          throw new Error(`pod for ${nodeAliases} not found`);
        }
      });
    },
  );
}
