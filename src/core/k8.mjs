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
import * as k8s from '@kubernetes/client-node'
import fs from 'fs'
import net from 'net'
import os from 'os'
import path from 'path'
import { flags } from '../commands/index.mjs'
import { FullstackTestingError, IllegalArgumentError, MissingArgumentError } from './errors.mjs'
import * as sb from 'stream-buffers'
import * as tar from 'tar'
import { v4 as uuid4 } from 'uuid'
import { V1ObjectMeta, V1Secret } from '@kubernetes/client-node'
import { sleep } from './helpers.mjs'
import { constants } from './index.mjs'

/**
 * A kubernetes API wrapper class providing custom functionalities required by solo
 *
 * Note: Take care if the same instance is used for parallel execution, as the behaviour may be unpredictable.
 * For parallel execution, create separate instances by invoking clone()
 */
export class K8 {
  static PodReadyCondition = new Map().set(constants.POD_CONDITION_READY, constants.POD_CONDITION_STATUS_TRUE)

  constructor (configManager, logger) {
    if (!configManager) throw new MissingArgumentError('An instance of core/ConfigManager is required')
    if (!logger) throw new MissingArgumentError('An instance of core/Logger is required')

    this.configManager = configManager
    this.logger = logger

    this.init()
  }

  /**
   * Clone a new instance with the same config manager and logger
   * Internally it instantiates a new kube API client
   *
   * @return {K8}
   */
  clone () {
    const c = new K8(this.configManager, this.logger)
    return c.init()
  }

  getKubeConfig () {
    return this.kubeConfig
  }

  init () {
    this.kubeConfig = new k8s.KubeConfig()
    this.kubeConfig.loadFromDefault()

    if (!this.kubeConfig.getCurrentCluster()) {
      throw new FullstackTestingError('No active kubernetes cluster found. ' +
        'Please create a cluster and set current context.')
    }

    if (!this.kubeConfig.getCurrentContext()) {
      throw new FullstackTestingError('No active kubernetes context found. ' +
        'Please set current kubernetes context.')
    }

    this.kubeClient = this.kubeConfig.makeApiClient(k8s.CoreV1Api)

    return this // to enable chaining
  }

  /**
   * Apply filters to metadata
   * @param items list of items
   * @param filters an object with metadata fields and value
   * @return a list of items that match the filters
   */
  applyMetadataFilter (items, filters = {}) {
    if (!filters) throw new MissingArgumentError('filters are required')

    const matched = []
    const filterMap = new Map(Object.entries(filters))
    for (const item of items) {
      // match all filters
      let foundMatch = true
      for (const entry of filterMap.entries()) {
        const field = entry[0]
        const value = entry[1]

        if (item.metadata[field] !== value) {
          foundMatch = false
          break
        }
      }

      if (foundMatch) {
        matched.push(item)
      }
    }

    return matched
  }

  /**
   * Filter a single item using metadata filter
   * @param items list of items
   * @param filters an object with metadata fields and value
   * @return {*}
   */
  filterItem (items, filters = {}) {
    const filtered = this.applyMetadataFilter(items, filters)
    if (filtered.length > 1) throw new FullstackTestingError('multiple items found with filters', { filters })
    return filtered[0]
  }

  /**
   * Create a new namespace
   * @param name name of the namespace
   * @return {Promise<boolean>}
   */
  async createNamespace (name) {
    const payload = {
      metadata: {
        name
      }
    }

    const resp = await this.kubeClient.createNamespace(payload)
    return resp.response.statusCode === 201
  }

  /**
   * Delete a namespace
   * @param name name of the namespace
   * @return {Promise<boolean>}
   */
  async deleteNamespace (name) {
    const resp = await this.kubeClient.deleteNamespace(name)
    return resp.response.statusCode === 200.0
  }

  /**
   * Get a list of namespaces
   * @return list of namespaces
   */
  async getNamespaces () {
    const resp = await this.kubeClient.listNamespace()
    if (resp.body && resp.body.items) {
      const namespaces = []
      resp.body.items.forEach(item => {
        namespaces.push(item.metadata.name)
      })

      return namespaces
    }

    throw new FullstackTestingError('incorrect response received from kubernetes API. Unable to list namespaces')
  }

