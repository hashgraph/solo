// SPDX-License-Identifier: Apache-2.0

/**
 * Interface CRUD on manifests.
 */
export interface Manifests {
  /**
   * Apply a manifest file. By default fails if a resource already exists (HTTP 409).
   * Pass `{ignoreExisting: true}` to skip resources that already exist, making the operation idempotent.
   * @param filePath - path to a YAML manifest (may contain multiple documents)
   * @param options - optional behaviour overrides
   */
  applyManifest(filePath: string, options?: {ignoreExisting?: boolean}): Promise<void>;

  scaleStatefulSet(namespace: string, statefulSetName: string, replicas: number): Promise<void>;
  scaleDeployment(namespace: string, deploymentName: string, replicas: number): Promise<void>;

  /**
   * Patch an existing Kubernetes object (including custom resources) using a merge patch.
   * @param spec - a partial Kubernetes object with apiVersion, kind, metadata.name, metadata.namespace, and the fields to patch
   */
  patchObject(spec: object): Promise<void>;
}
