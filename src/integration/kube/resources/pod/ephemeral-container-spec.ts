// SPDX-License-Identifier: Apache-2.0

/**
 * Solo domain description of an ephemeral (debug) container to attach to a running pod. Keeps the raw
 * Kubernetes client types confined to the integration layer; callers describe intent with plain data.
 */
export interface EphemeralContainerSpec {
  /** Unique container name within the pod (a DNS label). */
  readonly name: string;

  /** Container image providing the tooling the caller needs (for example a shell and tar). */
  readonly image: string;

  /** Entrypoint command; use a long-lived command (for example `['sleep', '180']`) so the container stays running. */
  readonly command: string[];

  /** Pod-level volumes to mount, by volume name and in-container mount path. */
  readonly volumeMounts: {readonly name: string; readonly mountPath: string}[];
}
