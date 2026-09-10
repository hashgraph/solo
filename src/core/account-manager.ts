// SPDX-License-Identifier: Apache-2.0

import {SoloErrors} from './errors/solo-errors.js';
import * as Base64 from 'js-base64';
import * as constants from './constants.js';
import {IGNORED_NODE_ACCOUNT_ID} from './constants.js';
import {
  AccountCreateTransaction,
  AccountId,
  type AccountInfo,
  AccountInfoQuery,
  AccountUpdateTransaction,
  Client,
  FileContentsQuery,
  FileId,
  Hbar,
  HbarUnit,
  type Key,
  KeyList,
  Logger,
  LogLevel,
  Long,
  PrecheckStatusError,
  PrivateKey,
  Status,
  TransactionReceipt,
  TransactionResponse,
  TransferTransaction,
} from '@hiero-ledger/sdk';
import {SoloError} from './errors/solo-error.js'; // kept for instanceof checks
import {Templates} from './templates.js';
import {type NetworkNodeServices} from './network-node-services.js';

import {type SoloLogger} from './logging/solo-logger.js';
import {type K8Factory} from '../integration/kube/k8-factory.js';
import {
  type AccountIdWithKeyPairObject,
  type ClusterReferenceName,
  type Context,
  type Optional,
} from '../types/index.js';
import {type NodeAlias, type NodeAliases, type NodeId, type SdkNetworkEndpoint} from '../types/aliases.js';
import {type PodName} from '../integration/kube/resources/pod/pod-name.js';
import {entityId, resolveGossipFqdnRestricted, sleep} from './helpers.js';
import {Duration} from './time/duration.js';
import {inject, injectable} from 'tsyringe-neo';
import {patchInject} from './dependency-injection/container-helper.js';
import {NamespaceName} from '../types/namespace/namespace-name.js';
import {PodReference} from '../integration/kube/resources/pod/pod-reference.js';
import {SecretType} from '../integration/kube/resources/secret/secret-type.js';
import {type Pod} from '../integration/kube/resources/pod/pod.js';
import {InjectTokens} from './dependency-injection/inject-tokens.js';
import {type ClusterReferences, type DeploymentName, Realm, Shard} from './../types/index.js';
import {type Service} from '../integration/kube/resources/service/service.js';
import {SoloService} from './model/solo-service.js';
import {PathEx} from '../business/utils/path-ex.js';
import {type NodeServiceMapping} from '../types/mappings/node-service-mapping.js';
import {type ConsensusNode} from './model/consensus-node.js';
import {NetworkNodeServicesBuilder} from './network-node-services-builder.js';
import {LocalConfigRuntimeState} from '../business/runtime-state/config/local/local-config-runtime-state.js';
import {type RemoteConfigRuntimeStateApi} from '../business/runtime-state/api/remote-config-runtime-state-api.js';
import {Secret} from '../integration/kube/resources/secret/secret.js';
import {Address} from '../business/address/address.js';
import {Numbers} from '../business/utils/numbers.js';
import {type NetworkNodes} from './network-nodes.js';
import {NodeStatusCodes, NodeStatusEnums} from './enumerations.js';

// TODO - revisit and remove once we complete the cutover to BN and no longer need MN to pull from CN.
// This should remove this dependency on @hiero-ledger/proto
import {proto} from '@hiero-ledger/proto';
import * as crypto from 'node:crypto';
import {X509Certificate} from 'node:crypto';

const REASON_FAILED_TO_GET_KEYS: string = 'failed to get keys for accountId';
const REASON_SKIPPED: string = 'skipped since it does not have a genesis key';
const REASON_FAILED_TO_UPDATE_ACCOUNT: string = 'failed to update account keys';
const REASON_FAILED_TO_CREATE_K8S_S_KEY: string = 'failed to create k8s scrt key';
const FULFILLED: string = 'fulfilled';
const REJECTED: string = 'rejected';

type NodeClientSelection = {type: 'all'; skipNodeAlias?: NodeAlias} | {type: 'only'; nodeAlias: NodeAlias};

const DEFAULT_NODE_CLIENT_SELECTION: NodeClientSelection = {type: 'all'};

@injectable()
export class AccountManager {
  private _portForwards: number[];
  private _forcePortForward: boolean = false;
  private _portForwardCreationLock: Promise<void> = Promise.resolve();
  private _nextPortForwardScanStart: number = 0;
  public _nodeClient: Optional<Client>;

  public constructor(
    @inject(InjectTokens.SoloLogger) private readonly logger?: SoloLogger,
    @inject(InjectTokens.K8Factory) private readonly k8Factory?: K8Factory,
    @inject(InjectTokens.RemoteConfigRuntimeState) private readonly remoteConfig?: RemoteConfigRuntimeStateApi,
    @inject(InjectTokens.LocalConfigRuntimeState) private readonly localConfig?: LocalConfigRuntimeState,
    @inject(InjectTokens.NetworkNodes) private readonly networkNodes?: NetworkNodes,
  ) {
    this.logger = patchInject(logger, InjectTokens.SoloLogger, this.constructor.name);
    this.k8Factory = patchInject(k8Factory, InjectTokens.K8Factory, this.constructor.name);
    this.remoteConfig = patchInject(remoteConfig, InjectTokens.RemoteConfigRuntimeState, this.constructor.name);
    this.localConfig = patchInject(localConfig, InjectTokens.LocalConfigRuntimeState, this.constructor.name);
    this.networkNodes = patchInject(networkNodes, InjectTokens.NetworkNodes, this.constructor.name);

    this._portForwards = [];
    this._nodeClient = undefined;
  }

  /**
   * Gets the account keys from the Kubernetes secret from which it is stored
   * @param accountId - the account ID for which we want its keys
   * @param namespace - the namespace storing the secret
   */
  public async getAccountKeysFromSecret(
    accountId: string,
    namespace: NamespaceName,
  ): Promise<AccountIdWithKeyPairObject> {
    const contexts: Context[] = this.remoteConfig.getContexts();

    for (const context of contexts) {
      try {
        const secrets: Secret[] = await this.k8Factory
          .getK8(context)
          .secrets()
          .list(namespace, [Templates.renderAccountKeySecretLabelSelector(accountId)]);

        if (secrets.length > 0) {
          const secret: Secret = secrets[0];
          return {
            accountId: secret.labels['solo.hedera.com/account-id'],
            privateKey: Base64.decode(secret.data.privateKey),
            publicKey: Base64.decode(secret.data.publicKey),
          };
        }
      } catch (error) {
        if (!(error instanceof SoloErrors.system.resourceNotFound)) {
          throw error;
        }
      }
    }

    // if it isn't in the secrets we can load genesis key
    return {
      accountId,
      privateKey: constants.GENESIS_KEY,
      publicKey: PrivateKey.fromStringED25519(constants.GENESIS_KEY).publicKey.toString(),
    };
  }

