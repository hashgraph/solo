// SPDX-License-Identifier: Apache-2.0

import {type ExtendedNetServer} from '../../../../types/index.js';
import {type PodRef} from './pod_ref.js';
import {type ContainerName} from '../container/container_name.js';
import {type PodCondition} from './pod_condition.js';

export interface Pod {
  /**
   * The pod reference
   */
  readonly podRef: PodRef;

  /**
   * The labels of the pod
   */
  readonly labels?: Record<string, string>;

  /**
   * The command to run for the startup probe
   */
  readonly startupProbeCommand?: string[];

  /**
   * The container name
   */
  readonly containerName?: ContainerName;

  /**
   * The container image
   */
  readonly containerImage?: string;

  /**
   * The container command
   */
  readonly containerCommand?: string[];

  /**
   * The conditions of the pod
   */
  readonly conditions?: PodCondition[];

  /**
   * The pod IP
   */
  readonly podIp?: string;

  /**
   * The deletion timestamp of the pod
   */
  readonly deletionTimestamp?: Date;

  /**
   * Get a pod by name and namespace, will check every 1 second until the pod is no longer found.
   * Can throw a SoloError if there is an error while deleting the pod.
   */
  killPod(): Promise<void>;

  /**
   * Port forward a port from a pod to localhost
   *
   * This simple server just forwards traffic from itself to a service running in kubernetes
   * -> localhost:localPort -> port-forward-tunnel -> kubernetes-pod:targetPort
   * @param localPort - the local port to forward to
   * @param podPort - the port on the pod to forward from
   * @returns an instance of ExtendedNetServer
   */
  portForward(localPort: number, podPort: number): Promise<ExtendedNetServer>;

  /**
   * Stop the port forward
   * @param server - an instance of server returned by portForward method
   * @param [maxAttempts] - the maximum number of attempts to check if the server is stopped
   * @param [timeout] - the delay between checks in milliseconds
   */
  stopPortForward(server: ExtendedNetServer, maxAttempts?: number, timeout?: number): Promise<void>;
}
