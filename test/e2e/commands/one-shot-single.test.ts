// SPDX-License-Identifier: Apache-2.0

import {describe} from 'mocha';
import {expect} from 'chai';

import {resetForTest} from '../../test-container.js';
import {container} from 'tsyringe-neo';
import {InjectTokens} from '../../../src/core/dependency-injection/inject-tokens.js';
import fs from 'node:fs';
import {type K8ClientFactory} from '../../../src/integration/kube/k8-client/k8-client-factory.js';
import {type K8} from '../../../src/integration/kube/k8.js';
import {DEFAULT_LOCAL_CONFIG_FILE} from '../../../src/core/constants.js';
import {Duration} from '../../../src/core/time/duration.js';
import {type Pod} from '../../../src/integration/kube/resources/pod/pod.js';
import {PodReference} from '../../../src/integration/kube/resources/pod/pod-reference.js';
import {ContainerReference} from '../../../src/integration/kube/resources/container/container-reference.js';
import {getTemporaryDirectory} from '../../test-utility.js';
import {PathEx} from '../../../src/business/utils/path-ex.js';
import {
  Client,
  AccountId,
  PrivateKey,
  Hbar,
  TransferTransaction,
  type TransactionReceipt,
  type TransactionResponse,
} from '@hiero-ledger/sdk';
import {EndToEndTestSuiteBuilder} from '../end-to-end-test-suite-builder.js';
import {type EndToEndTestSuite} from '../end-to-end-test-suite.js';
import {type BaseTestOptions} from './tests/base-test-options.js';
import {main} from '../../../src/index.js';
import {BaseCommandTest} from './tests/base-command-test.js';
import {OneShotCommandDefinition} from '../../../src/commands/command-definitions/one-shot-command-definition.js';
import {MetricsServerImpl} from '../../../src/business/runtime-state/services/metrics-server-impl.js';
import * as constants from '../../../src/core/constants.js';
import {Flags} from '../../../src/commands/flags.js';
import {HelmMetricsServer} from '../../helpers/helm-metrics-server.js';
import {HelmMetalLoadBalancer} from '../../helpers/helm-metal-load-balancer.js';
import {DeploymentTest} from './tests/deployment-test.js';
import {KeysAndPermissionsTest} from './tests/keys-and-permissions-test.js';
import {NamespaceName} from '../../../src/types/namespace/namespace-name.js';

const minimalSetup: boolean = process.env.SOLO_ONE_SHOT_MINIMAL_SETUP?.toLowerCase() === 'true';

