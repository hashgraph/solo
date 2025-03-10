/**
 * SPDX-License-Identifier: Apache-2.0
 */
import {type Pod} from '../../../resources/pod/pod.js';
import {type ExtendedNetServer} from '../../../../../types/index.js';
import {type PodRef} from '../../../resources/pod/pod_ref.js';
import {SoloError} from '../../../../errors.js';
import {sleep} from '../../../../helpers.js';
import {Duration} from '../../../../time/duration.js';
import {StatusCodes} from 'http-status-codes';
import {type SoloLogger} from '../../../../logging.js';
import {container} from 'tsyringe-neo';
import {type KubeConfig, type CoreV1Api, PortForward} from '@kubernetes/client-node';
import {type Pods} from '../../../resources/pod/pods.js';
import * as constants from '../../../../constants.js';
import net from 'net';
import {InjectTokens} from '../../../../dependency_injection/inject_tokens.js';

export class K8ClientPod implements Pod {
  private readonly logger: SoloLogger;

  constructor(
    public readonly podRef: PodRef,
    private readonly pods: Pods,
    private readonly kubeClient: CoreV1Api,
    private readonly kubeConfig: KubeConfig,
  ) {
    this.logger = container.resolve(InjectTokens.SoloLogger);
  }

  public async killPod(): Promise<void> {
    try {
      const result = await this.kubeClient.deleteNamespacedPod(
        this.podRef.name.toString(),
        this.podRef.namespace.toString(),
        undefined,
        undefined,
        1,
      );

      if (result.response.statusCode !== StatusCodes.OK) {
        throw new SoloError(
          `Failed to delete pod ${this.podRef.name} in namespace ${this.podRef.namespace}: statusCode: ${result.response.statusCode}`,
        );
      }

      let podExists = true;
      while (podExists) {
        const pod = await this.pods.read(this.podRef);

        if (!pod?.metadata?.deletionTimestamp) {
          podExists = false;
        } else {
          await sleep(Duration.ofSeconds(1));
        }
      }
    } catch (e) {
      const errorMessage = `Failed to delete pod ${this.podRef.name} in namespace ${this.podRef.namespace}: ${e.message}`;

      if (e.body?.code === StatusCodes.NOT_FOUND || e.response?.body?.code === StatusCodes.NOT_FOUND) {
        this.logger.info(`Pod not found: ${errorMessage}`, e);
        return;
      }

      throw new SoloError(errorMessage, e);
    }
  }

  public async portForward(localPort: number, podPort: number): Promise<ExtendedNetServer> {
    try {
      this.logger.debug(
        `Creating port-forwarder for ${this.podRef.name}:${podPort} -> ${constants.LOCAL_HOST}:${localPort}`,
      );

      const ns = this.podRef.namespace;
      const forwarder = new PortForward(this.kubeConfig, false);

      const server = (await net.createServer(socket => {
        forwarder.portForward(ns.name, this.podRef.name.toString(), [podPort], socket, null, socket, 3);
      })) as ExtendedNetServer;

      // add info for logging
      server.info = `${this.podRef.name}:${podPort} -> ${constants.LOCAL_HOST}:${localPort}`;
      server.localPort = localPort;
      this.logger.debug(`Starting port-forwarder [${server.info}]`);
      return server.listen(localPort, constants.LOCAL_HOST);
    } catch (e) {
      const message = `failed to start port-forwarder [${this.podRef.name}:${podPort} -> ${constants.LOCAL_HOST}:${localPort}]: ${e.message}`;
      throw new SoloError(message, e);
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
      } catch {
        return;
      }
      await sleep(Duration.ofMillis(timeout));
    }
    if (attempts >= maxAttempts) {
      throw new SoloError(`failed to stop port-forwarder [${server.info}]`);
    }
  }
}
