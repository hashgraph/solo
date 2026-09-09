// SPDX-License-Identifier: Apache-2.0

import {Listr} from 'listr2';
import {type AnyListrContext, type ArgvStruct, type ConfigBuilder} from '../../types/aliases.js';
import * as constants from '../../core/constants.js';
import chalk from 'chalk';
import {ListrLock} from '../../core/lock/listr-lock.js';
import {SoloErrors} from '../../core/errors/solo-errors.js';

import {type K8Factory} from '../../integration/kube/k8-factory.js';
import {type Context, type SoloListr, type SoloListrTask} from '../../types/index.js';
import {NamespaceName} from '../../types/namespace/namespace-name.js';
import {inject, injectable} from 'tsyringe-neo';
import {patchInject} from '../../core/dependency-injection/container-helper.js';
import {type SoloLogger} from '../../core/logging/solo-logger.js';
import {type ChartManager} from '../../core/chart-manager.js';
import {SharedClusterResourceReport} from '../../core/shared-cluster-resource-report.js';
import {ClusterCrdProbe} from '../../core/cluster-crd-probe.js';
import {type ReleaseItem} from '../../integration/helm/model/release/release-item.js';
import {type ClusterRole} from '../../integration/kube/resources/rbac/cluster-role.js';
import {type LockManager} from '../../core/lock/lock-manager.js';
import {type ClusterChecks} from '../../core/cluster-checks.js';
import {InjectTokens} from '../../core/dependency-injection/inject-tokens.js';
import {type ClusterReferenceConnectContext} from './config-interfaces/cluster-reference-connect-context.js';
import {type ClusterReferenceDefaultContext} from './config-interfaces/cluster-reference-default-context.js';
import {type ClusterReferenceSetupContext} from './config-interfaces/cluster-reference-setup-context.js';
import {type ClusterReferenceResetContext} from './config-interfaces/cluster-reference-reset-context.js';
import {LocalConfigRuntimeState} from '../../business/runtime-state/config/local/local-config-runtime-state.js';
import {StringFacade} from '../../business/runtime-state/facade/string-facade.js';
import {type FacadeMap} from '../../business/runtime-state/collection/facade-map.js';
import {MutableFacadeArray} from '../../business/runtime-state/collection/mutable-facade-array.js';
import {Deployment} from '../../business/runtime-state/config/local/deployment.js';
import {DeploymentSchema} from '../../data/schema/model/local/deployment-schema.js';
import {Lock} from '../../core/lock/lock.js';
import {RemoteConfigRuntimeState} from '../../business/runtime-state/config/remote/remote-config-runtime-state.js';
import {type OneShotState} from '../../core/one-shot-state.js';
import * as versions from '../../../version.js';
import {K8} from '../../integration/kube/k8.js';
import {HelmChartValues} from '../../integration/helm/model/values.js';
import {Flags} from '../flags.js';
import {type ClusterStateService} from '../../integration/container-engine/cluster-state-service.js';
import {type ContainerEngineState} from '../../integration/container-engine/container-engine-state.js';
import {type KindClusterContainer} from '../../integration/container-engine/kind-cluster-container.js';
import {OperatingSystem} from '../../business/utils/operating-system.js';

@injectable()
export class ClusterCommandTasks {
  /** Prefix Kind gives the kube context it writes for a cluster: `kind-<clusterName>`. */
  private static readonly KIND_CONTEXT_PREFIX: string = 'kind-';

