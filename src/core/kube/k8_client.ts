/**
 * SPDX-License-Identifier: Apache-2.0
 */
import * as k8s from '@kubernetes/client-node';
import {type V1Lease, V1ObjectMeta, V1Secret} from '@kubernetes/client-node';
import {Flags as flags} from '../../commands/flags.js';
import {MissingArgumentError, SoloError} from './../errors.js';
import {StatusCodes} from 'http-status-codes';
import * as constants from './../constants.js';
import {ConfigManager} from './../config_manager.js';
import {SoloLogger} from './../logging.js';
import {type TarCreateFilter} from '../../types/aliases.js';
import {type ExtendedNetServer, type Optional} from '../../types/index.js';
import {Duration} from './../time/duration.js';
import {inject, injectable} from 'tsyringe-neo';
import {patchInject} from './../container_helper.js';
import {type K8} from './k8.js';
import {type Namespaces} from './namespaces.js';
import {type NamespaceName} from './namespace_name.js';
import {K8ClientClusters} from './k8_client/k8_client_clusters.js';
import {type Clusters} from './clusters.js';
import {type ConfigMaps} from './config_maps.js';
import {K8ClientConfigMaps} from './k8_client/k8_client_config_maps.js';
import {type PodRef} from './pod_ref.js';
import {type ContainerRef} from './container_ref.js';
import {K8ClientContainers} from './k8_client/k8_client_containers.js';
import {type Containers} from './containers.js';
import {type Contexts} from './contexts.js';
import {K8ClientContexts} from './k8_client/k8_client_contexts.js';
import {K8ClientPods} from './k8_client/k8_client_pods.js';
import {type Pods} from './pods.js';
import {K8ClientBase} from './k8_client/k8_client_base.js';
import {type Services} from './services.js';
import {K8ClientServices} from './k8_client/k8_client_services.js';
import {type Service} from './service.js';
import {type Pvcs} from './pvcs.js';
import {K8ClientPvcs} from './k8_client/k8_client_pvcs.js';
import {type Leases} from './leases.js';
import {K8ClientLeases} from './k8_client/k8_client_leases.js';
import {K8ClientNamespaces} from './k8_client/k8_client_namespaces.js';
import {K8ClientIngressClasses} from './k8_client/k8_client_ingress_classes.js';
import {type IngressClasses} from './ingress_classes.js';

/**
 * A kubernetes API wrapper class providing custom functionalities required by solo
 *
 * Note: Take care if the same instance is used for parallel execution, as the behaviour may be unpredictable.
 * For parallel execution, create separate instances by invoking clone()
 */
// TODO move to kube folder
@injectable()
export class K8Client extends K8ClientBase implements K8 {
  // TODO - remove extends K8ClientFilter after services refactor, it is using filterItem()

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

