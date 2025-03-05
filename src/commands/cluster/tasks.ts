/**
 * SPDX-License-Identifier: Apache-2.0
 */
import {Task} from '../../core/task.js';
import {Flags as flags} from '../flags.js';
import {type ListrTaskWrapper} from 'listr2';
import {type ConfigBuilder} from '../../types/aliases.js';
import {type BaseCommand} from '../base.js';
import {prepareChartPath, splitFlagInput} from '../../core/helpers.js';
import * as constants from '../../core/constants.js';
import path from 'path';
import chalk from 'chalk';
import {ListrLease} from '../../core/lease/listr_lease.js';
import {ErrorMessages} from '../../core/error_messages.js';
import {SoloError} from '../../core/errors.js';
import {RemoteConfigManager} from '../../core/config/remote/remote_config_manager.js';
import {type RemoteConfigDataWrapper} from '../../core/config/remote/remote_config_data_wrapper.js';
import {type K8Factory} from '../../core/kube/k8_factory.js';
import {type SoloListrTask, type SoloListrTaskWrapper} from '../../types/index.js';
import {type ClusterRefConnectContext, type SelectClusterContextContext} from './configs.js';
import {type ClusterRef, type DeploymentName} from '../../core/config/remote/types.js';
import {type LocalConfig} from '../../core/config/local_config.js';
import {ListrInquirerPromptAdapter} from '@listr2/prompt-adapter-inquirer';
import {confirm as confirmPrompt} from '@inquirer/prompts';
import {type NamespaceName} from '../../core/kube/resources/namespace/namespace_name.js';
import {inject, injectable} from 'tsyringe-neo';
import {patchInject} from '../../core/dependency_injection/container_helper.js';
import {type ConfigManager} from '../../core/config_manager.js';
import {type SoloLogger} from '../../core/logging.js';
import {type ChartManager} from '../../core/chart_manager.js';
import {type LeaseManager} from '../../core/lease/lease_manager.js';
import {type Helm} from '../../core/helm.js';
import {type ClusterChecks} from '../../core/cluster_checks.js';
import {container} from 'tsyringe-neo';
import {InjectTokens} from '../../core/dependency_injection/inject_tokens.js';

@injectable()
export class ClusterCommandTasks {
  private readonly clusterChecks: ClusterChecks = container.resolve(InjectTokens.ClusterChecks);

  constructor(
    @inject(InjectTokens.K8Factory) private readonly k8Factory: K8Factory,
    @inject(InjectTokens.ConfigManager) private readonly configManager: ConfigManager,
    @inject(InjectTokens.RemoteConfigManager) private readonly remoteConfigManager: RemoteConfigManager,
    @inject(InjectTokens.LocalConfig) private readonly localConfig: LocalConfig,
    @inject(InjectTokens.SoloLogger) private readonly logger: SoloLogger,
    @inject(InjectTokens.ChartManager) private readonly chartManager: ChartManager,
    @inject(InjectTokens.LeaseManager) private readonly leaseManager: LeaseManager,
    @inject(InjectTokens.Helm) private readonly helm: Helm,
  ) {
    this.k8Factory = patchInject(k8Factory, InjectTokens.K8Factory, this.constructor.name);
    this.configManager = patchInject(configManager, InjectTokens.ConfigManager, this.constructor.name);
    this.remoteConfigManager = patchInject(
      remoteConfigManager,
      InjectTokens.RemoteConfigManager,
      this.constructor.name,
    );
    this.localConfig = patchInject(localConfig, InjectTokens.LocalConfig, this.constructor.name);
    this.logger = patchInject(logger, InjectTokens.SoloLogger, this.constructor.name);
    this.chartManager = patchInject(chartManager, InjectTokens.ChartManager, this.constructor.name);
    this.leaseManager = patchInject(leaseManager, InjectTokens.LeaseManager, this.constructor.name);
    this.helm = patchInject(helm, InjectTokens.Helm, this.constructor.name);
  }

