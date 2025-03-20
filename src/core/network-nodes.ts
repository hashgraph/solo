// SPDX-License-Identifier: Apache-2.0

import {type NamespaceName} from './kube/resources/namespace/namespace-name.js';
import {type PodRef} from './kube/resources/pod/pod-ref.js';
import {HEDERA_HAPI_PATH, ROOT_CONTAINER, SOLO_LOGS_DIR} from './constants.js';
import fs from 'fs';
import {ContainerRef} from './kube/resources/container/container-ref.js';
import * as constants from './constants.js';
import {sleep} from './helpers.js';
import {Duration} from './time/duration.js';
import {inject, injectable} from 'tsyringe-neo';
import {type SoloLogger} from './logging.js';
import {type K8Factory} from './kube/k8-factory.js';
import {patchInject} from './dependency-injection/container-helper.js';
import {InjectTokens} from './dependency-injection/inject-tokens.js';
import {type Pod} from './kube/resources/pod/pod.js';
import {PathEx} from '../business/utils/path-ex.js';

/**
 * Class to manage network nodes
 */
@injectable()
export class NetworkNodes {
  constructor(
    @inject(InjectTokens.SoloLogger) private readonly logger?: SoloLogger,
    @inject(InjectTokens.K8Factory) private readonly k8Factory?: K8Factory,
  ) {
    this.logger = patchInject(logger, InjectTokens.SoloLogger, this.constructor.name);
    this.k8Factory = patchInject(k8Factory, InjectTokens.K8Factory, this.constructor.name);
  }

  /**
   * Download logs files from all network pods and save to local solo log directory
   * @param namespace - the namespace of the network
   * @param [contexts]
   * @returns a promise that resolves when the logs are downloaded
   */
  public async getLogs(namespace: NamespaceName, contexts?: string[]) {
    const podsData: {pod: Pod; context?: string}[] = [];

    if (contexts) {
      for (const context of contexts) {
        const pods: Pod[] = await this.k8Factory
          .getK8(context)
          .pods()
          .list(namespace, ['solo.hedera.com/type=network-node']);
        pods.forEach(pod => podsData.push({pod, context}));
      }
    } else {
      const pods = await this.k8Factory.default().pods().list(namespace, ['solo.hedera.com/type=network-node']);
      pods.forEach(pod => podsData.push({pod}));
    }

    const timeString = new Date().toISOString().replace(/:/g, '-').replace(/\./g, '-');

    const promises = [];
    for (const podData of podsData) {
      promises.push(this.getLog(podData.pod, namespace, timeString, podData.context));
    }
    return await Promise.all(promises);
  }

  private async getLog(pod: Pod, namespace: NamespaceName, timeString: string, context?: string) {
    const podRef: PodRef = pod.podRef;
    this.logger.debug(`getNodeLogs(${pod.podRef.name.name}): begin...`);
    const targetDir = PathEx.join(SOLO_LOGS_DIR, namespace.name, timeString);
    try {
      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, {recursive: true});
      }
      const containerRef = ContainerRef.of(podRef, ROOT_CONTAINER);
      const scriptName = 'support-zip.sh';
      const sourcePath = PathEx.joinWithRealPath(constants.RESOURCES_DIR, scriptName); // script source path
      const k8 = this.k8Factory.getK8(context);

      await k8.containers().readByRef(containerRef).copyTo(sourcePath, `${HEDERA_HAPI_PATH}`);

      await sleep(Duration.ofSeconds(3)); // wait for the script to sync to the file system

      await k8
        .containers()
        .readByRef(containerRef)
        .execContainer([
          'bash',
          '-c',
          `sync ${HEDERA_HAPI_PATH} && sudo chown hedera:hedera ${HEDERA_HAPI_PATH}/${scriptName}`,
        ]);
      await k8
        .containers()
        .readByRef(containerRef)
        .execContainer(['bash', '-c', `sudo chmod 0755 ${HEDERA_HAPI_PATH}/${scriptName}`]);
      await k8.containers().readByRef(containerRef).execContainer(`${HEDERA_HAPI_PATH}/${scriptName}`);
      await k8.containers().readByRef(containerRef).copyFrom(`${HEDERA_HAPI_PATH}/data/${podRef.name}.zip`, targetDir);
    } catch (e) {
      // not throw error here, so we can continue to finish downloading logs from other pods
      // and also delete namespace in the end
      this.logger.error(`${constants.NODE_LOG_FAILURE_MSG} ${podRef}`, e);
    }
    this.logger.debug(`getNodeLogs(${pod.podRef.name.name}): ...end`);
  }

  /**
   * Download state files from a pod
   * @param namespace - the namespace of the network
   * @param nodeAlias - the pod name
   * @param [context]
   * @returns a promise that resolves when the state files are downloaded
   */
  public async getStatesFromPod(namespace: NamespaceName, nodeAlias: string, context?: string) {
    const pods: Pod[] = await this.k8Factory
      .getK8(context)
      .pods()
      .list(namespace, [`solo.hedera.com/node-name=${nodeAlias}`, 'solo.hedera.com/type=network-node']);

    // get length of pods
    const promises = [];
    for (const pod of pods) {
      promises.push(this.getState(pod, namespace, context));
    }
    return await Promise.all(promises);
  }

  private async getState(pod: Pod, namespace: NamespaceName, context?: string) {
    const podRef: PodRef = pod.podRef;
    this.logger.debug(`getNodeState(${pod.podRef.name.name}): begin...`);
    const targetDir = PathEx.join(SOLO_LOGS_DIR, namespace.name);
    try {
      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, {recursive: true});
      }
      const zipCommand = `tar -czf ${HEDERA_HAPI_PATH}/${podRef.name}-state.zip -C ${HEDERA_HAPI_PATH}/data/saved .`;
      const containerRef = ContainerRef.of(podRef, ROOT_CONTAINER);

      const k8 = this.k8Factory.getK8(context);

      await k8.containers().readByRef(containerRef).execContainer(zipCommand);
      await k8.containers().readByRef(containerRef).copyFrom(`${HEDERA_HAPI_PATH}/${podRef.name}-state.zip`, targetDir);
    } catch (e: Error | unknown) {
      this.logger.error(`failed to download state from pod ${podRef.name}`, e);
      this.logger.showUser(`Failed to download state from pod ${podRef.name}` + e);
    }
    this.logger.debug(`getNodeState(${pod.podRef.name.name}): ...end`);
  }
}
