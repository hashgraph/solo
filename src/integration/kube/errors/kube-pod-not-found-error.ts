// SPDX-License-Identifier: Apache-2.0

import {KubeError} from './kube-error.js';

export class KubePodNotFoundError extends KubeError {
  public readonly resource: string;
  public readonly volumeMountDiagnostic: string | undefined;

  public constructor(resource: string, cause?: Error, volumeMountDiagnostic?: string) {
    super(
      `No pod found for: ${resource}` +
        (volumeMountDiagnostic ? ` [volume mount diagnostic: ${volumeMountDiagnostic}]` : ''),
      cause,
      {resource, volumeMountDiagnostic},
    );
    this.resource = resource;
    this.volumeMountDiagnostic = volumeMountDiagnostic;
  }
}