  public constructor(
    @inject(InjectTokens.K8Factory) private readonly k8Factory: K8Factory,
    @inject(InjectTokens.LocalConfigRuntimeState) private readonly localConfig: LocalConfigRuntimeState,
    @inject(InjectTokens.SoloLogger) private readonly logger: SoloLogger,
    @inject(InjectTokens.ChartManager) private readonly chartManager: ChartManager,
    @inject(InjectTokens.LockManager) private readonly leaseManager: LockManager,
    @inject(InjectTokens.ClusterChecks) private readonly clusterChecks: ClusterChecks,
    @inject(InjectTokens.RemoteConfigRuntimeState) private readonly remoteConfig: RemoteConfigRuntimeState,
    @inject(InjectTokens.OneShotState) private readonly oneShotState: OneShotState,
    @inject(InjectTokens.ClusterStateService) private readonly clusterStateService: ClusterStateService,
  ) {
    this.k8Factory = patchInject(k8Factory, InjectTokens.K8Factory, this.constructor.name);
    this.localConfig = patchInject(localConfig, InjectTokens.LocalConfigRuntimeState, this.constructor.name);
    this.logger = patchInject(logger, InjectTokens.SoloLogger, this.constructor.name);
    this.chartManager = patchInject(chartManager, InjectTokens.ChartManager, this.constructor.name);
    this.leaseManager = patchInject(leaseManager, InjectTokens.LockManager, this.constructor.name);
    this.clusterChecks = patchInject(clusterChecks, InjectTokens.ClusterChecks, this.constructor.name);
    this.remoteConfig = patchInject(remoteConfig, InjectTokens.RemoteConfigRuntimeState, this.constructor.name);
    this.oneShotState = patchInject(oneShotState, InjectTokens.OneShotState, this.constructor.name);
    this.clusterStateService = patchInject(
      clusterStateService,
      InjectTokens.ClusterStateService,
      this.constructor.name,
    );
  }

  public async installMinioOperatorChart(clusterSetupNamespace: NamespaceName, context: Context): Promise<void> {
    // The operator's CRDs are cluster-scoped, so they are what a second install collides with — and they
    // remain after the operator's pods and namespace are gone. Their presence therefore says that some
    // release once owned them, not that an operator is running now; the release is what says that.
    const existingCrds: Map<string, Record<string, string>> = await ClusterCrdProbe.probe(
      this.k8Factory,
      context,
      constants.MINIO_OPERATOR_CRDS,
    );
    const owningRelease: ReleaseItem | undefined = await this.chartManager.getInstalledRelease(
      undefined,
      constants.MINIO_OPERATOR_RELEASE_NAME,
      context,
    );

    if (owningRelease) {
      const foundVersions: Set<string> = new Set(
        [...existingCrds.values()].map((labels: Record<string, string>): string =>
          SharedClusterResourceReport.versionFromLabels(labels),
        ),
      );
      SharedClusterResourceReport.show(
        this.logger,
        'MinIO Operator',
        context,
        `release '${owningRelease.name}' (${owningRelease.chart}) in namespace ${owningRelease.namespace}` +
          (foundVersions.size > 0 ? ` with CRDs ${[...foundVersions].join(', ')}` : ''),
        `version ${versions.MINIO_OPERATOR_VERSION} as release '${constants.MINIO_OPERATOR_RELEASE_NAME}'`,
      );
      return;
    }

    if (existingCrds.size > 0) {
      // Orphaned: the CRDs outlived their release. Installing over them fails because Helm will not adopt
      // resources it does not own, and skipping the install would leave the Tenant created later with no
      // operator to reconcile it — a silent hang far from this cause. Say so here instead.
      throw new SoloErrors.system.minioOperatorCrdsOrphaned([...existingCrds.keys()], context);
    }

    try {
      await this.chartManager.install(
        clusterSetupNamespace,
        constants.MINIO_OPERATOR_RELEASE_NAME,
        constants.MINIO_OPERATOR_CHART,
        constants.MINIO_OPERATOR_CHART,
        versions.MINIO_OPERATOR_VERSION,
        new HelmChartValues().set('operator.replicaCount', 1),
        context,
      );

      this.logger.showUserUnlessOneShot(`✅ MinIO Operator chart installed successfully on context ${context}`);
    } catch (error) {
      this.logger.debug('Error installing MinIO Operator chart', error);
      try {
        await this.chartManager.uninstall(clusterSetupNamespace, constants.MINIO_OPERATOR_RELEASE_NAME, context);
      } catch (uninstallError) {
        this.logger.showUserError(uninstallError);
      }
      throw new SoloErrors.deployment.minioInstallFailed(error);
    }
  }

  public connectClusterRef(): SoloListrTask<ClusterReferenceConnectContext> {
    return {
      title: 'Associate a context with a cluster reference: ',
      task: async (context_, task): Promise<void> => {
        task.title += context_.config.clusterRef;

        this.localConfig.configuration.clusterRefs.set(
          context_.config.clusterRef,
          new StringFacade(context_.config.context),
        );

        await this.localConfig.persist();
      },
    };
  }

