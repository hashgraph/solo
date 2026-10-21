// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {describe, it} from 'mocha';

import {ConsensusChartLayout, ConsensusChartLayoutKind} from '../../../src/core/consensus-chart-layout.js';
import {type NodeAlias} from '../../../src/types/aliases.js';

/**
 * The layout is the single fact every consensus-network Helm operation branches on, and it is read
 * from the cluster rather than stored. Misreading it is how a command ends up upgrading a release
 * that owns nothing, or colliding with one that does.
 */
describe('ConsensusChartLayout', (): void => {
  const SHARED: string = 'solo-deployment';

  function release(name: string, chart: string): {name: string; chart: string} {
    return {name, chart};
  }

  describe('classify', (): void => {
    it('reports nothing installed as NONE', (): void => {
      const layout: ConsensusChartLayout = ConsensusChartLayout.classify([], SHARED);

      expect(layout.kind).to.equal(ConsensusChartLayoutKind.NONE);
      expect(layout.isDeployed()).to.be.false;
      expect(layout.isSplit()).to.be.false;
    });

    it('reports a lone shared release as UMBRELLA', (): void => {
      const layout: ConsensusChartLayout = ConsensusChartLayout.classify(
        [release(SHARED, 'solo-deployment-0.67.0')],
        SHARED,
      );

      expect(layout.kind).to.equal(ConsensusChartLayoutKind.UMBRELLA);
      expect(layout.isSplit()).to.be.false;
      expect(layout.sharedReleaseInstalled).to.be.true;
    });

    it('reports a shared release plus per-node releases as SPLIT', (): void => {
      const layout: ConsensusChartLayout = ConsensusChartLayout.classify(
        [
          release(SHARED, 'solo-deployment-0.67.0'),
          release('consensus-node-node1', 'consensus-node-0.67.0'),
          release('consensus-node-node2', 'consensus-node-0.67.0'),
        ],
        SHARED,
      );

      expect(layout.kind).to.equal(ConsensusChartLayoutKind.SPLIT);
      expect(layout.allNodeReleaseNames()).to.have.members(['consensus-node-node1', 'consensus-node-node2']);
    });

    it('still reports SPLIT when the shared release is missing', (): void => {
      // A half-finished install, or one whose shared release was removed. Reading it as UMBRELLA or
      // NONE would make the next deploy collide with the per-node releases that are already there.
      const layout: ConsensusChartLayout = ConsensusChartLayout.classify(
        [release('consensus-node-node1', 'consensus-node-0.67.0')],
        SHARED,
      );

      expect(layout.kind).to.equal(ConsensusChartLayoutKind.SPLIT);
      expect(layout.sharedReleaseInstalled).to.be.false;
      expect(layout.isDeployed()).to.be.true;
    });

    it('ignores an unrelated release whose name merely starts with the prefix', (): void => {
      // The name alone is not proof; the chart column is what distinguishes a real per-node release
      // from somebody's `consensus-node-experiment` installed from a different chart.
      const layout: ConsensusChartLayout = ConsensusChartLayout.classify(
        [release(SHARED, 'solo-deployment-0.67.0'), release('consensus-node-experiment', 'some-other-chart-1.0.0')],
        SHARED,
      );

      expect(layout.kind).to.equal(ConsensusChartLayoutKind.UMBRELLA);
      expect(layout.allNodeReleaseNames()).to.deep.equal([]);
    });

    it('honours a renamed shared release', (): void => {
      const layout: ConsensusChartLayout = ConsensusChartLayout.classify(
        [release('my-network', 'solo-deployment-0.67.0')],
        'my-network',
      );

      expect(layout.kind).to.equal(ConsensusChartLayoutKind.UMBRELLA);
    });
  });

  describe('release naming', (): void => {
    it('names a node release that does not exist yet', (): void => {
      expect(ConsensusChartLayout.perNodeReleaseName('node9' as NodeAlias)).to.equal('consensus-node-node9');
    });
  });

  describe('partial and orphaned state', (): void => {
    const layout: ConsensusChartLayout = ConsensusChartLayout.classify(
      [
        release(SHARED, 'solo-deployment-0.67.0'),
        release('consensus-node-node1', 'consensus-node-0.67.0'),
        release('consensus-node-node4', 'consensus-node-0.67.0'),
      ],
      SHARED,
    );

    it('lists every per-node release for a teardown to sweep', (): void => {
      expect(layout.allNodeReleaseNames()).to.have.members(['consensus-node-node1', 'consensus-node-node4']);
    });
  });
});
