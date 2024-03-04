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
import * as HashgraphProto from '@hashgraph/proto'
import * as Base64 from 'js-base64'
import * as constants from './constants.mjs'
import {
  AccountCreateTransaction,
  AccountId,
  AccountInfoQuery,
  AccountUpdateTransaction,
  Client, FileContentsQuery, FileId,
  Hbar,
  HbarUnit,
  KeyList,
  PrivateKey,
  Status,
  TransferTransaction
} from '@hashgraph/sdk'
import { FullstackTestingError } from './errors.mjs'
import { sleep } from './helpers.mjs'
import net from 'net'
import { Templates } from './templates.mjs'

const REASON_FAILED_TO_GET_KEYS = 'failed to get keys for accountId'
const REASON_SKIPPED = 'skipped since it does not have a genesis key'
const REASON_FAILED_TO_UPDATE_ACCOUNT = 'failed to update account keys'
const REASON_FAILED_TO_CREATE_K8S_S_KEY = 'failed to create k8s scrt key'
const FULFILLED = 'fulfilled'
const REJECTED = 'rejected'
const MAX_PORT_FORWARD_SLEEP_ITERATIONS = 500
const PORT_FORWARD_CLOSE_SLEEP = 500

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
export class AccountManager {
  static _openPortForwardConnections = 0

  /**
   * creates a new AccountManager instance
   * @param logger the logger to use
   * @param k8 the K8 instance
   */
  constructor (logger, k8) {
    if (!logger) throw new Error('An instance of core/Logger is required')
    if (!k8) throw new Error('An instance of core/K8 is required')

    this.logger = logger
    this.k8 = k8
    this._portForwards = []
    this._nodeClient = null
  }

  /**
   * Gets the account keys from the Kubernetes secret from which it is stored
   * @param accountId the account ID for which we want its keys
   * @param namespace the namespace that is storing the secret
   * @returns {Promise<{accountId: string, privateKey: string, publicKey: string}|null>} a
   * custom object with the account id, private key, and public key
   */
  async getAccountKeysFromSecret (accountId, namespace) {
    const secret = await this.k8.getSecret(namespace, Templates.renderAccountKeySecretLabelSelector(accountId))
    if (secret) {
      return {
        accountId: secret.labels['fullstack.hedera.com/account-id'],
        privateKey: secret.data.privateKey,
        publicKey: secret.data.publicKey
      }
    } else {
      return null
    }
  }

  /**
   * Gets the treasury account private key from Kubernetes secret if it exists, else
   * returns the Genesis private key, then will return an AccountInfo object with the
   * accountId, privateKey, publicKey
   * @param namespace the namespace that the secret is in
   * @returns {Promise<{accountId: string, privateKey: string, publicKey: string}>}
   */
  async getTreasuryAccountKeys (namespace) {
    // check to see if the treasure account is in the secrets
    let accountInfo = await this.getAccountKeysFromSecret(constants.TREASURY_ACCOUNT_ID, namespace)

    // if it isn't in the secrets we can load genesis key
    if (!accountInfo) {
      accountInfo = {
        accountId: constants.TREASURY_ACCOUNT_ID,
        privateKey: constants.GENESIS_KEY,
        publicKey: PrivateKey.fromStringED25519(constants.GENESIS_KEY).publicKey.toString()
      }
    }

    return accountInfo
  }

