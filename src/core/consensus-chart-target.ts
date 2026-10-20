// SPDX-License-Identifier: Apache-2.0

import {type NamespaceName} from '../types/namespace/namespace-name.js';
import {type ClusterReferenceName, type Context} from '../types/index.js';

/**
 * Everything {@link ConsensusChartOrchestrator} needs to address one cluster's half of a deployment.
 *
 * Deliberately a plain record rather than one of the command config classes: the orchestrator lives
 * in `src/core/` and must not reach into `NetworkDeployConfigClass` or the node-lifecycle configs,
 * each of which carries far more than this and pulls command-layer types into core.
 */
export interface ConsensusChartTarget {
  namespace: NamespaceName;
  kubeContext: Context;
  clusterReference: ClusterReferenceName;
  /** A local charts directory; empty/undefined resolves the published OCI repository instead. */
  chartDirectory?: string;
  soloChartVersion: string;
  cacheDirectory: string;
}
