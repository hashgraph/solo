/**
 * SPDX-License-Identifier: Apache-2.0
 */
import {type NamespaceName} from './kube/namespace_name.js';
import * as constants from './constants.js';
import {patchInject} from './container_helper.js';
import {SoloLogger} from './logging.js';
import {inject, injectable} from 'tsyringe-neo';
import {type K8} from './kube/k8.js';
import {type K8Client} from './kube/k8_client.js';
import {type Pod} from './kube/pod.js';

/**
 * Class to check if certain components are installed in the cluster.
 */
@injectable()
export class ClusterChecks {
  constructor(
    @inject(SoloLogger) private readonly logger?: SoloLogger,
    @inject('K8') private readonly k8?: K8,
  ) {
    this.logger = patchInject(logger, SoloLogger, this.constructor.name);
    this.k8 = patchInject(k8, 'K8', this.constructor.name);
  }

  /**
   * Check if cert-manager is installed inside any namespace.
   * @returns if cert-manager is found
   */
  public async isCertManagerInstalled(): Promise<boolean> {
    try {
      const pods: Pod[] = await this.k8.pods().listForAllNamespaces(['app=cert-manager']);

      return pods.length > 0;
    } catch (e) {
      this.logger.error('Failed to find cert-manager:', e);

      return false;
    }
  }

  /**
   * Check if minio is installed inside the namespace.
   * @returns if minio is found
   */
  public async isMinioInstalled(namespace: NamespaceName): Promise<boolean> {
    try {
      // TODO DETECT THE OPERATOR
      const pods = await (this.k8 as K8Client).kubeClient.listNamespacedPod(
        namespace.name,
        undefined,
        undefined,
        undefined,
        undefined,
        'app=minio',
      );

      return pods.body.items.length > 0;
    } catch (e) {
      this.logger.error('Failed to find minio:', e);

      return false;
    }
  }

  /**
   * Check if the ingress controller is installed inside any namespace.
   * @returns if ingress controller is found
   */
  public async isIngressControllerInstalled(): Promise<boolean> {
    try {
      const response = await (this.k8 as K8Client).networkingApi.listIngressClass();

      return response.body.items.length > 0;
    } catch (e) {
      this.logger.error('Failed to find ingress controller:', e);

      return false;
    }
  }

  /**
   * Check if the remote config is installed inside any namespace.
   * @returns if remote config is found
   */
  public async isRemoteConfigPresentInAnyNamespace() {
    try {
      const configmaps = await (this.k8 as K8Client).kubeClient.listConfigMapForAllNamespaces(
        undefined,
        undefined,
        undefined,
        constants.SOLO_REMOTE_CONFIGMAP_LABEL_SELECTOR,
      );

      return configmaps.body.items.length > 0;
    } catch (e) {
      this.logger.error('Failed to find remote config:', e);

      return false;
    }
  }

  /**
   * Check if the prometheus is installed inside the namespace.
   * @param namespace - namespace where to search
   * @returns if prometheus is found
   */
  public async isPrometheusInstalled(namespace: NamespaceName) {
    try {
      const pods = await (this.k8 as K8Client).kubeClient.listNamespacedPod(
        namespace.name,
        undefined,
        undefined,
        undefined,
        undefined,
        'app.kubernetes.io/name=prometheus',
      );

      return pods.body.items.length > 0;
    } catch (e) {
      this.logger.error('Failed to find prometheus:', e);

      return false;
    }
  }

  /**
   * Searches specific namespace for remote config's config map
   *
   * @param namespace - namespace where to search
   * @returns true if found else false
   */
  public async isRemoteConfigPresentInNamespace(namespace: NamespaceName): Promise<boolean> {
    try {
      const configmaps = await (this.k8 as K8Client).kubeClient.listNamespacedConfigMap(
        namespace.name,
        undefined,
        undefined,
        undefined,
        undefined,
        constants.SOLO_REMOTE_CONFIGMAP_LABEL_SELECTOR,
      );

      return configmaps.body.items.length > 0;
    } catch (e) {
      this.logger.error('Failed to find remote config:', e);

      return false;
    }
  }
}
