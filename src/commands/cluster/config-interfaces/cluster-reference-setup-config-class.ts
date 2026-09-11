// SPDX-License-Identifier: Apache-2.0

import {type NamespaceName} from '../../../types/namespace/namespace-name.js';
import {type ClusterReferenceName} from '../../../types/index.js';

export interface ClusterReferenceSetupConfigClass {
  chartDirectory: string;
  clusterSetupNamespace: NamespaceName;
  deployGrafanaAlloy: boolean;
  deployMinio: boolean;
  deployMetricsServer: boolean;
  deployPrometheusStack: boolean;
  soloChartVersion: string;
  context?: string;
  clusterRef: ClusterReferenceName;
}
