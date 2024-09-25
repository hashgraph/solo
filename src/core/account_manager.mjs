/**
 * Copyright (C) 2024 Hedera Hashgraph, LLC
 *
 * Licensed under the Apache License, Version 2.0 (the ""License"");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an ""AS IS"" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 */
import * as Base64 from 'js-base64'
import os from 'os'
import * as constants from './constants.mjs'
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
  KeyList,
  Logger,
  LogLevel,
  PrivateKey,
  Status,
  TransferTransaction
} from '@hashgraph/sdk'
import { FullstackTestingError, MissingArgumentError } from './errors.mjs'
import { Templates } from './templates.mjs'
import ip from 'ip'
import { NetworkNodeServicesBuilder } from './network_node_services.mjs'
import path from 'path'

/**
 * @typedef {Object} AccountIdWithKeyPairObject
 * @property {string} accountId
 * @property {string} privateKey
 * @property {string} publicKey
 */

const REASON_FAILED_TO_GET_KEYS = 'failed to get keys for accountId'
const REASON_SKIPPED = 'skipped since it does not have a genesis key'
const REASON_FAILED_TO_UPDATE_ACCOUNT = 'failed to update account keys'
const REASON_FAILED_TO_CREATE_K8S_S_KEY = 'failed to create k8s scrt key'
const FULFILLED = 'fulfilled'
const REJECTED = 'rejected'

export class AccountManager {
  /**
   * creates a new AccountManager instance
   * @param {Logger} logger - the logger to use
   * @param {K8} k8 - the K8 instance
   */
  constructor (logger, k8) {
    if (!logger) throw new Error('An instance of core/Logger is required')
    if (!k8) throw new Error('An instance of core/K8 is required')

    this.logger = logger
    this.k8 = k8
    this._portForwards = []

    /**
     * @type {NodeClient|null}
     * @public
     */
    this._nodeClient = null
  }

  /**
   * Gets the account keys from the Kubernetes secret from which it is stored
   * @param {string} accountId - the account ID for which we want its keys
   * @param {string} namespace - the namespace that is storing the secret
   * @returns {Promise<AccountIdWithKeyPairObject>}
   */
  async getAccountKeysFromSecret (accountId, namespace) {
    const secret = await this.k8.getSecret(namespace, Templates.renderAccountKeySecretLabelSelector(accountId))
    if (secret) {
      return {
        accountId: secret.labels['fullstack.hedera.com/account-id'],
        privateKey: Base64.decode(secret.data.privateKey),
        publicKey: Base64.decode(secret.data.publicKey)
      }
    } else {
      // if it isn't in the secrets we can load genesis key
      return {
        accountId,
        privateKey: constants.GENESIS_KEY,
        publicKey: PrivateKey.fromStringED25519(constants.GENESIS_KEY).publicKey.toString()
      }
    }
  }

  /**
   * Gets the treasury account private key from Kubernetes secret if it exists, else
   * returns the Genesis private key, then will return an AccountInfo object with the
   * accountId, privateKey, publicKey
   * @param {string} namespace - the namespace that the secret is in
   * @returns {Promise<AccountIdWithKeyPairObject>}
   */
  async getTreasuryAccountKeys (namespace) {
    // check to see if the treasure account is in the secrets
    return await this.getAccountKeysFromSecret(constants.TREASURY_ACCOUNT_ID, namespace)
  }

  /**
   * batch up the accounts into sets to be processed
   * @param {number[][]} [accountRange]
   * @returns {number[][]} an array of arrays of numbers representing the accounts to update
   */
  batchAccounts (accountRange = constants.SYSTEM_ACCOUNTS) {
    const batchSize = constants.ACCOUNT_UPDATE_BATCH_SIZE
    const batchSets = []

    let currentBatch = []
    for (const [start, end] of accountRange) {
      let batchCounter = start
      for (let i = start; i <= end; i++) {
        currentBatch.push(i)
        batchCounter++

        if (batchCounter % batchSize === 0) {
          batchSets.push(currentBatch)
          currentBatch = []
          batchCounter = 0
        }
      }
    }

    if (currentBatch.length > 0) {
      batchSets.push(currentBatch)
    }

    batchSets.push([constants.TREASURY_ACCOUNT])

    return batchSets
  }

