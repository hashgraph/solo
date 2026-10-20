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

/** Release-name prefix every per-node release carries, e.g. `consensus-node-node1`. */
const PER_NODE_RELEASE_PREFIX: string = `${constants.CONSENSUS_NODE_CHART}-`;

/**
 * Which layout a namespace is in, discovered from the releases Helm reports rather than from a flag
 * or a stored marker.
 *
 * Discovery rather than persistence is deliberate: the releases are the thing every later command
 * has to act on, so reading them cannot disagree with reality. A marker could — it would be written
 * by one machine and read by another, and a deployment converted or torn down out of band would
 * leave it lying. The cost is a Helm round-trip per command, which {@link ConsensusChartOrchestrator}
 * caches.
 */
export class ConsensusChartLayout {
  private constructor(
    public readonly kind: ConsensusChartLayoutKind,
    public readonly sharedReleaseInstalled: boolean,
    /** Alias to release name, for the nodes that currently own a release. */
    public readonly nodeReleases: ReadonlyMap<NodeAlias, string>,
  ) {}

  /**
   * Classifies a namespace from its installed releases.
   *
   * A release counts as a per-node release only when its name *and* its chart carry the
   * `consensus-node` prefix. Matching on the name alone would misread an unrelated user release that
   * happens to be called `consensus-node-something`, and the chart column costs nothing to check.
   *
   * @param releases - every release in the namespace, as `{name, chart}` pairs
   * @param sharedReleaseName - the configured name of the shared/umbrella release
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

  /** The release name a node's objects belong to under this layout. */
  public releaseNameFor(nodeAlias: NodeAlias, sharedReleaseName: string): string {
    return this.isSplit() ? ConsensusChartLayout.perNodeReleaseName(nodeAlias) : sharedReleaseName;
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

  /**
   * Expected nodes that own no release. Non-empty means a half-finished install or a failed
   * `node add`; what to do about it is the caller's decision, not this type's.
   */
  public missingFor(expected: readonly NodeAlias[]): NodeAlias[] {
    return expected.filter((nodeAlias: NodeAlias): boolean => !this.nodeReleases.has(nodeAlias));
  }

  /** Per-node releases for nodes the deployment no longer knows about, left by a failed teardown. */
  public orphansAgainst(expected: readonly NodeAlias[]): string[] {
    const known: Set<NodeAlias> = new Set(expected);
    return [...this.nodeReleases.entries()]
      .filter(([nodeAlias]): boolean => !known.has(nodeAlias))
      .map(([, releaseName]): string => releaseName);
  }

  /** Every per-node release present, for a teardown that has to sweep them all. */
  public allNodeReleaseNames(): string[] {
    return [...this.nodeReleases.values()];
  }
}
