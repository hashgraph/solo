// SPDX-License-Identifier: Apache-2.0

import {describe} from 'mocha';

import {resetForTest} from '../../test-container.js';
import {container} from 'tsyringe-neo';
import {InjectTokens} from '../../../src/core/dependency-injection/inject-tokens.js';
import fs from 'node:fs';
import {type K8ClientFactory} from '../../../src/integration/kube/k8-client/k8-client-factory.js';
import {type K8} from '../../../src/integration/kube/k8.js';
import {DEFAULT_LOCAL_CONFIG_FILE, RESOURCES_DIR} from '../../../src/core/constants.js';
import {Duration} from '../../../src/core/time/duration.js';
import {PathEx} from '../../../src/business/utils/path-ex.js';

import {EndToEndTestSuiteBuilder} from '../end-to-end-test-suite-builder.js';
import {type EndToEndTestSuite} from '../end-to-end-test-suite.js';
import {ClusterReferenceTest} from './tests/cluster-reference-test.js';
import {type BaseTestOptions} from './tests/base-test-options.js';
import {DeploymentTest} from './tests/deployment-test.js';
import {ConsensusNodeTest} from './tests/consensus-node-test.js';
import {NetworkTest} from './tests/network-test.js';
import {MirrorNodeTest} from './tests/mirror-node-test.js';
import {ExplorerTest} from './tests/explorer-test.js';
import {RelayTest} from './tests/relay-test.js';
import {MetricsServerImpl} from '../../../src/business/runtime-state/services/metrics-server-impl.js';
import * as constants from '../../../src/core/constants.js';
import {BlockNodeTest} from './tests/block-node-test.js';
import {KeysAndPermissionsTest} from './tests/keys-and-permissions-test.js';
import {type NodeAlias, type NodeAliases} from '../../../src/types/aliases.js';
import {destroyEnabled} from '../../test-utility.js';

const testName: string = 'dual-cluster-full';

// Use dual-cluster specific values file with higher memory limits to prevent OOM
const dualClusterValuesFile: string = PathEx.joinWithRealPath(
  RESOURCES_DIR,
  'mirror-node-values-dual-cluster-minimal.yaml',
);

const consensusNodesCount: number = process.env['SOLO_DUAL_CLUSTER_NODE_COUNT']
  ? Number.parseInt(process.env['SOLO_DUAL_CLUSTER_NODE_COUNT'], 10)
  : 3;

const endToEndTestSuite: EndToEndTestSuite = new EndToEndTestSuiteBuilder()
  .withTestName(testName)
  .withTestSuiteName('Dual Cluster Full E2E Test Suite')
  .withNamespace(testName)
  .withDeployment(`${testName}-deployment`)
  .withClusterCount(2)
  .withConsensusNodesCount(consensusNodesCount)
  .withLoadBalancerEnabled(true)
  .withTssEnabled(false)
  .withPinger(true)
  .withShard(3)
  .withRealm(2)
  .withServiceMonitor(true)
  .withPodLog(true)
  .withTestSuiteCallback(
    (options: BaseTestOptions, preDestroy: (endToEndTestSuiteInstance: EndToEndTestSuite) => Promise<void>): void => {
      describe('Dual Cluster Full E2E Test', (): void => {
        const {testCacheDirectory, testLogger, namespace, contexts} = options;

        // TODO the kube config context causes issues if it isn't one of the selected clusters we are deploying to
        before(async (): Promise<void> => {
          fs.rmSync(testCacheDirectory, {recursive: true, force: true});
          try {
            fs.rmSync(PathEx.joinWithRealPath(testCacheDirectory, '..', DEFAULT_LOCAL_CONFIG_FILE), {
              force: true,
            });
          } catch {
            // allowed to fail if the file doesn't exist
          }
          resetForTest(namespace.name, testCacheDirectory, false);
          for (const item of contexts) {
            const k8Client: K8 = container.resolve<K8ClientFactory>(InjectTokens.K8Factory).getK8(item);
            await k8Client.namespaces().delete(namespace);
          }
          testLogger.info(`${testName}: starting ${testName} e2e test`);
        }).timeout(Duration.ofMinutes(5).toMillis());

        after(async (): Promise<void> => {
          await preDestroy(endToEndTestSuite);
        }).timeout(Duration.ofMinutes(5).toMillis());

        beforeEach(async (): Promise<void> => {
          testLogger.info(`${testName}: resetting containers for each test`);
          resetForTest(namespace.name, testCacheDirectory, false);
          testLogger.info(`${testName}: finished resetting containers for each test`);
        });

        ClusterReferenceTest.connect(options);
        DeploymentTest.create(options);
        DeploymentTest.addCluster(options);
        DeploymentTest.info(options);
        DeploymentTest.verifyDeploymentConfigInfo(options);
        ConsensusNodeTest.keys(options);

        // Deploy one block node per cluster so each cluster's consensus nodes stream
        // to their local block node and the mirror node (on c2) can pull from c2's block node.
        const c1NodeCount: number = Math.ceil(consensusNodesCount / 2);
        const c1NodeAliases: NodeAliases = Array.from(
          {length: c1NodeCount},
          (_, index): NodeAlias => `node${index + 1}` as NodeAlias,
        );
        const c2NodeAliases: NodeAliases = Array.from(
          {length: consensusNodesCount - c1NodeCount},
          (_, index): NodeAlias => `node${c1NodeCount + index + 1}` as NodeAlias,
        );
        BlockNodeTest.add(options, c1NodeAliases);
        BlockNodeTest.add(options, c2NodeAliases, 1);

        NetworkTest.deploy(options);
        ConsensusNodeTest.setup(options);
        ConsensusNodeTest.start(options, true);

        // Verify the SA8 hardening and that each node's gossip keys match the cluster secrets.
        KeysAndPermissionsTest.verifyConsensusNodeKeysMatchSecrets(options);
        KeysAndPermissionsTest.verifySoloHomeFilePermissions(options);

        // Use dual-cluster specific values file with higher memory limits
        MirrorNodeTest.add({...options, valuesFile: dualClusterValuesFile});
        MirrorNodeTest.pullAddressBook(options);

        ConsensusNodeTest.PemStop(options);
        ConsensusNodeTest.PemKill(options);

        ConsensusNodeTest.add(options);
        ConsensusNodeTest.update(options);
        ConsensusNodeTest.destroy(options);

        ExplorerTest.add(options);
        RelayTest.add(options);

        it('Should write log metrics', async (): Promise<void> => {
          await new MetricsServerImpl().logMetrics(
            testName,
            PathEx.join(constants.SOLO_LOGS_DIR, `${testName}`),
            undefined,
            undefined,
            contexts,
          );
        });

        if (destroyEnabled()) {
          BlockNodeTest.destroy(options);
          RelayTest.destroy(options);
          ExplorerTest.destroy(options);
          MirrorNodeTest.destroy(options);
          NetworkTest.destroy(options);
        }
      }).timeout(Duration.ofMinutes(30).toMillis());
    },
  )
  .build();
endToEndTestSuite.runTestSuite();
