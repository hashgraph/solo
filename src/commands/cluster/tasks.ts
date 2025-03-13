// SPDX-License-Identifier: Apache-2.0

import {Flags as flags} from '../flags.js';
import {type ArgvStruct, type AnyListrContext, type ConfigBuilder} from '../../types/aliases.js';
import {prepareChartPath, showVersionBanner} from '../../core/helpers.js';
import * as constants from '../../core/constants.js';
import path from 'path';
import chalk from 'chalk';
import {ListrLock} from '../../core/lock/listr-lock.js';
import {ErrorMessages} from '../../core/error-messages.js';
import {SoloError} from '../../core/errors/solo-error.js';
import {UserBreak} from '../../core/errors/user-break.js';
import {type K8Factory} from '../../core/kube/k8-factory.js';
import {type SoloListrTask} from '../../types/index.js';
import {type ClusterRef} from '../../core/config/remote/types.js';
import {type LocalConfig} from '../../core/config/local-config.js';
import {ListrInquirerPromptAdapter} from '@listr2/prompt-adapter-inquirer';
import {confirm as confirmPrompt} from '@inquirer/prompts';
import {type NamespaceName} from '../../core/kube/resources/namespace/namespace-name.js';
import {inject, injectable} from 'tsyringe-neo';
import {patchInject} from '../../core/dependency-injection/container-helper.js';
import {type SoloLogger} from '../../core/logging.js';
import {type ChartManager} from '../../core/chart-manager.js';
import {type LockManager} from '../../core/lock/lock-manager.js';
import {type Helm} from '../../core/helm.js';
import {type ClusterChecks} from '../../core/cluster-checks.js';
import {container} from 'tsyringe-neo';
import {InjectTokens} from '../../core/dependency-injection/inject-tokens.js';
import {SOLO_CLUSTER_SETUP_CHART} from '../../core/constants.js';
import {type ClusterRefConnectContext} from './config-interfaces/cluster-ref-connect-context.js';
import {type ClusterRefDefaultContext} from './config-interfaces/cluster-ref-default-context.js';
import {type ClusterRefSetupContext} from './config-interfaces/cluster-ref-setup-context.js';
import {type ClusterRefResetContext} from './config-interfaces/cluster-ref-reset-context.js';

@injectable()
export class ClusterCommandTasks {
  private readonly clusterChecks: ClusterChecks = container.resolve(InjectTokens.ClusterChecks);

  constructor(
    @inject(InjectTokens.K8Factory) private readonly k8Factory: K8Factory,
    @inject(InjectTokens.LocalConfig) private readonly localConfig: LocalConfig,
    @inject(InjectTokens.SoloLogger) private readonly logger: SoloLogger,
    @inject(InjectTokens.ChartManager) private readonly chartManager: ChartManager,
    @inject(InjectTokens.LockManager) private readonly leaseManager: LockManager,
    @inject(InjectTokens.Helm) private readonly helm: Helm,
  ) {
    this.k8Factory = patchInject(k8Factory, InjectTokens.K8Factory, this.constructor.name);
    this.localConfig = patchInject(localConfig, InjectTokens.LocalConfig, this.constructor.name);
    this.logger = patchInject(logger, InjectTokens.SoloLogger, this.constructor.name);
    this.chartManager = patchInject(chartManager, InjectTokens.ChartManager, this.constructor.name);
    this.leaseManager = patchInject(leaseManager, InjectTokens.LockManager, this.constructor.name);
    this.helm = patchInject(helm, InjectTokens.Helm, this.constructor.name);
  }

  public connectClusterRef(): SoloListrTask<ClusterRefConnectContext> {
    return {
      title: 'Associate a context with a cluster reference: ',
      task: async (ctx, task) => {
        task.title += ctx.config.clusterRef;

        this.localConfig.clusterRefs[ctx.config.clusterRef] = ctx.config.context;
      },
    };
  }

  public saveLocalConfig(): SoloListrTask<ClusterRefConnectContext> {
    return {
      title: 'Save local configuration',
      task: async () => {
        await this.localConfig.write();
      },
    };
  }

  public disconnectClusterRef(): SoloListrTask<ClusterRefDefaultContext> {
    return {
      title: 'Remove cluster reference ',
      task: async (ctx, task) => {
        task.title += ctx.config.clusterRef;
        delete this.localConfig.clusterRefs[ctx.config.clusterRef];
      },
    };
  }

