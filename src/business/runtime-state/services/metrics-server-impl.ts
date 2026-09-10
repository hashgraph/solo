// SPDX-License-Identifier: Apache-2.0

import {PodMetrics} from '../model/pod-metrics.js';
import {type MetricsServer} from '../api/metrics-server.js';
import {NamespaceName} from '../../../types/namespace/namespace-name.js';
import {type Context} from '../../../types/index.js';
import {ShellRunner} from '../../../core/shell-runner.js';
import {SubprocessCommandProfile} from '../../../core/subprocess-command-profile.js';
import {PodName} from '../../../integration/kube/resources/pod/pod-name.js';
import {inject, injectable} from 'tsyringe-neo';
import {type SoloLogger} from '../../../core/logging/solo-logger.js';
import {patchInject} from '../../../core/dependency-injection/container-helper.js';
import {InjectTokens} from '../../../core/dependency-injection/inject-tokens.js';
import fs from 'node:fs';
import {AggregatedMetrics} from '../model/aggregated-metrics.js';
import {ClusterMetrics} from '../model/cluster-metrics.js';
import {type K8Factory} from '../../../integration/kube/k8-factory.js';
import {ContainerReference} from '../../../integration/kube/resources/container/container-reference.js';
import {ContainerName} from '../../../integration/kube/resources/container/container-name.js';
import {PodReference} from '../../../integration/kube/resources/pod/pod-reference.js';
import {RemoteConfigRuntimeState} from '../config/remote/remote-config-runtime-state.js';
import {container} from 'tsyringe-neo';
import {Duration} from '../../../core/time/duration.js';
import path from 'node:path';
import {type PodMetricsItem} from '../../../integration/kube/resources/pod/pod-metrics-item.js';
import {SubprocessEnvironment} from '../../../core/subprocess-environment.js';

@injectable()
export class MetricsServerImpl implements MetricsServer {
  public constructor(
    @inject(InjectTokens.SoloLogger) private readonly logger?: SoloLogger,
    @inject(InjectTokens.K8Factory) private readonly k8Factory?: K8Factory,
    @inject(InjectTokens.IgnorePodMetrics) private readonly ignorePodMetrics?: string[],
    @inject(InjectTokens.KubectlInstallationDirectory) protected readonly installationDirectory?: string,
  ) {
    this.logger = patchInject(logger, InjectTokens.SoloLogger, this.constructor.name);
    this.k8Factory = patchInject(k8Factory, InjectTokens.K8Factory, this.constructor.name);
    this.ignorePodMetrics = patchInject(ignorePodMetrics, InjectTokens.IgnorePodMetrics, this.constructor.name);
    this.installationDirectory = patchInject(
      installationDirectory,
      InjectTokens.KubectlInstallationDirectory,
      this.constructor.name,
    );
  }

  /** True when the pod hosts the mirror node postgres DB (shared-resources, embedded, or legacy topology). */
  public static isMirrorNodePostgresPodName(podName: string): boolean {
    return (
      podName.startsWith('solo-shared-resources-postgres') ||
      (podName.startsWith('mirror-') && podName.includes('postgres')) ||
      podName.startsWith('my-postgresql')
    );
  }

  public async getMetrics(
    snapshotName: string,
    namespaceLookup: NamespaceName = undefined,
    labelSelector: string = undefined,
    contexts: Context[] = undefined,
    events: string[] = [],
  ): Promise<AggregatedMetrics> {
    const clusterMetrics: ClusterMetrics[] = [];
    if (!contexts || contexts?.length === 0) {
      const clusterMetric: ClusterMetrics = await this.getClusterMetrics(namespaceLookup, labelSelector);
      if (clusterMetric) {
        clusterMetrics.push(clusterMetric);
      }
    } else {
      for (const context of contexts) {
        const clusterMetric: ClusterMetrics = await this.getClusterMetrics(namespaceLookup, labelSelector, context);
        if (clusterMetric) {
          clusterMetrics.push(clusterMetric);
        }
      }
    }
    return this.createAggregatedMetrics(snapshotName, clusterMetrics, events);
  }

