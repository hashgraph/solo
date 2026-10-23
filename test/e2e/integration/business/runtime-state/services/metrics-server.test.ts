// SPDX-License-Identifier: Apache-2.0

import {MetricsServerImpl} from '../../../../../../src/business/runtime-state/services/metrics-server-impl.js';
import {type MetricsServer} from '../../../../../../src/business/runtime-state/api/metrics-server.js';
import {expect} from 'chai';
import {PathEx} from '../../../../../../src/business/utils/path-ex.js';
import * as constants from '../../../../../../src/core/constants.js';
import {type AggregatedMetrics} from '../../../../../../src/business/runtime-state/model/aggregated-metrics.js';
import {HelmMetricsServer} from '../../../../../helpers/helm-metrics-server.js';
import {HelmMetalLoadBalancer} from '../../../../../helpers/helm-metal-load-balancer.js';
import {Duration} from '../../../../../../src/core/time/duration.js';
import {
  type HelmDependencyManager,
  type KubectlDependencyManager,
} from '../../../../../../src/core/dependency-managers/index.js';
import {InjectTokens} from '../../../../../../src/core/dependency-injection/inject-tokens.js';
import {getTemporaryDirectory} from '../../../../test-utility.js';
import {container} from 'tsyringe-neo';

describe('MetricsServer', (): void => {
  const testName: string = 'metrics-server-test';

  before(async (): Promise<void> => {
    const helmDependencyManager: HelmDependencyManager = container.resolve(InjectTokens.HelmDependencyManager);
    const kubectlDependencyManager: KubectlDependencyManager = container.resolve(InjectTokens.KubectlDependencyManager);

    try {
      await helmDependencyManager.install(getTemporaryDirectory());
      await kubectlDependencyManager.install(getTemporaryDirectory());
      await HelmMetricsServer.installMetricsServer(testName);
      await HelmMetalLoadBalancer.installMetalLoadBalancer(testName);
    } catch (error) {
      throw new Error(
        `Failed to set up Metrics Server test: ${error instanceof Error ? error.message : String(error)}`,
        error,
      );
    }
  }).timeout(Duration.ofMinutes(5).toMillis());

  describe('getMetrics', (): void => {
    it('should succeed', async (): Promise<void> => {
      const metricsServer: MetricsServer = new MetricsServerImpl();
      const metrics: AggregatedMetrics = await metricsServer.getMetrics('metrics-server-test');
      console.log(`clusterMetrics = ${JSON.stringify(metrics?.clusterMetrics, null, 2)}`);
      expect(metrics?.clusterMetrics?.length).to.be.greaterThan(0);
    });
  });

  describe('logMetrics', (): void => {
    it('should succeed', async (): Promise<void> => {
      const metricsServer: MetricsServer = new MetricsServerImpl();
      await metricsServer.logMetrics('metric-server-test', PathEx.join(constants.SOLO_LOGS_DIR, 'metrics'));
    });
  });
});
