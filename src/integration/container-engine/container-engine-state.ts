// SPDX-License-Identifier: Apache-2.0

/**
 * Snapshot of the local container engine (Docker or Podman) availability.
 */
export interface ContainerEngineState {
  /** The engine CLI solo will use ('docker' or 'podman'); undefined when neither CLI is installed. */
  engineName?: string;
  /** True when the engine daemon (or its Docker Desktop / Podman machine VM) responded to an info probe. */
  running: boolean;
}