  public connectClusterRef(): SoloListrTask<ClusterRefConnectContext> {
    return {
      title: 'Associate a context with a cluster reference: ',
      task: async (ctx, task) => {
        task.title += ctx.config.clusterRef;

        this.localConfig.clusterRefs[ctx.config.clusterRef] = ctx.config.contextName;
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

  public disconnectClusterRef() {
    return {
      title: 'Remove cluster reference ',
      task: async (ctx, task: ListrTaskWrapper<any, any, any>) => {
        task.title += ctx.config.clusterRef;
        delete this.localConfig.clusterRefs[ctx.config.clusterRef];
      },
    };
  }

  testConnectionToCluster(clusterRef?: string): SoloListrTask<ClusterRefConnectContext> {
    const self = this;
    return {
      title: `Test connection to cluster: ${chalk.cyan(clusterRef)}`,
      task: async (_, task) => {
        let context = this.localConfig.clusterRefs[clusterRef];
        if (!context) {
          const isQuiet = self.configManager.getFlag(flags.quiet);
          if (isQuiet) {
            context = self.k8Factory.default().contexts().readCurrent();
          } else {
            context = await self.promptForContext(task, clusterRef);
          }

          this.localConfig.clusterRefs[clusterRef] = context;
        }
        if (!(await self.k8Factory.default().contexts().testContextConnection(context))) {
          task.title = `${task.title} - ${chalk.red('Cluster connection failed')}`;
          throw new SoloError(`${ErrorMessages.INVALID_CONTEXT_FOR_CLUSTER_DETAILED(context, clusterRef)}`);
        }
      },
    };
  }

  public validateRemoteConfigForCluster(
    cluster: string,
    currentClusterName: string,
    localConfig: LocalConfig,
    currentRemoteConfig: RemoteConfigDataWrapper,
  ) {
    const self = this;
    return {
      title: `Pull and validate remote configuration for cluster: ${chalk.cyan(cluster)}`,
      task: async (_, subTask: ListrTaskWrapper<any, any, any>) => {
        const context = localConfig.clusterRefs[cluster];
        self.k8Factory.default().contexts().updateCurrent(context);
        const remoteConfigFromOtherCluster = await self.remoteConfigManager.get();
        if (!RemoteConfigManager.compare(currentRemoteConfig, remoteConfigFromOtherCluster)) {
          throw new SoloError(ErrorMessages.REMOTE_CONFIGS_DO_NOT_MATCH(currentClusterName, cluster));
        }
      },
    };
  }

  public updateLocalConfig(): SoloListrTask<SelectClusterContextContext> {
    return new Task('Update local configuration', async (ctx: any, task: ListrTaskWrapper<any, any, any>) => {
      this.logger.info('Compare local and remote configuration...');
      const configManager = this.configManager;
      const isQuiet = configManager.getFlag(flags.quiet);

      await this.remoteConfigManager.modify(async remoteConfig => {
        // Update current deployment with cluster list from remoteConfig
        const localConfig = this.localConfig;
        const localDeployments = localConfig.deployments;
        const remoteClusterList: string[] = [];
        let deploymentName;
        const remoteNamespace = remoteConfig.metadata.namespace;
        for (const deployment in localConfig.deployments) {
          if (localConfig.deployments[deployment].namespace === remoteNamespace) {
            deploymentName = deployment;
            break;
          }
        }

        if (localConfig.deployments[deploymentName]) {
          for (const cluster of Object.keys(remoteConfig.clusters)) {
            if (localConfig.deployments[deploymentName].namespace === remoteConfig.clusters[cluster].valueOf()) {
              remoteClusterList.push(cluster);
            }
          }
          ctx.config.clusters = remoteClusterList;
          localDeployments[deploymentName].clusters = ctx.config.clusters;
        } else {
          const clusters = Object.keys(remoteConfig.clusters);
          localDeployments[deploymentName] = {clusters, namespace: remoteNamespace};
          ctx.config.clusters = clusters;
        }

        localConfig.setDeployments(localDeployments);

        const contexts = splitFlagInput(configManager.getFlag(flags.context));

        for (let i = 0; i < ctx.config.clusters.length; i++) {
          const cluster = ctx.config.clusters[i];
          const context = contexts[i];

          // If a context is provided, use it to update the mapping
          if (context) {
            localConfig.clusterRefs[cluster] = context;
          } else if (!localConfig.clusterRefs[cluster]) {
            // In quiet mode, use the currently selected context to update the mapping
            if (isQuiet) {
              localConfig.clusterRefs[cluster] = this.k8Factory.default().contexts().readCurrent();
            }

            // Prompt the user to select a context if mapping value is missing
            else {
              localConfig.clusterRefs[cluster] = await this.promptForContext(task, cluster);
            }
          }
        }
        this.logger.info('Update local configuration...');
        await localConfig.write();
      });
    });
  }

  private async getSelectedContext(
    task: SoloListrTaskWrapper<SelectClusterContextContext>,
    selectedCluster: string,
    localConfig: LocalConfig,
    isQuiet: boolean,
  ) {
    let selectedContext;
    if (isQuiet) {
      selectedContext = this.k8Factory.default().contexts().readCurrent();
    } else {
      selectedContext = await this.promptForContext(task, selectedCluster);
      localConfig.clusterRefs[selectedCluster] = selectedContext;
    }
    return selectedContext;
  }

  private async promptForContext(task: SoloListrTaskWrapper<SelectClusterContextContext>, cluster: string) {
    const kubeContexts = this.k8Factory.default().contexts().list();
    return flags.context.prompt(task, kubeContexts, cluster);
  }

  private async selectContextForFirstCluster(
    task: SoloListrTaskWrapper<SelectClusterContextContext>,
    clusters: string[],
    localConfig: LocalConfig,
    isQuiet: boolean,
  ) {
    const selectedCluster = clusters[0];

    if (localConfig.clusterRefs[selectedCluster]) {
      return localConfig.clusterRefs[selectedCluster];
    }

    // If a cluster does not exist in LocalConfig mapping prompt the user to select a context or use the current one
    else {
      return this.getSelectedContext(task, selectedCluster, localConfig, isQuiet);
    }
  }

  /**
   * Prepare values arg for cluster setup command
   *
   * @param [chartDir] - local charts directory (default is empty)
   * @param [prometheusStackEnabled] - a bool to denote whether to install prometheus stack
   * @param [minioEnabled] - a bool to denote whether to install minio
   * @param [certManagerEnabled] - a bool to denote whether to install cert manager
   * @param [certManagerCrdsEnabled] - a bool to denote whether to install cert manager CRDs
   */
  private prepareValuesArg(
    chartDir = flags.chartDirectory.definition.defaultValue as string,
    prometheusStackEnabled = flags.deployPrometheusStack.definition.defaultValue as boolean,
    minioEnabled = flags.deployMinio.definition.defaultValue as boolean,
  ) {
    let valuesArg = chartDir ? `-f ${path.join(chartDir, 'solo-cluster-setup', 'values.yaml')}` : '';

    valuesArg += ` --set cloud.prometheusStack.enabled=${prometheusStackEnabled}`;
    valuesArg += ` --set cloud.minio.enabled=${minioEnabled}`;

    return valuesArg;
  }

  /** Show list of installed chart */
  private async showInstalledChartList(clusterSetupNamespace: NamespaceName) {
    this.logger.showList('Installed Charts', await this.chartManager.getInstalledCharts(clusterSetupNamespace));
  }

  public selectContext(): SoloListrTask<SelectClusterContextContext> {
    return {
      title: 'Resolve context for remote cluster',
      task: async (_, task) => {
        this.logger.info('Resolve context for remote cluster...');
        const configManager = this.configManager;
        const isQuiet = configManager.getFlag<boolean>(flags.quiet);
        const deploymentName: string = configManager.getFlag<DeploymentName>(flags.deployment);
        let clusters = splitFlagInput(configManager.getFlag<string>(flags.clusterRef));
        const contexts = splitFlagInput(configManager.getFlag<string>(flags.context));
        const namespace = configManager.getFlag<NamespaceName>(flags.namespace);
        const localConfig = this.localConfig;
        let selectedContext: string;
        let selectedCluster: string;

        // TODO - BEGIN... added this because it was confusing why we have both clusterRef and deploymentClusters
        if (clusters?.length === 0) {
          clusters = splitFlagInput(configManager.getFlag<string>(flags.deploymentClusters));
        }

        // If one or more contexts are provided, use the first one
        if (contexts.length) {
          selectedContext = contexts[0];

          if (clusters.length) {
            selectedCluster = clusters[0];
          } else if (localConfig.deployments[deploymentName]) {
            selectedCluster = localConfig.deployments[deploymentName].clusters[0];
          }
        }

        // If one or more clusters are provided, use the first one to determine the context
        // from the mapping in the LocalConfig
        else if (clusters.length) {
          selectedCluster = clusters[0];
          selectedContext = await this.selectContextForFirstCluster(task, clusters, localConfig, isQuiet);
        }

        // If a deployment name is provided, get the clusters associated with the deployment from the LocalConfig
        // and select the context from the mapping, corresponding to the first deployment cluster
        else if (deploymentName) {
          const deployment = localConfig.deployments[deploymentName];

          if (deployment && deployment.clusters.length) {
            selectedCluster = deployment.clusters[0];
            selectedContext = await this.selectContextForFirstCluster(task, deployment.clusters, localConfig, isQuiet);
          }

          // The provided deployment does not exist in the LocalConfig
          else {
            // Add the deployment to the LocalConfig with the currently selected cluster and context in KubeConfig
            if (isQuiet) {
              selectedContext = this.k8Factory.default().contexts().readCurrent();
              selectedCluster = this.k8Factory.default().clusters().readCurrent();
              localConfig.deployments[deploymentName] = {
                clusters: [selectedCluster],
                namespace: namespace ? namespace.name : '',
              };

              if (!localConfig.clusterRefs[selectedCluster]) {
                localConfig.clusterRefs[selectedCluster] = selectedContext;
              }
            }

            // Prompt user for clusters and contexts
            else {
              const promptedClusters = await flags.clusterRef.prompt(task, '');
              clusters = splitFlagInput(promptedClusters);

              for (const cluster of clusters) {
                if (!localConfig.clusterRefs[cluster]) {
                  localConfig.clusterRefs[cluster] = await this.promptForContext(task, cluster);
                }
              }

              selectedCluster = clusters[0];
              selectedContext = localConfig.clusterRefs[clusters[0]];
            }
          }
        }

        const connectionValid = await this.k8Factory.default().contexts().testContextConnection(selectedContext);
        if (!connectionValid) {
          throw new SoloError(ErrorMessages.INVALID_CONTEXT_FOR_CLUSTER(selectedContext, selectedCluster));
        }
        this.k8Factory.default().contexts().updateCurrent(selectedContext);
        this.configManager.setFlag(flags.context, selectedContext);
      },
    };
  }

  public initialize(argv: any, configInit: ConfigBuilder) {
    const {requiredFlags, optionalFlags} = argv;

    argv.flags = [...requiredFlags, ...optionalFlags];

    return {
      title: 'Initialize',
      task: async (ctx: any, task: ListrTaskWrapper<any, any, any>) => {
        if (argv[flags.devMode.name]) {
          this.logger.setDevMode(true);
        }

        ctx.config = await configInit(argv, ctx, task);
      },
    };
  }

  public showClusterList() {
    return new Task('List all available clusters', async (ctx: any, task: ListrTaskWrapper<any, any, any>) => {
      const clusterRefs = this.localConfig.clusterRefs;
      const clusterList = Object.entries(clusterRefs).map(
        ([clusterName, clusterContext]) => `${clusterName}:${clusterContext}`,
      );
      this.logger.showList('Cluster references and the respective contexts', clusterList);
    });
  }

  public getClusterInfo() {
    return new Task('Get cluster info', async (ctx: any, task: ListrTaskWrapper<any, any, any>) => {
      const clusterRef = ctx.config.clusterRef;
      const clusterRefs = this.localConfig.clusterRefs;
      const deployments = this.localConfig.deployments;

      if (!clusterRefs[clusterRef]) {
        throw new Error(`Cluster "${clusterRef}" not found in the LocalConfig`);
      }

      const context = clusterRefs[clusterRef];
      const deploymentsWithSelectedCluster = Object.entries(deployments)
        .filter(([_, deployment]) => deployment.clusters.includes(clusterRef))
        .map(([deploymentName, deployment]) => ({
          name: deploymentName,
          namespace: deployment.namespace || 'default',
        }));

      task.output =
        `Cluster Reference: ${clusterRef}\n` + `Associated Context: ${context}\n` + 'Deployments using this Cluster:';

      if (deploymentsWithSelectedCluster.length) {
        task.output +=
          '\n' + deploymentsWithSelectedCluster.map(dep => `  - ${dep.name} [Namespace: ${dep.namespace}]`).join('\n');
      } else {
        task.output += '\n  - None';
      }

      this.logger.showUser(task.output);
    });
  }

  public prepareChartValues(argv) {
    const self = this;

    return new Task(
      'Prepare chart values',
      async (ctx: any, task: ListrTaskWrapper<any, any, any>) => {
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
      ctx => ctx.isChartInstalled,
    );
  }

  public installClusterChart(argv) {
    const self = this;
    return new Task(
      `Install '${constants.SOLO_CLUSTER_SETUP_CHART}' chart`,
      async (ctx: any, task: ListrTaskWrapper<any, any, any>) => {
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
        } catch (e: Error | unknown) {
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

          throw e;
        }

        if (argv.dev) {
          await this.showInstalledChartList(clusterSetupNamespace);
        }
      },
      ctx => ctx.isChartInstalled,
    );
  }

  public acquireNewLease(argv) {
    return new Task('Acquire new lease', async (ctx: any, task: ListrTaskWrapper<any, any, any>) => {
      const lease = await this.leaseManager.create();
      return ListrLease.newAcquireLeaseTask(lease, task);
    });
  }

  public uninstallClusterChart(argv) {
    const self = this;

    return new Task(
      `Uninstall '${constants.SOLO_CLUSTER_SETUP_CHART}' chart`,
      async (ctx: any, task: ListrTaskWrapper<any, any, any>) => {
        const clusterSetupNamespace = ctx.config.clusterSetupNamespace;

        if (!argv.force && (await self.clusterChecks.isRemoteConfigPresentInAnyNamespace())) {
          const confirm = await task.prompt(ListrInquirerPromptAdapter).run(confirmPrompt, {
            default: false,
            message:
              'There is remote config for one of the deployments' +
              'Are you sure you would like to uninstall the cluster?',
          });

          if (!confirm) {
            self.logger.logAndExitSuccess('Aborted application by user prompt');
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
      ctx => !ctx.isChartInstalled,
    );
  }
}
