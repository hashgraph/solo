// SPDX-License-Identifier: Apache-2.0

import {SoloErrors} from './solo-errors.js';
import {type SoloError} from './solo-error.js';
import {KubeMissingArgumentError} from '../../integration/kube/errors/kube-missing-argument-error.js';
import {KubeIllegalArgumentError} from '../../integration/kube/errors/kube-illegal-argument-error.js';
import {KubeMultipleItemsFoundError} from '../../integration/kube/errors/kube-multiple-items-found-error.js';
import {KubeContainerOperationFailedError} from '../../integration/kube/errors/kube-container-operation-failed-error.js';
import {KubePodNotFoundError} from '../../integration/kube/errors/kube-pod-not-found-error.js';
import {KubePodNotReadyError} from '../../integration/kube/errors/kube-pod-not-ready-error.js';
import {KubePodCreationFailedError} from '../../integration/kube/errors/kube-pod-creation-failed-error.js';
import {KubePodTerminationTimeoutError} from '../../integration/kube/errors/kube-pod-termination-timeout-error.js';
import {KubeApiInvalidResponseError} from '../../integration/kube/errors/kube-api-invalid-response-error.js';
import {KubeContainerInvalidPathError} from '../../integration/kube/errors/kube-container-invalid-path-error.js';
import {KubePvcCreationFailedError} from '../../integration/kube/errors/kube-pvc-creation-failed-error.js';
import {KubeIngressClassListFailedError} from '../../integration/kube/errors/kube-ingress-class-list-failed-error.js';

export class KubeErrorTranslator {
  /**
   * Attempts to translate a kube integration error into the corresponding SoloError.
   * Returns the translated SoloError, or undefined if the error is not a known kube type.
   */
  public static tryTranslate(error: unknown): SoloError | undefined {
    if (error instanceof KubePodNotFoundError) {
      return new SoloErrors.system.podNotFound(error.resource, error);
    }
    if (error instanceof KubePodNotReadyError) {
      return new SoloErrors.system.podNotReady(
        error.podName,
        error.resource,
        error.phase,
        error.containerSummary,
        error,
        error.volumeMountDiagnostic,
      );
    }
    if (error instanceof KubeContainerOperationFailedError) {
      return new SoloErrors.system.containerOperationFailed(error.operation, error);
    }
    if (error instanceof KubePodTerminationTimeoutError) {
      return new SoloErrors.system.podTerminationTimeout(error.namespace, error.labels);
    }
    if (error instanceof KubePodCreationFailedError) {
      return new SoloErrors.system.podCreationFailed(error.result);
    }
    if (error instanceof KubeContainerInvalidPathError) {
      return new SoloErrors.system.containerInvalidPath(error.context, error.path);
    }
    if (error instanceof KubeMultipleItemsFoundError) {
      return new SoloErrors.system.multipleItemsFound(error.filters);
    }
    if (error instanceof KubeApiInvalidResponseError) {
      return new SoloErrors.system.kubernetesApiInvalidResponse(error);
    }
    if (error instanceof KubePvcCreationFailedError) {
      return new SoloErrors.system.pvcCreationFailed();
    }
    if (error instanceof KubeIngressClassListFailedError) {
      return new SoloErrors.system.ingressClassListFailed(error);
    }
    if (error instanceof KubeMissingArgumentError) {
      return new SoloErrors.validation.missingArgument(error.argumentDescription);
    }
    if (error instanceof KubeIllegalArgumentError) {
      return new SoloErrors.validation.illegalArgument(error.reason);
    }
    return undefined;
  }
}