  public disconnectClusterRef(): SoloListrTask<ClusterReferenceDefaultContext> {
    return {
      title: 'Remove cluster reference ',
      task: async (context_, task): Promise<void> => {
        task.title += context_.config.clusterRef;

        this.localConfig.configuration.clusterRefs.delete(context_.config.clusterRef);
        await this.localConfig.persist();
      },
    };
  }

  public testConnectionToCluster(): SoloListrTask<ClusterReferenceConnectContext> {
    return {
      title: 'Test connection to cluster: ',
      task: async ({config: {context, clusterRef}}, task): Promise<void> => {
        task.title += context;
        try {
          await this.k8Factory.getK8(context).namespaces().list();
        } catch {
          task.title = `${task.title} - ${chalk.red('Cluster connection failed')}`;
          throw new SoloErrors.deployment.contextNotFoundForCluster(
            clusterRef,
            Flags.getFormattedFlagKey(Flags.clusterRef),
            Flags.getFormattedFlagKey(Flags.context),
          );
        }
      },
    };
  }

  public validateClusterRefs(): SoloListrTask<ClusterReferenceConnectContext> {
    return {
      title: 'Validating cluster ref: ',
      task: async ({config: {clusterRef}}, task): Promise<void> => {
        task.title += clusterRef;

        if (this.localConfig.configuration.clusterRefs.get(clusterRef)) {
          this.logger.showUserUnlessOneShot(
            chalk.yellow(`Cluster ref ${clusterRef} already exists inside local config`),
          );
        }
      },
    };
  }

  /** Show list of installed chart */
  private async showInstalledChartList(clusterSetupNamespace: NamespaceName, context?: string): Promise<void> {
    // TODO convert to logger.addMessageGroup() & logger.addMessageGroupMessage()
    const installedCharts: string[] = await this.chartManager.getInstalledCharts(clusterSetupNamespace, context);
    if (this.oneShotState.isActive()) {
      this.logger.showListIfNotEmpty('Installed Charts', installedCharts);
    } else {
      this.logger.showList('Installed Charts', installedCharts);
    }
  }

  public initialize(
    argv: ArgvStruct,
    configInit: ConfigBuilder,
    loadRemoteConfig: boolean = false,
  ): SoloListrTask<AnyListrContext> {
    const {required, optional} = argv;

    argv.flags = [...required, ...optional];

    return {
      title: 'Initialize',
      task: async (context_, task): Promise<void> => {
        await this.localConfig.load();

        if (loadRemoteConfig) {
          await this.remoteConfig.loadAndValidate(argv);
        }
        context_.config = await configInit(argv, context_, task);
      },
    };
  }

  public showClusterList(): SoloListrTask<AnyListrContext> {
    return {
      title: 'List all available clusters',
      task: async (): Promise<void> => {
        await this.localConfig.load();

        const clusterReferences: FacadeMap<string, StringFacade, string> = this.localConfig.configuration.clusterRefs;
        const clusterList: string[] = [];
        for (const [clusterName, clusterContext] of clusterReferences) {
          clusterList.push(`${clusterName}:${clusterContext.toString()}`);
        }
        this.logger.showList('Cluster references and the respective contexts', clusterList);
      },
    };
  }

  public getClusterInfo(): SoloListrTask<AnyListrContext> {
    return {
      title: 'Get cluster info',
      task: async (context_, task): Promise<void> => {
        const clusterReference: string = context_.config.clusterRef;
        const clusterReferences: FacadeMap<string, StringFacade, string> = this.localConfig.configuration.clusterRefs;
        const deployments: MutableFacadeArray<Deployment, DeploymentSchema> =
          this.localConfig.configuration.deployments;
        const context: StringFacade | undefined = clusterReferences.get(clusterReference);

        if (!context) {
          throw new Error(`Cluster "${clusterReference}" not found in the LocalConfig`);
        }

        const deploymentsWithSelectedCluster: {name: string; namespace: string}[] = [...deployments]
          .filter((deployment): boolean =>
            deployment.clusters.some((cluster): boolean => cluster.toString() === clusterReference),
          )
          .map((deployment): {name: string; namespace: string} => ({
            name: deployment.name,
            namespace: deployment.namespace || 'default',
          }));

        task.output =
          `Cluster Reference: ${clusterReference}\n` +
          `Associated Context: ${context}\n` +
          'Deployments using this Cluster:';

        task.output +=
          deploymentsWithSelectedCluster.length > 0
            ? '\n' +
              deploymentsWithSelectedCluster
                .map(
                  (dep: {name: string; namespace: string}): string => `  - ${dep.name} [Namespace: ${dep.namespace}]`,
                )
                .join('\n')
            : '\n  - None';

        this.logger.showUserUnlessOneShot(task.output);
      },
    };
  }

