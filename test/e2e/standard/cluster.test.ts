// SPDX-License-Identifier: Apache-2.0

import sinon from 'sinon';
import {after, afterEach, before, beforeEach, describe, it} from 'mocha';
import {expect} from 'chai';

import {getTestCacheDirectory} from '../../test-utility.js';
import * as constants from '../../../src/core/constants.js';
import {sleep} from '../../../src/core/helpers.js';
import {Duration} from '../../../src/core/time/duration.js';
import * as fs from 'node:fs';
import * as yaml from 'yaml';
import {PathEx} from '../../../src/business/utils/path-ex.js';
import {SoloPinoLogger} from '../../../src/core/logging/solo-pino-logger.js';
import {container} from 'tsyringe-neo';
import {ClusterCommandTasks} from '../../../src/commands/cluster/tasks.js';
import {type LocalConfigRuntimeState} from '../../../src/business/runtime-state/config/local/local-config-runtime-state.js';
import {InjectTokens} from '../../../src/core/dependency-injection/inject-tokens.js';
import {EndToEndTestSuiteBuilder} from '../end-to-end-test-suite-builder.js';
import {type BaseTestOptions} from '../commands/tests/base-test-options.js';
import {type ClusterReferenceName, type Context} from '../../../src/types/index.js';
import {type ChartManager} from '../../../src/core/chart-manager.js';
import {type ConfigManager} from '../../../src/core/config-manager.js';
import {type K8Factory} from '../../../src/integration/kube/k8-factory.js';
import {ClusterReferenceTest} from '../commands/tests/cluster-reference-test.js';
import {main} from '../../../src/index.js';
import {type EndToEndTestSuite} from '../end-to-end-test-suite.js';

const testName: string = 'cluster-test';

interface ClusterReferenceLocalConfig {
  clusterRefs: Record<string, string>;
}

const endToEndTestSuite: EndToEndTestSuite = new EndToEndTestSuiteBuilder()
  .withTestName(testName)
  .withTestSuiteName('Standard Test Suite')
  .withNamespace(testName)
  .withDeployment(`${testName}-deployment`)
  .withClusterCount(1)
  .withConsensusNodesCount(1)
  .withLoadBalancerEnabled(true)
  .withPinger(true)
  .withRealm(2)
  .withShard(3)
  .withServiceMonitor(true)
  .withPodLog(true)
  .withTestSuiteCallback(
    (options: BaseTestOptions, preDestroy: (endToEndTestSuiteInstance: EndToEndTestSuite) => Promise<void>): void => {
      describe('Cluster E2E Test', (): void => {
        const {clusterReferenceNameArray, contexts, namespace} = options;

        const clusterReferenceName: ClusterReferenceName = clusterReferenceNameArray[0];
        const contextName: Context = contexts[0];

        const clusterCmdTasks: ClusterCommandTasks = container.resolve<ClusterCommandTasks>(ClusterCommandTasks);
        const chartManager: ChartManager = container.resolve<ChartManager>(InjectTokens.ChartManager);
        const configManager: ConfigManager = container.resolve<ConfigManager>(InjectTokens.ConfigManager);
        const k8Factory: K8Factory = container.resolve<K8Factory>(InjectTokens.K8Factory);

        beforeEach((): void => configManager.reset());

        // mock showUser and showJSON to silent logging during tests
        before(async (): Promise<void> => {
          sinon.stub(SoloPinoLogger.prototype, 'showUser');
          sinon.stub(SoloPinoLogger.prototype, 'showJSON');
          await container.resolve<LocalConfigRuntimeState>(InjectTokens.LocalConfigRuntimeState).load();
        });

        after(async (): Promise<void> => {
          // @ts-expect-error: TS2339 - to restore
          SoloPinoLogger.prototype.showUser.restore();
          // @ts-expect-error: TS2339 - to restore
          SoloPinoLogger.prototype.showJSON.restore();

          await preDestroy(endToEndTestSuite);

          await k8Factory.default().namespaces().delete(namespace);

          ClusterReferenceTest.setup(options);
        }).timeout(Duration.ofMinutes(3).toMillis());

        // give a few ticks so that connections can close
        afterEach(async (): Promise<void> => await sleep(Duration.ofMillis(20)));

        it('should cleanup existing deployment', async (): Promise<void> => {
          if (
            await chartManager.isChartInstalled(constants.SOLO_SETUP_NAMESPACE, constants.MINIO_OPERATOR_RELEASE_NAME)
          ) {
            ClusterReferenceTest.reset(options);
          }
        }).timeout(Duration.ofMinutes(1).toMillis());

        it('solo cluster setup should fail with invalid cluster name', async (): Promise<void> => {
          await expect(
            main(ClusterReferenceTest.soloClusterReferenceSetup(testName, clusterReferenceName, 'INVALID')),
          ).to.be.rejectedWith("Invalid value 'INVALID' for flag --cluster-setup-namespace");
        }).timeout(Duration.ofMinutes(1).toMillis());

        it('solo cluster setup should work with valid args', async (): Promise<void> => {
          await main(ClusterReferenceTest.soloClusterReferenceSetup(testName, clusterReferenceName));
        }).timeout(Duration.ofMinutes(1).toMillis());

        it('cluster-ref config connect should pass with correct data', async (): Promise<void> => {
          const localConfigPath: string = PathEx.join(getTestCacheDirectory(), constants.DEFAULT_LOCAL_CONFIG_FILE);

          await main(ClusterReferenceTest.soloClusterReferenceConnectArgv(testName, clusterReferenceName, contextName));

          const localConfigYaml: string = fs.readFileSync(localConfigPath).toString();
          const localConfigData: ClusterReferenceLocalConfig = yaml.parse(
            localConfigYaml,
          ) as ClusterReferenceLocalConfig;

          expect(localConfigData.clusterRefs).to.have.own.property(clusterReferenceName);
          expect(localConfigData.clusterRefs[clusterReferenceName]).to.equal(contextName);
        });

        it('solo cluster info should work', (): void => {
          ClusterReferenceTest.info(options);
        }).timeout(Duration.ofMinutes(1).toMillis());

        it('solo cluster list', async (): Promise<void> => {
          ClusterReferenceTest.list(options);
        }).timeout(Duration.ofMinutes(1).toMillis());

        it('function showInstalledChartList should return right true', async (): Promise<void> => {
          // @ts-expect-error to access private property
          await expect(clusterCmdTasks.showInstalledChartList()).to.eventually.be.undefined;
        }).timeout(Duration.ofMinutes(1).toMillis());

        // helm list would return an empty list if given invalid namespace
        it('solo cluster reset should fail with invalid cluster name', async (): Promise<void> => {
          try {
            await main(ClusterReferenceTest.soloClusterReferenceReset(testName, 'unknown-cluster-ref'));
            expect.fail();
          } catch (error) {
            expect(error.message).to.include('Cluster reset failed');
          }
        }).timeout(Duration.ofMinutes(1).toMillis());

        it('solo cluster reset should work with valid args', async (): Promise<void> => {
          ClusterReferenceTest.reset(options);
        }).timeout(Duration.ofMinutes(1).toMillis());

        it('cluster-ref config connect should fail with invalid context name', async (): Promise<void> => {
          const invalidContextName: string = 'INVALID_CONTEXT';
          try {
            await main(
              ClusterReferenceTest.soloClusterReferenceConnectArgv(testName, clusterReferenceName, invalidContextName),
            );
            expect.fail();
          } catch (error) {
            expect(error.message).to.include(`Context not found for cluster reference ${clusterReferenceName}`);
          }
        });
      });
    },
  )
  .build();

endToEndTestSuite.runTestSuite();
