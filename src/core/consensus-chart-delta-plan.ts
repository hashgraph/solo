// SPDX-License-Identifier: Apache-2.0

import {type NodeAlias} from '../types/aliases.js';

/** What should happen to one consensus node's Helm release. */
export type ConsensusNodeChartAction = 'upgrade' | 'install' | 'uninstall';

/**
 * One declarative description of a release-level change, so the ordering rules live in a single
 * place instead of being re-derived by each caller.
 *
 * The order the orchestrator executes these in is load-bearing under the split layout: the shared
 * release carries `hedera.rosterNodes`, which each node's `dns-validation-script` init container
 * iterates, so a node must be gone from the per-node side before the roster shrinks and present in
 * the roster before its own pod starts.
 */
export interface ConsensusChartDeltaPlan {
  shared: 'upgrade' | 'skip';
  nodes: ReadonlyArray<{alias: NodeAlias; action: ConsensusNodeChartAction}>;
}