  /**
   * Read a consensus node's gossip signing public certificate (PEM) from its Kubernetes secret.
   *
   * This is the source of truth for the gossip public certificate after `network deploy` removes the
   * on-disk keys (when `--debug` is off). The gossip secret stores each key file under its original
   * basename, so the public certificate lives under the `s-public-<node>.pem` data key.
   * @param consensusNode - the node whose gossip public certificate is needed
   */
  public async getGossipPublicKeyPem(consensusNode: ConsensusNode): Promise<string> {
    const secretName: string = Templates.renderGossipKeySecretName(consensusNode.name);
    const dataKey: string = Templates.renderGossipPemPublicKeyFile(consensusNode.name);

    let secret: Secret;
    try {
      secret = await this.k8Factory
        .getK8(consensusNode.context)
        .secrets()
        .read(NamespaceName.of(consensusNode.namespace), secretName);
    } catch (error) {
      throw new SoloErrors.component.gossipKeySecretRestoreFailed(
        consensusNode.name,
        `failed to read secret '${secretName}'`,
        error,
      );
    }

    const encodedCertificate: string | undefined = secret?.data?.[dataKey];
    if (!encodedCertificate) {
      throw new SoloErrors.component.gossipKeySecretRestoreFailed(
        consensusNode.name,
        `secret '${secretName}' is missing data key '${dataKey}'`,
      );
    }

    return Base64.decode(encodedCertificate);
  }

  /**
   * Gets the treasury account private key from Kubernetes secret if it exists, else
   * returns the Genesis private key, then will return an AccountInfo object with the
   * accountId, ed25519PrivateKey, publicKey
   * @param namespace - the namespace that the secret is in
   * @param deploymentName
   */
  public async getTreasuryAccountKeys(
    namespace: NamespaceName,
    deploymentName: DeploymentName,
  ): Promise<AccountIdWithKeyPairObject> {
    // check to see if the treasure account is in the secrets
    return await this.getAccountKeysFromSecret(this.getTreasuryAccountId(deploymentName).toString(), namespace);
  }

  /**
   * batch up the accounts into sets to be processed
   * @param [accountRange]
   * @returns an array of arrays of numbers representing the accounts to update
   */
  public batchAccounts(accountRange: number[][] = constants.SYSTEM_ACCOUNTS): number[][] {
    const batchSize: number = constants.ACCOUNT_UPDATE_BATCH_SIZE as number;
    const batchSets: number[][] = [];

    let currentBatch: number[] = [];
    for (const [start, end] of accountRange) {
      let batchCounter: number = start;
      for (let index: number = start; index <= end; index++) {
        currentBatch.push(index);
        batchCounter++;

        if (batchCounter % batchSize === 0) {
          batchSets.push(currentBatch);
          currentBatch = [];
          batchCounter = 0;
        }
      }
    }

    if (currentBatch.length > 0) {
      batchSets.push(currentBatch);
    }

    batchSets.push([constants.TREASURY_ACCOUNT]);

    return batchSets;
  }

  /** stops and closes the port forwards and the _nodeClient */
  public async close(): Promise<void> {
    this._nodeClient?.close();
    if (this._portForwards) {
      for (const srv of this._portForwards) {
        await this.k8Factory.default().pods().readByReference(null).stopPortForward(srv);
      }
    }

    this._nodeClient = undefined;
    this._portForwards = [];
    this._nextPortForwardScanStart = 0;
    this.logger.debug('node client and port forwards have been closed');
  }

  /**
   * Serializes port-forward creation so that concurrent {@link configureNodeAccess} calls cannot race
   * {@link Pod.portForward}'s available-port scan onto the same local port: a freshly spawned forwarder is not
   * listening yet, so a concurrent scan would consider its port free and assign it to another node.
   * @param action - the port-forward mutation to run while holding the lock
   * @returns the result of the action
   */
  private async withPortForwardCreationLock<T>(action: () => Promise<T>): Promise<T> {
    const previousLock: Promise<void> = this._portForwardCreationLock;
    let releaseLock: () => void;
    this._portForwardCreationLock = new Promise<void>((resolve): void => {
      releaseLock = resolve;
    });
    await previousLock;
    try {
      return await action();
    } finally {
      releaseLock();
    }
  }

  /**
   * loads and initializes the Node Client
   * @param namespace - the namespace of the network
   * @param clusterReferences - the cluster references
   * @param [deployment] - k8 deployment name
   * @param [forcePortForward] - whether to force the port forward
   */
  public async loadNodeClient(
    namespace: NamespaceName,
    clusterReferences: ClusterReferences,
    deployment: DeploymentName,
    forcePortForward?: boolean,
  ): Promise<Client> {
    try {
      this.logger.debug(
        `loading node client: [!this._nodeClient=${!this._nodeClient}, this._nodeClient.isClientShutDown=${this._nodeClient?.isClientShutDown}]`,
      );
      if (!this._nodeClient || this._nodeClient?.isClientShutDown) {
        this.logger.debug(
          `refreshing node client: [!this._nodeClient=${!this._nodeClient}, this._nodeClient.isClientShutDown=${this._nodeClient?.isClientShutDown}]`,
        );
        await this.refreshNodeClient(namespace, clusterReferences, deployment, forcePortForward);
      } else {
        try {
          if (!constants.SKIP_NODE_PING) {
            await this._nodeClient.ping(this._nodeClient.operatorAccountId);
          }
        } catch {
          this.logger.debug('node client ping failed, refreshing node client');
          await this.refreshNodeClient(namespace, clusterReferences, deployment, forcePortForward);
        }
      }

      return this._nodeClient!;
    } catch (error) {
      throw new SoloErrors.component.nodeClientLoadFailed(error);
    }
  }

  private selectNodeServices(
    networkNodeServicesMap: NodeServiceMapping,
    selection: NodeClientSelection,
  ): NodeServiceMapping {
    if (selection.type === 'all') {
      return networkNodeServicesMap;
    }

    const targetNodeService: NetworkNodeServices | undefined = networkNodeServicesMap.get(selection.nodeAlias);

    if (!targetNodeService) {
      throw new SoloErrors.component.nodeServiceNotFound(selection.nodeAlias);
    }

    return new Map<NodeAlias, NetworkNodeServices>([[selection.nodeAlias, targetNodeService]]);
  }

  public async refreshNodeClient(
    namespace: NamespaceName,
    clusterReferences: ClusterReferences,
    deployment: DeploymentName,
    forcePortForward?: boolean,
    selection: NodeClientSelection = DEFAULT_NODE_CLIENT_SELECTION,
  ): Promise<Client> {
    try {
      await this.close();
      if (forcePortForward !== undefined) {
        this._forcePortForward = forcePortForward;
      }

      const treasuryAccountInfo: AccountIdWithKeyPairObject = await this.getTreasuryAccountKeys(namespace, deployment);
      const networkNodeServicesMap: NodeServiceMapping = await this.getNodeServiceMap(
        namespace,
        clusterReferences,
        deployment,
      );

      const selectedNodeServicesMap: NodeServiceMapping = this.selectNodeServices(networkNodeServicesMap, selection);
      const nodeClient: Client = await this._getNodeClient(
        namespace,
        selectedNodeServicesMap,
        treasuryAccountInfo.accountId,
        treasuryAccountInfo.privateKey,
        selection.type === 'all' ? selection.skipNodeAlias : undefined,
        selection.type === 'only',
      );

      this.logger.debug(
        selection.type === 'only'
          ? `single-node client has been refreshed for node '${selection.nodeAlias}'`
          : 'node client has been refreshed',
      );

      return nodeClient;
    } catch (error) {
      throw new SoloErrors.component.nodeClientRefreshFailed(error);
    }
  }

