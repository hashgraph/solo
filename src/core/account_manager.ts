/**
 * SPDX-License-Identifier: Apache-2.0
 */
import * as Base64 from 'js-base64';
import * as constants from './constants.js';
import {IGNORED_NODE_ACCOUNT_ID} from './constants.js';
import {
  AccountCreateTransaction,
  AccountId,
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
  PrivateKey,
  Status,
  TransferTransaction,
} from '@hashgraph/sdk';
import {MissingArgumentError, ResourceNotFoundError, SoloError} from './errors.js';
import {Templates} from './templates.js';
import {type NetworkNodeServices, NetworkNodeServicesBuilder} from './network_node_services.js';
import path from 'path';

import {type SoloLogger} from './logging.js';
import {type K8Factory} from './kube/k8_factory.js';
import {type AccountIdWithKeyPairObject, type ExtendedNetServer, type Optional} from '../types/index.js';
import {type NodeAlias, type SdkNetworkEndpoint} from '../types/aliases.js';
import {PodName} from './kube/resources/pod/pod_name.js';
import {isNumeric, sleep} from './helpers.js';
import {Duration} from './time/duration.js';
import {inject, injectable} from 'tsyringe-neo';
import {patchInject} from './dependency_injection/container_helper.js';
import {type NamespaceName} from './kube/resources/namespace/namespace_name.js';
import {PodRef} from './kube/resources/pod/pod_ref.js';
import {SecretType} from './kube/resources/secret/secret_type.js';
import {type V1Pod} from '@kubernetes/client-node';
import {InjectTokens} from './dependency_injection/inject_tokens.js';

const REASON_FAILED_TO_GET_KEYS = 'failed to get keys for accountId';
const REASON_SKIPPED = 'skipped since it does not have a genesis key';
const REASON_FAILED_TO_UPDATE_ACCOUNT = 'failed to update account keys';
const REASON_FAILED_TO_CREATE_K8S_S_KEY = 'failed to create k8s scrt key';
const FULFILLED = 'fulfilled';
const REJECTED = 'rejected';

@injectable()
export class AccountManager {
  private _portForwards: ExtendedNetServer[];
  public _nodeClient: Client | null;

  constructor(
    @inject(InjectTokens.SoloLogger) private readonly logger?: SoloLogger,
    @inject(InjectTokens.K8Factory) private readonly k8Factory?: K8Factory,
  ) {
    this.logger = patchInject(logger, InjectTokens.SoloLogger, this.constructor.name);
    this.k8Factory = patchInject(k8Factory, InjectTokens.K8Factory, this.constructor.name);

    this._portForwards = [];
    this._nodeClient = null;
  }

