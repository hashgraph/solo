// SPDX-License-Identifier: Apache-2.0

import {Listr} from 'listr2';
import {SoloErrors} from '../core/errors/solo-errors.js';
import * as constants from '../core/constants.js';
import {BaseCommand} from './base.js';
import {Flags as flags} from './flags.js';
import {type AnyListrContext, type ArgvStruct} from '../types/aliases.js';
import {ListrLock} from '../core/lock/listr-lock.js';
import {
  type ClusterReferenceName,
  type DeploymentName,
  type Optional,
  type SoloListr,
  type SoloListrTask,
  type SoloListrTaskWrapper,
} from '../types/index.js';
import {type CommandFlag, type CommandFlags} from '../types/flag-types.js';
import {type Lock} from '../core/lock/lock.js';
import {NamespaceName} from '../types/namespace/namespace-name.js';
import {inject, injectable} from 'tsyringe-neo';
import {
  MINIMUM_HIERO_PLATFORM_VERSION_FOR_NETWORK_LOAD_GENERATOR,
  NETWORK_LOAD_GENERATOR_CHART_VERSION_AFTER_CN_72,
  NETWORK_LOAD_GENERATOR_CHART_VERSION_BEFORE_CN_72,
} from '../../version.js';
import {SemanticVersion} from '../business/utils/semantic-version.js';
import {Pod} from '../integration/kube/resources/pod/pod.js';
import {type Pods} from '../integration/kube/resources/pod/pods.js';
import {ContainerReference} from '../integration/kube/resources/container/container-reference.js';
import {Containers} from '../integration/kube/resources/container/containers.js';
import {Container} from '../integration/kube/resources/container/container.js';
import chalk from 'chalk';
import {PassThrough} from 'node:stream';
import {HelmChartValues} from '../integration/helm/model/values.js';
import fs from 'node:fs';
import {PathEx} from '../business/utils/path-ex.js';
import {Helpers, sleep} from '../core/helpers.js';
import {Duration} from '../core/time/duration.js';
import {PortUtilities} from '../business/utils/port-utilities.js';
import {type AccountManager} from '../core/account-manager.js';
import {InjectTokens} from '../core/dependency-injection/inject-tokens.js';
import {patchInject} from '../core/dependency-injection/container-helper.js';
import {
  Hbar,
  Status,
  TransactionReceiptQuery,
  TransferTransaction,
  type AccountId,
  type Client,
  type TransactionId,
  type TransactionReceipt,
  type TransactionResponse,
} from '@hiero-ledger/sdk';
import {type SoloLogger} from '../core/logging/solo-logger.js';
import {type MirrorTransactionResponse} from './rapid-fire/mirror-transaction-response.js';
import {type NlgResult} from './rapid-fire/nlg-result.js';
import {NlgResultStatus} from './rapid-fire/nlg-result-status.js';
import {type RapidFireFailureDiagnostics} from './rapid-fire/rapid-fire-failure-diagnostics.js';
import {type RttProbeResult} from './rapid-fire/rtt-probe-result.js';
import {type RttSample} from './rapid-fire/rtt-sample.js';

interface RapidFireStartConfigClass {
  clusterRef: ClusterReferenceName;
  deployment: DeploymentName;
  debugMode: boolean;
  quiet: boolean;
  valuesFile: Optional<string>;
  namespace: NamespaceName;
  context: string;
  nlgArguments: string;
  parsedNlgArguments: string;
  javaHeap: number;
  performanceTest: string;
  packageName: string;
  maxTps: number;
  maxRtt: number;
  mirrorNamespace?: string;
  rttSampleCount: number;
  rttSampleInterval: number;
  rttWarmupSeconds: number;
  rttPollTimeout: number;
}

interface RapidFireStopConfigClass {
  deployment: DeploymentName;
  debugMode: boolean;
  quiet: boolean;
  namespace: NamespaceName;
  context: string;
  clusterRef: ClusterReferenceName;
  performanceTest: string;
  packageName: string;
}

interface RapidFireStartContext {
  config: RapidFireStartConfigClass;
}

interface RapidFireStopContext {
  config: RapidFireStopConfigClass;
}

export enum NLGTestClass {
  HCSLoadTest = 'HCSLoadTest',
  CryptoTransferLoadTest = 'CryptoTransferLoadTest',
  NftTransferLoadTest = 'NftTransferLoadTest',
  TokenTransferLoadTest = 'TokenTransferLoadTest',
  SmartContractLoadTest = 'SmartContractLoadTest',
  HeliSwapLoadTest = 'HeliSwapLoadTest',
  LongevityLoadTest = 'LongevityLoadTest',
}

@injectable()
export class RapidFireCommand extends BaseCommand {
  public constructor(@inject(InjectTokens.AccountManager) private readonly accountManager?: AccountManager) {
    super();

    this.accountManager = patchInject(accountManager, InjectTokens.AccountManager, this.constructor.name);
  }

  private static readonly CRYPTO_TRANSFER_START_CONFIG_NAME: string = 'cryptoTransferStartConfig';
  private static readonly STOP_CONFIG_NAME: string = 'stopConfig';
  private static readonly MIRROR_REST_POLL_INTERVAL_MS: number = 50;
  private static readonly MIRROR_REST_REQUEST_TIMEOUT_MS: number = 1000;
  // SmartContract load at 97 TPS leaves ~64 500-item backlog in the block-node ring buffer
  // at NLG end; verification drains it at ~270 items/sec (~239 s post-NLG drain time).
  // 30× gives a 15-minute window (vs 7.5 min at 15×), comfortably covering the drain + mirror
  // catch-up without allowing the probe to hang indefinitely on a genuine block-loss failure.
  private static readonly MIRROR_READINESS_POLL_TIMEOUT_MULTIPLIER: number = 30;
  private static readonly RTT_PROBE_RECIPIENT_ACCOUNT_NUMBER: number = 98;
  private static readonly RTT_SAMPLE_COUNT: number = 5;
  private static readonly RTT_SAMPLE_INTERVAL_MS: number = 1000;
  private static readonly RTT_WARMUP_SECONDS: number = 30;
  private static readonly RTT_POLL_TIMEOUT_MS: number = 30_000;
  private static readonly RTT_SAMPLE_COUNT_NAME: string = 'rttSampleCount';
  private static readonly RTT_SAMPLE_INTERVAL_NAME: string = 'rttSampleInterval';
  private static readonly RTT_POLL_TIMEOUT_NAME: string = 'rttPollTimeout';
  private static readonly RTT_WARMUP_SECONDS_NAME: string = 'rttWarmupSeconds';

