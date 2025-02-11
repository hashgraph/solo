/**
 * SPDX-License-Identifier: Apache-2.0
 */
import {Task} from '../../core/task.js';
import {Flags as flags} from '../flags.js';
import {type ListrTaskWrapper} from 'listr2';
import {type ConfigBuilder} from '../../types/aliases.js';
import {type BaseCommand} from '../base.js';
import {splitFlagInput} from '../../core/helpers.js';
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
import {type SelectClusterContextContext} from './configs.js';
import {type DeploymentName} from '../../core/config/remote/types.js';
import {type LocalConfig} from '../../core/config/local_config.js';
import {ListrEnquirerPromptAdapter} from '@listr2/prompt-adapter-enquirer';
import {type NamespaceName} from '../../core/kube/resources/namespace/namespace_name.js';
import {type ClusterChecks} from '../../core/cluster_checks.js';
import {container} from 'tsyringe-neo';
import {InjectTokens} from '../../core/dependency_injection/inject_tokens.js';

export class ClusterCommandTasks {
  private readonly parent: BaseCommand;
  private readonly clusterChecks: ClusterChecks = container.resolve(InjectTokens.ClusterChecks);

  constructor(
    parent,
    private readonly k8Factory: K8Factory,
  ) {
    this.parent = parent;
  }

  testConnectionToCluster(cluster: string, localConfig: LocalConfig, parentTask: ListrTaskWrapper<any, any, any>) {
    const self = this;
    return {
      title: `Test connection to cluster: ${chalk.cyan(cluster)}`,
      task: async (_, subTask: ListrTaskWrapper<any, any, any>) => {
        let context = localConfig.clusterRefs[cluster];
        if (!context) {
          const isQuiet = self.parent.getConfigManager().getFlag(flags.quiet);
          if (isQuiet) {
            context = self.parent.getK8Factory().default().contexts().readCurrent();
          } else {
            context = await self.promptForContext(parentTask, cluster);
          }

          localConfig.clusterRefs[cluster] = context;
        }
        if (!(await self.parent.getK8Factory().default().contexts().testContextConnection(context))) {
          subTask.title = `${subTask.title} - ${chalk.red('Cluster connection failed')}`;
          throw new SoloError(`${ErrorMessages.INVALID_CONTEXT_FOR_CLUSTER_DETAILED(context, cluster)}`);
        }
      },
    };
  }

