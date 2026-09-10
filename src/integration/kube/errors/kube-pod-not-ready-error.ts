// SPDX-License-Identifier: Apache-2.0

import {KubeError} from './kube-error.js';
import {type ContainerStatus} from '../resources/pod/container-status.js';

/**
 * Thrown when a pod matching the requested labels was observed during the wait but never
 * reached the required phase/condition before the attempts ran out. This is deliberately
 * distinct from {@link KubePodNotFoundError}, which means no pod matched the labels at all —
 * conflating the two sends diagnosis in the wrong direction (a pod stuck on a failing
 * startup probe is a very different problem from a pod that was never scheduled).
 */
export class KubePodNotReadyError extends KubeError {
  public readonly resource: string;
  public readonly podName: string;
  public readonly phase: string;
  public readonly containerSummary: string;
  public readonly volumeMountDiagnostic: string | undefined;

  public constructor(
    resource: string,
    podName: string,
    phase: string,
    containerStatuses: ContainerStatus[] = [],
    volumeMountDiagnostic?: string,
  ) {
    const containerSummary: string = KubePodNotReadyError.summarizeContainers(containerStatuses);
    super(
      `Pod ${podName} matched ${resource} but did not reach the required state before the timeout` +
        ` [phase: ${phase ?? 'Unknown'}${containerSummary ? `; containers: ${containerSummary}` : ''}]` +
        (volumeMountDiagnostic ? ` [volume mount diagnostic: ${volumeMountDiagnostic}]` : ''),
      undefined,
      {resource, podName, phase, containerSummary, volumeMountDiagnostic},
    );
    this.resource = resource;
    this.podName = podName;
    this.phase = phase;
    this.containerSummary = containerSummary;
    this.volumeMountDiagnostic = volumeMountDiagnostic;
  }

  private static summarizeContainers(containerStatuses: ContainerStatus[]): string {
    return containerStatuses
      .map((status: ContainerStatus): string => {
        const details: string[] = [];
        if (status.ready !== undefined) {
          details.push(`ready: ${status.ready}`);
        }
        if (status.restartCount) {
          details.push(`restarts: ${status.restartCount}`);
        }
        if (status.waitingReason) {
          details.push(`waiting: ${status.waitingReason}`);
        }
        if (status.terminatedReason || status.terminatedExitCode !== undefined) {
          details.push(`terminated: ${status.terminatedReason ?? 'Unknown'}, exit ${status.terminatedExitCode}`);
        }
        return `${status.name}${details.length > 0 ? ` (${details.join(', ')})` : ''}`;
      })
      .join(', ');
  }
}