  /**
   * stops and closes the port forwards and the _nodeClient
   * @returns {Promise<void>}
   */
  async close () {
    this._nodeClient?.close()
    if (this._portForwards) {
      for (const srv of this._portForwards) {
        await this.k8.stopPortForward(srv)
      }
    }

    this._nodeClient = null
    this._portForwards = []
  }

  /**
   * loads and initializes the Node Client
   * @param {string} namespace - the namespace of the network
   * @returns {Promise<NodeClient>}
   */
  async loadNodeClient (namespace) {
    if (!this._nodeClient || this._nodeClient.isClientShutDown) {
      await this.refreshNodeClient(namespace)
    }

    return this._nodeClient
  }

  /**
   * loads and initializes the Node Client
   * @param namespace the namespace of the network
   * @returns {Promise<void>}
   */
  async refreshNodeClient (namespace) {
    await this.close()
    const treasuryAccountInfo = await this.getTreasuryAccountKeys(namespace)
    const networkNodeServicesMap = await this.getNodeServiceMap(namespace)

    this._nodeClient = await this._getNodeClient(namespace,
      networkNodeServicesMap, treasuryAccountInfo.accountId, treasuryAccountInfo.privateKey)
  }

  /**
   * if the load balancer IP is not set, then we should use the local host port forward
   * @param {NetworkNodeServices} networkNodeServices
   * @returns {boolean} whether to use the local host port forward
   */
  shouldUseLocalHostPortForward (networkNodeServices) {
    if (!networkNodeServices.haProxyLoadBalancerIp) return true

    const loadBalancerIp = networkNodeServices.haProxyLoadBalancerIp
    const interfaces = os.networkInterfaces()
    let usePortForward = true
    const loadBalancerIpFormat = ip.isV6Format(loadBalancerIp) ? 'ipv4' : 'ipv6'

    // check if serviceIP falls into any subnet of the network interfaces
    for (const nic of Object.keys(interfaces)) {
      const inf = interfaces[nic]
      for (const item of inf) {
        if (item.family.toLowerCase() === loadBalancerIpFormat &&
          ip.cidrSubnet(item.cidr).contains(loadBalancerIp)) {
          usePortForward = false
          break
        }
      }
    }

    if (usePortForward) {
      this.logger.debug('Local network and Load balancer are in different network, using local host port forward')
    } else {
      this.logger.debug('Local network and Load balancer are in the same network, using load balancer IP port forward')
    }

    return usePortForward
  }

  /**
   * Returns a node client that can be used to make calls against
   * @param {string} namespace - the namespace for which the node client resides
   * @param {Map<string, NetworkNodeServices>} networkNodeServicesMap - a map of the service objects that proxy the nodes
   * @param {string} operatorId - the account id of the operator of the transactions
   * @param {string} operatorKey - the private key of the operator of the transactions
   * @returns {Promise<NodeClient>} a node client that can be used to call transactions
   */
  async _getNodeClient (namespace, networkNodeServicesMap, operatorId, operatorKey) {
    const nodes = {}
    try {
      let localPort = constants.LOCAL_NODE_START_PORT

      for (const networkNodeService of networkNodeServicesMap.values()) {
        const usePortForward = this.shouldUseLocalHostPortForward(networkNodeService)
        const host = usePortForward ? '127.0.0.1' : networkNodeService.haProxyLoadBalancerIp
        const port = networkNodeService.haProxyGrpcPort
        const targetPort = usePortForward ? localPort : port

        if (usePortForward && this._portForwards.length < networkNodeServicesMap.size) {
          this._portForwards.push(await this.k8.portForward(networkNodeService.haProxyPodName, localPort, port))
        }

        nodes[`${host}:${targetPort}`] = AccountId.fromString(networkNodeService.accountId)
        await this.k8.testConnection(host, targetPort)
        localPort++
      }

      this.logger.debug(`creating client from network configuration: ${JSON.stringify(nodes)}`)
      // scheduleNetworkUpdate is set to false, because the ports 50212/50211 are hardcoded in JS SDK that will not work when running locally or in a pipeline
      this._nodeClient = Client.fromConfig({ network: nodes, scheduleNetworkUpdate: false })
      this._nodeClient.setOperator(operatorId, operatorKey)
      this._nodeClient.setLogger(new Logger(LogLevel.Trace, path.join(constants.SOLO_LOGS_DIR, 'hashgraph-sdk.log')))
      this._nodeClient.setMaxAttempts(constants.NODE_CLIENT_MAX_ATTEMPTS)
      this._nodeClient.setMinBackoff(constants.NODE_CLIENT_MIN_BACKOFF)
      this._nodeClient.setMaxBackoff(constants.NODE_CLIENT_MAX_BACKOFF)
      this._nodeClient.setRequestTimeout(constants.NODE_CLIENT_REQUEST_TIMEOUT)
      return this._nodeClient
    } catch (e) {
      throw new FullstackTestingError(`failed to setup node client: ${e.message}`, e)
    }
  }

