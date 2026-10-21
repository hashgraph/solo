// SPDX-License-Identifier: Apache-2.0

import {type ClusterReferenceName} from '../types/index.js';
import {type ConsensusChartAddress} from './consensus-chart-address.js';

/**
 * Everything {@link ConsensusChartOrchestrator} needs to render one cluster's half of a deployment.
 *
 * Deliberately a plain record rather than one of the command config classes: the orchestrator lives
 * in `src/core/` and must not reach into `NetworkDeployConfigClass` or the node-lifecycle configs.
 */
export interface ConsensusChartTarget extends ConsensusChartAddress {
  clusterReference: ClusterReferenceName;
  /** A local charts directory; empty/undefined resolves the published OCI repository instead. */
  chartDirectory?: string;
  soloChartVersion: string;
  cacheDirectory: string;
}