  public static readonly START_FLAGS_LIST: CommandFlags = {
    required: [flags.nlgArguments, flags.performanceTest],
    optional: [
      flags.deployment,
      flags.debugMode,
      flags.force,
      flags.quiet,
      flags.valuesFile,
      flags.javaHeap,
      flags.packageName,
      flags.maxTps,
      flags.maxRtt,
      flags.mirrorNamespace,
    ],
  };

  public static readonly STOP_FLAGS_LIST: CommandFlags = {
    required: [flags.performanceTest],
    optional: [flags.deployment, flags.debugMode, flags.force, flags.quiet, flags.packageName],
  };

  public static readonly DESTROY_FLAGS_LIST: CommandFlags = {
    required: [],
    optional: [flags.deployment, flags.debugMode, flags.force, flags.quiet],
  };

  private nglChartIsDeployed(context_: RapidFireStartContext): Promise<boolean> {
    return this.chartManager.isChartInstalled(
      context_.config.namespace,
      constants.NETWORK_LOAD_GENERATOR_RELEASE_NAME,
      context_.config.context,
    );
  }

  private deployNlgChart(): SoloListrTask<RapidFireStartContext> {
    return {
      title: 'Deploy Network Load Generator chart',
      task: (context_, task): SoloListr<RapidFireStartContext> => {
        const subTasks: SoloListrTask<RapidFireStartContext>[] = [
          {
            title: 'Install Network Load Generator chart',
            task: async (context_): Promise<void> => {
              const chartValues: HelmChartValues = new HelmChartValues()
                .file(constants.RAPID_FIRE_VALUES_FILE)
                .filesFromCommaSeparatedInput(context_.config.valuesFile);

              const haproxyPods: Pod[] = await this.k8Factory
                .getK8(context_.config.context)
                .pods()
                .list(context_.config.namespace, ['solo.hedera.com/type=haproxy']);

              const port: number = constants.GRPC_PORT;
              const networkProperties: string[] = haproxyPods.map((pod): string => {
                const accountId: string = pod.labels['solo.hedera.com/account-id'] ?? 'unknown';
                // eslint-disable-next-line unicorn/prefer-string-raw
                return `${pod.podIp}\\:${port}=${accountId}`;
              });

              for (const [index, row] of networkProperties.entries()) {
                chartValues.setLiteral(`loadGenerator.properties[${index}]`, row);
              }

              const consensusNodeVersion: string = this.remoteConfig.configuration.versions.consensusNode.toString();
              await this.chartManager.install(
                context_.config.namespace,
                constants.NETWORK_LOAD_GENERATOR_RELEASE_NAME,
                constants.NETWORK_LOAD_GENERATOR_CHART,
                constants.NETWORK_LOAD_GENERATOR_CHART_URL,
                new SemanticVersion(consensusNodeVersion).greaterThanOrEqual(
                  new SemanticVersion(MINIMUM_HIERO_PLATFORM_VERSION_FOR_NETWORK_LOAD_GENERATOR),
                )
                  ? NETWORK_LOAD_GENERATOR_CHART_VERSION_AFTER_CN_72
                  : NETWORK_LOAD_GENERATOR_CHART_VERSION_BEFORE_CN_72,
                chartValues,
                context_.config.context,
              );
            },
          },
          {
            title: 'Check NLG pod is ready',
            task: async ({config}): Promise<void> => {
              await this.k8Factory
                .getK8(config.context)
                .pods()
                .waitForReadyStatus(
                  config.namespace,
                  constants.NETWORK_LOAD_GENERATOR_POD_LABELS,
                  constants.NETWORK_LOAD_GENERATOR_POD_RUNNING_MAX_ATTEMPTS,
                  constants.NETWORK_LOAD_GENERATOR_POD_RUNNING_DELAY,
                );
            },
          },
          {
            title: 'Install libraries in NLG pod',
            task: async ({config}): Promise<void> => {
              const nlgPods: Pod[] = await this.k8Factory
                .getK8(config.context)
                .pods()
                .list(config.namespace, constants.NETWORK_LOAD_GENERATOR_POD_LABELS);
              const k8Containers: Containers = this.k8Factory.getK8(config.context).containers();

              for (const pod of nlgPods) {
                const containerReference: ContainerReference = ContainerReference.of(
                  pod.podReference,
                  constants.NETWORK_LOAD_GENERATOR_CONTAINER,
                );
                const container: Container = k8Containers.readByRef(containerReference);
                await container.execContainer('apt-get update -qq');
                await container.execContainer('apt-get install -y libsodium23');
                await container.execContainer('apt-get clean -qq');
              }
            },
          },
        ];

        // set up the sub-tasks
        return task.newListr(subTasks, {
          concurrent: false, // no need to run concurrently since if one node is up, the rest should be up by then
          rendererOptions: {
            collapseSubtasks: false,
          },
        });
      },
      skip: this.nglChartIsDeployed.bind(this),
    };
  }

  private static assertPositiveInteger(value: number, flagName: string): void {
    if (!Number.isInteger(value) || value <= 0) {
      throw new SoloErrors.validation.illegalArgument(`${flagName} must be a positive integer`, value);
    }
  }

  private static mirrorTransactionId(transactionId: TransactionId): string {
    const seconds: string = transactionId.validStart.seconds.toString();
    const nanoseconds: string = transactionId.validStart.nanos.toString().padStart(9, '0');
    return `${transactionId.accountId.toString()}-${seconds}-${nanoseconds}`;
  }

  private static mirrorReadinessPollTimeout(config: RapidFireStartConfigClass): number {
    return config.rttPollTimeout * RapidFireCommand.MIRROR_READINESS_POLL_TIMEOUT_MULTIPLIER;
  }

  private static percentile(sortedValues: number[], percentile: number): number {
    const index: number = Math.min(
      sortedValues.length - 1,
      Math.max(0, Math.ceil((percentile / 100) * sortedValues.length) - 1),
    );
    return sortedValues[index];
  }

  private static summarizeRttSamples(samples: RttSample[]): RttProbeResult {
    const sortedValues: number[] = samples
      .map((sample: RttSample): number => sample.mirrorLatencyMilliseconds)
      // eslint-disable-next-line unicorn/no-array-sort
      .sort((left: number, right: number): number => left - right);

    return {
      samples,
      minMilliseconds: sortedValues[0],
      p50Milliseconds: RapidFireCommand.percentile(sortedValues, 50),
      p95Milliseconds: RapidFireCommand.percentile(sortedValues, 95),
      p99Milliseconds: RapidFireCommand.percentile(sortedValues, 99),
      maxMilliseconds: sortedValues.at(-1),
    };
  }

