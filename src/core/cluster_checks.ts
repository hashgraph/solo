/**
 * SPDX-License-Identifier: Apache-2.0
 */
import {type NamespaceName} from './kube/namespace_name.js';
import * as constants from './constants.js';
import {patchInject} from './container_helper.js';
import {SoloLogger} from './logging.js';
import {inject, injectable} from 'tsyringe-neo';
import {type K8} from './kube/k8.js';
import {type Pod} from './kube/pod.js';
import {type IngressClass} from './kube/ingress_class.js';
import {type V1Pod, type V1ConfigMap} from '@kubernetes/client-node';

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
      const pods: V1Pod[] = await this.k8.pods().list(namespace, ['app=minio']);

      return pods.length > 0;
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
      const ingressClassList: IngressClass[] = await this.k8.ingressClasses().list();

      return ingressClassList.length > 0;
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
      const configmaps: V1ConfigMap[] = await this.k8
        .configMaps()
        .listForAllNamespaces([constants.SOLO_REMOTE_CONFIGMAP_LABEL_SELECTOR]);

      return configmaps.length > 0;
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
      const pods: V1Pod[] = await this.k8.pods().list(namespace, ['app.kubernetes.io/name=prometheus']);

      return pods.length > 0;
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
      const configmaps: V1ConfigMap[] = await this.k8
        .configMaps()
        .list(namespace, [constants.SOLO_REMOTE_CONFIGMAP_LABEL_SELECTOR]);

      return configmaps.length > 0;
    } catch (e) {
      this.logger.error('Failed to find remote config:', e);

      return false;
    }
  }
}
