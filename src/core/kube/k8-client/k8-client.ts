// SPDX-License-Identifier: Apache-2.0

import * as k8s from '@kubernetes/client-node';
import {SoloError} from '../../errors/SoloError.js';
import {type K8} from '../k8.js';
import {type Namespaces} from '../resources/namespace/namespaces.js';
import {K8ClientClusters} from './resources/cluster/k8-client-clusters.js';
import {type Clusters} from '../resources/cluster/clusters.js';
import {type ConfigMaps} from '../resources/config-map/config-maps.js';
import {K8ClientConfigMaps} from './resources/config-map/k8-client-config-maps.js';
import {K8ClientContainers} from './resources/container/k8-client-containers.js';
import {type Containers} from '../resources/container/containers.js';
import {type Contexts} from '../resources/context/contexts.js';
import {K8ClientContexts} from './resources/context/k8-client-contexts.js';
import {K8ClientPods} from './resources/pod/k8-client-pods.js';
import {type Pods} from '../resources/pod/pods.js';
import {type Services} from '../resources/service/services.js';
import {K8ClientServices} from './resources/service/k8-client-services.js';
import {type Pvcs} from '../resources/pvc/pvcs.js';
import {K8ClientPvcs} from './resources/pvc/k8-client-pvcs.js';
import {type Leases} from '../resources/lease/leases.js';
import {K8ClientLeases} from './resources/lease/k8-client-leases.js';
import {K8ClientNamespaces} from './resources/namespace/k8-client-namespaces.js';
import {K8ClientIngressClasses} from './resources/ingress-class/k8-client-ingress-classes.js';
import {type IngressClasses} from '../resources/ingress-class/ingress-classes.js';
import {type Secrets} from '../resources/secret/secrets.js';
import {K8ClientSecrets} from './resources/secret/k8-client-secrets.js';
import {type Ingresses} from '../resources/ingress/ingresses.js';
import {K8ClientIngresses} from './resources/ingress/k8-client-ingresses.js';
import {type Crds} from '../resources/crd/crds.js';
import {K8ClientCRDs} from './resources/crd/k8-clinet-crds.js';

/**
 * A kubernetes API wrapper class providing custom functionalities required by solo
 *
 * Note: Take care if the same instance is used for parallel execution, as the behaviour may be unpredictable.
 * For parallel execution, create separate instances by invoking clone()
 */
export class K8Client implements K8 {
  private kubeConfig!: k8s.KubeConfig;
  private kubeClient!: k8s.CoreV1Api;
  private coordinationApiClient!: k8s.CoordinationV1Api;
  private extensionApi!: k8s.ApiextensionsV1Api;
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
  private k8Ingresses: Ingresses;
  private k8CRDs: Crds;

  /**
   * Create a new k8Factory client for the given context, if context is undefined it will use the current context in kubeconfig
   * @param context - The context to create the k8Factory client for
   */
  constructor(private readonly context: string) {
    this.init(this.context);
  }

  // TODO make private, but first we need to require a cluster to be set and address the test cases using this
  init(context: string = undefined): K8 {
    this.kubeConfig = this.getKubeConfig(context);

    if (!this.kubeConfig.getCurrentContext()) {
      throw new SoloError('No active kubernetes context found. ' + 'Please set current kubernetes context.');
    }

    if (!this.kubeConfig.getCurrentCluster()) {
      throw new SoloError('No active kubernetes cluster found. ' + 'Please create a cluster and set current context.');
    }

    this.kubeClient = this.kubeConfig.makeApiClient(k8s.CoreV1Api);
    this.networkingApi = this.kubeConfig.makeApiClient(k8s.NetworkingV1Api);
    this.coordinationApiClient = this.kubeConfig.makeApiClient(k8s.CoordinationV1Api);
    this.extensionApi = this.kubeConfig.makeApiClient(k8s.ApiextensionsV1Api);

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
    this.k8Ingresses = new K8ClientIngresses(this.networkingApi);
    this.k8CRDs = new K8ClientCRDs(this.extensionApi);

    return this;
  }

  private getKubeConfig(context: string): k8s.KubeConfig {
    const kubeConfig = new k8s.KubeConfig();
    kubeConfig.loadFromDefault();

    if (context) {
      const kubeConfigContext: k8s.Context = kubeConfig.getContextObject(context);

      if (!kubeConfigContext) {
        throw new SoloError(`No kube config context found with name ${context}`);
      }

      kubeConfig.setCurrentContext(context);
    }

    return kubeConfig;
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

  public ingresses(): Ingresses {
    return this.k8Ingresses;
  }

  public crds(): Crds {
    return this.k8CRDs;
  }
}
