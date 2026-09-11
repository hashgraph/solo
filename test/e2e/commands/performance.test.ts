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
import {type BaseTestOptions} from './tests/base-test-options.js';
import {main} from '../../../src/index.js';
import {BaseCommandTest} from './tests/base-command-test.js';
import {NetworkLoadGeneratorTest} from './tests/network-load-generator-test.js';
import {OneShotCommandDefinition} from '../../../src/commands/command-definitions/one-shot-command-definition.js';
import {BlockCommandDefinition} from '../../../src/commands/command-definitions/block-command-definition.js';
import {MetricsServerImpl} from '../../../src/business/runtime-state/services/metrics-server-impl.js';
import * as constants from '../../../src/core/constants.js';
import {sleep} from '../../../src/core/helpers.js';
import {Flags} from '../../../src/commands/flags.js';
import {type LocalConfigRuntimeState} from '../../../src/business/runtime-state/config/local/local-config-runtime-state.js';
import {type Deployment} from '../../../src/business/runtime-state/config/local/deployment.js';
import {type AggregatedMetrics} from '../../../src/business/runtime-state/model/aggregated-metrics.js';

// A snapshot file on disk has AggregatedMetrics' fields plus the peakMemoryInMebibytes
// we inject during logMetrics().
type AugmentedSnapshot = AggregatedMetrics & {peakMemoryInMebibytes: number};

// The per-namespace summary adds peak attribution on top of a representative snapshot.
type PerformanceSummary = AugmentedSnapshot & {
  peakCpuInMillicores: number;
  peakCpuSnapshot: string;
  peakMemorySnapshot: string;
};

const testName: string = 'performance-tests';
const deploymentName: string = `${testName}-deployment`;
const testTitle: string = 'E2E Performance Tests';

const duration: number = Duration.ofMinutes(
  Number.parseInt(process.env.ONE_SHOT_METRICS_TEST_DURATION_IN_MINUTES) || 5,
).seconds;
const clients: number = 5;
const accounts: number = 1000;
const tokens: number = 50;
const associations: number = 50;
const nfts: number = 50;
const percent: number = 50;
const stableTransactionPerSecondTarget: number = 100;
// SmartContract tests require EVM execution on the consensus node plus mirror processing,
// which makes them heavier than simple transfers; 600 ms provides adequate headroom at 97 TPS.
const maxEndToEndRtt: number = 600;
const nftTransferLoadTestTimeoutMultiplier: number = 6;
const mirrorImporterWarmupSeconds: number = 60;
let startTime: Date;
let metricsInterval: NodeJS.Timeout;
let events: string[] = [];
let peakMemoryInMebibytes: number = 0;

// When the workflow cancels this step (e.g. due to a new commit superseding the PR),
// go-task forwards SIGTERM to this process' process group before SIGKILL reaches task.
// Without this handler, mocha's graceful shutdown waits for the currently-running
// `await sleep(...)` to resolve AND for the setInterval to drain — which can take
// minutes. Force-exit immediately so the runner can move on without waiting.
process.on('SIGTERM', (): void => {
  clearInterval(metricsInterval);
  // eslint-disable-next-line n/no-process-exit -- SIGTERM handler must force-exit; throwing does not terminate the process
  process.exit(143); // 128 + SIGTERM(15)
});
const defaultJFREnvironmentValue: string = process.env.JAVA_FLIGHT_RECORDER_CONFIGURATION;

