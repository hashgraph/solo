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
import * as k8s from '@kubernetes/client-node';
import fs from 'fs';
import net from 'net';
import os from 'os';
import path from 'path';
import {Flags as flags} from '../commands/flags.js';
import {SoloError, IllegalArgumentError, MissingArgumentError} from './errors.js';
import * as tar from 'tar';
import {v4 as uuid4} from 'uuid';
import {type V1Lease, V1ObjectMeta, V1Secret, type Context, type V1Pod} from '@kubernetes/client-node';
import * as stream from 'node:stream';
import type * as http from 'node:http';
import type * as WebSocket from 'ws';
import {getReasonPhrase, StatusCodes} from 'http-status-codes';

import {sleep} from './helpers.js';
import * as constants from './constants.js';
import {type ConfigManager} from './config_manager.js';
import {type SoloLogger} from './logging.js';
import {type PodName, type TarCreateFilter} from '../types/aliases.js';
import type {ExtendedNetServer, LocalContextObject} from '../types/index.js';
import {HEDERA_HAPI_PATH, ROOT_CONTAINER, SOLO_LOGS_DIR} from './constants.js';
import {Duration} from './time/duration.js';

interface TDirectoryData {
  directory: boolean;
  owner: string;
  group: string;
  size: string;
  modifiedAt: string;
  name: string;
}

/**
 * A kubernetes API wrapper class providing custom functionalities required by solo
 *
 * Note: Take care if the same instance is used for parallel execution, as the behaviour may be unpredictable.
 * For parallel execution, create separate instances by invoking clone()
 */
export class K8 {
  private _cachedContexts: Context[];

  static PodReadyCondition = new Map<string, string>().set(
    constants.POD_CONDITION_READY,
    constants.POD_CONDITION_STATUS_TRUE,
  );
  private kubeConfig!: k8s.KubeConfig;
  kubeClient!: k8s.CoreV1Api;
  private coordinationApiClient: k8s.CoordinationV1Api;

  constructor(
    private readonly configManager: ConfigManager,
    public readonly logger: SoloLogger,
  ) {
    if (!configManager) throw new MissingArgumentError('An instance of core/ConfigManager is required');
    if (!logger) throw new MissingArgumentError('An instance of core/SoloLogger is required');

    this.init();
  }

  /**
   * Clone a new instance with the same config manager and logger
   * Internally it instantiates a new kube API client
   */
  clone() {
    const c = new K8(this.configManager, this.logger);
    return c.init();
  }

  getKubeConfig() {
    return this.kubeConfig;
  }

  init() {
    this.kubeConfig = new k8s.KubeConfig();
    this.kubeConfig.loadFromDefault();

    if (!this.kubeConfig.getCurrentContext()) {
      throw new SoloError('No active kubernetes context found. ' + 'Please set current kubernetes context.');
    }

    if (!this.kubeConfig.getCurrentCluster()) {
      throw new SoloError('No active kubernetes cluster found. ' + 'Please create a cluster and set current context.');
    }

    this.kubeClient = this.kubeConfig.makeApiClient(k8s.CoreV1Api);
    this.coordinationApiClient = this.kubeConfig.makeApiClient(k8s.CoordinationV1Api);

    return this; // to enable chaining
  }

