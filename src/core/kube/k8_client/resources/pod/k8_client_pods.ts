// SPDX-License-Identifier: Apache-2.0

import {
  V1Pod,
  type KubeConfig,
  type CoreV1Api,
  V1ObjectMeta,
  V1Container,
  V1Probe,
  V1ExecAction,
  V1PodSpec,
} from '@kubernetes/client-node';
import {type Pods} from '../../../resources/pod/pods.js';
import {NamespaceName} from '../../../resources/namespace/namespace_name.js';
import {PodRef} from '../../../resources/pod/pod_ref.js';
import {type Pod} from '../../../resources/pod/pod.js';
import {K8ClientPod} from './k8_client_pod.js';
import {Duration} from '../../../../time/duration.js';
import {K8ClientBase} from '../../k8_client_base.js';
import {SoloError} from '../../../../errors/SoloError.js';
import {MissingArgumentError} from '../../../../errors/MissingArgumentError.js';
import * as constants from '../../../../constants.js';
import {type SoloLogger} from '../../../../logging.js';
import {container} from 'tsyringe-neo';
import {type ContainerName} from '../../../resources/container/container_name.js';
import {PodName} from '../../../resources/pod/pod_name.js';
import {KubeApiResponse} from '../../../kube_api_response.js';
import {ResourceOperation} from '../../../resources/resource_operation.js';
import {ResourceType} from '../../../resources/resource_type.js';
import {InjectTokens} from '../../../../dependency_injection/inject_tokens.js';

export class K8ClientPods extends K8ClientBase implements Pods {
  private readonly logger: SoloLogger;

  constructor(
    private readonly kubeClient: CoreV1Api,
    private readonly kubeConfig: KubeConfig,
  ) {
    super();
    this.logger = container.resolve(InjectTokens.SoloLogger);
  }

  public readByRef(podRef: PodRef): Pod {
    return new K8ClientPod(podRef, this, this.kubeClient, this.kubeConfig);
  }

  public async read(podRef: PodRef): Promise<V1Pod> {
    const ns = podRef.namespace;
    const fieldSelector = `metadata.name=${podRef.name}`;

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

    return this.filterItem(resp.body.items, {name: podRef.name.toString()});
  }

  public async list(namespace: NamespaceName, labels: string[]): Promise<V1Pod[]> {
    const labelSelector: string = labels ? labels.join(',') : undefined;

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
    maxAttempts: number = 10,
    delay: number = 500,
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
    const labelSelector: string = labels ? labels.join(',') : undefined;

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

  public async listForAllNamespaces(labels: string[]): Promise<Pod[]> {
    const labelSelector: string = labels ? labels.join(',') : undefined;
    const pods: Pod[] = [];

    try {
      const response = await this.kubeClient.listPodForAllNamespaces(undefined, undefined, undefined, labelSelector);
      KubeApiResponse.check(response.response, ResourceOperation.LIST, ResourceType.POD, undefined, '');
      if (response?.body?.items?.length > 0) {
        response.body.items.forEach(item => {
          pods.push(
            new K8ClientPod(
              PodRef.of(NamespaceName.of(item.metadata?.namespace), PodName.of(item.metadata?.name)),
              this,
              this.kubeClient,
              this.kubeConfig,
            ),
          );
        });
      }
    } catch (e) {
      throw new SoloError('Error listing pods for all namespaces', e);
    }

    return pods;
  }

  public async create(
    podRef: PodRef,
    labels: Record<string, string>,
    containerName: ContainerName,
    containerImage: string,
    containerCommand: string[],
    startupProbeCommand: string[],
  ): Promise<Pod> {
    const v1Metadata: V1ObjectMeta = new V1ObjectMeta();
    v1Metadata.name = podRef.name.toString();
    v1Metadata.namespace = podRef.namespace.toString();
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

    let result: {response: any; body: any};
    try {
      result = await this.kubeClient.createNamespacedPod(podRef.namespace.toString(), v1Pod);
    } catch (e) {
      if (e instanceof SoloError) {
        throw e;
      }
      throw new SoloError('Error creating pod with call to createNamespacedPod()', e);
    }

    KubeApiResponse.check(
      result.response,
      ResourceOperation.CREATE,
      ResourceType.POD,
      podRef.namespace,
      podRef.name.toString(),
    );
    if (result?.body) {
      return new K8ClientPod(podRef, this, this.kubeClient, this.kubeConfig);
    } else {
      throw new SoloError('Error creating pod', result);
    }
  }
}
