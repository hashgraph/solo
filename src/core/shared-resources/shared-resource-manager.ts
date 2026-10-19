// SPDX-License-Identifier: Apache-2.0

import {InjectTokens} from '../dependency-injection/inject-tokens.js';
import {type SoloLogger} from '../logging/solo-logger.js';
import {patchInject} from '../dependency-injection/container-helper.js';
import {inject, injectable} from 'tsyringe-neo';
import {type HelmClient} from '../../integration/helm/helm-client.js';
import {type ChartManager} from '../chart-manager.js';
import {type NamespaceName} from '../../types/namespace/namespace-name.js';
import * as constants from '../../core/constants.js';
import {SoloChartRepository} from '../solo-chart-repository.js';
import {HelmChartValues, type HelmChartValue} from '../../integration/helm/model/values.js';
import {HelmSchedulingValues} from '../util/helm-scheduling-values.js';

@injectable()
export class SharedResourceManager {
  private static readonly ROLE_SCHEDULING_KEY: string = 'solo.hashgraph.io/role';
  private static readonly POSTGRES_SCHEDULING_SOURCE_PATHS: string[] = ['postgresql.postgresql', 'postgresql.primary'];
  private static readonly REDIS_SCHEDULING_SOURCE_PATHS: string[] = ['redis', 'redis.master', 'redis.replica'];
  private static readonly REDIS_SCHEDULING_TARGET_PATHS: string[] = ['redis.master', 'redis.replica'];
  private static readonly REDIS_ROLE_FALLBACK_PATHS: string[] = [
    'postgresql.postgresql',
    'postgresql.primary',
    'importer',
    'grpc',
    'rest',
    'restjava',
    'web3',
    'monitor',
  ];

  private postgresEnabled: boolean = false;
  private redisEnabled: boolean = false;
  private additionalChartValues: HelmChartValues = new HelmChartValues();

  public constructor(
    @inject(InjectTokens.SoloLogger) private readonly logger?: SoloLogger,
    @inject(InjectTokens.Helm) protected readonly helm?: HelmClient,
    @inject(InjectTokens.ChartManager) protected readonly chartManager?: ChartManager,
  ) {
    this.helm = patchInject(helm, InjectTokens.Helm, this.constructor.name);
    this.logger = patchInject(logger, InjectTokens.SoloLogger, this.constructor.name);
    this.chartManager = patchInject(chartManager, InjectTokens.ChartManager, this.constructor.name);
  }

  public setAdditionalChartValues(additionalChartValues: HelmChartValues): void {
    this.additionalChartValues = additionalChartValues.clone();
  }

  public setSchedulingChartValues(sourceChartValues: HelmChartValues): void {
    this.additionalChartValues.add(SharedResourceManager.buildSchedulingChartValues(sourceChartValues));
  }

  public enablePostgres(): void {
    this.postgresEnabled = true;
  }

  public enableRedis(): void {
    this.redisEnabled = true;
  }

  public async uninstallChart(namespace: NamespaceName, context?: string): Promise<void> {
    const isChartInstalled: boolean = await this.chartManager.isChartInstalled(
      namespace,
      constants.SOLO_SHARED_RESOURCES_CHART,
      context,
    );

    if (!isChartInstalled) {
      this.logger?.info(
        `Shared resources chart is not installed in namespace ${namespace.name}, skipping uninstallation.`,
      );
      return;
    }

    await this.chartManager.uninstall(namespace, constants.SOLO_SHARED_RESOURCES_CHART, context);
  }

  /**
   *  Installs the shared resources chart in the specified namespace if it is not already installed.
   *  Returns true if the chart was installed, false if it was already installed.
   * @param namespace
   * @param chartDirectory
   * @param soloChartVersion
   * @param context
   * @param valuesArgumentsMap
   */
  public async installChart(
    namespace: NamespaceName,
    chartDirectory: string,
    soloChartVersion: string,
    context?: string,
    valuesArgumentsMap?: Record<string, HelmChartValue>,
  ): Promise<boolean> {
    const isChartInstalled: boolean = await this.chartManager.isChartInstalled(
      namespace,
      constants.SOLO_SHARED_RESOURCES_CHART,
      context,
    );

    if (isChartInstalled) {
      this.logger?.info(
        `Shared resources chart is already installed in namespace ${namespace.name}, skipping installation.`,
      );
      return false;
    }

    const chartValues: HelmChartValues = new HelmChartValues()
      .setMany({
        ...valuesArgumentsMap,
        'postgresql.enabled': this.postgresEnabled,
        'redis.enabled': this.redisEnabled,
      })
      .add(this.additionalChartValues);

    this.additionalChartValues = new HelmChartValues();

    await this.chartManager.install(
      namespace,
      constants.SOLO_SHARED_RESOURCES_CHART,
      constants.SOLO_SHARED_RESOURCES_CHART,
      chartDirectory || SoloChartRepository.resolveUrl(soloChartVersion),
      soloChartVersion,
      chartValues,
      context,
    );

    return true;
  }

  private static buildSchedulingChartValues(sourceChartValues: HelmChartValues): HelmChartValues {
    return HelmSchedulingValues.buildMappedSchedulingChartValues(sourceChartValues, [
      {
        sourcePaths: SharedResourceManager.POSTGRES_SCHEDULING_SOURCE_PATHS,
        targetPaths: ['postgresql.primary'],
      },
      {
        fallback: {
          key: SharedResourceManager.ROLE_SCHEDULING_KEY,
          sourcePaths: SharedResourceManager.REDIS_ROLE_FALLBACK_PATHS,
        },
        sourcePaths: SharedResourceManager.REDIS_SCHEDULING_SOURCE_PATHS,
        targetPaths: SharedResourceManager.REDIS_SCHEDULING_TARGET_PATHS,
      },
    ]);
  }
}
