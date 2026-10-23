// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {describe, it, beforeEach, afterEach} from 'mocha';
import sinon, {type SinonStub} from 'sinon';

import {ConsensusChartOrchestrator, RetryPolicy} from '../../../src/core/consensus-chart-orchestrator.js';
import {HelmChartValues} from '../../../src/integration/helm/model/values.js';
import {type ConsensusChartTarget} from '../../../src/core/consensus-chart-target.js';
import {type ConsensusChartLayout, ConsensusChartLayoutKind} from '../../../src/core/consensus-chart-layout.js';
import {NamespaceName} from '../../../src/types/namespace/namespace-name.js';
import {type NodeAlias} from '../../../src/types/aliases.js';
import * as constants from '../../../src/core/constants.js';
import {SoloConfigSchema} from '../../../src/data/schema/model/solo/solo-config-schema.js';
import {Duration} from '../../../src/core/time/duration.js';

/**
 * The orchestrator is the only thing that decides which Helm releases exist and in what order they
 * are touched. The ordering is not cosmetic: the shared release carries the roster that each node's
 * `dns-validation-script` init container iterates, so a wrong order strands pods on a DNS name that
 * never resolves. The retry policy is not cosmetic either — the wrong one uninstalls a live shared
 * release and takes the MinIO credentials with it.
 */
