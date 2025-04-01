// SPDX-License-Identifier: Apache-2.0

import {type Pod} from '../../../resources/pod/pod.js';
import {type ExtendedNetServer} from '../../../../../types/index.js';
import {PodReference} from '../../../resources/pod/pod-reference.js';
import {SoloError} from '../../../../../core/errors/solo-error.js';
import {sleep} from '../../../../../core/helpers.js';
import {Duration} from '../../../../../core/time/duration.js';
import {StatusCodes} from 'http-status-codes';
import {type SoloLogger} from '../../../../../core/logging/solo-logger.js';
import {container} from 'tsyringe-neo';
import {
  type KubeConfig,
  type CoreV1Api,
  PortForward,
  V1Pod,
  V1Container,
  V1ExecAction,
  V1ObjectMeta,
  V1Probe,
  V1PodSpec,
} from '@kubernetes/client-node';
import {type Pods} from '../../../resources/pod/pods.js';
import * as constants from '../../../../../core/constants.js';
import net from 'net';
import {InjectTokens} from '../../../../../core/dependency-injection/inject-tokens.js';
import {NamespaceName} from '../../../resources/namespace/namespace-name.js';
import {ContainerName} from '../../../resources/container/container-name.js';
import {PodName} from '../../../resources/pod/pod-name.js';
import {K8ClientPodCondition} from './k8-client-pod-condition.js';
import {type PodCondition} from '../../../resources/pod/pod-condition.js';

export class K8ClientPod implements Pod {
  private readonly logger: SoloLogger;

  constructor(
    public readonly podReference: PodReference,
    private readonly pods: Pods,
    private readonly kubeClient: CoreV1Api,
    private readonly kubeConfig: KubeConfig,
    public readonly labels?: Record<string, string>,
    public readonly startupProbeCommand?: string[],
    public readonly containerName?: ContainerName,
    public readonly containerImage?: string,
    public readonly containerCommand?: string[],
    public readonly conditions?: PodCondition[],
    public readonly podIp?: string,
    public readonly deletionTimestamp?: Date,
  ) {
    this.logger = container.resolve(InjectTokens.SoloLogger);
  }

  public async killPod(): Promise<void> {
    try {
      const result = await this.kubeClient.deleteNamespacedPod(
        this.podReference.name.toString(),
        this.podReference.namespace.toString(),
        undefined,
        undefined,
        1,
      );

      if (result.response.statusCode !== StatusCodes.OK) {
        throw new SoloError(
          `Failed to delete pod ${this.podReference.name} in namespace ${this.podReference.namespace}: statusCode: ${result.response.statusCode}`,
        );
      }

      let podExists: boolean = true;
      while (podExists) {
        const pod: Pod = await this.pods.read(this.podReference);

        if (!pod?.deletionTimestamp) {
          podExists = false;
        } else {
          await sleep(Duration.ofSeconds(1));
        }
      }
    } catch (error) {
      const errorMessage = `Failed to delete pod ${this.podReference.name} in namespace ${this.podReference.namespace}: ${error.message}`;

      if (error.body?.code === StatusCodes.NOT_FOUND || error.response?.body?.code === StatusCodes.NOT_FOUND) {
        this.logger.info(`Pod not found: ${errorMessage}`, error);
        return;
      }

      throw new SoloError(errorMessage, error);
    }
  }

  public async portForward(localPort: number, podPort: number): Promise<ExtendedNetServer> {
    try {
      this.logger.debug(
        `Creating port-forwarder for ${this.podReference.name}:${podPort} -> ${constants.LOCAL_HOST}:${localPort}`,
      );

      const ns: NamespaceName = this.podReference.namespace;
      const forwarder: PortForward = new PortForward(this.kubeConfig, false);

      const server = (await net.createServer(socket => {
        forwarder.portForward(ns.name, this.podReference.name.toString(), [podPort], socket, null, socket, 3);
      })) as ExtendedNetServer;

      // add info for logging
      server.info = `${this.podReference.name}:${podPort} -> ${constants.LOCAL_HOST}:${localPort}`;
      server.localPort = localPort;
      this.logger.debug(`Starting port-forwarder [${server.info}]`);
      return server.listen(localPort, constants.LOCAL_HOST);
    } catch (error) {
      const message: string = `failed to start port-forwarder [${this.podReference.name}:${podPort} -> ${constants.LOCAL_HOST}:${localPort}]: ${error.message}`;
      throw new SoloError(message, error);
    }
  }

