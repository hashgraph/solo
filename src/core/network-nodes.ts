// SPDX-License-Identifier: Apache-2.0

import {type NamespaceName} from '../types/namespace/namespace-name.js';
import {type PodReference} from '../integration/kube/resources/pod/pod-reference.js';
import {HEDERA_HAPI_PATH, LOG_CONFIG_ZIP_SUFFIX, ROOT_CONTAINER, SOLO_LOGS_DIR} from './constants.js';
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
import {K8} from '../integration/kube/k8.js';
import {Container} from '../integration/kube/resources/container/container.js';
import {NodeStatusEnums} from './enumerations.js';
import chalk from 'chalk';

/**
 * Class to manage network nodes
 */
@injectable()
export class NetworkNodes {
  public constructor(
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
   * @param [baseDirectory] - optional base directory to save logs, defaults to SOLO_LOGS_DIR
   * @param [excludeSensitiveData] - when true, omit TLS certificates, private keys, and data/keys from the archive
   * @returns a promise that resolves when the logs are downloaded
   */
  public async getLogs(
    namespace: NamespaceName,
    contexts?: string[],
    baseDirectory?: string,
    excludeSensitiveData?: boolean,
  ): Promise<void[]> {
    const podsData: {pod: Pod; context?: string}[] = [];

    if (contexts) {
      for (const context of contexts) {
        const pods: Pod[] = await this.k8Factory
          .getK8(context)
          .pods()
          .list(namespace, ['solo.hedera.com/type=network-node']);
        for (const pod of pods) {
          podsData.push({pod, context});
        }
      }
    } else {
      const pods: Pod[] = await this.k8Factory.default().pods().list(namespace, ['solo.hedera.com/type=network-node']);
      for (const pod of pods) {
        podsData.push({pod});
      }
    }

    const logBaseDirectory: string = baseDirectory || SOLO_LOGS_DIR;

    const promises: Promise<void>[] = [];
    for (const podData of podsData) {
      promises.push(this.getLog(podData.pod, namespace, logBaseDirectory, podData.context, excludeSensitiveData));
    }
    this.logger.showUser(`Configurations and logs saved to ${logBaseDirectory}`);
    return await Promise.all(promises);
  }

  private async getLog(
    pod: Pod,
    namespace: NamespaceName,
    baseDirectory: string,
    context?: string,
    excludeSensitiveData?: boolean,
  ): Promise<void> {
    const podReference: PodReference = pod.podReference;
    this.logger.debug(`getNodeLogs(${pod.podReference.name.name}): begin...`);
    const targetDirectory: string = PathEx.join(baseDirectory, namespace.name);
    try {
      if (!fs.existsSync(targetDirectory)) {
        fs.mkdirSync(targetDirectory, {recursive: true});
      }
      const containerReference: ContainerReference = ContainerReference.of(podReference, ROOT_CONTAINER);
      const scriptName: string = 'support-zip.sh';
      const sourcePath: string = PathEx.joinWithRealPath(constants.RESOURCES_DIR, scriptName); // script source path
      const k8: K8 = this.k8Factory.getK8(context);
      const container: Container = k8.containers().readByRef(containerReference);

      await container.copyTo(sourcePath, `${HEDERA_HAPI_PATH}`);

      await sleep(Duration.ofSeconds(3)); // wait for the script to sync to the file system

      await container.execContainer([
        'bash',
        '-c',
        `sync ${HEDERA_HAPI_PATH} && chown hedera:hedera ${HEDERA_HAPI_PATH}/${scriptName}`,
      ]);

      await container.execContainer(['bash', '-c', `chmod 0755 ${HEDERA_HAPI_PATH}/${scriptName}`]);
      await container.execContainer(
        `${HEDERA_HAPI_PATH}/${scriptName} true ${excludeSensitiveData === true ? 'true' : 'false'}`,
      );
      await container.copyFrom(
        `${HEDERA_HAPI_PATH}/data/${podReference.name}${LOG_CONFIG_ZIP_SUFFIX}`,
        targetDirectory,
      );
      this.logger.showUser(
        `Log zip file ${podReference.name}${LOG_CONFIG_ZIP_SUFFIX} downloaded to ${targetDirectory}`,
      );
    } catch (error) {
      // not throw error here, so we can continue to finish downloading logs from other pods
      // and also delete namespace in the end
      this.logger.error(`${constants.NODE_LOG_FAILURE_MSG} ${podReference}`, error);
      this.logger.showUser(chalk.red(`${constants.NODE_LOG_FAILURE_MSG} ${podReference}`));
    }
    this.logger.debug(`getNodeLogs(${pod.podReference.name.name}): ...end`);
  }

  /**
   * Download state files from a pod
   * @param namespace - the namespace of the network
   * @param nodeAlias - the pod name
   * @param [context]
   * @param [baseDirectory] - optional base directory to save state files, defaults to SOLO_LOGS_DIR
   * @returns a promise that resolves when the state files are downloaded
   */
  public async getStatesFromPod(
    namespace: NamespaceName,
    nodeAlias: string,
    context?: string,
    baseDirectory?: string,
  ): Promise<void[]> {
    const pods: Pod[] = await this.k8Factory
      .getK8(context)
      .pods()
      .list(namespace, [`solo.hedera.com/node-name=${nodeAlias}`, 'solo.hedera.com/type=network-node']);

    // get length of pods
    const stateBaseDirectory: string = baseDirectory || SOLO_LOGS_DIR;
    const promises: Promise<void>[] = [];
    for (const pod of pods) {
      promises.push(this.getState(pod, namespace, stateBaseDirectory, context));
    }
    return await Promise.all(promises);
  }

  private async getState(pod: Pod, namespace: NamespaceName, baseDirectory: string, context?: string): Promise<void> {
    const podReference: PodReference = pod.podReference;
    this.logger.debug(`getNodeState(${pod.podReference.name.name}): begin...`);
    const targetDirectory: string = PathEx.join(baseDirectory, namespace.name);
    try {
      if (!fs.existsSync(targetDirectory)) {
        fs.mkdirSync(targetDirectory, {recursive: true});
      }
      // Use zip for compression, similar to tar -czf with -C flag
      const containerReference: ContainerReference = ContainerReference.of(podReference, ROOT_CONTAINER);

      const k8: K8 = this.k8Factory.getK8(context);
      const zipFileName: string = `${HEDERA_HAPI_PATH}/${podReference.name}-state.zip`;

      // Zip doesn't have a -C flag like tar, so we use sh -c with subshell to change directory
      // Use the -X to archive for cross-platform compatibility
      await k8
        .containers()
        .readByRef(containerReference)
        .execContainer([
          'sh',
          '-c',
          `(cd ${HEDERA_HAPI_PATH}/data/saved && zip -rX ${zipFileName} . && sync && test -f ${zipFileName})`,
        ]);
      await sleep(Duration.ofSeconds(1));
      await k8.containers().readByRef(containerReference).copyFrom(`${zipFileName}`, targetDirectory);
    } catch (error: Error | unknown) {
      this.logger.error(`failed to download state from pod ${podReference.name}`, error);
      this.logger.showUser(`Failed to download state from pod ${podReference.name}` + error);
    }
    this.logger.debug(`getNodeState(${pod.podReference.name.name}): ...end`);
  }

  public async getNetworkNodePodStatus(podReference: PodReference, context?: string): Promise<string> {
    return this.k8Factory
      .getK8(context)
      .containers()
      .readByRef(ContainerReference.of(podReference, constants.ROOT_CONTAINER))
      .execContainer([
        'bash',
        '-c',
        String.raw`curl -s http://localhost:9999/metrics | grep platform_PlatformStatus | grep -v \#`,
      ]);
  }

  public async getNetworkNodePlatformStatusName(podReference: PodReference, context?: string): Promise<string> {
    try {
      const response: string = await this.getNetworkNodePodStatus(podReference, context);
      const statusLine: string | undefined = response
        ?.split('\n')
        .find((line: string): boolean => line.startsWith('platform_PlatformStatus'));
      const statusNumber: number = Number.parseInt(statusLine?.split(' ').pop() ?? '', 10);
      return NodeStatusEnums[statusNumber as keyof typeof NodeStatusEnums] ?? 'UNKNOWN';
    } catch {
      // best-effort diagnostic only: if the pod exec or metrics scrape fails, report UNKNOWN rather than mask the original ping failure
      return 'UNKNOWN';
    }
  }
}