  /**
   * Returns true if a namespace exists with the given name
   * @param namespace namespace name
   * @return {Promise<boolean>}
   */
  async hasNamespace (namespace) {
    const namespaces = await this.getNamespaces()
    return namespaces.includes(namespace)
  }

  /**
   * Get a podName by name
   * @param name podName name
   * @return {Promise<{}>} k8s.V1Pod object
   */
  async getPodByName (name) {
    const ns = this._getNamespace()
    const fieldSelector = `metadata.name=${name}`
    const resp = await this.kubeClient.listNamespacedPod(
      ns,
      undefined,
      undefined,
      undefined,
      fieldSelector
    )

    return this.filterItem(resp.body.items, { name })
  }

  /**
   * Get pods by labels
   * @param labels list of labels
   * @return {Promise<Array<V1Pod>>}
   */
  async getPodsByLabel (labels = []) {
    const ns = this._getNamespace()
    const labelSelector = labels.join(',')
    const result = await this.kubeClient.listNamespacedPod(
      ns,
      undefined,
      undefined,
      undefined,
      undefined,
      labelSelector
    )

    return result.body.items
  }

  /**
   * Get secrets by labels
   * @param labels list of labels
   * @return {Promise<Array<V1Secret>>}
   */
  async getSecretsByLabel (labels = []) {
    const ns = this._getNamespace()
    const labelSelector = labels.join(',')
    const result = await this.kubeClient.listNamespacedSecret(
      ns,
      undefined,
      undefined,
      undefined,
      undefined,
      labelSelector
    )

    return result.body.items
  }

  /**
   * Get host IP of a podName
   * @param podNameName name of the podName
   * @returns {Promise<string>} podName IP
   */
  async getPodIP (podNameName) {
    const pod = await this.getPodByName(podNameName)
    if (pod && pod.status && pod.status.podIP) {
      this.logger.debug(`Found pod IP for ${podNameName}: ${pod.status.podIP}`)
      return pod.status.podIP
    }

    this.logger.debug(`Unable to find pod IP for ${podNameName}`)
    throw new FullstackTestingError(`unable to find host IP of podName: ${podNameName}`)
  }

  /**
   * Get a svc by name
   * @param name svc name
   * @return {Promise<{}>} k8s.V1Service object
   */
  async getSvcByName (name) {
    const ns = this._getNamespace()
    const fieldSelector = `metadata.name=${name}`
    const resp = await this.kubeClient.listNamespacedService(
      ns,
      undefined,
      undefined,
      undefined,
      fieldSelector
    )

    return this.filterItem(resp.body.items, { name })
  }

  /**
   * Get cluster IP of a service
   * @param svcName name of the service
   * @returns {Promise<string>} cluster IP
   */
  async getClusterIP (svcName) {
    const svc = await this.getSvcByName(svcName)
    if (svc && svc.spec && svc.spec.clusterIP) {
      return svc.spec.clusterIP
    }

    throw new FullstackTestingError(`unable to find cluster IP for svc: ${svcName}`)
  }

  /**
   * Get a list of clusters
   * @return a list of cluster names
   */
  async getClusters () {
    const clusters = []
    for (const cluster of this.kubeConfig.getClusters()) {
      clusters.push(cluster.name)
    }

    return clusters
  }

  /**
   * Get a list of contexts
   * @return a list of context names
   */
  async getContexts () {
    const contexts = []
    for (const context of this.kubeConfig.getContexts()) {
      contexts.push(context.name)
    }

    return contexts
  }

  /**
   * List files and directories in a container
   *
   * It runs ls -la on the specified path and returns a list of object containing the entries.
   * For example:
   * [{
   *    directory: false,
   *    owner: hedera,
   *    group: hedera,
   *    size: 121,
   *    modifiedAt: Jan 15 13:50
   *    name: config.txt
   * }]
   *
   * @param podName pod name
   * @param containerName container name
   * @param destPath path inside the container
   * @param timeout timeout in ms
   * @return {Promise<{}>}
   */
  async listDir (podName, containerName, destPath, timeout = 5000) {
    try {
      const output = await this.execContainer(podName, containerName, ['ls', '-la', destPath])
      if (!output) return []

      // parse the output and return the entries
      const items = []
      const lines = output.split('\n')
      for (let line of lines) {
        line = line.replace(/\s+/g, '|')
        const parts = line.split('|')
        if (parts.length === 9) {
          const name = parts[parts.length - 1]
          if (name !== '.' && name !== '..') {
            const permission = parts[0]
            const item = {
              directory: permission[0] === 'd',
              owner: parts[2],
              group: parts[3],
              size: parts[4],
              modifiedAt: `${parts[5]} ${parts[6]} ${parts[7]}`,
              name
            }

            items.push(item)
          }
        }
      }

      return items
    } catch (e) {
      throw new FullstackTestingError(`unable to check path in '${podName}':${containerName}' - ${destPath}: ${e.message}`, e)
    }
  }