const testName: string = minimalSetup ? 'one-shot-single-minimal' : 'one-shot-single';
const testTitle: string = 'One Shot Single E2E Test';
const endToEndTestSuite: EndToEndTestSuite = new EndToEndTestSuiteBuilder()
  .withTestName(testName)
  .withTestSuiteName(`${testTitle} Suite`)
  .withNamespace(testName)
  .withDeployment(`${testName}-deployment`)
  .withClusterCount(1)
  .withMinimalSetup(process.env.SOLO_ONE_SHOT_MINIMAL_SETUP?.toLowerCase() === 'true')
  .withChainId(1234)
  .withTestSuiteCallback((options: BaseTestOptions): void => {
    describe(testTitle, (): void => {
      const {testCacheDirectory, testLogger, namespace, contexts, deployment} = options;
      let originalChainId: string | undefined;

      // TODO the kube config context causes issues if it isn't one of the selected clusters we are deploying to
      before(async (): Promise<void> => {
        if (options.chainId) {
          originalChainId = process.env.SOLO_CHAIN_ID;
          process.env.SOLO_CHAIN_ID = String(options.chainId);
        }
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
          try {
            const k8Client: K8 = container.resolve<K8ClientFactory>(InjectTokens.K8Factory).getK8(item);
            await k8Client.namespaces().delete(namespace);
          } catch {
            // allowed to fail if the namespace doesn't exist
          }
        }
        testLogger.info(`${testName}: starting ${testName} e2e test`);
      }).timeout(Duration.ofMinutes(5).toMillis());

      after(async (): Promise<void> => {
        if (options.chainId) {
          if (originalChainId === undefined) {
            delete process.env.SOLO_CHAIN_ID;
          } else {
            process.env.SOLO_CHAIN_ID = originalChainId;
          }
        }
        await main(soloDeploymentDiagnosticsLogs(testName, deployment));
        testLogger.info(`${testName}: beginning ${testName}: destroy`);
        await main(soloOneShotDestroy(testName));
        testLogger.info(`${testName}: finished ${testName}: destroy`);
      }).timeout(Duration.ofMinutes(5).toMillis());

      // TODO pass in namespace for cache directory for proper destroy on restart
      it(`${testName}: deploy`, async (): Promise<void> => {
        testLogger.info(`${testName}: beginning ${testName}: deploy`);
        await main(soloOneShotDeploy(testName, deployment, options.minimalSetup));
        testLogger.info(`${testName}: finished ${testName}: deploy`);
      }).timeout(Duration.ofMinutes(20).toMillis());

      it(`${testName}: show deployment`, async (): Promise<void> => {
        testLogger.info(`${testName}: beginning ${testName}: show deployment`);
        await main(soloOneShotShowDeployment(testName, deployment));
        testLogger.info(`${testName}: finished ${testName}: show deployment`);
      }).timeout(Duration.ofMinutes(5).toMillis());

      DeploymentTest.verifyDeploymentConfigPorts(options);

      // one-shot single always deploys into the 'one-shot' namespace regardless of the test namespace,
      // and against the current kube context (which may be 'kind-kind' for the Podman job), not the
      // SOLO_TEST_CLUSTER-derived contexts.
      KeysAndPermissionsTest.verifyConsensusNodeKeysMatchSecrets(options, NamespaceName.of('one-shot'), true);
      KeysAndPermissionsTest.verifySoloHomeFilePermissions(options);

      it('Should perform a simple TransferTransaction', async (): Promise<void> => {
        // These should be set in your environment or test config
        const operatorId: AccountId = AccountId.fromString('0.0.2');
        const operatorKey: PrivateKey = PrivateKey.fromStringED25519(constants.GENESIS_KEY);
        const recipientId: AccountId = AccountId.fromString('0.0.3');
        const client: Client = Client.forNetwork({'localhost:35211': '0.0.3'}).setOperator(operatorId, operatorKey);

        const tx: TransactionResponse = await new TransferTransaction()
          .addHbarTransfer(operatorId, new Hbar(-1))
          .addHbarTransfer(recipientId, new Hbar(1))
          .execute(client);

        const receipt: TransactionReceipt = await tx.getReceipt(client);
        if (receipt.status.toString() !== 'SUCCESS') {
          throw new Error(`TransferTransaction failed: ${receipt.status}`);
        }
      });

      it('should have correct chainId in application.properties', async (): Promise<void> => {
        const oneShotNamespace: NamespaceName = NamespaceName.of('one-shot');
        const k8: K8 = container.resolve<K8ClientFactory>(InjectTokens.K8Factory).default();
        const pods: Pod[] = await k8.pods().list(oneShotNamespace, ['solo.hedera.com/type=network-node']);
        const containerReference: ContainerReference = ContainerReference.of(
          PodReference.of(oneShotNamespace, pods[0].podReference.name),
          constants.ROOT_CONTAINER,
        );
        const temporaryDirectory: string = getTemporaryDirectory();
        await k8
          .containers()
          .readByRef(containerReference)
          .copyFrom(
            `${constants.HEDERA_HAPI_PATH}/data/config/${constants.APPLICATION_PROPERTIES}`,
            temporaryDirectory,
          );
        const content: string = fs.readFileSync(
          PathEx.join(temporaryDirectory, constants.APPLICATION_PROPERTIES),
          'utf8',
        );
        expect(content).to.include(`contracts.chainId=${options.chainId}`);
      }).timeout(Duration.ofMinutes(2).toMillis());

      it('Should write log metrics', async (): Promise<void> => {
        if (minimalSetup) {
          await HelmMetricsServer.installMetricsServer(testName);
          await HelmMetalLoadBalancer.installMetalLoadBalancer(testName);
        }

        await new MetricsServerImpl().logMetrics(testName, PathEx.join(constants.SOLO_LOGS_DIR, `${testName}`));
      }).timeout(Duration.ofMinutes(60).toMillis());

      DeploymentTest.verifyStopPortForwards(options);

      // TODO add verifications
    });
  })
  .build();
endToEndTestSuite.runTestSuite();

export function soloOneShotDeploy(testName: string, deployment: string, minimalSetup: boolean): string[] {
  const {newArgv, argvPushGlobalFlags, optionFromFlag} = BaseCommandTest;

  const argv: string[] = newArgv();
  argv.push(
    OneShotCommandDefinition.COMMAND_NAME,
    OneShotCommandDefinition.SINGLE_SUBCOMMAND_NAME,
    OneShotCommandDefinition.SINGLE_DEPLOY,
    optionFromFlag(Flags.deployment),
    deployment,
    optionFromFlag(Flags.minimalSetup),
    minimalSetup ? 'true' : 'false',
  );
  argvPushGlobalFlags(argv, testName);
  return argv;
}

export function soloOneShotDestroy(testName: string): string[] {
  const {newArgv, argvPushGlobalFlags} = BaseCommandTest;

  const argv: string[] = newArgv();
  argv.push('one-shot', 'single', 'destroy');
  argvPushGlobalFlags(argv, testName);
  return argv;
}

export function soloOneShotShowDeployment(testName: string, deployment: string): string[] {
  const {newArgv, argvPushGlobalFlags, optionFromFlag} = BaseCommandTest;

  const argv: string[] = newArgv();
  argv.push(OneShotCommandDefinition.COMMAND_NAME, OneShotCommandDefinition.INFO_COMMAND_NAME, 'deployment');
  if (deployment) {
    argv.push(optionFromFlag(Flags.deployment), deployment);
  }
  argvPushGlobalFlags(argv, testName);
  return argv;
}

export function soloDeploymentDiagnosticsLogs(testName: string, deployment: string): string[] {
  const {newArgv, argvPushGlobalFlags} = BaseCommandTest;
  const argv: string[] = newArgv();
  argv.push('deployment', 'diagnostics', 'logs', '--deployment', deployment);
  argvPushGlobalFlags(argv, testName);
  return argv;
}
