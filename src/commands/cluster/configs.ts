/**
 * SPDX-License-Identifier: Apache-2.0
 */

import {type ArgvStruct, type NodeAlias} from '../../types/aliases.js';
import {Flags as flags} from '../flags.js';
import * as constants from '../../core/constants.js';
import {ListrInquirerPromptAdapter} from '@listr2/prompt-adapter-inquirer';
import {confirm as confirmPrompt} from '@inquirer/prompts';
import {SoloError} from '../../core/errors.js';
import {type NamespaceName} from '../../core/kube/resources/namespace/namespace_name.js';
import {inject, injectable} from 'tsyringe-neo';
import {InjectTokens} from '../../core/dependency_injection/inject_tokens.js';
import {type ConfigManager} from '../../core/config_manager.js';
import {type SoloLogger} from '../../core/logging.js';
import {type ChartManager} from '../../core/chart_manager.js';
import {patchInject} from '../../core/dependency_injection/container_helper.js';
import {type ClusterResetConfigClass} from './config_interfaces/cluster_reset_config_class.js';
import {type ClusterSetupConfigClass} from './config_interfaces/cluster_setup_config_class.js';
import {SoloListrTask, SoloListrTaskWrapper} from '../../types/index.js';

export const CONNECT_CONFIGS_NAME = 'connectConfig';
export const DEFAULT_CONFIGS_NAME = 'defaultConfig';

@injectable()
export class ClusterCommandConfigs {
  constructor(
    @inject(InjectTokens.ConfigManager) private readonly configManager: ConfigManager,
    @inject(InjectTokens.SoloLogger) private readonly logger: SoloLogger,
    @inject(InjectTokens.ChartManager) private readonly chartManager: ChartManager,
    @inject(InjectTokens.LocalConfig) private readonly localConfig: LocalConfig,
    @inject(InjectTokens.K8Factory) private readonly k8Factory: K8Factory,
  ) {
    this.configManager = patchInject(configManager, InjectTokens.ConfigManager, this.constructor.name);
    this.logger = patchInject(logger, InjectTokens.SoloLogger, this.constructor.name);
    this.chartManager = patchInject(chartManager, InjectTokens.ChartManager, this.constructor.name);
    this.localConfig = patchInject(localConfig, InjectTokens.LocalConfig, this.constructor.name);
    this.k8Factory = patchInject(k8Factory, InjectTokens.K8Factory, this.constructor.name);
  }

  public async connectConfigBuilder(
    argv: ArgvStruct,
    ctx: ClusterConnectContext,
    task: SoloListrTaskWrapper<ClusterConnectContext>,
  ): Promise<ClusterConnectConfigClass> {
    if (!this.localConfig.configFileExists()) {
      this.logger.logAndExitError(new SoloError(ErrorMessages.LOCAL_CONFIG_DOES_NOT_EXIST));
    }

    this.configManager.update(argv);
    ctx.config = this.configManager.getConfig(CONNECT_CONFIGS_NAME, argv.flags, []) as ClusterRefConnectConfigClass;

    if (!ctx.config.context) {
      const isQuiet = this.configManager.getFlag(flags.quiet);
      if (isQuiet) {
        ctx.config.context = this.k8Factory.default().contexts().readCurrent();
      } else {
        const kubeContexts = this.k8Factory.default().contexts().list();
        ctx.config.context = await flags.context.prompt(task, kubeContexts, ctx.config.clusterRef);
      }
    }

    return ctx.config;
  }

  public async defaultConfigBuilder(argv: ArgvStruct, ctx: ClusterRefDefaultContext) {
    this.configManager.update(argv);
    ctx.config = this.configManager.getConfig(DEFAULT_CONFIGS_NAME, argv.flags, []) as ClusterRefDefaultConfigClass;
    return ctx.config;
  }

  public async setupConfigBuilder(
    argv: ArgvStruct,
    ctx: ClusterSetupContext,
    task: SoloListrTaskWrapper<ClusterSetupContext>,
  ): Promise<ClusterSetupConfigClass> {
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

  public async resetConfigBuilder(
    argv: ArgvStruct,
    ctx: ClusterResetContext,
    task: SoloListrTaskWrapper<ClusterResetContext>,
  ): Promise<ClusterResetConfigClass> {
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
      clusterName: this.configManager.getFlag(flags.clusterRef),
      clusterSetupNamespace: this.configManager.getFlag<NamespaceName>(flags.clusterSetupNamespace),
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

export interface ClusterConnectContext {
  config: ClusterConnectConfigClass;
}

export interface ClusterSetupConfigClass {
  chartDir: string;
  clusterSetupNamespace: NamespaceName;
  deployMinio: boolean;
  deployPrometheusStack: boolean;
  soloChartVersion: string;
}

export interface ClusterSetupContext {
  config: ClusterSetupConfigClass;
  chartPath: string;
  isChartInstalled: boolean;
  valuesArg: string;
}

export interface ClusterResetConfigClass {
  clusterName: string;
  clusterSetupNamespace: NamespaceName;
}

export interface ClusterResetContext {
  config: ClusterResetConfigClass;
  isChartInstalled: boolean;
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
