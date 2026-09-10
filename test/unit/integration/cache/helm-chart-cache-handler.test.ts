// SPDX-License-Identifier: Apache-2.0

import 'sinon-chai';

import {expect} from 'chai';
import sinon, {type SinonStub} from 'sinon';
import {afterEach, beforeEach, describe, it} from 'mocha';
import fs from 'node:fs/promises';
import {type Stats} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {HelmChartCacheHandler} from '../../../../src/integration/cache/impl/helm-chart-cache-handler.js';
import {StaticCacheTargetProvider} from '../../../../src/integration/cache/target-providers/static-cache-target-provider.js';
import {CacheArtifactEnum} from '../../../../src/integration/cache/enums/cache-artifact-enum.js';
import {CacheTarget} from '../../../../src/integration/cache/models/impl/cache-target.js';
import {type CacheTargetStructure} from '../../../../src/integration/cache/models/cache-target-structure.js';
import {type CacheCatalogStore} from '../../../../src/integration/cache/api/cache-catalog-store.js';
import {type CacheHealthInspector} from '../../../../src/integration/cache/api/cache-health-inspector.js';
import {type SoloLogger} from '../../../../src/core/logging/solo-logger.js';
import {type HelmClient} from '../../../../src/integration/helm/helm-client.js';
import {type Chart} from '../../../../src/integration/helm/model/chart.js';
import {type SoloListrTask} from '../../../../src/types/index.js';
import {type AnyListrContext} from '../../../../src/types/aliases.js';

describe('HelmChartCacheHandler pull', (): void => {
  let chartsDirectory: string;
  let pullStub: SinonStub;
  let helm: HelmClient;

  const logger: SoloLogger = {
    debug: (): void => undefined,
    warn: (): void => undefined,
    showUser: (): void => undefined,
    error: (): void => undefined,
  } as unknown as SoloLogger;

  const missingInspector: CacheHealthInspector = {
    exists: async (): Promise<boolean> => false,
    getSize: async (): Promise<number> => 0,
    filterExisting: async (paths: readonly string[]): Promise<readonly string[]> => paths,
  };

  const presentInspector: CacheHealthInspector = {
    exists: async (): Promise<boolean> => true,
    getSize: async (): Promise<number> => 0,
    filterExisting: async (paths: readonly string[]): Promise<readonly string[]> => paths,
  };

  const buildStore: () => CacheCatalogStore = (): CacheCatalogStore =>
    ({
      save: async (): Promise<void> => undefined,
      load: async (): Promise<never> => ({items: []}) as never,
      exists: async (): Promise<boolean> => true,
      clear: async (): Promise<void> => undefined,
      resolvePath: (target: CacheTargetStructure): string =>
        path.join(chartsDirectory, `${target.name}__${target.version}.tar`),
    }) as CacheCatalogStore;

  beforeEach(async (): Promise<void> => {
    chartsDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'solo-chart-cache-'));
    pullStub = sinon
      .stub()
      .callsFake(async (chart: Chart, chartVersion: string, destinationDirectory: string): Promise<void> => {
        await fs.writeFile(
          path.join(destinationDirectory, `${chart.unqualified() || 'chart'}-${chartVersion}.tgz`),
          'x',
        );
      });
    helm = {pullChartPackage: pullStub} as unknown as HelmClient;
  });

  afterEach(async (): Promise<void> => {
    await fs.rm(chartsDirectory, {recursive: true, force: true});
  });

  it('pulls a classic-repo chart with --repo and stores it at the canonical path', async (): Promise<void> => {
    const target: CacheTarget = new CacheTarget(
      CacheArtifactEnum.HELM_CHART,
      'mychart',
      '1.2.3',
      'https://example.com/charts',
    );
    const provider: StaticCacheTargetProvider = new StaticCacheTargetProvider([target]);
    const handler: HelmChartCacheHandler = new HelmChartCacheHandler(
      helm,
      provider,
      buildStore(),
      missingInspector,
      logger,
    );

    const subtasks: readonly SoloListrTask<AnyListrContext>[] = await handler.pull();
    expect(subtasks).to.have.lengthOf(1);

    const context: {config: {results: unknown[]}} = {config: {results: []}};
    await subtasks[0].task(context as never, {title: 'task'} as never);

    expect(pullStub).to.have.been.calledOnce;
    const chartArgument: Chart = pullStub.firstCall.args[0] as Chart;
    const versionArgument: string = pullStub.firstCall.args[1] as string;
    const repositoryArgument: string | undefined = pullStub.firstCall.args[3] as string | undefined;
    expect(chartArgument.qualified()).to.equal('mychart');
    expect(versionArgument).to.equal('1.2.3');
    expect(repositoryArgument).to.equal('https://example.com/charts');
    expect(context.config.results).to.have.lengthOf(1);

    const stats: Stats = await fs.stat(path.join(chartsDirectory, 'mychart__1.2.3.tar'));
    expect(stats.isFile()).to.be.true;
  });

  it('pulls an OCI chart via its reference without --repo', async (): Promise<void> => {
    const target: CacheTarget = new CacheTarget(
      CacheArtifactEnum.HELM_CHART,
      'block-node-server',
      '0.36.0',
      'oci://ghcr.io/hiero-ledger/hiero-block-node',
    );
    const provider: StaticCacheTargetProvider = new StaticCacheTargetProvider([target]);
    const handler: HelmChartCacheHandler = new HelmChartCacheHandler(
      helm,
      provider,
      buildStore(),
      missingInspector,
      logger,
    );

    const subtasks: readonly SoloListrTask<AnyListrContext>[] = await handler.pull();
    const context: {config: {results: unknown[]}} = {config: {results: []}};
    await subtasks[0].task(context as never, {title: 'task'} as never);

    expect(pullStub).to.have.been.calledOnce;
    const chartArgument: Chart = pullStub.firstCall.args[0] as Chart;
    const repositoryArgument: string | undefined = pullStub.firstCall.args[3] as string | undefined;
    expect(chartArgument.qualified()).to.equal('oci://ghcr.io/hiero-ledger/hiero-block-node/block-node-server');
    expect(repositoryArgument).to.be.undefined;

    const stats: Stats = await fs.stat(path.join(chartsDirectory, 'block-node-server__0.36.0.tar'));
    expect(stats.isFile()).to.be.true;
  });

  it('skips pulling when the chart archive already exists', async (): Promise<void> => {
    const target: CacheTarget = new CacheTarget(
      CacheArtifactEnum.HELM_CHART,
      'mychart',
      '1.2.3',
      'https://example.com/charts',
    );
    const provider: StaticCacheTargetProvider = new StaticCacheTargetProvider([target]);
    const handler: HelmChartCacheHandler = new HelmChartCacheHandler(
      helm,
      provider,
      buildStore(),
      presentInspector,
      logger,
    );

    const subtasks: readonly SoloListrTask<AnyListrContext>[] = await handler.pull();
    const context: {config: {results: unknown[]}} = {config: {results: []}};
    await subtasks[0].task(context as never, {title: 'task'} as never);

    expect(pullStub).to.not.have.been.called;
    expect(context.config.results).to.have.lengthOf(1);
  });
});