  /**
   * Gets a Map of the Hedera node services and the attributes needed
   * @param {string} namespace - the namespace of the fullstack network deployment
   * @returns {Promise<Map<NodeAlias, NetworkNodeServices>>} a map of the network node services
   */
  async getNodeServiceMap (namespace) {
    const labelSelector = 'fullstack.hedera.com/node-name'

    const serviceBuilderMap = /** @type {Map<String,NetworkNodeServicesBuilder>} **/ new Map()

    const serviceList = await this.k8.kubeClient.listNamespacedService(
      namespace, undefined, undefined, undefined, undefined, labelSelector)

    // retrieve the list of services and build custom objects for the attributes we need
    for (const service of serviceList.body.items) {
      const serviceType = service.metadata.labels['fullstack.hedera.com/type']
      let serviceBuilder = new NetworkNodeServicesBuilder(service.metadata.labels['fullstack.hedera.com/node-name'])

      if (serviceBuilderMap.has(serviceBuilder.key())) {
        serviceBuilder = serviceBuilderMap.get(serviceBuilder.key())
      }

      switch (serviceType) {
        // fullstack.hedera.com/type: envoy-proxy-svc
        case 'envoy-proxy-svc':
          serviceBuilder.withEnvoyProxyName(service.metadata.name)
            .withEnvoyProxyClusterIp(service.spec.clusterIP)
            .withEnvoyProxyLoadBalancerIp(service.status.loadBalancer.ingress ? service.status.loadBalancer.ingress[0].ip : undefined)
            .withEnvoyProxyGrpcWebPort(service.spec.ports.filter(port => port.name === 'hedera-grpc-web')[0].port)
          break
        // fullstack.hedera.com/type: haproxy-svc
        case 'haproxy-svc':
          serviceBuilder.withAccountId(service.metadata.labels['fullstack.hedera.com/account-id'])
            .withHaProxyAppSelector(service.spec.selector.app)
            .withHaProxyName(service.metadata.name)
            .withHaProxyClusterIp(service.spec.clusterIP)
            .withHaProxyLoadBalancerIp(service.status.loadBalancer.ingress ? service.status.loadBalancer.ingress[0].ip : undefined)
            .withHaProxyGrpcPort(service.spec.ports.filter(port => port.name === 'non-tls-grpc-client-port')[0].port)
            .withHaProxyGrpcsPort(service.spec.ports.filter(port => port.name === 'tls-grpc-client-port')[0].port)
          break
        // fullstack.hedera.com/type: network-node-svc
        case 'network-node-svc':
          serviceBuilder.withNodeServiceName(service.metadata.name)
            .withNodeServiceClusterIp(service.spec.clusterIP)
            .withNodeServiceLoadBalancerIp(service.status.loadBalancer.ingress ? service.status.loadBalancer.ingress[0].ip : undefined)
            .withNodeServiceGossipPort(service.spec.ports.filter(port => port.name === 'gossip')[0].port)
            .withNodeServiceGrpcPort(service.spec.ports.filter(port => port.name === 'grpc-non-tls')[0].port)
            .withNodeServiceGrpcsPort(service.spec.ports.filter(port => port.name === 'grpc-tls')[0].port)
          break
      }
      serviceBuilderMap.set(serviceBuilder.key(), serviceBuilder)
    }

    // get the pod name for the service to use with portForward if needed
    for (const serviceBuilder of serviceBuilderMap.values()) {
      const podList = await this.k8.kubeClient.listNamespacedPod(
        namespace, null, null, null, null, `app=${serviceBuilder.haProxyAppSelector}`)
      serviceBuilder.withHaProxyPodName(podList.body.items[0].metadata.name)
    }

    // get the pod name of the network node
    const pods = await this.k8.getPodsByLabel(['fullstack.hedera.com/type=network-node'])
    for (const pod of pods) {
      const podName = pod.metadata.name
      const nodeName = pod.metadata.labels['fullstack.hedera.com/node-name']
      const serviceBuilder = /** @type {NetworkNodeServicesBuilder} **/ serviceBuilderMap.get(nodeName)
      serviceBuilder.withNodePodName(podName)
    }

    /** @type {Map<String,NetworkNodeServices>} **/
    const serviceMap = new Map()
    for (const networkNodeServicesBuilder of serviceBuilderMap.values()) {
      serviceMap.set(networkNodeServicesBuilder.key(), networkNodeServicesBuilder.build())
    }

    return serviceMap
  }

