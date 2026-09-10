// SPDX-License-Identifier: Apache-2.0

import {
  type CoreV1Event,
  type CoreV1Api,
  type KubeConfig,
  Metrics,
  type PodMetricsList,
  V1Container,
  V1ExecAction,
  V1ObjectMeta,
  V1Pod,
  type V1PersistentVolumeClaimList,
  type V1PodList,
  V1PodSpec,
  V1Probe,
  type V1Volume,
} from '@kubernetes/client-node';
import {type Pods} from '../../../resources/pod/pods.js';
import {NamespaceName} from '../../../../../types/namespace/namespace-name.js';
import {PodReference} from '../../../resources/pod/pod-reference.js';
import {type Pod} from '../../../resources/pod/pod.js';
import {K8ClientPod} from './k8-client-pod.js';
import {Duration} from '../../../../../core/time/duration.js';
import {K8ClientBase} from '../../k8-client-base.js';
import {KubeError} from '../../../errors/kube-error.js';
import {KubeMissingArgumentError} from '../../../errors/kube-missing-argument-error.js';
import {KubePodNotFoundError} from '../../../errors/kube-pod-not-found-error.js';
import {KubePodNotReadyError} from '../../../errors/kube-pod-not-ready-error.js';
import {KubePodCreationFailedError} from '../../../errors/kube-pod-creation-failed-error.js';
import {KubePodReadinessFailedError} from '../../../errors/kube-pod-readiness-failed-error.js';
import {KubePodTerminationTimeoutError} from '../../../errors/kube-pod-termination-timeout-error.js';
import * as constants from '../../../../../core/constants.js';
import {type SoloLogger} from '../../../../../core/logging/solo-logger.js';
import {container} from 'tsyringe-neo';
import {type ContainerName} from '../../../resources/container/container-name.js';
import {PodName} from '../../../resources/pod/pod-name.js';
import {InjectTokens} from '../../../../../core/dependency-injection/inject-tokens.js';
import {KubeApiResponse} from '../../../kube-api-response.js';
import {ResourceOperation} from '../../../resources/resource-operation.js';
import {ResourceType} from '../../../resources/resource-type.js';
import {type PodMetricsItem} from '../../../resources/pod/pod-metrics-item.js';
import yaml from 'yaml';
import {sleep} from '../../../../../core/helpers.js';

export class K8ClientPods extends K8ClientBase implements Pods {
  /**
   * Waiting reasons for container states that are non-recoverable (image unavailable in registry,
   * or the container process has repeatedly crashed and will never restart cleanly on its own).
   */
  private static readonly FATAL_WAITING_REASONS: ReadonlySet<string> = new Set([
    'ImagePullBackOff',
    'ErrImagePull',
    'InvalidImageName',
    'ImageInspectError',
    'RegistryUnavailable',
    'CrashLoopBackOff',
  ]);

  /**
   * Terminated reasons for container states that are non-recoverable (e.g. out-of-memory kill).
   */
  private static readonly FATAL_TERMINATED_REASONS: ReadonlySet<string> = new Set(['OOMKilled']);

  /**
   * Event reasons that indicate a stuck volume attach/mount rather than an application-level
   * startup failure (e.g. a slow or stuck storage backend on the node).
   */
  private static readonly VOLUME_MOUNT_EVENT_REASONS: ReadonlySet<string> = new Set([
    'FailedMount',
    'FailedAttachVolume',
  ]);

  private static readonly FATAL_ERROR_RETRY_THRESHOLD: number = 3;

  /**
   * Higher retry allowance for the Docker Desktop containerd-socket error, which is a
   * transient race condition on macOS during Docker Desktop startup. Giving it more
   * attempts before we surface the actionable error message avoids false positives while
   * still failing fast when the socket is persistently unavailable.
   */
  private static readonly CONTAINERD_SOCKET_FATAL_THRESHOLD: number = 5;

  private static readonly NON_RECOVERABLE_IMAGE_PULL_PATTERNS: ReadonlyArray<RegExp> = [
    /not found/i,
    /manifest unknown/i,
    /pull access denied/i,
    /requested access to the resource is denied/i,
    /insufficient_scope/i,
    /unauthorized/i,
    /authentication required/i,
    /invalid reference format/i,
  ];

