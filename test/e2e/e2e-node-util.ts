// SPDX-License-Identifier: Apache-2.0

import {after, afterEach, before, describe, it} from 'mocha';
import {expect} from 'chai';

import {Flags as flags} from '../../src/commands/flags.js';
import {
  accountCreationShouldSucceed,
  balanceQueryShouldSucceed,
  e2eTestSuite,
  getTestCluster,
  HEDERA_PLATFORM_VERSION_TAG,
} from '../test-util.js';
import {sleep} from '../../src/core/helpers.js';
import {type NodeAlias} from '../../src/types/aliases.js';
import {type ListrTaskWrapper} from 'listr2';
import {type ConfigManager} from '../../src/core/config-manager.js';
import {type K8Factory} from '../../src/core/kube/k8-factory.js';
import {NodeCommand} from '../../src/commands/node/index.js';
import {NodeCommandTasks} from '../../src/commands/node/tasks.js';
import {Duration} from '../../src/core/time/duration.js';
import {container} from 'tsyringe-neo';
import {NamespaceName} from '../../src/core/kube/resources/namespace/namespace-name.js';
import {type PodName} from '../../src/core/kube/resources/pod/pod-name.js';
import {PodRef} from '../../src/core/kube/resources/pod/pod-ref.js';
import {type NetworkNodes} from '../../src/core/network-nodes.js';
import {InjectTokens} from '../../src/core/dependency-injection/inject-tokens.js';
import {Argv} from '../helpers/argv-wrapper.js';
import {type Pod} from '../../src/core/kube/resources/pod/pod.js';

export function e2eNodeKeyRefreshTest(testName: string, mode: string, releaseTag = HEDERA_PLATFORM_VERSION_TAG) {
  const namespace = NamespaceName.of(testName);
  const argv = Argv.getDefaultArgv(namespace);
  argv.setArg(flags.namespace, namespace.name);
  argv.setArg(flags.releaseTag, releaseTag);
  argv.setArg(flags.nodeAliasesUnparsed, 'node1,node2,node3');
  argv.setArg(flags.generateGossipKeys, true);
  argv.setArg(flags.generateTlsKeys, true);
  argv.setArg(flags.clusterRef, getTestCluster());
  argv.setArg(flags.devMode, true);

  e2eTestSuite(testName, argv, {}, bootstrapResp => {
    const defaultTimeout = Duration.ofMinutes(2).toMillis();

    const {
      opts: {accountManager, k8Factory, remoteConfigManager, logger, commandInvoker},
      cmd: {nodeCmd},
    } = bootstrapResp;

    describe(`NodeCommand [testName ${testName}, mode ${mode}, release ${releaseTag}]`, async () => {
      afterEach(async function () {
        this.timeout(defaultTimeout);

        await nodeCmd.close();
        await accountManager.close();
      });

      after(async function () {
        this.timeout(Duration.ofMinutes(10).toMillis());

        await container.resolve<NetworkNodes>(InjectTokens.NetworkNodes).getLogs(namespace);
        await k8Factory.default().namespaces().delete(namespace);
      });

      describe(`Node should have started successfully [mode ${mode}, release ${releaseTag}]`, () => {
        balanceQueryShouldSucceed(accountManager, namespace, remoteConfigManager, logger);

        accountCreationShouldSucceed(accountManager, namespace, remoteConfigManager, logger);

        it(`Node Proxy should be UP [mode ${mode}, release ${releaseTag}`, async () => {
          try {
            const labels = ['app=haproxy-node1', 'solo.hedera.com/type=haproxy'];
            const readyPods: Pod[] = await k8Factory.default().pods().waitForReadyStatus(namespace, labels, 300, 1000);
            expect(readyPods).to.not.be.null;
            expect(readyPods).to.not.be.undefined;
            expect(readyPods.length).to.be.greaterThan(0);
          } catch (e) {
            logger.showUserError(e);
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

          const podName = await nodeRefreshTestSetup(argv, k8Factory, nodeAlias);
          if (mode === 'kill') {
            await k8Factory.default().pods().readByRef(PodRef.of(namespace, podName)).killPod();
          } else if (mode === 'stop') {
            await commandInvoker.invoke({
              argv: argv,
              command: NodeCommand.COMMAND_NAME,
              subcommand: 'stop',
              callback: async argv => nodeCmd.handlers.stop(argv),
            });

            await sleep(Duration.ofSeconds(20)); // give time for node to stop and update its logs
          } else {
            throw new Error(`invalid mode: ${mode}`);
          }
        });

        nodePodShouldBeRunning(nodeCmd, namespace, nodeAlias);

        nodeShouldNotBeActive(nodeCmd, nodeAlias);

        nodeRefreshShouldSucceed(nodeAlias, nodeCmd, argv);

        balanceQueryShouldSucceed(accountManager, namespace, remoteConfigManager, logger);

        accountCreationShouldSucceed(accountManager, namespace, remoteConfigManager, logger);
      });

      function nodePodShouldBeRunning(nodeCmd: NodeCommand, namespace: NamespaceName, nodeAlias: NodeAlias) {
        it(`${nodeAlias} should be running`, async () => {
          try {
            const nodeTasks = container.resolve(NodeCommandTasks);
            expect((await nodeTasks.checkNetworkNodePod(namespace, nodeAlias)).name.toString()).to.equal(
              `network-${nodeAlias}-0`,
            );
          } catch (e) {
            logger.showUserError(e);
            expect.fail();
          } finally {
            await nodeCmd.close();
          }
        }).timeout(defaultTimeout);
      }

      function nodeRefreshShouldSucceed(nodeAlias: NodeAlias, nodeCmd: NodeCommand, argv: Argv) {
        it(`${nodeAlias} refresh should succeed`, async () => {
          try {
            await commandInvoker.invoke({
              argv: argv,
              command: NodeCommand.COMMAND_NAME,
              subcommand: 'refresh',
              callback: async argv => nodeCmd.handlers.refresh(argv),
            });
          } catch (e) {
            logger.showUserError(e);
            expect.fail();
          } finally {
            await nodeCmd.close();
            await sleep(Duration.ofSeconds(10)); // sleep to wait for node to finish starting
          }
        }).timeout(Duration.ofMinutes(20).toMillis());
      }

      function nodeShouldNotBeActive(nodeCmd: NodeCommand, nodeAlias: NodeAlias) {
        const nodeTasks = container.resolve(NodeCommandTasks);
        it(`${nodeAlias} should not be ACTIVE`, async () => {
          expect(2);
          try {
            await expect(
              nodeTasks._checkNetworkNodeActiveness(
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

      async function nodeRefreshTestSetup(argv: Argv, k8Factory: K8Factory, nodeAliases: string) {
        argv.setArg(flags.nodeAliasesUnparsed, nodeAliases);
        const configManager: ConfigManager = container.resolve(InjectTokens.ConfigManager);
        configManager.update(argv.build());

        const podArray = await k8Factory
          .default()
          .pods()
          .list(configManager.getFlag(flags.namespace), [
            `app=network-${nodeAliases}`,
            'solo.hedera.com/type=network-node',
          ]);

        if (podArray.length > 0) {
          const podName: PodName = podArray[0].podRef.name;
          logger.info(`nodeRefreshTestSetup: podName: ${podName.name}`);
          return podName;
        }
        throw new Error(`pod for ${nodeAliases} not found`);
      }
    });
  });
}