  validateRemoteConfigForCluster(
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
        self.parent.getK8Factory().default().contexts().updateCurrent(context);
        const remoteConfigFromOtherCluster = await self.parent.getRemoteConfigManager().get();
        if (!RemoteConfigManager.compare(currentRemoteConfig, remoteConfigFromOtherCluster)) {
          throw new SoloError(ErrorMessages.REMOTE_CONFIGS_DO_NOT_MATCH(currentClusterName, cluster));
        }
      },
    };
  }

  readClustersFromRemoteConfig(argv) {
    const self = this;
    return {
      title: 'Read clusters from remote config',
      task: async (ctx, task) => {
        const localConfig = this.parent.getLocalConfig();
        const currentClusterName = this.parent.getK8Factory().default().clusters().readCurrent();
        const currentRemoteConfig: RemoteConfigDataWrapper = await this.parent.getRemoteConfigManager().get();
        const subTasks = [];
        const remoteConfigClusters = Object.keys(currentRemoteConfig.clusters);
        const otherRemoteConfigClusters: string[] = remoteConfigClusters.filter(c => c !== currentClusterName);

        // Validate connections for the other clusters
        for (const cluster of otherRemoteConfigClusters) {
          subTasks.push(self.testConnectionToCluster(cluster, localConfig, task));
        }

        // Pull and validate RemoteConfigs from the other clusters
        for (const cluster of otherRemoteConfigClusters) {
          subTasks.push(
            self.validateRemoteConfigForCluster(cluster, currentClusterName, localConfig, currentRemoteConfig),
          );
        }

        return task.newListr(subTasks, {
          concurrent: false,
          rendererOptions: {collapseSubtasks: false},
        });
      },
    };
  }

  updateLocalConfig(): SoloListrTask<SelectClusterContextContext> {
    return new Task('Update local configuration', async (ctx: any, task: ListrTaskWrapper<any, any, any>) => {
      this.parent.logger.info('Compare local and remote configuration...');
      const configManager = this.parent.getConfigManager();
      const isQuiet = configManager.getFlag(flags.quiet);

      await this.parent.getRemoteConfigManager().modify(async remoteConfig => {
        // Update current deployment with cluster list from remoteConfig
        const localConfig = this.parent.getLocalConfig();
        const localDeployments = localConfig.deployments;
        const remoteClusterList: string[] = [];
        let deploymentName;
        const remoteNamespace = remoteConfig.metadata.name;
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
              localConfig.clusterRefs[cluster] = this.parent.getK8Factory().default().contexts().readCurrent();
            }

            // Prompt the user to select a context if mapping value is missing
            else {
              localConfig.clusterRefs[cluster] = await this.promptForContext(task, cluster);
            }
          }
        }
        this.parent.logger.info('Update local configuration...');
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
      selectedContext = this.parent.getK8Factory().default().contexts().readCurrent();
    } else {
      selectedContext = await this.promptForContext(task, selectedCluster);
      localConfig.clusterRefs[selectedCluster] = selectedContext;
    }
    return selectedContext;
  }

  private async promptForContext(task: SoloListrTaskWrapper<SelectClusterContextContext>, cluster: string) {
    const kubeContexts = this.parent.getK8Factory().default().contexts().list();
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
    certManagerEnabled = flags.deployCertManager.definition.defaultValue as boolean,
    certManagerCrdsEnabled = flags.deployCertManagerCrds.definition.defaultValue as boolean,
  ) {
    let valuesArg = chartDir ? `-f ${path.join(chartDir, 'solo-cluster-setup', 'values.yaml')}` : '';

    valuesArg += ` --set cloud.prometheusStack.enabled=${prometheusStackEnabled}`;
    valuesArg += ` --set cloud.certManager.enabled=${certManagerEnabled}`;
    valuesArg += ` --set cert-manager.installCRDs=${certManagerCrdsEnabled}`;
    valuesArg += ` --set cloud.minio.enabled=${minioEnabled}`;

    if (certManagerEnabled && !certManagerCrdsEnabled) {
      this.parent.logger.showUser(
        chalk.yellowBright('> WARNING:'),
        chalk.yellow(
          'cert-manager CRDs are required for cert-manager, please enable it if you have not installed it independently.',
        ),
      );
    }

    return valuesArg;
  }

  /** Show list of installed chart */
  private async showInstalledChartList(clusterSetupNamespace: NamespaceName) {
    this.parent.logger.showList(
      'Installed Charts',
      await this.parent.getChartManager().getInstalledCharts(clusterSetupNamespace),
    );
  }

  selectContext(): SoloListrTask<SelectClusterContextContext> {
    return {
      title: 'Resolve context for remote cluster',
      task: async (_, task) => {
        this.parent.logger.info('Resolve context for remote cluster...');
        const configManager = this.parent.getConfigManager();
        const isQuiet = configManager.getFlag<boolean>(flags.quiet);
        const deploymentName: string = configManager.getFlag<DeploymentName>(flags.deployment);
        let clusters = splitFlagInput(configManager.getFlag<string>(flags.clusterName));
        const contexts = splitFlagInput(configManager.getFlag<string>(flags.context));
        const namespace = configManager.getFlag<NamespaceName>(flags.namespace);
        const localConfig = this.parent.getLocalConfig();
        let selectedContext: string;
        let selectedCluster: string;

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
              selectedContext = this.parent.getK8Factory().default().contexts().readCurrent();
              selectedCluster = this.parent.getK8Factory().default().clusters().readCurrent();
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
              const promptedClusters = await flags.clusterName.prompt(task, '');
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

        const connectionValid = await this.parent
          .getK8Factory()
          .default()
          .contexts()
          .testContextConnection(selectedContext);
        if (!connectionValid) {
          throw new SoloError(ErrorMessages.INVALID_CONTEXT_FOR_CLUSTER(selectedContext, selectedCluster));
        }
        this.parent.getK8Factory().default().contexts().updateCurrent(selectedContext);
        this.parent.getConfigManager().setFlag(flags.context, selectedContext);
      },
    };
  }

  initialize(argv: any, configInit: ConfigBuilder) {
    const {requiredFlags, optionalFlags} = argv;

    argv.flags = [...requiredFlags, ...optionalFlags];

    return new Task('Initialize', async (ctx: any, task: ListrTaskWrapper<any, any, any>) => {
      if (argv[flags.devMode.name]) {
        this.parent.logger.setDevMode(true);
      }

      ctx.config = await configInit(argv, ctx, task);
    });
  }

  showClusterList() {
    return new Task('List all available clusters', async (ctx: any, task: ListrTaskWrapper<any, any, any>) => {
      this.parent.logger.showList('Clusters', this.parent.getK8Factory().default().clusters().list());
    });
  }

  getClusterInfo() {
    return new Task('Get cluster info', async (ctx: any, task: ListrTaskWrapper<any, any, any>) => {
      try {
        const clusterName = this.parent.getK8Factory().default().clusters().readCurrent();
        this.parent.logger.showUser(`Cluster Name (${clusterName})`);
        this.parent.logger.showUser('\n');
      } catch (e: Error | unknown) {
        this.parent.logger.showUserError(e);
      }
    });
  }

  prepareChartValues(argv) {
    const self = this;

    return new Task(
      'Prepare chart values',
      async (ctx: any, task: ListrTaskWrapper<any, any, any>) => {
        ctx.chartPath = await this.parent.prepareChartPath(
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

        // if cert manager is installed, don't deploy it
        if (
          (ctx.config.deployCertManager || ctx.config.deployCertManagerCrds) &&
          (await self.clusterChecks.isCertManagerInstalled())
        ) {
          ctx.config.deployCertManager = false;
          ctx.config.deployCertManagerCrds = false;
        }

        // If all are already present or not wanted, skip installation
        if (
          !ctx.config.deployPrometheusStack &&
          !ctx.config.deployMinio &&
          !ctx.config.deployCertManager &&
          !ctx.config.deployCertManagerCrds
        ) {
          ctx.isChartInstalled = true;
          return;
        }

        ctx.valuesArg = this.prepareValuesArg(
          ctx.config.chartDir,
          ctx.config.deployPrometheusStack,
          ctx.config.deployMinio,
          ctx.config.deployCertManager,
          ctx.config.deployCertManagerCrds,
        );
      },
      ctx => ctx.isChartInstalled,
    );
  }

  installClusterChart(argv) {
    const parent = this.parent;
    return new Task(
      `Install '${constants.SOLO_CLUSTER_SETUP_CHART}' chart`,
      async (ctx: any, task: ListrTaskWrapper<any, any, any>) => {
        const clusterSetupNamespace = ctx.config.clusterSetupNamespace;
        const version = ctx.config.soloChartVersion;
        const valuesArg = ctx.valuesArg;

        try {
          parent.logger.debug(`Installing chart chartPath = ${ctx.chartPath}, version = ${version}`);
          await parent
            .getChartManager()
            .install(clusterSetupNamespace, constants.SOLO_CLUSTER_SETUP_CHART, ctx.chartPath, version, valuesArg);
        } catch (e: Error | unknown) {
          // if error, uninstall the chart and rethrow the error
          parent.logger.debug(
            `Error on installing ${constants.SOLO_CLUSTER_SETUP_CHART}. attempting to rollback by uninstalling the chart`,
            e,
          );
          try {
            await parent.getChartManager().uninstall(clusterSetupNamespace, constants.SOLO_CLUSTER_SETUP_CHART);
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

  acquireNewLease(argv) {
    return new Task('Acquire new lease', async (ctx: any, task: ListrTaskWrapper<any, any, any>) => {
      const lease = await this.parent.getLeaseManager().create();
      return ListrLease.newAcquireLeaseTask(lease, task);
    });
  }

  uninstallClusterChart(argv) {
    const parent = this.parent;
    const self = this;

    return new Task(
      `Uninstall '${constants.SOLO_CLUSTER_SETUP_CHART}' chart`,
      async (ctx: any, task: ListrTaskWrapper<any, any, any>) => {
        const clusterSetupNamespace = ctx.config.clusterSetupNamespace;

        if (!argv.force && (await self.clusterChecks.isRemoteConfigPresentInAnyNamespace())) {
          const confirm = await task.prompt(ListrEnquirerPromptAdapter).run({
            type: 'toggle',
            default: false,
            message:
              'There is remote config for one of the deployments' +
              'Are you sure you would like to uninstall the cluster?',
          });

          if (!confirm) {
            // eslint-disable-next-line n/no-process-exit
            process.exit(0);
          }
        }

        await parent.getChartManager().uninstall(clusterSetupNamespace, constants.SOLO_CLUSTER_SETUP_CHART);
        if (argv.dev) {
          await this.showInstalledChartList(clusterSetupNamespace);
        }
      },
      ctx => !ctx.isChartInstalled,
    );
  }
}
