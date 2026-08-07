// SPDX-License-Identifier: Apache-2.0

import {inject} from 'tsyringe-neo';
import {InjectTokens} from '../../../core/dependency-injection/inject-tokens.js';
import {patchInject} from '../../../core/dependency-injection/container-helper.js';
import fs from 'node:fs/promises';
import {CacheArtifactEnum} from '../enums/cache-artifact-enum.js';
import {CachedItem} from '../models/impl/cached-item.js';
import {ArtifactHealthResult} from '../models/impl/artifact-health-result.js';
import {type CacheOperationHandler} from '../api/cache-operation-handler.js';
import {type ContainerEngineClient} from '../../container-engine/container-engine-client.js';
import {type CacheTargetProvider} from '../target-providers/cache-target-provider.js';
import {type CacheHealthInspector} from '../api/cache-health-inspector.js';
import {type CacheTarget} from '../models/impl/cache-target.js';
import {type SoloListrTask} from '../../../types/index.js';
import {type AnyListrContext} from '../../../types/aliases.js';
import chalk from 'chalk';
import {type SoloLogger} from '../../../core/logging/solo-logger.js';
import {type CacheCatalogStore} from '../api/cache-catalog-store.js';
import * as constants from '../../../core/constants.js';

export class ImageCacheHandler implements CacheOperationHandler {
  public constructor(
    private readonly engine: ContainerEngineClient,
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
    return CacheArtifactEnum.IMAGE;
  }

  public async resolveRequiredArtifacts(): Promise<readonly CacheTarget[]> {
    const targets: readonly CacheTarget[] = await this.provider.getRequiredTargets();
    return targets.filter((target): boolean => target.type === this.getType());
  }

  private async resolveExpectedCachedItems(): Promise<readonly CachedItem[]> {
    const targets: readonly CacheTarget[] = await this.resolveRequiredArtifacts();
    const now: string = new Date().toISOString();

    return targets.map((target): CachedItem => {
      const localPath: string = this.store.resolvePath(target, CacheArtifactEnum.IMAGE);
      return new CachedItem(target, localPath, now);
    });
  }

  /**
   * Populates the local image cache.
   *
   * Registry pulls have been removed: image archives are downloaded from the Solo CDN instead, which is
   * not implemented yet. Until then this reports that nothing was cached and leaves the cluster to pull
   * whatever it is missing directly from the registries.
   */
  public async pull(): Promise<SoloListrTask<AnyListrContext>[]> {
    return [
      {
        title: 'Download image archives',
        task: (_, task): void => {
          task.title += ' - ' + chalk.yellow('skipped, CDN downloads are not available yet');
          this.recordFailure(
            'No image archives were cached: registry pulls have been removed and CDN downloads are not available yet. ' +
              'The cluster will pull any missing image directly from its registry.',
          );
        },
      },
    ];
  }

  public async load(target: string): Promise<SoloListrTask<AnyListrContext>[]> {
    const items: readonly CachedItem[] = await this.resolveExpectedCachedItems();
    const loadedImages: ReadonlySet<string> = await this.resolveLoadedClusterImages(target);
    return items.map((item): SoloListrTask<AnyListrContext> => {
      const name: string = `${item.target.name}:${item.target.version}`;

      return {
        title: `Loading ${name} into ${target}`,
        task: async (_, task): Promise<void> => {
          if (loadedImages.has(name)) {
            task.title += ' - ' + chalk.green('already loaded, skipped');
            return;
          }

          if (!(await this.inspector.exists(item.localPath))) {
            // Not cached (surfaced by pull / `cache image status`); keep it visible but non-fatal.
            task.title += ' - ' + chalk.yellow('archive not cached, skipped');
            return;
          }

          try {
            await this.engine.loadImageArchiveIntoCluster(item.localPath, target);
          } catch (error) {
            // best-effort: skip archives that fail to load so the remaining images still load
            const message: string = ImageCacheHandler.getErrorMessage(error);
            task.title += ' - ' + chalk.red(`failed to load: ${name}`);
            this.logger.showUser(`Failed to load image into cluster: ${name}. ${message}`);
            this.logger.error('Failed to load image archive into cluster:', error);
            this.recordFailure(`Failed to load into cluster: ${name}: ${message}`);
          }
        },
      };
    });
  }

  private async resolveLoadedClusterImages(clusterName: string): Promise<ReadonlySet<string>> {
    try {
      const images: readonly string[] = await this.engine.listLoadedImagesInCluster(clusterName);
      return new Set<string>(images);
    } catch (error) {
      const message: string = ImageCacheHandler.getErrorMessage(error);
      this.logger.debug(`Unable to list images already loaded in cluster ${clusterName}: ${message}`);
      return new Set<string>();
    }
  }

  public async clear(): Promise<void> {
    const items: readonly CachedItem[] = await this.resolveExpectedCachedItems();

    for (const item of items) {
      await fs.rm(item.localPath, {force: true});
    }
  }

  public async healthcheck(): Promise<readonly ArtifactHealthResult[]> {
    const results: ArtifactHealthResult[] = [];

    const items: readonly CachedItem[] = await this.resolveExpectedCachedItems();

    for (const item of items) {
      const exists: boolean = await this.inspector.exists(item.localPath);
      const message: string = exists ? 'image archive exists' : 'image archive missing';

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

  // Records a failure into a shared message group so pull/load can present a single end-of-run
  // summary of what did not make it into the cache or the cluster, without aborting the run.
  private recordFailure(message: string): void {
    const key: string = constants.CACHE_IMAGE_FAILURE_MESSAGE_GROUP;
    if (!this.logger.getMessageGroupKeys().includes(key)) {
      this.logger.addMessageGroup(key, 'Image cache failures');
    }
    this.logger.addMessageGroupMessage(key, message);
  }

  private static getErrorMessage(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }

    return String(error);
  }
}
