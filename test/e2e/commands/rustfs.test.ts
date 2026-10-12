// SPDX-License-Identifier: Apache-2.0

import {describe, it} from 'mocha';
import {expect} from 'chai';
import {Duration} from '../../../src/core/time/duration.js';
import {container} from 'tsyringe-neo';
import {InjectTokens} from '../../../src/core/dependency-injection/inject-tokens.js';
import * as constants from '../../../src/core/constants.js';
import {PathEx} from '../../../src/business/utils/path-ex.js';
import {EndToEndTestSuiteBuilder} from '../end-to-end-test-suite-builder.js';
import {type BaseTestOptions} from './tests/base-test-options.js';
import fs from 'node:fs';
import {DEFAULT_LOCAL_CONFIG_FILE} from '../../../src/core/constants.js';
import {resetForTest} from '../../test-container.js';
import {type K8ClientFactory} from '../../../src/integration/kube/k8-client/k8-client-factory.js';
import {type K8Factory} from '../../../src/integration/kube/k8-factory.js';
import {type Pod} from '../../../src/integration/kube/resources/pod/pod.js';
import {ClusterReferenceTest} from './tests/cluster-reference-test.js';
import {DeploymentTest} from './tests/deployment-test.js';
import {ConsensusNodeTest} from './tests/consensus-node-test.js';
import {NetworkTest} from './tests/network-test.js';
import {MirrorNodeTest} from './tests/mirror-node-test.js';
import {sleep} from '../../../src/core/helpers.js';
import {type EndToEndTestSuite} from '../end-to-end-test-suite.js';

const testName: string = 'rustfs-test';

const endToEndTestSuite: EndToEndTestSuite = new EndToEndTestSuiteBuilder()
  .withTestName(testName)
  .withTestSuiteName('RustFS Test Suite')
  .withNamespace(testName)
  .withDeployment(`${testName}-deployment`)
  .withClusterCount(1)
  .withConsensusNodesCount(1)
  .withLoadBalancerEnabled(false)
  .withPinger(false)
  .withRealm(0)
  .withShard(0)
  .withServiceMonitor(true)
  .withPodLog(true)
  .withTestSuiteCallback(
    (options: BaseTestOptions, preDestroy: (endToEndTestSuiteInstance: EndToEndTestSuite) => Promise<void>): void => {
      describe('RustFS E2E Test', (): void => {
        const {testCacheDirectory, testLogger, namespace, contexts} = options;
        const rustfsOptions: BaseTestOptions = {...options, storageType: constants.StorageType.RUSTFS_ONLY};

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
            await container.resolve<K8ClientFactory>(InjectTokens.K8Factory).getK8(item).namespaces().delete(namespace);
          }
          testLogger.info(`${testName}: starting ${testName} e2e test`);
        }).timeout(Duration.ofMinutes(5).toMillis());

        after(async (): Promise<void> => {
          await preDestroy(endToEndTestSuite);
        }).timeout(Duration.ofMinutes(10).toMillis());

        beforeEach(async (): Promise<void> => {
          resetForTest(namespace.name, testCacheDirectory, false);
        });

        afterEach(async (): Promise<void> => await sleep(Duration.ofMillis(5)));

        ClusterReferenceTest.connect(options);
        DeploymentTest.create(options);
        DeploymentTest.addCluster(options);
        ConsensusNodeTest.keys(options);

        NetworkTest.deploy(rustfsOptions);

        it(`${testName}: RustFS replaces the MinIO tenant`, async (): Promise<void> => {
          for (const context of contexts) {
            const k8: K8Factory = container.resolve<K8Factory>(InjectTokens.K8Factory);
            const rustfsPods: Pod[] = await k8
              .getK8(context)
              .pods()
              .list(namespace, [`app.kubernetes.io/instance=${constants.RUSTFS_RELEASE_NAME}`]);
            expect(rustfsPods.map((pod: Pod): string => pod.phase)).to.deep.equal(['Running']);

            const bucketInitPods: Pod[] = await k8
              .getK8(context)
              .pods()
              .list(namespace, ['solo.hedera.com/type=rustfs-bucket-init']);
            expect(bucketInitPods.some((pod: Pod): boolean => pod.phase === 'Succeeded')).to.be.true;

            const minioPods: Pod[] = await k8.getK8(context).pods().list(namespace, ['v1.min.io/tenant=minio']);
            expect(minioPods).to.be.empty;
          }
        }).timeout(Duration.ofMinutes(2).toMillis());

        ConsensusNodeTest.setup(options);
        ConsensusNodeTest.start(options);

        // Without a block node the mirror node imports record files from the bucket, so continued
        // block ingestion proves the uploader -> RustFS -> mirror importer path.
        MirrorNodeTest.add({...options, pinger: true}, 0);
        MirrorNodeTest.verifyBlocksAreBeingProduced(options);
      }).timeout(Duration.ofMinutes(30).toMillis());
    },
  )
  .build();

endToEndTestSuite.runTestSuite();
