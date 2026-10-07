// SPDX-License-Identifier: Apache-2.0

import {KubeError} from './kube-error.js';
import {KubePodCreationFailedError} from './kube-pod-creation-failed-error.js';
import {KubePodNotFoundError} from './kube-pod-not-found-error.js';
import {KubePodNotReadyError} from './kube-pod-not-ready-error.js';

export class KubePodReadinessFailedError extends KubeError {
  public readonly namespace: string;
  public readonly labels: string[];
  public readonly podName: string | undefined;
  public readonly phase: string | undefined;
  public readonly containerSummary: string | undefined;
  public readonly volumeMountDiagnostic: string | undefined;

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
      meta['volumeMountDiagnostic'] = cause.volumeMountDiagnostic;
    }

    if (cause instanceof KubePodNotReadyError) {
      meta['podName'] = cause.podName;
      meta['phase'] = cause.phase;
      meta['containerSummary'] = cause.containerSummary;
      meta['volumeMountDiagnostic'] = cause.volumeMountDiagnostic;
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
    if (cause instanceof KubePodNotReadyError) {
      this.podName = cause.podName;
      this.phase = cause.phase;
      this.containerSummary = cause.containerSummary;
    }
    // Carried on the wrapper as well as in meta so KubeErrorTranslator can surface the volume
    // troubleshooting steps without having to unwrap the cause.
    if (cause instanceof KubePodNotReadyError || cause instanceof KubePodNotFoundError) {
      this.volumeMountDiagnostic = cause.volumeMountDiagnostic;
    }
  }
}
