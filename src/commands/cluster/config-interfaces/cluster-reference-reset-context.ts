// SPDX-License-Identifier: Apache-2.0

import {type ClusterRefResetConfigClass as ClusterReferenceResetConfigClass} from './cluster-ref-reset-config-class.js';

export interface ClusterReferenceResetContext {
  config: ClusterReferenceResetConfigClass;
  isChartInstalled: boolean;
}