  /**
   * Apply filters to metadata
   * @param items - list of items
   * @param [filters] - an object with metadata fields and value
   * @returns a list of items that match the filters
   */
  applyMetadataFilter(items: (object | any)[], filters = {}) {
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
  filterItem(items: (object | any)[], filters = {}) {
    const filtered = this.applyMetadataFilter(items, filters);
    if (filtered.length > 1) throw new SoloError('multiple items found with filters', {filters});
    return filtered[0];
  }

  /**
   * Create a new namespace
   * @param name - name of the namespace
   */
  async createNamespace(name: string) {
    const payload = {
      metadata: {
        name,
      },
    };

    const resp = await this.kubeClient.createNamespace(payload);
    return resp.response.statusCode === StatusCodes.CREATED;
  }

  /**
   * Delete a namespace
   * @param name - name of the namespace
   */
  async deleteNamespace(name: string) {
    const resp = await this.kubeClient.deleteNamespace(name);
    return resp.response.statusCode === StatusCodes.OK;
  }

  /** Get a list of namespaces */
  async getNamespaces() {
    const resp = await this.kubeClient.listNamespace();
    if (resp.body && resp.body.items) {
      const namespaces: string[] = [];
      resp.body.items.forEach(item => {
        // @ts-ignore
        namespaces.push(item.metadata.name as string);
      });

      return namespaces;
    }

    throw new SoloError('incorrect response received from kubernetes API. Unable to list namespaces');
  }

  /**
   * Returns true if a namespace exists with the given name
   * @param namespace namespace name
   */
  async hasNamespace(namespace: string) {
    const namespaces = await this.getNamespaces();
    return namespaces.includes(namespace);
  }

  /**
   * Get a podName by name
   * @param name - podName name
   */
  async getPodByName(name: string): Promise<k8s.V1Pod> {
    const ns = this._getNamespace();
    const fieldSelector = `metadata.name=${name}`;
    const resp = await this.kubeClient.listNamespacedPod(
      ns,
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

  /**
   * Get pods by labels
   * @param labels - list of labels
   */
  async getPodsByLabel(labels: string[] = []) {
    const ns = this._getNamespace();
    const labelSelector = labels.join(',');
    const result = await this.kubeClient.listNamespacedPod(
      ns,
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

  /**
   * Get secrets by labels
   * @param labels - list of labels
   */
  async getSecretsByLabel(labels: string[] = []) {
    const ns = this._getNamespace();
    const labelSelector = labels.join(',');
    const result = await this.kubeClient.listNamespacedSecret(
      ns,
      undefined,
      undefined,
      undefined,
      undefined,
      labelSelector,
    );

    return result.body.items;
  }

  /**
   * Get host IP of a podName
   * @param podNameName -  name of the podName
   * @returns podName IP
   */
  async getPodIP(podNameName: string) {
    const pod = await this.getPodByName(podNameName);
    if (pod && pod.status && pod.status.podIP) {
      this.logger.debug(`Found pod IP for ${podNameName}: ${pod.status.podIP}`);
      return pod.status.podIP;
    }

    this.logger.debug(`Unable to find pod IP for ${podNameName}`);
    throw new SoloError(`unable to find host IP of podName: ${podNameName}`);
  }

  /**
   * Get a svc by name
   * @param name - svc name
   */
  async getSvcByName(name: string): Promise<k8s.V1Service> {
    const ns = this._getNamespace();
    const fieldSelector = `metadata.name=${name}`;
    const resp = await this.kubeClient.listNamespacedService(
      ns,
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

  /**
   * Get cluster IP of a service
   * @param svcName - name of the service
   * @returns cluster IP
   */
  async getClusterIP(svcName: string) {
    const svc = await this.getSvcByName(svcName);
    if (svc && svc.spec && svc.spec.clusterIP) {
      return svc.spec.clusterIP;
    }

    throw new SoloError(`unable to find cluster IP for svc: ${svcName}`);
  }

  /**
   * Get a list of clusters
   * @returns a list of cluster names
   */
  getClusters() {
    const clusters: string[] = [];
    for (const cluster of this.kubeConfig.getClusters()) {
      clusters.push(cluster.name);
    }

    return clusters;
  }

  /**
   * Get a list of contexts
   * @returns a list of context names
   */
  getContextNames(): string[] {
    const contexts: string[] = [];

    for (const context of this.getContexts()) {
      contexts.push(context.name);
    }

    return contexts;
  }

  getContexts(): Context[] {
    if (!this._cachedContexts) {
      this._cachedContexts = this.kubeConfig.getContexts();
    }

    return this._cachedContexts;
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
  async listDir(podName: PodName, containerName: string, destPath: string) {
    try {
      const output = (await this.execContainer(podName, containerName, ['ls', '-la', destPath])) as string;
      if (!output) return [];

      // parse the output and return the entries
      const items: TDirectoryData[] = [];
      const lines = output.split('\n');
      for (let line of lines) {
        line = line.replace(/\s+/g, '|');
        const parts = line.split('|');
        if (parts.length >= 9) {
          let name = parts[parts.length - 1];
          // handle unique file format (without single quotes): 'usedAddressBook_vHederaSoftwareVersion{hapiVersion=v0.53.0, servicesVersion=v0.53.0}_2024-07-30-20-39-06_node_0.txt.debug'
          for (let i = parts.length - 1; i > 8; i--) {
            name = `${parts[i - 1]} ${name}`;
          }

          if (name !== '.' && name !== '..') {
            const permission = parts[0];
            const item: TDirectoryData = {
              directory: permission[0] === 'd',
              owner: parts[2],
              group: parts[3],
              size: parts[4],
              modifiedAt: `${parts[5]} ${parts[6]} ${parts[7]}`,
              name,
            };

            items.push(item);
          }
        }
      }

      return items;
    } catch (e: Error | any) {
      throw new SoloError(`unable to check path in '${podName}':${containerName}' - ${destPath}: ${e.message}`, e);
    }
  }

  /**
   * Check if a filepath exists in the container
   * @param podName
   * @param containerName
   * @param destPath - path inside the container
   * @param [filters] - an object with metadata fields and value
   */
  async hasFile(podName: PodName, containerName: string, destPath: string, filters: object = {}) {
    const parentDir = path.dirname(destPath);
    const fileName = path.basename(destPath);
    const filterMap = new Map(Object.entries(filters));

    try {
      const entries = await this.listDir(podName, containerName, parentDir);

      for (const item of entries) {
        if (item.name === fileName && !item.directory) {
          let found = true;

          for (const entry of filterMap.entries()) {
            const field = entry[0];
            const value = entry[1];
            // @ts-ignore
            this.logger.debug(
              `Checking file ${podName}:${containerName} ${destPath}; ${field} expected ${value}, found ${item[field]}`,
              {filters},
            );
            // @ts-ignore
            if (`${value}` !== `${item[field]}`) {
              found = false;
              break;
            }
          }

          if (found) {
            this.logger.debug(`File check succeeded ${podName}:${containerName} ${destPath}`, {filters});
            return true;
          }
        }
      }
    } catch (e: Error | any) {
      const error = new SoloError(
        `unable to check file in '${podName}':${containerName}' - ${destPath}: ${e.message}`,
        e,
      );
      this.logger.error(error.message, error);
      throw error;
    }

    return false;
  }

  /**
   * Check if a directory path exists in the container
   * @param podName
   * @param containerName
   * @param destPath - path inside the container
   */
  async hasDir(podName: string, containerName: string, destPath: string) {
    return (
      (await this.execContainer(podName, containerName, [
        'bash',
        '-c',
        '[[ -d "' + destPath + '" ]] && echo -n "true" || echo -n "false"',
      ])) === 'true'
    );
  }

  mkdir(podName: PodName, containerName: string, destPath: string) {
    return this.execContainer(podName, containerName, ['bash', '-c', 'mkdir -p "' + destPath + '"']);
  }

  exitWithError(localContext: LocalContextObject, errorMessage: string) {
    localContext.errorMessage = localContext.errorMessage
      ? `${localContext.errorMessage}:${errorMessage}`
      : errorMessage;
    this.logger.error(errorMessage);
    return localContext.reject(new SoloError(localContext.errorMessage));
  }

  handleCallback(status: string, localContext: LocalContextObject, messagePrefix: string) {
    if (status === 'Failure') {
      return this.exitWithError(localContext, `${messagePrefix} Failure occurred`);
    }
    this.logger.debug(`${messagePrefix} callback(status)=${status}`);
  }

  registerConnectionOnError(localContext: LocalContextObject, messagePrefix: string, conn: WebSocket.WebSocket) {
    conn.on('error', e => {
      return this.exitWithError(localContext, `${messagePrefix} failed, connection error: ${e.message}`);
    });
  }

  registerConnectionOnMessage(messagePrefix: string) {
    this.logger.debug(`${messagePrefix} received message`);
  }

  registerErrorStreamOnData(localContext: LocalContextObject, stream: stream.PassThrough) {
    stream.on('data', data => {
      localContext.errorMessage = localContext.errorMessage
        ? `${localContext.errorMessage}${data.toString()}`
        : data.toString();
    });
  }

  registerErrorStreamOnError(
    localContext: LocalContextObject,
    messagePrefix: string,
    stream: stream.PassThrough | fs.WriteStream,
  ) {
    stream.on('error', err => {
      return this.exitWithError(localContext, `${messagePrefix} error encountered, err: ${err.toString()}`);
    });
  }

  registerOutputPassthroughStreamOnData(
    localContext: LocalContextObject,
    messagePrefix: string,
    outputPassthroughStream: stream.PassThrough,
    outputFileStream: fs.WriteStream,
  ) {
    outputPassthroughStream.on('data', chunk => {
      this.logger.debug(`${messagePrefix} received chunk size=${chunk.length}`);
      const canWrite = outputFileStream.write(chunk); // Write chunk to file and check if buffer is full
      if (!canWrite) {
        this.logger.debug(`${messagePrefix} buffer is full, pausing data stream...`);
        outputPassthroughStream.pause(); // Pause the data stream if buffer is full
      }
    });
  }

  registerOutputFileStreamOnDrain(
    localContext: LocalContextObject,
    messagePrefix: string,
    outputPassthroughStream: stream.PassThrough,
    outputFileStream: fs.WriteStream,
  ) {
    outputFileStream.on('drain', () => {
      outputPassthroughStream.resume();
      this.logger.debug(`${messagePrefix} stream drained, resume write`);
    });
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
   * @param [filter] - the filter to pass to tar to keep or skip files or directories
   * @returns a Promise that performs the copy operation
   */
  async copyTo(
    podName: PodName,
    containerName: string,
    srcPath: string,
    destDir: string,
    filter: TarCreateFilter | undefined = undefined,
  ) {
    const self = this;
    const namespace = this._getNamespace();
    const guid = uuid4();
    const messagePrefix = `copyTo[${podName},${guid}]: `;

    if (!(await self.getPodByName(podName))) throw new IllegalArgumentError(`Invalid pod ${podName}`);

    self.logger.info(`${messagePrefix}[srcPath=${srcPath}, destDir=${destDir}]`);

    if (!(await this.hasDir(podName, containerName, destDir))) {
      throw new SoloError(`invalid destination path: ${destDir}`);
    }

    if (!fs.existsSync(srcPath)) {
      throw new SoloError(`invalid source path: ${srcPath}`);
    }

    const localContext = {} as LocalContextObject;
    try {
      const srcFile = path.basename(srcPath);
      const srcDir = path.dirname(srcPath);

      // Create a temporary tar file for the source file
      const tmpFile = self._tempFileFor(srcFile);

      await tar.c({file: tmpFile, cwd: srcDir, filter}, [srcFile]);

      return new Promise<boolean>((resolve, reject) => {
        localContext.reject = reject;
        const execInstance = new k8s.Exec(self.kubeConfig);
        const command = ['tar', 'xf', '-', '-C', destDir];
        const inputStream = fs.createReadStream(tmpFile);
        const errPassthroughStream = new stream.PassThrough();
        const inputPassthroughStream = new stream.PassThrough({highWaterMark: 10 * 1024 * 1024}); // Handle backpressure

        // Use pipe() to automatically handle backpressure
        inputStream.pipe(inputPassthroughStream);

        execInstance
          .exec(
            namespace,
            podName,
            containerName,
            command,
            null,
            errPassthroughStream,
            inputPassthroughStream,
            false,
            ({status}) => self.handleCallback(status, localContext, messagePrefix),
          )
          .then(conn => {
            self.logger.info(`${messagePrefix} connection established`);
            localContext.connection = conn;

            self.registerConnectionOnError(localContext, messagePrefix, conn);

            self.registerConnectionOnMessage(messagePrefix);

            conn.on('close', (code, reason) => {
              self.logger.debug(`${messagePrefix} connection closed`);
              if (code !== 1000) {
                // code 1000 is the success code
                return self.exitWithError(localContext, `${messagePrefix} failed with code=${code}, reason=${reason}`);
              }

              // Cleanup temp file after successful copy
              inputPassthroughStream.end(); // End the passthrough stream
              self._deleteTempFile(tmpFile); // Cleanup temp file
              self.logger.info(`${messagePrefix} Successfully copied!`);
              return resolve(true);
            });
          });

        self.registerErrorStreamOnData(localContext, errPassthroughStream);

        self.registerErrorStreamOnError(localContext, messagePrefix, inputPassthroughStream);
      });
    } catch (e: Error | any) {
      const errorMessage = `${messagePrefix} failed to upload file: ${e.message}`;
      self.logger.error(errorMessage, e);
      throw new SoloError(errorMessage, e);
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
  async copyFrom(podName: PodName, containerName: string, srcPath: string, destDir: string) {
    const self = this;
    const namespace = self._getNamespace();
    const guid = uuid4();
    const messagePrefix = `copyFrom[${podName},${guid}]: `;

    if (!(await self.getPodByName(podName))) throw new IllegalArgumentError(`Invalid pod ${podName}`);

    self.logger.info(`${messagePrefix}[srcPath=${srcPath}, destDir=${destDir}]`);

    // get stat for source file in the container
    let entries = await self.listDir(podName, containerName, srcPath);
    if (entries.length !== 1) {
      throw new SoloError(`${messagePrefix}invalid source path: ${srcPath}`);
    }
    // handle symbolic link
    if (entries[0].name.indexOf(' -> ') > -1) {
      const redirectSrcPath = path.join(
        path.dirname(srcPath),
        entries[0].name.substring(entries[0].name.indexOf(' -> ') + 4),
      );
      entries = await self.listDir(podName, containerName, redirectSrcPath);
      if (entries.length !== 1) {
        throw new SoloError(`${messagePrefix}invalid source path: ${redirectSrcPath}`);
      }
    }
    const srcFileDesc = entries[0]; // cache for later comparison after copy

    if (!fs.existsSync(destDir)) {
      throw new SoloError(`${messagePrefix}invalid destination path: ${destDir}`);
    }

    const localContext = {} as LocalContextObject;
    try {
      const srcFileSize = Number.parseInt(srcFileDesc.size);

      const srcFile = path.basename(entries[0].name);
      const srcDir = path.dirname(entries[0].name);
      const destPath = path.join(destDir, srcFile);

      // download the tar file to a temp location
      const tmpFile = self._tempFileFor(srcFile);

      return new Promise((resolve, reject) => {
        localContext.reject = reject;
        const execInstance = new k8s.Exec(self.kubeConfig);
        const command = ['cat', `${srcDir}/${srcFile}`];
        const outputFileStream = fs.createWriteStream(tmpFile);
        const outputPassthroughStream = new stream.PassThrough({highWaterMark: 10 * 1024 * 1024});
        const errPassthroughStream = new stream.PassThrough();

        // Use pipe() to automatically handle backpressure between streams
        outputPassthroughStream.pipe(outputFileStream);

        self.registerOutputPassthroughStreamOnData(
          localContext,
          messagePrefix,
          outputPassthroughStream,
          outputFileStream,
        );

        self.registerOutputFileStreamOnDrain(localContext, messagePrefix, outputPassthroughStream, outputFileStream);

        self.logger.debug(`${messagePrefix} running...`);
        execInstance
          .exec(
            namespace,
            podName,
            containerName,
            command,
            outputFileStream,
            errPassthroughStream,
            null,
            false,
            ({status}) => {
              if (status === 'Failure') {
                self._deleteTempFile(tmpFile);
                return self.exitWithError(localContext, `${messagePrefix} Failure occurred`);
              }
              self.logger.debug(`${messagePrefix} callback(status)=${status}`);
            },
          )
          .then(conn => {
            self.logger.debug(`${messagePrefix} connection established`);
            localContext.connection = conn;

            conn.on('error', e => {
              self._deleteTempFile(tmpFile);
              return self.exitWithError(localContext, `${messagePrefix} failed, connection error: ${e.message}`);
            });

            self.registerConnectionOnMessage(messagePrefix);

            conn.on('close', (code, reason) => {
              self.logger.debug(`${messagePrefix} connection closed`);
              if (code !== 1000) {
                // code 1000 is the success code
                return self.exitWithError(localContext, `${messagePrefix} failed with code=${code}, reason=${reason}`);
              }

              outputFileStream.end();
              outputFileStream.close(() => {
                try {
                  fs.copyFileSync(tmpFile, destPath);

                  self._deleteTempFile(tmpFile);

                  const stat = fs.statSync(destPath);
                  if (stat && stat.size === srcFileSize) {
                    self.logger.debug(`${messagePrefix} finished`);
                    return resolve(true);
                  }

                  return self.exitWithError(
                    localContext,
                    `${messagePrefix} files did not match, srcFileSize=${srcFileSize}, stat.size=${stat?.size}`,
                  );
                } catch (e: Error | any) {
                  return self.exitWithError(localContext, `${messagePrefix} failed to complete download`);
                }
              });
            });
          });

        self.registerErrorStreamOnData(localContext, errPassthroughStream);

        self.registerErrorStreamOnError(localContext, messagePrefix, outputFileStream);
      });
    } catch (e: Error | any) {
      const errorMessage = `${messagePrefix}failed to download file: ${e.message}`;
      self.logger.error(errorMessage, e);
      throw new SoloError(errorMessage, e);
    }
  }

  /**
   * Invoke sh command within a container and return the console output as string
   * @param podName
   * @param containerName
   * @param command - sh commands as an array to be run within the containerName (e.g 'ls -la /opt/hgcapp')
   * @returns console output as string
   */
  async execContainer(podName: string, containerName: string, command: string | string[]) {
    const self = this;
    const namespace = self._getNamespace();
    const guid = uuid4();
    const messagePrefix = `execContainer[${podName},${guid}]:`;

    if (!(await self.getPodByName(podName))) throw new IllegalArgumentError(`Invalid pod ${podName}`);

    if (!command) throw new MissingArgumentError('command cannot be empty');
    if (!Array.isArray(command)) {
      command = command.split(' ');
    }

    self.logger.info(`${messagePrefix} begin... command=[${command.join(' ')}]`);

    return new Promise<string>((resolve, reject) => {
      const localContext = {} as LocalContextObject;
      localContext.reject = reject;
      const execInstance = new k8s.Exec(self.kubeConfig);
      const tmpFile = self._tempFileFor(`${podName}-output.txt`);
      const outputFileStream = fs.createWriteStream(tmpFile);
      const outputPassthroughStream = new stream.PassThrough({highWaterMark: 10 * 1024 * 1024});
      const errPassthroughStream = new stream.PassThrough();

      // Use pipe() to automatically handle backpressure between streams
      outputPassthroughStream.pipe(outputFileStream);

      self.registerOutputPassthroughStreamOnData(
        localContext,
        messagePrefix,
        outputPassthroughStream,
        outputFileStream,
      );

      self.registerOutputFileStreamOnDrain(localContext, messagePrefix, outputPassthroughStream, outputFileStream);

      self.logger.debug(`${messagePrefix} running...`);
      execInstance
        .exec(
          namespace,
          podName,
          containerName,
          command,
          outputFileStream,
          errPassthroughStream,
          null,
          false,
          ({status}) => self.handleCallback(status, localContext, messagePrefix),
        )
        .then(conn => {
          self.logger.debug(`${messagePrefix} connection established`);
          localContext.connection = conn;

          self.registerConnectionOnError(localContext, messagePrefix, conn);

          self.registerConnectionOnMessage(messagePrefix);

          conn.on('close', (code, reason) => {
            self.logger.debug(`${messagePrefix} connection closed`);
            if (!localContext.errorMessage) {
              if (code !== 1000) {
                // code 1000 is the success code
                return self.exitWithError(localContext, `${messagePrefix} failed with code=${code}, reason=${reason}`);
              }

              outputFileStream.end();
              outputFileStream.close(() => {
                self.logger.debug(`${messagePrefix} finished`);
                const outData = fs.readFileSync(tmpFile);
                return resolve(outData.toString());
              });
            }
          });
        });

      self.registerErrorStreamOnData(localContext, errPassthroughStream);

      self.registerErrorStreamOnError(localContext, messagePrefix, outputFileStream);
    });
  }

  /**
   * Port forward a port from a pod to localhost
   *
   * This simple server just forwards traffic from itself to a service running in kubernetes
   * -> localhost:localPort -> port-forward-tunnel -> kubernetes-pod:targetPort
   */
  async portForward(podName: PodName, localPort: number, podPort: number) {
    const ns = this._getNamespace();
    const forwarder = new k8s.PortForward(this.kubeConfig, false);
    const server = (await net.createServer(socket => {
      forwarder.portForward(ns, podName, [podPort], socket, null, socket, 3);
    })) as ExtendedNetServer;

    // add info for logging
    server.info = `${podName}:${podPort} -> ${constants.LOCAL_HOST}:${localPort}`;
    server.localPort = localPort;
    this.logger.debug(`Starting port-forwarder [${server.info}]`);
    return server.listen(localPort, constants.LOCAL_HOST);
  }

  /**
   * to test the connection to a pod within the network
   * @param host - the host of the target connection
   * @param port - the port of the target connection
   */
  testConnection(host: string, port: number) {
    const self = this;

    return new Promise<boolean>((resolve, reject) => {
      const s = new net.Socket();
      s.on('error', e => {
        s.destroy();
        reject(new SoloError(`failed to connect to '${host}:${port}': ${e.message}`, e));
      });

      s.connect(port, host, () => {
        self.logger.debug(`Connection test successful: ${host}:${port}`);
        s.destroy();
        resolve(true);
      });
    });
  }

  /**
   * Stop the port forwarder server
   *
   * @param server - an instance of server returned by portForward method
   * @param [maxAttempts] - the maximum number of attempts to check if the server is stopped
   * @param [timeout] - the delay between checks in milliseconds
   */
  async stopPortForward(server: ExtendedNetServer, maxAttempts = 20, timeout = 500) {
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
      } catch (e: Error | any) {
        return;
      }
      await sleep(Duration.ofMillis(timeout));
    }
    if (attempts >= maxAttempts) {
      throw new SoloError(`failed to stop port-forwarder [${server.info}]`);
    }
  }

  async waitForPods(
    phases = [constants.POD_PHASE_RUNNING],
    labels: string[] = [],
    podCount = 1,
    maxAttempts = constants.PODS_RUNNING_MAX_ATTEMPTS,
    delay = constants.PODS_RUNNING_DELAY,
    podItemPredicate?: (items: k8s.V1Pod) => any,
  ): Promise<k8s.V1Pod[]> {
    const ns = this._getNamespace();
    const labelSelector = labels.join(',');

    this.logger.debug(`WaitForPod [labelSelector: ${labelSelector}, namespace:${ns}, maxAttempts: ${maxAttempts}]`);

    return new Promise<k8s.V1Pod[]>((resolve, reject) => {
      let attempts = 0;

      const check = async (resolve: (items: k8s.V1Pod[]) => void, reject: (reason?: any) => void) => {
        // wait for the pod to be available with the given status and labels
        try {
          const resp = await this.kubeClient.listNamespacedPod(
            ns,
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
        } catch (e: Error | any) {
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

  /**
   * Check if pod is ready
   * @param [labels] - pod labels
   * @param [podCount] - number of pod expected
   * @param [maxAttempts] - maximum attempts to check
   * @param [delay] - delay between checks in milliseconds
   */
  async waitForPodReady(labels: string[] = [], podCount = 1, maxAttempts = 10, delay = 500) {
    try {
      return await this.waitForPodConditions(K8.PodReadyCondition, labels, podCount, maxAttempts, delay);
    } catch (e: Error | any) {
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
  async waitForPodConditions(
    conditionsMap: Map<string, string>,
    labels: string[] = [],
    podCount = 1,
    maxAttempts = 10,
    delay = 500,
  ) {
    if (!conditionsMap || conditionsMap.size === 0) throw new MissingArgumentError('pod conditions are required');

    return await this.waitForPods([constants.POD_PHASE_RUNNING], labels, podCount, maxAttempts, delay, pod => {
      if (pod.status?.conditions?.length > 0) {
        for (const cond of pod.status.conditions) {
          for (const entry of conditionsMap.entries()) {
            const condType = entry[0];
            const condStatus = entry[1];
            if (cond.type === condType && cond.status === condStatus) {
              this.logger.debug(
                `Pod condition met for ${pod.metadata?.name} [type: ${cond.type} status: ${cond.status}]`,
              );
              return true;
            }
          }
        }
      }

      // condition not found
      return false;
    });
  }

  /**
   * Get a list of persistent volume claim names for the given namespace
   * @param namespace - the namespace of the persistent volume claims to return
   * @param [labels] - labels
   * @returns list of persistent volume claim names
   */
  async listPvcsByNamespace(namespace: string, labels: string[] = []) {
    const pvcs: string[] = [];
    const labelSelector = labels.join(',');
    const resp = await this.kubeClient.listNamespacedPersistentVolumeClaim(
      namespace,
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
  async listSecretsByNamespace(namespace: string, labels: string[] = []) {
    const secrets: string[] = [];
    const labelSelector = labels.join(',');
    const resp = await this.kubeClient.listNamespacedSecret(
      namespace,
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
      secrets.push(item.metadata!.name as string);
    }

    return secrets;
  }

  /**
   * Delete a persistent volume claim
   * @param name - the name of the persistent volume claim to delete
   * @param namespace - the namespace of the persistent volume claim to delete
   * @returns true if the persistent volume claim was deleted
   */
  async deletePvc(name: string, namespace: string) {
    const resp = await this.kubeClient.deleteNamespacedPersistentVolumeClaim(name, namespace);

    return resp.response.statusCode === StatusCodes.OK;
  }

  // --------------------------------------- Utility Methods --------------------------------------- //

  public async testClusterConnection(context: string): Promise<boolean> {
    this.kubeConfig.setCurrentContext(context);

    return await this.kubeConfig
      .makeApiClient(k8s.CoreV1Api)
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
  async getSecret(namespace: string, labelSelector: string) {
    const result = await this.kubeClient.listNamespacedSecret(
      namespace,
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

    if (result.response.statusCode === StatusCodes.OK && result.body.items && result.body.items.length > 0) {
      const secretObject = result.body.items[0];
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
  async createSecret(
    name: string,
    namespace: string,
    secretType: string,
    data: Record<string, string>,
    labels: any,
    recreate: boolean,
  ) {
    if (recreate) {
      try {
        await this.kubeClient.deleteNamespacedSecret(name, namespace);
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
      const resp = await this.kubeClient.createNamespacedSecret(namespace, v1Secret);

      return resp.response.statusCode === StatusCodes.CREATED;
    } catch (e: Error | any) {
      throw new SoloError(
        `failed to create secret ${name} in namespace ${namespace}: ${e.message}, ${e?.body?.message}`,
        e,
      );
    }
  }

  /**
   * Delete a secret from the namespace
   * @param name - the name of the new secret
   * @param namespace - the namespace to store the secret
   * @returns whether the secret was deleted successfully
   */
  async deleteSecret(name: string, namespace: string) {
    const resp = await this.kubeClient.deleteNamespacedSecret(name, namespace);
    return resp.response.statusCode === StatusCodes.OK;
  }

  /* ------------- ConfigMap ------------- */

  /**
   * @param name - name of the configmap
   * @returns the configmap if found
   * @throws SoloError - if the response if not found or the response is not OK
   */
  public async getNamespacedConfigMap(name: string): Promise<k8s.V1ConfigMap> {
    const {response, body} = await this.kubeClient.readNamespacedConfigMap(name, this._getNamespace()).catch(e => e);

    this.handleKubernetesClientError(response, body, 'Failed to get namespaced configmap');

    return body as k8s.V1ConfigMap;
  }

  /**
   * @param name - for the config name
   * @param labels - for the config metadata
   * @param data - to contain in the config
   */
  public async createNamespacedConfigMap(
    name: string,
    labels: Record<string, string>,
    data: Record<string, string>,
  ): Promise<boolean> {
    const namespace = this._getNamespace();

    const configMap = new k8s.V1ConfigMap();
    configMap.data = data;

    const metadata = new k8s.V1ObjectMeta();
    metadata.name = name;
    metadata.namespace = namespace;
    metadata.labels = labels;
    configMap.metadata = metadata;
    try {
      const resp = await this.kubeClient.createNamespacedConfigMap(namespace, configMap);

      return resp.response.statusCode === StatusCodes.CREATED;
    } catch (e: Error | any) {
      throw new SoloError(
        `failed to create configmap ${name} in namespace ${namespace}: ${e.message}, ${e?.body?.message}`,
        e,
      );
    }
  }

  /**
   * @param name - for the config name
   * @param labels - for the config metadata
   * @param data - to contain in the config
   */
  public async replaceNamespacedConfigMap(
    name: string,
    labels: Record<string, string>,
    data: Record<string, string>,
  ): Promise<boolean> {
    const namespace = this._getNamespace();

    const configMap = new k8s.V1ConfigMap();
    configMap.data = data;

    const metadata = new k8s.V1ObjectMeta();
    metadata.name = name;
    metadata.namespace = namespace;
    metadata.labels = labels;
    configMap.metadata = metadata;
    try {
      const resp = await this.kubeClient.replaceNamespacedConfigMap(name, namespace, configMap);

      return resp.response.statusCode === StatusCodes.CREATED;
    } catch (e: Error | any) {
      throw new SoloError(
        `failed to create configmap ${name} in namespace ${namespace}: ${e.message}, ${e?.body?.message}`,
        e,
      );
    }
  }

  public async deleteNamespacedConfigMap(name: string, namespace: string): Promise<boolean> {
    try {
      const resp = await this.kubeClient.deleteNamespacedConfigMap(name, namespace);

      return resp.response.statusCode === StatusCodes.CREATED;
    } catch (e: Error | any) {
      throw new SoloError(
        `failed to create configmap ${name} in namespace ${namespace}: ${e.message}, ${e?.body?.message}`,
        e,
      );
    }
  }

  // --------------------------------------- LEASES --------------------------------------- //
  async createNamespacedLease(namespace: string, leaseName: string, holderName: string, durationSeconds = 20) {
    const lease = new k8s.V1Lease();

    const metadata = new k8s.V1ObjectMeta();
    metadata.name = leaseName;
    metadata.namespace = namespace;
    lease.metadata = metadata;

    const spec = new k8s.V1LeaseSpec();
    spec.holderIdentity = holderName;
    spec.leaseDurationSeconds = durationSeconds;
    spec.acquireTime = new k8s.V1MicroTime();
    lease.spec = spec;

    const {response, body} = await this.coordinationApiClient.createNamespacedLease(namespace, lease).catch(e => e);

    this.handleKubernetesClientError(response, body, 'Failed to create namespaced lease');

    return body as k8s.V1Lease;
  }

  async readNamespacedLease(leaseName: string, namespace: string, timesCalled = 0) {
    const {response, body} = await this.coordinationApiClient.readNamespacedLease(leaseName, namespace).catch(e => e);

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

  async renewNamespaceLease(leaseName: string, namespace: string, lease: k8s.V1Lease) {
    lease.spec.renewTime = new k8s.V1MicroTime();

    const {response, body} = await this.coordinationApiClient
      .replaceNamespacedLease(leaseName, namespace, lease)
      .catch(e => e);

    this.handleKubernetesClientError(response, body, 'Failed to renew namespaced lease');

    return body as k8s.V1Lease;
  }

  async transferNamespaceLease(lease: k8s.V1Lease, newHolderName: string): Promise<V1Lease> {
    lease.spec.leaseTransitions++;
    lease.spec.renewTime = new k8s.V1MicroTime();
    lease.spec.holderIdentity = newHolderName;

    const {response, body} = await this.coordinationApiClient
      .replaceNamespacedLease(lease.metadata.name, lease.metadata.namespace, lease)
      .catch(e => e);

    this.handleKubernetesClientError(response, body, 'Failed to transfer namespaced lease');

    return body as k8s.V1Lease;
  }

  async deleteNamespacedLease(name: string, namespace: string) {
    const {response, body} = await this.coordinationApiClient.deleteNamespacedLease(name, namespace).catch(e => e);

    this.handleKubernetesClientError(response, body, 'Failed to delete namespaced lease');

    return body as k8s.V1Status;
  }

  /* ------------- Utilities ------------- */

  /**
   * @param response - response object from the kubeclient call
   * @param error - body of the response becomes the error if the status is not OK
   * @param errorMessage - the error message to be passed in case it fails
   *
   * @throws SoloError - if the status code is not OK
   */
  private handleKubernetesClientError(response: http.IncomingMessage, error: Error | any, errorMessage: string): void {
    const statusCode = +response?.statusCode || StatusCodes.INTERNAL_SERVER_ERROR;

    if (statusCode <= StatusCodes.ACCEPTED) return;
    errorMessage += `, statusCode: ${statusCode}`;
    this.logger.error(errorMessage, error);

    throw new SoloError(errorMessage, errorMessage, {statusCode: statusCode});
  }

  private _getNamespace() {
    const ns = this.configManager.getFlag<string>(flags.namespace);
    if (!ns) throw new MissingArgumentError('namespace is not set');
    return ns;
  }

  private _tempFileFor(fileName: string) {
    const tmpFile = `${fileName}-${uuid4()}`;
    return path.join(os.tmpdir(), tmpFile);
  }

  private _deleteTempFile(tmpFile: string) {
    if (fs.existsSync(tmpFile)) {
      fs.rmSync(tmpFile);
    }
  }

  /**
   * Get a pod by name and namespace, will check every 1 second until the pod is no longer found.
   * Can throw a SoloError if there is an error while deleting the pod.
   * @param podName - the name of the pod
   * @param namespace - the namespace of the pod
   */
  async killPod(podName: string, namespace: string) {
    try {
      const result = await this.kubeClient.deleteNamespacedPod(podName, namespace, undefined, undefined, 1);
      if (result.response.statusCode !== StatusCodes.OK) {
        throw new SoloError(
          `Failed to delete pod ${podName} in namespace ${namespace}: statusCode: ${result.response.statusCode}`,
        );
      }
      let podExists = true;
      while (podExists) {
        const pod = await this.getPodByName(podName);
        if (!pod?.metadata?.deletionTimestamp) {
          podExists = false;
        } else {
          await sleep(Duration.ofSeconds(1));
        }
      }
    } catch (e) {
      const errorMessage = `Failed to delete pod ${podName} in namespace ${namespace}: ${e.message}`;
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
  async getNodeLogs(namespace: string) {
    const pods = await this.getPodsByLabel(['solo.hedera.com/type=network-node']);

    const timeString = new Date().toISOString().replace(/:/g, '-').replace(/\./g, '-');

    const promises = [];
    for (const pod of pods) {
      promises.push(this.getNodeLog(pod, namespace, timeString));
    }
    return await Promise.all(promises);
  }

  private async getNodeLog(pod: V1Pod, namespace: string, timeString: string) {
    const podName = pod.metadata!.name as PodName;
    this.logger.debug(`getNodeLogs(${pod.metadata.name}): begin...`);
    const targetDir = path.join(SOLO_LOGS_DIR, namespace, timeString);
    try {
      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, {recursive: true});
      }
      const scriptName = 'support-zip.sh';
      const sourcePath = path.join(constants.RESOURCES_DIR, scriptName); // script source path
      await this.copyTo(podName, ROOT_CONTAINER, sourcePath, `${HEDERA_HAPI_PATH}`);
      await sleep(Duration.ofSeconds(3)); // wait for the script to sync to the file system
      await this.execContainer(podName, ROOT_CONTAINER, [
        'bash',
        '-c',
        `sync ${HEDERA_HAPI_PATH} && sudo chown hedera:hedera ${HEDERA_HAPI_PATH}/${scriptName}`,
      ]);
      await this.execContainer(podName, ROOT_CONTAINER, [
        'bash',
        '-c',
        `sudo chmod 0755 ${HEDERA_HAPI_PATH}/${scriptName}`,
      ]);
      await this.execContainer(podName, ROOT_CONTAINER, `${HEDERA_HAPI_PATH}/${scriptName}`);
      await this.copyFrom(podName, ROOT_CONTAINER, `${HEDERA_HAPI_PATH}/data/${podName}.zip`, targetDir);
    } catch (e: Error | any) {
      // not throw error here, so we can continue to finish downloading logs from other pods
      // and also delete namespace in the end
      this.logger.error(`${constants.NODE_LOG_FAILURE_MSG} ${podName}`, e);
    }
    this.logger.debug(`getNodeLogs(${pod.metadata.name}): ...end`);
  }

  /**
   * Download state files from a pod
   * @param k8 - an instance of core/K8
   * @param namespace - the namespace of the network
   * @param nodeAlias - the pod name
   * @returns a promise that resolves when the state files are downloaded
   */
  async getNodeStatesFromPod(namespace: string, nodeAlias: string) {
    const pods = await this.getPodsByLabel([`solo.hedera.com/node-name=${nodeAlias}`]);
    // get length of pods
    const promises = [];
    for (const pod of pods) {
      promises.push(this.getNodeState(pod, namespace));
    }
    return await Promise.all(promises);
  }

  async getNodeState(pod: V1Pod, namespace: string) {
    const podName = pod.metadata!.name as PodName;
    this.logger.debug(`getNodeState(${pod.metadata.name}): begin...`);
    const targetDir = path.join(SOLO_LOGS_DIR, namespace);
    try {
      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, {recursive: true});
      }
      const zipCommand = `tar -czf ${HEDERA_HAPI_PATH}/${podName}-state.zip -C ${HEDERA_HAPI_PATH}/data/saved .`;
      await this.execContainer(podName, ROOT_CONTAINER, zipCommand);
      await this.copyFrom(podName, ROOT_CONTAINER, `${HEDERA_HAPI_PATH}/${podName}-state.zip`, targetDir);
    } catch (e: Error | any) {
      this.logger.error(`failed to download state from pod ${podName}`, e);
      this.logger.showUser(`Failed to download state from pod ${podName}` + e);
    }
    this.logger.debug(`getNodeState(${pod.metadata.name}): ...end`);
  }
}