  /**
   * updates a set of special accounts keys with a newly generated key and stores them in a Kubernetes secret
   * @param {string} namespace the namespace of the nodes network
   * @param {string[]} currentSet - the accounts to update
   * @param {boolean} updateSecrets - whether to delete the secret prior to creating a new secret
   * @param {Object} resultTracker - an object to keep track of the results from the accounts that are being updated
   * @returns {Promise<*>} the updated resultTracker object
   */
  async updateSpecialAccountsKeys (namespace, currentSet, updateSecrets, resultTracker) {
    const genesisKey = PrivateKey.fromStringED25519(constants.OPERATOR_KEY)
    const realm = constants.HEDERA_NODE_ACCOUNT_ID_START.realm
    const shard = constants.HEDERA_NODE_ACCOUNT_ID_START.shard

    const accountUpdatePromiseArray = []

    for (const accountNum of currentSet) {
      accountUpdatePromiseArray.push(this.updateAccountKeys(
        namespace, AccountId.fromString(`${realm}.${shard}.${accountNum}`), genesisKey, updateSecrets))
    }

    await Promise.allSettled(accountUpdatePromiseArray).then((results) => {
      for (const result of results) {
        switch (result.value.status) {
          case REJECTED:
            if (result.value.reason === REASON_SKIPPED) {
              resultTracker.skippedCount++
            } else {
              this.logger.error(`REJECT: ${result.value.reason}: ${result.value.value}`)
              resultTracker.rejectedCount++
            }
            break
          case FULFILLED:
            resultTracker.fulfilledCount++
            break
        }
      }
    })

    this.logger.debug(`Current counts: [fulfilled: ${resultTracker.fulfilledCount}, skipped: ${resultTracker.skippedCount}, rejected: ${resultTracker.rejectedCount}]`)

    return resultTracker
  }