  /**
   * if the load balancer IP is not set, then we should use the local host port forward
   * @param networkNodeServices
   * @returns whether to use the local host port forward
   */
  private shouldUseLocalHostPortForward(networkNodeServices: NetworkNodeServices): boolean {
    return this._forcePortForward || !networkNodeServices.haProxyLoadBalancerIp;
  }

  /**
   * Returns a node client that can be used to make calls against
   * @param namespace - the namespace for which the node client resides
   * @param networkNodeServicesMap - a map of the service objects that proxy the nodes
   * @param operatorId - the account id of the operator of the transactions
   * @param operatorKey - the private key of the operator of the transactions
   * @param skipNodeAlias - the node alias to skip
   * @param skipAssignment
   * @returns a node client that can be used to call transactions
   */
  public async _getNodeClient(
    namespace: NamespaceName,
    networkNodeServicesMap: NodeServiceMapping,
    operatorId: string,
    operatorKey: string,
    skipNodeAlias?: NodeAlias | undefined,
    skipAssignment: boolean = false,
  ): Promise<Client> {
    let nodes: Record<SdkNetworkEndpoint, AccountId> = {};
    const configureNodeAccessPromiseArray: Promise<Record<SdkNetworkEndpoint, AccountId>>[] = [];

    try {
      let localPort: number = constants.LOCAL_NODE_START_PORT;

      for (const networkNodeService of networkNodeServicesMap.values()) {
        if (
          networkNodeService.accountId !== IGNORED_NODE_ACCOUNT_ID &&
          networkNodeService.nodeAlias !== skipNodeAlias
        ) {
          configureNodeAccessPromiseArray.push(
            this.configureNodeAccess(networkNodeService, localPort, networkNodeServicesMap.size),
          );
          localPort++;
        }
      }
      this.logger.debug(`configuring node access for ${configureNodeAccessPromiseArray.length} nodes`);

      await Promise.allSettled(configureNodeAccessPromiseArray).then((results): void => {
        for (const result of results) {
          switch (result.status) {
            case REJECTED: {
              throw new SoloErrors.component.nodeAccessConfigFailed(
                new Error(String((result as PromiseRejectedResult).reason)),
              );
            }
            case FULFILLED: {
              nodes = {...nodes, ...(result as PromiseFulfilledResult<Record<NodeAlias, AccountId>>).value};
              break;
            }
          }
        }
      });
      this.logger.debug(`configured node access for ${Object.keys(nodes).length} nodes`);

      // a collision would silently drop nodes from the client's network map and route transactions to the wrong node
      if (Object.keys(nodes).length !== configureNodeAccessPromiseArray.length) {
        throw new SoloErrors.component.nodeAccessConfigFailed(
          new Error(
            `network endpoint collision: configured ${configureNodeAccessPromiseArray.length} nodes but resolved only ${Object.keys(nodes).length} distinct endpoints`,
          ),
        );
      }

      let formattedNetworkConnection: string = '';
      for (const key of Object.keys(nodes)) {
        formattedNetworkConnection += `${key}:${nodes[key]}, `;
      }
      this.logger.info(`creating client from network configuration: [${formattedNetworkConnection}]`);

      // scheduleNetworkUpdate is set to false, because the ports 50212/50211 are hardcoded in JS SDK that will not work
      // when running locally or in a pipeline
      const nodeClient: Client = Client.fromConfig({network: nodes, scheduleNetworkUpdate: false});
      nodeClient.setOperator(operatorId, operatorKey);
      nodeClient.setLogger(new Logger(LogLevel.Trace, PathEx.join(constants.SOLO_LOGS_DIR, 'hashgraph-sdk.log')));
      nodeClient.setMaxAttempts(constants.NODE_CLIENT_MAX_ATTEMPTS as number);
      nodeClient.setMinBackoff(constants.NODE_CLIENT_MIN_BACKOFF as number);
      nodeClient.setMaxBackoff(constants.NODE_CLIENT_MAX_BACKOFF as number);
      nodeClient.setRequestTimeout(constants.NODE_CLIENT_REQUEST_TIMEOUT as number);
      nodeClient.setMaxQueryPayment(new Hbar(constants.NODE_CLIENT_MAX_QUERY_PAYMENT));

      if (!skipAssignment) {
        this._nodeClient = nodeClient;
      }

      // ping the node client to ensure it is working
      if (!constants.SKIP_NODE_PING) {
        await nodeClient.ping(AccountId.fromString(operatorId));
      }

      return nodeClient;
    } catch (error) {
      throw new SoloErrors.component.nodeClientSetupFailed(error);
    }
  }

  private async configureNodeAccess(
    networkNodeService: NetworkNodeServices,
    localPort: number,
    totalNodes: number,
  ): Promise<Record<SdkNetworkEndpoint, AccountId>> {
    this.logger.debug(`configuring node access for node: ${networkNodeService.nodeAlias}`);

    const port: number = +networkNodeService.haProxyGrpcPort;
    const accountId: AccountId = AccountId.fromString(networkNodeService.accountId as string);

    try {
      // if the load balancer IP is set, then we should use that and avoid the local host port forward
      if (!this.shouldUseLocalHostPortForward(networkNodeService)) {
        const host: string = networkNodeService.haProxyLoadBalancerIp as string;
        const endpoint: SdkNetworkEndpoint = `${host}:${port}`;
        this.logger.debug(`using load balancer IP: ${endpoint}`);

        try {
          const object: Record<SdkNetworkEndpoint, AccountId> = {[endpoint]: accountId};
          await this.sdkPingNetworkNode(object, accountId);
          this.logger.debug(`successfully pinged network node: ${endpoint}`);

          return object;
        } catch {
          // if the connection fails, then we should use the local host port forward
        }
      }
      // if the load balancer IP is not set or the test connection fails, then we should use the local host port forward
      const host: string = '127.0.0.1';

      let forwardedPort: number = localPort;
      if (this._portForwards.length < totalNodes) {
        forwardedPort = await this.withPortForwardCreationLock(async (): Promise<number> => {
          // start the available-port scan above every port already handed out, so ports occupied by stale
          // forwarders from earlier refreshes cannot funnel concurrent creations onto the same fallback port
          const scanStartPort: number = Math.max(localPort, this._nextPortForwardScanStart);
          const newPort: number = await this.k8Factory
            .getK8(networkNodeService.context)
            .pods()
            .readByReference(PodReference.of(networkNodeService.namespace, networkNodeService.haProxyPodName))
            .portForward(scanStartPort, port);
          this._nextPortForwardScanStart = newPort + 1;
          this._portForwards.push(newPort);
          return newPort;
        });
        this.logger.debug(`using local host port forward: ${host}:${forwardedPort}`);
      }

      const endpoint: SdkNetworkEndpoint = `${host}:${forwardedPort}`;
      const object: Record<SdkNetworkEndpoint, AccountId> = {[endpoint]: accountId};

      return await this.testNodeClientConnection(object, accountId, networkNodeService, forwardedPort);
    } catch (error) {
      throw new SoloErrors.component.nodeAccessConfigFailed(error);
    }
  }