const endToEndTestSuite: EndToEndTestSuite = new EndToEndTestSuiteBuilder()
  .withTestName(testName)
  .withTestSuiteName(`${testTitle} Suite`)
  .withNamespace(testName)
  .withDeployment(deploymentName)
  .withClusterCount(1)
  .withJavaFlightRecorderConfiguration('test/data/java-flight-recorder/LowMem.jfc')
  .withTestSuiteCallback(
    (options: BaseTestOptions, preDestroy: (endToEndTestSuiteInstance: EndToEndTestSuite) => Promise<void>): void => {
      describe(testTitle, (): void => {
        const {testCacheDirectory, testLogger, namespace, contexts, deployment} = options;
        let oneShotDeployCompleted: boolean = false;

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
          if (!fs.existsSync(testCacheDirectory)) {
            fs.mkdirSync(testCacheDirectory, {recursive: true});
          }
          resetForTest(namespace.name, testCacheDirectory, false);
          for (const item of contexts) {
            const k8Client: K8 = container.resolve<K8ClientFactory>(InjectTokens.K8Factory).getK8(item);
            await k8Client.namespaces().delete(namespace);
          }

          testLogger.info(`${testName}: starting ${testName} e2e test`);

          testLogger.info(`${testName}: beginning ${testName}: deploy`);
          process.env.JAVA_FLIGHT_RECORDER_CONFIGURATION = options.javaFlightRecorderConfiguration;
          await main(soloOneShotDeploy(testName, deployment));
          oneShotDeployCompleted = true;
          testLogger.info(`${testName}: finished ${testName}: deploy`);

          // Opt-in: deploy a JFR-enabled block node so its JVM metrics are recorded and collected at teardown.
          if (process.env.PERFORMANCE_TEST_WITH_BLOCK_NODE === 'true') {
            testLogger.info(`${testName}: beginning ${testName}: block node deploy (JFR enabled)`);
            await main(soloBlockNodeJfrDeploy(testName, deployment));
            testLogger.info(`${testName}: finished ${testName}: block node deploy`);
          }

          startTime = new Date();
          metricsInterval = setInterval(async (): Promise<void> => {
            try {
              await logMetrics(startTime);
            } catch (error: unknown) {
              testLogger.warn(`${testName}: failed to log interval metrics: ${error}`);
            }
          }, Duration.ofSeconds(5).toMillis());
        }).timeout(Duration.ofMinutes(25).toMillis());

        after(async (): Promise<void> => {
          clearInterval(metricsInterval);

          // restore environment variable for other tests
          process.env.JAVA_FLIGHT_RECORDER_CONFIGURATION = defaultJFREnvironmentValue;

          let metricsError: unknown;
          if (oneShotDeployCompleted) {
            // Wrap metrics processing so that diagnostics collection and cluster teardown
            // always run, even when the before() hook's deploy failed and files are absent.
            try {
              // read all logged metrics and parse the JSON
              const namespace: string = await getNamespaceFromDeployment();
              const targetDirectory: string = PathEx.join(constants.SOLO_LOGS_DIR, `${namespace}`);
              if (fs.existsSync(targetDirectory)) {
                const files: string[] = fs.readdirSync(targetDirectory);
                // Only the per-snapshot metric files are JSON. Ignore other artifacts in the logs tree
                // (e.g. Java Flight Recorder .jfr recordings) so they don't break parsing.
                const metricFiles: string[] = files.filter((file: string): boolean => file.endsWith('.json'));
                const allMetrics: Record<string, AggregatedMetrics> = {};
                for (const file of metricFiles) {
                  const filePath: string = PathEx.join(targetDirectory, file);
                  const fileContents: string = fs.readFileSync(filePath, 'utf8');
                  const fileName: string = file.split('.', 1)[0];
                  allMetrics[fileName] = JSON.parse(fileContents) as AggregatedMetrics;
                }

                const metricEntries: [string, AggregatedMetrics][] = Object.entries(allMetrics);
                if (metricEntries.length === 0) {
                  testLogger.info(`${testName}: skipping metrics aggregation because no metrics snapshots were found`);
                } else {
                  // save the aggregated metrics to a single file
                  const aggregatedMetricsFileName: string = 'timeline-metrics.json';
                  const aggregatedMetricsPath: string = PathEx.join(targetDirectory, aggregatedMetricsFileName);
                  fs.writeFileSync(aggregatedMetricsPath, JSON.stringify(allMetrics), 'utf8');

                  let maxCpuMetrics: number = metricEntries[0][1].cpuInMillicores;
                  let maxCpuFile: string = metricEntries[0][0];
                  let maxMemoryMetrics: number = metricEntries[0][1].memoryInMebibytes;
                  let maxMemoryFile: string = metricEntries[0][0];
                  for (const [fileName, metrics] of metricEntries) {
                    if (metrics.cpuInMillicores > maxCpuMetrics) {
                      maxCpuMetrics = metrics.cpuInMillicores;
                      maxCpuFile = fileName;
                    }
                    if (metrics.memoryInMebibytes > maxMemoryMetrics) {
                      maxMemoryMetrics = metrics.memoryInMebibytes;
                      maxMemoryFile = fileName;
                    }
                  }

                  // Use the max-memory snapshot as the representative record since memory
                  // pressure reflects actual workload behavior, not startup CPU spikes
                  const representativeFileName: string = `${maxMemoryFile}.json`;
                  const {clusterMetrics: clusterMetricsData, ...summaryFields} = allMetrics[maxMemoryFile];
                  const namespaceJson: PerformanceSummary = {
                    ...summaryFields,
                    peakCpuInMillicores: maxCpuMetrics,
                    peakCpuSnapshot: allMetrics[maxCpuFile]?.snapshotName,
                    peakMemoryInMebibytes: maxMemoryMetrics,
                    peakMemorySnapshot: allMetrics[maxMemoryFile]?.snapshotName,
                    clusterMetrics: clusterMetricsData,
                  };
                  fs.writeFileSync(
                    PathEx.join(targetDirectory, `${namespace}.json`),
                    JSON.stringify(namespaceJson),
                    'utf8',
                  );

                  // remove all snapshot files except the representative one (only JSON snapshots;
                  // leave other artifacts such as .jfr recordings in place for collection/upload)
                  const filesToKeep: Set<string> = new Set([representativeFileName, aggregatedMetricsFileName]);
                  for (const file of metricFiles) {
                    if (!filesToKeep.has(file)) {
                      fs.rmSync(PathEx.join(targetDirectory, file));
                    }
                  }

                  // copy the summary to the main solo logs directory to be accessible by existing scripts
                  fs.copyFileSync(
                    PathEx.join(targetDirectory, `${namespace}.json`),
                    PathEx.join(constants.SOLO_LOGS_DIR, `${namespace}.json`),
                  );
                }
              }
            } catch (error: unknown) {
              testLogger.error(
                `${testName}: metrics processing failed (deploy may have failed); diagnostics and destroy will still run: ${error}`,
              );
              metricsError = error;
            }
          } else {
            testLogger.info(`${testName}: skipping metrics aggregation because one-shot deploy did not complete`);
          }

          await preDestroy(endToEndTestSuite);

          testLogger.info(`${testName}: beginning ${testName}: destroy`);
          try {
            await main(soloOneShotDestroy(testName, deployment));
            testLogger.info(`${testName}: finished ${testName}: destroy`);
            if (metricsError !== undefined) {
              throw metricsError;
            }
          } catch (error: unknown) {
            if (oneShotDeployCompleted) {
              throw error;
            }
            const destroyErrorMessage: string = error instanceof Error ? error.message : String(error);
            testLogger.info(`${testName}: destroy failed after incomplete deploy: ${destroyErrorMessage}`);
          }
        }).timeout(Duration.ofMinutes(8).toMillis());

        // NOTE: NLG 0.14.0 expanded -R (reuse) to cover tokens as well as accounts. It reuses
        // tokens without filtering by type, so if TokenTransferLoadTest ran first and created
        // fungible tokens, NftTransferLoadTest with -R would load those fungible tokens as NFTs
        // and produce 0 TPS (and vice versa). To avoid this cross-contamination, NftTransferLoadTest
        // does NOT use -R so it always creates its own fresh NFT tokens.
        // NLG chart install + libsodium download get their own budget, so a slow apt mirror fails here
        // instead of eating the first load test's timeout and surfacing as a killed exec (#5988).
        it('Deploy Network Load Generator', async (): Promise<void> => {
          logEvent('Deploying Network Load Generator');
          await NetworkLoadGeneratorTest.deployChart(deploymentName);
        }).timeout(Duration.ofMinutes(20).toMillis());

        it('TokenTransferLoadTest', async (): Promise<void> => {
          logEvent('Starting TokenTransferLoadTest');
          await runLoadTest(
            'TokenTransferLoadTest',
            `-c ${clients} -a ${accounts} -T ${tokens} -A ${associations} -R -t ${duration}`,
          );
        }).timeout(Duration.ofSeconds(duration * 2 + mirrorImporterWarmupSeconds).toMillis());

        it('NftTransferLoadTest', async (): Promise<void> => {
          logEvent('Starting NftTransferLoadTest');
          await runLoadTest(
            'NftTransferLoadTest',
            `-c ${clients} -a ${accounts} -T ${nfts} -n ${accounts} -S flat -p ${percent} -t ${duration}`,
          );
        }).timeout(
          Duration.ofSeconds(duration * nftTransferLoadTestTimeoutMultiplier + mirrorImporterWarmupSeconds).toMillis(),
        );

        it('CryptoTransferLoadTest', async (): Promise<void> => {
          logEvent('Starting CryptoTransferLoadTest');
          await runLoadTest('CryptoTransferLoadTest', `-c ${clients} -a ${accounts} -R -t ${duration}`);
        }).timeout(Duration.ofSeconds(duration * 2 + mirrorImporterWarmupSeconds).toMillis());

        it('HCSLoadTest', async (): Promise<void> => {
          logEvent('Starting HCSLoadTest');
          await runLoadTest('HCSLoadTest', `-c ${clients} -a ${accounts} -R -t ${duration}`);
        }).timeout(Duration.ofSeconds(duration * 2 + mirrorImporterWarmupSeconds).toMillis());

        // Disabled until hiero-block-node fixes VerificationServicePlugin gating backpressure
        // (hiero-block-node#3150): the Disruptor ring buffer fills cumulatively across tests
        // 1–4 at ~100 TPS and overflows before SmartContractLoadTest can start, freezing the
        // mirror importer.  Increasing the ring buffer to 8 M prevented overflow but required
        // ~6 GB of block-node heap, which is disproportionate.  Skipping SmartContractLoadTest
        // keeps the ring under 4 M entries so the 4 M buffer is sufficient and memory stays low.
        it.skip('SmartContractLoadTest', async (): Promise<void> => {
          logEvent('Starting SmartContractLoadTest');
          await runLoadTest('SmartContractLoadTest', `-c ${clients} -a ${accounts} -R -t ${duration}`);
        }).timeout(Duration.ofSeconds(duration * 6 + mirrorImporterWarmupSeconds).toMillis());

        async function runLoadTest(performanceTest: string, argumentsString: string): Promise<void> {
          // Wait for the mirror importer to drain the block backlog created during the deploy
          // stage. The block node takes ~46 s to reach PUBLISHER_CONNECTED, accumulating ~200
          // blocks (at ~4 blocks/sec). This sleep lets the importer catch up to near-real-time
          // so the RTT probe does not spend its entire readiness window on stale blocks.
          await sleep(Duration.ofSeconds(mirrorImporterWarmupSeconds));
          // rapid-fire enforces the TPS!=0 + "Finished" check internally and throws
          // on degraded runs (proxy backpressure, NFT-vs-fungible token mismatch, etc.).
          await main(
            soloRapidFire(testName, performanceTest, argumentsString, stableTransactionPerSecondTarget, maxEndToEndRtt),
          );
          // Cool-down lets haproxy drain tunnel sockets before the next test.
          await sleep(Duration.ofSeconds(30));
        }

        it('Should write log metrics after NLG tests have completed', async (): Promise<void> => {
          logEvent('Completed all performance tests');
          if (process.env.ONE_SHOT_METRICS_TEST_DURATION_IN_MINUTES) {
            const sleepTimeInMinutes: number = Number.parseInt(
              process.env.ONE_SHOT_METRICS_TEST_DURATION_IN_MINUTES,
              10,
            );

            if (Number.isNaN(sleepTimeInMinutes) || sleepTimeInMinutes <= 0) {
              throw new Error(
                `${testName}: invalid ONE_SHOT_METRICS_TEST_DURATION_IN_MINUTES value: ${process.env.ONE_SHOT_METRICS_TEST_DURATION_IN_MINUTES}`,
              );
            }

            for (let index: number = 0; index < sleepTimeInMinutes; index++) {
              console.log(
                `${testName}: sleeping for metrics collection, ${index + 1} of ${sleepTimeInMinutes} minutes`,
              );
              await sleep(Duration.ofMinutes(1));
            }
          }

          await logMetrics(startTime);
        }).timeout(Duration.ofMinutes(60).toMillis());
      });
    },
  )
  .build();