  public startClusterState(): SoloListrTask<AnyListrContext> {
    return {
      title: 'Start container engine and Kind cluster containers',
      task: async (): Promise<void> => {
        const engineState: ContainerEngineState = await this.clusterStateService.startEngine();

        const containers: KindClusterContainer[] = await this.listSoloKindClusterContainers(engineState.engineName);

        const stoppedContainers: KindClusterContainer[] = containers.filter((container): boolean => !container.running);
        if (stoppedContainers.length === 0) {
          this.logger.showUser(
            `✅ Kind cluster container(s) already running: ${ClusterCommandTasks.describeContainers(containers)}`,
          );
          return;
        }

        await this.clusterStateService.startContainers(
          engineState.engineName,
          stoppedContainers.map((container): string => container.containerName),
        );
        this.logger.showUser(
          `✅ Started Kind cluster container(s): ${ClusterCommandTasks.describeContainers(stoppedContainers)}`,
        );
      },
    };
  }

  public stopClusterState(): SoloListrTask<AnyListrContext> {
    return {
      title: 'Stop Kind cluster containers',
      task: async (): Promise<void> => {
        const engineState: ContainerEngineState = await this.clusterStateService.getEngineState();
        if (!engineState.engineName) {
          throw new SoloErrors.system.containerEngineNotFound();
        }
        if (!engineState.running) {
          this.logger.showUser(
            '✅ Container engine is not running, so any Kind cluster containers are already stopped',
          );
          return;
        }

        const containers: KindClusterContainer[] = await this.listSoloKindClusterContainers(engineState.engineName);

        const runningContainers: KindClusterContainer[] = containers.filter((container): boolean => container.running);
        if (runningContainers.length === 0) {
          this.logger.showUser(
            `✅ Kind cluster container(s) already stopped: ${ClusterCommandTasks.describeContainers(containers)}`,
          );
          return;
        }

        await this.clusterStateService.stopContainers(
          engineState.engineName,
          runningContainers.map((container): string => container.containerName),
        );
        this.logger.showUser(
          `✅ Stopped Kind cluster container(s): ${ClusterCommandTasks.describeContainers(runningContainers)}`,
        );
      },
    };
  }

  public showClusterStateInfo(): SoloListrTask<AnyListrContext> {
    return {
      title: 'Get local cluster state info',
      task: async (): Promise<void> => {
        const engineState: ContainerEngineState = await this.clusterStateService.getEngineState();
        const machineBased: boolean = OperatingSystem.isDarwin() || OperatingSystem.isWin32();
        const engineDescription: string = machineBased
          ? `${engineState.engineName ?? 'none detected'} (Docker Desktop / Podman machine)`
          : (engineState.engineName ?? 'none detected');

        const lines: string[] = [
          `Container engine:        ${engineDescription}`,
          `Container engine state:  ${engineState.engineName ? (engineState.running ? 'running' : 'stopped') : 'not installed'}`,
        ];

        if (engineState.running) {
          // info deliberately lists every Kind cluster on the machine, including ones Solo does not
          // manage, so orphaned clusters are surfaced; each line states which side it falls on
          const containers: KindClusterContainer[] = await this.clusterStateService.listKindClusterContainers(
            engineState.engineName,
          );
          const clusterReferences: Map<string, string> = await this.soloKindClusterReferences();
          lines.push(
            'Kind cluster containers:',
            containers.length === 0
              ? '  - not-found'
              : containers
                  .map((container): string => {
                    const clusterReference: string | undefined = clusterReferences.get(container.clusterName);
                    const ownership: string = clusterReference
                      ? `cluster-ref: ${clusterReference}`
                      : 'not managed by Solo';
                    return (
                      `  - ${container.clusterName}: ${container.running ? 'running' : 'stopped'} ` +
                      `(${container.containerName}) [${ownership}]`
                    );
                  })
                  .join('\n'),
          );
        } else {
          lines.push('Kind cluster containers: unknown (start the container engine to detect them)');
        }

        this.logger.showUser(lines.join('\n'));
      },
    };
  }

