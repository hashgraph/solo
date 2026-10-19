// SPDX-License-Identifier: Apache-2.0

import {BaseCommandTest} from './base-command-test.js';
import {main} from '../../../../src/index.js';
import {Duration} from '../../../../src/core/time/duration.js';
import {type BaseTestOptions} from './base-test-options.js';
import {it} from 'mocha';
import {expect} from 'chai';
import fs from 'node:fs';
import {PathEx} from '../../../../src/business/utils/path-ex.js';
import {CacheCommandDefinition} from '../../../../src/commands/command-definitions/cache-command-definition.js';
import {CacheArtifactEnum} from '../../../../src/integration/cache/enums/cache-artifact-enum.js';
import {ChartManager} from '../../../../src/core/chart-manager.js';
import {MINIO_OPERATOR_CHART} from '../../../../src/core/constants.js';
import {MINIO_OPERATOR_VERSION} from '../../../../version.js';
import {HelmChartValues} from '../../../../src/integration/helm/model/values.js';
import {sleep} from '../../../../src/core/helpers.js';
import {container} from 'tsyringe-neo';
import {InjectTokens} from '../../../../src/core/dependency-injection/inject-tokens.js';

/**
 * Adjust these if your command-definition constants use different names,
 * for example if the CLI path is `cache image pull`.
 */
export class CacheTest extends BaseCommandTest {
  public static soloCachePullArgv(testName: string): string[] {
    const {newArgv, argvPushGlobalFlags} = CacheTest;

    const argv: string[] = newArgv();
    argv.push(
      CacheCommandDefinition.COMMAND_NAME,
      CacheCommandDefinition.IMAGE_SUBCOMMAND_NAME,
      CacheCommandDefinition.IMAGE_PULL,
    );
    argvPushGlobalFlags(argv, testName, true, false);
    return argv;
  }

  public static soloCacheListArgv(testName: string): string[] {
    const {newArgv, argvPushGlobalFlags} = CacheTest;

    const argv: string[] = newArgv();
    argv.push(
      CacheCommandDefinition.COMMAND_NAME,
      CacheCommandDefinition.IMAGE_SUBCOMMAND_NAME,
      CacheCommandDefinition.IMAGE_LIST,
    );
    argvPushGlobalFlags(argv, testName, true, false);
    return argv;
  }

  public static soloCacheStatusArgv(testName: string): string[] {
    const {newArgv, argvPushGlobalFlags} = CacheTest;

    const argv: string[] = newArgv();
    argv.push(
      CacheCommandDefinition.COMMAND_NAME,
      CacheCommandDefinition.IMAGE_SUBCOMMAND_NAME,
      CacheCommandDefinition.IMAGE_STATUS,
    );
    argvPushGlobalFlags(argv, testName, true, false);
    return argv;
  }

  public static soloCacheClearArgv(testName: string): string[] {
    const {newArgv, argvPushGlobalFlags} = CacheTest;

    const argv: string[] = newArgv();
    argv.push(
      CacheCommandDefinition.COMMAND_NAME,
      CacheCommandDefinition.IMAGE_SUBCOMMAND_NAME,
      CacheCommandDefinition.IMAGE_CLEAR,
    );
    argvPushGlobalFlags(argv, testName, true, false);
    return argv;
  }

  public static soloCacheLoadArgv(testName: string): string[] {
    const {newArgv, argvPushGlobalFlags} = CacheTest;

    const argv: string[] = newArgv();
    argv.push(
      CacheCommandDefinition.COMMAND_NAME,
      CacheCommandDefinition.IMAGE_SUBCOMMAND_NAME,
      CacheCommandDefinition.IMAGE_LOAD,
    );
    argvPushGlobalFlags(argv, testName, true, false);
    return argv;
  }

  public static pull(options: BaseTestOptions): void {
    const {testName} = options;

    it(`${testName}: cache pull`, async (): Promise<void> => {
      await main(CacheTest.soloCachePullArgv(testName));
    }).timeout(Duration.ofMinutes(10).toMillis());
  }

  public static list(options: BaseTestOptions): void {
    const {testName} = options;

    it(`${testName}: cache list`, async (): Promise<void> => {
      await main(CacheTest.soloCacheListArgv(testName));
    }).timeout(Duration.ofMinutes(5).toMillis());
  }

  public static status(options: BaseTestOptions): void {
    const {testName} = options;

    it(`${testName}: cache status`, async (): Promise<void> => {
      await main(CacheTest.soloCacheStatusArgv(testName));
    }).timeout(Duration.ofMinutes(5).toMillis());
  }

