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
import {type ChildProcessWithoutNullStreams, spawn} from 'node:child_process';
import {MetricsServerImpl} from '../../../src/business/runtime-state/services/metrics-server-impl.js';
import * as constants from '../../../src/core/constants.js';
import {BlockNodeTest} from './tests/block-node-test.js';
import {type NodeAlias, type NodeAliases} from '../../../src/types/aliases.js';
import {getTemporaryDirectory} from '../../test-utility.js';

const testName: string = 'external-database-test';

// Use dual-cluster specific values file with higher memory limits to prevent OOM
const dualClusterValuesFile: string = PathEx.joinWithRealPath(
  RESOURCES_DIR,
  'mirror-node-values-dual-cluster-minimal.yaml',
);

const configFiles: Record<string, string> = {
  'api-permission.properties': 'api-permission.properties.txt',
  'application.env': 'application.env.txt',
  [constants.APPLICATION_PROPERTIES]: 'application.properties.txt',
  'bootstrap.properties': 'bootstrap.properties.txt',
  'log4j2.xml': 'log4j2.xml.txt',
  'settings.txt': 'settings.txt.txt',
};

// Initialize the DI container before EndToEndTestSuite construction resolves logger/runtime state.
resetForTest(undefined, undefined, false);

const endToEndTestSuite: EndToEndTestSuite = new EndToEndTestSuiteBuilder()
  .withTestName(testName)
  .withTestSuiteName('External Database E2E Test Suite')
  .withNamespace(testName)
  .withDeployment(`${testName}-deployment`)
  .withClusterCount(2)
  .withConsensusNodesCount(2)
  .withLoadBalancerEnabled(true)
  .withPinger(true)
  .withShard(3)
  .withRealm(2)
  .withApiPermissionProperties(configFiles['api-permission.properties'])
  .withApplicationEnvironment(configFiles['application.env'])
  .withApplicationProperties(configFiles[constants.APPLICATION_PROPERTIES])
  .withBootstrapProperties(configFiles['bootstrap.properties'])
  .withLog4j2Xml(configFiles['log4j2.xml'])
  .withSettingsTxt(configFiles['settings.txt'])
  .withTestSuiteCallback((options: BaseTestOptions): void => {
    describe('External Database E2E Test', (): void => {
      const {testCacheDirectory, testLogger, namespace, contexts, consensusNodesCount, shard, realm} = options;
      const blockNodeEnabled: boolean = process.env.SOLO_E2E_EXTERNAL_DB_TEST_BLOCK_NODE !== 'false';
      // This suite validates mirror node ingestion against an external database.
      // The ERC20 Hardhat smoke currently depends on a separate relay EthereumTransaction
      // path that is failing for CN >= 0.74 independently of MinIO and block-node wiring.
      // Default to the topic-only smoke here and leave the full relay contract smoke opt-in.
      const topicTestOnly: boolean = process.env.SOLO_E2E_EXTERNAL_DB_TEST_TOPIC_ONLY !== 'false';

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

        // copy all consensus config files to a temporary directory with non-default names
        const templateDirectory: string = PathEx.joinWithRealPath(RESOURCES_DIR, 'templates');
        const temporaryDirectory: string = getTemporaryDirectory();
        for (const [sourceFileName, targetFileName] of Object.entries(configFiles)) {
          fs.cpSync(PathEx.join(templateDirectory, sourceFileName), PathEx.join(temporaryDirectory, targetFileName));
        }
      }).timeout(Duration.ofMinutes(5).toMillis());

      beforeEach(async (): Promise<void> => {
        testLogger.info(`${testName}: resetting containers for each test`);
        resetForTest(namespace.name, testCacheDirectory, false);
        testLogger.info(`${testName}: finished resetting containers for each test`);
      });

      ClusterReferenceTest.connect(options);
      DeploymentTest.create(options);
      DeploymentTest.addCluster(options);

      ConsensusNodeTest.keys(options);
      if (blockNodeEnabled) {
        // Keep block streams local to the cluster hosting each consensus node. Sharing one block node
        // across both clusters causes multiple publishers to contend on the same stream and can stall
        // block finalization, which then blocks mirror ingestion and relay transaction polling.
        const c1NodeCount: number = Math.ceil(consensusNodesCount / contexts.length);
        const c1NodeAliases: NodeAliases = Array.from(
          {length: c1NodeCount},
          (_, index): NodeAlias => `node${index + 1}` as NodeAlias,
        );
        const c2NodeAliases: NodeAliases = Array.from(
          {length: consensusNodesCount - c1NodeCount},
          (_, index): NodeAlias => `node${c1NodeCount + index + 1}` as NodeAlias,
        );

        BlockNodeTest.add(options, c1NodeAliases);
        if (c2NodeAliases.length > 0) {
          BlockNodeTest.add(options, c2NodeAliases, 1);
        }
      }
      NetworkTest.deploy(options);
      ConsensusNodeTest.setup(options);
      ConsensusNodeTest.start(options, true);

      // Mirror node, explorer and relay node are deployed to the second cluster
      MirrorNodeTest.installPostgres(options);

      // Use dual-cluster specific values file with higher memory limits
      MirrorNodeTest.deployWithExternalDatabase({...options, valuesFile: dualClusterValuesFile});
      MirrorNodeTest.verifyBlocksAreBeingProduced(options);
      ExplorerTest.add(options);
      RelayTest.add(options);
      DeploymentTest.info(options);
      DeploymentTest.verifyDeploymentConfigInfo(options);

      it('should run smoke tests', async (): Promise<void> => {
        // Mirror node is deployed to the second cluster in the dual-cluster setup.
        // Pass its context so solo_smoke_test.sh can issue kubectl commands against
        // the right cluster (e.g. kubectl wait for mirror-grpc readiness).
        const mirrorClusterContext: string = contexts[1];
        const firstNodeAccountId: string = `${shard}.${realm}.3`;
        const scriptPath: string = `export SOLO_HOME=${testCacheDirectory}; \
            export SHARD_NUM=${shard}; \
            export REALM_NUM=${realm}; \
            export NEW_NODE_ACCOUNT_ID=${firstNodeAccountId}; \
            export SOLO_NAMESPACE=${namespace.name}; \
            export SOLO_CLUSTER_CONTEXT=${mirrorClusterContext}; \
            export SOLO_CACHE_DIR=${testCacheDirectory}; \
            export SOLO_DEPLOYMENT=${testName}-deployment; \
            ${
              topicTestOnly
                ? 'source .github/workflows/script/helper.sh && cd .. && ' +
                  'create_test_account ${SOLO_DEPLOYMENT} && cd solo && node scripts/create-topic.js'
                : '.github/workflows/script/solo_smoke_test.sh'
            }`;

        // running the script and show its output in real time for easy to debug
        // and check its progress
        return new Promise<void>((resolve, reject): void => {
          const process: ChildProcessWithoutNullStreams = spawn(scriptPath, {
            stdio: 'pipe', // Use pipe to capture output
            shell: '/bin/bash', // Run in bash because the command uses `source`
          });

          // Stream stdout in real-time
          process.stdout.on('data', (data): void => {
            data.toString().replaceAll('::group::', '\r::group::').replaceAll('::endgroup::', '\r::endgroup::');
            console.log(`${data}`.trim());
          });

          // Stream stderr in real-time
          process.stderr.on('data', (data): void => {
            data.toString().replaceAll('::group::', '\r::group::').replaceAll('::endgroup::', '\r::endgroup::');
            console.log(`${data}`.trim());
          });

          // Handle process completion
          process.on('close', (code): void => {
            if (code) {
              const error: Error = new Error(`Smoke test failed with exit code ${code}`);
              reject(error);
            } else {
              console.log('Smoke test execution succeeded');
              resolve();
            }
          });

          // Handle process errors
          process.on('error', (error): void => {
            console.error('Failed to start smoke test process:', error.message);
            reject(error);
          });
        });
      }).timeout(Duration.ofMinutes(30).toMillis());

      it('Should write log metrics', async (): Promise<void> => {
        await new MetricsServerImpl().logMetrics(
          testName,
          PathEx.join(constants.SOLO_LOGS_DIR, `${testName}`),
          undefined,
          undefined,
          contexts,
        );
      });
    }).timeout(Duration.ofMinutes(40).toMillis());
  })
  .build();

endToEndTestSuite.runTestSuite();
