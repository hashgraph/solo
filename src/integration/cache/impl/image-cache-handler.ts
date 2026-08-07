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
import {PathEx} from '../../../business/utils/path-ex.js';
import {createHash, type Hash} from 'node:crypto';
import {createReadStream} from 'node:fs';
import {pipeline as streamPipeline} from 'node:stream/promises';
import {type PackageDownloader} from '../../../core/package-downloader.js';
import {CacheManifestClient} from './cache-manifest-client.js';
import {type CacheManifestImage} from '../models/impl/cache-manifest-image.js';

export class ImageCacheHandler implements CacheOperationHandler {
  /** Extension of the file holding an archive's published hash, stored next to the archive. */
  private static readonly HASH_FILE_EXTENSION: string = '.sha256';

  public constructor(
    private readonly engine: ContainerEngineClient,
    private readonly provider: CacheTargetProvider,
    @inject(InjectTokens.CacheCatalogStore) public readonly store?: CacheCatalogStore,
    @inject(InjectTokens.CacheHealthInspector) private readonly inspector?: CacheHealthInspector,
    @inject(InjectTokens.SoloLogger) private readonly logger?: SoloLogger,
    @inject(InjectTokens.PackageDownloader) private readonly downloader?: PackageDownloader,
  ) {
    this.store = patchInject(store, InjectTokens.CacheCatalogStore, this.constructor.name);
    this.inspector = patchInject(inspector, InjectTokens.CacheHealthInspector, this.constructor.name);
    this.logger = patchInject(logger, InjectTokens.SoloLogger, this.constructor.name);
    this.downloader = patchInject(downloader, InjectTokens.PackageDownloader, this.constructor.name);
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
   * Populates the local image cache from the Solo CDN.
   *
   * This is the only path that writes into the local image cache. Each required image is looked up in the
   * manifest published for the running Solo version; its archive and the archive's hash file are downloaded
   * from the CDN and the archive is accepted only when its computed SHA-256, the manifest hash, and the
   * published hash file all agree.
   *
   * Nothing here aborts the run: an image that cannot be cached is reported in the end-of-run summary and
   * left for the cluster to pull from its registry.
   */
  public async pull(): Promise<SoloListrTask<AnyListrContext>[]> {
    const targets: readonly CacheTarget[] = await this.resolveRequiredArtifacts();

    let manifestImages: ReadonlyMap<string, CacheManifestImage>;
    try {
      const images: readonly CacheManifestImage[] = await CacheManifestClient.fetchImages();
      manifestImages = new Map<string, CacheManifestImage>(
        images.map((image): [string, CacheManifestImage] => [image.image, image]),
      );
    } catch (error) {
      const message: string = ImageCacheHandler.getErrorMessage(error);
      this.logger.error('Failed to read the image cache manifest:', error);

      return [
        {
          title: 'Download image archives',
          task: (_, task): void => {
            task.title += ' - ' + chalk.yellow('skipped, no image cache manifest available');
            this.recordFailure(
              `No image archives were cached: ${message}. The cluster will pull any missing image directly from its registry.`,
            );
          },
        },
      ];
    }

    return targets.map((target): SoloListrTask<AnyListrContext> => {
      const reference: string = `${target.name}:${target.version}`;

      return {
        title: `Caching ${reference}`,
        task: async ({config}, task): Promise<void> => {
          const manifestImage: CacheManifestImage | undefined = manifestImages.get(reference);

          if (!manifestImage) {
            task.title += ' - ' + chalk.yellow('not in the manifest, skipped');
            this.recordFailure(
              `${reference} is not listed in the image cache manifest and was not cached; the cluster will pull it directly.`,
            );
            return;
          }

          const archivePath: string = this.store.resolvePath(target, CacheArtifactEnum.IMAGE);

          const cached: boolean = (await this.inspector.exists(archivePath))
            ? await this.verifyCachedArchive(reference, archivePath, manifestImage, task)
            : await this.downloadArchive(reference, archivePath, manifestImage, task);

          if (cached) {
            config.results.push(new CachedItem(target, archivePath, new Date().toISOString()));
          }
        },
      };
    });
  }

  /**
   * Rehashes an archive that is already in the cache. A match skips the download; a mismatch discards the
   * archive so the next pull downloads it again.
   */
  private async verifyCachedArchive(
    reference: string,
    archivePath: string,
    manifestImage: CacheManifestImage,
    task: {title: string},
  ): Promise<boolean> {
    const computed: string = await ImageCacheHandler.computeSha256(archivePath);

    if (computed === manifestImage.sha256) {
      task.title += ' - ' + chalk.green('already cached, hash verified');
      return true;
    }

    await this.discardArchive(archivePath);
    task.title += ' - ' + chalk.red('cached archive failed hash check, discarded');
    this.logger.warn(
      `Cached archive for ${reference} does not match the manifest hash and was deleted; the next \`solo cache image pull\` will download it again.`,
    );
    this.recordFailure(
      `${reference}: cached archive hash ${computed} does not match the manifest hash ${manifestImage.sha256}; the archive was deleted and will be downloaded on the next pull.`,
    );
    return false;
  }

  /**
   * Downloads an archive and its published hash file, then accepts the archive only when the manifest hash,
   * the published hash file and the archive's own SHA-256 all agree. Anything else discards the download.
   */
  private async downloadArchive(
    reference: string,
    archivePath: string,
    manifestImage: CacheManifestImage,
    task: {title: string},
  ): Promise<boolean> {
    const hashPath: string = `${archivePath}${ImageCacheHandler.HASH_FILE_EXTENSION}`;

    try {
      await fs.mkdir(PathEx.dirname(archivePath), {recursive: true});

      await this.downloader.fetchFile(manifestImage.hashUrl, hashPath);

      const publishedHash: string = await ImageCacheHandler.readPublishedHash(hashPath);

      // Checked before the (large) archive download: if the two published hashes disagree there is no value
      // that could be trusted to verify the archive against.
      if (publishedHash !== manifestImage.sha256) {
        await this.discardArchive(archivePath);
        task.title += ' - ' + chalk.red('manifest and published hash disagree, skipped');
        this.logger.warn(
          `Manifest hash and ${manifestImage.hashFile} disagree for ${reference}; the archive was not downloaded.`,
        );
        this.recordFailure(
          `${reference}: manifest hash ${manifestImage.sha256} does not match the published hash ${publishedHash}; the archive was not cached.`,
        );
        return false;
      }

      await this.downloader.fetchFile(manifestImage.tarUrl, archivePath);

      const computed: string = await ImageCacheHandler.computeSha256(archivePath);

      if (computed !== manifestImage.sha256) {
        await this.discardArchive(archivePath);
        task.title += ' - ' + chalk.red('downloaded archive failed hash check, discarded');
        this.logger.warn(
          `Downloaded archive for ${reference} does not match its expected hash and was deleted; the next \`solo cache image pull\` will download it again.`,
        );
        this.recordFailure(
          `${reference}: downloaded archive hash ${computed} does not match the expected hash ${manifestImage.sha256}; the archive was deleted and will be downloaded on the next pull.`,
        );
        return false;
      }

      task.title += ' - ' + chalk.green('downloaded and hash verified');
      return true;
    } catch (error) {
      // best-effort: a download that fails leaves the image to the cluster rather than aborting the pull.
      await this.discardArchive(archivePath);
      const message: string = ImageCacheHandler.getErrorMessage(error);
      task.title += ' - ' + chalk.red('download failed');
      this.logger.error(`Failed to download the image archive for ${reference}:`, error);
      this.recordFailure(`Failed to cache ${reference}: ${message}`);
      return false;
    }
  }

  /** Removes an archive and its hash file so the next pull starts from a clean slate. */
  private async discardArchive(archivePath: string): Promise<void> {
    await fs.rm(archivePath, {force: true});
    await fs.rm(`${archivePath}${ImageCacheHandler.HASH_FILE_EXTENSION}`, {force: true});
  }

  /**
   * Reads the hash out of a published hash file. Both a bare digest and the `sha256sum` output format
   * (`<digest>  <filename>`) are accepted.
   */
  private static async readPublishedHash(hashPath: string): Promise<string> {
    const contents: string = await fs.readFile(hashPath, 'utf8');

    return contents.trim().split(/\s+/, 1)[0].toLowerCase();
  }

  private static async computeSha256(filePath: string): Promise<string> {
    const hash: Hash = createHash('sha256');

    await streamPipeline(createReadStream(filePath), hash);

    return hash.digest('hex');
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
      await this.discardArchive(item.localPath);
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