  /**
   * Maps each Kind cluster name to the Solo cluster reference pointing at it. Cluster references
   * whose context is not a Kind context are skipped, so the result is exactly the set of Kind
   * clusters Solo is configured to manage.
   */
  private async soloKindClusterReferences(): Promise<Map<string, string>> {
    await this.localConfig.load();

    const clusterReferencesByClusterName: Map<string, string> = new Map<string, string>();
    for (const [clusterReference, context] of this.localConfig.configuration.clusterRefs.entries()) {
      const contextName: string = context.toString();
      if (contextName.startsWith(ClusterCommandTasks.KIND_CONTEXT_PREFIX)) {
        clusterReferencesByClusterName.set(
          contextName.slice(ClusterCommandTasks.KIND_CONTEXT_PREFIX.length),
          clusterReference,
        );
      }
    }
    return clusterReferencesByClusterName;
  }

  /**
   * Kind cluster containers belonging to the Solo cluster references in the local config. Kind
   * clusters created outside Solo are excluded so `state start` and `state stop` never touch
   * another project's cluster.
   */
  private async listSoloKindClusterContainers(engineName: string): Promise<KindClusterContainer[]> {
    const containers: KindClusterContainer[] = await this.clusterStateService.listKindClusterContainers(engineName);
    if (containers.length === 0) {
      throw new SoloErrors.system.kindClusterContainerNotFound();
    }

    const clusterReferences: Map<string, string> = await this.soloKindClusterReferences();
    const soloContainers: KindClusterContainer[] = containers.filter((container): boolean =>
      clusterReferences.has(container.clusterName),
    );

    if (soloContainers.length === 0) {
      const detectedClusters: string = [...new Set(containers.map((container): string => container.clusterName))].join(
        ', ',
      );
      throw new SoloErrors.system.kindClusterContainerNotFound(
        `None of the detected Kind clusters (${detectedClusters}) are mapped to a Solo cluster reference`,
      );
    }
    return soloContainers;
  }

  private static describeContainers(containers: readonly KindClusterContainer[]): string {
    return containers
      .map((container): string => `${container.containerName} [cluster: ${container.clusterName}]`)
      .join(', ');
  }

  public installMinioOperator(): SoloListrTask<ClusterReferenceSetupContext> {
    return {
      title: 'Install MinIO Operator chart',
      task: async ({config: {clusterSetupNamespace, context}}): Promise<void> => {
        await this.installMinioOperatorChart(clusterSetupNamespace, context);
      },
      skip: ({config: {deployMinio}}): boolean => !deployMinio,
    };
  }

  public installPrometheusStack(): SoloListrTask<ClusterReferenceSetupContext> {
    return {
      title: 'Install Prometheus Stack chart',
      task: async (context_): Promise<void> => {
        const clusterSetupNamespace: NamespaceName = context_.config.clusterSetupNamespace;

        const installedPrometheus: ReleaseItem | undefined = await this.chartManager.getInstalledRelease(
          clusterSetupNamespace,
          constants.PROMETHEUS_RELEASE_NAME,
          context_.config.context,
        );

        if (installedPrometheus) {
          SharedClusterResourceReport.show(
            this.logger,
            `Prometheus Stack Helm release '${constants.PROMETHEUS_RELEASE_NAME}'`,
            context_.config.context,
            `chart ${installedPrometheus.chart} in namespace '${installedPrometheus.namespace}'`,
            `chart version ${versions.PROMETHEUS_STACK_VERSION}`,
          );
        } else {
          try {
            await this.chartManager.install(
              clusterSetupNamespace,
              constants.PROMETHEUS_RELEASE_NAME,
              constants.PROMETHEUS_STACK_CHART,
              constants.PROMETHEUS_STACK_CHART,
              versions.PROMETHEUS_STACK_VERSION,
              new HelmChartValues().file(constants.PROMETHEUS_STACK_VALUES_FILE),
              context_.config.context,
            );
            this.logger.showUserUnlessOneShot('✅ Prometheus Stack chart installed successfully');
          } catch (error) {
            this.logger.debug('Error installing Prometheus Stack chart', error);
            try {
              await this.chartManager.uninstall(
                clusterSetupNamespace,
                constants.PROMETHEUS_RELEASE_NAME,
                context_.config.context,
              );
            } catch (uninstallError) {
              this.logger.showUserError(uninstallError);
            }
            throw new SoloErrors.deployment.prometheusInstallFailed(error);
          }
        }
      },
      skip: (context_: ClusterReferenceSetupContext): boolean => !context_.config.deployPrometheusStack,
    };
  }

