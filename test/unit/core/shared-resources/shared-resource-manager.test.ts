// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {afterEach, beforeEach, describe, it} from 'mocha';
import sinon from 'sinon';
import * as fs from 'node:fs';
import * as os from 'node:os';

import {SharedResourceManager} from '../../../../src/core/shared-resources/shared-resource-manager.js';
import {type ChartManager} from '../../../../src/core/chart-manager.js';
import {type SoloLogger} from '../../../../src/core/logging/solo-logger.js';
import {type HelmClient} from '../../../../src/integration/helm/helm-client.js';
import {NamespaceName} from '../../../../src/types/namespace/namespace-name.js';
import * as constants from '../../../../src/core/constants.js';
import {SoloChartRepository} from '../../../../src/core/solo-chart-repository.js';
import {type AnyObject} from '../../../../src/types/aliases.js';
import {HelmChartValues} from '../../../../src/integration/helm/model/values.js';
import {PathEx} from '../../../../src/business/utils/path-ex.js';

describe('SharedResourceManager', (): void => {
  const namespace: NamespaceName = NamespaceName.of('test-namespace');
  const context: string = 'test-context';
  const chartVersion: string = '1.0.0';

  let loggerStub: SoloLogger;
  let helmStub: HelmClient;
  let chartManagerStub: ChartManager;
  let manager: SharedResourceManager;
  let temporaryDirectory: string;

  const chartValueArguments: () => string[] = (): string[] => {
    const chartValues: HelmChartValues = (chartManagerStub.install as sinon.SinonStub).firstCall.args[5];
    return chartValues.toArguments();
  };

  beforeEach((): void => {
    loggerStub = sinon.stub() as any;
    loggerStub.info = sinon.stub();
    loggerStub.error = sinon.stub();

    helmStub = sinon.stub() as any;

    chartManagerStub = sinon.stub() as any;
    chartManagerStub.isChartInstalled = sinon.stub().resolves(false);
    chartManagerStub.install = sinon.stub().resolves(true);
    chartManagerStub.uninstall = sinon.stub().resolves(true);

    manager = new SharedResourceManager(loggerStub, helmStub, chartManagerStub);
    temporaryDirectory = fs.mkdtempSync(PathEx.join(os.tmpdir(), 'solo-shared-resource-manager-'));
  });

  afterEach((): void => {
    sinon.restore();
    fs.rmSync(temporaryDirectory, {force: true, recursive: true});
  });

  describe('installChart()', (): void => {
    it('skips installation when chart is already installed', async (): Promise<void> => {
      (chartManagerStub.isChartInstalled as sinon.SinonStub).resolves(true);

      await manager.installChart(namespace, '', chartVersion, context);

      expect(chartManagerStub.install).to.not.have.been.called;
    });

    it('installs chart when not already installed', async (): Promise<void> => {
      await manager.installChart(namespace, '', chartVersion, context);

      expect(chartManagerStub.install).to.have.been.calledOnce;
    });

    it('uses the resolved solo-charts repository when chartDirectory is empty', async (): Promise<void> => {
      await manager.installChart(namespace, '', chartVersion, context);

      const repoName: AnyObject = (chartManagerStub.install as sinon.SinonStub).firstCall.args[3];
      expect(repoName).to.equal(SoloChartRepository.URL);
    });

    it('uses provided chartDirectory when given', async (): Promise<void> => {
      const localDirectory: string = '/local/solo-charts';

      await manager.installChart(namespace, localDirectory, chartVersion, context);

      const repoName: AnyObject = (chartManagerStub.install as sinon.SinonStub).firstCall.args[3];
      expect(repoName).to.equal(localDirectory);
    });

    it('always passes postgresql.enabled and redis.enabled in values', async (): Promise<void> => {
      manager.enablePostgres();
      manager.enableRedis();

      await manager.installChart(namespace, '', chartVersion, context);

      const valueArguments: string[] = chartValueArguments();

      expect(valueArguments).to.include('--set');
      expect(valueArguments).to.include('postgresql.enabled=true');
      expect(valueArguments).to.include('redis.enabled=true');
    });

    it('reflects postgres disabled and redis enabled correctly in values', async (): Promise<void> => {
      manager.enableRedis();

      await manager.installChart(namespace, '', chartVersion, context);

      const valueArguments: string[] = chartValueArguments();

      expect(valueArguments).to.include('--set');
      expect(valueArguments).to.include('postgresql.enabled=false');
      expect(valueArguments).to.include('redis.enabled=true');
    });

    it('merges extra valuesArgumentsMap into the helm --set arguments', async (): Promise<void> => {
      const extraValues: Record<string, string> = {
        'redis.image.registry': constants.REDIS_IMAGE_REGISTRY,
        'redis.sentinel.masterSet': constants.REDIS_SENTINEL_MASTER_SET,
      };

      await manager.installChart(namespace, '', chartVersion, context, extraValues);

      const valueArguments: string[] = chartValueArguments();

      expect(valueArguments).to.include('--set');
      expect(valueArguments).to.include('redis.image.registry=gcr.io');
      expect(valueArguments).to.include('redis.sentinel.masterSet=mirror');
    });

    it('maps mirror-node scheduling values into shared-resource chart paths', async (): Promise<void> => {
      const valuesFilePath: string = PathEx.join(temporaryDirectory, 'mirror-node-values.yaml');
      fs.writeFileSync(
        valuesFilePath,
        [
          'tolerations:',
          '  - key: "solo.hashgraph.io/owner"',
          '    operator: "Equal"',
          '    value: "adhoc-performance-test"',
          '    effect: "NoSchedule"',
          'postgresql:',
          '  postgresql:',
          '    tolerations:',
          '      - key: "solo-scheduling.io/os"',
          '        operator: "Equal"',
          '        value: "linux"',
          '        effect: "NoSchedule"',
          'redis:',
          '  tolerations:',
          '    - key: "solo.hashgraph.io/role"',
          '      operator: "Equal"',
          '      value: "consensus-node"',
          '      effect: "NoSchedule"',
          '',
        ].join('\n'),
      );

      manager.setSchedulingChartValues(new HelmChartValues().file(valuesFilePath));

      await manager.installChart(namespace, '', chartVersion, context);

      const valueArguments: string[] = chartValueArguments();

      expect(valueArguments).to.include('--set-literal');
      expect(valueArguments).to.include('postgresql.primary.tolerations[0].key=solo.hashgraph.io/owner');
      expect(valueArguments).to.include('postgresql.primary.tolerations[0].value=adhoc-performance-test');
      expect(valueArguments).to.include('postgresql.primary.tolerations[1].key=solo-scheduling.io/os');
      expect(valueArguments).to.include('redis.replica.tolerations[0].key=solo.hashgraph.io/owner');
      expect(valueArguments).to.include('redis.replica.tolerations[0].value=adhoc-performance-test');
      expect(valueArguments).to.include('redis.replica.tolerations[1].key=solo.hashgraph.io/role');
      expect(valueArguments).to.include('redis.master.tolerations[1].key=solo.hashgraph.io/role');
    });

    it('maps direct shared-resource scheduling values from values files', async (): Promise<void> => {
      const valuesFilePath: string = PathEx.join(temporaryDirectory, 'shared-resource-values.yaml');
      fs.writeFileSync(
        valuesFilePath,
        [
          'postgresql:',
          '  primary:',
          '    nodeSelector:',
          '      solo.hashgraph.io/role: "database"',
          '    tolerations:',
          '      - key: "solo.hashgraph.io/owner"',
          '        operator: "Equal"',
          '        value: "adhoc-single-day-test"',
          '        effect: "NoSchedule"',
          'redis:',
          '  replica:',
          '    tolerations:',
          '      - key: "solo.hashgraph.io/owner"',
          '        operator: "Equal"',
          '        value: "adhoc-performance-test"',
          '        effect: "NoSchedule"',
          '',
        ].join('\n'),
      );

      manager.setSchedulingChartValues(new HelmChartValues().file(valuesFilePath));

      await manager.installChart(namespace, '', chartVersion, context);

      const valueArguments: string[] = chartValueArguments();
      const postgresNodeSelectorArgument: string = String.raw`postgresql.primary.nodeSelector.solo\.hashgraph\.io/role=database`;

      expect(valueArguments).to.include(postgresNodeSelectorArgument);
      expect(valueArguments[valueArguments.indexOf(postgresNodeSelectorArgument) - 1]).to.equal('--set-string');
      expect(valueArguments).to.include('postgresql.primary.tolerations[0].value=adhoc-single-day-test');
      expect(valueArguments).to.include('redis.replica.tolerations[0].value=adhoc-performance-test');
    });

    it('adds role scheduling to redis from mirror components when redis does not define it', async (): Promise<void> => {
      const valuesFilePath: string = PathEx.join(temporaryDirectory, 'redis-role-fallback-values.yaml');
      fs.writeFileSync(
        valuesFilePath,
        [
          'nodeSelector:',
          '  solo.hashgraph.io/owner: "adhoc-performance-test"',
          '  solo.hashgraph.io/network-id: "7"',
          'tolerations:',
          '  - key: "solo.hashgraph.io/owner"',
          '    operator: "Equal"',
          '    value: "adhoc-performance-test"',
          '    effect: "NoSchedule"',
          '  - key: "solo.hashgraph.io/network-id"',
          '    operator: "Equal"',
          '    value: "7"',
          '    effect: "NoSchedule"',
          'redis:',
          '  enabled: true',
          'importer:',
          '  nodeSelector:',
          '    solo.hashgraph.io/role: "consensus-node"',
          '  tolerations:',
          '    - key: "solo.hashgraph.io/role"',
          '      operator: "Equal"',
          '      value: "consensus-node"',
          '      effect: "NoSchedule"',
          '',
        ].join('\n'),
      );

      manager.setSchedulingChartValues(new HelmChartValues().file(valuesFilePath));

      await manager.installChart(namespace, '', chartVersion, context);

      const valueArguments: string[] = chartValueArguments();
      const redisRoleSelectorArgument: string = String.raw`redis.replica.nodeSelector.solo\.hashgraph\.io/role=consensus-node`;

      expect(valueArguments).to.include(redisRoleSelectorArgument);
      expect(valueArguments[valueArguments.indexOf(redisRoleSelectorArgument) - 1]).to.equal('--set-string');
      expect(valueArguments).to.include('redis.replica.tolerations[2].key=solo.hashgraph.io/role');
      expect(valueArguments).to.include('redis.replica.tolerations[2].value=consensus-node');
      expect(valueArguments).to.include('redis.master.tolerations[2].key=solo.hashgraph.io/role');
      expect(valueArguments).to.include('redis.master.tolerations[2].value=consensus-node');
    });

    it('installs chart with the correct release name and chart name', async (): Promise<void> => {
      await manager.installChart(namespace, '', chartVersion, context);

      const [, releaseName, chartName] = (chartManagerStub.install as sinon.SinonStub).firstCall.args;
      expect(releaseName).to.equal(constants.SOLO_SHARED_RESOURCES_CHART);
      expect(chartName).to.equal(constants.SOLO_SHARED_RESOURCES_CHART);
    });

    it('passes the correct namespace and context to chartManager.install', async (): Promise<void> => {
      await manager.installChart(namespace, '', chartVersion, context);

      const installedNamespace: AnyObject = (chartManagerStub.install as sinon.SinonStub).firstCall.args[0];
      const installedContext: AnyObject = (chartManagerStub.install as sinon.SinonStub).firstCall.args[6];
      expect(installedNamespace).to.equal(namespace);
      expect(installedContext).to.equal(context);
    });
  });

  describe('uninstallChart()', (): void => {
    it('skips uninstallation when chart is not installed', async (): Promise<void> => {
      (chartManagerStub.isChartInstalled as sinon.SinonStub).resolves(false);

      await manager.uninstallChart(namespace, context);

      expect(chartManagerStub.uninstall).to.not.have.been.called;
    });

    it('uninstalls chart when it is installed', async (): Promise<void> => {
      (chartManagerStub.isChartInstalled as sinon.SinonStub).resolves(true);

      await manager.uninstallChart(namespace, context);

      expect(chartManagerStub.uninstall).to.have.been.calledOnceWith(
        namespace,
        constants.SOLO_SHARED_RESOURCES_CHART,
        context,
      );
    });
  });

  describe('enablePostgres() / enableRedis()', (): void => {
    it('defaults postgres and redis to disabled', async (): Promise<void> => {
      await manager.installChart(namespace, '', chartVersion, context);

      const valueArguments: string[] = chartValueArguments();

      expect(valueArguments).to.include('--set');
      expect(valueArguments).to.include('postgresql.enabled=false');
      expect(valueArguments).to.include('redis.enabled=false');
    });

    it('enables postgres after calling enablePostgres()', async (): Promise<void> => {
      manager.enablePostgres();

      await manager.installChart(namespace, '', chartVersion, context);

      const valueArguments: string[] = chartValueArguments();

      expect(valueArguments).to.include('--set');
      expect(valueArguments).to.include('postgresql.enabled=true');
      expect(valueArguments).to.include('redis.enabled=false');
    });

    it('enables redis after calling enableRedis()', async (): Promise<void> => {
      manager.enableRedis();

      await manager.installChart(namespace, '', chartVersion, context);

      const valueArguments: string[] = chartValueArguments();

      expect(valueArguments).to.include('--set');
      expect(valueArguments).to.include('postgresql.enabled=false');
      expect(valueArguments).to.include('redis.enabled=true');
    });
  });
});
