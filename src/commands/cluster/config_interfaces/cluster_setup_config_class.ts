/**
 * SPDX-License-Identifier: Apache-2.0
 */
import {type NamespaceName} from '../../../core/kube/resources/namespace/namespace_name.js';

export interface ClusterSetupConfigClass {
  chartDir: string;
  clusterSetupNamespace: NamespaceName;
  deployCertManager: boolean;
  deployCertManagerCrds: boolean;
  deployMinio: boolean;
  deployPrometheusStack: boolean;
  soloChartVersion: string;
}