  public installMetricsServer(): SoloListrTask<ClusterReferenceSetupContext> {
    return {
      title: 'Install metrics-server chart',
      task: async ({config: {context}}): Promise<void> => {
        const installedMetricsServer: ReleaseItem | undefined = await this.chartManager.getInstalledRelease(
          constants.METRICS_SERVER_NAMESPACE,
          constants.METRICS_SERVER_RELEASE_NAME,
          context,
        );

        if (installedMetricsServer) {
          SharedClusterResourceReport.show(
            this.logger,
            `metrics-server Helm release '${constants.METRICS_SERVER_RELEASE_NAME}'`,
            context,
            `chart ${installedMetricsServer.chart} in namespace '${installedMetricsServer.namespace}'`,
            versions.METRICS_SERVER_VERSION ? `chart version ${versions.METRICS_SERVER_VERSION}` : undefined,
          );
          return;
        }

        try {
          await this.chartManager.install(
            constants.METRICS_SERVER_NAMESPACE,
            constants.METRICS_SERVER_RELEASE_NAME,
            constants.METRICS_SERVER_CHART,
            constants.METRICS_SERVER_CHART,
            versions.METRICS_SERVER_VERSION,
            new HelmChartValues().setLiteral('args[0]', '--kubelet-insecure-tls'),
            context,
          );
          this.logger.showUserUnlessOneShot('metrics-server chart installed successfully');
        } catch (error) {
          this.logger.debug('Error installing metrics-server chart', error);
          try {
            await this.chartManager.uninstall(
              constants.METRICS_SERVER_NAMESPACE,
              constants.METRICS_SERVER_RELEASE_NAME,
              context,
            );
          } catch (uninstallError) {
            this.logger.showUserError(uninstallError);
          }
          throw new SoloErrors.deployment.metricsServerInstallFailed(error);
        }
      },
      skip: ({config: {deployMetricsServer}}): boolean => !deployMetricsServer,
    };
  }

  public installPodMonitorRole(): SoloListrTask<ClusterReferenceSetupContext> {
    return {
      title: 'Install pod-monitor-role ClusterRole',
      task: async (context_: ClusterReferenceSetupContext): Promise<void> => {
        const k8: K8 = this.k8Factory.getK8(context_.config.context);

        // Check if ClusterRole already exists using Kubernetes JavaScript API
        let existingPodMonitorRole: ClusterRole | undefined;
        try {
          existingPodMonitorRole = await k8.rbac().readClusterRole(constants.POD_MONITOR_ROLE);
        } catch (error) {
          throw new SoloErrors.system.clusterRoleCheckFailed(constants.POD_MONITOR_ROLE, error as Error);
        }
        if (existingPodMonitorRole) {
          const ownership: string = Object.entries(constants.SOLO_CLUSTER_ROLE_LABELS).every(
            ([labelKey, labelValue]: [string, string]): boolean =>
              existingPodMonitorRole.labels?.[labelKey] === labelValue,
          )
            ? 'a ClusterRole carrying the Solo ownership label'
            : 'a ClusterRole without the Solo ownership label (created outside Solo)';
          SharedClusterResourceReport.show(
            this.logger,
            `ClusterRole '${constants.POD_MONITOR_ROLE}'`,
            context_.config.context,
            ownership,
          );
          return;
        }

        // ClusterRole doesn't exist, create it
        try {
          await k8.rbac().createClusterRole(
            constants.POD_MONITOR_ROLE,
            [
              {
                apiGroups: [''],
                resources: ['pods', 'services', 'clusterroles', 'pods/log', 'secrets'],
                verbs: ['get', 'list'],
              },
              {
                apiGroups: [''],
                resources: ['pods/exec'],
                verbs: ['create'],
              },
            ],
            constants.SOLO_CLUSTER_ROLE_LABELS,
          );
          this.logger.showUserUnlessOneShot(
            `✅ ClusterRole pod-monitor-role installed successfully in context ${context_.config.context}`,
          );
        } catch (installError) {
          this.logger.debug('Error installing pod-monitor-role ClusterRole', installError);
          throw new SoloErrors.deployment.clusterRoleInstallFailed(installError);
        }
      },
    };
  }