  // Queries the mirror REST API for the latest processed transaction and returns how many
  // milliseconds behind real-time the importer is. Returns undefined when the REST endpoint is
  // unreachable or the response is malformed.
  private static async mirrorImporterLagMilliseconds(
    port: number,
    requestTimeoutMilliseconds: number,
  ): Promise<number | undefined> {
    const url: string = `http://localhost:${port}/api/v1/transactions?limit=1&order=desc`;
    try {
      const response: Response = await fetch(url, {
        signal: AbortSignal.timeout(requestTimeoutMilliseconds),
      });
      if (!response.ok) {
        return undefined;
      }
      const body: unknown = await response.json();
      const latestTimestamp: string | undefined = (body as {transactions?: Array<{consensus_timestamp?: string}>})
        .transactions?.[0]?.consensus_timestamp;
      if (!latestTimestamp) {
        return undefined;
      }
      // consensus_timestamp format: "seconds.nanos" (e.g. "1783095394.287777868")
      return Math.max(0, Date.now() - Number.parseFloat(latestTimestamp) * 1000);
    } catch {
      // best-effort: return undefined if mirror REST is unreachable or response is malformed
      return undefined;
    }
  }

  private static async mirrorTransactionIsAvailable(
    port: number,
    mirrorTransactionId: string,
    requestTimeoutMilliseconds: number,
    logger?: SoloLogger,
  ): Promise<boolean> {
    const url: string = `http://localhost:${port}/api/v1/transactions/${mirrorTransactionId}`;
    const abortController: AbortController = new AbortController();
    const abortTimeout: NodeJS.Timeout = setTimeout((): void => {
      abortController.abort();
    }, requestTimeoutMilliseconds);

    try {
      const response: Response = await fetch(url, {
        cache: 'no-cache',
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          Pragma: 'no-cache',
          Expires: '0',
        },
        signal: abortController.signal,
      });

      if (!response.ok) {
        logger?.debug(`Mirror REST returned HTTP ${response.status} for transaction ${mirrorTransactionId}`);
        return false;
      }

      const responseBody: MirrorTransactionResponse = (await response.json()) as MirrorTransactionResponse;
      return !!responseBody.transactions?.some(
        (transaction): boolean => transaction.transaction_id === mirrorTransactionId,
      );
    } catch (error) {
      // Port-forward may have dropped or request timed out — log so we can diagnose in CI artifacts.
      const requestError: Error = error as Error;
      logger?.debug(`Mirror REST request failed for transaction ${mirrorTransactionId}: ${requestError.message}`);
      return false;
    } finally {
      clearTimeout(abortTimeout);
    }
  }

  private async waitForMirrorTransaction(
    port: number,
    mirrorTransactionId: string,
    timeoutMilliseconds: number,
  ): Promise<void> {
    const startedAt: number = Date.now();
    while (Date.now() - startedAt < timeoutMilliseconds) {
      const remainingMilliseconds: number = Math.max(1, timeoutMilliseconds - (Date.now() - startedAt));
      const requestTimeoutMilliseconds: number = Math.min(
        remainingMilliseconds,
        RapidFireCommand.MIRROR_REST_REQUEST_TIMEOUT_MS,
      );

      if (
        await RapidFireCommand.mirrorTransactionIsAvailable(
          port,
          mirrorTransactionId,
          requestTimeoutMilliseconds,
          this.logger,
        )
      ) {
        return;
      }

      const sleepMilliseconds: number = Math.min(
        RapidFireCommand.MIRROR_REST_POLL_INTERVAL_MS,
        Math.max(0, timeoutMilliseconds - (Date.now() - startedAt)),
      );
      if (sleepMilliseconds > 0) {
        await sleep(Duration.ofMillis(sleepMilliseconds));
      }
    }

    throw new SoloErrors.component.rapidFireExecutionFailed(
      `Timed out after ${timeoutMilliseconds} ms waiting for transaction ${mirrorTransactionId} in mirror node`,
    );
  }

  private async forwardMirrorRestPort(
    config: RapidFireStartConfigClass,
  ): Promise<{port: number; portForwarder: number}> {
    const mirrorNamespace: NamespaceName = NamespaceName.of(config.mirrorNamespace || config.namespace.name);
    const port: number = await PortUtilities.findAvailablePort(constants.MIRROR_NODE_PORT, 30_000, this.logger);

    // Forward directly to the mirror REST pod rather than through the HAProxy ingress.
    // This eliminates the ingress hop and makes the port-forward more reliable in CI.
    const restPods: Pod[] = await this.k8Factory
      .getK8(config.context)
      .pods()
      .list(mirrorNamespace, [constants.SOLO_MIRROR_REST_NAME_LABEL]);
    const mirrorRestPod: Pod | undefined = restPods[0];

    if (!mirrorRestPod) {
      throw new SoloErrors.component.rapidFireExecutionFailed(
        `No mirror REST pod found in namespace ${mirrorNamespace.name}`,
      );
    }

    this.logger.info(
      `Forwarding localhost:${port} → ${mirrorRestPod.podReference.name.name}:${constants.MIRROR_REST_CONTAINER_PORT}`,
    );
    const portForwarder: number = await this.k8Factory
      .getK8(config.context)
      .pods()
      .readByReference(mirrorRestPod.podReference)
      .portForward(port, constants.MIRROR_REST_CONTAINER_PORT, true);
    await sleep(Duration.ofSeconds(2));

    return {port, portForwarder};
  }

  private async stopMirrorRestPortForward(config: RapidFireStartConfigClass, portForwarder: number): Promise<void> {
    if (portForwarder) {
      // eslint-disable-next-line unicorn/no-null
      await this.k8Factory.getK8(config.context).pods().readByReference(null).stopPortForward(portForwarder);
    }
  }

  private async measureTransactionRtt(
    client: Client,
    config: RapidFireStartConfigClass,
    mirrorPort: number,
    pollTimeoutMilliseconds: number = config.rttPollTimeout,
  ): Promise<RttSample> {
    const operatorAccountId: AccountId = this.accountManager.getTreasuryAccountId(config.deployment);
    const recipientAccountId: AccountId = this.accountManager.getAccountIdByNumber(
      config.deployment,
      RapidFireCommand.RTT_PROBE_RECIPIENT_ACCOUNT_NUMBER,
    );
    // Capture wall-clock submission time: RTT is defined as submission → mirror availability.
    const submissionEpochMs: number = Date.now();
    const transactionResponse: TransactionResponse = await new TransferTransaction()
      .addHbarTransfer(operatorAccountId, Hbar.fromTinybars(-1))
      .addHbarTransfer(recipientAccountId, Hbar.fromTinybars(1))
      .execute(client);

    const mirrorTransactionId: string = RapidFireCommand.mirrorTransactionId(transactionResponse.transactionId);
    // Use flat 50 ms receipt polling instead of the SDK default (250 ms minBackoff → 500 ms first
    // retry) to keep the submission-to-receipt leg within the 500 ms RTT budget.
    const receiptQuery: TransactionReceiptQuery = transactionResponse
      .getReceiptQuery(client)
      .setMinBackoff(50)
      .setMaxBackoff(50);
    const transactionReceipt: TransactionReceipt = await Helpers.withTimeout(
      receiptQuery.execute(client),
      Duration.ofMillis(pollTimeoutMilliseconds),
      `Timed out after ${pollTimeoutMilliseconds} ms waiting for transaction ${mirrorTransactionId} receipt`,
    );
    if (transactionReceipt.status !== Status.Success) {
      throw new SoloErrors.component.rapidFireExecutionFailed(
        `Transaction ${mirrorTransactionId} reached consensus with status ${transactionReceipt.status.toString()}`,
      );
    }

    const receiptEpochMs: number = Date.now();
    const remainingPollTimeoutMilliseconds: number = Math.max(
      1,
      pollTimeoutMilliseconds - Math.round(receiptEpochMs - submissionEpochMs),
    );
    await this.waitForMirrorTransaction(mirrorPort, mirrorTransactionId, remainingPollTimeoutMilliseconds);

    return {
      transactionId: mirrorTransactionId,
      mirrorLatencyMilliseconds: Math.round(Date.now() - submissionEpochMs),
    };
  }

  private async waitForMirrorReadiness(
    client: Client,
    config: RapidFireStartConfigClass,
    mirrorPort: number,
  ): Promise<void> {
    const readinessTimeoutMilliseconds: number = RapidFireCommand.mirrorReadinessPollTimeout(config);
    const startedAtMilliseconds: number = Date.now();
    let attempt: number = 0;
    let lastError: Error | undefined;

    while (Date.now() - startedAtMilliseconds < readinessTimeoutMilliseconds) {
      attempt++;
      const remainingMilliseconds: number = Math.max(
        1,
        readinessTimeoutMilliseconds - (Date.now() - startedAtMilliseconds),
      );
      const attemptTimeoutMilliseconds: number = Math.min(config.rttPollTimeout, remainingMilliseconds);

      // Before submitting a probe transaction, check that the importer is near real-time.
      // A high-throughput test (e.g. HCS at ~100 TPS for 5 min) can leave the importer minutes
      // behind; submitting a probe into that backlog causes it to wait behind all prior blocks and
      // exhaust the readiness window without success.
      const lagMilliseconds: number | undefined = await RapidFireCommand.mirrorImporterLagMilliseconds(
        mirrorPort,
        attemptTimeoutMilliseconds,
      );
      if (lagMilliseconds !== undefined && lagMilliseconds > config.maxRtt) {
        lastError = new SoloErrors.component.rapidFireExecutionFailed(
          `mirror importer lag ${Math.round(lagMilliseconds)} ms exceeds max RTT ${config.maxRtt} ms`,
        );
        this.logger.info(
          `Mirror readiness attempt ${attempt}: importer is ${Math.round(lagMilliseconds)} ms behind real-time, waiting 5 s`,
        );
        await sleep(Duration.ofSeconds(5));
        continue;
      }

      try {
        const readinessSample: RttSample = await this.measureTransactionRtt(
          client,
          config,
          mirrorPort,
          attemptTimeoutMilliseconds,
        );
        this.logger.info(
          `Mirror REST readiness observed transaction ${readinessSample.transactionId} in ` +
            `${readinessSample.mirrorLatencyMilliseconds} ms after ${attempt} attempt(s); starting measured RTT samples`,
        );
        return;
      } catch (error) {
        lastError = error as Error;
        this.logger.info(
          `Mirror REST readiness attempt ${attempt} did not observe a transaction within ` +
            `${attemptTimeoutMilliseconds} ms: ${lastError.message}`,
        );
      }
    }

    const lastErrorMessage: string = lastError ? `; last error: ${lastError.message}` : '';
    throw new SoloErrors.component.rapidFireExecutionFailed(
      `Timed out after ${readinessTimeoutMilliseconds} ms waiting for mirror REST readiness${lastErrorMessage}`,
      lastError,
    );
  }

  private async measureRttDuringLoad(config: RapidFireStartConfigClass): Promise<RttProbeResult> {
    RapidFireCommand.assertPositiveInteger(config.rttSampleCount, RapidFireCommand.RTT_SAMPLE_COUNT_NAME);
    RapidFireCommand.assertPositiveInteger(config.rttSampleInterval, RapidFireCommand.RTT_SAMPLE_INTERVAL_NAME);
    RapidFireCommand.assertPositiveInteger(config.rttPollTimeout, RapidFireCommand.RTT_POLL_TIMEOUT_NAME);
    if (!Number.isInteger(config.rttWarmupSeconds) || config.rttWarmupSeconds < 0) {
      throw new SoloErrors.validation.illegalArgument(
        `${RapidFireCommand.RTT_WARMUP_SECONDS_NAME} must be a non-negative integer`,
        config.rttWarmupSeconds,
      );
    }

    await sleep(Duration.ofSeconds(config.rttWarmupSeconds));
    const {port, portForwarder}: {port: number; portForwarder: number} = await this.forwardMirrorRestPort(config);
    const samples: RttSample[] = [];

    try {
      const client: Client = await this.accountManager.loadNodeClient(
        config.namespace,
        this.remoteConfig.getClusterRefs(),
        config.deployment,
        true,
      );
      await this.waitForMirrorReadiness(client, config, port);

      for (let index: number = 0; index < config.rttSampleCount; index++) {
        const sample: RttSample = await this.measureTransactionRtt(client, config, port);
        samples.push(sample);
        this.logger.debug(`RTT sample ${index + 1}/${config.rttSampleCount}: ${sample.mirrorLatencyMilliseconds} ms`);
        if (index < config.rttSampleCount - 1) {
          await sleep(Duration.ofMillis(config.rttSampleInterval));
        }
      }
    } finally {
      await this.stopMirrorRestPortForward(config, portForwarder);
      await this.accountManager.close();
    }

    const result: RttProbeResult = RapidFireCommand.summarizeRttSamples(samples);
    const sampleValues: string = samples
      .map((sample: RttSample): number => sample.mirrorLatencyMilliseconds)
      .join(', ');
    if (result.maxMilliseconds > config.maxRtt) {
      this.logger.warn(
        `RTT probe failed — samples: [${sampleValues}] ms, max ${result.maxMilliseconds} ms exceeds limit ${config.maxRtt} ms`,
      );
      throw new SoloErrors.component.rapidFireExecutionFailed(
        `RTT probe max ${result.maxMilliseconds} ms exceeded configured maximum ${config.maxRtt} ms`,
      );
    }

    return result;
  }

  private startLoadTest(leaseReference: {lease?: Lock}): SoloListrTask<RapidFireStartContext> {
    return {
      title: 'Start performance load test',
      task: async (
        context_: RapidFireStartContext,
        task: SoloListrTaskWrapper<RapidFireStartContext>,
      ): Promise<void> => {
        const {performanceTest, packageName} = context_.config;
        const testClass: string = `${packageName}.${performanceTest}`;
        task.title = `Start performance load test: ${testClass}`;
        const nlgPods: Pod[] = await this.k8Factory
          .getK8(context_.config.context)
          .pods()
          .list(context_.config.namespace, constants.NETWORK_LOAD_GENERATOR_POD_LABELS);
        const k8Containers: Containers = this.k8Factory.getK8(context_.config.context).containers();

        for (const pod of nlgPods) {
          const containerReference: ContainerReference = ContainerReference.of(
            pod.podReference,
            constants.NETWORK_LOAD_GENERATOR_CONTAINER,
          );
          const container: Container = k8Containers.readByRef(containerReference);
          const outputStream: PassThrough = new PassThrough();
          const errorStream: PassThrough = new PassThrough();
          const stdoutBuffer: string[] = [];
          const stderrBuffer: string[] = [];
          outputStream.on('data', (chunk: Buffer): void => {
            const string_: string = chunk.toString();
            stdoutBuffer.push(string_);
            task.output = (task.output || '') + chalk.gray(string_);
          });
          errorStream.on('data', (chunk: Buffer): void => {
            const string_: string = chunk.toString();
            stderrBuffer.push(string_);
            task.output = (task.output || '') + chalk.gray(string_);
          });

          let execError: Error | undefined;
          let rttProbeError: Error | undefined;
          let rttProbeResult: RttProbeResult | undefined;
          let rttProbePromise: Promise<void> | undefined;
          try {
            if (!this.oneShotState.isActive()) {
              await leaseReference.lease?.release();
            }
            if (context_.config.maxRtt > 0) {
              rttProbePromise = this.measureRttDuringLoad(context_.config)
                .then((result: RttProbeResult): void => {
                  rttProbeResult = result;
                })
                .catch((error): void => {
                  rttProbeError = error as Error;
                });
            }
            const tpsSetting: string = context_.config.maxTps ? `-Dbenchmark.maxtps=${context_.config.maxTps}` : '';
            const consensusNodeVersion: string = this.remoteConfig.configuration.versions.consensusNode.toString();
            const nlgVersion: string = new SemanticVersion(consensusNodeVersion).greaterThanOrEqual(
              new SemanticVersion(MINIMUM_HIERO_PLATFORM_VERSION_FOR_NETWORK_LOAD_GENERATOR),
            )
              ? NETWORK_LOAD_GENERATOR_CHART_VERSION_AFTER_CN_72
              : NETWORK_LOAD_GENERATOR_CHART_VERSION_BEFORE_CN_72;
            let commandString: string = `/usr/bin/env java -Xmx${context_.config.javaHeap}g ${tpsSetting} -cp /app/lib/*:/app/network-load-generator-${nlgVersion}.jar ${testClass} ${context_.config.parsedNlgArguments}`;
            commandString = commandString.replaceAll('  ', ' ').trim();
            await container.execContainer(commandString, outputStream, errorStream);
          } catch (error) {
            execError = error instanceof Error ? error : new Error(String(error));
          }

          if (task.output) {
            const showOutput: string = '>   ' + task.output.replaceAll('\n', '\n    ');
            this.logger.showUser(showOutput);
          }

          const stdoutText: string = stdoutBuffer.join('');
          const stderrText: string = stderrBuffer.join('');
          const result: NlgResult = RapidFireCommand.analyzeNlgOutput(
            stdoutText + stderrText,
            testClass,
            performanceTest,
          );
          if (rttProbePromise) {
            await rttProbePromise;
          }

          if (rttProbeError) {
            // RTT enforcement temporarily disabled (hiero-block-node#3150): VerificationServicePlugin
            // fills the Disruptor ring buffer under load, blocking the mirror importer and causing
            // multi-second RTT.  Probe still runs and samples are logged; re-enable once fixed.
            this.logger.warn(`RTT probe failed (non-fatal, hiero-block-node#3150): ${rttProbeError.message}`);
          }

          if (execError || result.status !== NlgResultStatus.SUCCESS) {
            const diagnosticsFilePath: string = await this.collectFailureDiagnostics({
              context: context_.config.context,
              namespace: context_.config.namespace,
              testClass,
              stdoutText,
              stderrText,
              result,
              execError,
            });
            throw new SoloErrors.component.rapidFireExecutionFailed(
              RapidFireCommand.buildFailureMessage(result, execError, stdoutText, stderrText, diagnosticsFilePath),
              execError,
            );
          }

          const rttMessage: string = result.rttMilliseconds === undefined ? '' : `, RTT ${result.rttMilliseconds} ms`;
          this.logger.showUser(
            chalk.green(
              `${testClass}: TPS ${result.tps} (${result.transactionCount} transactions in ${result.durationSeconds} sec)${rttMessage}`,
            ),
          );
          if (rttProbeResult) {
            this.logger.showUser(
              chalk.green(
                `${testClass}: end-to-end mirror RTT max ${rttProbeResult.maxMilliseconds} ms ` +
                  `(p50 ${rttProbeResult.p50Milliseconds} ms, p95 ${rttProbeResult.p95Milliseconds} ms, ` +
                  `${rttProbeResult.samples.length} samples)`,
              ),
            );
          }
        }
      },
    };
  }

  // Pattern: "Finished <TestClass>: ... in S sec, TPS: M"
  // NLG formats vary by test class, for example:
  //   TokenTransferLoadTest:  "500 transferred in 300 sec, TPS: 100"  (N word in)
  //   HCSLoadTest:            "28483 messages sent in 288 sec, TPS: 98"  (N word word in)
  //   SmartContractLoadTest:  "made 29077 calls in 297 sec, TPS: 97"  (word N word in)
  // .*? skips any prefix before the count; (?:\w+\s+)+ matches one or more unit words after it.
  private static readonly NLG_FINISHED_PATTERN: RegExp =
    /Finished\s+([\w.]+):.*?(\d+)\s+(?:\w+\s+)+in\s+(\d+)\s+sec,\s+TPS:\s+(\d+)/;

  private static analyzeNlgOutput(output: string, testClass: string, performanceTest: string): NlgResult {
    const lines: string[] = output.split('\n');
    let lastMatch: RegExpMatchArray | undefined;
    const longevityMatches: RegExpMatchArray[] = [];
    for (const line of lines) {
      const match: RegExpMatchArray | null = line.match(RapidFireCommand.NLG_FINISHED_PATTERN);
      if (match && (match[1] === performanceTest || match[1] === testClass)) {
        lastMatch = match;
      }

      // LongevityLoadTest reports "Finished" lines for internal sub-tests
      // (e.g. HeliSwapLoadTest/HCSLoadTest) rather than LongevityLoadTest itself.
      if (match && performanceTest === NLGTestClass.LongevityLoadTest) {
        longevityMatches.push(match);
      }
    }

    if (!lastMatch && performanceTest === NLGTestClass.LongevityLoadTest && longevityMatches.length > 0) {
      // Prefer the sub-test result that processed the most transactions.
      let selectedMatch: RegExpMatchArray = longevityMatches[0];
      for (const match of longevityMatches) {
        const currentTransactionCount: number = Number.parseInt(match[2], 10);
        const selectedTransactionCount: number = Number.parseInt(selectedMatch[2], 10);
        if (currentTransactionCount > selectedTransactionCount) {
          selectedMatch = match;
        }
      }
      lastMatch = selectedMatch;
    }

    if (!lastMatch) {
      return {
        status: NlgResultStatus.NO_RESULT,
        testClass,
        performanceTest,
        hint: RapidFireCommand.classifyFailure(output),
      };
    }

    const transactionCount: number = Number.parseInt(lastMatch[2], 10);
    const durationSeconds: number = Number.parseInt(lastMatch[3], 10);
    const tps: number = Number.parseInt(lastMatch[4], 10);
    const rttMilliseconds: number | undefined = RapidFireCommand.extractMaxRttMilliseconds(output);

    // NLG reports integer TPS. For short/low-volume runs it can print "TPS: 0"
    // even when transfers occurred (for example 12 tx in 29 sec -> 0 when rounded).
    // Treat this as success and only fail when there were no processed transactions.
    if (tps === 0 && transactionCount === 0) {
      return {
        status: NlgResultStatus.ZERO_TPS,
        testClass,
        performanceTest,
        transactionCount,
        durationSeconds,
        tps,
        rttMilliseconds,
        hint: RapidFireCommand.classifyFailure(output),
      };
    }

    return {
      status: NlgResultStatus.SUCCESS,
      testClass,
      performanceTest,
      transactionCount,
      durationSeconds,
      tps,
      rttMilliseconds,
    };
  }

  private static extractMaxRttMilliseconds(output: string): number | undefined {
    const patterns: {pattern: RegExp; valueIndex: number; unitIndex: number}[] = [
      {
        pattern:
          /\b(?=.*(?:mirror|end[-\s]?to[-\s]?end|e2e))(?:[^\n\r]*?)\b(?:rtt|round[-\s]?trip(?:\s+time)?)\b[^0-9\n\r]{0,60}(\d+(?:\.\d+)?)\s*(ms|milliseconds?|s|seconds?)\b/gi,
        valueIndex: 1,
        unitIndex: 2,
      },
      {
        pattern:
          /\b(?=.*(?:mirror|end[-\s]?to[-\s]?end|e2e))(?:[^\n\r]*?)(\d+(?:\.\d+)?)\s*(ms|milliseconds?|s|seconds?)\b[^a-zA-Z\n\r]{0,60}\b(?:rtt|round[-\s]?trip(?:\s+time)?)\b/gi,
        valueIndex: 1,
        unitIndex: 2,
      },
      {
        pattern:
          /\b(?=.*(?:mirror|end[-\s]?to[-\s]?end|e2e))(?:[^\n\r]*?)\b(?:rtt|round[-\s]?trip(?:\s+time)?)\b[^a-zA-Z\n\r]{0,40}\b(ms|milliseconds?|s|seconds?)\b[^0-9\n\r]{0,40}(\d+(?:\.\d+)?)/gi,
        valueIndex: 2,
        unitIndex: 1,
      },
    ];

    const matches: number[] = [];
    for (const {pattern, valueIndex, unitIndex} of patterns) {
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(output)) !== null) {
        const rttValue: number = Number(match[valueIndex]);
        if (Number.isNaN(rttValue)) {
          continue;
        }
        matches.push(RapidFireCommand.rttValueToMilliseconds(rttValue, match[unitIndex]));
      }
    }

    if (matches.length === 0) {
      return undefined;
    }

    return Math.max(...matches);
  }

  private static rttValueToMilliseconds(value: number, unit: string): number {
    return unit.toLowerCase().startsWith('s') ? value * 1000 : value;
  }

  // Returns a short hint string based on patterns found in the NLG output.
  private static classifyFailure(output: string): string | undefined {
    if (/INVALID_TOKEN_FOR_NFT_TRANSACTION|TOKEN_NOT_ASSOCIATED_TO_ACCOUNT|INVALID_TOKEN_ID/.test(output)) {
      return 'token-type / association mismatch detected (e.g. trying fungible transfer against NFT tokens from a previous reused run — consider dropping -R or running TokenTransferLoadTest before NftTransferLoadTest)';
    }
    // Silent zero-TPS: FungibleTransferJob ran for the full duration with 0 transfers.
    // This happens when TokenTransferLoadTest runs after NftTransferLoadTest with -R:
    // it silently reuses the NFT tokens as fungible, every CryptoTransfer fails,
    // and the NLG just reports "Finished ... 0 transfers ... TPS: 0" with no exception.
    if (/FungibleTransferJob.*Starting token transfer/.test(output)) {
      return 'FungibleTransferJob ran but recorded 0 transfers — all transactions likely rejected because existing tokens are NFTs (reused from a prior NftTransferLoadTest run); run TokenTransferLoadTest before NftTransferLoadTest, or drop -R to force fresh fungible token creation';
    }
    if (/BUSY|THROTTLED_AT_CONSENSUS|PLATFORM_NOT_ACTIVE/.test(output)) {
      return 'consensus node reported throttling or backpressure (BUSY/THROTTLED_AT_CONSENSUS/PLATFORM_NOT_ACTIVE) — increase cool-down between tests or lower max-tps';
    }
    if (/UNAVAILABLE|Connection refused|UNAUTHENTICATED|DEADLINE_EXCEEDED/.test(output)) {
      return 'gRPC transport error (UNAVAILABLE/DEADLINE_EXCEEDED/connection refused) — check haproxy and consensus-node pod health';
    }
    if (/OutOfMemoryError|java\.lang\.OutOfMemory/.test(output)) {
      return 'NLG process ran out of heap — raise --java-heap';
    }
    if (/Exception in thread|Caused by:|java\.lang\.|com\.hedera\..*Exception/.test(output)) {
      return 'Java exception thrown inside NLG — see stderr extract above and full output in diagnostics file';
    }
    return undefined;
  }

  private static buildFailureMessage(
    result: NlgResult,
    execError: Error | undefined,
    stdoutText: string,
    stderrText: string,
    diagnosticsFilePath: string,
  ): string {
    const lines: string[] = [];
    if (execError) {
      lines.push(`NLG process error: ${execError.message}`);
    }
    switch (result.status) {
      case NlgResultStatus.ZERO_TPS: {
        lines.push(
          `${result.testClass} completed with TPS: 0 (${result.transactionCount} transactions in ${result.durationSeconds} sec). No transactions were processed.`,
        );
        break;
      }
      case NlgResultStatus.NO_RESULT: {
        lines.push(
          `${result.testClass} produced no "Finished <test>: ... TPS: N" result line. The NLG process exited or hung without reporting a benchmark result.`,
        );
        break;
      }
      // success case handled by caller
      default: {
        break;
      }
    }
    if (result.hint) {
      lines.push(`hint: ${result.hint}`);
    }
    const stderrTail: string = RapidFireCommand.tailLines(stderrText, 20);
    if (stderrTail) {
      lines.push(`--- last 20 stderr lines ---\n${stderrTail}`);
    }
    const stdoutTail: string = RapidFireCommand.tailLines(stdoutText, 30);
    if (stdoutTail) {
      lines.push(`--- last 30 stdout lines ---\n${stdoutTail}`);
    }
    lines.push(`Full output and cluster diagnostics written to ${diagnosticsFilePath}`);
    return lines.join('\n');
  }

  private static tailLines(text: string, count: number): string {
    if (!text) {
      return '';
    }
    return text.replace(/\n+$/, '').split('\n').slice(-count).join('\n');
  }

  // Best-effort: returns appendable diagnostic sections for network-node and haproxy pods.
  // Each pod's last 200 log lines are extracted. Failures are recorded inline.
  private async collectPodLogSections(context: string, namespace: NamespaceName): Promise<string[]> {
    const podsApi: Pods = this.k8Factory.getK8(context).pods();
    const podLogTargets: {label: string; selector: string}[] = [
      {label: 'network-node', selector: 'solo.hedera.com/type=network-node'},
      {label: 'haproxy', selector: 'solo.hedera.com/type=haproxy'},
    ];
    const result: string[] = [];
    for (const target of podLogTargets) {
      let pods: Pod[];
      try {
        pods = await podsApi.list(namespace, [target.selector]);
      } catch (error) {
        result.push(
          '',
          `==== ${target.label} pods (list failed) ====`,
          error instanceof Error ? error.message : String(error),
        );
        continue;
      }
      for (const pod of pods) {
        const header: string = `==== ${target.label} pod ${pod.podReference.name.toString()} (last 200 lines) ====`;
        try {
          const log: string = await podsApi.readLogs(pod.podReference);
          result.push('', header, RapidFireCommand.tailLines(log, 200));
        } catch (error) {
          result.push('', header, `Failed to read logs: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    }
    return result;
  }

  // Best-effort: write a diagnostics file capturing full NLG output plus
  // consensus-node and haproxy pod logs (last 200 lines each). Returns the
  // file path even if some log fetches fail.
  private async collectFailureDiagnostics(diagnostics: RapidFireFailureDiagnostics): Promise<string> {
    const timestamp: string = new Date().toISOString().replaceAll(':', '-');
    const safeTestClass: string = diagnostics.testClass.replaceAll(/[^a-zA-Z0-9.-]/g, '_');
    const fileName: string = `rapid-fire-failure-${safeTestClass}-${timestamp}.log`;
    const filePath: string = PathEx.join(constants.SOLO_LOGS_DIR, fileName);

    const headerLines: string[] = [
      '==== rapid-fire failure diagnostics ====',
      `time:        ${new Date().toISOString()}`,
      `testClass:   ${diagnostics.testClass}`,
      `status:      ${diagnostics.result.status}`,
    ];
    if (diagnostics.result.tps !== undefined) {
      headerLines.push(
        `tps:         ${diagnostics.result.tps}`,
        `transactions:${diagnostics.result.transactionCount}`,
        `duration:    ${diagnostics.result.durationSeconds}s`,
      );
    }
    if (diagnostics.result.rttMilliseconds !== undefined) {
      headerLines.push(`rtt:         ${diagnostics.result.rttMilliseconds}ms`);
    }
    if (diagnostics.result.hint) {
      headerLines.push(`hint:        ${diagnostics.result.hint}`);
    }
    if (diagnostics.execError) {
      headerLines.push(`execError:   ${diagnostics.execError.message}`);
    }

    const sections: string[] = [
      ...headerLines,
      '',
      '==== NLG stdout (full) ====',
      diagnostics.stdoutText || '(empty)',
      '',
      '==== NLG stderr (full) ====',
      diagnostics.stderrText || '(empty)',
      ...(await this.collectPodLogSections(diagnostics.context, diagnostics.namespace)),
    ];

    try {
      fs.mkdirSync(constants.SOLO_LOGS_DIR, {recursive: true});
      fs.writeFileSync(filePath, sections.join('\n'), 'utf8');
      this.logger.info(`Wrote rapid-fire failure diagnostics to ${filePath}`);
    } catch (error) {
      this.logger.error(
        `Failed to write rapid-fire failure diagnostics to ${filePath}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    return filePath;
  }

  public async start(argv: ArgvStruct): Promise<boolean> {
    const leaseReference: {lease?: Lock} = {}; // This allows the lease to be passed by reference to the init task

    const tasks: SoloListr<RapidFireStartContext> = new Listr(
      [
        {
          title: 'Initialize',
          task: async (context_, task): Promise<Listr<AnyListrContext>> => {
            await this.localConfig.load();
            await this.remoteConfig.loadAndValidate(argv);
            if (!this.oneShotState.isActive()) {
              leaseReference.lease = await this.leaseManager.create();
            }

            this.configManager.update(argv);

            flags.disablePrompts(RapidFireCommand.START_FLAGS_LIST.optional);

            const allFlags: CommandFlag[] = [
              ...RapidFireCommand.START_FLAGS_LIST.required,
              ...RapidFireCommand.START_FLAGS_LIST.optional,
            ];

            await this.configManager.executePrompt(task, allFlags);

            const config: RapidFireStartConfigClass = this.configManager.getConfig(
              RapidFireCommand.CRYPTO_TRANSFER_START_CONFIG_NAME,
              allFlags,
              ['parsedNlgArguments'],
            ) as RapidFireStartConfigClass;

            context_.config = config;

            config.namespace = await this.getNamespace(task);
            config.clusterRef = this.getClusterReference();
            config.context = this.getClusterContext(config.clusterRef);
            config.rttSampleCount = RapidFireCommand.RTT_SAMPLE_COUNT;
            config.rttSampleInterval = RapidFireCommand.RTT_SAMPLE_INTERVAL_MS;
            config.rttWarmupSeconds = RapidFireCommand.RTT_WARMUP_SECONDS;
            config.rttPollTimeout = RapidFireCommand.RTT_POLL_TIMEOUT_MS;

            // Parse nlgArguments to remove any surrounding quotes
            config.parsedNlgArguments = config.nlgArguments.replaceAll("'", '').replaceAll('"', '');

            if (!this.oneShotState.isActive()) {
              return ListrLock.newAcquireLockTask(leaseReference.lease, task);
            }
            return ListrLock.newSkippedLockTask(task);
          },
        },
        this.deployNlgChart(),
        this.startLoadTest(leaseReference),
      ],
      constants.LISTR_DEFAULT_OPTIONS.DEFAULT,
    );

    try {
      await tasks.run();
    } catch (error) {
      throw new SoloErrors.component.rapidFireLoadStartFailed(error);
    } finally {
      if (!this.oneShotState.isActive()) {
        await leaseReference.lease?.release();
      }
    }

    return true;
  }

  private stopInitializeTask(argv: ArgvStruct, leaseReference: {lease?: Lock}): SoloListrTask<RapidFireStopContext> {
    return {
      title: 'Initialize',
      task: async (context_, task): Promise<Listr<AnyListrContext>> => {
        await this.localConfig.load();
        await this.remoteConfig.loadAndValidate(argv);
        if (!this.oneShotState.isActive()) {
          leaseReference.lease = await this.leaseManager.create();
        }

        this.configManager.update(argv);

        flags.disablePrompts(RapidFireCommand.STOP_FLAGS_LIST.optional);

        const allFlags: CommandFlag[] = [
          ...RapidFireCommand.STOP_FLAGS_LIST.required,
          ...RapidFireCommand.STOP_FLAGS_LIST.optional,
        ];

        await this.configManager.executePrompt(task, allFlags);

        const config: RapidFireStopConfigClass = this.configManager.getConfig(
          RapidFireCommand.STOP_CONFIG_NAME,
          allFlags,
        ) as RapidFireStopConfigClass;

        config.namespace = await this.getNamespace(task);
        config.clusterRef = this.getClusterReference();
        config.context = this.getClusterContext(config.clusterRef);
        context_.config = config;

        if (!this.oneShotState.isActive()) {
          return ListrLock.newAcquireLockTask(leaseReference.lease, task);
        }
        return ListrLock.newSkippedLockTask(task);
      },
    };
  }

  private async allStopTasks(argv: ArgvStruct, stopTask: SoloListrTask<RapidFireStopContext>): Promise<boolean> {
    const leaseReference: {lease?: Lock} = {}; // This allows the lease to be passed by reference to the init task
    const tasks: SoloListr<RapidFireStopContext> = new Listr(
      [this.stopInitializeTask(argv, leaseReference), stopTask],
      constants.LISTR_DEFAULT_OPTIONS.DEFAULT,
    );

    try {
      await tasks.run();
    } catch (error) {
      throw new SoloErrors.component.rapidFireLoadStopFailed(error);
    } finally {
      if (!this.oneShotState.isActive() && leaseReference.lease) {
        await leaseReference.lease.release();
      }
    }

    return true;
  }

  private stopLoadTest(): SoloListrTask<RapidFireStopContext> {
    return {
      title: 'Stop load test',
      task: async (context_: RapidFireStopContext, task: SoloListrTaskWrapper<RapidFireStopContext>): Promise<void> => {
        const {performanceTest, packageName} = context_.config;
        const testClass: string = `${packageName}.${performanceTest}`;
        task.title = `Stop load test: ${testClass}`;
        const nlgPods: Pod[] = await this.k8Factory
          .getK8(context_.config.context)
          .pods()
          .list(context_.config.namespace, constants.NETWORK_LOAD_GENERATOR_POD_LABELS);
        const k8Containers: Containers = this.k8Factory.getK8(context_.config.context).containers();

        for (const pod of nlgPods) {
          if (pod.phase !== constants.POD_PHASE_RUNNING) {
            continue;
          }
          const containerReference: ContainerReference = ContainerReference.of(
            pod.podReference,
            constants.NETWORK_LOAD_GENERATOR_CONTAINER,
          );
          const container: Container = k8Containers.readByRef(containerReference);
          try {
            await container.execContainer(`pgrep -f ${testClass}`);
          } catch {
            // process does not exist, no need to kill it
            continue;
          }
          try {
            await container.execContainer(`pkill -f ${testClass}`);
          } catch (error) {
            throw new SoloErrors.component.rapidFireKillFailed(testClass, error);
          }
        }
      },
    };
  }

  public async stop(argv: ArgvStruct): Promise<boolean> {
    const leaseReference: {lease?: Lock} = {}; // This allows the lease to be passed by reference to the init task
    const tasks: SoloListr<RapidFireStopContext> = new Listr(
      [this.stopInitializeTask(argv, leaseReference), this.stopLoadTest()],
      constants.LISTR_DEFAULT_OPTIONS.DEFAULT,
    );

    try {
      await tasks.run();
    } catch (error) {
      throw new SoloErrors.component.rapidFireLoadStopFailed(error);
    } finally {
      if (!this.oneShotState.isActive() && leaseReference.lease) {
        await leaseReference.lease.release();
      }
    }

    return true;
  }

  public async destroy(argv: ArgvStruct): Promise<boolean> {
    return this.allStopTasks(argv, {
      title: 'Uninstall Network Load Generator chart',
      task: async (context_): Promise<void> => {
        await this.chartManager.uninstall(
          context_.config.namespace,
          constants.NETWORK_LOAD_GENERATOR_RELEASE_NAME,
          context_.config.context,
        );
      },
    });
  }

  public async close(): Promise<void> {} // no-op
}
