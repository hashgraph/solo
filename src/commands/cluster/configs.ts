/**
 * SPDX-License-Identifier: Apache-2.0
 */

import {Flags as flags} from '../flags.js';
import * as constants from '../../core/constants.js';
import {ListrInquirerPromptAdapter} from '@listr2/prompt-adapter-inquirer';
import {confirm as confirmPrompt} from '@inquirer/prompts';
import {SoloError} from '../../core/errors.js';
import {type NamespaceName} from '../../core/kube/resources/namespace/namespace_name.js';
import {type ClusterRef, type DeploymentName, type EmailAddress} from '../../core/config/remote/types.js';

export const CONNECT_CONFIGS_NAME = 'connectConfig';
export const DEFAULT_CONFIGS_NAME = 'defaultConfig';

export const connectConfigBuilder = async function (argv, ctx, task) {
  const configManager = this.parent.getConfigManager();
  configManager.update(argv);
  ctx.config = this.getConfig(CONNECT_CONFIGS_NAME, argv.flags, []) as ClusterRefConnectConfigClass;

  if (!ctx.config.contextName) {
    const isQuiet = configManager.getFlag(flags.quiet);
    if (isQuiet) {
      ctx.config.contextName = this.parent.getK8Factory().default().contexts().readCurrent();
    } else {
      const kubeContexts = this.parent.getK8Factory().default().contexts().list();
      ctx.config.contextName = await flags.context.prompt(task, kubeContexts, ctx.config.clusterRef);
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
    flags.deployCertManager,
    flags.deployCertManagerCrds,
    flags.deployMinio,
    flags.deployPrometheusStack,
  ]);

  ctx.config = {
    chartDir: configManager.getFlag(flags.chartDirectory) as string,
    clusterSetupNamespace: configManager.getFlag(flags.clusterSetupNamespace) as NamespaceName,
    deployCertManager: configManager.getFlag(flags.deployCertManager) as boolean,
    deployCertManagerCrds: configManager.getFlag(flags.deployCertManagerCrds) as boolean,
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

export interface ClusterRefConnectConfigClass {
  cacheDir: string;
  devMode: boolean;
  quiet: boolean;
  userEmailAddress: EmailAddress;
  clusterRef: ClusterRef;
  contextName: string;
}

export interface ClusterRefConnectContext {
  config: ClusterRefConnectConfigClass;
}

export interface ClusterRefDefaultConfigClass {
  cacheDir: string;
  devMode: boolean;
  clusterRef: string;
}

export interface ClusterSetupConfigClass {
  chartDir: string;
  clusterSetupNamespace: NamespaceName;
  deployCertManager: boolean;
  deployCertManagerCrds: boolean;
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