  public testConnectionToCluster(clusterRef?: ClusterRef): SoloListrTask<ClusterRefConnectContext> {
    const self = this;
    return {
      title: 'Test connection to cluster: ',
      task: async (ctx, task) => {
        task.title += clusterRef ?? ctx.config.clusterRef;
        try {
          await self.k8Factory.getK8(ctx.config.context).namespaces().list();
        } catch {
          task.title = `${task.title} - ${chalk.red('Cluster connection failed')}`;
          throw new SoloError(
            `${ErrorMessages.INVALID_CONTEXT_FOR_CLUSTER_DETAILED(ctx.config.context, ctx.config.clusterRef)}`,
          );
        }
      },
    };
  }

  public validateClusterRefs(): SoloListrTask<ClusterRefConnectContext> {
    const self = this;
    return {
      title: 'Validating cluster ref: ',
      task: async (ctx, task) => {
        const {clusterRef} = ctx.config;
        task.title = clusterRef;

        if (self.localConfig.clusterRefs.hasOwnProperty(clusterRef)) {
          throw new SoloError(`Cluster ref ${clusterRef} already exists inside local config`);
        }
      },
    };
  }

  /**
   * Prepare values arg for cluster setup command
   *
   * @param [chartDir] - local charts directory (default is empty)
   * @param [prometheusStackEnabled] - a bool to denote whether to install prometheus stack
   * @param [minioEnabled] - a bool to denote whether to install minio
   */
  private prepareValuesArg(
    chartDir = flags.chartDirectory.definition.defaultValue as string,
    prometheusStackEnabled = flags.deployPrometheusStack.definition.defaultValue as boolean,
    minioEnabled = flags.deployMinio.definition.defaultValue as boolean,
  ): string {
    let valuesArg = chartDir ? `-f ${path.join(chartDir, 'solo-cluster-setup', 'values.yaml')}` : '';

    valuesArg += ` --set cloud.prometheusStack.enabled=${prometheusStackEnabled}`;
    valuesArg += ` --set cloud.minio.enabled=${minioEnabled}`;

    return valuesArg;
  }

  /** Show list of installed chart */
  private async showInstalledChartList(clusterSetupNamespace: NamespaceName) {
    this.logger.showList('Installed Charts', await this.chartManager.getInstalledCharts(clusterSetupNamespace));
  }

  public initialize(argv: ArgvStruct, configInit: ConfigBuilder): SoloListrTask<AnyListrContext> {
    const {requiredFlags, optionalFlags} = argv;

    argv.flags = [...requiredFlags, ...optionalFlags];

    return {
      title: 'Initialize',
      task: async (ctx, task) => {
        ctx.config = await configInit(argv, ctx, task);
      },
    };
  }

  public showClusterList(): SoloListrTask<AnyListrContext> {
    return {
      title: 'List all available clusters',
      task: async () => {
        const clusterRefs = this.localConfig.clusterRefs;
        const clusterList = Object.entries(clusterRefs).map(
          ([clusterName, clusterContext]) => `${clusterName}:${clusterContext}`,
        );
        this.logger.showList('Cluster references and the respective contexts', clusterList);
      },
    };
  }

  public getClusterInfo(): SoloListrTask<AnyListrContext> {
    return {
      title: 'Get cluster info',
      task: async (ctx, task) => {
        const clusterRef = ctx.config.clusterRef;
        const clusterRefs = this.localConfig.clusterRefs;
        const deployments = this.localConfig.deployments;

        if (!clusterRefs[clusterRef]) {
          throw new Error(`Cluster "${clusterRef}" not found in the LocalConfig`);
        }

        const context = clusterRefs[clusterRef];
        const deploymentsWithSelectedCluster = Object.entries(deployments)
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          .filter(([_, deployment]) => deployment.clusters.includes(clusterRef))
          .map(([deploymentName, deployment]) => ({
            name: deploymentName,
            namespace: deployment.namespace || 'default',
          }));

        task.output =
          `Cluster Reference: ${clusterRef}\n` + `Associated Context: ${context}\n` + 'Deployments using this Cluster:';

        if (deploymentsWithSelectedCluster.length) {
          task.output +=
            '\n' +
            deploymentsWithSelectedCluster.map(dep => `  - ${dep.name} [Namespace: ${dep.namespace}]`).join('\n');
        } else {
          task.output += '\n  - None';
        }

        this.logger.showUser(task.output);
      },
    };
  }

