/**
 * SPDX-License-Identifier: Apache-2.0
 */
import {type V1Pod} from '@kubernetes/client-node';
import {type NamespaceName} from './namespace_name.js';
import {type PodName} from './pod_name.js';

export interface Pods {
  /**
   * Get a pod by name
   * @param namespace - the namespace of the pod
   * @param name - podName name
   * @returns V1Pod - pod object
   */
  readByName(namespace: NamespaceName, name: PodName): Promise<V1Pod>; // TODO was getPodByName

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
   * @param [podCount] - number of pod expected
   * @param [maxAttempts] - maximum attempts to check
   * @param [delay] - delay between checks in milliseconds
   */
  waitForReadyStatus(
    namespace: NamespaceName,
    labels: string[],
    podCount: number,
    maxAttempts: number,
    delay: number,
  ): Promise<V1Pod[]>; // TODO was waitForPodReady

  /**
   * Check if pod's phase is running
   * @param namespace - namespace
   * @param phases - list of phases
   * @param labels - pod labels
   * @param podCount - number of pod expected
   * @param maxAttempts - maximum attempts to check
   * @param delay - delay between checks in milliseconds
   * @param [podItemPredicate] - pod item predicate
   */
  waitForRunningPhase(
    namespace: NamespaceName,
    phases: string[],
    labels: string[],
    podCount: number,
    maxAttempts: number,
    delay: number,
    podItemPredicate?: (items: V1Pod) => boolean,
  ): Promise<V1Pod[]>; // TODO was waitForPods - make waitForProds private and call with method that supplies running phase
}
