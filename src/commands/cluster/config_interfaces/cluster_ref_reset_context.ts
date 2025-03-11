/**
 * SPDX-License-Identifier: Apache-2.0
 */
import {type ClusterRefResetConfigClass} from './cluster_ref_reset_config_class.js';

export interface ClusterRefResetContext {
  config: ClusterRefResetConfigClass;
  isChartInstalled: boolean;
}