  /**
   * Check if a filepath exists in the container
   * @param podName pod name
   * @param containerName container name
   * @param destPath path inside the container
   * @param filters an object with metadata fields and value
   * @return {Promise<boolean>}
   */
  async hasFile (podName, containerName, destPath, filters = {}) {
    const parentDir = path.dirname(destPath)
    const fileName = path.basename(destPath)
    const filterMap = new Map(Object.entries(filters))

    try {
      const entries = await this.listDir(podName, containerName, parentDir)

      for (const item of entries) {
        if (item.name === fileName && !item.directory) {
          let found = true

          for (const entry of filterMap.entries()) {
            const field = entry[0]
            const value = entry[1]
            this.logger.debug(`Checking file ${podName}:${containerName} ${destPath}; ${field} expected ${value}, found ${item[field]}`, { filters })
            if (`${value}` !== `${item[field]}`) {
              found = false
              break
            }
          }

          if (found) {
            this.logger.debug(`File check succeeded ${podName}:${containerName} ${destPath}`, { filters })
            return true
          }
        }
      }
    } catch (e) {
      const error = new FullstackTestingError(`unable to check file in '${podName}':${containerName}' - ${destPath}: ${e.message}`, e)
      this.logger.error(error.message, error)
      throw error
    }

    return false
  }

  /**
   * Check if a directory path exists in the container
   * @param podName pod name
   * @param containerName container name
   * @param destPath path inside the container
   * @return {Promise<boolean>}
   */
  async hasDir (podName, containerName, destPath) {
    return await this.execContainer(
      podName,
      containerName,
      ['bash', '-c', '[[ -d "' + destPath + '" ]] && echo -n "true" || echo -n "false"']
    ) === 'true'
  }

  async mkdir (podName, containerName, destPath) {
    return this.execContainer(
      podName,
      containerName,
      ['bash', '-c', 'mkdir -p "' + destPath + '"']
    )
  }

  /**
   * Copy a file into a container
   *
   * It overwrites any existing file inside the container at the destination directory
   *
   * @param podName podName name
   * @param containerName container name
   * @param srcPath source file path in the local
   * @param destDir destination directory in the container
   * @returns return a Promise that performs the copy operation
   */
  async copyTo (podName, containerName, srcPath, destDir) {
    const namespace = this._getNamespace()

    if (!await this.hasDir(podName, containerName, destDir)) {
      throw new FullstackTestingError(`invalid destination path: ${destDir}`)
    }

    if (!fs.existsSync(srcPath)) {
      throw new FullstackTestingError(`invalid source path: ${srcPath}`)
    }

    try {
      const srcFile = path.basename(srcPath)
      const srcDir = path.dirname(srcPath)
      const destPath = `${destDir}/${srcFile}`

      // zip the source file
      const tmpFile = this._tempFileFor(srcFile)
      await tar.c({
        file: tmpFile,
        cwd: srcDir
      }, [srcFile])

      const self = this
      return new Promise((resolve, reject) => {
        const execInstance = new k8s.Exec(this.kubeConfig)
        const command = ['tar', 'xf', '-', '-C', destDir]
        const readStream = fs.createReadStream(tmpFile)
        const errStream = new sb.WritableStreamBuffer()

        execInstance.exec(namespace, podName, containerName, command, null, errStream, readStream, false,
          async ({ status }) => {
            if (status === 'Failure' || errStream.size()) {
              self._deleteTempFile(tmpFile)
            }
          }).then(conn => {
          conn.on('close', async (code, reason) => {
            if (code !== 1000) { // code 1000 is the success code
              return reject(new FullstackTestingError(`failed to copy because of error (${code}): ${reason}`))
            }

            return resolve(true)
          })

          conn.on('error', (e) => {
            self._deleteTempFile(tmpFile)
            return reject(new FullstackTestingError(`failed to copy file ${destPath} because of connection error: ${e.message}`, e))
          })
        })
      })
    } catch (e) {
      throw new FullstackTestingError(`failed to copy file to ${podName}:${containerName} [${srcPath} -> ${destDir}]: ${e.message}`, e)
    }
  }

