// SPDX-License-Identifier: Apache-2.0

import {describe, it} from 'mocha';
import {expect} from 'chai';
import fs from 'node:fs';
import {container} from 'tsyringe-neo';

import {main} from '../../../src/index.js';
import {Duration} from '../../../src/core/time/duration.js';
import {InjectTokens} from '../../../src/core/dependency-injection/inject-tokens.js';
import * as constants from '../../../src/core/constants.js';
import {DEFAULT_LOCAL_CONFIG_FILE} from '../../../src/core/constants.js';
import {PathEx} from '../../../src/business/utils/path-ex.js';
import {Flags} from '../../../src/commands/flags.js';
import {ConsensusCommandDefinition} from '../../../src/commands/command-definitions/consensus-command-definition.js';
import {DeploymentCommandDefinition} from '../../../src/commands/command-definitions/deployment-command-definition.js';
import {EndToEndTestSuiteBuilder} from '../end-to-end-test-suite-builder.js';
import {type EndToEndTestSuite} from '../end-to-end-test-suite.js';
import {type BaseTestOptions} from './tests/base-test-options.js';
import {BaseCommandTest} from './tests/base-command-test.js';
import {resetForTest} from '../../test-container.js';
import {type K8ClientFactory} from '../../../src/integration/kube/k8-client/k8-client-factory.js';
import {type K8Factory} from '../../../src/integration/kube/k8-factory.js';
import {type K8} from '../../../src/integration/kube/k8.js';
import {type Pod} from '../../../src/integration/kube/resources/pod/pod.js';
import {type ChartManager} from '../../../src/core/chart-manager.js';
import {type ConsensusChartOrchestrator} from '../../../src/core/consensus-chart-orchestrator.js';
import {ClusterReferenceTest} from './tests/cluster-reference-test.js';
import {DeploymentTest} from './tests/deployment-test.js';
import {ConsensusNodeTest} from './tests/consensus-node-test.js';
import {NetworkTest} from './tests/network-test.js';
import {AccountTest} from './tests/account-test.js';
import {Templates} from '../../../src/core/templates.js';
import {type NodeAlias} from '../../../src/types/aliases.js';
import {sleep} from '../../../src/core/helpers.js';
import {TEST_UPGRADE_FROM_VERSION} from '../../../version-test.js';
import {NetworkNodeLifecycle} from '../../../src/core/network-node-lifecycle.js';

/**
 * Proves both halves of the chart-layout policy: an existing umbrella deployment survives a
 * `consensus network upgrade` with `EXPERIMENTAL_PER_CONSENSUS_NODE_CHART` **set** and is still
 * umbrella afterwards, while a brand-new deployment created with the flag set really is split and
 * the whole node lifecycle works against it. The flag applies only at first creation, because the
 * single chart cannot be deprecated yet.
 *
 *     SOLO_CHARTS_DIR=<solo-charts>/charts task test-e2e-consensus-chart-layout
 */
const testName: string = 'consensus-chart-layout';

/** `helm list` entries are formatted as `<release> [<chart>]`; this recovers the release name. */
function releaseNames(installed: string[]): string[] {
  return installed.map((entry: string): string => entry.split(' ', 1)[0]);
}

