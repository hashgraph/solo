// SPDX-License-Identifier: Apache-2.0

import {describe} from 'mocha';

import {resetForTest} from '../../test-container.js';
import {container} from 'tsyringe-neo';
import {InjectTokens} from '../../../src/core/dependency-injection/inject-tokens.js';
import fs from 'node:fs';
import {expect} from 'chai';
import {type K8ClientFactory} from '../../../src/integration/kube/k8-client/k8-client-factory.js';
import {type K8} from '../../../src/integration/kube/k8.js';
import {DEFAULT_LOCAL_CONFIG_FILE} from '../../../src/core/constants.js';
import {Duration} from '../../../src/core/time/duration.js';
import {PathEx} from '../../../src/business/utils/path-ex.js';
import {NamespaceName} from '../../../src/types/namespace/namespace-name.js';
import {EndToEndTestSuiteBuilder} from '../end-to-end-test-suite-builder.js';
import {type EndToEndTestSuite} from '../end-to-end-test-suite.js';
import {type BaseTestOptions} from './tests/base-test-options.js';
import {main} from '../../../src/index.js';
import {BaseCommandTest} from './tests/base-command-test.js';
import {NetworkLoadGeneratorTest} from './tests/network-load-generator-test.js';
import {OneShotCommandDefinition} from '../../../src/commands/command-definitions/one-shot-command-definition.js';
import {MetricsServerImpl} from '../../../src/business/runtime-state/services/metrics-server-impl.js';
import * as constants from '../../../src/core/constants.js';
import {Flags} from '../../../src/commands/flags.js';
import {type LocalConfigRuntimeState} from '../../../src/business/runtime-state/config/local/local-config-runtime-state.js';
import {type Deployment} from '../../../src/business/runtime-state/config/local/deployment.js';

import {type Pod} from '../../../src/integration/kube/resources/pod/pod.js';
import {ContainerReference} from '../../../src/integration/kube/resources/container/container-reference.js';
import {type Containers} from '../../../src/integration/kube/resources/container/containers.js';
import {type Container} from '../../../src/integration/kube/resources/container/container.js';
import {type K8Factory} from '../../../src/integration/kube/k8-factory.js';

const testName: string = 'small-memory-load';
const deploymentName: string = `${testName}-deployment`;
const testTitle: string = 'E2E Small Memory Load Test';

const loadTestDurationSeconds: number = 300; // 5 minutes
const clients: number = 5;
const accounts: number = 1000;

const endToEndTestSuite: EndToEndTestSuite = new EndToEndTestSuiteBuilder()
  .withTestName(testName)
  .withTestSuiteName(`${testTitle} Suite`)
  .withNamespace(testName)
  .withDeployment(deploymentName)
  .withClusterCount(1)
  .withTestSuiteCallback(
    (options: BaseTestOptions, preDestroy: (endToEndTestSuiteInstance: EndToEndTestSuite) => Promise<void>): void => {
      describe(testTitle, (): void => {
        const {testCacheDirectory, testLogger, namespace, contexts, deployment} = options;

        let k8: K8;
        let context: string;

        before(async (): Promise<void> => {
          fs.rmSync(testCacheDirectory, {recursive: true, force: true});
          try {
            fs.rmSync(PathEx.joinWithRealPath(testCacheDirectory, '..', DEFAULT_LOCAL_CONFIG_FILE), {
              force: true,
            });
          } catch {
            // allowed to fail if the file doesn't exist
          }
          if (!fs.existsSync(testCacheDirectory)) {
            fs.mkdirSync(testCacheDirectory, {recursive: true});
          }
          resetForTest(namespace.name, testCacheDirectory, false);
          for (const item of contexts) {
            const k8Client: K8 = container.resolve<K8ClientFactory>(InjectTokens.K8Factory).getK8(item);
            await k8Client.namespaces().delete(namespace);
          }

          context = contexts[0];
          k8 = container.resolve<K8ClientFactory>(InjectTokens.K8Factory).getK8(context);

          testLogger.info(`${testName}: starting ${testName} e2e test`);

          // Phase 1: Deploy network with CN only (no mirror node, explorer, relay)
          testLogger.info(`${testName}: deploying network with CN only`);
          await main(soloOneShotDeploy(testName, deployment));
          testLogger.info(`${testName}: network deployed`);

          // Phase 2: Pre-deploy NLG chart (bypassing rapid-fire to allow file copy before test start)
          testLogger.info(`${testName}: deploying NLG chart`);
          await NetworkLoadGeneratorTest.deployChart(context, NamespaceName.of(await getNamespaceFromDeployment()));
          testLogger.info(`${testName}: NLG chart deployed`);

          // Phase 3: Copy throttles.json into NLG pod
          testLogger.info(`${testName}: copying throttles.json into NLG pod`);
          await copyThrottlesToNlgPod(context);
          testLogger.info(`${testName}: throttles.json copied`);
        }).timeout(Duration.ofMinutes(25).toMillis());

        after(async (): Promise<void> => {
          await preDestroy(endToEndTestSuite);

          testLogger.info(`${testName}: beginning ${testName}: destroy`);
          await main(soloOneShotDestroy(testName));
          testLogger.info(`${testName}: finished ${testName}: destroy`);
        }).timeout(Duration.ofMinutes(5).toMillis());

        it('CryptoTransferLoadTest with throttles', async (): Promise<void> => {
          testLogger.info(`${testName}: starting CryptoTransferLoadTest with throttles`);
          await main(
            soloRapidFire(
              testName,
              'CryptoTransferLoadTest',
              `-c ${clients} -a ${accounts} -R -t ${loadTestDurationSeconds} -file throttles=/app/throttles.json`,
            ),
          );
          testLogger.info(`${testName}: CryptoTransferLoadTest completed`);
        }).timeout(Duration.ofSeconds(loadTestDurationSeconds * 2).toMillis());

        it('Should verify no OOM occurred on consensus nodes', async (): Promise<void> => {
          testLogger.info(`${testName}: verifying no OOM on consensus nodes`);

          const oomPattern: RegExp = /OOMKilled|out of memory|reason:\s*OOMKilled/i;
          const consensusNodePods: Pod[] = await k8.pods().list(namespace, ['solo.hedera.com/type=network-node']);

          for (const pod of consensusNodePods) {
            const describeOutput: string = await k8.pods().readDescribe(pod.podReference);
            const hasOom: boolean = oomPattern.test(describeOutput);
            expect(hasOom, `OOM detected on pod ${pod.podReference.name.name}: ${describeOutput.slice(0, 500)}`).to.be
              .false;
          }

          testLogger.info(`${testName}: no OOM detected on ${consensusNodePods.length} consensus node(s)`);
        }).timeout(Duration.ofMinutes(5).toMillis());

        it('Should write log metrics', async (): Promise<void> => {
          await new MetricsServerImpl().logMetrics(testName, PathEx.join(constants.SOLO_LOGS_DIR, `${testName}`));
        }).timeout(Duration.ofMinutes(5).toMillis());
      });
    },
  )
  .build();