  /**
   * pings the network node to ensure that the connection is working, retrying and recreating the local
   * port-forward when the consensus node reports ACTIVE (indicating a broken tunnel rather than an unhealthy node)
   * @param object - the object containing the network node endpoint and account id
   * @param accountId - the account id to ping
   * @param networkNodeService - the services of the node being pinged, used for diagnostics and port-forward recovery
   * @param localPort - the local port currently forwarded to the node's HAProxy grpc port
   * @returns the (possibly re-keyed) endpoint-to-account map that succeeded
   * @throws {@link SoloError} if the ping fails after all retries
   */
  private async testNodeClientConnection(
    object: Record<SdkNetworkEndpoint, AccountId>,
    accountId: AccountId,
    networkNodeService: NetworkNodeServices,
    localPort: number,
  ): Promise<Record<SdkNetworkEndpoint, AccountId>> {
    const maxRetries: number = constants.NODE_CLIENT_SDK_PING_MAX_RETRIES;
    const sleepInterval: number = constants.NODE_CLIENT_SDK_PING_RETRY_INTERVAL;

    let currentRetry: number = 0;
    let currentPort: number = localPort;
    let lastError: Error | undefined;
    let lastPlatformStatus: string | undefined;

    while (currentRetry < maxRetries) {
      try {
        this.logger.debug(
          `attempting to sdk ping network node: ${Object.keys(object)[0]}, attempt: ${currentRetry}, of ${maxRetries}`,
        );
        await this.sdkPingNetworkNode(object, accountId);

        return object;
      } catch (error) {
        lastError = error;
        currentRetry++;

        // diagnostic: read the consensus node's platform status (metrics live in the ROOT_CONTAINER, not HAProxy)
        lastPlatformStatus = await this.networkNodes.getNetworkNodePlatformStatusName(
          PodReference.of(networkNodeService.namespace, networkNodeService.nodePodName),
          networkNodeService.context,
        );
        this.logger.error(
          `failed to sdk ping network node: ${Object.keys(object)[0]}, ${error.message}; ` +
            `last consensus node platform status: ${lastPlatformStatus}`,
        );

        // if the node itself is healthy and retries remain, the local port-forward tunnel is the likely culprit; recreate it
        if (lastPlatformStatus === NodeStatusEnums[NodeStatusCodes.ACTIVE] && currentRetry < maxRetries) {
          try {
            await this.withPortForwardCreationLock(async (): Promise<void> => {
              const pod: Pod = this.k8Factory
                .getK8(networkNodeService.context)
                .pods()
                .readByReference(PodReference.of(networkNodeService.namespace, networkNodeService.haProxyPodName));
              await pod.stopPortForward(currentPort);
              const newPort: number = await pod.portForward(currentPort, +networkNodeService.haProxyGrpcPort);
              this._nextPortForwardScanStart = Math.max(this._nextPortForwardScanStart, newPort + 1);
              const index: number = this._portForwards.indexOf(currentPort);
              if (index === -1) {
                this._portForwards.push(newPort);
              } else {
                this._portForwards[index] = newPort;
              }
              if (newPort !== currentPort) {
                object = {[`127.0.0.1:${newPort}` as SdkNetworkEndpoint]: accountId};
                currentPort = newPort;
              }
            });
          } catch (recreateError) {
            // best-effort recovery only: a failed port-forward recreation must not abort the remaining ping retries
            this.logger.warn(
              `failed to recreate port-forward for network node ${networkNodeService.nodeAlias}: ${recreateError.message}`,
            );
          }
        }

        if (currentRetry < maxRetries) {
          await sleep(Duration.ofMillis(sleepInterval));
        }
      }
    }

    throw new SoloErrors.component.sdkPingFailed(Object.keys(object)[0], maxRetries, lastError, lastPlatformStatus);
  }

