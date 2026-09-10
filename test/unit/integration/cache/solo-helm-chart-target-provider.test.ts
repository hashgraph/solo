// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import * as constants from '../../../../src/core/constants.js';
import * as version from '../../../../version.js';
import {CacheArtifactEnum} from '../../../../src/integration/cache/enums/cache-artifact-enum.js';
import {SoloHelmChartTargetProvider} from '../../../../src/integration/cache/target-providers/solo-helm-chart-target-provider.js';
import {type CacheTargetStructure} from '../../../../src/integration/cache/models/cache-target-structure.js';

describe('SoloHelmChartTargetProvider', (): void => {
  it('should return only helm chart targets', async (): Promise<void> => {
    const provider: SoloHelmChartTargetProvider = new SoloHelmChartTargetProvider();
    const targets: readonly CacheTargetStructure[] = await provider.getRequiredTargets();

    expect(targets.length).to.be.greaterThan(0);
    for (const target of targets) {
      expect(target.type).to.equal(CacheArtifactEnum.HELM_CHART);
    }
  });

  it('should key targets by the chart name and version passed to ChartManager', async (): Promise<void> => {
    const provider: SoloHelmChartTargetProvider = new SoloHelmChartTargetProvider();
    const targets: readonly CacheTargetStructure[] = await provider.getRequiredTargets();

    const mirrorNode: CacheTargetStructure | undefined = targets.find(
      (target): boolean => target.name === constants.MIRROR_NODE_CHART,
    );
    expect(mirrorNode, 'expected a mirror node chart target').to.not.equal(undefined);
    expect(mirrorNode.version).to.equal(version.MIRROR_NODE_VERSION);
    expect(mirrorNode.source).to.equal(constants.MIRROR_NODE_CHART_URL);

    // Explorer's chart is fully qualified by its OCI URL, so its chart name is empty.
    const explorer: CacheTargetStructure | undefined = targets.find((target): boolean => target.name === '');
    expect(explorer, 'expected an explorer chart target').to.not.equal(undefined);
    expect(explorer.version).to.equal(version.EXPLORER_VERSION);
    expect(explorer.source).to.equal(constants.EXPLORER_CHART_URL);
  });
});
