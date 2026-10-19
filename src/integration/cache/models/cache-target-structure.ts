// SPDX-License-Identifier: Apache-2.0

import {type CacheArtifactEnum} from '../enums/cache-artifact-enum.js';

/**
 * Describes a cacheable target before it is pulled and stored locally.
 *
 * This is the canonical input model for the cache subsystem.
 * It is intentionally generic enough to represent either:
 * - a container image
 * - a Helm chart
 */
export interface CacheTargetStructure {
  /**
   * Domain of the target.
   */
  readonly type: CacheArtifactEnum;

  /**
   * Fully qualified logical name of the target.
   *
   * Examples:
   * - "ghcr.io/hiero-ledger/hiero-block-node"
   * - "solo-deployment"
   */
  readonly name: string;

  /**
   * Version, tag, or release identifier of the target.
   *
   * Examples:
   * - "0.23.2"
   * - "0.62.0"
   * - "latest"
   */
  readonly version: string;

  /**
   * Optional source location used to resolve the target.
   *
   * Examples:
   * - "ghcr.io"
   * - "oci://ghcr.io/hiero-ledger/solo-charts"
   * - "https://charts.example.com"
   */
  readonly source?: string;
}
