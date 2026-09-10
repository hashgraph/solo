// SPDX-License-Identifier: Apache-2.0

/** The result of attempting to resume a cluster's stopped node container. */
export enum ClusterNodeResumeOutcome {
  /** The node container was stopped and has been started again. */
  RESUMED = 'resumed',

  /** Nothing changed: the node container is already running, does not exist, or refused to start. */
  UNCHANGED = 'unchanged',

  /** No container engine could be reached, so the node container's state is unknown. */
  ENGINE_UNAVAILABLE = 'engine-unavailable',
}
