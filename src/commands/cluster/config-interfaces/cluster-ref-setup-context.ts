// SPDX-License-Identifier: Apache-2.0

import {type ClusterRefSetupConfigClass} from './cluster-ref-setup-config-class.js';

export interface ClusterRefSetupContext {
  config: ClusterRefSetupConfigClass;
  isChartInstalled: boolean;
  valuesArg: string;
  context: string;
}