  /**
   * Patterns that identify a Docker Desktop containerd-socket error inside an
   * ImageInspectError message.  This occurs on macOS when the "Use containerd for
   * pulling and storing images" toggle is enabled in Docker Desktop settings.
   */
  private static readonly CONTAINERD_SOCKET_PATTERNS: ReadonlyArray<RegExp> = [
    /dial unix.*containerd\.sock.*connection refused/i,
    /containerd\.sock.*connection refused/i,
    /transport.*Error while dialing.*containerd/i,
    /rpc error.*Unavailable.*containerd/i,
  ];

  private readonly logger: SoloLogger;

  public static isContainerdSocketError(message?: string): boolean {
    if (!message) {
      return false;
    }
    return K8ClientPods.CONTAINERD_SOCKET_PATTERNS.some((pattern): boolean => pattern.test(message));
  }

  public constructor(
    private readonly kubeClient: CoreV1Api,
    private readonly kubeConfig: KubeConfig,
    private readonly kubectlInstallationDirectory: string,
  ) {
    super();
    this.logger = container.resolve(InjectTokens.SoloLogger);
  }

  /**
   * Inspect a Pod's container statuses for non-recoverable error states and return a descriptive
   * error message if one is detected, or undefined if no fatal error is present.
   *
   * Covered states:
   * - Waiting: ImagePullBackOff, ErrImagePull, InvalidImageName, ImageInspectError,
   *            RegistryUnavailable (image unavailable in registry)
   * - Terminated: OOMKilled (container killed due to out-of-memory)
   */
  public detectFatalContainerError(pod: Pod): string | undefined {
    const podName: string = pod.podReference?.name?.toString() ?? '<unknown>';

    for (const containerStatus of pod.allContainerStatuses ?? []) {
      if (containerStatus.waitingReason && K8ClientPods.FATAL_WAITING_REASONS.has(containerStatus.waitingReason)) {
        if (
          ['ErrImagePull', 'ImagePullBackOff', 'ImageInspectError'].includes(containerStatus.waitingReason) &&
          !K8ClientPods.isNonRecoverableImagePullError(containerStatus.waitingMessage)
        ) {
          if (
            containerStatus.waitingReason === 'ImageInspectError' &&
            K8ClientPods.isContainerdSocketError(containerStatus.waitingMessage)
          ) {
            const detail: string = containerStatus.waitingMessage ? `: ${containerStatus.waitingMessage}` : '';
            return (
              `Pod "${podName}" container "${containerStatus.name}" failed to inspect image due to a containerd socket error${detail}. ` +
              'This is likely caused by Docker Desktop\'s "Use containerd for pulling and storing images" setting. ' +
              'To fix: open Docker Desktop -> Settings -> General -> uncheck "Use containerd for pulling and storing images" -> restart Docker Desktop.'
            );
          }
          continue;
        }
        const detail: string = containerStatus.waitingMessage ? `: ${containerStatus.waitingMessage}` : '';
        return (
          `Pod "${podName}" container "${containerStatus.name}" is in a non-recoverable state: ` +
          `${containerStatus.waitingReason}${detail}`
        );
      }

      if (
        containerStatus.terminatedReason &&
        K8ClientPods.FATAL_TERMINATED_REASONS.has(containerStatus.terminatedReason)
      ) {
        return (
          `Pod "${podName}" container "${containerStatus.name}" was terminated due to: ` +
          `${containerStatus.terminatedReason} (exit code ${containerStatus.terminatedExitCode ?? 'unknown'})`
        );
      }
    }

    return undefined;
  }

  private static isNonRecoverableImagePullError(message?: string): boolean {
    if (!message) {
      return false;
    }
    return K8ClientPods.NON_RECOVERABLE_IMAGE_PULL_PATTERNS.some((pattern): boolean => pattern.test(message));
  }