const endToEndTestSuite: EndToEndTestSuite = new EndToEndTestSuiteBuilder()
  .withTestName(testName)
  .withTestSuiteName('Consensus Chart Layout Suite')
  .withNamespace(testName)
  .withDeployment(`${testName}-deployment`)
  .withClusterCount(1)
  .withConsensusNodesCount(2)
  .withLoadBalancerEnabled(false)
  // TSS adds several minutes of key generation and is orthogonal to which chart renders a node.
  .withTssEnabled(false)
  .withTestSuiteCallback(
    (options: BaseTestOptions, preDestroy: (endToEndTestSuiteInstance: EndToEndTestSuite) => Promise<void>): void => {
      describe('Consensus Chart Layout E2E Test', (): void => {
        const {testCacheDirectory, testLogger, namespace, contexts, deployment, consensusNodesCount} = options;

        const nodeAliases: NodeAlias[] = Array.from({length: consensusNodesCount}, (_, index: number): NodeAlias =>
          Templates.renderNodeAliasFromNumber(index + 1),
        );
        const perNodeReleaseNames: string[] = nodeAliases.map(
          (nodeAlias: NodeAlias): string => `${constants.CONSENSUS_NODE_CHART}-${nodeAlias}`,
        );

        async function installedReleaseNames(): Promise<string[]> {
          const chartManager: ChartManager = container.resolve<ChartManager>(InjectTokens.ChartManager);
          return releaseNames(await chartManager.getInstalledCharts(namespace, contexts[0]));
        }

        /** Asserts which of the two kinds of release the namespace currently holds. */
        async function expectReleases(expected: {shared: boolean; perNode: boolean}, why: string): Promise<void> {
          const releases: string[] = await installedReleaseNames();

          const expectRelease: (releaseName: string, present: boolean) => void = (
            releaseName: string,
            present: boolean,
          ): void => {
            const assertion: Chai.Assertion = expect(releases, `${why}: ${releaseName}`);
            (present ? assertion.to : assertion.to.not).include(releaseName);
          };

          expectRelease(constants.SOLO_DEPLOYMENT_CHART, expected.shared);
          for (const releaseName of perNodeReleaseNames) {
            expectRelease(releaseName, expected.perNode);
          }
        }

        /**
         * The orchestrator caches the layout for the life of the process, which is right for a CLI
         * invocation but wrong for a suite that destroys and redeploys in one. Every phase boundary
         * clears it so the next phase reads the cluster rather than the previous phase's answer.
         */
        function forgetCachedLayout(): void {
          container.resolve<ConsensusChartOrchestrator>(InjectTokens.ConsensusChartOrchestrator).invalidateAll();
        }

        function networkDestroyArgv(): string[] {
          const argv: string[] = BaseCommandTest.newArgv();
          argv.push(
            ConsensusCommandDefinition.COMMAND_NAME,
            ConsensusCommandDefinition.NETWORK_SUBCOMMAND_NAME,
            ConsensusCommandDefinition.NETWORK_DESTROY,
            BaseCommandTest.optionFromFlag(Flags.deployment),
            deployment,
            BaseCommandTest.optionFromFlag(Flags.force),
            BaseCommandTest.optionFromFlag(Flags.deletePvcs),
            BaseCommandTest.optionFromFlag(Flags.deleteSecrets),
          );
          // `consensus network destroy` rejects --chart-dir: it uninstalls releases by name and
          // never renders a chart.
          BaseCommandTest.argvPushGlobalFlags(argv, testName, false, false);
          return argv;
        }

        function deploymentConfigDeleteArgv(): string[] {
          const argv: string[] = BaseCommandTest.newArgv();
          argv.push(
            DeploymentCommandDefinition.COMMAND_NAME,
            DeploymentCommandDefinition.CONFIG_SUBCOMMAND_NAME,
            DeploymentCommandDefinition.CONFIG_DELETE,
            BaseCommandTest.optionFromFlag(Flags.deployment),
            deployment,
          );
          BaseCommandTest.argvPushGlobalFlags(argv, testName, false, false);
          return argv;
        }

        before(async (): Promise<void> => {
          fs.rmSync(testCacheDirectory, {recursive: true, force: true});
          try {
            fs.rmSync(PathEx.joinWithRealPath(testCacheDirectory, '..', DEFAULT_LOCAL_CONFIG_FILE), {force: true});
          } catch {
            // allowed to fail if the file doesn't exist
          }
          resetForTest(namespace.name, testCacheDirectory, false);
          for (const item of contexts) {
            await container.resolve<K8ClientFactory>(InjectTokens.K8Factory).getK8(item).namespaces().delete(namespace);
          }
          // The flag is read per call off a mutable exported object, so each phase sets it
          // explicitly rather than inheriting whatever the ambient environment happens to be.
          constants.CONFIG.EXPERIMENTAL_PER_CONSENSUS_NODE_CHART = false;
          testLogger.info(`${testName}: starting ${testName} e2e test`);
        }).timeout(Duration.ofMinutes(5).toMillis());

        after(async (): Promise<void> => {
          constants.CONFIG.EXPERIMENTAL_PER_CONSENSUS_NODE_CHART = false;
          await preDestroy(endToEndTestSuite);
        }).timeout(Duration.ofMinutes(10).toMillis());

        beforeEach((): void => {
          resetForTest(namespace.name, testCacheDirectory, false);
        });

        afterEach(async (): Promise<void> => await sleep(Duration.ofMillis(5)));

        ClusterReferenceTest.connect(options);
        DeploymentTest.create(options);
        DeploymentTest.addCluster(options);
        ConsensusNodeTest.keys(options);

        describe('a deployment created on the single chart', (): void => {
          // Deploy the version the upgrade in phase 2 upgrades *from*, matching node-upgrade.test.ts;
          // upgrading onto the version already installed would exercise nothing.
          NetworkTest.deploy(options, TEST_UPGRADE_FROM_VERSION);

          it(`${testName}: the single chart owns every consensus node`, async (): Promise<void> => {
            await expectReleases({shared: true, perNode: false}, 'no per-node release without the flag');
          }).timeout(Duration.ofMinutes(2).toMillis());

          ConsensusNodeTest.setup(options, TEST_UPGRADE_FROM_VERSION);
          ConsensusNodeTest.start(options);
          AccountTest.accountCreationShouldSucceed(options);
        });

        describe('turning the flag on does not convert it', (): void => {
          it(`${testName}: enable the per-consensus-node chart`, (): void => {
            constants.CONFIG.EXPERIMENTAL_PER_CONSENSUS_NODE_CHART = true;
            forgetCachedLayout();
          });

          // `consensus network upgrade` re-renders the chart — it is where a conversion used to
          // live, so it is the command most likely to convert a deployment by accident. The
          // config-file variant is the one node-upgrade.test.ts actually exercises
          // (`ConsensusNodeTest.upgrade` is commented out there), and it reaches the same
          // `upgradeNodeConfigurationFilesWithChart` task. Skipped in consensus-node-image mode for
          // the same reason node-upgrade.test.ts skips it: rolling a new image tag through the
          // upgrade flow is not supported there yet.
          if (NetworkNodeLifecycle.isConsensusNodeImage()) {
            it(`${testName}: consensus network upgrade [skipped in consensus node image mode]`, function (): void {
              // mocha's own skip mechanism; it is only reachable through the test's `this`
              // eslint-disable-next-line unicorn/no-this-outside-of-class
              this.skip();
            });
          } else {
            ConsensusNodeTest.upgradeConfigs(options);
          }

          it(`${testName}: the deployment is still on the single chart`, async (): Promise<void> => {
            await expectReleases({shared: true, perNode: false}, 'an existing deployment is never converted');
          }).timeout(Duration.ofMinutes(2).toMillis());

          it(`${testName}: every consensus node pod is still running`, async (): Promise<void> => {
            const pods: Pod[] = await container
              .resolve<K8Factory>(InjectTokens.K8Factory)
              .getK8(contexts[0])
              .pods()
              .list(namespace, ['solo.hedera.com/type=network-node']);

            expect(pods.length, 'the upgrade neither drops nor duplicates a node').to.equal(consensusNodesCount);
          }).timeout(Duration.ofMinutes(5).toMillis());

          AccountTest.accountCreationShouldSucceed(options);
        });

        describe('teardown of the single-chart deployment', (): void => {
          it(`${testName}: consensus network destroy`, async (): Promise<void> => {
            await main(networkDestroyArgv());
            forgetCachedLayout();
          }).timeout(Duration.ofMinutes(10).toMillis());

          // Destroy removes the remote config along with the releases, and `network deploy` will not
          // recreate one for a deployment the local config still knows about, so the record has to
          // be rebuilt before the namespace can take a new deployment.
          it(`${testName}: rebuild the deployment record`, async (): Promise<void> => {
            await main(deploymentConfigDeleteArgv());
          }).timeout(Duration.ofMinutes(2).toMillis());

          DeploymentTest.create(options);
          DeploymentTest.addCluster(options);
        });

        describe('a new deployment created with the flag set', (): void => {
          NetworkTest.deploy(options);

          it(`${testName}: each consensus node is its own release`, async (): Promise<void> => {
            await expectReleases({shared: true, perNode: true}, 'a new deployment is split');
          }).timeout(Duration.ofMinutes(2).toMillis());

          it(`${testName}: every per-node object is rendered under the new layout`, async (): Promise<void> => {
            const k8: K8 = container.resolve<K8Factory>(InjectTokens.K8Factory).getK8(contexts[0]);

            for (const nodeAlias of nodeAliases) {
              // Solo, the mirror node and the relay all resolve consensus nodes by these exact
              // names, so the split chart has to keep rendering them.
              for (const name of [
                `network-${nodeAlias}-svc`,
                `haproxy-${nodeAlias}-svc`,
                `envoy-proxy-${nodeAlias}-svc`,
              ]) {
                expect(await k8.services().read(namespace, name), `service ${name} exists`).to.not.be.undefined;
              }

              for (const name of [`haproxy-cm-${nodeAlias}`, `envoy-proxy-cm-${nodeAlias}`]) {
                expect(await k8.configMaps().exists(namespace, name), `configMap ${name} exists`).to.be.true;
              }
            }
          }).timeout(Duration.ofMinutes(3).toMillis());

          ConsensusNodeTest.setup(options);
          ConsensusNodeTest.start(options);
          AccountTest.accountCreationShouldSucceed(options);
        });

        describe('teardown of the new deployment', (): void => {
          it(`${testName}: consensus network destroy`, async (): Promise<void> => {
            await main(networkDestroyArgv());
            forgetCachedLayout();
          }).timeout(Duration.ofMinutes(10).toMillis());

          it(`${testName}: destroy leaves no release behind`, async (): Promise<void> => {
            await expectReleases({shared: false, perNode: false}, 'destroy sweeps both layouts');
          }).timeout(Duration.ofMinutes(3).toMillis());
        });
      });
    },
  )
  .build();

endToEndTestSuite.runTestSuite();
