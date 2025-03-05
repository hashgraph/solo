/**
 * SPDX-License-Identifier: Apache-2.0
 */

import {type NodeAlias} from '../../types/aliases.js';
import {Flags as flags} from '../flags.js';
import * as constants from '../../core/constants.js';
import {ListrInquirerPromptAdapter} from '@listr2/prompt-adapter-inquirer';
import {confirm as confirmPrompt} from '@inquirer/prompts';
import {SoloError} from '../../core/errors.js';
import {type NamespaceName} from '../../core/kube/resources/namespace/namespace_name.js';
import {type DeploymentName} from '../../core/config/remote/types.js';
import {inject, injectable} from 'tsyringe-neo';
import {InjectTokens} from '../../core/dependency_injection/inject_tokens.js';
import {type ConfigManager} from '../../core/config_manager.js';
import {type SoloLogger} from '../../core/logging.js';
import {type ChartManager} from '../../core/chart_manager.js';
import {patchInject} from '../../core/dependency_injection/container_helper.js';

export const CONNECT_CONFIGS_NAME = 'connectConfig';

@injectable()
export class ClusterCommandConfigs {
  constructor(
    @inject(InjectTokens.ConfigManager) private readonly configManager: ConfigManager,
    @inject(InjectTokens.SoloLogger) private readonly logger: SoloLogger,
    @inject(InjectTokens.ChartManager) private readonly chartManager: ChartManager,
  ) {
    this.configManager = patchInject(configManager, InjectTokens.ConfigManager, this.constructor.name);
    this.logger = patchInject(logger, InjectTokens.SoloLogger, this.constructor.name);
    this.chartManager = patchInject(chartManager, InjectTokens.ChartManager, this.constructor.name);
  }

  public async connectConfigBuilder(argv, ctx, task) {
    const config = this.configManager.getConfig(CONNECT_CONFIGS_NAME, argv.flags, []) as ClusterConnectConfigClass;
    // set config in the context for later tasks to use
    ctx.config = config;

    return ctx.config;
  }

  public async setupConfigBuilder(argv, ctx, task) {
    const configManager = this.configManager;
    configManager.update(argv);
    flags.disablePrompts([flags.chartDirectory]);

  await configManager.executePrompt(task, [
    flags.chartDirectory,
    flags.clusterSetupNamespace,
    flags.deployMinio,
    flags.deployPrometheusStack,
  ]);

  ctx.config = {
    chartDir: configManager.getFlag(flags.chartDirectory) as string,
    clusterSetupNamespace: configManager.getFlag(flags.clusterSetupNamespace) as NamespaceName,
    deployMinio: configManager.getFlag(flags.deployMinio) as boolean,
    deployPrometheusStack: configManager.getFlag(flags.deployPrometheusStack) as boolean,
    soloChartVersion: configManager.getFlag(flags.soloChartVersion) as string,
  } as ClusterSetupConfigClass;

    this.logger.debug('Prepare ctx.config', {config: ctx.config, argv});

    ctx.isChartInstalled = await this.chartManager.isChartInstalled(
      ctx.config.clusterSetupNamespace,
      constants.SOLO_CLUSTER_SETUP_CHART,
    );

    return ctx.config;
  }

  public async resetConfigBuilder(argv, ctx, task) {
    if (!argv[flags.force.name]) {
      const confirmResult = await task.prompt(ListrInquirerPromptAdapter).run(confirmPrompt, {
        default: false,
        message: 'Are you sure you would like to uninstall solo-cluster-setup chart?',
      });

      if (!confirmResult) {
        this.logger.logAndExitSuccess('Aborted application by user prompt');
      }
    }

    this.configManager.update(argv);

    ctx.config = {
      clusterName: this.configManager.getFlag(flags.clusterRef) as string,
      clusterSetupNamespace: this.configManager.getFlag(flags.clusterSetupNamespace) as string,
    } as ClusterResetConfigClass;

    ctx.isChartInstalled = await this.chartManager.isChartInstalled(
      ctx.config.clusterSetupNamespace,
      constants.SOLO_CLUSTER_SETUP_CHART,
    );
    if (!ctx.isChartInstalled) {
      throw new SoloError('No chart found for the cluster');
    }

    return ctx.config;
  }
}

export interface ClusterConnectConfigClass {
  app: string;
  cacheDir: string;
  devMode: boolean;
  namespace: string;
  nodeAlias: NodeAlias;
  context: string;
  clusterName: string;
}

export interface ClusterSetupConfigClass {
  chartDir: string;
  clusterSetupNamespace: NamespaceName;
  deployMinio: boolean;
  deployPrometheusStack: boolean;
  soloChartVersion: string;
}

export interface ClusterResetConfigClass {
  clusterName: string;
  clusterSetupNamespace: string;
}

export interface SelectClusterContextContext {
  config: {
    quiet: boolean;
    namespace: NamespaceName;
    clusterName: string;
    context: string;
    clusters: string[];
    deployment: DeploymentName;
    deploymentClusters: string[];
  };
}
