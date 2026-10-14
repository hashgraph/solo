// SPDX-License-Identifier: Apache-2.0

import {describe} from 'mocha';

import {resetForTest} from '../../test-container.js';
import {container} from 'tsyringe-neo';
import {InjectTokens} from '../../../src/core/dependency-injection/inject-tokens.js';
import fs from 'node:fs';
import {type K8ClientFactory} from '../../../src/integration/kube/k8-client/k8-client-factory.js';
import {type K8} from '../../../src/integration/kube/k8.js';
import {DEFAULT_LOCAL_CONFIG_FILE} from '../../../src/core/constants.js';
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
import {destroyEnabled} from '../../test-utility.js';

/**
 * Minimal, fast, single-cluster/single-node suite covering that the explorer's nginx proxy
 * actually routes every mirror node API path to the right backend service (rest/restjava/web3) when
 * `--enable-ingress` is off.
 *
 * NOTE. Deliberately does not exercise the "toggle ingress on an existing deployment" transition
 * (mirror node add with ingress on, then destroy/re-add without it, then `explorer node upgrade`).
 * `dual-cluster-full.test.ts` has that scenario but a bug prevents the ability to run it. This suite
 * sidesteps that bug entirely by deploying the mirror node without ingress.
 */
const testName: string = 'explorer-routing-no-ingress';

const endToEndTestSuite: EndToEndTestSuite = new EndToEndTestSuiteBuilder()
  .withTestName(testName)
  .withTestSuiteName('Explorer Routing Without Mirror Ingress E2E Test Suite')
  .withNamespace(testName)
  .withDeployment(`${testName}-deployment`)
  .withClusterCount(1)
  .withConsensusNodesCount(1)
  .withTssEnabled(false)
  .withTestSuiteCallback(
    (options: BaseTestOptions, preDestroy: (endToEndTestSuiteInstance: EndToEndTestSuite) => Promise<void>): void => {
      describe('Explorer Routing Without Mirror Ingress E2E Test', (): void => {
        const {testCacheDirectory, testLogger, namespace, contexts} = options;

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
          resetForTest(namespace.name, testCacheDirectory, false);
        });

        ClusterReferenceTest.connect(options);
        DeploymentTest.create(options);
        DeploymentTest.addCluster(options);
        DeploymentTest.info(options);
        ConsensusNodeTest.keys(options);

        NetworkTest.deploy(options);
        ConsensusNodeTest.setup(options);
        ConsensusNodeTest.start(options, true);

        MirrorNodeTest.addWithoutIngress(options);
        ExplorerTest.add(options);

        it(`${testName}: explorer proxy routes each mirror node API path correctly without mirror ingress`, async (): Promise<void> => {
          const k8Factory: K8ClientFactory = container.resolve<K8ClientFactory>(InjectTokens.K8Factory);
          const k8: K8 = k8Factory.getK8(contexts[1] || contexts[0]);
          // Genesis treasury account: indexed first (and fastest) by the freshly-built importer.
          // This suite uses the default shard/realm (0.0.x), so '0.0.2' is correct here.
          await ExplorerTest.verifyExplorerDeployWasSuccessful(k8, namespace, '0.0.2', testLogger, 30);
        }).timeout(Duration.ofMinutes(5).toMillis());

        if (destroyEnabled()) {
          ExplorerTest.destroy(options);
          MirrorNodeTest.destroy(options);
          NetworkTest.destroy(options);
        }
      }).timeout(Duration.ofMinutes(20).toMillis());
    },
  )
  .build();
endToEndTestSuite.runTestSuite();
