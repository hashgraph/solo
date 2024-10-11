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
import { flags } from '../commands/index'
import { SoloError, IllegalArgumentError, MissingArgumentError } from './errors'
import * as sb from 'stream-buffers'
import * as tar from 'tar'
import { v4 as uuid4 } from 'uuid'
import { V1ObjectMeta, V1Secret } from '@kubernetes/client-node'
import { sleep } from './helpers'
import { type ConfigManager, constants} from './index'
import * as stream from 'node:stream'
import { type SoloLogger } from "./logging";
import {PodName} from "./templates";

type TDirectoryData = {directory: boolean; owner: string; group: string; size: string; modifiedAt: string; name: string}

export interface ExtendedNetServer extends net.Server {
  localPort: number
  info: string
}

/**
 * A kubernetes API wrapper class providing custom functionalities required by solo
 *
 * Note: Take care if the same instance is used for parallel execution, as the behaviour may be unpredictable.
 * For parallel execution, create separate instances by invoking clone()
 */
export class K8 {
  static PodReadyCondition: Map<string, string> = new Map().set(constants.POD_CONDITION_READY, constants.POD_CONDITION_STATUS_TRUE)
  private kubeConfig!: k8s.KubeConfig;
  kubeClient!: k8s.CoreV1Api;

  constructor (private readonly configManager: ConfigManager, public readonly logger: SoloLogger) {
    if (!configManager) throw new MissingArgumentError('An instance of core/ConfigManager is required')
    if (!logger) throw new MissingArgumentError('An instance of core/SoloLogger is required')

    this.init()
  }