  /**
   * Copy a file from a container
   *
   * It overwrites any existing file at the destination directory
   *
   * @param podName podName name
   * @param containerName container name
   * @param srcPath source file path in the container
   * @param destDir destination directory in the local
   * @returns {Promise<boolean>}
   */
  async copyFrom (podName, containerName, srcPath, destDir) {
    const namespace = this._getNamespace()

    // get stat for source file in the container
    const entries = await this.listDir(podName, containerName, srcPath)
    if (entries.length !== 1) {
      throw new FullstackTestingError(`invalid source path: ${srcPath}`)
    }
    const srcFileDesc = entries[0] // cache for later comparison after copy

    if (!fs.existsSync(destDir)) {
      throw new FullstackTestingError(`invalid destination path: ${destDir}`)
    }

    try {
      const srcFileSize = Number.parseInt(srcFileDesc.size)

      const srcFile = path.basename(srcPath)
      const srcDir = path.dirname(srcPath)
      const destPath = `${destDir}/${srcFile}`

      // download the tar file to a temp location
      const tmpFile = this._tempFileFor(srcFile)

      const self = this
      return new Promise((resolve, reject) => {
        const execInstance = new k8s.Exec(this.kubeConfig)
        const command = ['tar', 'zcf', '-', '-C', srcDir, srcFile]
        const writerStream = fs.createWriteStream(tmpFile)
        const errStream = new sb.WritableStreamBuffer()

        execInstance.exec(
          namespace,
          podName,
          containerName,
          command,
          writerStream,
          errStream,
          null,
          false,
          async ({ status }) => {
            writerStream.close()
            if (status === 'Failure' || errStream.size()) {
              self._deleteTempFile(tmpFile)
            }
          })
          .then(conn => {
            conn.on('close', async (code, reason) => {
              if (code !== 1000) { // code 1000 is the success code
                return reject(new FullstackTestingError(`failed to copy because of error (${code}): ${reason}`))
              }

              // extract the downloaded file
              await tar.x({
                file: tmpFile,
                cwd: destDir
              })

              self._deleteTempFile(tmpFile)

              const stat = fs.statSync(destPath)
              if (stat && stat.size === srcFileSize) {
                return resolve(true)
              }

              return reject(new FullstackTestingError(`failed to download file completely: ${destPath}`))
            })

            conn.on('error', (e) => {
              self._deleteTempFile(tmpFile)
              return reject(new FullstackTestingError(
                `failed to copy file ${destPath} because of connection error: ${e.message}`, e))
            })
          })
      })
    } catch (e) {
      throw new FullstackTestingError(
        `failed to download file from ${podName}:${containerName} [${srcPath} -> ${destDir}]: ${e.message}`, e)
    }
  }

  /**
   * Invoke bash command within a container and return the console output as string
   *
   * @param podName pod name
   * @param containerName container name
   * @param command bash commands as an array to be run within the containerName (e.g 'ls -la /opt/hgcapp')
   * @param timeoutMs timout in milliseconds
   * @returns {Promise<string>} console output as string
   */
  async execContainer (podName, containerName, command, timeoutMs = 1000) {
    const ns = this._getNamespace()
    if (timeoutMs < 0 || timeoutMs === 0) throw new MissingArgumentError('timeout cannot be negative or zero')
    if (!command) throw new MissingArgumentError('command cannot be empty')
    if (!Array.isArray(command)) {
      command = command.split(' ')
    }
    if (!await this.getPodByName(podName)) throw new IllegalArgumentError(`Invalid pod ${podName}`)

    const self = this
    return new Promise((resolve, reject) => {
      const execInstance = new k8s.Exec(this.kubeConfig)
      const outStream = new sb.WritableStreamBuffer()
      const errStream = new sb.WritableStreamBuffer()

      self.logger.debug(`Running exec ${podName} -c ${containerName} -- ${command.join(' ')}`)
      execInstance.exec(
        ns,
        podName,
        containerName,
        command,
        outStream,
        errStream,
        null,
        false,
        ({ status }) => {
          if (status === 'Failure' || errStream.size()) {
            reject(new FullstackTestingError(`Exec error:
              [exec ${podName} -c ${containerName} -- ${command.join(' ')}'] - error details:
              ${errStream.getContentsAsString()}`))
            return
          }

          const output = outStream.getContentsAsString()
          self.logger.debug(`Finished exec ${podName} -c ${containerName} -- ${command.join(' ')}`, { output })

          resolve(output)
        }
      )
    })
  }

