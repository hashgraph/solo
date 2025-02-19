/**
 * SPDX-License-Identifier: Apache-2.0
 */
import {it, describe} from 'mocha';
import {expect} from 'chai';

import * as constants from '../../../../src/core/constants.js';
import {type ChartManager} from '../../../../src/core/chart_manager.js';
import {container} from 'tsyringe-neo';
import {InjectTokens} from '../../../../src/core/dependency_injection/inject_tokens.js';

describe('ChartManager', () => {
  const chartManager: ChartManager = container.resolve(InjectTokens.ChartManager);

  it('should be able to list installed charts', async () => {
    const ns = constants.SOLO_SETUP_NAMESPACE;
    expect(ns, 'namespace should not be null').not.to.be.null;
    const list = await chartManager.getInstalledCharts(ns);
    expect(list, 'should have at least one installed chart').not.to.have.lengthOf(0);
  });

  it('should be able to check if a chart is installed', async () => {
    const ns = constants.SOLO_SETUP_NAMESPACE;
    expect(ns, 'namespace should not be null').not.to.be.null;
    const isInstalled = await chartManager.isChartInstalled(ns, constants.SOLO_CLUSTER_SETUP_CHART);
    expect(isInstalled, `${constants.SOLO_CLUSTER_SETUP_CHART} should be installed`).to.be.ok;
  });
});
