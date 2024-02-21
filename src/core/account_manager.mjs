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
import chalk from 'chalk'
import { Templates } from './templates.mjs'

const REASON_FAILED_TO_GET_KEYS = 'failed to get keys for accountId'
const REASON_SKIPPED = 'skipped since it does not have a genesis key'
const REASON_FAILED_TO_UPDATE_ACCOUNT = 'failed to update account keys'
const REASON_FAILED_TO_CREATE_K8S_S_KEY = 'failed to create k8s scrt key'

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
    this.portForwards = []
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
   * Prepares the accounts with updated keys so that they do not contain the default genesis keys
   * @param namespace the namespace to run the update of account keys for
   * @returns {Promise<void>}
   */
  async prepareAccounts (namespace) {
    const serviceMap = await this.getNodeServiceMap(namespace)

    const nodeClient = await this.getNodeClient(
      namespace, serviceMap, constants.OPERATOR_ID, constants.OPERATOR_KEY)

    await this.updateSpecialAccountsKeys(namespace, nodeClient, constants.SYSTEM_ACCOUNTS)
    // update the treasury account last
    await this.updateSpecialAccountsKeys(namespace, nodeClient, constants.TREASURY_ACCOUNTS)

    nodeClient.close()
    await this.stopPortForwards()
  }

  /**
   * stops and closes all of the port forwards that are running
   * @returns {Promise<void>}
   */
  async stopPortForwards () {
    if (this.portForwards) {
      this.portForwards.forEach(server => {
        server.close()
      })
      this.portForwards = []
      await sleep(1) // give a tick for connections to close
    }
  }

  /**
   * Returns a node client that can be used to make calls against
   * @param namespace the namespace for which the node client resides
   * @param serviceMap a map of the service objects that proxy the nodes
   * @param operatorId the account id of the operator of the transactions
   * @param operatorKey the private key of the operator of the transactions
   * @returns {Promise<NodeClient>} a node client that can be used to call transactions
   */
  async getNodeClient (namespace, serviceMap, operatorId, operatorKey) {
    const nodes = {}
    try {
      let localPort = constants.LOCAL_NODE_START_PORT

      for (const serviceObject of serviceMap.values()) {
        if (!this.isLocalhost() && !serviceObject.loadBalancerIp) {
          throw new Error(
              `Expected service ${serviceObject.name} to have a loadBalancerIP set for basepath ${this.k8.kubeClient.basePath}`)
        }
        const host = this.isLocalhost() ? '127.0.0.1' : serviceObject.loadBalancerIp
        const port = serviceObject.grpcPort
        const targetPort = this.isLocalhost() ? localPort : port

        if (this.isLocalhost()) {
          this.portForwards.push(await this.k8.portForward(serviceObject.podName, localPort, port))
        }

        nodes[`${host}:${targetPort}`] = AccountId.fromString(serviceObject.accountId)
        await this.testConnection(serviceObject.podName, host, targetPort)

        localPort++
      }

      this.logger.debug(`creating client from network configuration: ${JSON.stringify(nodes)}`)
      const nodeClient = Client.fromConfig({ network: nodes })
      nodeClient.setOperator(operatorId, operatorKey)

      return nodeClient
    } catch (e) {
      throw new FullstackTestingError(`failed to setup node client: ${e.message}`, e)
    }
  }

  /**
   * returns true if we detect that we are running against a local Kubernetes cluster
   * @returns boolean true if we are running against a local Kubernetes cluster, else false
   */
  isLocalhost () {
    return this.k8.kubeClient.basePath.includes('127.0.0.1')
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
   * @param nodeClient the active node client configured to point at the network
   * @param accounts the accounts to update
   * @returns {Promise<void>}
   */
  async updateSpecialAccountsKeys (namespace, nodeClient, accounts) {
    const genesisKey = PrivateKey.fromStringED25519(constants.OPERATOR_KEY)
    const accountUpdatePromiseArray = []
    const realm = constants.HEDERA_NODE_ACCOUNT_ID_START.realm
    const shard = constants.HEDERA_NODE_ACCOUNT_ID_START.shard

    for (const [start, end] of accounts) {
      for (let i = start; i <= end; i++) {
        accountUpdatePromiseArray.push(this.updateAccountKeys(
          namespace, nodeClient, AccountId.fromString(`${realm}.${shard}.${i}`), genesisKey))

        await sleep(constants.ACCOUNT_KEYS_UPDATE_PAUSE) // sleep a little to prevent overwhelming the servers
      }
    }

    await Promise.allSettled(accountUpdatePromiseArray).then((results) => {
      let rejectedCount = 0
      let fulfilledCount = 0
      let skippedCount = 0

      for (const result of results) {
        switch (result.status) {
          case 'rejected':
            if (result.reason === REASON_SKIPPED) {
              skippedCount++
            } else {
              this.logger.error(`REJECT: ${result.reason}: ${result.value}`)
              rejectedCount++
            }
            break
          case 'fulfilled':
            fulfilledCount++
            break
        }
      }
      this.logger.showUser(chalk.green(`Account keys updated SUCCESSFULLY: ${fulfilledCount}`))
      if (skippedCount > 0) this.logger.showUser(chalk.cyan(`Account keys updates SKIPPED: ${skippedCount}`))
      if (rejectedCount > 0) this.logger.showUser(chalk.yellowBright(`Account keys updates with ERROR: ${rejectedCount}`))
    })
  }

  /**
   * update the account keys for a given account and store its new key in a Kubernetes
   * secret
   * @param namespace the namespace of the nodes network
   * @param nodeClient the active node client configured to point at the network
   * @param accountId the account that will get its keys updated
   * @param genesisKey the genesis key to compare against
   * @returns {Promise<{value: string, status: string}|{reason: string, value: string, status: string}>} the result of the call
   */
  async updateAccountKeys (namespace, nodeClient, accountId, genesisKey) {
    let keys
    try {
      keys = await this.getAccountKeys(accountId, nodeClient)
      this.logger.debug(`retrieved keys for account ${accountId.toString()}`)
    } catch (e) {
      this.logger.error(`failed to get keys for accountId ${accountId.toString()}, e: ${e.toString()}\n  ${e.stack}`)
      return {
        status: 'rejected',
        reason: REASON_FAILED_TO_GET_KEYS,
        value: accountId.toString()
      }
    }

    if (constants.OPERATOR_PUBLIC_KEY !== keys[0].toString()) {
      this.logger.debug(`account ${accountId.toString()} can be skipped since it does not have a genesis key`)
      return {
        status: 'rejected',
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
        Templates.renderAccountKeySecretLabelObject(accountId), true))
      ) {
        this.logger.error(`failed to create secret for accountId ${accountId.toString()}`)
        return {
          status: 'rejected',
          reason: REASON_FAILED_TO_CREATE_K8S_S_KEY,
          value: accountId.toString()
        }
      }
      this.logger.debug(`created k8s secret for account ${accountId.toString()}`)
    } catch (e) {
      this.logger.error(`failed to create secret for accountId ${accountId.toString()}, e: ${e.toString()}`)
      return {
        status: 'rejected',
        reason: REASON_FAILED_TO_CREATE_K8S_S_KEY,
        value: accountId.toString()
      }
    }

    try {
      if (!(await this.sendAccountKeyUpdate(accountId, newPrivateKey, nodeClient, genesisKey))) {
        this.logger.error(`failed to update account keys for accountId ${accountId.toString()}`)
        return {
          status: 'rejected',
          reason: REASON_FAILED_TO_UPDATE_ACCOUNT,
          value: accountId.toString()
        }
      }
      this.logger.debug(`sent account key update for account ${accountId.toString()}`)
    } catch (e) {
      this.logger.error(`failed to update account keys for accountId ${accountId.toString()}, e: ${e.toString()}`)
      return {
        status: 'rejected',
        reason: REASON_FAILED_TO_UPDATE_ACCOUNT,
        value: accountId.toString()
      }
    }

    return {
      status: 'fulfilled',
      value: accountId.toString()
    }
  }

  /**
   * gets the account info from Hedera network
   * @param accountId the account
   * @param nodeClient the active and configured node client
   * @returns {AccountInfo} the private key of the account
   */
  async accountInfoQuery (accountId, nodeClient) {
    return await new AccountInfoQuery()
      .setAccountId(accountId)
      .execute(nodeClient)
  }

  /**
   * gets the account private and public key from the Kubernetes secret from which it is stored
   * @param accountId the account
   * @param nodeClient the active and configured node client
   * @returns {Promise<Key[]>} the private key of the account
   */
  async getAccountKeys (accountId, nodeClient) {
    const accountInfo = await this.accountInfoQuery(accountId, nodeClient)

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
   * @param nodeClient the active and configured node client
   * @param oldPrivateKey the genesis key that is the current key
   * @returns {Promise<boolean>} whether the update was successful
   */
  async sendAccountKeyUpdate (accountId, newPrivateKey, nodeClient, oldPrivateKey) {
    this.logger.debug(
        `Updating account ${accountId.toString()} with new public and private keys`)

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
      .freezeWith(nodeClient)

    // Sign the transaction with the old key and new key
    const signTx = await (await transaction.sign(oldPrivateKey)).sign(
      newPrivateKey)

    // SIgn the transaction with the client operator private key and submit to a Hedera network
    const txResponse = await signTx.execute(nodeClient)

    // Request the receipt of the transaction
    const receipt = await txResponse.getReceipt(nodeClient)

    this.logger.debug(
        `The transaction consensus status for update of accountId ${accountId.toString()} is ${receipt.status}`)

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
    socket.destroy()
    await sleep(1) // gives a few ticks for connections to close
  }

  /**
   * creates a new Hedera account
   * @param namespace the namespace to store the Kubernetes key secret into
   * @param nodeClient the active and network configured node client
   * @param privateKey the private key of type PrivateKey
   * @param amount the amount of HBAR to add to the account
   * @returns {{accountId: AccountId, privateKey: string, publicKey: string, balance: number}} a
   * custom object with the account information in it
   */
  async createNewAccount (namespace, nodeClient, privateKey, amount) {
    const newAccount = await new AccountCreateTransaction()
      .setKey(privateKey)
      .setInitialBalance(Hbar.from(amount, HbarUnit.Hbar))
      .execute(nodeClient)

    // Get the new account ID
    const getReceipt = await newAccount.getReceipt(nodeClient)
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
    this.logger.debug(`created k8s secret for account ${accountInfo.accountId}`)

    return accountInfo
  }

  /**
   * transfer the specified amount of HBAR from one account to another
   * @param nodeClient the configured and active network node client
   * @param fromAccountId the account to pull the HBAR from
   * @param toAccountId the account to put the HBAR
   * @param hbarAmount the amount of HBAR
   * @returns {Promise<boolean>} if the transaction was successfully posted
   */
  async transferAmount (nodeClient, fromAccountId, toAccountId, hbarAmount) {
    try {
      const transaction = new TransferTransaction()
        .addHbarTransfer(fromAccountId, new Hbar(-1 * hbarAmount))
        .addHbarTransfer(toAccountId, new Hbar(hbarAmount))

      const txResponse = await transaction.execute(nodeClient)

      const receipt = await txResponse.getReceipt(nodeClient)

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
   * @param nodeClient node client
   * @return {Promise<string>}
   */
  async prepareAddressBookBase64 (nodeClient) {
    // fetch AddressBook
    const fileQuery = new FileContentsQuery().setFileId(FileId.ADDRESS_BOOK)
    let addressBookBytes = await fileQuery.execute(nodeClient)

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
