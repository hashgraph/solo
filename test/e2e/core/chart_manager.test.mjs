/**
 * Copyright (C) 2024 Hedera Hashgraph, LLC
 *
 * Licensed under the Apache License, Version 2.0 (the ""License"");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an ""AS IS"" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 */
import { ChartManager, Helm, constants } from '../../../src/core/index.mjs'
import { testLogger } from '../../test_util.js'

describe('ChartManager', () => {
  const helm = new Helm(testLogger)
  const chartManager = new ChartManager(helm, testLogger)

  it('should be able to list installed charts', async () => {
    const ns = constants.SOLO_SETUP_NAMESPACE
    expect(ns, 'namespace should not be null').not.toBeNull()
    const list = await chartManager.getInstalledCharts(ns)
    expect(list.length, 'should have at least one installed chart').not.toBe(0)
  })

  it('should be able to check if a chart is installed', async () => {
    const ns = constants.SOLO_SETUP_NAMESPACE
    expect(ns, 'namespace should not be null').not.toBeNull()
    const isInstalled = await chartManager.isChartInstalled(ns, constants.SOLO_CLUSTER_SETUP_CHART)
    expect(isInstalled, `${constants.SOLO_CLUSTER_SETUP_CHART} should be installed`).toBeTruthy()
  })
})
