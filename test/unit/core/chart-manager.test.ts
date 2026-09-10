// SPDX-License-Identifier: Apache-2.0

import 'sinon-chai';

import {expect} from 'chai';
import sinon, {type SinonStub} from 'sinon';
import {beforeEach, describe, it} from 'mocha';
import {ChartManager} from '../../../src/core/chart-manager.js';
import {type Chart} from '../../../src/integration/helm/model/chart.js';
import {type HelmClient} from '../../../src/integration/helm/helm-client.js';
import {type HelmChartValues} from '../../../src/integration/helm/model/values.js';
import {type InstallChartOptions} from '../../../src/integration/helm/model/install/install-chart-options.js';
import {type NamespaceName} from '../../../src/types/namespace/namespace-name.js';
import {type SoloLogger} from '../../../src/core/logging/solo-logger.js';
import {type CacheCatalogStore} from '../../../src/integration/cache/api/cache-catalog-store.js';
import {type CacheHealthInspector} from '../../../src/integration/cache/api/cache-health-inspector.js';
import {ReleaseItem} from '../../../src/integration/helm/model/release/release-item.js';

const inspectorReturning: (present: boolean) => CacheHealthInspector = (present: boolean): CacheHealthInspector =>
  ({
    exists: async (): Promise<boolean> => present,
    getSize: async (): Promise<number> => 0,
    filterExisting: async (paths: readonly string[]): Promise<readonly string[]> => paths,
  }) as CacheHealthInspector;

describe('ChartManager cached-chart consumption', (): void => {
  const chartName: string = 'hedera-mirror';
  const chartVersion: string = 'v0.157.0';
  const repositoryUrl: string = 'https://example.com/charts';
  const cachedArchivePath: string = '/home/user/.solo/cache/charts/hedera-mirror__v0.157.0.tar';

  const logger: SoloLogger = {
    debug: (): void => undefined,
    warn: (): void => undefined,
    showUser: (): void => undefined,
    error: (): void => undefined,
  } as unknown as SoloLogger;

  const chartValues: HelmChartValues = {toArguments: (): string[] => []} as unknown as HelmChartValues;

  let installChartStub: SinonStub;
  let helm: HelmClient;

  const buildStore: () => CacheCatalogStore = (): CacheCatalogStore =>
    ({resolvePath: (): string => cachedArchivePath}) as unknown as CacheCatalogStore;

  const buildManager: (inspector: CacheHealthInspector) => ChartManager = (
    inspector: CacheHealthInspector,
  ): ChartManager => {
    const manager: ChartManager = new ChartManager(helm, logger, buildStore(), inspector);
    // Short-circuit isChartInstalled so install() always reaches the install branch.
    sinon.stub(manager, 'getInstalledRelease').resolves();
    return manager;
  };

  const runInstall: (manager: ChartManager) => Promise<InstallChartOptions> = async (
    manager: ChartManager,
  ): Promise<InstallChartOptions> => {
    await manager.install(
      undefined as unknown as NamespaceName,
      'release-name',
      chartName,
      repositoryUrl,
      chartVersion,
      chartValues,
      'kube-context',
    );
    expect(installChartStub).to.have.been.calledOnce;
    return installChartStub.firstCall.args[2] as InstallChartOptions;
  };

  beforeEach((): void => {
    installChartStub = sinon.stub().resolves();
    helm = {installChart: installChartStub} as unknown as HelmClient;
  });

  it('installs from the cached tarball path and omits --version when a cache hit exists', async (): Promise<void> => {
    const options: InstallChartOptions = await runInstall(buildManager(inspectorReturning(true)));

    const chart: Chart = installChartStub.firstCall.args[1] as Chart;
    expect(chart.name).to.equal(cachedArchivePath);
    expect(chart.repoName).to.be.undefined;
    // `helm install` rejects --version for a local chart, so it must not be set.
    expect(options.version).to.be.undefined;
  });

  it('installs from the remote repo with --version when the chart is not cached', async (): Promise<void> => {
    const options: InstallChartOptions = await runInstall(buildManager(inspectorReturning(false)));

    const chart: Chart = installChartStub.firstCall.args[1] as Chart;
    expect(chart.name).to.equal(chartName);
    expect(chart.repoName).to.equal(repositoryUrl);
    expect(options.version).to.equal(chartVersion);
  });
});

describe('ChartManager installed-release lookup', (): void => {
  const logger: SoloLogger = {
    debug: (): void => undefined,
    showUserError: (): void => undefined,
  } as unknown as SoloLogger;

  const releases: ReleaseItem[] = [
    new ReleaseItem('prometheus', 'solo-setup', '1', '', 'deployed', 'kube-prometheus-stack-52.0.1', 'v0.68.0'),
    new ReleaseItem('metrics-server', 'kube-system', '1', '', 'deployed', 'metrics-server-3.13.1', '0.8.1'),
  ];

  const buildManager: () => ChartManager = (): ChartManager => {
    const helm: HelmClient = {listReleases: sinon.stub().resolves(releases)} as unknown as HelmClient;
    return new ChartManager(
      helm,
      logger,
      undefined as unknown as CacheCatalogStore,
      undefined as unknown as CacheHealthInspector,
    );
  };

  it('returns the release matching the release name with its chart version', async (): Promise<void> => {
    const release: ReleaseItem | undefined = await buildManager().getInstalledRelease(
      undefined as unknown as NamespaceName,
      'prometheus',
    );
    expect(release?.chart).to.equal('kube-prometheus-stack-52.0.1');
    expect(release?.namespace).to.equal('solo-setup');
  });

  it('returns undefined when the release is not installed', async (): Promise<void> => {
    const release: ReleaseItem | undefined = await buildManager().getInstalledRelease(
      undefined as unknown as NamespaceName,
      'absent-release',
    );
    expect(release).to.be.undefined;
  });

  it('keeps isChartInstalled consistent with the release lookup', async (): Promise<void> => {
    const manager: ChartManager = buildManager();
    expect(await manager.isChartInstalled(undefined as unknown as NamespaceName, 'prometheus')).to.be.true;
    expect(await manager.isChartInstalled(undefined as unknown as NamespaceName, 'absent-release')).to.be.false;
  });
});