  /**
   * Port forward a port from a pod to localhost
   *
   * This simple server just forwards traffic from itself to a service running in kubernetes
   * -> localhost:localPort -> port-forward-tunnel -> kubernetes-pod:targetPort
   *
   * @param podName pod name
   * @param localPort local port
   * @param podPort port of the pod
   */
  async portForward (podName, localPort, podPort) {
    const ns = this._getNamespace()
    const forwarder = new k8s.PortForward(this.kubeConfig, false)
    const server = await net.createServer((socket) => {
      forwarder.portForward(ns, podName, [podPort], socket, null, socket, 3)
    })

    // add info for logging
    server.info = `${podName}:${podPort} -> ${constants.LOCAL_HOST}:${localPort}`
    server.localPort = localPort
    this.logger.debug(`Starting port-forwarder [${server.info}]`)
    return server.listen(localPort, constants.LOCAL_HOST)
  }

  /**
   * to test the connection to a pod within the network
   * @param host the host of the target connection
   * @param port the port of the target connection
   * @returns {Promise<boolean>}
   */
  async testConnection (host, port) {
    const self = this

    return new Promise((resolve, reject) => {
      const s = new net.Socket()
      s.on('error', (e) => {
        s.destroy()
        reject(new FullstackTestingError(`failed to connect to '${host}:${port}': ${e.message}`, e))
      })

      s.connect(port, host, () => {
        self.logger.debug(`Connection test successful: ${host}:${port}`)
        s.destroy()
        resolve(true)
      })
    })
  }

  /**
   * Stop the port forwarder server
   *
   * @param server an instance of server returned by portForward method
   * @param maxAttempts the maximum number of attempts to check if the server is stopped
   * @param timeout the delay between checks in milliseconds
   * @return {Promise<void>}
   */
  async stopPortForward (server, maxAttempts = 20, timeout = 500) {
    if (!server) {
      return
    }

    this.logger.debug(`Stopping port-forwarder [${server.info}]`)

    // try to close the websocket server
    await new Promise((resolve, reject) => {
      server.close((e) => {
        if (e) {
          if (e.message?.contains('Server is not running')) {
            this.logger.debug(`Server not running, port-forwarder [${server.info}]`)
            resolve()
          } else {
            this.logger.debug(`Failed to stop port-forwarder [${server.info}]: ${e.message}`, e)
            reject(e)
          }
        } else {
          this.logger.debug(`Stopped port-forwarder [${server.info}]`)
          resolve()
        }
      })
    })

    // test to see if the port has been closed or if it is still open
    let attempts = 0
    while (attempts < maxAttempts) {
      let hasError = 0
      attempts++

      try {
        const isPortOpen = await new Promise((resolve, reject) => {
          const testServer = net.createServer()
            .once('error', err => {
              if (err) {
                resolve(false)
              }
            })
            .once('listening', () => {
              testServer
                .once('close', () => {
                  hasError++
                  if (hasError > 1) {
                    resolve(false)
                  } else {
                    resolve(true)
                  }
                })
                .close()
            })
            .listen(server.localPort, '0.0.0.0')
        })
        if (isPortOpen) {
          return
        }
      } catch (e) {
        return
      }
      await sleep(timeout)
    }
    if (attempts >= maxAttempts) {
      throw new FullstackTestingError(`failed to stop port-forwarder [${server.info}]`)
    }
  }

  async recyclePodByLabels (podLabels, maxAttempts = 50) {
    const podArray = await this.getPodsByLabel(podLabels)
    for (const pod of podArray) {
      const podName = pod.metadata.name
      await this.kubeClient.deleteNamespacedPod(podName, this.configManager.getFlag(flags.namespace))
    }

    let attempts = 0
    while (attempts++ < maxAttempts) {
      const status = await this.waitForPod(constants.POD_STATUS_RUNNING, podLabels)
      if (status) {
        const newPods = await this.getPodsByLabel(podLabels)
        if (newPods.length === podArray.length) return newPods
      }

      await sleep(2000)
    }

    throw new FullstackTestingError(`pods are not running after deletion with labels [${podLabels.join(',')}]`)
  }