  /**
   * Best-effort diagnostic for a pod that never reached the required state: inspects the
   * PersistentVolumeClaims the pod depends on and any FailedMount/FailedAttachVolume events, so a
   * stuck or slow volume attach/mount (e.g. an mdadm-backed storage class with variable RAID
   * resync latency) is distinguishable from a generic readiness timeout. Returns undefined when
   * the pod has no PVC-backed volumes or nothing anomalous is found.
   */
  private async buildVolumeMountDiagnostic(
    namespace: NamespaceName,
    pod: V1Pod | undefined,
  ): Promise<string | undefined> {
    const claimNames: string[] = (pod?.spec?.volumes ?? [])
      .map((volume: V1Volume): string | undefined => volume.persistentVolumeClaim?.claimName)
      .filter(Boolean);

    if (claimNames.length === 0) {
      return undefined;
    }

    const diagnosticParts: string[] = [];

    try {
      const pvcList: V1PersistentVolumeClaimList = await this.kubeClient.listNamespacedPersistentVolumeClaim({
        namespace: namespace.name,
      });
      for (const pvc of pvcList.items ?? []) {
        const pvcName: string = pvc.metadata?.name ?? '';
        const phase: string = pvc.status?.phase ?? 'Unknown';
        if (claimNames.includes(pvcName) && phase !== 'Bound') {
          diagnosticParts.push(`PVC "${pvcName}" is ${phase}`);
        }
      }
    } catch {
      // best-effort diagnostic only; a PVC lookup failure must not mask the original readiness timeout
    }

    try {
      const eventList: {items?: CoreV1Event[]} = await this.kubeClient.listNamespacedEvent({
        namespace: namespace.name,
      });
      const relevantNames: ReadonlySet<string> = new Set([pod?.metadata?.name ?? '', ...claimNames]);
      const volumeEvents: CoreV1Event[] = (eventList.items ?? []).filter(
        (event: CoreV1Event): boolean =>
          K8ClientPods.VOLUME_MOUNT_EVENT_REASONS.has(event.reason ?? '') &&
          relevantNames.has(event.involvedObject?.name ?? ''),
      );
      const latestEvent: CoreV1Event | undefined = volumeEvents.at(-1);
      if (latestEvent) {
        diagnosticParts.push(`event ${latestEvent.reason}: ${latestEvent.message ?? ''}`);
      }
    } catch {
      // best-effort diagnostic only; an event lookup failure must not mask the original readiness timeout
    }

    return diagnosticParts.length > 0 ? diagnosticParts.join('; ') : undefined;
  }

  public readByReference(podReference: PodReference | null): Pod {
    return new K8ClientPod(podReference, this, this.kubeClient, this.kubeConfig, this.kubectlInstallationDirectory);
  }

  public async read(podReference: PodReference): Promise<Pod> {
    const ns: NamespaceName = podReference.namespace;
    const fieldSelector: string = `metadata.name=${podReference.name}`;

    const resp: V1PodList = await this.kubeClient.listNamespacedPod({
      namespace: ns.name,
      fieldSelector,
      timeoutSeconds: Duration.ofMinutes(5).toMillis(),
    });

    return K8ClientPod.fromV1Pod(
      this.filterItem(resp.items, {name: podReference.name.toString()}),
      this,
      this.kubeClient,
      this.kubeConfig,
      this.kubectlInstallationDirectory,
    );
  }

  public async list(namespace: NamespaceName, labels: string[]): Promise<Pod[]> {
    const labelSelector: string = labels ? labels.join(',') : undefined;

    const result: V1PodList = await this.kubeClient.listNamespacedPod({
      namespace: namespace.name,
      labelSelector,
      timeoutSeconds: Duration.ofMinutes(5).toMillis(),
    });

    const sortedItems: V1Pod[] = result?.items
      ? // eslint-disable-next-line unicorn/no-array-sort
        [...result.items].sort(
          (a, b): number =>
            new Date(b.metadata?.creationTimestamp || 0).getTime() -
            new Date(a.metadata?.creationTimestamp || 0).getTime(),
        )
      : [];

    return sortedItems.map((item: V1Pod): Pod =>
      K8ClientPod.fromV1Pod(item, this, this.kubeClient, this.kubeConfig, this.kubectlInstallationDirectory),
    );
  }