  public uninstallPodMonitorRole(): SoloListrTask<ClusterReferenceResetContext> {
    return {
      title: 'Uninstall pod-monitor-role ClusterRole',
      task: async ({config: {context}}): Promise<void> => {
        let podMonitorRoleExists: boolean = false;
        try {
          // Check if ClusterRole exists using Kubernetes JavaScript API
          podMonitorRoleExists = await this.k8Factory
            .getK8(context)
            .rbac()
            .clusterRoleExists(constants.POD_MONITOR_ROLE);
        } catch (error) {
          throw new SoloErrors.system.clusterRoleCheckFailed(constants.POD_MONITOR_ROLE, error as Error);
        }

        if (podMonitorRoleExists) {
          // ClusterRole exists, delete it
          await this.k8Factory.getK8(context).rbac().deleteClusterRole(constants.POD_MONITOR_ROLE);
          this.logger.showUserUnlessOneShot('✅ ClusterRole pod-monitor-role uninstalled successfully');
        } else {
          // ClusterRole doesn't exist, skip
          this.logger.showUserUnlessOneShot('⏭️  ClusterRole pod-monitor-role not found, skipping');
        }
      },
    };
  }

  public installClusterChart(argv: ArgvStruct): SoloListrTask<ClusterReferenceSetupContext> {
    return {
      title: 'Install cluster charts',
      task: async (context_, task): Promise<SoloListr<ClusterReferenceSetupContext>> => {
        // switch to the correct cluster context first
        const k8: K8 = this.k8Factory.getK8(context_.config.context);
        k8.contexts().updateCurrent(context_.config.context);

        // Always install pod-monitor-role ClusterRole first
        const subtasks: SoloListrTask<ClusterReferenceSetupContext>[] = [this.installPodMonitorRole()];

        if (context_.config.deployMinio) {
          subtasks.push(this.installMinioOperator());
        }

        if (context_.config.deployPrometheusStack) {
          subtasks.push(this.installPrometheusStack());
        }

        if (context_.config.deployMetricsServer) {
          subtasks.push(this.installMetricsServer());
        }

        const result: SoloListr<ClusterReferenceSetupContext> = await task.newListr(subtasks, {concurrent: false});

        if (argv.debug) {
          await this.showInstalledChartList(context_.config.clusterSetupNamespace, context_.config.context);
        }
        return result;
      },
    };
  }

  public acquireNewLease(): SoloListrTask<ClusterReferenceResetContext> {
    return {
      title: 'Acquire new lease',
      task: async (_, task): Promise<Listr<AnyListrContext>> => {
        if (!this.oneShotState.isActive()) {
          const lease: Lock = await this.leaseManager.create();
          return ListrLock.newAcquireLockTask(lease, task);
        }
        return ListrLock.newSkippedLockTask(task);
      },
    };
  }

  /**
   * Decides whether a MinIO Operator release is one solo installed, and so one reset may remove.
   *
   * Two signals, both required. The chart identifies what was installed — solo always installs the
   * `operator` chart from `MINIO_OPERATOR_CHART_URL`, so a release running a different chart under the
   * same release name is somebody else's. The namespace identifies who installed it: the cluster-setup
   * namespace is where solo puts it, and any namespace holding a solo remote config belongs to a solo
   * deployment. Anything outside both is left alone.
   */
  private async isSoloInstalledMinioOperator(
    release: ReleaseItem,
    clusterSetupNamespace: NamespaceName,
    context: Context,
  ): Promise<boolean> {
    // ReleaseItem.chart is `<name>-<version>`, e.g. `operator-7.1.1`.
    if (!release.chart?.startsWith(`${constants.MINIO_OPERATOR_CHART}-`)) {
      return false;
    }

    if (release.namespace === clusterSetupNamespace.name) {
      return true;
    }

    // Context-scoped: a multi-cluster reset targets one cluster, and the default one need not be it.
    return this.clusterChecks.isRemoteConfigPresentInNamespace(NamespaceName.of(release.namespace), context);
  }

