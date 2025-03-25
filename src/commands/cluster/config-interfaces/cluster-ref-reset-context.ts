// SPDX-License-Identifier: Apache-2.0

import {type ClusterRefResetConfigClass} from './cluster-ref-reset-config-class.js';

export interface ClusterRefResetContext {
  config: ClusterRefResetConfigClass;
  isChartInstalled: boolean;
}
