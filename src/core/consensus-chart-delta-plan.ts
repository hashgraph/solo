// SPDX-License-Identifier: Apache-2.0

import {type NodeAlias} from '../types/aliases.js';

type ConsensusNodeChartAction = 'upgrade' | 'install' | 'uninstall';

/** A release-level change, executed in the order {@link ConsensusChartOrchestrator.applyDelta} sets. */
export interface ConsensusChartDeltaPlan {
  shared: 'upgrade' | 'skip';
  nodes: ReadonlyArray<{alias: NodeAlias; action: ConsensusNodeChartAction}>;
}
