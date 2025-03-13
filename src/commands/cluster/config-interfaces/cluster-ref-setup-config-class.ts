// SPDX-License-Identifier: Apache-2.0

import {type NamespaceName} from '../../../core/kube/resources/namespace/namespace-name.js';

export interface ClusterRefSetupConfigClass {
  chartDir: string;
  clusterSetupNamespace: NamespaceName;
  deployMinio: boolean;
  deployPrometheusStack: boolean;
  soloChartVersion: string;
}