  /**
   * Clone a new instance with the same config manager and logger
   * Internally it instantiates a new kube API client
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
      throw new SoloError('No active kubernetes cluster found. ' +
        'Please create a cluster and set current context.')
    }

    if (!this.kubeConfig.getCurrentContext()) {
      throw new SoloError('No active kubernetes context found. ' +
        'Please set current kubernetes context.')
    }

    this.kubeClient = this.kubeConfig.makeApiClient(k8s.CoreV1Api)

    return this // to enable chaining
  }

  /**
   * Apply filters to metadata
   * @param items - list of items
   * @param [filters] - an object with metadata fields and value
   * @returns a list of items that match the filters
   */
  applyMetadataFilter (items: (object | any)[], filters = {}) {
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
   * @param items - list of items
   * @param [filters] - an object with metadata fields and value
   */
  filterItem (items: (object | any)[], filters = {}) {
    const filtered = this.applyMetadataFilter(items, filters)
    if (filtered.length > 1) throw new SoloError('multiple items found with filters', { filters })
    return filtered[0]
  }

  /**
   * Create a new namespace
   * @param name - name of the namespace
   */
  async createNamespace (name: string) {
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
   * @param name - name of the namespace
   */
  async deleteNamespace (name: string) {
    const resp = await this.kubeClient.deleteNamespace(name)
    return resp.response.statusCode === 200.0
  }

  /** Get a list of namespaces */
  async getNamespaces () {
    const resp = await this.kubeClient.listNamespace()
    if (resp.body && resp.body.items) {
      const namespaces: string[] = []
      resp.body.items.forEach(item => {
        // @ts-ignore
        namespaces.push(item.metadata.name as string)
      })

      return namespaces
    }

    throw new SoloError('incorrect response received from kubernetes API. Unable to list namespaces')
  }

  /**
   * Returns true if a namespace exists with the given name
   * @param namespace namespace name
   */
  async hasNamespace (namespace: string) {
    const namespaces = await this.getNamespaces()
    return namespaces.includes(namespace)
  }

  /**
   * Get a podName by name
   * @param name - podName name
   */
  async getPodByName (name: string): Promise<k8s.V1Pod> {
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
   * @param labels - list of labels
   */
  async getPodsByLabel (labels: string[] = []) {
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
   * @param labels - list of labels
   */
  async getSecretsByLabel (labels: string[] = []) {
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
   * @param podNameName -  name of the podName
   * @returns podName IP
   */
  async getPodIP (podNameName: string) {
    const pod = await this.getPodByName(podNameName)
    if (pod && pod.status && pod.status.podIP) {
      this.logger.debug(`Found pod IP for ${podNameName}: ${pod.status.podIP}`)
      return pod.status.podIP
    }

    this.logger.debug(`Unable to find pod IP for ${podNameName}`)
    throw new SoloError(`unable to find host IP of podName: ${podNameName}`)
  }

  /**
   * Get a svc by name
   * @param name - svc name
   */
  async getSvcByName (name: string): Promise<k8s.V1Service> {
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
   * @param svcName - name of the service
   * @returns cluster IP
   */
  async getClusterIP (svcName: string) {
    const svc = await this.getSvcByName(svcName)
    if (svc && svc.spec && svc.spec.clusterIP) {
      return svc.spec.clusterIP
    }

    throw new SoloError(`unable to find cluster IP for svc: ${svcName}`)
  }

  /**
   * Get a list of clusters
   * @returns a list of cluster names
   */
  getClusters () {
    const clusters: string[] = []
    for (const cluster of this.kubeConfig.getClusters()) {
      clusters.push(cluster.name)
    }

    return clusters
  }

  /**
   * Get a list of contexts
   * @returns a list of context names
   */
  getContexts () {
    const contexts: string[] = []
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
   * @param podName
   * @param containerName
   * @param destPath - path inside the container
   * @returns a promise that returns array of directory entries, custom object
   */
  async listDir (podName: PodName, containerName: string, destPath: string) {
    try {
      const output = await this.execContainer(podName, containerName, ['ls', '-la', destPath]) as string
      if (!output) return []

      // parse the output and return the entries
      const items: TDirectoryData[] = []
      const lines = output.split('\n')
      for (let line of lines) {
        line = line.replace(/\s+/g, '|')
        const parts = line.split('|')
        if (parts.length >= 9) {
          let name = parts[parts.length - 1]
          // handle unique file format (without single quotes): 'usedAddressBook_vHederaSoftwareVersion{hapiVersion=v0.53.0, servicesVersion=v0.53.0}_2024-07-30-20-39-06_node_0.txt.debug'
          for (let i = parts.length - 1; i > 8; i--) {
            name = `${parts[i - 1]} ${name}`
          }

          if (name !== '.' && name !== '..') {
            const permission = parts[0]

            const item: TDirectoryData  = {
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
    } catch (e: Error | any) {
      throw new SoloError(`unable to check path in '${podName}':${containerName}' - ${destPath}: ${e.message}`, e)
    }
  }

  /**
   * Check if a filepath exists in the container
   * @param podName
   * @param containerName
   * @param destPath - path inside the container
   * @param [filters] - an object with metadata fields and value
   */
  async hasFile (podName: PodName, containerName: string, destPath: string, filters: object = {}) {
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
            // @ts-ignore
            this.logger.debug(`Checking file ${podName}:${containerName} ${destPath}; ${field} expected ${value}, found ${item[field]}`, { filters })
            // @ts-ignore
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
    } catch (e: Error | any) {
      const error = new SoloError(`unable to check file in '${podName}':${containerName}' - ${destPath}: ${e.message}`, e)
      this.logger.error(error.message, error)
      throw error
    }

    return false
  }

  /**
   * Check if a directory path exists in the container
   * @param podName
   * @param containerName
   * @param destPath - path inside the container
   */
  async hasDir (podName: PodName, containerName: string, destPath: string) {
    return await this.execContainer(
      podName,
      containerName,
      ['bash', '-c', '[[ -d "' + destPath + '" ]] && echo -n "true" || echo -n "false"']
    ) === 'true'
  }

  mkdir (podName: PodName, containerName: string, destPath: string): Promise<string> {
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
   * @param podName
   * @param containerName
   * @param srcPath - source file path in the local
   * @param destDir - destination directory in the container
   * @returns return a Promise that performs the copy operation
   */
  async copyTo (podName: PodName, containerName: string, srcPath: string, destDir: string) {
    const namespace = this._getNamespace()

    if (!await this.hasDir(podName, containerName, destDir)) {
      throw new SoloError(`invalid destination path: ${destDir}`)
    }

    if (!fs.existsSync(srcPath)) {
      throw new SoloError(`invalid source path: ${srcPath}`)
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
      return new Promise<boolean>((resolve, reject) => {
        const execInstance = new k8s.Exec(this.kubeConfig)
        const command = ['tar', 'xf', '-', '-C', destDir]
        const readStream = fs.createReadStream(tmpFile)
        const errStream = new sb.WritableStreamBuffer()

        execInstance.exec(namespace, podName, containerName, command, null, errStream, readStream, false,
          ({ status }) => {
            if (status === 'Failure' || errStream.size()) {
              self._deleteTempFile(tmpFile)
            }
          }).then(conn => {
          conn.on('close', (code, reason) => {
            if (code !== 1000) { // code 1000 is the success code
              return reject(new SoloError(`failed to copy because of error (${code}): ${reason}`))
            }

            return resolve(true)
          })

          conn.on('error', (e) => {
            self._deleteTempFile(tmpFile)
            return reject(new SoloError(`failed to copy file ${destPath} because of connection error: ${e.message}`, e))
          })
        })
      })
    } catch (e: Error | any) {
      throw new SoloError(`failed to copy file to ${podName}:${containerName} [${srcPath} -> ${destDir}]: ${e.message}`, e)
    }
  }

  /**
   * Copy a file from a container
   *
   * It overwrites any existing file at the destination directory
   *
   * @param podName
   * @param containerName
   * @param srcPath - source file path in the container
   * @param destDir - destination directory in the local
   */
  async copyFrom (podName: PodName, containerName: string, srcPath: string, destDir: string) {
    const namespace = this._getNamespace()

    // get stat for source file in the container
    let entries = await this.listDir(podName, containerName, srcPath)
    if (entries.length !== 1) {
      throw new SoloError(`invalid source path: ${srcPath}`)
    }
    // handle symbolic link
    if (entries[0].name.indexOf(' -> ') > -1) {
      const redirectSrcPath = path.join(path.dirname(srcPath), entries[0].name.substring(entries[0].name.indexOf(' -> ') + 4))
      entries = await this.listDir(podName, containerName, redirectSrcPath)
      if (entries.length !== 1) {
        throw new SoloError(`invalid source path: ${redirectSrcPath}`)
      }
    }
    const srcFileDesc = entries[0] // cache for later comparison after copy

    if (!fs.existsSync(destDir)) {
      throw new SoloError(`invalid destination path: ${destDir}`)
    }

    try {
      const srcFileSize = Number.parseInt(srcFileDesc.size)

      const srcFile = path.basename(entries[0].name)
      const srcDir = path.dirname(entries[0].name)
      const destPath = path.join(destDir, srcFile)

      // download the tar file to a temp location
      const tmpFile = this._tempFileFor(srcFile)

      const self = this
      return new Promise<boolean>((resolve, reject) => {
        const execInstance = new k8s.Exec(this.kubeConfig)
        const command = ['cat', `${srcDir}/${srcFile}`]
        const outputFileStream = fs.createWriteStream(tmpFile)
        const outputPassthroughStream = new stream.PassThrough({ highWaterMark: 10 * 1024 * 1024 })
        const errStream = new stream.PassThrough()
        let additionalErrorMessageDetail = ''

        // Use pipe() to automatically handle backpressure between streams
        outputPassthroughStream.pipe(outputFileStream)

        outputPassthroughStream.on('data', (chunk) => {
          this.logger.debug(`received chunk size=${chunk.length}`)
          const canWrite = outputFileStream.write(chunk) // Write chunk to file and check if buffer is full

          if (!canWrite) {
            console.log(`Buffer is full, pausing data stream... for copying from ${podName}:${srcDir}/${srcFile} to ${destPath}`)
            outputPassthroughStream.pause() // Pause the data stream if buffer is full
          }
        })

        outputFileStream.on('drain', () => {
          outputPassthroughStream.resume()
          this.logger.debug(`stream drained, resume write for copying from ${podName}:${srcDir}/${srcFile} to ${destPath}`)
        })

        execInstance.exec(namespace, podName, containerName, command, outputFileStream, errStream, null, false,
          ({ status }) => {
            if (status === 'Failure') {
              self._deleteTempFile(tmpFile)
              const errorMessage = `tar command failed with status Failure while copying from ${podName}:${srcDir}/${srcFile} to ${destPath}`
              this.logger.error(errorMessage)
              return reject(new SoloError(errorMessage))
            }
            this.logger.debug(`copyFrom.callback(status)=${status}`)
          })
          .then(conn => {
            conn.on('error', (e) => {
              self._deleteTempFile(tmpFile)
              return reject(new SoloError(
                  `failed copying from ${podName}:${srcDir}/${srcFile} to ${destPath} because of connection error: ${e.message}`, e))
            })

            conn.on('close', (code, reason) => {
              this.logger.debug(`connection closed copying from ${podName}:${srcDir}/${srcFile} to ${destPath}`)
              if (code !== 1000) { // code 1000 is the success code
                const errorMessage = `failed copying from ${podName}:${srcDir}/${srcFile} to ${destPath} because of error (${code}): ${reason}`
                this.logger.error(errorMessage)
                return reject(new SoloError(errorMessage))
              }

              outputFileStream.end()
              outputFileStream.close(() => {
                this.logger.debug(`finished closing writerStream copying from ${podName}:${srcDir}/${srcFile} to ${destPath}`)

                try {
                  fs.copyFileSync(tmpFile, destPath)

                  self._deleteTempFile(tmpFile)

                  const stat = fs.statSync(destPath)
                  let rejection
                  if (stat && stat.size === srcFileSize) {
                    this.logger.info(`Finished successfully copying from ${podName}:${srcDir}/${srcFile} to ${destPath}`)
                  } else {
                    rejection = true
                    if (!stat) {
                      additionalErrorMessageDetail = ', statSync returned no file status for the destination file'
                    } else {
                      additionalErrorMessageDetail = `, stat.size=${stat.size} != srcFileSize=${srcFileSize}`
                    }
                  }

                  if (rejection) {
                    const errorMessage = `failed copying from ${podName}:${srcDir}/${srcFile} to ${destPath} to download file completely: ${destPath}${additionalErrorMessageDetail}`
                    this.logger.error(errorMessage)
                    return reject(new SoloError(errorMessage))
                  } else {
                    return resolve(true)
                  }
                } catch (e: Error | any) {
                  const errorMessage = `failed to complete copying from ${podName}:${srcDir}/${srcFile} to ${destPath} to extract file: ${destPath}`
                  this.logger.error(errorMessage, e)
                  return reject(new SoloError(errorMessage, e))
                }
              })
            })
          })

        errStream.on('data', (data) => {
          const errorMessage = `error encountered copying from ${podName}:${srcDir}/${srcFile} to ${destPath}, error: ${data.toString()}`
          this.logger.error(errorMessage)
          return reject(new SoloError(errorMessage))
        })

        outputFileStream.on('close', () => {
          this.logger.debug(`finished copying from ${podName}:${srcDir}/${srcFile} to ${destPath}`)
        })

        outputFileStream.on('error', (err) => {
          const errorMessage = `writerStream error encountered copying from ${podName}:${srcDir}/${srcFile} to ${destPath}, err: ${err.toString()}`
          this.logger.error(errorMessage, err)
          return reject(new SoloError(errorMessage, err))
        })

        outputFileStream.on('end', () => {
          this.logger.debug(`writerStream has ended for copying from ${podName}:${srcDir}/${srcFile} to ${destPath}`)
        })

        outputPassthroughStream.on('end', () => {
          this.logger.debug(`writerPassthroughStream has ended for copying from ${podName}:${srcDir}/${srcFile} to ${destPath}`)
        })

        outputFileStream.on('finish', () => {
          this.logger.debug(`stopping copy, writerStream has finished for copying from ${podName}:${srcDir}/${srcFile} to ${destPath}`)
        })

        outputPassthroughStream.on('finish', () => {
          this.logger.debug(`stopping copy, writerPassthroughStream has finished for copying from ${podName}:${srcDir}/${srcFile} to ${destPath}`)
        })
      })
    } catch (e: Error | any) {
      const errorMessage = `failed to download file from ${podName}:${containerName} [${srcPath} -> ${destDir}]: ${e.message}`
      this.logger.error(errorMessage, e)
      throw new SoloError(errorMessage, e)
    }
  }

  /**
   * Invoke sh command within a container and return the console output as string
   *
   * @param podName
   * @param containerName
   * @param command - sh commands as an array to be run within the containerName (e.g 'ls -la /opt/hgcapp')
   * @param [timeoutMs] - timout in milliseconds
   * @returns console output as string
   */
  async execContainer (podName: PodName, containerName: string, command: string | string[], timeoutMs = 1000) {
    const ns = this._getNamespace()
    if (timeoutMs < 0 || timeoutMs === 0) throw new MissingArgumentError('timeout cannot be negative or zero')
    if (!command) throw new MissingArgumentError('command cannot be empty')
    if (!Array.isArray(command)) {
      command = command.split(' ')
    }
    if (!await this.getPodByName(podName)) throw new IllegalArgumentError(`Invalid pod ${podName}`)

    const self = this
    return new Promise<string>((resolve, reject) => {
      const execInstance = new k8s.Exec(this.kubeConfig)
      const outStream = new sb.WritableStreamBuffer()
      const errStream = new sb.WritableStreamBuffer()

      self.logger.debug(`Running exec ${podName} -c ${containerName} -- ${command.join(' ')}`)
      execInstance.exec(ns, podName, containerName, command, outStream, errStream, null, false,
        ({ status }) => {
          if (status === 'Failure' || errStream.size()) {
            reject(new SoloError(`Exec error:
              [exec ${podName} -c ${containerName} -- ${command.join(' ')}'] - error details:
              ${errStream.getContentsAsString()}`))
            return
          }

          const output = outStream.getContentsAsString()
          self.logger.debug(`Finished exec ${podName} -c ${containerName} -- ${command.join(' ')}`, { output })

          resolve(<string>output)
        }
      )
    })
  }

  /**
   * Port forward a port from a pod to localhost
   *
   * This simple server just forwards traffic from itself to a service running in kubernetes
   * -> localhost:localPort -> port-forward-tunnel -> kubernetes-pod:targetPort
   */
  async portForward (podName: PodName, localPort: number, podPort: number) {
    const ns = this._getNamespace()
    const forwarder = new k8s.PortForward(this.kubeConfig, false)
    const server = net.createServer((socket) => {
      forwarder.portForward(ns, podName, [podPort], socket, null, socket, 3)
    }) as ExtendedNetServer

    // add info for logging
    server.info = `${podName}:${podPort} -> ${constants.LOCAL_HOST}:${localPort}`
    server.localPort = localPort
    this.logger.debug(`Starting port-forwarder [${server.info}]`)
    return server.listen(localPort, constants.LOCAL_HOST)
  }

  /**
   * to test the connection to a pod within the network
   * @param host - the host of the target connection
   * @param port - the port of the target connection
   */
  testConnection (host: string, port: number) {
    const self = this

    return new Promise<boolean>((resolve, reject) => {
      const s = new net.Socket()
      s.on('error', (e) => {
        s.destroy()
        reject(new SoloError(`failed to connect to '${host}:${port}': ${e.message}`, e))
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
   * @param server - an instance of server returned by portForward method
   * @param [maxAttempts] - the maximum number of attempts to check if the server is stopped
   * @param [timeout] - the delay between checks in milliseconds
   */
  async stopPortForward (server: ExtendedNetServer, maxAttempts = 20, timeout = 500) {
    if (!server) {
      return
    }

    this.logger.debug(`Stopping port-forwarder [${server.info}]`)

    // try to close the websocket server
    await new Promise<void>((resolve, reject) => {
      server.close((e) => {
        if (e) {
          if (e.message?.includes('Server is not running')) {
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
        const isPortOpen = await new Promise((resolve) => {
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
      throw new SoloError(`failed to stop port-forwarder [${server.info}]`)
    }
  }

  waitForPods (phases = [constants.POD_PHASE_RUNNING], labels: string[] = [], podCount = 1, maxAttempts = 10,
    delay = 500, podItemPredicate?: (items: k8s.V1Pod) => any) {
    const ns = this._getNamespace()
    const labelSelector = labels.join(',')

    this.logger.debug(`WaitForPod [namespace:${ns}, labelSelector: ${labelSelector}], maxAttempts: ${maxAttempts}`)

    return new Promise<k8s.V1Pod[]>((resolve, reject) => {
      let attempts = 0

      const check = async (resolve: (items: k8s.V1Pod[]) => void, reject: (reason?: any) => void) => {
        this.logger.debug(`Checking for pod [namespace:${ns}, labelSelector: ${labelSelector}] [attempt: ${attempts}/${maxAttempts}]`)

        // wait for the pod to be available with the given status and labels
        const resp = await this.kubeClient.listNamespacedPod(
          ns,
          // @ts-ignore
          false,
          false,
          undefined,
          undefined,
          labelSelector,
          podCount
        )

        this.logger.debug(`${resp.body?.items?.length}/${podCount} pod found [namespace:${ns}, labelSelector: ${labelSelector}] [attempt: ${attempts}/${maxAttempts}]`)
        if (resp.body?.items?.length === podCount) {
          let phaseMatchCount = 0
          let predicateMatchCount = 0

          for (const item of resp.body.items) {
            if (item.status?.phase && phases.includes(item.status?.phase)) {
              phaseMatchCount++
            }

            if (podItemPredicate && podItemPredicate(item)) {
              predicateMatchCount++
            }
          }

          if (phaseMatchCount === podCount && (!podItemPredicate || (predicateMatchCount === podCount))) {
            return resolve(resp.body.items)
          }
        }

        if (++attempts < maxAttempts) {
          setTimeout(() => check(resolve, reject), delay)
        } else {
          return reject(new SoloError(`Expected number of pod (${podCount}) not found for labels: ${labelSelector}, phases: ${phases.join(',')} [attempts = ${attempts}/${maxAttempts}]`))
        }
      }

      check(resolve, reject)
    })
  }

  /**
   * Check if pod is ready
   * @param [labels] - pod labels
   * @param [podCount] - number of pod expected
   * @param [maxAttempts] - maximum attempts to check
   * @param [delay] - delay between checks in milliseconds
   */
  async waitForPodReady (labels: string[] = [], podCount = 1, maxAttempts = 10, delay = 500) {
    try {
      return await this.waitForPodConditions(K8.PodReadyCondition, labels, podCount, maxAttempts, delay)
    } catch (e: Error | any) {
      throw new SoloError(`Pod not ready [maxAttempts = ${maxAttempts}]`, e)
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
  async waitForPodConditions (conditionsMap: Map<string, string>, labels: string[] = [], podCount = 1, maxAttempts = 10, delay = 500) {
    if (!conditionsMap || conditionsMap.size === 0) throw new MissingArgumentError('pod conditions are required')

    return await this.waitForPods([constants.POD_PHASE_RUNNING], labels, podCount, maxAttempts, delay, (pod) => {
      if (pod.status?.conditions?.length && pod.status?.conditions?.length > 0) {
        for (const cond of pod.status.conditions) {
          for (const entry of conditionsMap.entries()) {
            const condType = entry[0]
            const condStatus = entry[1]
            if (cond.type === condType && cond.status === condStatus) {
              this.logger.debug(`Pod condition met for ${pod.metadata?.name} [type: ${cond.type} status: ${cond.status}]`)
              return true
            }
          }
        }
      }

      // condition not found
      return false
    })
  }

  /**
   * Get a list of persistent volume claim names for the given namespace
   * @param namespace - the namespace of the persistent volume claims to return
   * @param [labels] - labels
   * @returns list of persistent volume claim names
   */
  async listPvcsByNamespace (namespace: string, labels: string[] = []) {
    const pvcs: string[] = []
    const labelSelector = labels.join(',')
    const resp = await this.kubeClient.listNamespacedPersistentVolumeClaim(
      namespace,
      undefined,
      undefined,
      undefined,
      undefined,
      labelSelector
    )

    for (const item of resp.body.items) {
      pvcs.push(item.metadata!.name as string)
    }

    return pvcs
  }

  /**
   * Get a list of secrets for the given namespace
   * @param namespace - the namespace of the secrets to return
   * @param [labels] - labels
   * @returns list of secret names
   */
  async listSecretsByNamespace (namespace: string, labels: string[] = []) {
    const secrets: string[] = []
    const labelSelector = labels.join(',')
    const resp = await this.kubeClient.listNamespacedSecret(
      namespace,
      undefined,
      undefined,
      undefined,
      undefined,
      labelSelector
    )

    for (const item of resp.body.items) {
      secrets.push(item.metadata!.name as string)
    }

    return secrets
  }

  /**
   * Delete a persistent volume claim
   * @param name - the name of the persistent volume claim to delete
   * @param namespace - the namespace of the persistent volume claim to delete
   * @returns true if the persistent volume claim was deleted
   */
  async deletePvc (name: string, namespace: string) {
    const resp = await this.kubeClient.deleteNamespacedPersistentVolumeClaim(
      name,
      namespace
    )

    return resp.response.statusCode === 200.0
  }

  /**
   * retrieve the secret of the given namespace and label selector, if there is more than one, it returns the first
   * @param namespace - the namespace of the secret to search for
   * @param labelSelector - the label selector used to fetch the Kubernetes secret
   * @returns a custom secret object with the relevant attributes, the values of the data key:value pair
   *   objects must be base64 decoded
   */
  async getSecret (namespace: string, labelSelector: string) {
    const result = await this.kubeClient.listNamespacedSecret(namespace,
      undefined, undefined, undefined, undefined, labelSelector)

    if (result.response.statusCode === 200 && result.body.items && result.body.items.length > 0) {
      const secretObject = result.body.items[0]
      return {
        name: secretObject.metadata!.name as string,
        labels: secretObject.metadata!.labels as Record<string, string>,
        namespace: secretObject.metadata!.namespace as string,
        type: secretObject.type as string,
        data: secretObject.data as Record<string, string>
      }
    } else {
      return null
    }
  }

  /**
   * creates a new Kubernetes secret with the provided attributes
   * @param name - the name of the new secret
   * @param namespace - the namespace to store the secret
   * @param secretType - the secret type
   * @param data - the secret, any values of a key:value pair must be base64 encoded
   * @param labels - the label to use for future label selector queries
   * @param recreate - if we should first run delete in the case that there the secret exists from a previous install
   * @returns whether the secret was created successfully
   */
  async createSecret (name: string, namespace: string, secretType: string, data: Record<string, string>, labels: any, recreate: boolean) {
    if (recreate) {
      try {
        await this.kubeClient.deleteNamespacedSecret(name, namespace)
      } catch {
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
    } catch (e: Error | any) {
      throw new SoloError(`failed to create secret ${name} in namespace ${namespace}: ${e.message}, ${e?.body?.message}`, e)
    }
  }

  /**
   * Delete a secret from the namespace
   * @param name - the name of the new secret
   * @param namespace - the namespace to store the secret
   * @returns whether the secret was deleted successfully
   */
  async deleteSecret (name: string, namespace: string) {
    const resp = await this.kubeClient.deleteNamespacedSecret(name, namespace)
    return resp.response.statusCode === 200.0
  }

  private _getNamespace () {
    const ns = this.configManager.getFlag<string>(flags.namespace)
    if (!ns) throw new MissingArgumentError('namespace is not set')
    return ns
  }

  private _tempFileFor (fileName: string) {
    const tmpFile = `${fileName}-${uuid4()}`
    return path.join(os.tmpdir(), tmpFile)
  }

  private _deleteTempFile (tmpFile: string) {
    if (fs.existsSync(tmpFile)) {
      fs.rmSync(tmpFile)
    }
  }
}