  public async waitForReadyStatus(
    namespace: NamespaceName,
    labels: string[],
    maxAttempts: number = 10,
    delay: number = 500,
    createdAfter?: Date,
    excludeMarkedForDeletion: boolean = false,
  ): Promise<Pod[]> {
    const podReadyCondition: Map<string, string> = new Map<string, string>().set(
      constants.POD_CONDITION_READY,
      constants.POD_CONDITION_STATUS_TRUE,
    );

    try {
      return await this.waitForPodConditions(
        namespace,
        podReadyCondition,
        labels,
        maxAttempts,
        delay,
        createdAfter,
        excludeMarkedForDeletion,
      );
    } catch (error: Error | unknown) {
      const errorMessage: string = error instanceof Error ? error.message : String(error);
      this.logger.showUser(`Pod readiness check failed: ${errorMessage}`);
      // Wrap readiness failures in a dedicated error so CI reviewers can see the
      // namespace/label selector that was being waited on while still preserving
      // the underlying fatal pod cause for image-pull/startup debugging.
      throw new KubePodReadinessFailedError(namespace.name, labels, error);
    }
  }

  /**
   * Wait until the pod identified by `podReference` appears in the Kubernetes API.
   *
   * Use this when the exact pod name is known. If the pod must be discovered by labels,
   * use {@link waitForReadyStatus} with an appropriate label selector instead.
   *
   * @param podReference - exact reference of the pod to wait for
   * @param maxAttempts - maximum polling attempts before throwing (default 20 × 3 s = 60 s)
   * @param delay - milliseconds between attempts (default 3000)
   */
  public async waitForPodByReference(
    podReference: PodReference,
    maxAttempts: number = 20,
    delay: number = 3000,
  ): Promise<void> {
    const podName: string = podReference.name.toString();
    for (let attempt: number = 1; attempt <= maxAttempts; attempt++) {
      const pod: Pod = await this.read(podReference);
      if (pod) {
        return;
      }
      this.logger.debug(
        `waitForPodByReference: pod ${podName} not yet visible in API, attempt ${attempt}/${maxAttempts}`,
      );
      await sleep(Duration.ofMillis(delay));
    }
    throw new KubePodNotFoundError(podName);
  }

  /**
   * Check pods for conditions
   * @param namespace - namespace
   * @param conditionsMap - a map of conditions and values
   * @param [labels] - pod labels
   * @param [maxAttempts] - maximum attempts to check
   * @param [delay] - delay between checks in milliseconds
   * @param [createdAfter] - if provided, only pods created strictly after this date are considered
   * @param [excludeMarkedForDeletion] - if true, pods with deletionTimestamp are ignored
   */
  private async waitForPodConditions(
    namespace: NamespaceName,
    conditionsMap: Map<string, string>,
    labels: string[] = [],
    maxAttempts: number = 10,
    delay: number = 500,
    createdAfter?: Date,
    excludeMarkedForDeletion: boolean = false,
  ): Promise<Pod[]> {
    if (!conditionsMap || conditionsMap.size === 0) {
      throw new KubeMissingArgumentError('pod conditions are required');
    }

    return await this.waitForRunningPhase(
      namespace,
      labels,
      maxAttempts,
      delay,
      (pod): boolean => {
        if (pod.conditions?.length > 0) {
          for (const cond of pod.conditions) {
            for (const entry of conditionsMap.entries()) {
              const condType: string = entry[0];
              const condStatus: string = entry[1];
              if (cond.type === condType && cond.status === condStatus) {
                this.logger.info(
                  `Pod condition met for ${pod.podReference.name.name} [type: ${cond.type} status: ${cond.status}]`,
                );
                return true;
              }
            }
          }
        }
        // condition not found
        return false;
      },
      createdAfter,
      excludeMarkedForDeletion,
    );
  }