  /**
   * Wait for pod
   * @param status phase of the pod
   * @param labels pod labels
   * @param podCount number of pod expected
   * @param maxAttempts maximum attempts to check
   * @param delay delay between checks in milliseconds
   * @return {Promise<[*]>}
   */
  async waitForPod (status = 'Running', labels = [], podCount = 1, maxAttempts = 10, delay = 500) {
    const ns = this._getNamespace()
    const fieldSelector = `status.phase=${status}`
    const labelSelector = labels.join(',')

    this.logger.debug(`WaitForPod [namespace:${ns}, fieldSector(${fieldSelector}, labelSelector: ${labelSelector}], maxAttempts: ${maxAttempts}`)

    return new Promise((resolve, reject) => {
      let attempts = 0

      const check = async () => {
        this.logger.debug(`Checking for pod [namespace:${ns}, fieldSector(${fieldSelector}, labelSelector: ${labelSelector}] [attempt: ${attempts}/${maxAttempts}]`)

        // wait for the pod to be available with the given status and labels
        const resp = await this.kubeClient.listNamespacedPod(
          ns,
          false,
          false,
          undefined,
          fieldSelector,
          labelSelector,
          podCount
        )

        this.logger.debug(`${resp.body.items.length}/${podCount} pod found [namespace:${ns}, fieldSector(${fieldSelector}, labelSelector: ${labelSelector}] [attempt: ${attempts}/${maxAttempts}]`)
        if (resp.body && resp.body.items && resp.body.items.length === podCount) {
          return resolve(resp.body.items)
        }

        if (attempts++ < maxAttempts) {
          setTimeout(check, delay)
        } else {
          return reject(new FullstackTestingError(`Expected number of pod (${podCount}) not found ${fieldSelector} ${labelSelector} [attempts = ${attempts}/${maxAttempts}]`))
        }
      }

      check()
    })
  }

  async waitForPodReady (labels = [], podCount = 1, maxAttempts = 10, delay = 500) {
    try {
      return await this.waitForPodCondition(K8.PodReadyCondition, labels, podCount, maxAttempts, delay)
    } catch (e) {
      throw new FullstackTestingError(`Pod not ready [maxAttempts = ${maxAttempts}]`, e)
    }
  }

  async waitForPodCondition (
    conditionsMap,
    labels = [],
    podCount = 1, maxAttempts = 10, delay = 500) {
    if (!conditionsMap || conditionsMap.size === 0) throw new MissingArgumentError('pod conditions are required')
    const ns = this._getNamespace()
    const labelSelector = labels.join(',')

    this.logger.debug(`WaitForCondition [namespace:${ns}, conditions = ${conditionsMap.toString()} labelSelector: ${labelSelector}], maxAttempts: ${maxAttempts}`)

    return new Promise((resolve, reject) => {
      let attempts = 0

      const check = async () => {
        this.logger.debug(`Checking for pod ready [namespace:${ns}, labelSelector: ${labelSelector}] [attempt: ${attempts}/${maxAttempts}]`)

        // wait for the pod to be available with the given status and labels
        let pods
        try {
          pods = await this.waitForPod(constants.POD_STATUS_RUNNING, labels, podCount, maxAttempts, delay)
          this.logger.debug(`${pods.length}/${podCount} pod found [namespace:${ns}, labelSelector: ${labelSelector}] [attempt: ${attempts}/${maxAttempts}]`)

          if (pods.length >= podCount) {
            const podWithMatchedCondition = []

            // check conditions
            for (const pod of pods) {
              let matchedCondition = 0
              for (const cond of pod.status.conditions) {
                for (const entry of conditionsMap.entries()) {
                  const condType = entry[0]
                  const condStatus = entry[1]
                  if (cond.type === condType && cond.status === condStatus) {
                    this.logger.debug(`Pod condition met for ${pod.metadata.name} [type: ${cond.type} status: ${cond.status}]`)
                    matchedCondition++
                  }
                }

                if (matchedCondition >= conditionsMap.size) {
                  podWithMatchedCondition.push(pod)
                  break
                }
              }
            }

            if (podWithMatchedCondition.length >= podCount) {
              return resolve(podWithMatchedCondition)
            }
          }
        } catch (e) {
          this.logger.error(`Pod not found with expected conditions [maxAttempts = ${maxAttempts}], ${e.message}`, e)
        }

        if (attempts++ < maxAttempts) {
          setTimeout(check, delay)
        } else {
          return reject(new FullstackTestingError(`Pod not found with expected conditions [maxAttempts = ${maxAttempts}]`))
        }
      }

      check()
    })
  }

