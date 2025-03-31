// SPDX-License-Identifier: Apache-2.0

import {type NamespaceName} from '../namespace/namespace-name.js';
import {type PodReference as PodReference} from './pod-reference.js';
import {type Pod} from './pod.js';
import {type ContainerName} from '../container/container-name.js';

export interface Pods {
  /**
   * Get a pod by reference for running operations against.  You can use null if you only want to use stopPortForward()
   * @param podReference - the reference to the pod
   * @returns a pod object
   */
  readByReference(podReference: PodReference): Pod;

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
   */
  waitForReadyStatus(namespace: NamespaceName, labels: string[], maxAttempts?: number, delay?: number): Promise<Pod[]>;

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
    podItemPredicate?: (items: Pod) => boolean,
  ): Promise<Pod[]>;

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
}
