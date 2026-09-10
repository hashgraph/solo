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
import {parse} from 'yaml';
import * as constants from '../../../core/constants.js';
import {ImageReference, type ParsedImageReference} from '../../../business/utils/image-reference.js';

interface KindClusterConfig {
  containerdConfigPatches?: string[];
}

export class ImageCacheHandler implements CacheOperationHandler {
  private static readonly DOCKER_HUB_REGISTRY: string = 'docker.io';
  private static readonly DOCKER_HUB_DIRECT_REGISTRY: string = 'registry-1.docker.io';
  private static readonly KIND_DOCKER_REGISTRY_MIRRORS_ENVIRONMENT_VARIABLE: string = 'KIND_DOCKER_REGISTRY_MIRRORS';
  private static readonly DEFAULT_DOCKER_HUB_MIRROR_REGISTRY: string = 'hub.mirror.docker.lat.ope.eng.hashgraph.io';
  private static readonly RATE_LIMIT_ERROR_PATTERN: RegExp =
    /toomanyrequests|too many requests|rate limit|429 Too Many Requests/i;

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

  public async pull(): Promise<SoloListrTask<AnyListrContext>[]> {
    const subTasks: SoloListrTask<AnyListrContext>[] = [];
    const targets: readonly CacheTarget[] = await this.resolveRequiredArtifacts();

    for (const target of targets) {
      subTasks.push({
        title: `Caching ${target.name}:${target.version}`,
        task: async ({config}, task): Promise<void> => {
          const image: string = `${target.name}:${target.version}`;
          const archivePath: string = this.store.resolvePath(target, CacheArtifactEnum.IMAGE);

          const archiveExists: boolean = await this.inspector.exists(archivePath);

          if (!archiveExists) {
            try {
              await this.saveImage(image, archivePath);
            } catch (error) {
              const message: string = ImageCacheHandler.getErrorMessage(error);
              if (ImageCacheHandler.isRateLimitError(error)) {
                task.title += ' - ' + chalk.red(`Docker Hub rate limit reached for image: ${image}`);
                this.logger.showUser(`Docker Hub rate limit reached for image: ${image}. ${message}`);
                this.logger.error('Docker Hub rate limit reached:', error);
                throw error;
              }
              task.title += ' - ' + chalk.red(`failed to SAVE image: ${image}`);
              this.logger.showUser(`Failed to save image archive: ${image}. ${message}`);
              this.logger.error('Failed to save image archive:', error);
              this.recordFailure(`Failed to cache ${image}: ${message}`);
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

  // Non-generic

  public async pullKindNodeImageIfMissing(): Promise<void> {
    const item: CachedItem = await this.resolveExpectedCachedItems().then(
      (items: readonly CachedItem[]): CachedItem => items[0],
    );
    const image: string = `${item.target.name}:${item.target.version}`;

    const exists: boolean = await this.inspector.exists(item.localPath);
    if (!exists) {
      await this.engine.saveImage(image, item.localPath);
    }
  }

  public async loadKindNodeImageIntoEngine(): Promise<void> {
    const item: CachedItem = await this.resolveExpectedCachedItems().then(
      (items: readonly CachedItem[]): CachedItem => items[0],
    );

    const exists: boolean = await this.inspector.exists(item.localPath);
    if (exists) {
      await this.engine.loadImage(item.localPath);
    }
  }

  private async saveImage(image: string, archivePath: string): Promise<void> {
    const imageCandidates: readonly string[] = await ImageCacheHandler.resolveImageCandidates(image);
    let lastError: unknown;
    let rateLimitError: unknown;

    for (const imageCandidate of imageCandidates) {
      try {
        await this.engine.saveImageArchive(imageCandidate, archivePath);
        if (imageCandidate !== image) {
          this.logger.info(`Saved image archive for ${image} using mirror image ${imageCandidate}`);
        }
        return;
      } catch (error) {
        lastError = error;
        if (ImageCacheHandler.isRateLimitError(error)) {
          rateLimitError = error;
        }
        const message: string = ImageCacheHandler.getErrorMessage(error);
        this.logger.warn(`Failed to save image archive candidate ${imageCandidate}: ${message}`);
      }
    }

    if (rateLimitError) {
      throw rateLimitError;
    }

    throw lastError instanceof Error ? lastError : new Error(`Failed to save image archive: ${image}`);
  }

  private static async resolveImageCandidates(image: string): Promise<readonly string[]> {
    const parsed: ParsedImageReference = ImageReference.parseImageReference(image);

    if (!ImageCacheHandler.isDockerHubRegistry(parsed.registry)) {
      return [image];
    }

    const registries: string[] = [
      ...(await ImageCacheHandler.resolveDockerHubMirrorRegistries()),
      ImageCacheHandler.DOCKER_HUB_REGISTRY,
      ImageCacheHandler.DOCKER_HUB_DIRECT_REGISTRY,
    ];

    const candidates: string[] = [];
    const seen: Set<string> = new Set<string>();

    for (const registry of registries) {
      const candidate: string = `${registry}/${parsed.repository}:${parsed.tag}`;
      if (!seen.has(candidate)) {
        seen.add(candidate);
        candidates.push(candidate);
      }
    }

    return candidates;
  }

  private static async resolveDockerHubMirrorRegistries(): Promise<readonly string[]> {
    const mirrorRegistriesFromEnvironment: string | undefined = constants.getEnvironmentVariable(
      ImageCacheHandler.KIND_DOCKER_REGISTRY_MIRRORS_ENVIRONMENT_VARIABLE,
    );

    const registries: readonly string[] =
      mirrorRegistriesFromEnvironment && mirrorRegistriesFromEnvironment.trim().length > 0
        ? mirrorRegistriesFromEnvironment.split(',')
        : await ImageCacheHandler.resolveDockerHubMirrorRegistriesFromKindConfig();

    const normalized: readonly string[] = ImageCacheHandler.normalizeMirrorRegistries(registries);
    return normalized.length > 0 ? normalized : [ImageCacheHandler.DEFAULT_DOCKER_HUB_MIRROR_REGISTRY];
  }

  private static async resolveDockerHubMirrorRegistriesFromKindConfig(): Promise<readonly string[]> {
    try {
      const raw: string = await fs.readFile(constants.KIND_CLUSTER_CONFIG_FILE, 'utf8');
      const parsed: KindClusterConfig = parse(raw) as KindClusterConfig;
      const patches: readonly string[] = parsed.containerdConfigPatches ?? [];
      const registries: string[] = [];

      for (const patch of patches) {
        const endpointMatches: IterableIterator<RegExpMatchArray> = patch.matchAll(
          /\[plugins\."io\.containerd\.grpc\.v1\.cri"\.registry\.mirrors\."(?:docker\.io|registry-1\.docker\.io)"\]\s*endpoint\s*=\s*\[([^\]]*)\]/g,
        );

        for (const endpointMatch of endpointMatches) {
          const endpoints: string = endpointMatch[1];
          const registryMatches: IterableIterator<RegExpMatchArray> = endpoints.matchAll(/"([^"]+)"/g);

          for (const registryMatch of registryMatches) {
            registries.push(registryMatch[1]);
          }
        }
      }

      return registries;
    } catch {
      // best-effort: fall back to empty list when kind-config.yaml is absent or unparseable
      return [];
    }
  }

  private static normalizeMirrorRegistries(registries: readonly string[]): readonly string[] {
    const result: string[] = [];
    const seen: Set<string> = new Set<string>();

    for (const registry of registries) {
      const normalizedRegistry: string = registry
        .trim()
        .replace(/^https?:\/\//, '')
        .replace(/\/$/, '');

      if (
        normalizedRegistry.length === 0 ||
        ImageCacheHandler.isDockerHubRegistry(normalizedRegistry) ||
        seen.has(normalizedRegistry)
      ) {
        continue;
      }

      seen.add(normalizedRegistry);
      result.push(normalizedRegistry);
    }

    return result;
  }

  private static isDockerHubRegistry(registry: string): boolean {
    return (
      registry === ImageCacheHandler.DOCKER_HUB_REGISTRY || registry === ImageCacheHandler.DOCKER_HUB_DIRECT_REGISTRY
    );
  }

  private static isRateLimitError(error: unknown): boolean {
    let current: unknown = error;
    let depth: number = 0;

    while (current && depth < 10) {
      if (ImageCacheHandler.RATE_LIMIT_ERROR_PATTERN.test(ImageCacheHandler.getErrorMessage(current))) {
        return true;
      }

      current = (current as {cause?: unknown}).cause;
      depth += 1;
    }

    return false;
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
