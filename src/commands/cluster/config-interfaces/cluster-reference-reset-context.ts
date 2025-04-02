// SPDX-License-Identifier: Apache-2.0

import {type ClusterReferenceResetConfigClass} from './cluster-reference-reset-config-class.js';

export interface ClusterReferenceResetContext {
  config: ClusterReferenceResetConfigClass;
  isChartInstalled: boolean;
}
