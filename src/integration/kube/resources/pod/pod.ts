// SPDX-License-Identifier: Apache-2.0

import {type PodReference} from './pod-reference.js';
import {type ContainerName} from '../container/container-name.js';
import {type PodCondition} from './pod-condition.js';
import {type ContainerStatus} from './container-status.js';
import {type PodVolumeMount} from './pod-volume-mount.js';

export interface Pod {
  /**
   * The pod reference
   */
  readonly podReference: PodReference | null;

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
   * The creation timestamp of the pod
   */
  readonly creationTimestamp?: Date;

  /**
   * The deletion timestamp of the pod
   */
  readonly deletionTimestamp?: Date;

  /**
   * The current Kubernetes phase of the pod (for example Running, Succeeded, Failed)
   */
  readonly phase?: string;

  /**
   * All container statuses for the pod (init containers first, then regular containers).
   * Used to inspect non-recoverable error states without exposing @kubernetes/client-node types.
   */
  readonly allContainerStatuses?: ContainerStatus[];

  /**
   * Every PersistentVolumeClaim-backed volume mount of the pod, resolved from the pod's volumes and
   * its containers' volume mounts. Empty when the pod has no claim-backed storage, which is itself
   * meaningful: it means the workload is running on ephemeral container storage.
   */
  readonly persistentVolumeClaimMounts?: PodVolumeMount[];

  /**
   * Get a pod by name and namespace, will check every 1 second until the pod is no longer found.
   * Can throw a SoloError if there is an error while deleting the pod.
   * @param gracePeriodSeconds - the termination grace period in seconds; defaults to 1. Pass 0 to
   *   force immediate termination (e.g. during destroy, where graceful shutdown is unnecessary).
   */
  killPod(gracePeriodSeconds?: number): Promise<void>;

  /**
   * Port forward a port from a pod to localhost
   *
   * This simple server just forwards traffic from itself to a service running in kubernetes
   * -> localhost:localPort -> port-forward-tunnel -> kubernetes-pod:targetPort
   * @param localPort - the local port to forward to
   * @param podPort - the port on the pod to forward from
   * @param reuse - if true, reuse the port number from previous port forward operation
   * @param persist - if true, errors in port-forwarding will restart the port-forwarding, even after ts process has ended
   * @param externalAddress - optional address to bind on local host machine (default: 127.0.0.1)
   * @returns Promise resolving to the port forwarder server when not detached,
   *          or the port number (which may differ from localPort if it was in use) when detached
   */
  portForward(
    localPort: number,
    podPort: number,
    reuse?: boolean,
    persist?: boolean,
    externalAddress?: string,
  ): Promise<number>;

  /**
   * Stop the port forward
   * @param server - an instance of server returned by portForward method
   */
  stopPortForward(server: number): Promise<void>;
}