  /**
   * Gets a Map of the Hedera node services and the attributes needed, throws a SoloError if anything fails
   * @param namespace - the namespace of the solo network deployment
   * @param clusterReferences - the cluster references to use for the services
   * @param deployment - the deployment to use
   * @returns a map of the network node services
   */
  public async getNodeServiceMap(
    namespace: NamespaceName,
    clusterReferences: ClusterReferences,
    deployment: DeploymentName,
  ): Promise<NodeServiceMapping> {
    const labelSelector: string = 'solo.hedera.com/node-name';

    const serviceBuilderMap: Map<NodeAlias, NetworkNodeServicesBuilder> = new Map();

    try {
      const services: SoloService[] = [];
      for (const [clusterReference, context] of clusterReferences) {
        const serviceList: Service[] = await this.k8Factory.getK8(context).services().list(namespace, [labelSelector]);
        services.push(
          ...serviceList.map((service): SoloService =>
            SoloService.getFromK8Service(service, clusterReference, context, deployment),
          ),
        );
      }

      // Resolve once per cluster context so multi-cluster deployments honor each cluster's config.
      const gossipFqdnRestrictedByContext: Map<string, boolean> = new Map();
      for (const context of new Set(clusterReferences.values())) {
        gossipFqdnRestrictedByContext.set(
          context,
          await resolveGossipFqdnRestricted({
            k8: this.k8Factory.getK8(context),
            namespace,
            cacheDir: constants.SOLO_CACHE_DIR,
            resourcesDir: constants.RESOURCES_DIR,
          }),
        );
      }

      // retrieve the list of services and build custom objects for the attributes we need
      for (const service of services) {
        let nodeId: NodeId;
        const clusterReference: ClusterReferenceName = service.clusterReference;

        let serviceBuilder: NetworkNodeServicesBuilder = new NetworkNodeServicesBuilder(
          service.metadata.labels['solo.hedera.com/node-name'] as NodeAlias,
        );

        if (serviceBuilderMap.has(serviceBuilder.key())) {
          serviceBuilder = serviceBuilderMap.get(serviceBuilder.key()) as NetworkNodeServicesBuilder;
        } else {
          serviceBuilder = new NetworkNodeServicesBuilder(
            service.metadata.labels['solo.hedera.com/node-name'] as NodeAlias,
          );
          serviceBuilder.withNamespace(namespace);
          serviceBuilder.withClusterRef(clusterReference);
          serviceBuilder.withContext(clusterReferences.get(clusterReference));
          serviceBuilder.withDeployment(deployment);
        }

        const serviceType: string = service.metadata.labels['solo.hedera.com/type'];
        switch (serviceType) {
          // solo.hedera.com/type: envoy-proxy-svc
          case 'envoy-proxy-svc': {
            serviceBuilder
              .withEnvoyProxyName(service.metadata.name)
              .withEnvoyProxyClusterIp(service.spec.clusterIP)
              .withEnvoyProxyLoadBalancerIp(
                service.status.loadBalancer.ingress ? service.status.loadBalancer.ingress[0].ip : undefined,
              )
              .withEnvoyProxyGrpcWebPort(
                service.spec!.ports!.find((port): boolean => port.name === 'hedera-grpc-web').port,
              );
            break;
          }
          // solo.hedera.com/type: haproxy-svc
          case 'haproxy-svc': {
            serviceBuilder
              .withHaProxyAppSelector(service.spec!.selector!.app)
              .withHaProxyName(service.metadata!.name)
              .withHaProxyClusterIp(service.spec!.clusterIP)
              .withHaProxyLoadBalancerIp(
                service.status.loadBalancer.ingress ? service.status.loadBalancer.ingress[0].ip : undefined,
              )
              .withHaProxyGrpcPort(
                service.spec!.ports!.find((port): boolean => port.name === 'non-tls-grpc-client-port').port,
              )
              .withHaProxyGrpcsPort(
                service.spec!.ports!.find((port): boolean => port.name === 'tls-grpc-client-port').port,
              );
            break;
          }
          // solo.hedera.com/type: network-node-svc
          case 'network-node-svc': {
            if (
              service.metadata!.labels!['solo.hedera.com/node-id'] !== '' &&
              Numbers.isNumeric(service.metadata!.labels!['solo.hedera.com/node-id'])
            ) {
              nodeId = +service.metadata!.labels!['solo.hedera.com/node-id'];
            } else {
              nodeId =
                +`${Templates.nodeIdFromNodeAlias(service.metadata.labels['solo.hedera.com/node-name'] as NodeAlias)}`;
              this.logger.warn(
                `received an incorrect node id of ${service.metadata!.labels!['solo.hedera.com/node-id']} for ` +
                  `${service.metadata.labels['solo.hedera.com/node-name']}`,
              );
            }

            serviceBuilder
              .withAccountId(service.metadata!.labels!['solo.hedera.com/account-id'])
              .withNodeServiceName(service.metadata.name)
              .withNodeServiceClusterIp(service.spec!.clusterIP)
              .withNodeServiceLoadBalancerIp(
                service.status.loadBalancer.ingress ? service.status.loadBalancer.ingress[0].ip : undefined,
              )
              .withNodeServiceGossipPort(service.spec!.ports!.find((port): boolean => port.name === 'gossip').port)
              .withNodeServiceGrpcPort(service.spec!.ports!.find((port): boolean => port.name === 'grpc-non-tls').port)
              .withNodeServiceGrpcsPort(service.spec!.ports!.find((port): boolean => port.name === 'grpc-tls').port);

            if (typeof nodeId === 'number') {
              serviceBuilder.withNodeId(+nodeId);
            }
            break;
          }
        }
        const consensusNode: ConsensusNode = this.remoteConfig
          .getConsensusNodes()
          .find((node): boolean => node.name === serviceBuilder.nodeAlias);

        const address: Address = await Address.getExternalAddress(
          consensusNode,
          this.k8Factory.getK8(serviceBuilder.context),
          0,
          gossipFqdnRestrictedByContext.get(serviceBuilder.context) ?? true,
        );
        serviceBuilder.withExternalAddress(address.hostString());
        serviceBuilderMap.set(serviceBuilder.key(), serviceBuilder);
      }

      // get the pod name for the service to use with portForward if needed
      for (const serviceBuilder of serviceBuilderMap.values()) {
        const podList: Pod[] = await this.k8Factory
          .getK8(serviceBuilder.context)
          .pods()
          .list(namespace, [`app=${serviceBuilder.haProxyAppSelector}`]);
        serviceBuilder.withHaProxyPodName(podList[0].podReference.name);
      }

      for (const [, context] of clusterReferences) {
        // get the pod name of the network node
        const pods: Pod[] = await this.k8Factory
          .getK8(context)
          .pods()
          .list(namespace, ['solo.hedera.com/type=network-node']);
        for (const pod of pods) {
          if (!pod.labels?.hasOwnProperty('solo.hedera.com/node-name')) {
            continue;
          }
          const podName: PodName = pod.podReference.name;
          const nodeAlias: NodeAlias = pod.labels!['solo.hedera.com/node-name'] as NodeAlias;
          const serviceBuilder: NetworkNodeServicesBuilder = serviceBuilderMap.get(
            nodeAlias,
          ) as NetworkNodeServicesBuilder;
          serviceBuilder.withNodePodName(podName);
        }
      }

      const serviceMap: Map<NodeAlias, NetworkNodeServices> = new Map();
      for (const networkNodeServicesBuilder of serviceBuilderMap.values()) {
        serviceMap.set(networkNodeServicesBuilder.key(), networkNodeServicesBuilder.build());
      }

      this.logger.debug('node services have been loaded');
      return serviceMap;
    } catch (error) {
      throw new SoloErrors.component.nodeServicesRetrievalFailed(error);
    }
  }

  /**
   * updates a set of special accounts keys with a newly generated key and stores them in a Kubernetes secret
   * @param namespace the namespace of the nodes network
   * @param currentSet - the accounts to update
   * @param updateSecrets - whether to delete the secret prior to creating a new secret
   * @param resultTracker - an object to keep track of the results from the accounts that are being updated
   * @param deploymentName - the deployment name
   * @returns the updated resultTracker object
   */
  public async updateSpecialAccountsKeys(
    namespace: NamespaceName,
    currentSet: number[],
    updateSecrets: boolean,
    resultTracker: {
      skippedCount: number;
      rejectedCount: number;
      fulfilledCount: number;
    },
    deploymentName: DeploymentName,
  ): Promise<{skippedCount: number; rejectedCount: number; fulfilledCount: number}> {
    const genesisKey: PrivateKey = PrivateKey.fromStringED25519(constants.OPERATOR_KEY);
    const accountUpdatePromiseArray: Promise<
      {value: string; status: string} | {reason: string; value: string; status: string}
    >[] = [];

    for (const accountNumber of currentSet) {
      accountUpdatePromiseArray.push(
        this.updateAccountKeys(
          namespace,
          this.getAccountIdByNumber(deploymentName, accountNumber),
          genesisKey,
          updateSecrets,
        ),
      );
    }

    await Promise.allSettled(accountUpdatePromiseArray).then((results): void => {
      for (const result of results) {
        // @ts-expect-error - TS2339: to avoid type mismatch
        switch (result.value.status) {
          case REJECTED: {
            // @ts-expect-error - TS2339: to avoid type mismatch
            if (result.value.reason === REASON_SKIPPED) {
              resultTracker.skippedCount++;
            } else {
              // @ts-expect-error - TS2339: to avoid type mismatch
              this.logger.error(`REJECT: ${result.value.reason}: ${result.value.value}`);
              resultTracker.rejectedCount++;
            }
            break;
          }
          case FULFILLED: {
            resultTracker.fulfilledCount++;
            break;
          }
        }
      }
    });

    this.logger.debug(
      `Current counts: [fulfilled: ${resultTracker.fulfilledCount}, ` +
        `skipped: ${resultTracker.skippedCount}, ` +
        `rejected: ${resultTracker.rejectedCount}]`,
    );

    return resultTracker;
  }

