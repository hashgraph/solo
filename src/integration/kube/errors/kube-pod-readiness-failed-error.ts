// SPDX-License-Identifier: Apache-2.0

import {KubeError} from './kube-error.js';
import {KubePodCreationFailedError} from './kube-pod-creation-failed-error.js';
import {KubePodNotFoundError} from './kube-pod-not-found-error.js';
import {KubePodNotReadyError} from './kube-pod-not-ready-error.js';

export class KubePodReadinessFailedError extends KubeError {
  public readonly namespace: string;
  public readonly labels: string[];

  public constructor(namespace: string, labels: string[], cause?: Error | unknown) {
    const causeError: Error | undefined = cause instanceof Error ? cause : undefined;
    const causeMessage: string = cause instanceof Error ? cause.message : String(cause ?? '');
    const meta: Record<string, unknown> = {
      namespace,
      labels,
    };

    if (cause instanceof KubePodCreationFailedError) {
      meta['podCreationFailure'] = cause.result;
    }

    if (cause instanceof KubePodNotFoundError) {
      meta['resource'] = cause.resource;
    }

    if (cause instanceof KubePodNotReadyError) {
      meta['podName'] = cause.podName;
      meta['phase'] = cause.phase;
      meta['containerSummary'] = cause.containerSummary;
    }

    super(
      `Pod readiness check failed in namespace ${namespace} for labels [${labels.join(', ')}]${
        causeMessage ? `: ${causeMessage}` : ''
      }`,
      causeError,
      meta,
    );
    this.namespace = namespace;
    this.labels = labels;
  }
}
