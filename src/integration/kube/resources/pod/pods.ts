// SPDX-License-Identifier: Apache-2.0

import {type EphemeralContainerSpec} from './ephemeral-container-spec.js';
import {type NamespaceName} from '../../../../types/namespace/namespace-name.js';
import {type PodReference} from './pod-reference.js';
import {type Pod} from './pod.js';
import {type ContainerName} from '../container/container-name.js';
import {type PodMetricsItem} from './pod-metrics-item.js';

export interface Pods {
  /**
   * Get a pod by reference for running operations against.  You can use null if you only want to use stopPortForward()
   * @param podReference - the reference to the pod
   * @returns a pod object
   */
  readByReference(podReference: PodReference | null): Pod;

  /**
   * Get a pod by name
   * @returns Pod - pod object
   * @param podReference - the reference to the pod
   */
  read(podReference: PodReference): Promise<Pod>;

  /**
   * Get pods by labels
   * @param namespace - the namespace of the pod
   * @param labels - list of labels
   * @returns Pod[] - list of pod objects
   */
  list(namespace: NamespaceName, labels: string[]): Promise<Pod[]>;

  /**
   * Check if pod's ready status is true
   * @param namespace - namespace
   * @param [labels] - pod labels
   * @param [maxAttempts] - maximum attempts to check
   * @param [delay] - delay between checks in milliseconds
   * @param [createdAfter] - if provided, only pods created strictly after this date are considered
   * @param [excludeMarkedForDeletion] - if true, pods with deletionTimestamp are ignored
   */
  waitForReadyStatus(
    namespace: NamespaceName,
    labels: string[],
    maxAttempts?: number,
    delay?: number,
    createdAfter?: Date,
    excludeMarkedForDeletion?: boolean,
  ): Promise<Pod[]>;

  /**
   * Wait until a pod with the given reference appears in the Kubernetes API.
   *
   * Use this when the exact pod name is known. If the pod must be found by labels,
   * use {@link waitForReadyStatus}.
   *
   * @param podReference - exact reference of the pod to wait for
   * @param maxAttempts - maximum number of polling attempts (default 20)
   * @param delay - milliseconds to wait between attempts (default 3000)
   */
  waitForPodByReference(podReference: PodReference, maxAttempts?: number, delay?: number): Promise<void>;

  /**
   * Check if pod's phase is running
   * @param namespace - namespace
   * @param labels - pod labels
   * @param maxAttempts - maximum attempts to check
   * @param delay - delay between checks in milliseconds
   * @param [podItemPredicate] - pod item predicate
   * @param [createdAfter] - if provided, only pods created strictly after this date are considered
   * @param [excludeMarkedForDeletion] - if true, pods with deletionTimestamp are ignored
   */
  waitForRunningPhase(
    namespace: NamespaceName,
    labels: string[],
    maxAttempts: number,
    delay: number,
    podItemPredicate?: (items: Pod) => boolean,
    createdAfter?: Date,
    excludeMarkedForDeletion?: boolean,
  ): Promise<Pod[]>;

  /**
   * Wait until no pods remain for the given label selector in the namespace.
   * @param namespace - namespace
   * @param labels - pod labels
   * @param maxAttempts - maximum attempts to check
   * @param delay - delay between checks in milliseconds
   */
  waitForPodsToTerminate(
    namespace: NamespaceName,
    labels: string[],
    maxAttempts?: number,
    delay?: number,
  ): Promise<void>;

  /**
   * List all the pods across all namespaces with the given labels
   * @param labels - list of labels
   * @returns list of pods
   */
  listForAllNamespaces(labels: string[]): Promise<Pod[]>;

  /**
   * Create a pod
   * @param podReference - the reference to the pod
   * @param labels - list of label records where the key is the label name and the value is the label value
   * @param containerName - the name of the container
   * @param containerImage - the image of the container
   * @param containerCommand - the command to run in the container
   * @param startupProbeCommand - the command to run in the startup probe
   * @returns the pod that was created
   */
  create(
    podReference: PodReference,
    labels: Record<string, string>,
    containerName: ContainerName,
    containerImage: string,
    containerCommand: string[],
    startupProbeCommand: string[],
  ): Promise<Pod>;

  /**
   * Delete a pod by reference
   * @param podReference - the reference to the pod
   */
  delete(podReference: PodReference): Promise<void>;

  /**
   * Read logs for the given pod across all containers.
   * @param podReference - the reference to the pod
   * @param timestamps - include timestamps in output
   * @param previous - if true, get logs from the previous container instance (if it exists)
   * @returns logs as a single string
   */
  readLogs(podReference: PodReference, timestamps?: boolean, previous?: boolean): Promise<string>;

  /**
   * Build a describe-like textual report for a pod, including pod details and related events.
   * @param podReference - the reference to the pod
   * @returns describe-like output string
   */
  readDescribe(podReference: PodReference): Promise<string>;

  /**
   * Get CPU and memory usage for pods via the Kubernetes Metrics API (equivalent to `kubectl top pod`)
   * @param namespace - if provided, only get metrics for pods in this namespace; otherwise get metrics for all namespaces
   * @param labelSelector - if provided, only get metrics for pods matching this label selector
   * @returns list of pod metrics items with CPU (in millicores) and memory (in mebibytes)
   */
  topPods(namespace?: NamespaceName, labelSelector?: string): Promise<PodMetricsItem[]>;

  /**
   * Read logs for the given pod across all containers.
   * @param podReference - the reference to the pod
   * @param timestamps - include timestamps in output
   * @returns logs as a single string
   */
  readLogs(podReference: PodReference, timestamps?: boolean): Promise<string>;

  /**
   * Report whether the pod declares a volume with the given name in its spec.
   * @param podReference - the reference to the pod
   * @param volumeName - the pod-level volume name to look for
   * @returns true if the pod has a volume with that name, false otherwise
   */
  hasVolume(podReference: PodReference, volumeName: string): Promise<boolean>;

  /**
   * Attach an ephemeral (debug) container to a running pod and wait until it reports Running.
   * Enables reading or extracting files from a distroless target container that has no shell, by
   * sharing one of the pod's volumes with a helper image that does. Ephemeral containers cannot be
   * removed; they terminate when the pod does.
   * @param podReference - the pod to attach the ephemeral container to
   * @param ephemeralContainer - the ephemeral container specification (name, image, command, volumeMounts)
   * @param maxAttempts - maximum status-poll attempts before failing
   * @param delay - delay in milliseconds between status polls
   */
  addEphemeralContainer(
    podReference: PodReference,
    ephemeralContainer: EphemeralContainerSpec,
    maxAttempts?: number,
    delay?: number,
  ): Promise<void>;

  /**
   * Build a describe-like textual report for a pod, including pod details and related events.
   * @param podReference - the reference to the pod
   * @returns describe-like output string
   */
  readDescribe(podReference: PodReference): Promise<string>;

  detectFatalContainerError(pod: Pod): string | undefined;
}
