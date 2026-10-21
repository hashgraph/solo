// SPDX-License-Identifier: Apache-2.0

import {type NamespaceName} from '../types/namespace/namespace-name.js';
import {type Context} from '../types/index.js';

/**
 * Where a deployment's consensus releases live. Enough to look a layout up or tear it down; a
 * render additionally needs {@link ConsensusChartTarget}.
 */
export interface ConsensusChartAddress {
  namespace: NamespaceName;
  kubeContext: Context;
}
