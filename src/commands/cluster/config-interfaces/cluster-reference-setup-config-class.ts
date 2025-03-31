// SPDX-License-Identifier: Apache-2.0

import {type NamespaceName} from '../../../integration/kube/resources/namespace/namespace-name.js';
import {type ClusterRef as ClusterReference} from '../../../core/config/remote/types.js';

export interface ClusterReferenceSetupConfigClass {
  chartDirectory: string;
  clusterSetupNamespace: NamespaceName;
  deployMinio: boolean;
  deployPrometheusStack: boolean;
  soloChartVersion: string;
  context?: string;
  clusterRef: ClusterReference;
}