  public async stopPortForward(
    server: ExtendedNetServer,
    maxAttempts: number = 20,
    timeout: number = 500,
  ): Promise<void> {
    if (!server) {
      return;
    }

    this.logger.debug(`Stopping port-forwarder [${server.info}]`);

    // try to close the websocket server
    await new Promise<void>((resolve, reject) => {
      server.close(error => {
        if (error) {
          if (error.message?.includes('Server is not running')) {
            this.logger.debug(`Server not running, port-forwarder [${server.info}]`);
            resolve();
          } else {
            this.logger.debug(`Failed to stop port-forwarder [${server.info}]: ${error.message}`, error);
            reject(error);
          }
        } else {
          this.logger.debug(`Stopped port-forwarder [${server.info}]`);
          resolve();
        }
      });
    });

    // test to see if the port has been closed or if it is still open
    let attempts: number = 0;
    while (attempts < maxAttempts) {
      let hasError: number = 0;
      attempts++;

      try {
        const isPortOpen = await new Promise(resolve => {
          const testServer: net.Server = net
            .createServer()
            .once('error', error => {
              if (error) {
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
      } catch {
        return;
      }
      await sleep(Duration.ofMillis(timeout));
    }
    if (attempts >= maxAttempts) {
      throw new SoloError(`failed to stop port-forwarder [${server.info}]`);
    }
  }

  public static toV1Pod(pod: Pod): V1Pod {
    const v1Metadata: V1ObjectMeta = new V1ObjectMeta();
    v1Metadata.name = pod.podReference.name.toString();
    v1Metadata.namespace = pod.podReference.namespace.toString();
    v1Metadata.labels = pod.labels;

    const v1ExecAction: V1ExecAction = new V1ExecAction();
    v1ExecAction.command = pod.startupProbeCommand;

    const v1Probe: V1Probe = new V1Probe();
    v1Probe.exec = v1ExecAction;

    const v1Container: V1Container = new V1Container();
    v1Container.name = pod.containerName.name;
    v1Container.image = pod.containerImage;
    v1Container.command = pod.containerCommand;
    v1Container.startupProbe = v1Probe;

    const v1Spec: V1PodSpec = new V1PodSpec();
    v1Spec.containers = [v1Container];

    const v1Pod: V1Pod = new V1Pod();
    v1Pod.metadata = v1Metadata;
    v1Pod.spec = v1Spec;

    return v1Pod;
  }

  public static fromV1Pod(v1Pod: V1Pod, pods: Pods, coreV1Api: CoreV1Api, kubeConfig: KubeConfig): Pod {
    if (!v1Pod) return null;

    return new K8ClientPod(
      PodReference.of(NamespaceName.of(v1Pod.metadata?.namespace), PodName.of(v1Pod.metadata?.name)),
      pods,
      coreV1Api,
      kubeConfig,
      v1Pod.metadata.labels,
      v1Pod.spec.containers[0]?.startupProbe?.exec?.command,
      ContainerName.of(v1Pod.spec.containers[0]?.name),
      v1Pod.spec.containers[0]?.image,
      v1Pod.spec.containers[0]?.command,
      v1Pod.status?.conditions?.map(condition => new K8ClientPodCondition(condition.type, condition.status)),
      v1Pod.status?.podIP,
      v1Pod.metadata.deletionTimestamp ? new Date(v1Pod.metadata.deletionTimestamp) : undefined,
    );
  }
}