  public async waitForRunningPhase(
    namespace: NamespaceName,
    labels: string[],
    maxAttempts: number,
    delay: number,
    podItemPredicate?: (items: Pod) => boolean,
    createdAfter?: Date,
    excludeMarkedForDeletion: boolean = false,
  ): Promise<Pod[]> {
    const phases: Set<string> = new Set([constants.POD_PHASE_RUNNING]);
    const labelSelector: string = labels ? labels.join(',') : undefined;

    this.logger.info(
      `waitForRunningPhase [labelSelector: ${labelSelector}, namespace:${namespace.name}, maxAttempts: ${maxAttempts}]`,
    );

    return new Promise<Pod[]>((resolve, reject): void => {
      let attempts: number = 0;
      // Newest eligible pod seen on the most recent successful list, so a timeout can report
      // "found but never ready" instead of the misleading "no pod found".
      let lastObservedPod: Pod | undefined;
      // Raw pod alongside lastObservedPod, kept only for its spec.volumes (the Pod wrapper does
      // not retain it) so a timeout can inspect which PVCs the pod depends on.
      let lastObservedRawPod: V1Pod | undefined;
      const fatalErrorStreakByPod: Map<string, {count: number; error: string}> = new Map<
        string,
        {count: number; error: string}
      >();

      const check: (resolve: (items: Pod[]) => void, reject: (reason?: Error) => void) => Promise<void> = async (
        resolve: (items: Pod[]) => void,
        reject: (reason?: Error) => void,
      ): Promise<void> => {
        // wait for the pod to be available with the given status and labels
        try {
          const response: V1PodList = await this.kubeClient.listNamespacedPod({
            namespace: namespace.name,
            labelSelector,
            timeoutSeconds: Duration.ofMinutes(5).toMillis(),
          });

          this.logger.debug(
            `[attempt: ${attempts}/${maxAttempts}] ${response.items?.length} pod(s) found [labelSelector: ${labelSelector}, namespace:${namespace.name}]`,
          );

          if (response.items?.length > 0) {
            // Sort pods by creation timestamp descending (newest first)
            // eslint-disable-next-line unicorn/no-array-sort
            const sortedItems: V1Pod[] = [...response.items].sort((a, b): number => {
              const aTime: number = a.metadata?.creationTimestamp?.getTime() || 0;
              const bTime: number = b.metadata?.creationTimestamp?.getTime() || 0;
              return bTime - aTime;
            });

            // When a createdAfter cutoff is provided, skip pods that existed before the
            // cutoff (e.g. a terminating predecessor from a recreate migration).
            // Kubernetes stores creationTimestamp at second precision (sub-second part is
            // always 0). A millisecond-precision cutoff would silently exclude a replacement
            // pod created in the same second; floor to the second boundary minus 1 ms so
            // any pod timestamped at or after that second is treated as eligible.
            const createdAfterThreshold: number = createdAfter
              ? Math.floor(createdAfter.getTime() / 1000) * 1000 - 1
              : 0;
            const createdAfterEligibleItems: V1Pod[] = createdAfter
              ? sortedItems.filter(
                  (pod): boolean => (pod.metadata?.creationTimestamp?.getTime() || 0) > createdAfterThreshold,
                )
              : sortedItems;

            const eligibleItems: V1Pod[] = excludeMarkedForDeletion
              ? createdAfterEligibleItems.filter((pod): boolean => !pod.metadata?.deletionTimestamp)
              : createdAfterEligibleItems;
            // Allow transient startup states to recover; only fail after repeated fatal detections.
            for (const item of eligibleItems) {
              const pod: Pod = K8ClientPod.fromV1Pod(
                item,
                this,
                this.kubeClient,
                this.kubeConfig,
                this.kubectlInstallationDirectory,
              );
              const fatalError: string | undefined = this.detectFatalContainerError(pod);
              const podName: string = pod.podReference?.name?.toString() ?? '<unknown>';
              if (fatalError) {
                const previous: {count: number; error: string} | undefined = fatalErrorStreakByPod.get(podName);
                const nextCount: number = previous?.error === fatalError ? previous.count + 1 : 1;
                fatalErrorStreakByPod.set(podName, {count: nextCount, error: fatalError});

                // Use a higher threshold for containerd socket errors to tolerate transient
                // Docker Desktop startup races on macOS before surfacing the actionable hint.
                const threshold: number = K8ClientPods.isContainerdSocketError(fatalError)
                  ? K8ClientPods.CONTAINERD_SOCKET_FATAL_THRESHOLD
                  : K8ClientPods.FATAL_ERROR_RETRY_THRESHOLD;

                if (nextCount >= threshold) {
                  return reject(new KubePodCreationFailedError(fatalError));
                }

                this.logger.info(`Detected fatal pod state for "${podName}" (${nextCount}/${threshold}); retrying`);
              } else {
                fatalErrorStreakByPod.delete(podName);
              }
            }

            if (eligibleItems.length > 0) {
              // Only check the newest eligible pod
              const newestItem: V1Pod = eligibleItems[0];
              const pod: Pod = K8ClientPod.fromV1Pod(
                newestItem,
                this,
                this.kubeClient,
                this.kubeConfig,
                this.kubectlInstallationDirectory,
              );
              lastObservedPod = pod;
              lastObservedRawPod = newestItem;
              if (phases.has(newestItem.status?.phase) && (!podItemPredicate || podItemPredicate(pod))) {
                return resolve([pod]);
              }
            }
          }
        } catch (error) {
          this.logger.info('Error occurred while waiting for pods, retrying', error);
        }

        if (++attempts < maxAttempts) {
          setTimeout((): Promise<void> => check(resolve, reject), delay);
        } else if (lastObservedPod) {
          const volumeMountDiagnostic: string | undefined = await this.buildVolumeMountDiagnostic(
            namespace,
            lastObservedRawPod,
          );
          return reject(
            new KubePodNotReadyError(
              `labels:${labelSelector}`,
              lastObservedPod.podReference?.name?.toString() ?? '<unknown>',
              lastObservedPod.phase,
              lastObservedPod.allContainerStatuses ?? [],
              volumeMountDiagnostic,
            ),
          );
        } else {
          return reject(new KubePodNotFoundError(`labels:${labelSelector}`));
        }
      };

      check(resolve, reject);
    });
  }