  /**
   * Get a list of persistent volume claim names for the given namespace
   * @param namespace the namespace of the persistent volume claims to return
   * @param labels labels
   * @returns return list of persistent volume claim names
   */
  async listPvcsByNamespace (namespace, labels = []) {
    const pvcs = []
    const labelSelector = labels.join(',')
    const resp = await this.kubeClient.listNamespacedPersistentVolumeClaim(
      namespace,
      null,
      null,
      null,
      null,
      labelSelector
    )

    for (const item of resp.body.items) {
      pvcs.push(item.metadata.name)
    }

    return pvcs
  }

  /**
   * Delete a persistent volume claim
   * @param name the name of the persistent volume claim to delete
   * @param namespace the namespace of the persistent volume claim to delete
   * @returns {Promise<boolean>} true if the persistent volume claim was deleted
   */
  async deletePvc (name, namespace) {
    const resp = await this.kubeClient.deleteNamespacedPersistentVolumeClaim(
      name,
      namespace
    )

    return resp.response.statusCode === 200.0
  }

  /**
   * retrieve the secret of the given namespace and label selector, if there is more than one, it returns the first
   * @param namespace the namespace of the secret to search for
   * @param labelSelector the label selector used to fetch the Kubernetes secret
   * @returns a custom secret object with the relevant attributes, the values of the data key:value pair
   * objects must be base64 decoded
   */
  async getSecret (namespace, labelSelector) {
    const result = await this.kubeClient.listNamespacedSecret(
      namespace, null, null, null, null, labelSelector)
    if (result.response.statusCode === 200 && result.body.items && result.body.items.length > 0) {
      const secretObject = result.body.items[0]
      return {
        name: secretObject.metadata.name,
        labels: secretObject.metadata.labels,
        namespace: secretObject.metadata.namespace,
        type: secretObject.type,
        data: secretObject.data
      }
    } else {
      return null
    }
  }

  /**
   * creates a new Kubernetes secret with the provided attributes
   * @param name the name of the new secret
   * @param namespace the namespace to store the secret
   * @param secretType the secret type
   * @param data the secret, any values of a key:value pair must be base64 encoded
   * @param labels the label to use for future label selector queries
   * @param recreate if we should first run delete in the case that there the secret exists from a previous install
   * @returns {Promise<boolean>} whether the secret was created successfully
   */
  async createSecret (name, namespace, secretType, data, labels, recreate) {
    if (recreate) {
      try {
        await this.kubeClient.deleteNamespacedSecret(name, namespace)
      } catch (e) {
        // do nothing
      }
    }

    const v1Secret = new V1Secret()
    v1Secret.apiVersion = 'v1'
    v1Secret.kind = 'Secret'
    v1Secret.type = secretType
    v1Secret.data = data
    v1Secret.metadata = new V1ObjectMeta()
    v1Secret.metadata.name = name
    v1Secret.metadata.labels = labels

    try {
      const resp = await this.kubeClient.createNamespacedSecret(namespace, v1Secret)

      return resp.response.statusCode === 201
    } catch (e) {
      throw new FullstackTestingError(`failed to create secret ${name} in namespace ${namespace}: ${e.message}, ${e?.body?.message}`, e)
    }
  }

  _getNamespace () {
    const ns = this.configManager.getFlag(flags.namespace)
    if (!ns) throw new MissingArgumentError('namespace is not set')
    return ns
  }

  _tempFileFor (fileName) {
    const tmpFile = `${fileName}-${uuid4()}`
    return path.join(os.tmpdir(), tmpFile)
  }

  _deleteTempFile (tmpFile) {
    if (fs.existsSync(tmpFile)) {
      fs.rmSync(tmpFile)
    }
  }
}