  public uninstallMinioOperator(): SoloListrTask<ClusterReferenceResetContext> {
    return {
      title: 'Uninstall MinIO Operator chart',
      task: async ({config: {clusterSetupNamespace, context}}): Promise<void> => {
        // Looked up across all namespaces: solo does not always install the operator into the namespace
        // this reset was invoked with, and uninstalling the wrong one is what left the CRDs behind.
        const release: ReleaseItem | undefined = await this.chartManager.getInstalledRelease(
          undefined,
          constants.MINIO_OPERATOR_RELEASE_NAME,
          context,
        );

        if (!release) {
          this.logger.showUserUnlessOneShot('⏭️  MinIO Operator chart not installed, skipping');
          return;
        }

        // `operator` is also the release name in MinIO's own documented install, so a name match alone
        // would let reset uninstall a user's unrelated operator in some other namespace. Only remove one
        // that looks like solo's: solo's chart, in a namespace solo manages.
        if (!(await this.isSoloInstalledMinioOperator(release, clusterSetupNamespace, context))) {
          this.logger.showUserUnlessOneShot(
            `⏭️  Leaving MinIO Operator release '${release.name}' (${release.chart}) in namespace ` +
              `${release.namespace} alone: it was not installed by solo`,
          );
          return;
        }

        await this.chartManager.uninstall(NamespaceName.of(release.namespace), release.name, context);

        this.logger.showUserUnlessOneShot('✅ MinIO Operator chart uninstalled successfully');
      },
    };
  }

  public uninstallPrometheusStack(): SoloListrTask<ClusterReferenceResetContext> {
    return {
      title: 'Uninstall Prometheus Stack chart',
      task: async ({config: {clusterSetupNamespace, context}}): Promise<void> => {
        const isPrometheusInstalled: boolean = await this.chartManager.isChartInstalled(
          clusterSetupNamespace,
          constants.PROMETHEUS_RELEASE_NAME,
          context,
        );

        if (isPrometheusInstalled) {
          await this.chartManager.uninstall(clusterSetupNamespace, constants.PROMETHEUS_RELEASE_NAME, context);
          this.logger.showUserUnlessOneShot('✅ Prometheus Stack chart uninstalled successfully');
        } else {
          this.logger.showUserUnlessOneShot('⏭️  Prometheus Stack chart not installed, skipping');
        }
      },
    };
  }

  public uninstallMetricsServer(): SoloListrTask<ClusterReferenceResetContext> {
    return {
      title: 'Uninstall metrics-server chart',
      task: async ({config: {context}}): Promise<void> => {
        const isMetricsServerInstalled: boolean = await this.chartManager.isChartInstalled(
          constants.METRICS_SERVER_NAMESPACE,
          constants.METRICS_SERVER_RELEASE_NAME,
          context,
        );

        if (isMetricsServerInstalled) {
          await this.chartManager.uninstall(
            constants.METRICS_SERVER_NAMESPACE,
            constants.METRICS_SERVER_RELEASE_NAME,
            context,
          );
          this.logger.showUserUnlessOneShot('Metrics-server chart uninstalled successfully');
        } else {
          this.logger.showUserUnlessOneShot('Metrics-server chart not installed, skipping');
        }
      },
    };
  }

  public uninstallClusterChart(argv: ArgvStruct): SoloListrTask<ClusterReferenceResetContext> {
    return {
      title: 'Uninstall cluster charts',
      task: async (
        {config: {clusterSetupNamespace, context}},
        task,
      ): Promise<SoloListr<ClusterReferenceResetContext>> => {
        const isShared: boolean =
          !argv.force && (await this.clusterChecks.isRemoteConfigPresentInAnyNamespace(context));
        if (isShared) {
          // Document Design Assumption:
          // Today, Cluster reset contains only cluster-scoped cleanup (Prometheus, Minio, etc.).
          // Skipping the phase is therefore safe because these shared resources should persist
          // for the other remaining deployments.
          this.logger.showUserUnlessOneShot(
            'Cluster is shared with other deployments. Skipping cluster reset to preserve shared resources.',
          );
          return task.newListr([], {concurrent: false});
        }

        if (argv.debug) {
          await this.showInstalledChartList(clusterSetupNamespace);
        }

        return task.newListr(
          [
            this.uninstallMetricsServer(),
            this.uninstallPrometheusStack(),
            this.uninstallMinioOperator(),
            this.uninstallPodMonitorRole(),
          ],
          {concurrent: false},
        );
      },
    };
  }
}