  public async waitForPodsToTerminate(
    namespace: NamespaceName,
    labels: string[],
    maxAttempts: number = constants.PODS_RUNNING_MAX_ATTEMPTS,
    delay: number = constants.PODS_RUNNING_DELAY,
  ): Promise<void> {
    for (let attempt: number = 1; attempt <= maxAttempts; attempt++) {
      const pods: Pod[] = await this.list(namespace, labels);
      if (pods.length === 0) {
        return;
      }

      const podNames: string = pods.map((pod: Pod): string => pod.podReference.name.toString()).join(', ');
      this.logger.debug(
        `waitForPodsToTerminate [attempt ${attempt}/${maxAttempts}] [namespace=${namespace.name}] [labels=${labels.join(', ')}] [pods=${podNames}]`,
      );
      if (attempt < maxAttempts) {
        await sleep(Duration.ofMillis(delay));
      }
    }

    throw new KubePodTerminationTimeoutError(namespace.name, labels);
  }

  public async listForAllNamespaces(labels: string[]): Promise<Pod[]> {
    const labelSelector: string = labels ? labels.join(',') : undefined;
    const pods: Pod[] = [];

    try {
      const response: V1PodList = await this.kubeClient.listPodForAllNamespaces({labelSelector});

      if (response?.items?.length > 0) {
        for (const item of response.items) {
          pods.push(
            new K8ClientPod(
              PodReference.of(NamespaceName.of(item.metadata?.namespace), PodName.of(item.metadata?.name)),
              this,
              this.kubeClient,
              this.kubeConfig,
              this.kubectlInstallationDirectory,
            ),
          );
        }
      }
    } catch (error) {
      KubeApiResponse.throwError(error, ResourceOperation.LIST, ResourceType.POD, undefined, '');
    }

    return pods;
  }

