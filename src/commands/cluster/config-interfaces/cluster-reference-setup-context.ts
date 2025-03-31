// SPDX-License-Identifier: Apache-2.0

import {type ClusterRefSetupConfigClass as ClusterReferenceSetupConfigClass} from './cluster-ref-setup-config-class.js';

export interface ClusterReferenceSetupContext {
  config: ClusterReferenceSetupConfigClass;
  isChartInstalled: boolean;
  valuesArg: string;
  context: string;
}
