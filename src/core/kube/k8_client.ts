/**
 * SPDX-License-Identifier: Apache-2.0
 */
import * as k8s from '@kubernetes/client-node';
import {type V1Lease, V1ObjectMeta, V1Secret} from '@kubernetes/client-node';
import {Flags as flags} from '../../commands/flags.js';
import {MissingArgumentError, SoloError} from './../errors.js';
import {getReasonPhrase, StatusCodes} from 'http-status-codes';
import {sleep} from './../helpers.js';
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
import {NamespaceName} from './namespace_name.js';
import {K8ClientClusters} from './k8_client/k8_client_clusters.js';
import {type Clusters} from './clusters.js';
import {type ConfigMaps} from './config_maps.js';
import {K8ClientConfigMaps} from './k8_client/k8_client_config_maps.js';
import {type PodRef} from './pod_ref.js';
import {type ContainerRef} from './container_ref.js';
import {K8ClientContainers} from './k8_client/k8_client_containers.js';
import {type Containers} from './containers.js';
import {type Contexts} from './contexts.js';
import type http from 'node:http';
import {K8ClientContexts} from './k8_client/k8_client_contexts.js';
import {K8ClientPods} from './k8_client/k8_client_pods.js';
import {type Pods} from './pods.js';
import {K8ClientBase} from './k8_client/k8_client_base.js';
import {type Services} from './services.js';
import {K8ClientServices} from './k8_client/k8_client_services.js';
import {type Service} from './service.js';
import {type Pvcs} from './pvcs.js';
import {K8ClientPvcs} from './k8_client/k8_client_pvcs.js';

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
  private networkingApi: k8s.NetworkingV1Api;

  private k8Clusters: Clusters;
  private k8ConfigMaps: ConfigMaps;
  private k8Containers: Containers;
  private k8Pods: Pods;
  private k8Contexts: Contexts;
  private k8Services: Services;
  private k8Pvcs: Pvcs;

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

    return this; // to enable chaining
  }

  /**
   * Fluent accessor for reading and manipulating namespaces in the kubernetes cluster.
   * @returns an object instance providing namespace operations
   */
  public namespaces(): Namespaces {
    return null;
  }

  /**
   * Fluent accessor for reading and manipulating cluster information from the kubeconfig file.
   * @returns an object instance providing cluster operations
   */
  public clusters(): Clusters {
    return this.k8Clusters;
  }

  /**
   * Fluent accessor for reading and manipulating config maps in the kubernetes cluster.
   * @returns an object instance providing config map operations
   */
  public configMaps(): ConfigMaps {
    return this.k8ConfigMaps;
  }

  /**
   * Fluent accessor for reading and manipulating containers.
   * returns an object instance providing container operations
   */
  public containers(): Containers {
    return this.k8Containers;
  }

  /**
   * Fluent accessor for reading and manipulating contexts in the kubeconfig file.
   * @returns an object instance providing context operations
   */
  public contexts(): Contexts {
    return this.k8Contexts;
  }

  /**
   * Fluent accessor for reading and manipulating services in the kubernetes cluster.
   * @returns an object instance providing service operations
   */
  public services(): Services {
    return this.k8Services;
  }

  /**
   * Fluent accessor for reading and manipulating pods in the kubernetes cluster.
   * @returns an object instance providing pod operations
   */
  public pods(): Pods {
    return this.k8Pods;
  }

  public pvcs(): Pvcs {
    return this.k8Pvcs;
  }

  public async createNamespace(namespace: NamespaceName) {
    const payload = {
      metadata: {
        name: namespace.name,
      },
    };

    const resp = await this.kubeClient.createNamespace(payload);
    return resp.response.statusCode === StatusCodes.CREATED;
  }

  public async deleteNamespace(namespace: NamespaceName) {
    const resp = await this.kubeClient.deleteNamespace(namespace.name);
    return resp.response.statusCode === StatusCodes.OK;
  }

  public async getNamespaces() {
    const resp = await this.kubeClient.listNamespace();
    if (resp.body && resp.body.items) {
      const namespaces: NamespaceName[] = [];
      resp.body.items.forEach(item => {
        namespaces.push(NamespaceName.of(item.metadata!.name));
      });

      return namespaces;
    }

    throw new SoloError('incorrect response received from kubernetes API. Unable to list namespaces');
  }

  public async hasNamespace(namespace: NamespaceName) {
    const namespaces = await this.getNamespaces();
    return namespaces.some(namespaces => namespaces.equals(namespace));
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

  public getClusters(): string[] {
    return this.clusters().list();
  }

  public getContextNames(): string[] {
    return this.contexts().list();
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

  // TODO this can be removed once K8 is context/cluster specific when instantiating
  public async testContextConnection(context: string): Promise<boolean> {
    return this.contexts().testContextConnection(context);
  }

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

  /* ------------- ConfigMap ------------- */

  public async getNamespacedConfigMap(name: string): Promise<k8s.V1ConfigMap> {
    return this.configMaps().read(this.getNamespace(), name);
  }

  public async createNamespacedConfigMap(
    name: string,
    labels: Record<string, string>,
    data: Record<string, string>,
  ): Promise<boolean> {
    return this.configMaps().create(this.getNamespace(), name, labels, data);
  }

  public async replaceNamespacedConfigMap(
    name: string,
    labels: Record<string, string>,
    data: Record<string, string>,
  ): Promise<boolean> {
    return this.configMaps().replace(this.getNamespace(), name, labels, data);
  }

  public async deleteNamespacedConfigMap(name: string, namespace: NamespaceName): Promise<boolean> {
    return this.configMaps().delete(namespace, name);
  }

  // --------------------------------------- LEASES --------------------------------------- //

  public async createNamespacedLease(
    namespace: NamespaceName,
    leaseName: string,
    holderName: string,
    durationSeconds = 20,
  ) {
    const lease = new k8s.V1Lease();

    const metadata = new k8s.V1ObjectMeta();
    metadata.name = leaseName;
    metadata.namespace = namespace.name;
    lease.metadata = metadata;

    const spec = new k8s.V1LeaseSpec();
    spec.holderIdentity = holderName;
    spec.leaseDurationSeconds = durationSeconds;
    spec.acquireTime = new k8s.V1MicroTime();
    lease.spec = spec;

    const {response, body} = await this.coordinationApiClient
      .createNamespacedLease(namespace.name, lease)
      .catch(e => e);

    this.handleKubernetesClientError(response, body, 'Failed to create namespaced lease');

    return body as k8s.V1Lease;
  }

  public async readNamespacedLease(leaseName: string, namespace: NamespaceName, timesCalled = 0) {
    const {response, body} = await this.coordinationApiClient
      .readNamespacedLease(leaseName, namespace.name)
      .catch(e => e);

    if (response?.statusCode === StatusCodes.INTERNAL_SERVER_ERROR && timesCalled < 4) {
      // could be k8s control plane has no resources available
      this.logger.debug(
        `Retrying readNamespacedLease(${leaseName}, ${namespace}) in 5 seconds because of ${getReasonPhrase(StatusCodes.INTERNAL_SERVER_ERROR)}`,
      );
      await sleep(Duration.ofSeconds(5));
      return await this.readNamespacedLease(leaseName, namespace, timesCalled + 1);
    }

    this.handleKubernetesClientError(response, body, 'Failed to read namespaced lease');

    return body as k8s.V1Lease;
  }

  public async renewNamespaceLease(leaseName: string, namespace: NamespaceName, lease: k8s.V1Lease) {
    lease.spec.renewTime = new k8s.V1MicroTime();

    const {response, body} = await this.coordinationApiClient
      .replaceNamespacedLease(leaseName, namespace.name, lease)
      .catch(e => e);

    this.handleKubernetesClientError(response, body, 'Failed to renew namespaced lease');

    return body as k8s.V1Lease;
  }

  public async transferNamespaceLease(lease: k8s.V1Lease, newHolderName: string): Promise<V1Lease> {
    lease.spec.leaseTransitions++;
    lease.spec.renewTime = new k8s.V1MicroTime();
    lease.spec.holderIdentity = newHolderName;

    const {response, body} = await this.coordinationApiClient
      .replaceNamespacedLease(lease.metadata.name, lease.metadata.namespace, lease)
      .catch(e => e);

    this.handleKubernetesClientError(response, body, 'Failed to transfer namespaced lease');

    return body as k8s.V1Lease;
  }

  public async deleteNamespacedLease(name: string, namespace: NamespaceName) {
    const {response, body} = await this.coordinationApiClient.deleteNamespacedLease(name, namespace.name).catch(e => e);

    this.handleKubernetesClientError(response, body, 'Failed to delete namespaced lease');

    return body as k8s.V1Status;
  }

  // --------------------------------------- Pod Identifiers --------------------------------------- //

  /**
   * Check if cert-manager is installed inside any namespace.
   * @returns if cert-manager is found
   */
  // TODO - move this into another class (business logic) that uses K8, that sits outside of kube folder
  //  - ClusterChecks ? SOLID principles, single responsibility
  public async isCertManagerInstalled(): Promise<boolean> {
    try {
      const pods = await this.kubeClient.listPodForAllNamespaces(undefined, undefined, undefined, 'app=cert-manager');

      return pods.body.items.length > 0;
    } catch (e) {
      this.logger.error('Failed to find cert-manager:', e);

      return false;
    }
  }

  /**
   * Check if minio is installed inside the namespace.
   * @returns if minio is found
   */
  // TODO - move this into another class (business logic) that uses K8, that sits outside of kube folder
  //  - ClusterChecks ? SOLID principles, single responsibility
  public async isMinioInstalled(namespace: NamespaceName): Promise<boolean> {
    try {
      // TODO DETECT THE OPERATOR
      const pods = await this.kubeClient.listNamespacedPod(
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
  // TODO - move this into another class (business logic) that uses K8, that sits outside of kube folder
  //  - ClusterChecks ? SOLID principles, single responsibility
  public async isIngressControllerInstalled(): Promise<boolean> {
    try {
      const response = await this.networkingApi.listIngressClass();

      return response.body.items.length > 0;
    } catch (e) {
      this.logger.error('Failed to find ingress controller:', e);

      return false;
    }
  }

  // TODO - move this into another class (business logic) that uses K8, that sits outside of kube folder
  //  - ClusterChecks ? SOLID principles, single responsibility
  public async isRemoteConfigPresentInAnyNamespace() {
    try {
      const configmaps = await this.kubeClient.listConfigMapForAllNamespaces(
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

  // TODO - move this into another class (business logic) that uses K8, that sits outside of kube folder
  //  - ClusterChecks ? SOLID principles, single responsibility
  public async isPrometheusInstalled(namespace: NamespaceName) {
    try {
      const pods = await this.kubeClient.listNamespacedPod(
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
      const configmaps = await this.kubeClient.listNamespacedConfigMap(
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

  /* ------------- Utilities ------------- */

  /**
   * @param response - response object from the kubeclient call
   * @param error - body of the response becomes the error if the status is not OK
   * @param errorMessage - the error message to be passed in case it fails
   *
   * @throws SoloError - if the status code is not OK
   */
  private handleKubernetesClientError(
    response: http.IncomingMessage,
    error: Error | unknown,
    errorMessage: string,
  ): void {
    const statusCode = +response?.statusCode || StatusCodes.INTERNAL_SERVER_ERROR;

    if (statusCode <= StatusCodes.ACCEPTED) return;
    errorMessage += `, statusCode: ${statusCode}`;
    this.logger.error(errorMessage, error);

    throw new SoloError(errorMessage, errorMessage, {statusCode: statusCode});
  }

  private getNamespace(): NamespaceName {
    const ns = this.configManager.getFlag<NamespaceName>(flags.namespace);
    if (!ns) throw new MissingArgumentError('namespace is not set');
    return ns;
  }

  public async killPod(podRef: PodRef) {
    return this.pods().readByRef(podRef).killPod();
  }

  // TODO make private once we are instantiating multiple K8 instances
  public setCurrentContext(context: string) {
    return this.contexts().updateCurrent(context);
  }

  public getCurrentContext(): string {
    return this.contexts().readCurrent();
  }

  public getCurrentContextNamespace(): NamespaceName {
    return this.contexts().readCurrentNamespace();
  }

  public getCurrentClusterName(): string {
    return this.clusters().readCurrent();
  }

  public async listSvcs(namespace: NamespaceName, labels: string[]): Promise<Service[]> {
    return this.services().list(namespace, labels);
  }
}