  public async create(
    podReference: PodReference,
    labels: Record<string, string>,
    containerName: ContainerName,
    containerImage: string,
    containerCommand: string[],
    startupProbeCommand: string[],
  ): Promise<Pod> {
    const v1Metadata: V1ObjectMeta = new V1ObjectMeta();
    v1Metadata.name = podReference.name.toString();
    v1Metadata.namespace = podReference.namespace.toString();
    v1Metadata.labels = labels;

    const v1ExecAction: V1ExecAction = new V1ExecAction();
    v1ExecAction.command = startupProbeCommand;

    const v1Probe: V1Probe = new V1Probe();
    v1Probe.exec = v1ExecAction;

    const v1Container: V1Container = new V1Container();
    v1Container.name = containerName.name;
    v1Container.image = containerImage;
    v1Container.command = containerCommand;
    v1Container.startupProbe = v1Probe;

    const v1Spec: V1PodSpec = new V1PodSpec();
    v1Spec.containers = [v1Container];

    const v1Pod: V1Pod = new V1Pod();
    v1Pod.metadata = v1Metadata;
    v1Pod.spec = v1Spec;

    let result: V1Pod;
    try {
      result = await this.kubeClient.createNamespacedPod({namespace: podReference.namespace.toString(), body: v1Pod});
    } catch (error) {
      if (error instanceof KubeError) {
        throw error;
      }
      KubeApiResponse.throwError(
        error,
        ResourceOperation.CREATE,
        ResourceType.POD,
        podReference.namespace,
        podReference.name.toString(),
      );
    }

    if (result) {
      return new K8ClientPod(podReference, this, this.kubeClient, this.kubeConfig, this.kubectlInstallationDirectory);
    } else {
      throw new KubePodCreationFailedError(result);
    }
  }

  public async delete(podReference: PodReference): Promise<void> {
    try {
      await this.kubeClient.deleteNamespacedPod({
        namespace: podReference.namespace.toString(),
        name: podReference.name.toString(),
      });
    } catch (error) {
      KubeApiResponse.throwError(
        error,
        ResourceOperation.DELETE,
        ResourceType.POD,
        podReference.namespace,
        podReference.name.toString(),
      );
    }
  }

