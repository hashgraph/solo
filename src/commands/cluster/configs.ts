/**
 * SPDX-License-Identifier: Apache-2.0
 */

import {Flags as flags} from '../flags.js';
import * as constants from '../../core/constants.js';
import {ListrInquirerPromptAdapter} from '@listr2/prompt-adapter-inquirer';
import {confirm as confirmPrompt} from '@inquirer/prompts';
import {SoloError} from '../../core/errors.js';
import {type NamespaceName} from '../../core/kube/resources/namespace/namespace_name.js';
import {type ClusterResetConfigClass} from './config_interfaces/cluster_reset_config_class.js';
import {type ClusterSetupConfigClass} from './config_interfaces/cluster_setup_config_class.js';
import {type ClusterRefDefaultConfigClass} from './config_interfaces/cluster_ref_default_config_class.js';
import {type ClusterRefConnectConfigClass} from './config_interfaces/cluster_ref_connect_config_class.js';
import {ErrorMessages} from '../../core/error_messages.js';

export const CONNECT_CONFIGS_NAME = 'connectConfig';
export const DEFAULT_CONFIGS_NAME = 'defaultConfig';

export const connectConfigBuilder = async function (argv, ctx, task) {
  if (!this.parent.localConfig.configFileExists()) {
    this.parent.logger.logAndExitError(new SoloError(ErrorMessages.LOCAL_CONFIG_DOES_NOT_EXIST));
  }

  this.parent.getConfigManager().update(argv);
  ctx.config = this.getConfig(CONNECT_CONFIGS_NAME, argv.flags, ['selectedContext']) as ClusterRefConnectConfigClass;

  ctx.config.selectedContext = ctx.config.context;
  if (!ctx.config.selectedContext) {
    const isQuiet = this.parent.getConfigManager().getFlag(flags.quiet);
    if (isQuiet) {
      ctx.config.selectedContext = this.parent.getK8Factory().default().contexts().readCurrent();
    } else {
      const kubeContexts = this.parent.getK8Factory().default().contexts().list();
      ctx.config.selectedContext = await flags.context.prompt(task, kubeContexts, ctx.config.clusterRef);
    }
  }

  return ctx.config;
};

export const defaultConfigBuilder = async function (argv, ctx, task) {
  this.parent.getConfigManager().update(argv);
  ctx.config = this.getConfig(DEFAULT_CONFIGS_NAME, argv.flags, []) as ClusterRefDefaultConfigClass;
  return ctx.config;
};

export const setupConfigBuilder = async function (argv, ctx, task) {
  const parent = this.parent;
  const configManager = parent.getConfigManager();
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

  parent.logger.debug('Prepare ctx.config', {config: ctx.config, argv});

  ctx.isChartInstalled = await parent
    .getChartManager()
    .isChartInstalled(ctx.config.clusterSetupNamespace, constants.SOLO_CLUSTER_SETUP_CHART);

  return ctx.config;
};

export const resetConfigBuilder = async function (argv, ctx, task) {
  if (!argv[flags.force.name]) {
    const confirmResult = await task.prompt(ListrInquirerPromptAdapter).run(confirmPrompt, {
      default: false,
      message: 'Are you sure you would like to uninstall solo-cluster-setup chart?',
    });

    if (!confirmResult) {
      this.logger.logAndExitSuccess('Aborted application by user prompt');
    }
  }

  this.parent.getConfigManager().update(argv);

  ctx.config = {
    clusterName: this.parent.getConfigManager().getFlag(flags.clusterRef) as string,
    clusterSetupNamespace: this.parent.getConfigManager().getFlag(flags.clusterSetupNamespace) as string,
  } as ClusterResetConfigClass;

  ctx.isChartInstalled = await this.parent
    .getChartManager()
    .isChartInstalled(ctx.config.clusterSetupNamespace, constants.SOLO_CLUSTER_SETUP_CHART);
  if (!ctx.isChartInstalled) {
    throw new SoloError('No chart found for the cluster');
  }

  return ctx.config;
};