  public prepareChartValues(): SoloListrTask<ClusterRefSetupContext> {
    const self = this;

    return {
      title: 'Prepare chart values',
      task: async ctx => {
        ctx.chartPath = await prepareChartPath(
          this.helm,
          ctx.config.chartDir,
          constants.SOLO_TESTING_CHART_URL,
          constants.SOLO_CLUSTER_SETUP_CHART,
        );

        // if minio is already present, don't deploy it
        if (ctx.config.deployMinio && (await self.clusterChecks.isMinioInstalled(ctx.config.clusterSetupNamespace))) {
          ctx.config.deployMinio = false;
        }

        // if prometheus is found, don't deploy it
        if (
          ctx.config.deployPrometheusStack &&
          !(await self.clusterChecks.isPrometheusInstalled(ctx.config.clusterSetupNamespace))
        ) {
          ctx.config.deployPrometheusStack = false;
        }

        // If all are already present or not wanted, skip installation
        if (!ctx.config.deployPrometheusStack && !ctx.config.deployMinio) {
          ctx.isChartInstalled = true;
          return;
        }

        ctx.valuesArg = this.prepareValuesArg(
          ctx.config.chartDir,
          ctx.config.deployPrometheusStack,
          ctx.config.deployMinio,
        );
      },
      skip: ctx => ctx.isChartInstalled,
    };
  }

  public installClusterChart(argv: ArgvStruct): SoloListrTask<ClusterRefSetupContext> {
    const self = this;
    return {
      title: `Install '${constants.SOLO_CLUSTER_SETUP_CHART}' chart`,
      task: async ctx => {
        const clusterSetupNamespace = ctx.config.clusterSetupNamespace;
        const version = ctx.config.soloChartVersion;
        const valuesArg = ctx.valuesArg;

        try {
          this.logger.debug(`Installing chart chartPath = ${ctx.chartPath}, version = ${version}`);
          await this.chartManager.install(
            clusterSetupNamespace,
            constants.SOLO_CLUSTER_SETUP_CHART,
            ctx.chartPath,
            version,
            valuesArg,
            this.k8Factory.default().contexts().readCurrent(),
          );
          showVersionBanner(self.logger, SOLO_CLUSTER_SETUP_CHART, version);
        } catch (e) {
          // if error, uninstall the chart and rethrow the error
          self.logger.debug(
            `Error on installing ${constants.SOLO_CLUSTER_SETUP_CHART}. attempting to rollback by uninstalling the chart`,
            e,
          );
          try {
            await this.chartManager.uninstall(
              clusterSetupNamespace,
              constants.SOLO_CLUSTER_SETUP_CHART,
              this.k8Factory.default().contexts().readCurrent(),
            );
          } catch {
            // ignore error during uninstall since we are doing the best-effort uninstall here
          }

          throw new SoloError(
            `Error on installing ${constants.SOLO_CLUSTER_SETUP_CHART}. attempting to rollback by uninstalling the chart`,
            e,
          );
        }

        if (argv.dev) {
          await this.showInstalledChartList(clusterSetupNamespace);
        }
      },
      skip: ctx => ctx.isChartInstalled,
    };
  }

  public acquireNewLease(): SoloListrTask<ClusterRefResetContext> {
    return {
      title: 'Acquire new lease',
      task: async (_, task) => {
        const lease = await this.leaseManager.create();
        return ListrLock.newAcquireLockTask(lease, task);
      },
    };
  }

  public uninstallClusterChart(argv: ArgvStruct): SoloListrTask<ClusterRefResetContext> {
    const self = this;
    return {
      title: `Uninstall '${constants.SOLO_CLUSTER_SETUP_CHART}' chart`,
      task: async (ctx, task) => {
        const clusterSetupNamespace = ctx.config.clusterSetupNamespace;

        if (!argv.force && (await self.clusterChecks.isRemoteConfigPresentInAnyNamespace())) {
          const confirm = await task.prompt(ListrInquirerPromptAdapter).run(confirmPrompt, {
            default: false,
            message:
              'There is remote config for one of the deployments' +
              'Are you sure you would like to uninstall the cluster?',
          });

          if (!confirm) {
            throw new UserBreak('Aborted application by user prompt');
          }
        }
        await self.chartManager.uninstall(
          clusterSetupNamespace,
          constants.SOLO_CLUSTER_SETUP_CHART,
          this.k8Factory.default().contexts().readCurrent(),
        );
        if (argv.dev) {
          await this.showInstalledChartList(clusterSetupNamespace);
        }
      },
      skip: ctx => !ctx.isChartInstalled,
    };
  }
}
