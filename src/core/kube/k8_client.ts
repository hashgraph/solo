/**
 * SPDX-License-Identifier: Apache-2.0
 */
import * as k8s from '@kubernetes/client-node';
import {type Context, type V1Lease, V1ObjectMeta, type V1Pod, V1Secret} from '@kubernetes/client-node';
import fs from 'fs';
import net from 'net';
import path from 'path';
import {Flags as flags} from '../../commands/flags.js';
import {MissingArgumentError, SoloError} from './../errors.js';
import type * as http from 'node:http';
import {getReasonPhrase, StatusCodes} from 'http-status-codes';
import {sleep} from './../helpers.js';
import * as constants from './../constants.js';
import {HEDERA_HAPI_PATH, ROOT_CONTAINER, SOLO_LOGS_DIR} from './../constants.js';
import {ConfigManager} from './../config_manager.js';
import {SoloLogger} from './../logging.js';
import {type TarCreateFilter} from '../../types/aliases.js';
import {PodName} from './pod_name.js';
import {type ExtendedNetServer, type Optional} from '../../types/index.js';
import {Duration} from './../time/duration.js';
import {inject, injectable} from 'tsyringe-neo';
import {patchInject} from './../container_helper.js';
import {type K8} from './k8.js';
import {type Namespaces} from './namespaces.js';
import {NamespaceName} from './namespace_name.js';
import K8ClientClusters from './k8_client/k8_client_clusters.js';
import {type Clusters} from './clusters.js';
import {type ConfigMaps} from './config_maps.js';
import K8ClientConfigMaps from './k8_client/k8_client_config_maps.js';
import {PodRef} from './pod_ref.js';
import {ContainerRef} from './container_ref.js';
import {K8ClientContainers} from './k8_client/k8_client_containers.js';
import {type Containers} from './containers.js';

/**
 * A kubernetes API wrapper class providing custom functionalities required by solo
 *
 * Note: Take care if the same instance is used for parallel execution, as the behaviour may be unpredictable.
 * For parallel execution, create separate instances by invoking clone()
 */
// TODO rename to K8Client and move to kube folder
@injectable()
export class K8Client implements K8 {
  private cachedContexts: Context[];

  static PodReadyCondition = new Map<string, string>().set(
    constants.POD_CONDITION_READY,
    constants.POD_CONDITION_STATUS_TRUE,
  );

  private kubeConfig!: k8s.KubeConfig;
  kubeClient!: k8s.CoreV1Api;
  private coordinationApiClient: k8s.CoordinationV1Api;
  private networkingApi: k8s.NetworkingV1Api;

  private k8Clusters: K8ClientClusters;
  private k8ConfigMaps: K8ClientConfigMaps;

  private k8Containers: K8ClientContainers;

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
    this.k8Containers = new K8ClientContainers(this.kubeConfig);