describe('ConsensusChartOrchestrator', (): void => {
  const SHARED: string = constants.SOLO_DEPLOYMENT_CHART;
  const namespace: NamespaceName = NamespaceName.of('solo-e2e');

  let chartManager: {
    getInstalledReleases: SinonStub;
    upgrade: SinonStub;
    uninstall: SinonStub;
  };
  let orchestrator: ConsensusChartOrchestrator;
  let target: ConsensusChartTarget;
  let logger: {debug: SinonStub; warn: SinonStub; showUser: SinonStub; showUserError: SinonStub};

  /** Every `chartManager.upgrade` call as `[releaseName, chartName, reuseValues]`. */
  function upgradeCalls(): Array<[string, string, boolean]> {
    return chartManager.upgrade
      .getCalls()
      .map((call): [string, string, boolean] => [
        call.args[1] as string,
        call.args[2] as string,
        call.args[7] as boolean,
      ]);
  }

  /** The `HelmChartValues` handed to the Nth `chartManager.upgrade` call. */
  function upgradeValues(index: number = 0): HelmChartValues {
    return chartManager.upgrade.getCall(index).args[5] as HelmChartValues;
  }

  /** The `install` flag of the Nth `chartManager.upgrade` call. */
  function upgradeInstall(index: number = 0): boolean {
    return chartManager.upgrade.getCall(index).args[8] as boolean;
  }

  /** Builds the argument vector a caller would hand over for the given node names. */
  function valuesFor(...nodeNames: string[]): HelmChartValues {
    const values: HelmChartValues = new HelmChartValues();
    for (const [index, name] of nodeNames.entries()) {
      values.setLiteral(`hedera.nodes[${index}].name`, name);
    }
    return values.setLiteral('defaults.root.image.tag', '0.46.2');
  }

  function buildOrchestrator(): ConsensusChartOrchestrator {
    // A real schema instance, not a bare object: SoloConfig constructs every nested section eagerly.
    const schema: SoloConfigSchema = new SoloConfigSchema();
    schema.helmChart.name = SHARED;

    const configProvider: {config: () => {asObject: () => SoloConfigSchema}} = {
      config: (): {asObject: () => SoloConfigSchema} => ({
        asObject: (): SoloConfigSchema => schema,
      }),
    };

    logger = {debug: sinon.stub(), warn: sinon.stub(), showUser: sinon.stub(), showUserError: sinon.stub()};

    return new ConsensusChartOrchestrator(chartManager as never, logger as never, configProvider as never);
  }

  beforeEach((): void => {
    // Collapse the retry backoff; these cases assert on call sequences, not on wall-clock delay.
    const ofSecondsStub: SinonStub = sinon.stub(Duration, 'ofSeconds');
    ofSecondsStub.callThrough();
    ofSecondsStub.withArgs(constants.NETWORK_CHART_INSTALL_RETRY_DELAY_SECS).returns(Duration.ofMillis(1));

    chartManager = {
      getInstalledReleases: sinon.stub().resolves([]),
      upgrade: sinon.stub().resolves(true),
      uninstall: sinon.stub().resolves(true),
    };
    orchestrator = buildOrchestrator();
    target = {
      namespace,
      kubeContext: 'context1',
      clusterReference: 'cluster1',
      chartDirectory: '/charts',
      soloChartVersion: '0.67.0',
      cacheDirectory: '/tmp/solo-orchestrator-test',
    };
  });

  afterEach((): void => sinon.restore());

  describe('discover', (): void => {
    it('caches so repeated commands do not re-list releases', async (): Promise<void> => {
      await orchestrator.discover(target);
      await orchestrator.discover(target);

      expect(chartManager.getInstalledReleases.callCount).to.equal(1);
    });

    it('re-reads after invalidateAll', async (): Promise<void> => {
      await orchestrator.discover(target);
      orchestrator.invalidateAll();
      await orchestrator.discover(target);

      expect(chartManager.getInstalledReleases.callCount).to.equal(2);
    });

    it('treats a namespace it cannot list as nothing installed', async (): Promise<void> => {
      chartManager.getInstalledReleases.rejects(new Error('namespaces "solo-e2e" not found'));

      const layout: ConsensusChartLayout = await orchestrator.discover(target);

      expect(layout.kind).to.equal(ConsensusChartLayoutKind.NONE);
    });

    it('keys the cache by context as well as namespace', async (): Promise<void> => {
      await orchestrator.discover(target);
      await orchestrator.discover({...target, kubeContext: 'context2'});

      expect(chartManager.getInstalledReleases.callCount).to.equal(2);
    });
  });

  /**
   * The flag is consulted only when a deployment is first created. An existing one keeps the layout
   * it was created with, because the single chart cannot be deprecated yet — so nothing here may
   * turn an umbrella deployment into a split one, however the flag is set.
   */
  describe('existing deployments are never converted', (): void => {
    const umbrellaRelease: Array<{name: string; chart: string}> = [{name: SHARED, chart: 'solo-deployment-0.67.0'}];
    const delta: HelmChartValues = valuesFor('node1', 'node2');
    let flagWasSet: boolean;

    beforeEach((): void => {
      flagWasSet = constants.CONFIG.EXPERIMENTAL_PER_CONSENSUS_NODE_CHART;
      constants.CONFIG.EXPERIMENTAL_PER_CONSENSUS_NODE_CHART = true;
      chartManager.getInstalledReleases.resolves(umbrellaRelease);
    });

    afterEach((): void => {
      constants.CONFIG.EXPERIMENTAL_PER_CONSENSUS_NODE_CHART = flagWasSet;
    });

    it('installs no per-node release for an umbrella deployment even with the flag set', async (): Promise<void> => {
      await orchestrator.applyDelta(target, delta, {
        shared: 'upgrade',
        nodes: [
          {alias: 'node1' as NodeAlias, action: 'upgrade'},
          {alias: 'node2' as NodeAlias, action: 'upgrade'},
        ],
      });

      expect(upgradeCalls()).to.deep.equal([[SHARED, SHARED, true]]);
      expect(upgradeCalls().map(([releaseName]): string => releaseName)).to.not.include('consensus-node-node1');
    });

    it('tells the operator the flag does not apply, once per namespace and context', async (): Promise<void> => {
      await orchestrator.discover(target);
      await orchestrator.discover(target);

      // Deduped by the layout cache, so a command touching several clusters does not repeat it.
      expect(logger.showUser.callCount).to.equal(1);
      expect(logger.showUser.firstCall.args[0]).to.match(/new deployments only/i);
    });

    it('says nothing when the deployment is already split', async (): Promise<void> => {
      chartManager.getInstalledReleases.resolves([
        ...umbrellaRelease,
        {name: 'consensus-node-node1', chart: 'consensus-node-0.67.0'},
      ]);

      await orchestrator.discover(target);

      expect(logger.showUser.called).to.be.false;
    });

    it('says nothing when the flag is unset', async (): Promise<void> => {
      constants.CONFIG.EXPERIMENTAL_PER_CONSENSUS_NODE_CHART = false;

      await orchestrator.discover(target);

      expect(logger.showUser.called).to.be.false;
    });
  });

  describe('renderNetwork', (): void => {
    const aliases: NodeAlias[] = ['node1', 'node2'] as NodeAlias[];
    const umbrella: HelmChartValues = valuesFor('node1', 'node2');

    it('installs one umbrella release when not splitting', async (): Promise<void> => {
      await orchestrator.renderNetwork(target, umbrella, aliases, false, RetryPolicy.CLEAN_RETRY);

      expect(upgradeCalls()).to.deep.equal([[SHARED, SHARED, false]]);
    });

    it("hands Helm the caller's own arguments, untranslated, under the umbrella layout", async (): Promise<void> => {
      // The guarantee the single chart depends on: same input in, same values out. Re-serialising
      // through the translator would re-type scalars and re-quote strings under different YAML
      // rules than Helm's, so an unchanged deployment could render differently than before.
      await orchestrator.renderNetwork(target, umbrella, aliases, false, RetryPolicy.CLEAN_RETRY);

      expect(upgradeValues()).to.equal(umbrella);
      expect(upgradeValues().toArguments()).to.deep.equal(umbrella.toArguments());
    });

    it('installs the shared release before any node release when splitting', async (): Promise<void> => {
      await orchestrator.renderNetwork(target, umbrella, aliases, true, RetryPolicy.CLEAN_RETRY);

      // The per-node chart mounts ConfigMaps and Secrets the shared release renders, so the order
      // is a dependency, not a preference.
      expect(upgradeCalls()).to.deep.equal([
        [SHARED, SHARED, false],
        ['consensus-node-node1', constants.CONSENSUS_NODE_CHART, false],
        ['consensus-node-node2', constants.CONSENSUS_NODE_CHART, false],
      ]);
    });
  });

  describe('applyDelta', (): void => {
    const delta: HelmChartValues = valuesFor('node1', 'node2', 'node3');

    function splitReleases(): Array<{name: string; chart: string}> {
      return [
        {name: SHARED, chart: 'solo-deployment-0.67.0'},
        {name: 'consensus-node-node1', chart: 'consensus-node-0.67.0'},
        {name: 'consensus-node-node2', chart: 'consensus-node-0.67.0'},
      ];
    }

    it('applies the delta to the single release under the umbrella layout', async (): Promise<void> => {
      chartManager.getInstalledReleases.resolves([{name: SHARED, chart: 'solo-deployment-0.67.0'}]);

      await orchestrator.applyDelta(target, delta, {
        shared: 'upgrade',
        nodes: [{alias: 'node1' as NodeAlias, action: 'upgrade'}],
      });

      expect(upgradeCalls()).to.deep.equal([[SHARED, SHARED, true]]);
    });

    it('passes the delta through untranslated, and without --install', async (): Promise<void> => {
      chartManager.getInstalledReleases.resolves([{name: SHARED, chart: 'solo-deployment-0.67.0'}]);

      await orchestrator.applyDelta(target, delta, {
        shared: 'upgrade',
        nodes: [{alias: 'node1' as NodeAlias, action: 'upgrade'}],
      });

      expect(upgradeValues(), 'the caller arguments reach Helm unchanged').to.equal(delta);
      // `--install` with `--reuse-values` on a release that has gone missing would rebuild the
      // network from chart defaults plus this delta; node lifecycle must fail instead.
      expect(upgradeInstall(), 'node lifecycle never installs').to.be.false;
    });

    it('reuses values on every delta so unspecified keys survive', async (): Promise<void> => {
      chartManager.getInstalledReleases.resolves(splitReleases());

      await orchestrator.applyDelta(target, delta, {
        shared: 'upgrade',
        nodes: [{alias: 'node1' as NodeAlias, action: 'upgrade'}],
      });

      expect(upgradeCalls().every((call: [string, string, boolean]): boolean => call[2])).to.be.true;
    });

    it('does not reuse values for a node being installed for the first time', async (): Promise<void> => {
      chartManager.getInstalledReleases.resolves(splitReleases());

      await orchestrator.applyDelta(target, delta, {
        shared: 'skip',
        nodes: [{alias: 'node3' as NodeAlias, action: 'install'}],
      });

      expect(upgradeCalls()).to.deep.equal([['consensus-node-node3', constants.CONSENSUS_NODE_CHART, false]]);
    });

    it('uninstalls a removed node before shrinking the roster', async (): Promise<void> => {
      chartManager.getInstalledReleases.resolves(splitReleases());

      await orchestrator.applyDelta(target, delta, {
        shared: 'upgrade',
        nodes: [
          {alias: 'node2' as NodeAlias, action: 'uninstall'},
          {alias: 'node1' as NodeAlias, action: 'upgrade'},
        ],
      });

      // Shrinking the roster first would leave node2's pod unable to restart, because the
      // dns-validation script it already mounts would no longer list it.
      expect(chartManager.uninstall.calledBefore(chartManager.upgrade)).to.be.true;
      expect(chartManager.uninstall.firstCall.args[1]).to.equal('consensus-node-node2');
      expect(upgradeCalls()).to.deep.equal([
        [SHARED, SHARED, true],
        ['consensus-node-node1', constants.CONSENSUS_NODE_CHART, true],
      ]);
    });

    it('skips the shared release when the plan says so', async (): Promise<void> => {
      chartManager.getInstalledReleases.resolves(splitReleases());

      await orchestrator.applyDelta(target, delta, {
        shared: 'skip',
        nodes: [{alias: 'node1' as NodeAlias, action: 'upgrade'}],
      });

      expect(upgradeCalls().map(([releaseName]): string => releaseName)).to.not.include(SHARED);
    });
  });

  describe('retry policy', (): void => {
    it('uninstalls between attempts only under CLEAN_RETRY', async (): Promise<void> => {
      chartManager.upgrade.onFirstCall().rejects(new Error('transient'));

      await orchestrator.renderNetwork(target, valuesFor(), [], false, RetryPolicy.CLEAN_RETRY);

      expect(chartManager.uninstall.calledOnce).to.be.true;
    });

    it('never uninstalls under RETRY_ONLY', async (): Promise<void> => {
      chartManager.upgrade.onFirstCall().rejects(new Error('transient'));

      await orchestrator.renderNetwork(target, valuesFor(), [], false, RetryPolicy.RETRY_ONLY);

      // This is the policy every operation on a live network uses; an uninstall here would destroy
      // the MinIO credentials the running tenant depends on.
      expect(chartManager.uninstall.called).to.be.false;
      expect(chartManager.upgrade.callCount).to.equal(2);
    });

    it('refuses CLEAN_RETRY against a namespace that already has releases', async (): Promise<void> => {
      // The load-balancer redeploy runs after the install and once asked for CLEAN_RETRY, which would
      // have uninstalled the live shared release on any transient error. Enforced here rather than
      // left to each call site to remember.
      chartManager.getInstalledReleases.resolves([{name: SHARED, chart: 'solo-deployment-0.67.0'}]);

      await expect(
        orchestrator.renderNetwork(target, valuesFor(), [], false, RetryPolicy.CLEAN_RETRY),
      ).to.be.rejectedWith(/RETRY_ONLY/);
      expect(chartManager.upgrade.called).to.be.false;
    });
  });

  describe('uninstallAll', (): void => {
    it('sweeps every per-node release and the shared one, whatever the layout', async (): Promise<void> => {
      chartManager.getInstalledReleases.resolves([
        {name: SHARED, chart: 'solo-deployment-0.67.0'},
        {name: 'consensus-node-node1', chart: 'consensus-node-0.67.0'},
        {name: 'consensus-node-node7', chart: 'consensus-node-0.67.0'},
      ]);

      const removed: string[] = await orchestrator.uninstallAll(target);

      // node7 is not in any current node list; discovery is what makes teardown find it anyway.
      expect(removed).to.deep.equal(['consensus-node-node1', 'consensus-node-node7', SHARED]);
    });

    it('removes nothing when nothing is installed', async (): Promise<void> => {
      expect(await orchestrator.uninstallAll(target)).to.deep.equal([]);
    });
  });
});