  /**
   * update the account keys for a given account and store its new key in a Kubernetes secret
   * @param namespace - the namespace of the nodes network
   * @param accountId - the account that will get its keys updated
   * @param genesisKey - the genesis key to compare against
   * @param updateSecrets - whether to delete the secret before creating a new secret
   * @returns the result of the call
   */
  public async updateAccountKeys(
    namespace: NamespaceName,
    accountId: AccountId,
    genesisKey: PrivateKey,
    updateSecrets: boolean,
  ): Promise<{value: string; status: string} | {reason: string; value: string; status: string}> {
    let keys: Key[];
    try {
      keys = await this.getAccountKeys(accountId);
    } catch (error) {
      if (error instanceof SoloErrors.validation.missingArgument) {
        throw error;
      }
      this.logger.error(
        `failed to get keys for accountId ${accountId.toString()}, e: ${error.toString()}\n  ${error.stack}`,
      );
      return {
        status: REJECTED,
        reason: REASON_FAILED_TO_GET_KEYS,
        value: accountId.toString(),
      };
    }

    if (!keys || !keys[0]) {
      return {
        status: REJECTED,
        reason: REASON_FAILED_TO_GET_KEYS,
        value: accountId.toString(),
      };
    }

    if (constants.GENESIS_PUBLIC_KEY.toString() !== keys[0].toString()) {
      this.logger.debug(`account ${accountId.toString()} can be skipped since it does not have a genesis key`);
      return {
        status: REJECTED,
        reason: REASON_SKIPPED,
        value: accountId.toString(),
      };
    }

    this.logger.debug(`updating account ${accountId.toString()} since it is using the genesis key`);

    const newPrivateKey: PrivateKey = PrivateKey.generateED25519();
    try {
      await this.createOrReplaceAccountKeySecret(newPrivateKey, accountId, updateSecrets, namespace);
    } catch (error) {
      this.logger.error(error.message, error);
      return {
        status: REJECTED,
        reason: REASON_FAILED_TO_CREATE_K8S_S_KEY,
        value: accountId.toString(),
      };
    }

    try {
      if (!(await this.sendAccountKeyUpdate(accountId, newPrivateKey, genesisKey))) {
        this.logger.error(`failed to update account keys for accountId ${accountId.toString()}`);
        return {
          status: REJECTED,
          reason: REASON_FAILED_TO_UPDATE_ACCOUNT,
          value: accountId.toString(),
        };
      }
    } catch (error) {
      this.logger.error(`failed to update account keys for accountId ${accountId.toString()}, e: ${error.toString()}`);
      return {
        status: REJECTED,
        reason: REASON_FAILED_TO_UPDATE_ACCOUNT,
        value: accountId.toString(),
      };
    }

    return {
      status: FULFILLED,
      value: accountId.toString(),
    };
  }

  /**
   * creates or replaces the Kubernetes secret for the account key
   * @param privateKey - the private key to store in the secret
   * @param accountId - the account id for which to create the secret
   * @param updateSecrets - whether to replace the secret if it exists
   * @param namespace - the namespace in which to create the secret
   */
  public async createOrReplaceAccountKeySecret(
    privateKey: PrivateKey,
    accountId: AccountId,
    updateSecrets: boolean,
    namespace: NamespaceName,
  ): Promise<void> {
    const data: {privateKey: string; publicKey: string} = {
      privateKey: Base64.encode(privateKey.toString()),
      publicKey: Base64.encode(privateKey.publicKey.toString()),
    };

    try {
      const contexts: Context[] = this.remoteConfig.getContexts();
      for (const context of contexts) {
        const secretName: string = Templates.renderAccountKeySecretName(accountId);
        const secretLabels: {'solo.hedera.com/account-id': string} =
          Templates.renderAccountKeySecretLabelObject(accountId);
        const secretType: SecretType.OPAQUE = SecretType.OPAQUE;

        const createdOrUpdated: boolean = await (updateSecrets
          ? this.k8Factory.getK8(context).secrets().replace(namespace, secretName, secretType, data, secretLabels)
          : this.k8Factory.getK8(context).secrets().create(namespace, secretName, secretType, data, secretLabels));

        if (!createdOrUpdated) {
          throw new SoloErrors.component.accountSecretCreationFailed(accountId.toString());
        }
      }
    } catch (error) {
      throw new SoloErrors.component.accountSecretCreationFailed(accountId.toString(), error);
    }
  }

  /**
   * gets the account info from Hedera network
   * @param accountId - the account
   * @returns the private key of the account
   */
  public async accountInfoQuery(accountId: AccountId | string): Promise<AccountInfo> {
    if (!this._nodeClient) {
      throw new SoloErrors.validation.missingArgument('node client is not initialized');
    }

    return await new AccountInfoQuery()
      .setAccountId(accountId)
      .setMaxAttempts(3)
      .setMaxBackoff(1000)
      .execute(this._nodeClient);
  }

  /**
   * gets the account private and public key from the Kubernetes secret from which it is stored
   * @param accountId - the account
   * @returns the private key of the account
   */
  public async getAccountKeys(accountId: AccountId | string): Promise<Key[]> {
    const accountInfo: AccountInfo = await this.accountInfoQuery(accountId);

    let keys: Key[] = [];
    if (accountInfo.key instanceof KeyList) {
      keys = accountInfo.key.toArray();
    } else {
      keys.push(accountInfo.key);
    }

    return keys;
  }

  /**
   * send an account key update transaction to the network of nodes
   * @param accountId - the account that will get its keys updated
   * @param newPrivateKey - the new private key
   * @param oldPrivateKey - the genesis key that is the current key
   * @returns whether the update was successful
   */
  public async sendAccountKeyUpdate(
    accountId: AccountId | string,
    newPrivateKey: PrivateKey | string,
    oldPrivateKey: PrivateKey | string,
  ): Promise<boolean> {
    if (typeof newPrivateKey === 'string') {
      newPrivateKey = PrivateKey.fromStringED25519(newPrivateKey);
    }

    if (typeof oldPrivateKey === 'string') {
      oldPrivateKey = PrivateKey.fromStringED25519(oldPrivateKey);
    }

    // Create the transaction to update the key on the account
    const transaction: AccountUpdateTransaction = new AccountUpdateTransaction()
      .setAccountId(accountId)
      .setKey(newPrivateKey.publicKey)
      .freezeWith(this._nodeClient);

    // Sign the transaction with the old key and new key
    let signedTransaction: AccountUpdateTransaction = await transaction.sign(oldPrivateKey);
    signedTransaction = await signedTransaction.sign(newPrivateKey);

    // SIgn the transaction with the client operator private key and submit to a Hedera network
    const txResponse: TransactionResponse = await signedTransaction.execute(this._nodeClient);

    // Request the receipt of the transaction
    const receipt: TransactionReceipt = await txResponse.getReceipt(this._nodeClient);

    return receipt.status === Status.Success;
  }

