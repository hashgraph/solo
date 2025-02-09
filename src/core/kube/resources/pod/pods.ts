/**
 * SPDX-License-Identifier: Apache-2.0
 */
import {type V1Pod} from '@kubernetes/client-node';
import {type NamespaceName} from '../namespace/namespace_name.js';
import {type PodRef} from '../pod/pod_ref.js';
import {type Pod} from '../pod/pod.js';
import {type ContainerName} from '../../resources/container/container_name.js';

export interface Pods {
  /**
   * Get a pod by reference for running operations against.  You can use null if you only want to use stopPortForward()
   * @param podRef - the reference to the pod
   * @returns a pod object
   */
  readByRef(podRef: PodRef): Pod;

  /**
   * Get a pod by name
   * @returns V1Pod - pod object
   * @param podRef - the reference to the pod
   */
  read(podRef: PodRef): Promise<V1Pod>;

  /**
   * Get pods by labels
   * @param namespace - the namespace of the pod
   * @param labels - list of labels
   * @returns V1Pod[] - list of pod objects
   */
  list(namespace: NamespaceName, labels: string[]): Promise<V1Pod[]>;

  /**
   * Check if pod's ready status is true
   * @param namespace - namespace
   * @param [labels] - pod labels
   * @param [maxAttempts] - maximum attempts to check
   * @param [delay] - delay between checks in milliseconds
   */
  waitForReadyStatus(
    namespace: NamespaceName,
    labels: string[],
    maxAttempts?: number,
    delay?: number,
  ): Promise<V1Pod[]>;

  /**
   * Check if pod's phase is running
   * @param namespace - namespace
   * @param labels - pod labels
   * @param maxAttempts - maximum attempts to check
   * @param delay - delay between checks in milliseconds
   * @param [podItemPredicate] - pod item predicate
   */
  waitForRunningPhase(
    namespace: NamespaceName,
    labels: string[],
    maxAttempts: number,
    delay: number,
    podItemPredicate?: (items: V1Pod) => boolean,
  ): Promise<V1Pod[]>;

  /**
   * List all the pods across all namespaces with the given labels
   * @param labels - list of labels
   * @returns list of pods
   */
  listForAllNamespaces(labels: string[]): Promise<Pod[]>;

  /**
   * Create a pod
   * @param podRef - the reference to the pod
   * @param labels - list of label records where the key is the label name and the value is the label value
   * @param containerName - the name of the container
   * @param containerImage - the image of the container
   * @param containerCommand - the command to run in the container
   * @param startupProbeCommand - the command to run in the startup probe
   * @returns the pod that was created
   */
  create(
    podRef: PodRef,
    labels: Record<string, string>,
    containerName: ContainerName,
    containerImage: string,
    containerCommand: string[],
    startupProbeCommand: string[],
  ): Promise<Pod>;
}