  /**
   * Gets the account keys from the Kubernetes secret from which it is stored
   * @param accountId - the account ID for which we want its keys
   * @param namespace - the namespace storing the secret
   * @param [context]
   */
  async getAccountKeysFromSecret(
    accountId: string,
    namespace: NamespaceName,
    context?: Optional<string>,
  ): Promise<AccountIdWithKeyPairObject> {
    try {
      const k8 = context ? this.k8Factory.getK8(context) : this.k8Factory.default();
      const secrets = await k8.secrets().list(namespace, [Templates.renderAccountKeySecretLabelSelector(accountId)]);

      if (secrets.length > 0) {
        const secret = secrets[0];
        return {
          accountId: secret.labels['solo.hedera.com/account-id'],
          privateKey: Base64.decode(secret.data.privateKey),
          publicKey: Base64.decode(secret.data.publicKey),
        };
      }
    } catch (e) {
      if (!(e instanceof ResourceNotFoundError)) {
        throw e;
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
   * Gets the treasury account private key from Kubernetes secret if it exists, else
   * returns the Genesis private key, then will return an AccountInfo object with the
   * accountId, ed25519PrivateKey, publicKey
   * @param namespace - the namespace that the secret is in
   * @param [context]
   */
  async getTreasuryAccountKeys(namespace: NamespaceName, context?: Optional<string>) {
    // check to see if the treasure account is in the secrets
    return await this.getAccountKeysFromSecret(constants.TREASURY_ACCOUNT_ID, namespace, context);
  }

  /**
   * batch up the accounts into sets to be processed
   * @param [accountRange]
   * @returns an array of arrays of numbers representing the accounts to update
   */
  batchAccounts(accountRange = constants.SYSTEM_ACCOUNTS) {
    const batchSize = constants.ACCOUNT_UPDATE_BATCH_SIZE as number;
    const batchSets: number[][] = [];

    let currentBatch = [];
    for (const [start, end] of accountRange) {
      let batchCounter = start;
      for (let i = start; i <= end; i++) {
        currentBatch.push(i);
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
  async close() {
    this._nodeClient?.close();
    if (this._portForwards) {
      for (const srv of this._portForwards) {
        await this.k8Factory.default().pods().readByRef(null).stopPortForward(srv);
      }
    }

    this._nodeClient = null;
    this._portForwards = [];
    this.logger.debug('node client and port forwards have been closed');
  }

  /**
   * loads and initializes the Node Client
   * @param namespace - the namespace of the network
   * @param [context]
   */
  async loadNodeClient(namespace: NamespaceName, context?: Optional<string>) {
    try {
      this.logger.debug(
        `loading node client: [!this._nodeClient=${!this._nodeClient}, this._nodeClient.isClientShutDown=${this._nodeClient?.isClientShutDown}]`,
      );
      if (!this._nodeClient || this._nodeClient?.isClientShutDown) {
        this.logger.debug(
          `refreshing node client: [!this._nodeClient=${!this._nodeClient}, this._nodeClient.isClientShutDown=${this._nodeClient?.isClientShutDown}]`,
        );
        await this.refreshNodeClient(namespace, undefined, context);
      } else {
        try {
          if (!constants.SKIP_NODE_PING) {
            await this._nodeClient.ping(this._nodeClient.operatorAccountId);
          }
        } catch {
          this.logger.debug('node client ping failed, refreshing node client');
          await this.refreshNodeClient(namespace, undefined, context);
        }
      }

      return this._nodeClient!;
    } catch (e) {
      const message = `failed to load node client: ${e.message}`;
      this.logger.error(message, e);
      throw new SoloError(message, e);
    }
  }

  /**
   * loads and initializes the Node Client, throws a SoloError if anything fails
   * @param namespace - the namespace of the network
   * @param skipNodeAlias - the node alias to skip
   * @param [context]
   */
  async refreshNodeClient(namespace: NamespaceName, skipNodeAlias?: NodeAlias, context?: Optional<string>) {
    try {
      await this.close();
      const treasuryAccountInfo = await this.getTreasuryAccountKeys(namespace, context);
      const networkNodeServicesMap = await this.getNodeServiceMap(namespace);

      this._nodeClient = await this._getNodeClient(
        namespace,
        networkNodeServicesMap,
        treasuryAccountInfo.accountId,
        treasuryAccountInfo.privateKey,
        skipNodeAlias,
      );

      this.logger.debug('node client has been refreshed');
      return this._nodeClient;
    } catch (e) {
      const message = `failed to refresh node client: ${e.message}`;
      this.logger.error(message, e);
      throw new SoloError(message, e);
    }
  }

  /**
   * if the load balancer IP is not set, then we should use the local host port forward
   * @param networkNodeServices
   * @returns whether to use the local host port forward
   */
  private shouldUseLocalHostPortForward(networkNodeServices: NetworkNodeServices) {
    return !networkNodeServices.haProxyLoadBalancerIp;
  }

  /**
   * Returns a node client that can be used to make calls against
   * @param namespace - the namespace for which the node client resides
   * @param networkNodeServicesMap - a map of the service objects that proxy the nodes
   * @param operatorId - the account id of the operator of the transactions
   * @param operatorKey - the private key of the operator of the transactions
   * @param skipNodeAlias - the node alias to skip
   * @returns a node client that can be used to call transactions
   */
  async _getNodeClient(
    namespace: NamespaceName,
    networkNodeServicesMap: Map<string, NetworkNodeServices>,
    operatorId: string,
    operatorKey: string,
    skipNodeAlias: string,
  ) {
    let nodes = {};
    const configureNodeAccessPromiseArray = [];

    try {
      let localPort = constants.LOCAL_NODE_START_PORT;

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

      await Promise.allSettled(configureNodeAccessPromiseArray).then(results => {
        for (const result of results) {
          switch (result.status) {
            case REJECTED:
              throw new SoloError(`failed to configure node access: ${result.reason}`);
            case FULFILLED:
              nodes = {...nodes, ...result.value};
              break;
          }
        }
      });
      this.logger.debug(`configured node access for ${Object.keys(nodes).length} nodes`);

      let formattedNetworkConnection = '';
      Object.keys(nodes).forEach(key => (formattedNetworkConnection += `${key}:${nodes[key]}, `));
      this.logger.info(`creating client from network configuration: [${formattedNetworkConnection}]`);

      // scheduleNetworkUpdate is set to false, because the ports 50212/50211 are hardcoded in JS SDK that will not work
      // when running locally or in a pipeline
      this._nodeClient = Client.fromConfig({network: nodes, scheduleNetworkUpdate: false});
      this._nodeClient.setOperator(operatorId, operatorKey);
      this._nodeClient.setLogger(new Logger(LogLevel.Trace, path.join(constants.SOLO_LOGS_DIR, 'hashgraph-sdk.log')));
      this._nodeClient.setMaxAttempts(constants.NODE_CLIENT_MAX_ATTEMPTS as number);
      this._nodeClient.setMinBackoff(constants.NODE_CLIENT_MIN_BACKOFF as number);
      this._nodeClient.setMaxBackoff(constants.NODE_CLIENT_MAX_BACKOFF as number);
      this._nodeClient.setRequestTimeout(constants.NODE_CLIENT_REQUEST_TIMEOUT as number);

      // ping the node client to ensure it is working
      if (!constants.SKIP_NODE_PING) {
        await this._nodeClient.ping(AccountId.fromString(operatorId));
      }

      // start a background pinger to keep the node client alive, Hashgraph SDK JS has a 90-second keep alive time, and
      // 5-second keep alive timeout
      this.startIntervalPinger(operatorId);

      return this._nodeClient;
    } catch (e: Error | any) {
      throw new SoloError(`failed to setup node client: ${e.message}`, e);
    }
  }

  /**
   * pings the node client at a set interval, can throw an exception if the ping fails
   * @param operatorId
   * @private
   */
  private startIntervalPinger(operatorId: string) {
    const interval = constants.NODE_CLIENT_PING_INTERVAL;
    const intervalId = setInterval(async () => {
      if (this._nodeClient || !this._nodeClient?.isClientShutDown) {
        this.logger.debug('node client has been closed, clearing node client ping interval');
        clearInterval(intervalId);
      } else {
        try {
          this.logger.debug(`pinging node client at an interval of ${Duration.ofMillis(interval).seconds} seconds`);
          if (!constants.SKIP_NODE_PING) {
            await this._nodeClient.ping(AccountId.fromString(operatorId));
          }
        } catch (e: Error | any) {
          const message = `failed to ping node client while running the interval pinger: ${e.message}`;
          this.logger.error(message, e);
          throw new SoloError(message, e);
        }
      }
    }, interval);
  }

  private async configureNodeAccess(networkNodeService: NetworkNodeServices, localPort: number, totalNodes: number) {
    this.logger.debug(`configuring node access for node: ${networkNodeService.nodeAlias}`);
    const obj = {} as Record<SdkNetworkEndpoint, AccountId>;
    const port = +networkNodeService.haProxyGrpcPort;
    const accountId = AccountId.fromString(networkNodeService.accountId as string);

    try {
      // if the load balancer IP is set, then we should use that and avoid the local host port forward
      if (!this.shouldUseLocalHostPortForward(networkNodeService)) {
        const host = networkNodeService.haProxyLoadBalancerIp as string;
        const targetPort = port;
        this.logger.debug(`using load balancer IP: ${host}:${targetPort}`);

        try {
          obj[`${host}:${targetPort}`] = accountId;
          await this.pingNetworkNode(obj, accountId);
          this.logger.debug(`successfully pinged network node: ${host}:${targetPort}`);

          return obj;
        } catch {
          // if the connection fails, then we should use the local host port forward
        }
      }
      // if the load balancer IP is not set or the test connection fails, then we should use the local host port forward
      const host = '127.0.0.1';
      const targetPort = localPort;

      if (this._portForwards.length < totalNodes) {
        this._portForwards.push(
          await this.k8Factory
            .default()
            .pods()
            .readByRef(PodRef.of(networkNodeService.namespace, networkNodeService.haProxyPodName))
            .portForward(localPort, port),
        );
      }

      this.logger.debug(`using local host port forward: ${host}:${targetPort}`);
      obj[`${host}:${targetPort}`] = accountId;

      await this.testNodeClientConnection(obj, accountId);

      return obj;
    } catch (e) {
      throw new SoloError(`failed to configure node access: ${e.message}`, e);
    }
  }

  /**
   * pings the network node to ensure that the connection is working
   * @param obj - the object containing the network node service and the account id
   * @param accountId - the account id to ping
   * @throws {@link SoloError} if the ping fails
   * @private
   */
  private async testNodeClientConnection(obj: Record<SdkNetworkEndpoint, AccountId>, accountId: AccountId) {
    const maxRetries = constants.NODE_CLIENT_PING_MAX_RETRIES;
    const sleepInterval = constants.NODE_CLIENT_PING_RETRY_INTERVAL;

    let currentRetry = 0;
    let success = false;

    try {
      while (!success && currentRetry < maxRetries) {
        try {
          this.logger.debug(
            `attempting to ping network node: ${Object.keys(obj)[0]}, attempt: ${currentRetry}, of ${maxRetries}`,
          );
          await this.pingNetworkNode(obj, accountId);
          success = true;

          return;
        } catch (e: Error | any) {
          this.logger.error(`failed to ping network node: ${Object.keys(obj)[0]}, ${e.message}`);
          currentRetry++;
          await sleep(Duration.ofMillis(sleepInterval));
        }
      }
    } catch (e) {
      const message = `failed testing node client connection for network node: ${Object.keys(obj)[0]}, after ${maxRetries} retries: ${e.message}`;
      this.logger.error(message, e);
      throw new SoloError(message, e);
    }

    if (currentRetry >= maxRetries) {
      throw new SoloError(`failed to ping network node: ${Object.keys(obj)[0]}, after ${maxRetries} retries`);
    }

    return;
  }

  /**
   * TODO: Take from other branch once it's been migrated to use multi-cluster
   *
   * Gets a Map of the Hedera node services and the attributes needed, throws a SoloError if anything fails
   * @param namespace - the namespace of the solo network deployment
   * @returns a map of the network node services
   */
  async getNodeServiceMap(namespace: NamespaceName) {
    const labelSelector = 'solo.hedera.com/node-name';

    const serviceBuilderMap = new Map<NodeAlias, NetworkNodeServicesBuilder>();

    try {
      const serviceList = await this.k8Factory.default().services().list(namespace, [labelSelector]);

      let nodeId = '0';
      // retrieve the list of services and build custom objects for the attributes we need
      for (const service of serviceList) {
        let serviceBuilder = new NetworkNodeServicesBuilder(
          service.metadata.labels['solo.hedera.com/node-name'] as NodeAlias,
        );

        if (serviceBuilderMap.has(serviceBuilder.key())) {
          serviceBuilder = serviceBuilderMap.get(serviceBuilder.key()) as NetworkNodeServicesBuilder;
        } else {
          serviceBuilder = new NetworkNodeServicesBuilder(
            service.metadata.labels['solo.hedera.com/node-name'] as NodeAlias,
          );
          serviceBuilder.withNamespace(namespace);
        }

        const serviceType = service.metadata.labels['solo.hedera.com/type'];
        switch (serviceType) {
          // solo.hedera.com/type: envoy-proxy-svc
          case 'envoy-proxy-svc':
            serviceBuilder
              .withEnvoyProxyName(service.metadata!.name as string)
              .withEnvoyProxyClusterIp(service.spec!.clusterIP as string)
              .withEnvoyProxyLoadBalancerIp(
                service.status.loadBalancer.ingress ? service.status.loadBalancer.ingress[0].ip : undefined,
              )
              .withEnvoyProxyGrpcWebPort(service.spec!.ports!.filter(port => port.name === 'hedera-grpc-web')[0].port);
            break;
          // solo.hedera.com/type: haproxy-svc
          case 'haproxy-svc':
            serviceBuilder
              .withHaProxyAppSelector(service.spec!.selector!.app)
              .withHaProxyName(service.metadata!.name as string)
              .withHaProxyClusterIp(service.spec!.clusterIP as string)
              // @ts-ignore
              .withHaProxyLoadBalancerIp(
                service.status.loadBalancer.ingress ? service.status.loadBalancer.ingress[0].ip : undefined,
              )
              .withHaProxyGrpcPort(
                service.spec!.ports!.filter(port => port.name === 'non-tls-grpc-client-port')[0].port,
              )
              .withHaProxyGrpcsPort(service.spec!.ports!.filter(port => port.name === 'tls-grpc-client-port')[0].port);
            break;
          // solo.hedera.com/type: network-node-svc
          case 'network-node-svc':
            if (
              service.metadata!.labels!['solo.hedera.com/node-id'] !== '' &&
              isNumeric(service.metadata!.labels!['solo.hedera.com/node-id'])
            ) {
              nodeId = service.metadata!.labels!['solo.hedera.com/node-id'];
            } else {
              nodeId = `${Templates.nodeIdFromNodeAlias(service.metadata.labels['solo.hedera.com/node-name'] as NodeAlias)}`;
              this.logger.warn(
                `received an incorrect node id of ${service.metadata!.labels!['solo.hedera.com/node-id']} for ` +
                  `${service.metadata.labels['solo.hedera.com/node-name']}`,
              );
            }

            serviceBuilder
              .withNodeId(nodeId)
              .withAccountId(service.metadata!.labels!['solo.hedera.com/account-id'])
              .withNodeServiceName(service.metadata!.name as string)
              .withNodeServiceClusterIp(service.spec!.clusterIP as string)
              .withNodeServiceLoadBalancerIp(
                service.status.loadBalancer.ingress ? service.status.loadBalancer.ingress[0].ip : undefined,
              )
              .withNodeServiceGossipPort(service.spec!.ports!.filter(port => port.name === 'gossip')[0].port)
              .withNodeServiceGrpcPort(service.spec!.ports!.filter(port => port.name === 'grpc-non-tls')[0].port)
              .withNodeServiceGrpcsPort(service.spec!.ports!.filter(port => port.name === 'grpc-tls')[0].port);
            break;
        }
        serviceBuilderMap.set(serviceBuilder.key(), serviceBuilder);
      }

      // get the pod name for the service to use with portForward if needed
      for (const serviceBuilder of serviceBuilderMap.values()) {
        const podList: V1Pod[] = await this.k8Factory
          .default()
          .pods()
          .list(namespace, [`app=${serviceBuilder.haProxyAppSelector}`]);
        serviceBuilder.withHaProxyPodName(PodName.of(podList[0].metadata.name));
      }

      // get the pod name of the network node
      const pods: V1Pod[] = await this.k8Factory
        .default()
        .pods()
        .list(namespace, ['solo.hedera.com/type=network-node']);
      for (const pod of pods) {
        // eslint-disable-next-line no-prototype-builtins
        if (!pod.metadata?.labels?.hasOwnProperty('solo.hedera.com/node-name')) {
          // TODO Review why this fixes issue
          continue;
        }
        const podName = PodName.of(pod.metadata!.name);
        const nodeAlias = pod.metadata!.labels!['solo.hedera.com/node-name'] as NodeAlias;
        const serviceBuilder = serviceBuilderMap.get(nodeAlias) as NetworkNodeServicesBuilder;
        serviceBuilder.withNodePodName(podName);
      }

      const serviceMap = new Map<NodeAlias, NetworkNodeServices>();
      for (const networkNodeServicesBuilder of serviceBuilderMap.values()) {
        serviceMap.set(networkNodeServicesBuilder.key(), networkNodeServicesBuilder.build());
      }

      this.logger.debug('node services have been loaded');
      return serviceMap;
    } catch (e) {
      throw new SoloError(`failed to get node services: ${e.message}`, e);
    }
  }

  /**
   * updates a set of special accounts keys with a newly generated key and stores them in a Kubernetes secret
   * @param namespace the namespace of the nodes network
   * @param currentSet - the accounts to update
   * @param updateSecrets - whether to delete the secret prior to creating a new secret
   * @param resultTracker - an object to keep track of the results from the accounts that are being updated
   * @returns the updated resultTracker object
   */
  async updateSpecialAccountsKeys(
    namespace: NamespaceName,
    currentSet: number[],
    updateSecrets: boolean,
    resultTracker: {
      skippedCount: number;
      rejectedCount: number;
      fulfilledCount: number;
    },
  ) {
    const genesisKey = PrivateKey.fromStringED25519(constants.OPERATOR_KEY);
    const realm = constants.HEDERA_NODE_ACCOUNT_ID_START.realm;
    const shard = constants.HEDERA_NODE_ACCOUNT_ID_START.shard;

    const accountUpdatePromiseArray = [];

    for (const accountNum of currentSet) {
      accountUpdatePromiseArray.push(
        this.updateAccountKeys(
          namespace,
          AccountId.fromString(`${realm}.${shard}.${accountNum}`),
          genesisKey,
          updateSecrets,
        ),
      );
    }

    await Promise.allSettled(accountUpdatePromiseArray).then(results => {
      for (const result of results) {
        // @ts-ignore
        switch (result.value.status) {
          case REJECTED:
            // @ts-ignore
            if (result.value.reason === REASON_SKIPPED) {
              resultTracker.skippedCount++;
            } else {
              // @ts-ignore
              this.logger.error(`REJECT: ${result.value.reason}: ${result.value.value}`);
              resultTracker.rejectedCount++;
            }
            break;
          case FULFILLED:
            resultTracker.fulfilledCount++;
            break;
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
   * @param updateSecrets - whether to delete the secret prior to creating a new secret
   * @returns the result of the call
   */
  async updateAccountKeys(
    namespace: NamespaceName,
    accountId: AccountId,
    genesisKey: PrivateKey,
    updateSecrets: boolean,
  ): Promise<{value: string; status: string} | {reason: string; value: string; status: string}> {
    let keys: Key[];
    try {
      keys = await this.getAccountKeys(accountId);
    } catch (e: Error | any) {
      this.logger.error(`failed to get keys for accountId ${accountId.toString()}, e: ${e.toString()}\n  ${e.stack}`);
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

    if (constants.OPERATOR_PUBLIC_KEY !== keys[0].toString()) {
      this.logger.debug(`account ${accountId.toString()} can be skipped since it does not have a genesis key`);
      return {
        status: REJECTED,
        reason: REASON_SKIPPED,
        value: accountId.toString(),
      };
    }

    this.logger.debug(`updating account ${accountId.toString()} since it is using the genesis key`);

    const newPrivateKey = PrivateKey.generateED25519();
    const data = {
      privateKey: Base64.encode(newPrivateKey.toString()),
      publicKey: Base64.encode(newPrivateKey.publicKey.toString()),
    };

    try {
      const createdOrUpdated = updateSecrets
        ? await this.k8Factory
            .default()
            .secrets()
            .replace(
              namespace,
              Templates.renderAccountKeySecretName(accountId),
              SecretType.OPAQUE,
              data,
              Templates.renderAccountKeySecretLabelObject(accountId),
            )
        : await this.k8Factory
            .default()
            .secrets()
            .create(
              namespace,
              Templates.renderAccountKeySecretName(accountId),
              SecretType.OPAQUE,
              data,
              Templates.renderAccountKeySecretLabelObject(accountId),
            );

      if (!createdOrUpdated) {
        this.logger.error(`failed to create secret for accountId ${accountId.toString()}`);
        return {
          status: REJECTED,
          reason: REASON_FAILED_TO_CREATE_K8S_S_KEY,
          value: accountId.toString(),
        };
      }
    } catch (e: Error | any) {
      this.logger.error(`failed to create secret for accountId ${accountId.toString()}, e: ${e.toString()}`);
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
    } catch (e: Error | any) {
      this.logger.error(`failed to update account keys for accountId ${accountId.toString()}, e: ${e.toString()}`);
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
   * gets the account info from Hedera network
   * @param accountId - the account
   * @returns the private key of the account
   */
  async accountInfoQuery(accountId: AccountId | string) {
    if (!this._nodeClient) {
      throw new MissingArgumentError('node client is not initialized');
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
  async getAccountKeys(accountId: AccountId | string) {
    const accountInfo = await this.accountInfoQuery(accountId);

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
  async sendAccountKeyUpdate(
    accountId: AccountId | string,
    newPrivateKey: PrivateKey | string,
    oldPrivateKey: PrivateKey | string,
  ) {
    if (typeof newPrivateKey === 'string') {
      newPrivateKey = PrivateKey.fromStringED25519(newPrivateKey);
    }

    if (typeof oldPrivateKey === 'string') {
      oldPrivateKey = PrivateKey.fromStringED25519(oldPrivateKey);
    }

    // Create the transaction to update the key on the account
    const transaction = new AccountUpdateTransaction()
      .setAccountId(accountId)
      .setKey(newPrivateKey.publicKey)
      .freezeWith(this._nodeClient);

    // Sign the transaction with the old key and new key
    const signTx = await (await transaction.sign(oldPrivateKey)).sign(newPrivateKey);

    // SIgn the transaction with the client operator private key and submit to a Hedera network
    // @ts-ignore
    const txResponse = await signTx.execute(this._nodeClient);

    // Request the receipt of the transaction
    // @ts-ignore
    const receipt = await txResponse.getReceipt(this._nodeClient);

    return receipt.status === Status.Success;
  }

  /**
   * creates a new Hedera account
   * @param namespace - the namespace to store the Kubernetes key secret into
   * @param privateKey - the private key of type PrivateKey
   * @param amount - the amount of HBAR to add to the account
   * @param [setAlias] - whether to set the alias of the account to the public key, requires the ed25519PrivateKey supplied to be ECDSA
   * @returns a custom object with the account information in it
   */
  async createNewAccount(namespace: NamespaceName, privateKey: PrivateKey, amount: number, setAlias = false) {
    const newAccountTransaction = new AccountCreateTransaction()
      .setKey(privateKey)
      .setInitialBalance(Hbar.from(amount, HbarUnit.Hbar));

    if (setAlias) {
      newAccountTransaction.setAlias(privateKey.publicKey.toEvmAddress());
    }

    // @ts-ignore
    const newAccountResponse = await newAccountTransaction.execute(this._nodeClient);

    // Get the new account ID
    // @ts-ignore
    const transactionReceipt = await newAccountResponse.getReceipt(this._nodeClient);
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
      const accountId = accountInfo.accountId;
      const realm = transactionReceipt.accountId!.realm;
      const shard = transactionReceipt.accountId!.shard;
      const accountInfoQueryResult = await this.accountInfoQuery(accountId);
      accountInfo.accountAlias = `${realm}.${shard}.${accountInfoQueryResult.contractAccountId}`;
    }

    try {
      const accountSecretCreated = await this.k8Factory
        .default()
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

        throw new SoloError(
          `failed to create secret for accountId ${accountInfo.accountId.toString()}, keys were sent to log file`,
        );
      }
    } catch (e: Error | any) {
      if (e instanceof SoloError) {
        throw e;
      }
      throw new SoloError(
        `failed to create secret for accountId ${accountInfo.accountId.toString()}, e: ${e.toString()}`,
        e,
      );
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
  async transferAmount(fromAccountId: AccountId | string, toAccountId: AccountId | string, hbarAmount: number) {
    try {
      const transaction = new TransferTransaction()
        .addHbarTransfer(fromAccountId, new Hbar(-1 * hbarAmount))
        .addHbarTransfer(toAccountId, new Hbar(hbarAmount))
        .freezeWith(this._nodeClient);

      // @ts-ignore
      const txResponse = await transaction.execute(this._nodeClient);

      // @ts-ignore
      const receipt = await txResponse.getReceipt(this._nodeClient);

      this.logger.debug(
        `The transfer from account ${fromAccountId} to account ${toAccountId} for amount ${hbarAmount} was ${receipt.status.toString()} `,
      );

      return receipt.status === Status.Success;
    } catch (e: Error | any) {
      const errorMessage = `transfer amount failed with an error: ${e.toString()}`;
      this.logger.error(errorMessage);
      throw new SoloError(errorMessage, e);
    }
  }

  /**
   * Fetch and prepare address book as a base64 string
   */
  async prepareAddressBookBase64() {
    // fetch AddressBook
    const fileQuery = new FileContentsQuery().setFileId(FileId.ADDRESS_BOOK);
    const addressBookBytes = await fileQuery.execute(this._nodeClient);

    // convert addressBook into base64
    // @ts-ignore
    return Base64.encode(addressBookBytes);
  }

  async getFileContents(namespace: NamespaceName, fileNum: number) {
    await this.loadNodeClient(namespace);
    const client = this._nodeClient;
    const fileId = FileId.fromString(`0.0.${fileNum}`);
    const queryFees = new FileContentsQuery().setFileId(fileId);
    return Buffer.from(await queryFees.execute(client)).toString('hex');
  }

  /**
   * Pings the network node with a grpc call to ensure it is working, throws a SoloError if the ping fails
   * @param obj - the network node object where the key is the network endpoint and the value is the account id
   * @param accountId - the account id to ping
   * @throws {@link SoloError} if the ping fails
   * @private
   */
  private async pingNetworkNode(obj: Record<SdkNetworkEndpoint, AccountId>, accountId: AccountId) {
    let nodeClient: Client;
    try {
      nodeClient = Client.fromConfig({network: obj, scheduleNetworkUpdate: false});
      this.logger.debug(`pinging network node: ${Object.keys(obj)[0]}`);
      try {
        if (!constants.SKIP_NODE_PING) {
          await nodeClient.ping(accountId);
        }
        this.logger.debug(`ping successful for network node: ${Object.keys(obj)[0]}`);
      } catch (e) {
        const message = `failed to ping network node: ${Object.keys(obj)[0]} ${e.message}`;
        this.logger.error(message, e);
        throw new SoloError(message, e);
      }

      return;
    } catch (e) {
      throw new SoloError(`failed to ping network node: ${Object.keys(obj)[0]} ${e.message}`, e);
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
}