endToEndTestSuite.runTestSuite();

// ---------------------------------------------------------------------------
// Helper functions
// ---------------------------------------------------------------------------

async function getNamespaceFromDeployment(): Promise<string> {
  const localConfig: LocalConfigRuntimeState = container.resolve<LocalConfigRuntimeState>(
    InjectTokens.LocalConfigRuntimeState,
  );
  await localConfig.load();
  const storedDeployment: Deployment = localConfig.configuration.deploymentByName(deploymentName);
  return storedDeployment.namespace;
}

function soloOneShotDeploy(testNameArgument: string, deploymentArgument: string): string[] {
  const {newArgv, argvPushGlobalFlags, optionFromFlag} = BaseCommandTest;

  const argv: string[] = newArgv();
  argv.push(
    OneShotCommandDefinition.COMMAND_NAME,
    OneShotCommandDefinition.FALCON_SUBCOMMAND_NAME,
    OneShotCommandDefinition.SINGLE_DEPLOY,
  );
  argvPushGlobalFlags(argv, testNameArgument);
  argv.push(
    optionFromFlag(Flags.deployment),
    deploymentArgument,
    optionFromFlag(Flags.deployMirrorNode),
    'false',
    optionFromFlag(Flags.deployExplorer),
    'false',
    optionFromFlag(Flags.deployRelay),
    'false',
  );
  return argv;
}

function soloOneShotDestroy(testNameArgument: string): string[] {
  const {newArgv, argvPushGlobalFlags} = BaseCommandTest;

  const argv: string[] = newArgv();
  argv.push('one-shot', 'single', 'destroy');
  argvPushGlobalFlags(argv, testNameArgument);
  return argv;
}

function soloRapidFire(testNameArgument: string, performanceTest: string, argumentsString: string): string[] {
  const {newArgv, argvPushGlobalFlags, optionFromFlag} = BaseCommandTest;

  const argv: string[] = newArgv();
  argv.push(
    'rapid-fire',
    'load',
    'start',
    optionFromFlag(Flags.deployment),
    deploymentName,
    optionFromFlag(Flags.performanceTest),
    performanceTest,
    optionFromFlag(Flags.nlgArguments),
    `'"${argumentsString}"'`,
  );
  argvPushGlobalFlags(argv, testNameArgument);
  return argv;
}

/**
 * Copy the small-memory throttles.json file into the NLG pod at /app/throttles.json.
 * This ensures NLG preserves the network throttle definitions instead of removing them.
 */
async function copyThrottlesToNlgPod(kubeContext: string): Promise<void> {
  const k8Factory: K8Factory = container.resolve<K8Factory>(InjectTokens.K8Factory);
  const k8Instance: K8 = k8Factory.getK8(kubeContext);

  const namespaceName: string = await getNamespaceFromDeployment();
  const namespaceObject: NamespaceName = NamespaceName.of(namespaceName);

  const nlgPods: Pod[] = await k8Instance.pods().list(namespaceObject, constants.NETWORK_LOAD_GENERATOR_POD_LABELS);

  const throttlesSourcePath: string = PathEx.join(
    constants.RESOURCES_DIR,
    'templates',
    'small-memory',
    'throttles.json',
  );

  const k8Containers: Containers = k8Instance.containers();
  for (const pod of nlgPods) {
    const containerReference: ContainerReference = ContainerReference.of(
      pod.podReference,
      constants.NETWORK_LOAD_GENERATOR_CONTAINER,
    );
    const nlgContainer: Container = k8Containers.readByRef(containerReference);
    await nlgContainer.copyTo(throttlesSourcePath, '/app');
  }
}