  private async getClusterMetrics(
    namespaceLookup: NamespaceName = undefined,
    labelSelector: string = undefined,
    context: Context = undefined,
    attempt: number = 1,
  ): Promise<ClusterMetrics> {
    let podMetrics: PodMetrics[] = [];
    let clusterNamespace: string = '';
    let mirrorNodePostgresPodName: string = undefined;
    let mirrorNodePostgresNamespace: string = undefined;
    try {
      const podMetricItems: PodMetricsItem[] = await this.k8Factory
        .getK8(context && context !== 'default' ? context : undefined)
        .pods()
        .topPods(namespaceLookup, labelSelector);
      for (const item of podMetricItems) {
        const podName: string = item.podName.name;
        const namespace: string = item.namespace.name;
        podMetrics.push(new PodMetrics(item.namespace, item.podName, item.cpuInMillicores, item.memoryInMebibytes));
        if (podName.startsWith('network-node1-0')) {
          clusterNamespace = namespace;
        }
        // Capture the mirror node postgres pod across shared-resources, embedded, and legacy topologies.
        if (MetricsServerImpl.isMirrorNodePostgresPodName(podName)) {
          mirrorNodePostgresPodName = podName;
          mirrorNodePostgresNamespace = namespace;
        }
      }

      podMetrics = podMetrics.filter((podMetric: PodMetrics): boolean => {
        for (const ignorePattern of this.ignorePodMetrics) {
          if (podMetric.podName.name.includes(ignorePattern)) {
            return false;
          }
        }
        return true;
      });

      return this.createClusterMetrics(
        context ?? 'default',
        clusterNamespace ? NamespaceName.of(clusterNamespace) : undefined,
        podMetrics,
        mirrorNodePostgresPodName ? PodName.of(mirrorNodePostgresPodName) : undefined,
        mirrorNodePostgresNamespace ? NamespaceName.of(mirrorNodePostgresNamespace) : undefined,
      );
    } catch (error) {
      if (
        error.message.includes('Metrics API not available') ||
        error.message.includes('service unavailable') ||
        error.message.includes('Error occurred in metrics request')
      ) {
        if (attempt <= 3) {
          const backOffSeconds: number = 5;
          this.logger.debug(
            `Metrics API not available, retrying attempt ${attempt} after ${backOffSeconds} seconds...`,
            error,
          );
          await new Promise((resolve): NodeJS.Timeout =>
            setTimeout(resolve, Duration.ofSeconds(backOffSeconds).toMillis()),
          );
          return this.getClusterMetrics(namespaceLookup, labelSelector, context, attempt + 1);
        } else {
          this.logger.showUser('Metrics API not available for reporting metrics');
          return undefined;
        }
      }
      throw error;
    }
  }

  private async createAggregatedMetrics(
    snapshotName: string,
    clusterMetrics: ClusterMetrics[],
    events: string[] = [],
  ): Promise<AggregatedMetrics> {
    let namespace: NamespaceName = undefined;

    if (!clusterMetrics || clusterMetrics?.length === 0) {
      return undefined;
    }

    let cpuInMillicores: number = 0;
    let memoryInMebibytes: number = 0;
    let runtime: number = 0;
    let transactions: number = 0;
    for (const clusterMetric of clusterMetrics) {
      cpuInMillicores += clusterMetric.cpuInMillicores;
      memoryInMebibytes += clusterMetric.memoryInMebibytes;
      runtime += await this.getNetworkNodeRuntime(clusterMetric.namespace, clusterMetric.context);
      transactions += await this.getNetworkTransactions(
        clusterMetric.postgresNamespace,
        clusterMetric.context,
        clusterMetric.postgresPodName,
      );
      namespace = clusterMetric.namespace?.name ? clusterMetric.namespace : namespace;
      const remoteConfigRuntimeState: RemoteConfigRuntimeState = container.resolve(
        InjectTokens.RemoteConfigRuntimeState,
      );
      if (namespace && namespace.name) {
        await remoteConfigRuntimeState.load(namespace, clusterMetric.context);
      }
    }

    return new AggregatedMetrics(
      snapshotName,
      clusterMetrics,
      cpuInMillicores,
      memoryInMebibytes,
      runtime,
      transactions,
      events,
    );
  }

