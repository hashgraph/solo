/**
 * SPDX-License-Identifier: Apache-2.0
 */
import {type ClusterRefSetupConfigClass} from './cluster_ref_setup_config_class.js';

export interface ClusterRefSetupContext {
  config: ClusterRefSetupConfigClass;
  chartPath: string;
  isChartInstalled: boolean;
  valuesArg: string;
}