  /**
   * update the account keys for a given account and store its new key in a Kubernetes secret
   * @param {string} namespace - the namespace of the nodes network
   * @param {AccountId} accountId - the account that will get its keys updated
   * @param {PrivateKey} genesisKey - the genesis key to compare against
   * @param {boolean} updateSecrets - whether to delete the secret prior to creating a new secret
   * @returns {Promise<{value: string, status: string}|{reason: string, value: string, status: string}>} the result of the call
   */
  async updateAccountKeys (namespace, accountId, genesisKey, updateSecrets) {
    let keys
    try {
      keys = await this.getAccountKeys(accountId)
    } catch (e) {
      this.logger.error(`failed to get keys for accountId ${accountId.toString()}, e: ${e.toString()}\n  ${e.stack}`)
      return {
        status: REJECTED,
        reason: REASON_FAILED_TO_GET_KEYS,
        value: accountId.toString()
      }
    }

    if (!keys || !keys[0]) {
      return {
        status: REJECTED,
        reason: REASON_FAILED_TO_GET_KEYS,
        value: accountId.toString()
      }
    }

    if (constants.OPERATOR_PUBLIC_KEY !== keys[0].toString()) {
      this.logger.debug(`account ${accountId.toString()} can be skipped since it does not have a genesis key`)
      return {
        status: REJECTED,
        reason: REASON_SKIPPED,
        value: accountId.toString()
      }
    }

    this.logger.debug(`updating account ${accountId.toString()} since it is using the genesis key`)

    const newPrivateKey = PrivateKey.generateED25519()
    const data = {
      privateKey: Base64.encode(newPrivateKey.toString()),
      publicKey: Base64.encode(newPrivateKey.publicKey.toString())
    }

    try {
      if (!(await this.k8.createSecret(
        Templates.renderAccountKeySecretName(accountId),
        namespace, 'Opaque', data,
        Templates.renderAccountKeySecretLabelObject(accountId), updateSecrets))
      ) {
        this.logger.error(`failed to create secret for accountId ${accountId.toString()}`)
        return {
          status: REJECTED,
          reason: REASON_FAILED_TO_CREATE_K8S_S_KEY,
          value: accountId.toString()
        }
      }
    } catch (e) {
      this.logger.error(`failed to create secret for accountId ${accountId.toString()}, e: ${e.toString()}`)
      return {
        status: REJECTED,
        reason: REASON_FAILED_TO_CREATE_K8S_S_KEY,
        value: accountId.toString()
      }
    }

    try {
      if (!(await this.sendAccountKeyUpdate(accountId, newPrivateKey, genesisKey))) {
        this.logger.error(`failed to update account keys for accountId ${accountId.toString()}`)
        return {
          status: REJECTED,
          reason: REASON_FAILED_TO_UPDATE_ACCOUNT,
          value: accountId.toString()
        }
      }
    } catch (e) {
      this.logger.error(`failed to update account keys for accountId ${accountId.toString()}, e: ${e.toString()}`)
      return {
        status: REJECTED,
        reason: REASON_FAILED_TO_UPDATE_ACCOUNT,
        value: accountId.toString()
      }
    }

    return {
      status: FULFILLED,
      value: accountId.toString()
    }
  }

  /**
   * gets the account info from Hedera network
   * @param {AccountId|string} accountId - the account
   * @returns {AccountInfo} the private key of the account
   */
  async accountInfoQuery (accountId) {
    if (!this._nodeClient) {
      throw new MissingArgumentError('node client is not initialized')
    }

    return await new AccountInfoQuery()
      .setAccountId(accountId)
      .setMaxAttempts(3)
      .setMaxBackoff(1000)
      .execute(this._nodeClient)
  }

  /**
   * gets the account private and public key from the Kubernetes secret from which it is stored
   * @param {AccountId|string} accountId - the account
   * @returns {Promise<Key[]>} the private key of the account
   */
  async getAccountKeys (accountId) {
    const accountInfo = await this.accountInfoQuery(accountId)

    let keys = []
    if (accountInfo.key instanceof KeyList) {
      keys = accountInfo.key.toArray()
    } else {
      keys.push(accountInfo.key)
    }

    return keys
  }

  /**
   * send an account key update transaction to the network of nodes
   * @param {AccountId|string} accountId - the account that will get its keys updated
   * @param {PrivateKey|string} newPrivateKey - the new private key
   * @param {PrivateKey|string} oldPrivateKey - the genesis key that is the current key
   * @returns {Promise<boolean>} whether the update was successful
   */
  async sendAccountKeyUpdate (accountId, newPrivateKey, oldPrivateKey) {
    if (typeof newPrivateKey === 'string') {
      newPrivateKey = PrivateKey.fromStringED25519(newPrivateKey)
    }

    if (typeof oldPrivateKey === 'string') {
      oldPrivateKey = PrivateKey.fromStringED25519(oldPrivateKey)
    }

    // Create the transaction to update the key on the account
    const transaction = await new AccountUpdateTransaction()
      .setAccountId(accountId)
      .setKey(newPrivateKey.publicKey)
      .freezeWith(this._nodeClient)

    // Sign the transaction with the old key and new key
    const signTx = await (await transaction.sign(oldPrivateKey)).sign(
      newPrivateKey)

    // SIgn the transaction with the client operator private key and submit to a Hedera network
    const txResponse = await signTx.execute(this._nodeClient)

    // Request the receipt of the transaction
    const receipt = await txResponse.getReceipt(this._nodeClient)

    return receipt.status === Status.Success
  }