  private createClusterMetrics(
    context: Context,
    namespace: NamespaceName,
    podMetrics: PodMetrics[],
    mirrorNodePostgresPodName: PodName,
    postgresNamespace: NamespaceName,
  ): ClusterMetrics {
    if (!podMetrics || podMetrics?.length === 0) {
      return undefined;
    }

    let cpuInMillicores: number = 0;
    let memoryInMebibytes: number = 0;
    for (const podMetric of podMetrics) {
      cpuInMillicores += podMetric.cpuInMillicores;
      memoryInMebibytes += podMetric.memoryInMebibytes;
    }
    return new ClusterMetrics(
      context,
      namespace,
      podMetrics,
      mirrorNodePostgresPodName,
      postgresNamespace,
      cpuInMillicores,
      memoryInMebibytes,
    );
  }

  public async logMetrics(
    snapshotName: string,
    metricsLogFile: string,
    namespace?: NamespaceName,
    labelSelector?: string,
    contexts?: Context[],
    events: string[] = [],
  ): Promise<void> {
    const aggregatedMetrics: AggregatedMetrics = await this.getMetrics(
      snapshotName,
      namespace,
      labelSelector,
      contexts,
      events,
    );

    fs.writeFileSync(`${metricsLogFile}.json`, aggregatedMetrics ? aggregatedMetrics.toString() : '');
  }

  private async getNetworkNodeRuntime(namespace: NamespaceName, context: Context): Promise<number> {
    if (!namespace) {
      return 0;
    }
    const kubectlArguments: string[] = ['get', 'pod', 'network-node1-0', '-n', namespace.name, '--no-headers'];
    if (context && context !== 'default') {
      kubectlArguments.push('--context', context);
    }
    const results: string[] = await new ShellRunner().run('kubectl', kubectlArguments, {
      verbose: true,
      commandProfile: SubprocessCommandProfile.KUBECTL,
      environmentVariablesToAppend: {
        PATH: `${this.installationDirectory}${path.delimiter}${SubprocessEnvironment.currentPath()}`,
      },
    });
    if (results?.length > 0) {
      const columns: string[] = results[0].trim().split(/\s+/);
      const cpuColumn: string | undefined = columns[4];
      if (cpuColumn) {
        return Number.parseInt(cpuColumn.split('m', 1)[0]);
      }
    }
    return 0;
  }

  private async getNetworkTransactions(
    namespace: NamespaceName,
    context: Context,
    postgresPodName: PodName,
  ): Promise<number> {
    if (!namespace || !postgresPodName) {
      this.logger.debug(
        `getNetworkTransactions skipped: namespace=${namespace?.name}, postgresPodName=${postgresPodName}`,
      );
      return 0;
    }

    try {
      const result: string = await this.k8Factory
        .getK8(context && context !== 'default' ? context : undefined)
        .containers()
        .readByRef(ContainerReference.of(PodReference.of(namespace, postgresPodName), ContainerName.of('postgresql')))
        .execContainer([
          'bash',
          '-c',
          "PGPASSWORD=$(cat $POSTGRES_PASSWORD_FILE) psql -U postgres -d mirror_node -c 'select count(*) from transaction;' -t",
        ]);
      return Number.parseInt(result.trim());
    } catch (error) {
      this.logger.warn(`error looking up transactions: ${error.message}`, error);
    }
    return 0;
  }
}
