/**
 * SPDX-License-Identifier: Apache-2.0
 */
import * as k8s from '@kubernetes/client-node';
import {Flags as flags} from '../../../commands/flags.js';
import {MissingArgumentError, SoloError} from '../../errors.js';
import {ConfigManager} from '../../config_manager.js';
import {SoloLogger} from '../../logging.js';
import {type TarCreateFilter} from '../../../types/aliases.js';
import {inject, injectable} from 'tsyringe-neo';
import {patchInject} from '../../container_helper.js';
import {type K8} from '../k8.js';
import {type Namespaces} from '../resources/namespace/namespaces.js';
import {type NamespaceName} from '../resources/namespace/namespace_name.js';
import {K8ClientClusters} from '../k8_client/resources/cluster/k8_client_clusters.js';
import {type Clusters} from '../resources/cluster/clusters.js';
import {type ConfigMaps} from '../resources/config_map/config_maps.js';
import {K8ClientConfigMaps} from '../k8_client/resources/config_map/k8_client_config_maps.js';
import {type ContainerRef} from '../resources/container/container_ref.js';
import {K8ClientContainers} from '../k8_client/resources/container/k8_client_containers.js';
import {type Containers} from '../resources/container/containers.js';
import {type Contexts} from '../resources/context/contexts.js';
import {K8ClientContexts} from '../k8_client/resources/context/k8_client_contexts.js';
import {K8ClientPods} from '../k8_client/resources/pod/k8_client_pods.js';
import {type Pods} from '../resources/pod/pods.js';
import {type Services} from '../resources/service/services.js';
import {K8ClientServices} from '../k8_client/resources/service/k8_client_services.js';
import {type Pvcs} from '../resources/pvc/pvcs.js';
import {K8ClientPvcs} from '../k8_client/resources/pvc/k8_client_pvcs.js';
import {type Leases} from '../resources/lease/leases.js';
import {K8ClientLeases} from '../k8_client/resources/lease/k8_client_leases.js';
import {K8ClientNamespaces} from '../k8_client/resources/namespace/k8_client_namespaces.js';
import {K8ClientIngressClasses} from '../k8_client/resources/ingress_class/k8_client_ingress_classes.js';
import {type IngressClasses} from '../resources/ingress_class/ingress_classes.js';
import {type Secrets} from '../resources/secret/secrets.js';
import {K8ClientSecrets} from '../k8_client/resources/secret/k8_client_secrets.js';
import {PvcRef} from '../resources/pvc/pvc_ref.js';
import {PvcName} from '../resources/pvc/pvc_name.js';

/**
 * A kubernetes API wrapper class providing custom functionalities required by solo
 *
 * Note: Take care if the same instance is used for parallel execution, as the behaviour may be unpredictable.
 * For parallel execution, create separate instances by invoking clone()
 */
@injectable()
export class K8Client implements K8 {
  private kubeConfig!: k8s.KubeConfig;
  kubeClient!: k8s.CoreV1Api;
  private coordinationApiClient: k8s.CoordinationV1Api;
  private networkingApi!: k8s.NetworkingV1Api;

  private k8Leases: Leases;
  private k8Clusters: Clusters;
  private k8ConfigMaps: ConfigMaps;
  private k8Containers: Containers;
  private k8Pods: Pods;
  private k8Contexts: Contexts;
  private k8Services: Services;
  private k8Pvcs: Pvcs;
  private k8Namespaces: Namespaces;
  private k8IngressClasses: IngressClasses;
  private k8Secrets: Secrets;

  constructor(
    @inject(ConfigManager) private readonly configManager?: ConfigManager,
    @inject(SoloLogger) private readonly logger?: SoloLogger,
  ) {
    this.configManager = patchInject(configManager, ConfigManager, this.constructor.name);
    this.logger = patchInject(logger, SoloLogger, this.constructor.name);

    this.init();
  }

