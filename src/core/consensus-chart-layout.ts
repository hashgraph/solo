// SPDX-License-Identifier: Apache-2.0

import {type NodeAlias} from '../types/aliases.js';
import * as constants from './constants.js';

/** How the consensus network's Helm releases are arranged in a namespace. */
export enum ConsensusChartLayoutKind {
  /** Nothing is installed. */
  NONE = 'none',
  /** One `solo-deployment` release renders the network-scoped objects and every consensus node. */
  UMBRELLA = 'umbrella',
  /** A shared `solo-deployment` release plus one `consensus-node-<alias>` release per node. */
  SPLIT = 'split',
}

const PER_NODE_RELEASE_PREFIX: string = `${constants.CONSENSUS_NODE_CHART}-`;

/**
 * Which layout a namespace is in, discovered from the releases Helm reports rather than from a flag
 * or a stored marker.
 *
 * Discovery is deliberate: the releases are what every later command has to act on, so reading them
 * cannot disagree with reality. A marker could — written by one machine and read by another, and
 * left lying by a deployment converted or torn down out of band.
 */
export class ConsensusChartLayout {
  private constructor(
    public readonly kind: ConsensusChartLayoutKind,
    public readonly sharedReleaseInstalled: boolean,
    private readonly nodeReleases: ReadonlyMap<NodeAlias, string>,
  ) {}

  /**
   * Classifies a namespace from its installed releases.
   *
   * A release counts as per-node only when its name *and* its chart carry the `consensus-node`
   * prefix, so an unrelated user release named `consensus-node-something` is not misread.
   */
  public static classify(
    releases: readonly {name: string; chart?: string}[],
    sharedReleaseName: string,
  ): ConsensusChartLayout {
    const sharedReleaseInstalled: boolean = releases.some(
      (release: {name: string}): boolean => release.name === sharedReleaseName,
    );

    const nodeReleases: Map<NodeAlias, string> = new Map<NodeAlias, string>();
    for (const release of releases) {
      if (release.name.startsWith(PER_NODE_RELEASE_PREFIX) && release.chart?.startsWith(PER_NODE_RELEASE_PREFIX)) {
        nodeReleases.set(release.name.slice(PER_NODE_RELEASE_PREFIX.length) as NodeAlias, release.name);
      }
    }

    let kind: ConsensusChartLayoutKind;
    if (nodeReleases.size > 0) {
      // Per-node releases are the unambiguous signal. A shared release alongside them is the normal
      // split shape; one without them is still split mid-install, and treating it as such is what
      // makes a resumed install converge rather than collide.
      kind = ConsensusChartLayoutKind.SPLIT;
    } else {
      kind = sharedReleaseInstalled ? ConsensusChartLayoutKind.UMBRELLA : ConsensusChartLayoutKind.NONE;
    }

    return new ConsensusChartLayout(kind, sharedReleaseInstalled, nodeReleases);
  }

  /** The release name a node owns under the split layout, whether or not it is installed yet. */
  public static perNodeReleaseName(nodeAlias: NodeAlias): string {
    return `${PER_NODE_RELEASE_PREFIX}${nodeAlias}`;
  }

  public isSplit(): boolean {
    return this.kind === ConsensusChartLayoutKind.SPLIT;
  }

  public isDeployed(): boolean {
    return this.kind !== ConsensusChartLayoutKind.NONE;
  }

  /** Every per-node release present, for a teardown that has to sweep them all. */
  public allNodeReleaseNames(): string[] {
    return [...this.nodeReleases.values()];
  }
}
