/**
 * SPDX-License-Identifier: Apache-2.0
 */
import {type V1Pod} from '@kubernetes/client-node';

export default interface Pods {
  readByName(name: string): Promise<V1Pod>; // TODO was getPodByName
  readManyByLabel(labels: string[]): Promise<V1Pod[]>; // TODO was getPodsByLabel
  waitForReadyStatus(
    labels: string[],
    podCount: number,
    maxAttempts: number,
    delay: number,
    namespace?: string,
  ): Promise<V1Pod[]>; // TODO was waitForPodReady
  waitForRunningPhase(
    phases: string[],
    labels: string[],
    podCount: number,
    maxAttempts: number,
    delay: number,
    podItemPredicate?: (items: V1Pod) => boolean,
    namespace?: string,
  ): Promise<V1Pod[]>; // TODO was waitForPods - make waitForProds private and call with method that supplies running phase
}
