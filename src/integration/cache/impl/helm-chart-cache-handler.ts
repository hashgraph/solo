// SPDX-License-Identifier: Apache-2.0

import {inject} from 'tsyringe-neo';
import fs from 'node:fs/promises';
import path from 'node:path';
import chalk from 'chalk';
import {InjectTokens} from '../../../core/dependency-injection/inject-tokens.js';
import {patchInject} from '../../../core/dependency-injection/container-helper.js';
import {CacheArtifactEnum} from '../enums/cache-artifact-enum.js';
import {CachedItem} from '../models/impl/cached-item.js';
import {ArtifactHealthResult} from '../models/impl/artifact-health-result.js';
import {HelmChartPullNoArchiveSoloError} from '../../../core/errors/classes/system/helm-chart-pull-no-archive-solo-error.js';
import {PathEx} from '../../../business/utils/path-ex.js';
import {Chart} from '../../helm/model/chart.js';
import {type CacheOperationHandler} from '../api/cache-operation-handler.js';
import {type HelmClient} from '../../helm/helm-client.js';
import {type CacheTargetProvider} from '../target-providers/cache-target-provider.js';
import {type CacheHealthInspector} from '../api/cache-health-inspector.js';
import {type CacheCatalogStore} from '../api/cache-catalog-store.js';
import {type CacheTarget} from '../models/impl/cache-target.js';
import {type SoloListrTask} from '../../../types/index.js';
import {type AnyListrContext} from '../../../types/aliases.js';
import {type SoloLogger} from '../../../core/logging/solo-logger.js';

/**
 * Cache handler for Helm charts.
 *
 * `pull()` downloads each chart tarball into the local cache using `helm pull` (classic repositories
 * via `--repo`, OCI charts via their `oci://` reference). Unlike container images, charts are not
 * loaded into a cluster — they are consumed by the local Helm CLI at install time (see `ChartManager`),
 * so `load()` only verifies that the expected archives are present.
 */
export class HelmChartCacheHandler implements CacheOperationHandler {
  public constructor(
    private readonly helm: HelmClient,
    private readonly provider: CacheTargetProvider,
    @inject(InjectTokens.CacheCatalogStore) public readonly store?: CacheCatalogStore,
    @inject(InjectTokens.CacheHealthInspector) private readonly inspector?: CacheHealthInspector,
    @inject(InjectTokens.SoloLogger) private readonly logger?: SoloLogger,
  ) {
    this.store = patchInject(store, InjectTokens.CacheCatalogStore, this.constructor.name);
    this.inspector = patchInject(inspector, InjectTokens.CacheHealthInspector, this.constructor.name);
    this.logger = patchInject(logger, InjectTokens.SoloLogger, this.constructor.name);
  }

  public getType(): CacheArtifactEnum {
    return CacheArtifactEnum.HELM_CHART;
  }

  public async resolveRequiredArtifacts(): Promise<readonly CacheTarget[]> {
    const targets: readonly CacheTarget[] = await this.provider.getRequiredTargets();
    return targets.filter((target): boolean => target.type === this.getType());
  }

  private async resolveExpectedCachedItems(): Promise<readonly CachedItem[]> {
    const targets: readonly CacheTarget[] = await this.resolveRequiredArtifacts();
    const now: string = new Date().toISOString();

    return targets.map((target): CachedItem => {
      const localPath: string = this.store.resolvePath(target, CacheArtifactEnum.HELM_CHART);
      return new CachedItem(target, localPath, now);
    });
  }

  public async pull(): Promise<SoloListrTask<AnyListrContext>[]> {
    const subTasks: SoloListrTask<AnyListrContext>[] = [];
    const targets: readonly CacheTarget[] = await this.resolveRequiredArtifacts();

    for (const target of targets) {
      subTasks.push({
        title: `Caching chart ${HelmChartCacheHandler.describe(target)}`,
        task: async ({config}, task): Promise<void> => {
          const archivePath: string = this.store.resolvePath(target, CacheArtifactEnum.HELM_CHART);

          const archiveExists: boolean = await this.inspector.exists(archivePath);

          if (!archiveExists) {
            try {
              await this.pullChartToArchive(target, archivePath);
            } catch (error) {
              const message: string = error instanceof Error ? error.message : String(error);
              task.title += ' - ' + chalk.red(`failed to pull chart: ${HelmChartCacheHandler.describe(target)}`);
              this.logger.showUser(`Failed to pull chart: ${HelmChartCacheHandler.describe(target)}. ${message}`);
              this.logger.error('Failed to pull chart archive:', error);
              return;
            }
          }

          config.results.push(new CachedItem(target, archivePath, new Date().toISOString()));
        },
      });
    }

    return subTasks;
  }