  public static load(options: BaseTestOptions): void {
    const {testName} = options;

    it(`${testName}: cache load`, async (): Promise<void> => {
      await main(CacheTest.soloCacheLoadArgv(testName));
    }).timeout(Duration.ofMinutes(10).toMillis());
  }

  public static clear(options: BaseTestOptions): void {
    const {testName} = options;

    it(`${testName}: cache clear`, async (): Promise<void> => {
      await main(CacheTest.soloCacheClearArgv(testName));
    }).timeout(Duration.ofMinutes(5).toMillis());
  }

  public static pullListStatusClear(options: BaseTestOptions): void {
    const {testName, testCacheDirectory} = options;

    const cacheRoot: string = PathEx.join(testCacheDirectory, 'cache');

    it(`${testName}: cache pull/list/status/clear workflow`, async (): Promise<void> => {
      await main(CacheTest.soloCachePullArgv(testName));

      expect(fs.existsSync(cacheRoot), `expected cache directory to exist at ${cacheRoot}`).to.be.true;

      await main(CacheTest.soloCacheListArgv(testName));
      await main(CacheTest.soloCacheStatusArgv(testName));
      await main(CacheTest.soloCacheClearArgv(testName));

      expect(fs.existsSync(cacheRoot), `expected cache directory to be removed at ${cacheRoot}`).to.be.false;
    }).timeout(Duration.ofMinutes(15).toMillis());
  }

  public static pullAndVerifyArtifactsExist(options: BaseTestOptions): void {
    const {testName, testCacheDirectory} = options;

    it(`${testName}: cache pull creates archive artifacts`, async (): Promise<void> => {
      await main(CacheTest.soloCachePullArgv(testName));

      const cacheRoot: string = PathEx.join(testCacheDirectory, 'cache');
      expect(fs.existsSync(cacheRoot), `expected cache directory to exist at ${cacheRoot}`).to.be.true;

      const imageDirectory: string = PathEx.join(cacheRoot, 'IMAGE');
      const fallbackImageDirectory: string = PathEx.join(cacheRoot, 'image');

      const artifactDirectory: string | undefined = [imageDirectory, fallbackImageDirectory].find(
        (directory): boolean => fs.existsSync(directory),
      );

      expect(artifactDirectory, 'expected image cache artifact directory to exist').to.not.equal(undefined);

      const files: string[] = fs.readdirSync(artifactDirectory as string);
      expect(files.length, 'expected at least one cached image artifact').to.be.greaterThan(0);
      expect(files.some((fileName: string): boolean => fileName.endsWith('.tar'))).to.be.true;
    }).timeout(Duration.ofMinutes(15).toMillis());
  }

  public static loadAfterNetworkDeploy(options: BaseTestOptions): void {
    const {testName} = options;

    it(`${testName}: cache load into cluster`, async (): Promise<void> => {
      await main(CacheTest.soloCachePullArgv(testName));
      await main(CacheTest.soloCacheLoadArgv(testName));
    }).timeout(Duration.ofMinutes(15).toMillis());
  }

  private static soloCacheChartArgv(testName: string, operation: string): string[] {
    const {newArgv, argvPushGlobalFlags} = CacheTest;

    const argv: string[] = newArgv();
    argv.push(CacheCommandDefinition.COMMAND_NAME, CacheCommandDefinition.CHART_SUBCOMMAND_NAME, operation);
    argvPushGlobalFlags(argv, testName, true, false);
    return argv;
  }

  private static chartCacheDirectory(testCacheDirectory: string): string {
    return PathEx.join(testCacheDirectory, 'cache', CacheArtifactEnum.HELM_CHART);
  }

  private static listChartArchives(testCacheDirectory: string): string[] {
    const chartDirectory: string = CacheTest.chartCacheDirectory(testCacheDirectory);

    if (!fs.existsSync(chartDirectory)) {
      return [];
    }

    return fs.readdirSync(chartDirectory).filter((fileName: string): boolean => fileName.endsWith('.tar'));
  }

  public static chartPull(options: BaseTestOptions): void {
    const {testName, testCacheDirectory} = options;

    it(`${testName}: cache chart pull creates chart archives`, async (): Promise<void> => {
      await main(CacheTest.soloCacheChartArgv(testName, CacheCommandDefinition.CHART_PULL));

      const archives: string[] = CacheTest.listChartArchives(testCacheDirectory);
      expect(archives.length, 'expected at least one cached chart archive').to.be.greaterThan(0);
    }).timeout(Duration.ofMinutes(10).toMillis());
  }

