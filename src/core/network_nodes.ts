/**
 * SPDX-License-Identifier: Apache-2.0
 */
import {type NamespaceName} from './kube/namespace_name.js';
import {PodRef} from './kube/pod_ref.js';
import {PodName} from './kube/pod_name.js';
import path from 'path';
import {HEDERA_HAPI_PATH, ROOT_CONTAINER, SOLO_LOGS_DIR} from './constants.js';
import fs from 'fs';
import {ContainerRef} from './kube/container_ref.js';
import * as constants from './constants.js';
import {sleep} from './helpers.js';
import {Duration} from './time/duration.js';
import {inject, injectable} from 'tsyringe-neo';
import {SoloLogger} from './logging.js';
import {type K8} from './kube/k8.js';
import {patchInject} from './container_helper.js';
import {type V1Pod} from '@kubernetes/client-node';

/**
 * Class to manage network nodes
 */
@injectable()
export class NetworkNodes {
  constructor(
    @inject(SoloLogger) private readonly logger?: SoloLogger,
    @inject('K8') private readonly k8?: K8,
  ) {
    this.logger = patchInject(logger, SoloLogger, this.constructor.name);
    this.k8 = patchInject(k8, 'K8', this.constructor.name);
  }

  /**
   * Download logs files from all network pods and save to local solo log directory
   * @param namespace - the namespace of the network
   * @returns a promise that resolves when the logs are downloaded
   */
  public async getLogs(namespace: NamespaceName) {
    const pods = await this.k8.getPodsByLabel(['solo.hedera.com/type=network-node']);

    const timeString = new Date().toISOString().replace(/:/g, '-').replace(/\./g, '-');

    const promises = [];
    for (const pod of pods) {
      promises.push(this.getLog(pod, namespace, timeString));
    }
    return await Promise.all(promises);
  }

  private async getLog(pod: V1Pod, namespace: NamespaceName, timeString: string) {
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
      await this.k8.copyTo(containerRef, sourcePath, `${HEDERA_HAPI_PATH}`);
      await sleep(Duration.ofSeconds(3)); // wait for the script to sync to the file system
      await this.k8.execContainer(containerRef, [
        'bash',
        '-c',
        `sync ${HEDERA_HAPI_PATH} && sudo chown hedera:hedera ${HEDERA_HAPI_PATH}/${scriptName}`,
      ]);
      await this.k8.execContainer(containerRef, ['bash', '-c', `sudo chmod 0755 ${HEDERA_HAPI_PATH}/${scriptName}`]);
      await this.k8.execContainer(containerRef, `${HEDERA_HAPI_PATH}/${scriptName}`);
      await this.k8.copyFrom(containerRef, `${HEDERA_HAPI_PATH}/data/${podRef.name}.zip`, targetDir);
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
  public async getStatesFromPod(namespace: NamespaceName, nodeAlias: string) {
    const pods = await this.k8.getPodsByLabel([
      `solo.hedera.com/node-name=${nodeAlias}`,
      'solo.hedera.com/type=network-node',
    ]);

    // get length of pods
    const promises = [];
    for (const pod of pods) {
      promises.push(this.getState(pod, namespace));
    }
    return await Promise.all(promises);
  }

  private async getState(pod: V1Pod, namespace: NamespaceName) {
    const podRef = PodRef.of(namespace, PodName.of(pod.metadata!.name));
    this.logger.debug(`getNodeState(${pod.metadata.name}): begin...`);
    const targetDir = path.join(SOLO_LOGS_DIR, namespace.name);
    try {
      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, {recursive: true});
      }
      const zipCommand = `tar -czf ${HEDERA_HAPI_PATH}/${podRef.name}-state.zip -C ${HEDERA_HAPI_PATH}/data/saved .`;
      const containerRef = ContainerRef.of(podRef, ROOT_CONTAINER);
      await this.k8.execContainer(containerRef, zipCommand);
      await this.k8.copyFrom(containerRef, `${HEDERA_HAPI_PATH}/${podRef.name}-state.zip`, targetDir);
    } catch (e: Error | unknown) {
      this.logger.error(`failed to download state from pod ${podRef.name}`, e);
      this.logger.showUser(`Failed to download state from pod ${podRef.name}` + e);
    }
    this.logger.debug(`getNodeState(${pod.metadata.name}): ...end`);
  }
}
