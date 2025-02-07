/**
 * SPDX-License-Identifier: Apache-2.0
 */
import {type V1Pod} from '@kubernetes/client-node';
import {type NamespaceName} from './namespace_name.js';
import {type PodRef} from './pod_ref.js';
import {type Pod} from './pod.js';

export interface Pods {
  /**
   * Get a pod by reference for running operations against
   * @param podRef - the reference to the pod
   * @returns a pod object
   */
  readByRef(podRef: PodRef): Pod;

  /**
   * Get a pod by name
   * @returns V1Pod - pod object
   * @param podRef - the reference to the pod
   */
  readByName(podRef: PodRef): Promise<V1Pod>; // TODO was getPodByName

  /**
   * Get pods by labels
   * @param namespace - the namespace of the pod
   * @param labels - list of labels
   * @returns V1Pod[] - list of pod objects
   */
  readManyByLabel(namespace: NamespaceName, labels: string[]): Promise<V1Pod[]>; // TODO was getPodsByLabel

  /**
   * Check if pod's ready status is true
   * @param namespace - namespace
   * @param [labels] - pod labels
   * @param [maxAttempts] - maximum attempts to check
   * @param [delay] - delay between checks in milliseconds
   */
  waitForReadyStatus(namespace: NamespaceName, labels: string[], maxAttempts: number, delay: number): Promise<V1Pod[]>; // TODO was waitForPodReady

  /**
   * Check if pod's phase is running
   * @param namespace - namespace
   * @param labels - pod labels
   * @param podCount - number of pod expected
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
  ): Promise<V1Pod[]>; // TODO was waitForPods - make waitForProds private and call with method that supplies running phase

  /**
   * List all the pods across all namespaces with the given labels
   * @param labels - list of labels
   * @returns list of pods
   */
  listForAllNamespaces(labels: string[]): Promise<Pod[]>;
}
