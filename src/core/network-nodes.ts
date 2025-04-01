// SPDX-License-Identifier: Apache-2.0

import {type NamespaceName} from '../integration/kube/resources/namespace/namespace-name.js';
import {type PodReference} from '../integration/kube/resources/pod/pod-reference.js';
import {HEDERA_HAPI_PATH, ROOT_CONTAINER, SOLO_LOGS_DIR} from './constants.js';
import fs from 'node:fs';
import {ContainerReference} from '../integration/kube/resources/container/container-reference.js';
import * as constants from './constants.js';
import {sleep} from './helpers.js';
import {Duration} from './time/duration.js';
import {inject, injectable} from 'tsyringe-neo';
import {type SoloLogger} from './logging/solo-logger.js';
import {type K8Factory} from '../integration/kube/k8-factory.js';
import {patchInject} from './dependency-injection/container-helper.js';
import {InjectTokens} from './dependency-injection/inject-tokens.js';
import {type Pod} from '../integration/kube/resources/pod/pod.js';
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
    const podReference: PodReference = pod.podReference;
    this.logger.debug(`getNodeLogs(${pod.podReference.name.name}): begin...`);
    const targetDirectory = PathEx.join(SOLO_LOGS_DIR, namespace.name, timeString);
    try {
      if (!fs.existsSync(targetDirectory)) {
        fs.mkdirSync(targetDirectory, {recursive: true});
      }
      const containerReference = ContainerReference.of(podReference, ROOT_CONTAINER);
      const scriptName = 'support-zip.sh';
      const sourcePath = PathEx.joinWithRealPath(constants.RESOURCES_DIR, scriptName); // script source path
      const k8 = this.k8Factory.getK8(context);

      await k8.containers().readByRef(containerReference).copyTo(sourcePath, `${HEDERA_HAPI_PATH}`);

      await sleep(Duration.ofSeconds(3)); // wait for the script to sync to the file system

      await k8
        .containers()
        .readByRef(containerReference)
        .execContainer([
          'bash',
          '-c',
          `sync ${HEDERA_HAPI_PATH} && sudo chown hedera:hedera ${HEDERA_HAPI_PATH}/${scriptName}`,
        ]);
      await k8
        .containers()
        .readByRef(containerReference)
        .execContainer(['bash', '-c', `sudo chmod 0755 ${HEDERA_HAPI_PATH}/${scriptName}`]);
      await k8.containers().readByRef(containerReference).execContainer(`${HEDERA_HAPI_PATH}/${scriptName}`);
      await k8
        .containers()
        .readByRef(containerReference)
        .copyFrom(`${HEDERA_HAPI_PATH}/data/${podReference.name}.zip`, targetDirectory);
    } catch (error) {
      // not throw error here, so we can continue to finish downloading logs from other pods
      // and also delete namespace in the end
      this.logger.error(`${constants.NODE_LOG_FAILURE_MSG} ${podReference}`, error);
    }
    this.logger.debug(`getNodeLogs(${pod.podReference.name.name}): ...end`);
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
    const podReference: PodReference = pod.podReference;
    this.logger.debug(`getNodeState(${pod.podReference.name.name}): begin...`);
    const targetDirectory = PathEx.join(SOLO_LOGS_DIR, namespace.name);
    try {
      if (!fs.existsSync(targetDirectory)) {
        fs.mkdirSync(targetDirectory, {recursive: true});
      }
      const zipCommand = `tar -czf ${HEDERA_HAPI_PATH}/${podReference.name}-state.zip -C ${HEDERA_HAPI_PATH}/data/saved .`;
      const containerReference = ContainerReference.of(podReference, ROOT_CONTAINER);

      const k8 = this.k8Factory.getK8(context);

      await k8.containers().readByRef(containerReference).execContainer(zipCommand);
      await k8
        .containers()
        .readByRef(containerReference)
        .copyFrom(`${HEDERA_HAPI_PATH}/${podReference.name}-state.zip`, targetDirectory);
    } catch (error: Error | unknown) {
      this.logger.error(`failed to download state from pod ${podReference.name}`, error);
      this.logger.showUser(`Failed to download state from pod ${podReference.name}` + error);
    }
    this.logger.debug(`getNodeState(${pod.podReference.name.name}): ...end`);
  }
}