  /**
   * creates a new Hedera account
   * @param namespace - the namespace to store the Kubernetes key secret into
   * @param privateKey - the private key of type PrivateKey
   * @param amount - the amount of HBAR to add to the account
   * @param [setAlias] - whether to set the alias of the account to the public key, requires the ed25519PrivateKey supplied to be ECDSA
   * @param context
   * @returns a custom object with the account information in it
   */
  public async createNewAccount(
    namespace: NamespaceName,
    privateKey: PrivateKey,
    amount: number,
    setAlias: boolean = false,
    context: string,
  ): Promise<{accountId: string; privateKey: string; publicKey: string; balance: number; accountAlias?: string}> {
    const maxAttempts: number = 3;
    const retryDelayMs: number = 250;
    let newAccountResponse: TransactionResponse | undefined;
    let lastError: PrecheckStatusError | undefined;

    for (let attempt: number = 0; attempt < maxAttempts; attempt++) {
      try {
        const newAccountTransaction: AccountCreateTransaction = new AccountCreateTransaction()
          .setKey(privateKey)
          .setInitialBalance(Hbar.from(amount, HbarUnit.Hbar));

        if (setAlias) {
          newAccountTransaction.setAlias(privateKey.publicKey.toEvmAddress());
        }

        newAccountResponse = await newAccountTransaction.execute(this._nodeClient);
        break;
      } catch (error) {
        if (
          error instanceof PrecheckStatusError &&
          error.status === Status.DuplicateTransaction &&
          attempt < maxAttempts - 1
        ) {
          this.logger.warn(
            `Account create returned DUPLICATE_TRANSACTION (attempt ${attempt + 1}/${maxAttempts}), retrying in ${retryDelayMs}ms`,
          );
          lastError = error;
          await sleep(Duration.ofMillis(retryDelayMs));
          continue;
        }
        throw error;
      }
    }

    if (!newAccountResponse) {
      throw lastError!;
    }

    // Get the new account ID
    const transactionReceipt: TransactionReceipt = await newAccountResponse.getReceipt(this._nodeClient);
    const accountInfo: {
      accountId: string;
      privateKey: string;
      publicKey: string;
      balance: number;
      accountAlias?: string;
    } = {
      accountId: transactionReceipt.accountId!.toString(),
      privateKey: privateKey.toString(),
      publicKey: privateKey.publicKey.toString(),
      balance: amount,
    };

    // add the account alias if setAlias is true
    if (setAlias) {
      const accountId: string = accountInfo.accountId;
      const realm: Long = transactionReceipt.accountId!.realm;
      const shard: Long = transactionReceipt.accountId!.shard;
      const accountInfoQueryResult: AccountInfo = await this.accountInfoQuery(accountId);
      accountInfo.accountAlias = entityId(shard, realm, accountInfoQueryResult.contractAccountId);
    }

    try {
      const accountSecretCreated: boolean = await this.k8Factory
        .getK8(context)
        .secrets()
        .createOrReplace(
          namespace,
          Templates.renderAccountKeySecretName(accountInfo.accountId),
          SecretType.OPAQUE,
          {
            privateKey: Base64.encode(accountInfo.privateKey),
            publicKey: Base64.encode(accountInfo.publicKey),
          },
          Templates.renderAccountKeySecretLabelObject(accountInfo.accountId),
        );

      if (!accountSecretCreated) {
        this.logger.error(
          `new account created [accountId=${accountInfo.accountId}, amount=${amount} HBAR, publicKey=${accountInfo.publicKey}, privateKey=${accountInfo.privateKey}] but failed to create secret in Kubernetes`,
        );

        throw new SoloErrors.component.accountSecretCreationFailed(accountInfo.accountId.toString());
      }
    } catch (error) {
      if (error instanceof SoloError) {
        throw error;
      }
      throw new SoloErrors.component.accountSecretCreationFailed(accountInfo.accountId.toString(), error);
    }

    return accountInfo;
  }

  /**
   * transfer the specified amount of HBAR from one account to another
   * @param fromAccountId - the account to pull the HBAR from
   * @param toAccountId - the account to put the HBAR
   * @param hbarAmount - the amount of HBAR
   * @returns if the transaction was successfully posted
   */
  public async transferAmount(
    fromAccountId: AccountId | string,
    toAccountId: AccountId | string,
    hbarAmount: number,
  ): Promise<boolean> {
    try {
      const transaction: TransferTransaction = new TransferTransaction()
        .addHbarTransfer(fromAccountId, new Hbar(-1 * hbarAmount))
        .addHbarTransfer(toAccountId, new Hbar(hbarAmount))
        .freezeWith(this._nodeClient);

      const txResponse: TransactionResponse = await transaction.execute(this._nodeClient);

      const receipt: TransactionReceipt = await txResponse.getReceipt(this._nodeClient);

      this.logger.debug(
        `The transfer from account ${fromAccountId} to account ${toAccountId} for amount ${hbarAmount} was ${receipt.status.toString()} `,
      );

      return receipt.status === Status.Success;
    } catch (error) {
      throw new SoloErrors.component.accountTransferFailed(error);
    }
  }

  /**
   * Fetch and prepare address book as a base64 string
   */
  public async prepareAddressBookBase64(
    namespace: NamespaceName,
    clusterReferences: ClusterReferences,
    deployment: DeploymentName,
    operatorId: string,
    operatorKey: string,
    forcePortForward: boolean,
  ): Promise<string> {
    // fetch AddressBook
    await this.loadNodeClient(namespace, clusterReferences, deployment, forcePortForward);
    const client: Client = this._nodeClient;

    if (operatorId && operatorKey) {
      client.setOperator(operatorId, operatorKey);
    }

    const realm: Realm = this.localConfig.configuration.realmForDeployment(deployment);
    const shard: Shard = this.localConfig.configuration.shardForDeployment(deployment);
    const fileId: FileId = new FileId(shard, realm, FileId.ADDRESS_BOOK.num);

    // The SDK does not retry INVALID_NODE_ACCOUNT for queries (only for transactions), so we
    // retry here to handle the race where a node's gRPC endpoint is up but its Hedera state
    // has not finished initializing yet.
    const maxAttempts: number = 5;
    const retryDelayMs: number = 5000;
    let lastError: PrecheckStatusError | undefined;

    for (let attempt: number = 0; attempt < maxAttempts; attempt++) {
      try {
        return Buffer.from(await new FileContentsQuery().setFileId(fileId).execute(client)).toString('base64');
      } catch (error) {
        if (
          error instanceof PrecheckStatusError &&
          error.status === Status.InvalidNodeAccount &&
          attempt < maxAttempts - 1
        ) {
          this.logger.warn(
            `Address book query returned INVALID_NODE_ACCOUNT (attempt ${attempt + 1}/${maxAttempts}), retrying in ${retryDelayMs}ms`,
          );
          lastError = error;
          await sleep(Duration.ofMillis(retryDelayMs));
        } else {
          throw error;
        }
      }
    }

    throw lastError!;
  }