    return this; // to enable chaining
  }

  // TODO in the future this will return the namespaces class instance for fluent pattern
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
   * Apply filters to metadata
   * @param items - list of items
   * @param [filters] - an object with metadata fields and value
   * @returns a list of items that match the filters
   */
  private applyMetadataFilter(items: (object | any)[], filters: Record<string, string> = {}) {
    if (!filters) throw new MissingArgumentError('filters are required');

    const matched = [];
    const filterMap = new Map(Object.entries(filters));
    for (const item of items) {
      // match all filters
      let foundMatch = true;
      for (const entry of filterMap.entries()) {
        const field = entry[0];
        const value = entry[1];

        if (item.metadata[field] !== value) {
          foundMatch = false;
          break;
        }
      }

      if (foundMatch) {
        matched.push(item);
      }
    }

    return matched;
  }

  /**
   * Filter a single item using metadata filter
   * @param items - list of items
   * @param [filters] - an object with metadata fields and value
   */
  private filterItem(items: (object | any)[], filters: Record<string, string> = {}) {
    const filtered = this.applyMetadataFilter(items, filters);
    if (filtered.length > 1) throw new SoloError('multiple items found with filters', {filters});
    return filtered[0];
  }

  public async createNamespace(namespace: NamespaceName) {
    // TODO what should the name be if want to create multiple namespaces (theoretical and bad example): createMany(...)
    const payload = {
      metadata: {
        name: namespace.name,
      },
    };

    const resp = await this.kubeClient.createNamespace(payload);
    return resp.response.statusCode === StatusCodes.CREATED;
    // TODO future, the below line will be used, the above will move into the create method in the namespaces class
    // return this.namespaces().create(name);
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

  public async getPodsByLabel(labels: string[] = []) {
    const ns = this.getNamespace();
    const labelSelector = labels.join(',');
    const result = await this.kubeClient.listNamespacedPod(
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

  public async getSvcByName(name: string): Promise<k8s.V1Service> {
    const ns = this.getNamespace();
    const fieldSelector = `metadata.name=${name}`;
    const resp = await this.kubeClient.listNamespacedService(
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

    return this.filterItem(resp.body.items, {name});
  }

  public getClusters(): string[] {
    return this.clusters().list();
  }

  public getContextNames(): string[] {
    const contexts: string[] = [];

    for (const context of this.getContexts()) {
      contexts.push(context.name);
    }

    return contexts;
  }

  private getContexts(): Context[] {
    if (!this.cachedContexts) {
      this.cachedContexts = this.kubeConfig.getContexts();
    }

    return this.cachedContexts;
  }

  public async listDir(containerRef: ContainerRef, destPath: string) {
    return this.containers().byRef(containerRef).listDir(destPath);
  }

  public async hasFile(containerRef: ContainerRef, destPath: string, filters: object = {}) {
    return this.containers().byRef(containerRef).hasFile(destPath, filters);
  }

  public async hasDir(containerRef: ContainerRef, destPath: string) {
    return this.containers().byRef(containerRef).hasDir(destPath);
  }

  public mkdir(containerRef: ContainerRef, destPath: string) {
    return this.containers().byRef(containerRef).mkdir(destPath);
  }

  public async copyTo(
    containerRef: ContainerRef,
    srcPath: string,
    destDir: string,
    filter: TarCreateFilter | undefined = undefined,
  ) {
    return this.containers().byRef(containerRef).copyTo(srcPath, destDir, filter);
  }

  public async copyFrom(containerRef: ContainerRef, srcPath: string, destDir: string) {
    return this.containers().byRef(containerRef).copyFrom(srcPath, destDir);
  }

  public async execContainer(containerRef: ContainerRef, command: string | string[]) {
    return this.containers().byRef(containerRef).execContainer(command);
  }

  public async portForward(podRef: PodRef, localPort: number, podPort: number) {
    try {
      this.logger.debug(
        `Creating port-forwarder for ${podRef.podName.name}:${podPort} -> ${constants.LOCAL_HOST}:${localPort}`,
      );
      const ns = podRef.namespaceName;
      const forwarder = new k8s.PortForward(this.kubeConfig, false);
      const server = (await net.createServer(socket => {
        forwarder.portForward(ns.name, podRef.podName.name, [podPort], socket, null, socket, 3);
      })) as ExtendedNetServer;

      // add info for logging
      server.info = `${podRef.podName.name}:${podPort} -> ${constants.LOCAL_HOST}:${localPort}`;
      server.localPort = localPort;
      this.logger.debug(`Starting port-forwarder [${server.info}]`);
      return server.listen(localPort, constants.LOCAL_HOST);
    } catch (e) {
      const message = `failed to start port-forwarder [${podRef.podName.name}:${podPort} -> ${constants.LOCAL_HOST}:${localPort}]: ${e.message}`;
      this.logger.error(message, e);
      throw new SoloError(message, e);
    }
  }

  public async stopPortForward(server: ExtendedNetServer, maxAttempts = 20, timeout = 500) {
    if (!server) {
      return;
    }

    this.logger.debug(`Stopping port-forwarder [${server.info}]`);

    // try to close the websocket server
    await new Promise<void>((resolve, reject) => {
      server.close(e => {
        if (e) {
          if (e.message?.includes('Server is not running')) {
            this.logger.debug(`Server not running, port-forwarder [${server.info}]`);
            resolve();
          } else {
            this.logger.debug(`Failed to stop port-forwarder [${server.info}]: ${e.message}`, e);
            reject(e);
          }
        } else {
          this.logger.debug(`Stopped port-forwarder [${server.info}]`);
          resolve();
        }
      });
    });

    // test to see if the port has been closed or if it is still open
    let attempts = 0;
    while (attempts < maxAttempts) {
      let hasError = 0;
      attempts++;

      try {
        const isPortOpen = await new Promise(resolve => {
          const testServer = net
            .createServer()
            .once('error', err => {
              if (err) {
                resolve(false);
              }
            })
            .once('listening', () => {
              testServer
                .once('close', () => {
                  hasError++;
                  if (hasError > 1) {
                    resolve(false);
                  } else {
                    resolve(true);
                  }
                })
                .close();
            })
            .listen(server.localPort, '0.0.0.0');
        });
        if (isPortOpen) {
          return;
        }
      } catch {
        return;
      }
      await sleep(Duration.ofMillis(timeout));
    }
    if (attempts >= maxAttempts) {
      throw new SoloError(`failed to stop port-forwarder [${server.info}]`);
    }
  }

  public async waitForPods(
    phases = [constants.POD_PHASE_RUNNING],
    labels: string[] = [],
    podCount = 1,
    maxAttempts = constants.PODS_RUNNING_MAX_ATTEMPTS,
    delay = constants.PODS_RUNNING_DELAY,
    podItemPredicate?: (items: k8s.V1Pod) => boolean,
    namespace?: NamespaceName,
  ): Promise<k8s.V1Pod[]> {
    const ns = namespace || this.getNamespace();
    const labelSelector = labels.join(',');

    this.logger.info(`WaitForPod [labelSelector: ${labelSelector}, namespace:${ns}, maxAttempts: ${maxAttempts}]`);

    return new Promise<k8s.V1Pod[]>((resolve, reject) => {
      let attempts = 0;

      const check = async (resolve: (items: k8s.V1Pod[]) => void, reject: (reason?: Error) => void) => {
        // wait for the pod to be available with the given status and labels
        try {
          const resp = await this.kubeClient.listNamespacedPod(
            ns.name,
            // @ts-ignore
            false,
            false,
            undefined,
            undefined,
            labelSelector,
            podCount,
            undefined,
            undefined,
            undefined,
            Duration.ofMinutes(5).toMillis(),
          );
          this.logger.debug(
            `[attempt: ${attempts}/${maxAttempts}] ${resp.body?.items?.length}/${podCount} pod found [labelSelector: ${labelSelector}, namespace:${ns}]`,
          );
          if (resp.body?.items?.length === podCount) {
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

            if (phaseMatchCount === podCount && (!podItemPredicate || predicateMatchCount === podCount)) {
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
              `Expected number of pod (${podCount}) not found for labels: ${labelSelector}, phases: ${phases.join(',')} [attempts = ${attempts}/${maxAttempts}]`,
            ),
          );
        }
      };

      check(resolve, reject);
    });
  }

  public async waitForPodReady(
    labels: string[] = [],
    podCount = 1,
    maxAttempts = 10,
    delay = 500,
    namespace?: NamespaceName,
  ) {
    try {
      return await this.waitForPodConditions(
        K8Client.PodReadyCondition,
        labels,
        podCount,
        maxAttempts,
        delay,
        namespace,
      );
    } catch (e: Error | unknown) {
      throw new SoloError(`Pod not ready [maxAttempts = ${maxAttempts}]`, e);
    }
  }

  /**
   * Check pods for conditions
   * @param conditionsMap - a map of conditions and values
   * @param [labels] - pod labels
   * @param [podCount] - number of pod expected
   * @param [maxAttempts] - maximum attempts to check
   * @param [delay] - delay between checks in milliseconds
   */
  private async waitForPodConditions(
    conditionsMap: Map<string, string>,
    labels: string[] = [],
    podCount = 1,
    maxAttempts = 10,
    delay = 500,
    namespace?: NamespaceName,
  ) {
    if (!conditionsMap || conditionsMap.size === 0) throw new MissingArgumentError('pod conditions are required');

    return await this.waitForPods(
      [constants.POD_PHASE_RUNNING],
      labels,
      podCount,
      maxAttempts,
      delay,
      pod => {
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
      },
      namespace,
    );
  }

  public async listPvcsByNamespace(namespace: NamespaceName, labels: string[] = []) {
    const pvcs: string[] = [];
    const labelSelector = labels.join(',');
    const resp = await this.kubeClient.listNamespacedPersistentVolumeClaim(
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

    for (const item of resp.body.items) {
      pvcs.push(item.metadata!.name as string);
    }

    return pvcs;
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
    const resp = await this.kubeClient.deleteNamespacedPersistentVolumeClaim(name, namespace.name);

    return resp.response.statusCode === StatusCodes.OK;
  }

  // --------------------------------------- Utility Methods --------------------------------------- //

  // TODO this can be removed once K8 is context/cluster specific when instantiating
  public async testContextConnection(context: string): Promise<boolean> {
    this.kubeConfig.setCurrentContext(context);

    const tempKubeClient = this.kubeConfig.makeApiClient(k8s.CoreV1Api);
    return await tempKubeClient
      .listNamespace()
      .then(() => true)
      .catch(() => false);
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
    try {
      const result = await this.kubeClient.deleteNamespacedPod(
        podRef.podName.name,
        podRef.namespaceName.name,
        undefined,
        undefined,
        1,
      );
      if (result.response.statusCode !== StatusCodes.OK) {
        throw new SoloError(
          `Failed to delete pod ${podRef.podName.name} in namespace ${podRef.namespaceName.name}: statusCode: ${result.response.statusCode}`,
        );
      }
      let podExists = true;
      while (podExists) {
        const pod = await this.getPodByName(podRef);
        if (!pod?.metadata?.deletionTimestamp) {
          podExists = false;
        } else {
          await sleep(Duration.ofSeconds(1));
        }
      }
    } catch (e) {
      const errorMessage = `Failed to delete pod ${podRef.podName.name} in namespace ${podRef.namespaceName.name}: ${e.message}`;
      if (e.body?.code === StatusCodes.NOT_FOUND || e.response?.body?.code === StatusCodes.NOT_FOUND) {
        this.logger.info(`Pod not found: ${errorMessage}`, e);
        return;
      }
      this.logger.error(errorMessage, e);
      throw new SoloError(errorMessage, e);
    }
  }

  /**
   * Download logs files from all network pods and save to local solo log directory
   * @param namespace - the namespace of the network
   * @returns a promise that resolves when the logs are downloaded
   */
  // TODO move this to new class src/core/NetworkNodes.getLogs()
  public async getNodeLogs(namespace: NamespaceName) {
    const pods = await this.getPodsByLabel(['solo.hedera.com/type=network-node']);

    const timeString = new Date().toISOString().replace(/:/g, '-').replace(/\./g, '-');

    const promises = [];
    for (const pod of pods) {
      promises.push(this.getNodeLog(pod, namespace, timeString));
    }
    return await Promise.all(promises);
  }

  private async getNodeLog(pod: V1Pod, namespace: NamespaceName, timeString: string) {
    const podRef = PodRef.of(namespace, PodName.of(pod.metadata!.name));
    this.logger.debug(`getNodeLogs(${pod.metadata.name}): begin...`);
    const targetDir = path.join(SOLO_LOGS_DIR, namespace.name, timeString);
    try {
      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, {recursive: true});
      }
      const containerRef = ContainerRef.of(podRef, ROOT_CONTAINER);
      const scriptName = 'support-zip.sh';
      const sourcePath = path.join(constants.RESOURCES_DIR, scriptName); // script source path
      await this.copyTo(containerRef, sourcePath, `${HEDERA_HAPI_PATH}`);
      await sleep(Duration.ofSeconds(3)); // wait for the script to sync to the file system
      await this.execContainer(containerRef, [
        'bash',
        '-c',
        `sync ${HEDERA_HAPI_PATH} && sudo chown hedera:hedera ${HEDERA_HAPI_PATH}/${scriptName}`,
      ]);
      await this.execContainer(containerRef, ['bash', '-c', `sudo chmod 0755 ${HEDERA_HAPI_PATH}/${scriptName}`]);
      await this.execContainer(containerRef, `${HEDERA_HAPI_PATH}/${scriptName}`);
      await this.copyFrom(containerRef, `${HEDERA_HAPI_PATH}/data/${podRef.podName.name}.zip`, targetDir);
    } catch (e: Error | unknown) {
      // not throw error here, so we can continue to finish downloading logs from other pods
      // and also delete namespace in the end
      this.logger.error(`${constants.NODE_LOG_FAILURE_MSG} ${podRef}`, e);
    }
    this.logger.debug(`getNodeLogs(${pod.metadata.name}): ...end`);
  }

  /**
   * Download state files from a pod
   * @param namespace - the namespace of the network
   * @param nodeAlias - the pod name
   * @returns a promise that resolves when the state files are downloaded
   */
  public async getNodeStatesFromPod(namespace: NamespaceName, nodeAlias: string) {
    const pods = await this.getPodsByLabel([
      `solo.hedera.com/node-name=${nodeAlias}`,
      'solo.hedera.com/type=network-node',
    ]);

    // get length of pods
    const promises = [];
    for (const pod of pods) {
      promises.push(this.getNodeState(pod, namespace));
    }
    return await Promise.all(promises);
  }

  public async getNodeState(pod: V1Pod, namespace: NamespaceName) {
    const podRef = PodRef.of(namespace, PodName.of(pod.metadata!.name));
    this.logger.debug(`getNodeState(${pod.metadata.name}): begin...`);
    const targetDir = path.join(SOLO_LOGS_DIR, namespace.name);
    try {
      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, {recursive: true});
      }
      const zipCommand = `tar -czf ${HEDERA_HAPI_PATH}/${podRef.podName.name}-state.zip -C ${HEDERA_HAPI_PATH}/data/saved .`;
      const containerRef = ContainerRef.of(podRef, ROOT_CONTAINER);
      await this.execContainer(containerRef, zipCommand);
      await this.copyFrom(containerRef, `${HEDERA_HAPI_PATH}/${podRef.podName.name}-state.zip`, targetDir);
    } catch (e: Error | unknown) {
      this.logger.error(`failed to download state from pod ${podRef.podName.name}`, e);
      this.logger.showUser(`Failed to download state from pod ${podRef.podName.name}` + e);
    }
    this.logger.debug(`getNodeState(${pod.metadata.name}): ...end`);
  }

  // TODO make private once we are instantiating multiple K8 instances
  public setCurrentContext(context: string) {
    this.kubeConfig.setCurrentContext(context);

    // Reinitialize clients
    this.kubeClient = this.kubeConfig.makeApiClient(k8s.CoreV1Api);
    this.coordinationApiClient = this.kubeConfig.makeApiClient(k8s.CoordinationV1Api);
  }

  public getCurrentContext(): string {
    return this.kubeConfig.getCurrentContext();
  }

  public getCurrentContextNamespace(): NamespaceName {
    return NamespaceName.of(this.kubeConfig.getContextObject(this.getCurrentContext())?.namespace);
  }

  public getCurrentClusterName(): string {
    return this.clusters().readCurrent();
  }

  public async listSvcs(namespace: NamespaceName, labels: string[]): Promise<k8s.V1Service[]> {
    const labelSelector = labels.join(',');
    const serviceList = await this.kubeClient.listNamespacedService(
      namespace.name,
      undefined,
      undefined,
      undefined,
      undefined,
      labelSelector,
    );
    return serviceList.body.items;
  }
}