  // TODO make private, but first we need to require a cluster to be set and address the test cases using this
  init(): K8 {
    this.kubeConfig = new k8s.KubeConfig();
    this.kubeConfig.loadFromDefault();

    if (!this.kubeConfig.getCurrentContext()) {
      throw new SoloError('No active kubernetes context found. ' + 'Please set current kubernetes context.');
    }

    if (!this.kubeConfig.getCurrentCluster()) {
      throw new SoloError('No active kubernetes cluster found. ' + 'Please create a cluster and set current context.');
    }

    this.kubeClient = this.kubeConfig.makeApiClient(k8s.CoreV1Api);
    this.networkingApi = this.kubeConfig.makeApiClient(k8s.NetworkingV1Api);
    this.coordinationApiClient = this.kubeConfig.makeApiClient(k8s.CoordinationV1Api);

    this.k8Clusters = new K8ClientClusters(this.kubeConfig);
    this.k8ConfigMaps = new K8ClientConfigMaps(this.kubeClient);
    this.k8Contexts = new K8ClientContexts(this.kubeConfig);
    this.k8Services = new K8ClientServices(this.kubeClient);
    this.k8Pods = new K8ClientPods(this.kubeClient, this.kubeConfig);
    this.k8Containers = new K8ClientContainers(this.kubeConfig, this.k8Pods);
    this.k8Pvcs = new K8ClientPvcs(this.kubeClient);
    this.k8Leases = new K8ClientLeases(this.coordinationApiClient);
    this.k8Namespaces = new K8ClientNamespaces(this.kubeClient);
    this.k8IngressClasses = new K8ClientIngressClasses(this.networkingApi);
    this.k8Secrets = new K8ClientSecrets(this.kubeClient);

    return this; // to enable chaining
  }

  public namespaces(): Namespaces {
    return this.k8Namespaces;
  }

  public clusters(): Clusters {
    return this.k8Clusters;
  }

  public configMaps(): ConfigMaps {
    return this.k8ConfigMaps;
  }

  public containers(): Containers {
    return this.k8Containers;
  }

  public contexts(): Contexts {
    return this.k8Contexts;
  }

  public services(): Services {
    return this.k8Services;
  }

  public pods(): Pods {
    return this.k8Pods;
  }

  public pvcs(): Pvcs {
    return this.k8Pvcs;
  }

  public leases(): Leases {
    return this.k8Leases;
  }

  public secrets(): Secrets {
    return this.k8Secrets;
  }

  public ingressClasses(): IngressClasses {
    return this.k8IngressClasses;
  }

  public async listPvcsByNamespace(namespace: NamespaceName, labels: string[] = []) {
    return this.pvcs().list(namespace, labels);
  }

  public async deletePvc(name: string, namespace: NamespaceName) {
    return this.pvcs().delete(PvcRef.of(namespace, PvcName.of(name)));
  }

  public async patchIngress(namespace: NamespaceName, ingressName: string, patch: object) {
    const ingressNames = [];
    await this.networkingApi
      .listIngressForAllNamespaces()
      .then(response => {
        response.body.items.forEach(ingress => {
          const currentIngressName = ingress.metadata.name;
          if (currentIngressName.includes(ingressName)) {
            ingressNames.push(currentIngressName);
          }
        });
      })
      .catch(err => {
        this.logger.error(`Error listing Ingresses: ${err}`);
      });

    for (const name of ingressNames) {
      await this.networkingApi
        .patchNamespacedIngress(name, namespace.name, patch, undefined, undefined, undefined, undefined, undefined, {
          headers: {'Content-Type': 'application/strategic-merge-patch+json'},
        })
        .then(response => {
          this.logger.info(`Patched Ingress ${name} in namespace ${namespace}, patch: ${JSON.stringify(patch)}`);
        })
        .catch(err => {
          this.logger.error(
            `Error patching Ingress ${name} in namespace ${namespace}, patch: ${JSON.stringify(patch)} ${err}`,
          );
        });
    }
  }

  public async patchConfigMap(namespace: NamespaceName, configMapName: string, data: Record<string, string>) {
    const patch = {
      data: data,
    };

    const options = {
      headers: {'Content-Type': 'application/merge-patch+json'}, // Or the appropriate content type
    };

    await this.kubeClient
      .patchNamespacedConfigMap(
        configMapName,
        namespace.name,
        patch,
        undefined, // pretty
        undefined, // dryRun
        undefined, // fieldManager
        undefined, // fieldValidation
        undefined, // force
        options, // Pass the options here
      )
      .then(response => {
        this.logger.info(`Patched ConfigMap ${configMapName} in namespace ${namespace}`);
      })
      .catch(err => {
        this.logger.error(`Error patching ConfigMap ${configMapName} in namespace ${namespace}: ${err}`);
      });
  }
}