  public async getFileContents(
    namespace: NamespaceName,
    fileNumber: number,
    clusterReferences: ClusterReferences,
    deployment?: DeploymentName,
    forcePortForward?: boolean,
  ): Promise<string> {
    await this.loadNodeClient(namespace, clusterReferences, deployment, forcePortForward);
    const client: Client = this._nodeClient;
    const realm: number | Long = this.localConfig.configuration.realmForDeployment(deployment);
    const shard: number | Long = this.localConfig.configuration.shardForDeployment(deployment);
    const fileId: FileId = FileId.fromString(entityId(shard, realm, fileNumber));
    const queryFees: FileContentsQuery = new FileContentsQuery().setFileId(fileId);
    return Buffer.from(await queryFees.execute(client)).toString('hex');
  }

  /**
   * Build and prepare the address book as a base64 string, reading each node's gossip signing public
   * certificate from its Kubernetes secret and the node topology from RemoteConfig. The gossip secrets
   * are created during `network deploy`, which also removes the on-disk keys when `--debug` is off, so
   * the secret is the source of truth for the certificate.
   * @param deployment - deployment name, used to derive per-node account IDs
   */
  public async buildAddressBookBase64(deployment: DeploymentName): Promise<string> {
    const consensusNodes: ConsensusNode[] = this.remoteConfig.getConsensusNodes();
    const nodeAliases: NodeAlias[] = consensusNodes.map((node: ConsensusNode): NodeAlias => node.name);
    const accountMap: Map<NodeAlias, string> = this.getNodeAccountMap(nodeAliases, deployment);

    const nodeAddresses: proto.INodeAddress[] = [];

    for (const consensusNode of consensusNodes) {
      const nodeAlias: NodeAlias = consensusNode.name;
      const accountIdString: string | undefined = accountMap.get(nodeAlias);
      if (!accountIdString || accountIdString === IGNORED_NODE_ACCOUNT_ID) {
        continue;
      }

      const accountId: AccountId = AccountId.fromString(accountIdString);

      // Use the pre-computed FQDN from ConsensusNode — always a cluster-internal domain name.
      const serviceEndpoint: proto.IServiceEndpoint = {
        domainName: consensusNode.fullyQualifiedDomainName,
        port: constants.GRPC_PORT,
      };

      // Read the gossip signing certificate from the node's Kubernetes secret.
      // The mirror node importer uses the embedded public key to verify record file signatures.
      let rsaPubKeyHex: string | undefined;
      try {
        const pemData: string = await this.getGossipPublicKeyPem(consensusNode);
        const cert: X509Certificate = new crypto.X509Certificate(pemData);
        const derBuffer: Buffer = cert.publicKey.export({type: 'spki', format: 'der'}) as Buffer;
        rsaPubKeyHex = derBuffer.toString('hex');
      } catch (error) {
        this.logger.warn(
          `Could not read gossip signing key for ${nodeAlias} from its Kubernetes secret: ${error.message}. ` +
            'Address book entry will have no RSA_PubKey; mirror node importer may fail signature verification.',
        );
      }

      nodeAddresses.push({
        nodeId: Long.fromNumber(consensusNode.nodeId),
        nodeAccountId: {
          shardNum: Long.fromNumber(Number(accountId.shard)),
          realmNum: Long.fromNumber(Number(accountId.realm)),
          accountNum: Long.fromNumber(Number(accountId.num)),
        },
        RSA_PubKey: rsaPubKeyHex,
        serviceEndpoint: [serviceEndpoint],
        description: nodeAlias,
      });
    }

    this.logger.debug(`Built local address book with ${nodeAddresses.length} nodes for deployment ${deployment}`);

    const addressBookBytes: Uint8Array = proto.NodeAddressBook.encode({nodeAddress: nodeAddresses}).finish();
    return Buffer.from(addressBookBytes).toString('base64');
  }

  /**
   * Pings the network node with a grpc call to ensure it is working, throws a SoloError if the ping fails
   * @param object
   * @param accountId - the account id to ping
   * @throws {@link SoloError} if the ping fails
   */
  private async sdkPingNetworkNode(object: Record<SdkNetworkEndpoint, AccountId>, accountId: AccountId): Promise<void> {
    let nodeClient: Client;
    try {
      nodeClient = Client.fromConfig({network: object, scheduleNetworkUpdate: false});
      this.logger.debug(`sdk pinging network node: ${Object.keys(object)[0]}`);

      if (!constants.SKIP_NODE_PING) {
        await nodeClient.ping(accountId);
      }
      this.logger.debug(`sdk ping successful for network node: ${Object.keys(object)[0]}`);

      return;
    } catch (error) {
      throw new SoloErrors.component.sdkPingFailed(Object.keys(object)[0], 1, error);
    } finally {
      if (nodeClient) {
        try {
          nodeClient.close();
        } catch {
          // continue if nodeClient.close() fails
        }
      }
    }
  }

  public getAccountIdByNumber(deployment: DeploymentName, number: number | Long): AccountId {
    const realm: number | Long = this.localConfig.configuration.realmForDeployment(deployment);
    const shard: number | Long = this.localConfig.configuration.shardForDeployment(deployment);
    return AccountId.fromString(entityId(shard, realm, number));
  }

  public getOperatorAccountId(deployment: DeploymentName): AccountId {
    return this.getAccountIdByNumber(deployment, Number.parseInt(constants.DEFAULT_OPERATOR_ID_NUMBER.toString()));
  }

  public getFreezeAccountId(deployment: DeploymentName): AccountId {
    return this.getAccountIdByNumber(deployment, Number.parseInt(constants.DEFAULT_FREEZE_ID_NUMBER.toString()));
  }

  public getTreasuryAccountId(deployment: DeploymentName): AccountId {
    return this.getAccountIdByNumber(deployment, constants.DEFAULT_TREASURY_ID_NUMBER);
  }

  public getStartAccountId(deployment: DeploymentName): AccountId {
    return this.getAccountIdByNumber(deployment, Number.parseInt(constants.DEFAULT_START_ID_NUMBER.toString()));
  }

  /**
   * Create a map of node aliases to account IDs
   * @param nodeAliases
   * @param deploymentName
   * @returns the map of node IDs to account IDs
   */
  public getNodeAccountMap(nodeAliases: NodeAliases, deploymentName: DeploymentName): Map<NodeAlias, string> {
    const accountMap: Map<NodeAlias, string> = new Map<NodeAlias, string>();
    const realm: Realm = this.localConfig.configuration.realmForDeployment(deploymentName);
    const shard: Shard = this.localConfig.configuration.shardForDeployment(deploymentName);
    const firstAccountId: AccountId = this.getStartAccountId(deploymentName);

    for (const nodeAlias of nodeAliases) {
      const nodeAccount: string = entityId(
        shard,
        realm,
        Long.fromNumber(Templates.nodeIdFromNodeAlias(nodeAlias)).add(firstAccountId.num),
      );
      accountMap.set(nodeAlias, nodeAccount);
    }
    return accountMap;
  }
}