  public async readLogs(
    podReference: PodReference,
    timestamps: boolean = true,
    previous: boolean = false,
  ): Promise<string> {
    const namespace: string = podReference.namespace.toString();
    const name: string = podReference.name.toString();
    const pod: V1Pod = await this.kubeClient.readNamespacedPod({name, namespace});
    const containerNames: string[] = [
      ...(pod.spec?.initContainers?.map((container: V1Container): string => container.name) ?? []),
      ...(pod.spec?.containers?.map((container: V1Container): string => container.name) ?? []),
      ...(pod.spec?.ephemeralContainers?.map((container: V1Container): string => container.name) ?? []),
    ].filter(Boolean);

    if (containerNames.length === 0) {
      const log: string = await this.kubeClient.readNamespacedPodLog({
        name,
        namespace,
        timestamps,
        previous,
      });
      return log ?? '';
    }

    const containerLogs: string[] = [];
    for (const containerName of containerNames) {
      try {
        const containerLog: string = await this.kubeClient.readNamespacedPodLog({
          name,
          namespace,
          container: containerName,
          timestamps,
          previous,
        });
        containerLogs.push(`===== Container: ${containerName} =====\n${containerLog ?? ''}`.trimEnd());
      } catch (error) {
        containerLogs.push(
          `===== Container: ${containerName} =====\nFailed to read logs: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    return containerLogs.join('\n\n');
  }

  public async readDescribe(podReference: PodReference): Promise<string> {
    const namespace: string = podReference.namespace.toString();
    const name: string = podReference.name.toString();
    const pod: V1Pod = await this.kubeClient.readNamespacedPod({name, namespace});
    const events: {items?: CoreV1Event[]} = await this.kubeClient.listNamespacedEvent({
      namespace,
      fieldSelector: `involvedObject.name=${name},involvedObject.namespace=${namespace}`,
    });

    // eslint-disable-next-line unicorn/no-array-sort
    const sortedEvents: CoreV1Event[] = [...(events?.items ?? [])].sort((left, right): number => {
      const leftTime: number = new Date(
        left.lastTimestamp ?? left.eventTime ?? left.firstTimestamp ?? left.metadata?.creationTimestamp ?? 0,
      ).getTime();
      const rightTime: number = new Date(
        right.lastTimestamp ?? right.eventTime ?? right.firstTimestamp ?? right.metadata?.creationTimestamp ?? 0,
      ).getTime();
      return leftTime - rightTime;
    });

    const describeData: {pod: V1Pod; events: typeof sortedEvents} = {
      pod,
      events: sortedEvents,
    };

    return yaml.stringify(describeData);
  }

  public async topPods(namespace?: NamespaceName, labelSelector?: string): Promise<PodMetricsItem[]> {
    const metrics: Metrics = new Metrics(this.kubeConfig);
    const podMetricsList: PodMetricsList = await metrics.getPodMetrics(namespace?.name);

    let allowedPodKeys: Set<string> | undefined;
    if (labelSelector) {
      const podList: V1PodList = namespace
        ? await this.kubeClient.listNamespacedPod({
            namespace: namespace.name,
            labelSelector,
            timeoutSeconds: Duration.ofMinutes(5).toMillis(),
          })
        : await this.kubeClient.listPodForAllNamespaces({labelSelector});
      allowedPodKeys = new Set(
        podList.items.map((p): string => `${p.metadata?.namespace ?? ''}/${p.metadata?.name ?? ''}`),
      );
    }

    return podMetricsList.items
      .filter((podMetric): boolean => {
        if (!allowedPodKeys) {
          return true;
        }
        return allowedPodKeys.has(`${podMetric.metadata.namespace}/${podMetric.metadata.name}`);
      })
      .map((podMetric): PodMetricsItem => {
        let cpuInMillicores: number = 0;
        let memoryInMebibytes: number = 0;
        for (const c of podMetric.containers) {
          cpuInMillicores += K8ClientPods.parseMillicores(c.usage.cpu);
          memoryInMebibytes += K8ClientPods.parseMebibytes(c.usage.memory);
        }
        return {
          namespace: NamespaceName.of(podMetric.metadata.namespace),
          podName: PodName.of(podMetric.metadata.name),
          cpuInMillicores,
          memoryInMebibytes,
        };
      });
  }

  /**
   * Parse a Kubernetes CPU quantity string into millicores.
   * Examples: "100m" -> 100, "1" -> 1000, "0.5" -> 500, "100000n" -> 0 (rounded)
   */
  private static parseMillicores(quantity: string): number {
    if (!quantity) {
      return 0;
    }
    if (quantity.endsWith('n')) {
      return Math.round(Number.parseInt(quantity.slice(0, -1), 10) / 1_000_000);
    }
    if (quantity.endsWith('u')) {
      return Math.round(Number.parseInt(quantity.slice(0, -1), 10) / 1000);
    }
    if (quantity.endsWith('m')) {
      return Number.parseInt(quantity.slice(0, -1), 10);
    }
    return Math.round(Number.parseFloat(quantity) * 1000);
  }

  /**
   * Parse a Kubernetes memory quantity string into mebibytes (MiB).
   * Examples: "50Mi" -> 50, "1Gi" -> 1024, "52428800" -> 50, "512Ki" -> 0 (rounded)
   */
  private static parseMebibytes(quantity: string): number {
    if (!quantity) {
      return 0;
    }
    if (quantity.endsWith('Ki')) {
      return Math.round(Number.parseInt(quantity.slice(0, -2), 10) / 1024);
    }
    if (quantity.endsWith('Mi')) {
      return Number.parseInt(quantity.slice(0, -2), 10);
    }
    if (quantity.endsWith('Gi')) {
      return Number.parseInt(quantity.slice(0, -2), 10) * 1024;
    }
    if (quantity.endsWith('Ti')) {
      return Number.parseInt(quantity.slice(0, -2), 10) * 1024 * 1024;
    }
    if (quantity.endsWith('Pi')) {
      return Number.parseInt(quantity.slice(0, -2), 10) * 1024 * 1024 * 1024;
    }
    if (quantity.endsWith('k')) {
      return Math.round((Number.parseInt(quantity.slice(0, -1), 10) * 1000) / (1024 * 1024));
    }
    if (quantity.endsWith('M')) {
      return Math.round((Number.parseInt(quantity.slice(0, -1), 10) * 1_000_000) / (1024 * 1024));
    }
    if (quantity.endsWith('G')) {
      return Math.round((Number.parseInt(quantity.slice(0, -1), 10) * 1_000_000_000) / (1024 * 1024));
    }
    // Plain number (bytes)
    return Math.round(Number.parseFloat(quantity) / (1024 * 1024));
  }
}