endToEndTestSuite.runTestSuite();

async function getNamespaceFromDeployment(): Promise<string> {
  const localConfig: LocalConfigRuntimeState = container.resolve<LocalConfigRuntimeState>(
    InjectTokens.LocalConfigRuntimeState,
  );
  await localConfig.load();
  const deployment: Deployment = localConfig.configuration.deploymentByName(deploymentName);
  return deployment.namespace;
}

export async function logMetrics(startTime: Date): Promise<void> {
  const elapsedMilliseconds: number = startTime ? Date.now() - startTime.getTime() : 0;
  const namespace: string = await getNamespaceFromDeployment();
  const targetDirectory: string = PathEx.join(constants.SOLO_LOGS_DIR, `${namespace}`);
  fs.mkdirSync(targetDirectory, {recursive: true});

  await new MetricsServerImpl().logMetrics(
    `${testName}-${elapsedMilliseconds}`,
    PathEx.join(targetDirectory, `${elapsedMilliseconds}`),
    undefined,
    undefined,
    undefined,
    events,
  );

  // Track running peak memory and inject it into the snapshot file
  const snapshotPath: string = PathEx.join(targetDirectory, `${elapsedMilliseconds}.json`);
  if (fs.existsSync(snapshotPath)) {
    const snapshot: AugmentedSnapshot = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));
    if (snapshot.memoryInMebibytes > peakMemoryInMebibytes) {
      peakMemoryInMebibytes = snapshot.memoryInMebibytes;
    }
    snapshot.peakMemoryInMebibytes = peakMemoryInMebibytes;
    fs.writeFileSync(snapshotPath, JSON.stringify(snapshot), 'utf8');
  }

  flushEvents();
}