  public async load(target: string): Promise<SoloListrTask<AnyListrContext>[]> {
    // Helm charts are consumed locally by the Helm CLI at install time, not loaded into a cluster
    // like container images. This only verifies the cached archives are present for the given target.
    this.logger.debug(
      `chart cache load requested for '${target}'; charts are consumed locally by helm at install time`,
    );

    const items: readonly CachedItem[] = await this.resolveExpectedCachedItems();
    const subTasks: SoloListrTask<AnyListrContext>[] = [];

    for (const item of items) {
      subTasks.push({
        title: `Verifying cached chart ${HelmChartCacheHandler.describe(item.target)}`,
        task: async (): Promise<void> => {
          const exists: boolean = await this.inspector.exists(item.localPath);
          if (!exists) {
            this.logger.warn(`Cached chart archive missing: ${item.localPath}`);
          }
        },
      });
    }

    return subTasks;
  }

  public async clear(): Promise<void> {
    const items: readonly CachedItem[] = await this.resolveExpectedCachedItems();

    for (const item of items) {
      await fs.rm(item.localPath, {force: true});
    }
  }

  public async prune(): Promise<void> {
    const targets: readonly CacheTarget[] = await this.resolveRequiredArtifacts();
    if (targets.length === 0) {
      return;
    }

    // Delete only the charts directory so pruning charts does not remove cached images.
    const chartsDirectory: string = path.dirname(this.store.resolvePath(targets[0], CacheArtifactEnum.HELM_CHART));
    await fs.rm(chartsDirectory, {recursive: true, force: true});
  }

  public async healthcheck(): Promise<readonly ArtifactHealthResult[]> {
    const results: ArtifactHealthResult[] = [];

    const items: readonly CachedItem[] = await this.resolveExpectedCachedItems();

    for (const item of items) {
      const exists: boolean = await this.inspector.exists(item.localPath);
      const message: string = exists ? 'chart archive exists' : 'chart archive missing';

      results.push(new ArtifactHealthResult(item.target, exists, message));
    }

    return results;
  }

  public async list(): Promise<readonly CachedItem[]> {
    const items: readonly CachedItem[] = await this.resolveExpectedCachedItems();
    const existingItems: CachedItem[] = [];

    for (const item of items) {
      if (await this.inspector.exists(item.localPath)) {
        existingItems.push(item);
      }
    }

    return existingItems;
  }

  private async pullChartToArchive(target: CacheTarget, archivePath: string): Promise<void> {
    const chartsDirectory: string = path.dirname(archivePath);
    await fs.mkdir(chartsDirectory, {recursive: true});

    const before: ReadonlySet<string> = new Set(await this.listChartTarballs(chartsDirectory));

    const isOci: boolean = target.source?.startsWith('oci://') ?? false;
    const chart: Chart = isOci ? new Chart(target.name, target.source) : new Chart(target.name);
    const repositoryUrl: string | undefined = isOci ? undefined : target.source;

    await this.helm.pullChartPackage(chart, target.version, chartsDirectory, repositoryUrl);

    // `helm pull` names the tarball itself (`<chart>-<version>.tgz`); identify it by diffing the
    // directory so the result is robust to OCI references and version ranges, then move it to the
    // canonical cache path that `resolvePath` (and chart consumption in ChartManager) expects.
    const currentTarballs: string[] = await this.listChartTarballs(chartsDirectory);
    const produced: string | undefined = currentTarballs.find((file): boolean => !before.has(file));

    if (!produced) {
      throw new HelmChartPullNoArchiveSoloError(HelmChartCacheHandler.describe(target));
    }

    await fs.rename(PathEx.join(chartsDirectory, produced), archivePath);
  }

  private async listChartTarballs(directory: string): Promise<string[]> {
    try {
      const entries: string[] = await fs.readdir(directory);
      return entries.filter((entry): boolean => entry.endsWith('.tgz'));
    } catch {
      // best-effort: the charts directory may not exist yet on the first pull
      return [];
    }
  }

  private static describe(target: CacheTarget): string {
    return `${target.name || target.source}:${target.version}`;
  }
}