  constructor(
    @inject(ConfigManager) private readonly configManager?: ConfigManager,
    @inject(SoloLogger) private readonly logger?: SoloLogger,
  ) {
    super();
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
    this.k8Containers = new K8ClientContainers(this.kubeConfig);
    this.k8Contexts = new K8ClientContexts(this.kubeConfig);
    this.k8Services = new K8ClientServices(this.kubeClient);
    this.k8Pods = new K8ClientPods(this.kubeClient, this.kubeConfig);
    this.k8Pvcs = new K8ClientPvcs(this.kubeClient);
    this.k8Leases = new K8ClientLeases(this.coordinationApiClient);
    this.k8Namespaces = new K8ClientNamespaces(this.kubeClient);
    this.k8IngressClasses = new K8ClientIngressClasses(this.networkingApi);

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

  public ingressClasses(): IngressClasses {
    return this.k8IngressClasses;
  }

  public async createNamespace(namespace: NamespaceName) {
    return this.namespaces().create(namespace);
  }

  public async deleteNamespace(namespace: NamespaceName) {
    return this.namespaces().delete(namespace);
  }

  public async getNamespaces() {
    return this.namespaces().list();
  }

  public async hasNamespace(namespace: NamespaceName) {
    return this.namespaces().has(namespace);
  }

  public async getPodByName(podRef: PodRef): Promise<k8s.V1Pod> {
    return this.pods().readByName(podRef);
  }

  public async getPodsByLabel(labels: string[] = []) {
    return this.pods().readManyByLabel(this.getNamespace(), labels);
  }

  public async getSecretsByLabel(labels: string[] = [], namespace?: NamespaceName) {
    const ns = namespace || this.getNamespace();
    const labelSelector = labels.join(',');
    const result = await this.kubeClient.listNamespacedSecret(
      ns.name,
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

  public async getSvcByName(name: string): Promise<Service> {
    return this.services().read(this.getNamespace(), name);
  }

  public async listDir(containerRef: ContainerRef, destPath: string) {
    return this.containers().readByRef(containerRef).listDir(destPath);
  }

  public async hasFile(containerRef: ContainerRef, destPath: string, filters: object = {}) {
    return this.containers().readByRef(containerRef).hasFile(destPath, filters);
  }

  public async hasDir(containerRef: ContainerRef, destPath: string) {
    return this.containers().readByRef(containerRef).hasDir(destPath);
  }

  public mkdir(containerRef: ContainerRef, destPath: string) {
    return this.containers().readByRef(containerRef).mkdir(destPath);
  }

  public async copyTo(
    containerRef: ContainerRef,
    srcPath: string,
    destDir: string,
    filter: TarCreateFilter | undefined = undefined,
  ) {
    return this.containers().readByRef(containerRef).copyTo(srcPath, destDir, filter);
  }

  public async copyFrom(containerRef: ContainerRef, srcPath: string, destDir: string) {
    return this.containers().readByRef(containerRef).copyFrom(srcPath, destDir);
  }

  public async execContainer(containerRef: ContainerRef, command: string | string[]) {
    return this.containers().readByRef(containerRef).execContainer(command);
  }

  public async portForward(podRef: PodRef, localPort: number, podPort: number) {
    return this.pods().readByRef(podRef).portForward(localPort, podPort);
  }

  public async stopPortForward(server: ExtendedNetServer, maxAttempts = 20, timeout = 500) {
    return this.pods().readByRef(null).stopPortForward(server, maxAttempts, timeout);
  }

  public async waitForPods(
    phases = [constants.POD_PHASE_RUNNING], // TODO - phases goes away
    labels: string[] = [],
    podCount = 1, // TODO - podCount goes away
    maxAttempts = constants.PODS_RUNNING_MAX_ATTEMPTS,
    delay = constants.PODS_RUNNING_DELAY,
    podItemPredicate?: (items: k8s.V1Pod) => boolean,
    namespace?: NamespaceName,
  ): Promise<k8s.V1Pod[]> {
    const ns = namespace || this.getNamespace();
    return this.pods().waitForRunningPhase(ns, labels, maxAttempts, delay, podItemPredicate);
  }

  public async waitForPodReady(
    labels: string[] = [],
    podCount = 1,
    maxAttempts = 10,
    delay = 500,
    namespace?: NamespaceName,
  ) {
    const ns = namespace || this.getNamespace();
    return this.pods().waitForReadyStatus(ns, labels, maxAttempts, delay);
  }

  public async listPvcsByNamespace(namespace: NamespaceName, labels: string[] = []) {
    return this.pvcs().list(namespace, labels);
  }

  /**
   * Get a list of secrets for the given namespace
   * @param namespace - the namespace of the secrets to return
   * @param [labels] - labels
   * @returns list of secret names
   */
  // TODO - delete this method, and change downstream to use getSecretsByLabel(labels: string[] = [], namespace?: string): Promise<V1Secret[]>
  public async listSecretsByNamespace(namespace: NamespaceName, labels: string[] = []) {
    const secrets: string[] = [];
    const items = await this.getSecretsByLabel(labels, namespace);

    for (const item of items) {
      secrets.push(item.metadata!.name as string);
    }

    return secrets;
  }

  public async deletePvc(name: string, namespace: NamespaceName) {
    return this.pvcs().delete(namespace, name);
  }

  // --------------------------------------- Utility Methods --------------------------------------- //

  // --------------------------------------- Secret --------------------------------------- //

  /**
   * retrieve the secret of the given namespace and label selector, if there is more than one, it returns the first
   * @param namespace - the namespace of the secret to search for
   * @param labelSelector - the label selector used to fetch the Kubernetes secret
   * @returns a custom secret object with the relevant attributes, the values of the data key:value pair
   *   objects must be base64 decoded
   */
  // TODO - delete this method, and change downstream to use getSecretsByLabel(labels: string[] = [], namespace?: string): Promise<V1Secret[]>
  public async getSecret(namespace: NamespaceName, labelSelector: string) {
    const labels = labelSelector.split(',');
    const items = await this.getSecretsByLabel(labels, namespace);

    if (items.length > 0) {
      const secretObject = items[0];
      return {
        name: secretObject.metadata!.name as string,
        labels: secretObject.metadata!.labels as Record<string, string>,
        namespace: secretObject.metadata!.namespace as string,
        type: secretObject.type as string,
        data: secretObject.data as Record<string, string>,
      };
    }
    return null;
  }

  public async createSecret(
    name: string,
    namespace: NamespaceName,
    secretType: string,
    data: Record<string, string>,
    labels: Optional<Record<string, string>>,
    recreate: boolean,
  ) {
    if (recreate) {
      try {
        await this.kubeClient.deleteNamespacedSecret(name, namespace.name);
      } catch {
        // do nothing
      }
    }

    const v1Secret = new V1Secret();
    v1Secret.apiVersion = 'v1';
    v1Secret.kind = 'Secret';
    v1Secret.type = secretType;
    v1Secret.data = data;
    v1Secret.metadata = new V1ObjectMeta();
    v1Secret.metadata.name = name;
    v1Secret.metadata.labels = labels;

    try {
      const resp = await this.kubeClient.createNamespacedSecret(namespace.name, v1Secret);

      return resp.response.statusCode === StatusCodes.CREATED;
    } catch (e) {
      throw new SoloError(
        `failed to create secret ${name} in namespace ${namespace}: ${e.message}, ${e?.body?.message}`,
        e,
      );
    }
  }

  public async deleteSecret(name: string, namespace: NamespaceName) {
    const resp = await this.kubeClient.deleteNamespacedSecret(name, namespace.name);
    return resp.response.statusCode === StatusCodes.OK;
  }

  // --------------------------------------- LEASES --------------------------------------- //

  public async createNamespacedLease(
    namespace: NamespaceName,
    leaseName: string,
    holderName: string,
    durationSeconds = 20,
  ) {
    return this.leases().create(namespace, leaseName, holderName, durationSeconds);
  }

  public async readNamespacedLease(leaseName: string, namespace: NamespaceName, timesCalled = 0) {
    return this.leases().read(namespace, leaseName, timesCalled);
  }

  public async renewNamespaceLease(leaseName: string, namespace: NamespaceName, lease: k8s.V1Lease) {
    return this.leases().renew(namespace, leaseName, lease);
  }

  public async transferNamespaceLease(lease: k8s.V1Lease, newHolderName: string): Promise<V1Lease> {
    return this.leases().transfer(lease, newHolderName);
  }

  public async deleteNamespacedLease(name: string, namespace: NamespaceName) {
    return this.leases().delete(namespace, name);
  }

  /* ------------- Utilities ------------- */

  private getNamespace(): NamespaceName {
    const ns = this.configManager.getFlag<NamespaceName>(flags.namespace);
    if (!ns) throw new MissingArgumentError('namespace is not set');
    return ns;
  }

  public async killPod(podRef: PodRef) {
    return this.pods().readByRef(podRef).killPod();
  }

  public async listSvcs(namespace: NamespaceName, labels: string[]): Promise<Service[]> {
    return this.services().list(namespace, labels);
  }
}