export function soloOneShotDeploy(testName: string, deployment: string): string[] {
  const {newArgv, argvPushGlobalFlags, optionFromFlag} = BaseCommandTest;

  const argv: string[] = newArgv();
  argv.push(
    OneShotCommandDefinition.COMMAND_NAME,
    OneShotCommandDefinition.SINGLE_SUBCOMMAND_NAME,
    OneShotCommandDefinition.SINGLE_DEPLOY,
  );
  argvPushGlobalFlags(argv, testName);
  argv.push(
    optionFromFlag(Flags.deployment),
    deployment,
    optionFromFlag(Flags.deployMetricsServer),
    optionFromFlag(Flags.pinger),
    optionFromFlag(Flags.parallelDeploy),
    'false',
  );
  if (process.env.ONE_SHOT_USE_EDGE === 'true') {
    argv.push(optionFromFlag(Flags.edgeEnabled));
  }
  return argv;
}

export function soloBlockNodeJfrDeploy(testName: string, deployment: string): string[] {
  const {newArgv, argvPushGlobalFlags, optionFromFlag} = BaseCommandTest;

  const argv: string[] = newArgv();
  argv.push(
    BlockCommandDefinition.COMMAND_NAME,
    BlockCommandDefinition.NODE_SUBCOMMAND_NAME,
    BlockCommandDefinition.NODE_ADD,
  );
  argvPushGlobalFlags(argv, testName);
  argv.push(
    optionFromFlag(Flags.deployment),
    deployment,
    optionFromFlag(Flags.valuesFile),
    PathEx.joinWithRealPath(constants.RESOURCES_DIR, 'block-node-perf-values.yaml'),
  );
  return argv;
}

export function soloOneShotDestroy(testName: string, deployment: string): string[] {
  const {newArgv, argvPushGlobalFlags, optionFromFlag} = BaseCommandTest;

  const argv: string[] = newArgv();
  argv.push(
    OneShotCommandDefinition.COMMAND_NAME,
    OneShotCommandDefinition.SINGLE_SUBCOMMAND_NAME,
    OneShotCommandDefinition.SINGLE_DESTROY,
  );
  argvPushGlobalFlags(argv, testName);
  argv.push(optionFromFlag(Flags.deployment), deployment);
  return argv;
}

function logEvent(event: string): void {
  events.push(event);
}

function flushEvents(): void {
  events = [];
}

export function soloRapidFire(
  testName: string,
  performanceTest: string,
  argumentsString: string,
  maxTps: number,
  maxRtt: number,
): string[] {
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
    optionFromFlag(Flags.maxTps),
    maxTps.toString(),
    optionFromFlag(Flags.maxRtt),
    maxRtt.toString(),
    optionFromFlag(Flags.nlgArguments),
    `'"${argumentsString}"'`,
  );
  argvPushGlobalFlags(argv, testName);
  return argv;
}
