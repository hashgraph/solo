// SPDX-License-Identifier: Apache-2.0

export interface ContainerStatus {
  /**
   * The name of the container.
   */
  readonly name: string;

  /**
   * Whether Kubernetes reports the container as ready.
   */
  readonly ready?: boolean;

  /**
   * Number of times Kubernetes has restarted the container.
   */
  readonly restartCount?: number;

  /**
   * The reason the container is in a waiting state, if any (e.g. ImagePullBackOff).
   */
  readonly waitingReason?: string;

  /**
   * The message associated with the waiting state, if any.
   */
  readonly waitingMessage?: string;

  /**
   * The reason the container was terminated, if any (e.g. OOMKilled).
   */
  readonly terminatedReason?: string;

  /**
   * The exit code of the terminated container, if any.
   */
  readonly terminatedExitCode?: number;
}