  batchAccounts () {
    const batchSize = constants.ACCOUNT_CREATE_BATCH_SIZE
    const batchSets = []

    let batchCounter = 0
    let currentBatch = []
    for (const [start, end] of constants.SYSTEM_ACCOUNTS) {
      for (let i = start; i <= end; i++) {
        currentBatch.push(i)
        batchCounter++

        // push only a single account for the first to give time for the
        // network to create all the system accounts and become stable
        if (batchCounter >= batchSize || batchSets.length < 1) {
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
    if (this._nodeClient) {
      this._nodeClient.close()
      this._nodeClient = null
    }
    await this._stopPortForwards()
  }

  /**
   * stops and closes all of the port forwards that are running
   * @returns {Promise<void>}
   */
  async _stopPortForwards () {
    if (this._portForwards) {
      for (const webSocketServer of this._portForwards) {
        webSocketServer.kill(() => {
          AccountManager._openPortForwardConnections--
        })
      }

      let sleepCounter = 0
      while (AccountManager._openPortForwardConnections > 0 && sleepCounter < MAX_PORT_FORWARD_SLEEP_ITERATIONS) {
        await sleep(PORT_FORWARD_CLOSE_SLEEP)
        this.logger.debug(`waiting ${PORT_FORWARD_CLOSE_SLEEP}ms for port forward server to close .... ${++sleepCounter} of ${MAX_PORT_FORWARD_SLEEP_ITERATIONS}`)
      }
      if (sleepCounter >= MAX_PORT_FORWARD_SLEEP_ITERATIONS) {
        this.logger.error(`failed to detect that all port forward servers closed correctly, ${AccountManager._openPortForwardConnections} of ${this._portForwards.length} remain open`)
      }

      this._portForwards = []
    }
  }

  /**
   * loads and initializes the Node Client
   * @param namespace the namespace of the network
   * @returns {Promise<void>}
   */
  async loadNodeClient (namespace) {
    const treasuryAccountInfo = await this.getTreasuryAccountKeys(namespace)
    const serviceMap = await this.getNodeServiceMap(namespace)

    this._nodeClient = await this._getNodeClient(namespace,
      serviceMap, treasuryAccountInfo.accountId, treasuryAccountInfo.privateKey)
  }

  /**
   * Returns a node client that can be used to make calls against
   * @param namespace the namespace for which the node client resides
   * @param serviceMap a map of the service objects that proxy the nodes
   * @param operatorId the account id of the operator of the transactions
   * @param operatorKey the private key of the operator of the transactions
   * @returns {Promise<NodeClient>} a node client that can be used to call transactions
   */
  async _getNodeClient (namespace, serviceMap, operatorId, operatorKey) {
    const nodes = {}
    try {
      let localPort = constants.LOCAL_NODE_START_PORT

      for (const serviceObject of serviceMap.values()) {
        const usePortForward = !(serviceObject.loadBalancerIp)
        const host = usePortForward ? '127.0.0.1' : serviceObject.loadBalancerIp
        const port = serviceObject.grpcPort
        const targetPort = usePortForward ? localPort : port

        if (usePortForward) {
          this._portForwards.push(await this.k8.portForward(serviceObject.podName, localPort, port))
          AccountManager._openPortForwardConnections++
        }

        nodes[`${host}:${targetPort}`] = AccountId.fromString(serviceObject.accountId)
        await this.testConnection(serviceObject.podName, host, targetPort)

        localPort++
      }

      this.logger.debug(`creating client from network configuration: ${JSON.stringify(nodes)}`)
      this._nodeClient = Client.fromConfig({ network: nodes })
      this._nodeClient.setOperator(operatorId, operatorKey)

      return this._nodeClient
    } catch (e) {
      throw new FullstackTestingError(`failed to setup node client: ${e.message}`, e)
    }
  }

  /**
   * Gets a Map of the Hedera node services and the attributes needed
   * @param namespace the namespace of the fullstack network deployment
   * @returns {Map<any, any>} the Map of <nodeName:string, serviceObject>
   */
  async getNodeServiceMap (namespace) {
    const labelSelector = 'fullstack.hedera.com/node-name,fullstack.hedera.com/type=haproxy-svc'
    const serviceMap = new Map()

    const serviceList = await this.k8.kubeClient.listNamespacedService(
      namespace, undefined, undefined, undefined, undefined, labelSelector)

    // retrieve the list of services and build custom objects for the attributes we need
    for (const service of serviceList.body.items) {
      const serviceObject = {}
      serviceObject.name = service.metadata.name
      serviceObject.loadBalancerIp = service.status.loadBalancer.ingress ? service.status.loadBalancer.ingress[0].ip : undefined
      serviceObject.grpcPort = service.spec.ports.filter(port => port.name === 'non-tls-grpc-client-port')[0].port
      serviceObject.grpcsPort = service.spec.ports.filter(port => port.name === 'tls-grpc-client-port')[0].port
      serviceObject.node = service.metadata.labels['fullstack.hedera.com/node-name']
      serviceObject.accountId = service.metadata.labels['fullstack.hedera.com/account-id']
      serviceObject.selector = service.spec.selector.app
      serviceMap.set(serviceObject.node, serviceObject)
    }

    // get the pod name for the service to use with portForward if needed
    for (const serviceObject of serviceMap.values()) {
      const labelSelector = `app=${serviceObject.selector}`
      const podList = await this.k8.kubeClient.listNamespacedPod(
        namespace, null, null, null, null, labelSelector)
      serviceObject.podName = podList.body.items[0].metadata.name
    }

    return serviceMap
  }

  /**
   * updates a set of special accounts keys with a newly generated key and stores them in a
   * Kubernetes secret
   * @param namespace the namespace of the nodes network
   * @param currentSet the accounts to update
   * @param updateSecrets whether to delete the secret prior to creating a new secret
   * @param resultTracker an object to keep track of the results from the accounts that are being updated
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

    this.logger.debug(`Current counts: [fulfilled: ${resultTracker.fulfilledCount}, skipped: ${resultTracker.skippedCount}, rejected: ${resultTracker.rejectedCount}`)

    return resultTracker
  }

  /**
   * update the account keys for a given account and store its new key in a Kubernetes
   * secret
   * @param namespace the namespace of the nodes network
   * @param accountId the account that will get its keys updated
   * @param genesisKey the genesis key to compare against
   * @param updateSecrets whether to delete the secret prior to creating a new secret
   * @returns {Promise<{value: string, status: string}|{reason: string, value: string, status: string}>} the result of the call
   */
  async updateAccountKeys (namespace, accountId, genesisKey, updateSecrets) {
    let keys
    try {
      this.logger.debug(`getAccountKeys: account ${accountId.toString()} begin`)
      keys = await this.getAccountKeys(accountId)
    } catch (e) {
      this.logger.error(`failed to get keys for accountId ${accountId.toString()}, e: ${e.toString()}\n  ${e.stack}`)
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

    const newPrivateKey = PrivateKey.generateED25519()
    const data = {
      privateKey: newPrivateKey.toString(),
      publicKey: newPrivateKey.publicKey.toString()
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
      this.logger.debug(`sendAccountKeyUpdate: account ${accountId.toString()} begin...`)
      if (!(await this.sendAccountKeyUpdate(accountId, newPrivateKey, genesisKey))) {
        this.logger.error(`failed to update account keys for accountId ${accountId.toString()}`)
        return {
          status: REJECTED,
          reason: REASON_FAILED_TO_UPDATE_ACCOUNT,
          value: accountId.toString()
        }
      }
      this.logger.debug(`sendAccountKeyUpdate: account ${accountId.toString()} ...end`)
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
   * @param accountId the account
   * @returns {AccountInfo} the private key of the account
   */
  async accountInfoQuery (accountId) {
    return await new AccountInfoQuery()
      .setAccountId(accountId)
      .execute(this._nodeClient)
  }

  /**
   * gets the account private and public key from the Kubernetes secret from which it is stored
   * @param accountId the account
   * @returns {Promise<Key[]>} the private key of the account
   */
  async getAccountKeys (accountId) {
    const accountInfo = await this.accountInfoQuery(accountId)

    let keys
    if (accountInfo.key instanceof KeyList) {
      keys = accountInfo.key.toArray()
    } else {
      keys = []
      keys.push(accountInfo.key)
    }

    return keys
  }

  /**
   * send an account key update transaction to the network of nodes
   * @param accountId the account that will get it's keys updated
   * @param newPrivateKey the new private key
   * @param oldPrivateKey the genesis key that is the current key
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
   * to test the connection to the node within the network
   * @param podName the podName is only used for logging messages and errors
   * @param host the host of the target connection
   * @param port the port of the target connection
   * @returns {Promise<void>}
   */
  async testConnection (podName, host, port) {
    // check if the port is actually accessible
    let attempt = 1
    let socket = null
    while (attempt < 10) {
      try {
        await sleep(250)
        this.logger.debug(`Checking exposed port '${port}' of pod ${podName} at IP address ${host}`)
        socket = net.createConnection({ host, port })
        this.logger.debug(`Connected to port '${port}' of pod ${podName} at IP address ${host}`)
        break
      } catch (e) {
        attempt += 1
      }
    }
    if (!socket) {
      throw new FullstackTestingError(`failed to connect to port '${port}' of pod ${podName} at IP address ${host}`)
    }
    await socket.destroy()
  }

  /**
   * creates a new Hedera account
   * @param namespace the namespace to store the Kubernetes key secret into
   * @param privateKey the private key of type PrivateKey
   * @param amount the amount of HBAR to add to the account
   * @returns {{accountId: AccountId, privateKey: string, publicKey: string, balance: number}} a
   * custom object with the account information in it
   */
  async createNewAccount (namespace, privateKey, amount) {
    const newAccount = await new AccountCreateTransaction()
      .setKey(privateKey)
      .setInitialBalance(Hbar.from(amount, HbarUnit.Hbar))
      .execute(this._nodeClient)

    // Get the new account ID
    const getReceipt = await newAccount.getReceipt(this._nodeClient)
    const accountInfo = {
      accountId: getReceipt.accountId.toString(),
      privateKey: privateKey.toString(),
      publicKey: privateKey.publicKey.toString(),
      balance: amount
    }

    if (!(await this.k8.createSecret(
      Templates.renderAccountKeySecretName(accountInfo.accountId),
      namespace, 'Opaque', {
        privateKey: accountInfo.privateKey,
        publicKey: accountInfo.publicKey
      },
      Templates.renderAccountKeySecretLabelObject(accountInfo.accountId), true))
    ) {
      this.logger.error(`new account created [accountId=${accountInfo.accountId}, amount=${amount} HBAR, publicKey=${accountInfo.publicKey}, privateKey=${accountInfo.privateKey}] but failed to create secret in Kubernetes`)

      throw new FullstackTestingError(`failed to create secret for accountId ${accountInfo.accountId.toString()}, keys were sent to log file`)
    }

    return accountInfo
  }

  /**
   * transfer the specified amount of HBAR from one account to another
   * @param fromAccountId the account to pull the HBAR from
   * @param toAccountId the account to put the HBAR
   * @param hbarAmount the amount of HBAR
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
   * @return {Promise<string>}
   */
  async prepareAddressBookBase64 () {
    // fetch AddressBook
    const fileQuery = new FileContentsQuery().setFileId(FileId.ADDRESS_BOOK)
    let addressBookBytes = await fileQuery.execute(this._nodeClient)

    // ensure serviceEndpoint.ipAddressV4 value for all nodes in the addressBook is a 4 bytes array instead of string
    // See: https://github.com/hashgraph/hedera-protobufs/blob/main/services/basic_types.proto#L1309
    const addressBook = HashgraphProto.proto.NodeAddressBook.decode(addressBookBytes)
    let modified = false
    for (const nodeAddress of addressBook.nodeAddress) {
      // overwrite ipAddressV4 as 4 bytes array if required
      if (nodeAddress.serviceEndpoint[0].ipAddressV4.byteLength !== 4) {
        const ipAddress = nodeAddress.serviceEndpoint[0].ipAddressV4.toString()
        const parts = ipAddress.split('.')
        if (parts.length !== 4) {
          throw new FullstackTestingError(`expected node IP address to have 4 parts, found ${parts.length}: ${ipAddress}`)
        }

        nodeAddress.serviceEndpoint[0].ipAddressV4 = Uint8Array.from(parts)
        modified = true
      }
    }

    if (modified) {
      addressBookBytes = HashgraphProto.proto.NodeAddressBook.encode(addressBook).finish()
    }

    // convert addressBook into base64
    return Base64.encode(addressBookBytes)
  }
}
