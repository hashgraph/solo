// SPDX-License-Identifier: Apache-2.0

import {describe, before, beforeEach, after} from 'mocha';
import fs from 'node:fs';
import {container} from 'tsyringe-neo';

import {Duration} from '../../../src/core/time/duration.js';
import {DEFAULT_LOCAL_CONFIG_FILE} from '../../../src/core/constants.js';
import {PathEx} from '../../../src/business/utils/path-ex.js';
import {InjectTokens} from '../../../src/core/dependency-injection/inject-tokens.js';
import {type K8ClientFactory} from '../../../src/integration/kube/k8-client/k8-client-factory.js';
import {type K8} from '../../../src/integration/kube/k8.js';

import {resetForTest} from '../../test-container.js';
import {EndToEndTestSuiteBuilder} from '../end-to-end-test-suite-builder.js';
import {type EndToEndTestSuite} from '../end-to-end-test-suite.js';
import {type BaseTestOptions} from './tests/base-test-options.js';

import {ClusterReferenceTest} from './tests/cluster-reference-test.js';
import {DeploymentTest} from './tests/deployment-test.js';
import {CacheTest} from './tests/cache-test.js';

const testName: string = 'cache-command-test';

const endToEndTestSuite: EndToEndTestSuite = new EndToEndTestSuiteBuilder()
  .withTestName(testName)
  .withTestSuiteName('Cache Command E2E Test Suite')
  .withNamespace(testName)
  .withDeployment(`${testName}-deployment`)
  .withClusterCount(1)
  .withConsensusNodesCount(1)
  .withLoadBalancerEnabled(false)
  .withPinger(false)
  .withTestSuiteCallback(
    (options: BaseTestOptions, preDestroy: (endToEndTestSuiteInstance: EndToEndTestSuite) => Promise<void>): void => {
      describe('Cache Command E2E Test', (): void => {
        const {testCacheDirectory, namespace, contexts} = options;

        before(async (): Promise<void> => {
          fs.rmSync(testCacheDirectory, {recursive: true, force: true});
          try {
            fs.rmSync(PathEx.joinWithRealPath(testCacheDirectory, '..', DEFAULT_LOCAL_CONFIG_FILE), {
              force: true,
            });
          } catch {
            // allowed to fail if file is absent
          }

          resetForTest(namespace.name, testCacheDirectory, false);

          for (const item of contexts) {
            const k8Client: K8 = container.resolve<K8ClientFactory>(InjectTokens.K8Factory).getK8(item);
            await k8Client.namespaces().delete(namespace);
          }
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

        CacheTest.pull(options);
        CacheTest.list(options);
        CacheTest.status(options);
        CacheTest.load(options);
        CacheTest.clear(options);

        CacheTest.chartPull(options);
        CacheTest.chartList(options);
        CacheTest.chartStatus(options);
        CacheTest.chartInstallUsesCache(options);
        CacheTest.chartClear(options);
      });
    },
  )
  .build();

endToEndTestSuite.runTestSuite();
