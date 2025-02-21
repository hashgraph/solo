/**
 * SPDX-License-Identifier: Apache-2.0
 */
import {after, afterEach, before, describe, it} from 'mocha';
import {expect} from 'chai';

import {Flags as flags} from '../../src/commands/flags.js';
import {
  accountCreationShouldSucceed,
  balanceQueryShouldSucceed,
  e2eTestSuite,
  HEDERA_PLATFORM_VERSION_TAG,
  TEST_CLUSTER,
} from '../test_util.js';
import {sleep} from '../../src/core/helpers.js';
import * as NodeCommandConfigs from '../../src/commands/node/configs.js';
import {type NodeAlias} from '../../src/types/aliases.js';
import {type ListrTaskWrapper} from 'listr2';
import {type ConfigManager} from '../../src/core/config_manager.js';
import {type K8Factory} from '../../src/core/kube/k8_factory.js';
import {type NodeCommand} from '../../src/commands/node/index.js';
import {Duration} from '../../src/core/time/duration.js';
import {container} from 'tsyringe-neo';
import {NamespaceName} from '../../src/core/kube/resources/namespace/namespace_name.js';
import {PodName} from '../../src/core/kube/resources/pod/pod_name.js';
import {PodRef} from '../../src/core/kube/resources/pod/pod_ref.js';
import {type NetworkNodes} from '../../src/core/network_nodes.js';
import {type V1Pod} from '@kubernetes/client-node';
import {InjectTokens} from '../../src/core/dependency_injection/inject_tokens.js';
import {Argv} from '../helpers/argv_wrapper.js';

export function e2eNodeKeyRefreshTest(testName: string, mode: string, releaseTag = HEDERA_PLATFORM_VERSION_TAG) {
  const namespace = NamespaceName.of(testName);
  const argv = Argv.getDefaultArgv(namespace);
  argv.setArg(flags.namespace, namespace.name);
  argv.setArg(flags.releaseTag, releaseTag);
  argv.setArg(flags.nodeAliasesUnparsed, 'node1,node2,node3');
  argv.setArg(flags.generateGossipKeys, true);
  argv.setArg(flags.generateTlsKeys, true);
  argv.setArg(flags.clusterRef, TEST_CLUSTER);
  argv.setArg(flags.devMode, true);
  argv.setArg(flags.chartDirectory, process.env.SOLO_CHARTS_DIR ?? undefined);
  argv.setArg(flags.quiet, true);

  e2eTestSuite(testName, argv, {}, bootstrapResp => {
    const defaultTimeout = Duration.ofMinutes(2).toMillis();

    describe(`NodeCommand [testName ${testName}, mode ${mode}, release ${releaseTag}]`, async () => {
      const accountManager = bootstrapResp.opts.accountManager;
      const k8Factory = bootstrapResp.opts.k8Factory;
      const nodeCmd = bootstrapResp.cmd.nodeCmd;

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
        balanceQueryShouldSucceed(accountManager, nodeCmd, namespace);

        accountCreationShouldSucceed(accountManager, nodeCmd, namespace);

        it(`Node Proxy should be UP [mode ${mode}, release ${releaseTag}`, async () => {
          try {
            const labels = ['app=haproxy-node1', 'solo.hedera.com/type=haproxy'];
            const readyPods: V1Pod[] = await k8Factory
              .default()
              .pods()
              .waitForReadyStatus(namespace, labels, 300, 1000);
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

          const podName = await nodeRefreshTestSetup(argv, k8Factory, nodeAlias);
          if (mode === 'kill') {
            await k8Factory.default().pods().readByRef(PodRef.of(namespace, podName)).killPod();
          } else if (mode === 'stop') {
            expect(await nodeCmd.handlers.stop(argv.build())).to.be.true;
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

      function nodePodShouldBeRunning(nodeCmd: NodeCommand, namespace: NamespaceName, nodeAlias: NodeAlias) {
        it(`${nodeAlias} should be running`, async () => {
          try {
            // @ts-ignore to access tasks which is a private property
            expect((await nodeCmd.tasks.checkNetworkNodePod(namespace, nodeAlias)).name.toString()).to.equal(
              `network-${nodeAlias}-0`,
            );
          } catch (e) {
            nodeCmd.logger.showUserError(e);
            expect.fail();
          } finally {
            await nodeCmd.close();
          }
        }).timeout(defaultTimeout);
      }

      function nodeRefreshShouldSucceed(nodeAlias: NodeAlias, nodeCmd: NodeCommand, argv: Argv) {
        it(`${nodeAlias} refresh should succeed`, async () => {
          try {
            expect(await nodeCmd.handlers.refresh(argv.build())).to.be.true;
            expect(nodeCmd.getUnusedConfigs(NodeCommandConfigs.REFRESH_CONFIGS_NAME)).to.deep.equal([
              flags.devMode.constName,
              flags.quiet.constName,
              'contexts',
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
          const podName = PodName.of(podArray[0].metadata.name);
          nodeCmd.logger.info(`nodeRefreshTestSetup: podName: ${podName.name}`);
          return podName;
        }
        throw new Error(`pod for ${nodeAliases} not found`);
      }
    });
  });
}