  public static chartList(options: BaseTestOptions): void {
    const {testName} = options;

    it(`${testName}: cache chart list`, async (): Promise<void> => {
      await main(CacheTest.soloCacheChartArgv(testName, CacheCommandDefinition.CHART_LIST));
    }).timeout(Duration.ofMinutes(5).toMillis());
  }

  public static chartStatus(options: BaseTestOptions): void {
    const {testName} = options;

    it(`${testName}: cache chart status`, async (): Promise<void> => {
      await main(CacheTest.soloCacheChartArgv(testName, CacheCommandDefinition.CHART_STATUS));
    }).timeout(Duration.ofMinutes(5).toMillis());
  }

  /**
   * Validates that a chart install consumes the local chart cache and prioritizes it over a network
   * fetch. It drives the same `ChartManager.install` API solo uses at deploy time: because the chart
   * archive was pulled into the cache, ChartManager resolves the local tarball and installs from it
   * (logging the cache-hit line) instead of fetching over the network — which is the prioritization
   * under test. A fresh namespace and a unique release name ensure the install actually runs rather
   * than being skipped as already-installed.
   */
  public static chartInstallUsesCache(options: BaseTestOptions): void {
    const {testName, testCacheDirectory, namespace, contexts} = options;

    it(`${testName}: chart install consumes the chart cache`, async (): Promise<void> => {
      // Confirm `cache chart pull` actually cached the MinIO operator chart; without a cached archive
      // the install below would fall back to a network fetch and the assertion would be unclear.
      const cachedArchives: string[] = CacheTest.listChartArchives(testCacheDirectory);
      expect(
        cachedArchives.some((fileName: string): boolean => fileName.startsWith(`${MINIO_OPERATOR_CHART}__`)),
        `expected the MinIO operator chart to be cached before install; cached archives: ${cachedArchives.join(', ')}`,
      ).to.be.true;

      // SoloPinoLogger writes under the container-configured home directory, which the test harness
      // points at testCacheDirectory rather than the default SOLO_LOGS_DIR — read the same file it writes.
      const homeDirectory: string = container.resolve<string>(InjectTokens.HomeDirectory);
      const logFilePath: string = PathEx.join(homeDirectory, 'logs', 'solo.log');
      const logSizeBefore: number = fs.existsSync(logFilePath) ? fs.statSync(logFilePath).size : 0;

      const chartManager: ChartManager = container.resolve<ChartManager>(InjectTokens.ChartManager);
      const releaseName: string = `${testName}-cache-consumption`;

      try {
        await chartManager.install(
          namespace,
          releaseName,
          MINIO_OPERATOR_CHART,
          MINIO_OPERATOR_CHART,
          MINIO_OPERATOR_VERSION,
          new HelmChartValues(),
          contexts[0],
        );
      } catch {
        // Tolerate a cluster-side install failure (e.g. the operator's cluster-scoped resources may
        // already exist from an earlier MinIO install). The cache-vs-network decision is made and
        // logged before helm runs, so the assertion below still validates prioritization.
      } finally {
        try {
          await chartManager.uninstall(namespace, releaseName, contexts[0]);
        } catch {
          // best-effort cleanup: nothing to remove if the install never created a release
        }
      }

      // The log transport writes asynchronously; poll briefly for the cache-hit line to be flushed.
      let appendedLog: string = '';
      for (let attempt: number = 0; attempt < 30; attempt++) {
        if (fs.existsSync(logFilePath)) {
          const logBuffer: Buffer = fs.readFileSync(logFilePath);
          appendedLog = logBuffer.subarray(Math.min(logSizeBefore, logBuffer.length)).toString('utf8');
          if (appendedLog.includes(ChartManager.INSTALLED_FROM_CACHE_MESSAGE_FRAGMENT)) {
            break;
          }
        }
        await sleep(Duration.ofSeconds(1));
      }

      expect(appendedLog, 'expected the chart to be installed from the local chart cache').to.include(
        ChartManager.INSTALLED_FROM_CACHE_MESSAGE_FRAGMENT,
      );
    }).timeout(Duration.ofMinutes(10).toMillis());
  }

  public static chartClear(options: BaseTestOptions): void {
    const {testName, testCacheDirectory} = options;

    it(`${testName}: cache chart clear removes chart archives`, async (): Promise<void> => {
      await main(CacheTest.soloCacheChartArgv(testName, CacheCommandDefinition.CHART_CLEAR));

      const archives: string[] = CacheTest.listChartArchives(testCacheDirectory);
      expect(archives.length, 'expected all cached chart archives to be removed').to.equal(0);
    }).timeout(Duration.ofMinutes(5).toMillis());
  }
}