  /**
   * creates a new Hedera account
   * @param {string} namespace - the namespace to store the Kubernetes key secret into
   * @param {Key} privateKey - the private key of type PrivateKey
   * @param {number} amount - the amount of HBAR to add to the account
   * @param {boolean} [setAlias] - whether to set the alias of the account to the public key, requires
   * the privateKey supplied to be ECDSA
   * @returns {Promise<{accountId: AccountId, privateKey: string, publicKey: string, balance: number}>} a custom object with
   * the account information in it
   */
  async createNewAccount (namespace, privateKey, amount, setAlias = false) {
    const newAccountTransaction = new AccountCreateTransaction()
      .setKey(privateKey)
      .setInitialBalance(Hbar.from(amount, HbarUnit.Hbar))

    if (setAlias) {
      newAccountTransaction.setAlias(privateKey.publicKey.toEvmAddress())
    }

    const newAccountResponse = await newAccountTransaction.execute(this._nodeClient)

    // Get the new account ID
    const transactionReceipt = await newAccountResponse.getReceipt(this._nodeClient)
    const accountInfo = {
      accountId: transactionReceipt.accountId.toString(),
      privateKey: privateKey.toString(),
      publicKey: privateKey.publicKey.toString(),
      balance: amount
    }

    // add the account alias if setAlias is true
    if (setAlias) {
      const accountId = accountInfo.accountId
      const realm = transactionReceipt.accountId.realm
      const shard = transactionReceipt.accountId.shard
      const accountInfoQueryResult = await this.accountInfoQuery(accountId)
      accountInfo.accountAlias = `${realm}.${shard}.${accountInfoQueryResult.contractAccountId}`
    }

    try {
      const accountSecretCreated = await this.k8.createSecret(
        Templates.renderAccountKeySecretName(accountInfo.accountId),
        namespace, 'Opaque', {
          privateKey: Base64.encode(accountInfo.privateKey),
          publicKey: Base64.encode(accountInfo.publicKey)
        },
        Templates.renderAccountKeySecretLabelObject(accountInfo.accountId), true)

      if (!(accountSecretCreated)) {
        this.logger.error(`new account created [accountId=${accountInfo.accountId}, amount=${amount} HBAR, publicKey=${accountInfo.publicKey}, privateKey=${accountInfo.privateKey}] but failed to create secret in Kubernetes`)

        throw new FullstackTestingError(`failed to create secret for accountId ${accountInfo.accountId.toString()}, keys were sent to log file`)
      }
    } catch (e) {
      if (e instanceof FullstackTestingError) {
        throw e
      }
      throw new FullstackTestingError(`failed to create secret for accountId ${accountInfo.accountId.toString()}, e: ${e.toString()}`, e)
    }

    return accountInfo
  }

  /**
   * transfer the specified amount of HBAR from one account to another
   * @param {AccountId|string} fromAccountId - the account to pull the HBAR from
   * @param {AccountId|string} toAccountId - the account to put the HBAR
   * @param {number} hbarAmount - the amount of HBAR
   * @returns {Promise<boolean>} if the transaction was successfully posted
   */
  async transferAmount (fromAccountId, toAccountId, hbarAmount) {
    try {
      const transaction = new TransferTransaction()
        .addHbarTransfer(fromAccountId, new Hbar(-1 * hbarAmount))
        .addHbarTransfer(toAccountId, new Hbar(hbarAmount))

      const txResponse = await transaction.execute(this._nodeClient)

      const receipt = await txResponse.getReceipt(this._nodeClient)

      this.logger.debug(`The transfer from account ${fromAccountId} to account ${toAccountId} for amount ${hbarAmount} was ${receipt.status.toString()} `)

      return receipt.status === Status.Success
    } catch (e) {
      const errorMessage = `transfer amount failed with an error: ${e.toString()}`
      this.logger.error(errorMessage)
      throw new FullstackTestingError(errorMessage, e)
    }
  }

  /**
   * Fetch and prepare address book as a base64 string
   * @param {string} namespace the namespace of the network
   * @returns {Promise<string>}
   */
  async prepareAddressBookBase64 (namespace) {
    // fetch AddressBook
    const fileQuery = new FileContentsQuery().setFileId(FileId.ADDRESS_BOOK)
    const addressBookBytes = await fileQuery.execute(this._nodeClient)

    // convert addressBook into base64
    return Base64.encode(addressBookBytes)
  }
}
