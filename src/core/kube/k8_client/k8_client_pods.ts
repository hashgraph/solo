/**
 * SPDX-License-Identifier: Apache-2.0
 */
import {type KubeConfig, type CoreV1Api, type V1Pod} from '@kubernetes/client-node';
import {type Pods} from '../pods.js';
import {type NamespaceName} from '../namespace_name.js';
import {type PodRef} from '../pod_ref.js';
import {type Pod} from '../pod.js';
import {K8ClientPod} from './k8_client_pod.js';
import {Duration} from '../../time/duration.js';
import {K8ClientBase} from './k8_client_base.js';
import {MissingArgumentError, SoloError} from '../../errors.js';
import * as constants from '../../constants.js';
import {SoloLogger} from '../../logging.js';
import {container} from 'tsyringe-neo';

export class K8ClientPods extends K8ClientBase implements Pods {
  private readonly logger: SoloLogger;

  constructor(
    private readonly kubeClient: CoreV1Api,
    private readonly kubeConfig: KubeConfig,
  ) {
    super();
    this.logger = container.resolve(SoloLogger);
  }

  public readByRef(podRef: PodRef): Pod {
    return new K8ClientPod(podRef, this, this.kubeClient, this.kubeConfig);
  }

  public async readByName(podRef: PodRef): Promise<V1Pod> {
    const ns = podRef.namespaceName;
    const fieldSelector = `metadata.name=${podRef.podName.name}`;

    const resp = await this.kubeClient.listNamespacedPod(
      ns.name,
      undefined,
      undefined,
      undefined,
      fieldSelector,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      Duration.ofMinutes(5).toMillis(),
    );

    return this.filterItem(resp.body.items, {name: podRef.podName.name});
  }

  public async readManyByLabel(namespace: NamespaceName, labels: string[]): Promise<V1Pod[]> {
    const labelSelector = labels.join(',');

    const result = await this.kubeClient.listNamespacedPod(
      namespace.name,
      undefined,
      undefined,
      undefined,
      undefined,
      labelSelector,
      undefined,
      undefined,
      undefined,
      undefined,
      Duration.ofMinutes(5).toMillis(),
    );

    return result.body.items;
  }

  public async waitForReadyStatus(
    namespace: NamespaceName,
    labels: string[],
    maxAttempts: number,
    delay: number,
  ): Promise<V1Pod[]> {
    const podReadyCondition = new Map<string, string>().set(
      constants.POD_CONDITION_READY,
      constants.POD_CONDITION_STATUS_TRUE,
    );

    try {
      return await this.waitForPodConditions(namespace, podReadyCondition, labels, maxAttempts, delay);
    } catch (e: Error | unknown) {
      throw new SoloError(`Pod not ready [maxAttempts = ${maxAttempts}]`, e);
    }
  }

  /**
   * Check pods for conditions
   * @param namespace - namespace
   * @param conditionsMap - a map of conditions and values
   * @param [labels] - pod labels
   * @param [maxAttempts] - maximum attempts to check
   * @param [delay] - delay between checks in milliseconds
   */
  private async waitForPodConditions(
    namespace: NamespaceName,
    conditionsMap: Map<string, string>,
    labels: string[] = [],
    maxAttempts = 10,
    delay = 500,
  ) {
    if (!conditionsMap || conditionsMap.size === 0) throw new MissingArgumentError('pod conditions are required');

    return await this.waitForRunningPhase(namespace, labels, maxAttempts, delay, pod => {
      if (pod.status?.conditions?.length > 0) {
        for (const cond of pod.status.conditions) {
          for (const entry of conditionsMap.entries()) {
            const condType = entry[0];
            const condStatus = entry[1];
            if (cond.type === condType && cond.status === condStatus) {
              this.logger.info(
                `Pod condition met for ${pod.metadata?.name} [type: ${cond.type} status: ${cond.status}]`,
              );
              return true;
            }
          }
        }
      }
      // condition not found
      return false;
    });
  }

  public async waitForRunningPhase(
    namespace: NamespaceName,
    labels: string[],
    maxAttempts: number,
    delay: number,
    podItemPredicate?: (items: V1Pod) => boolean,
  ): Promise<V1Pod[]> {
    const phases = [constants.POD_PHASE_RUNNING];
    const labelSelector = labels.join(',');

    this.logger.info(
      `waitForRunningPhase [labelSelector: ${labelSelector}, namespace:${namespace.name}, maxAttempts: ${maxAttempts}]`,
    );

    return new Promise<V1Pod[]>((resolve, reject) => {
      let attempts = 0;

      const check = async (resolve: (items: V1Pod[]) => void, reject: (reason?: Error) => void) => {
        // wait for the pod to be available with the given status and labels
        try {
          const resp = await this.kubeClient.listNamespacedPod(
            namespace.name,
            // @ts-expect-error - method expects a boolean but typed it as a string for some reason
            false,
            false,
            undefined,
            undefined,
            labelSelector,
            1,
            undefined,
            undefined,
            undefined,
            Duration.ofMinutes(5).toMillis(),
          );

          this.logger.debug(
            `[attempt: ${attempts}/${maxAttempts}] ${resp.body?.items?.length}/${1} pod found [labelSelector: ${labelSelector}, namespace:${namespace.name}]`,
          );

          if (resp.body?.items?.length === 1) {
            let phaseMatchCount = 0;
            let predicateMatchCount = 0;

            for (const item of resp.body.items) {
              if (phases.includes(item.status?.phase)) {
                phaseMatchCount++;
              }

              if (podItemPredicate && podItemPredicate(item)) {
                predicateMatchCount++;
              }
            }

            if (phaseMatchCount === 1 && (!podItemPredicate || predicateMatchCount === 1)) {
              return resolve(resp.body.items);
            }
          }
        } catch (e) {
          this.logger.info('Error occurred while waiting for pods, retrying', e);
        }

        if (++attempts < maxAttempts) {
          setTimeout(() => check(resolve, reject), delay);
        } else {
          return reject(
            new SoloError(
              `Expected number of pod (${1}) not found for labels: ${labelSelector}, phases: ${phases.join(',')} [attempts = ${attempts}/${maxAttempts}]`,
            ),
          );
        }
      };

      check(resolve, reject);
    });
  }
}
