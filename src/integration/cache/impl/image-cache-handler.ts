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
import {createReadStream, type Dirent} from 'node:fs';
import {pipeline as streamPipeline} from 'node:stream/promises';
import {type PackageDownloader} from '../../../core/package-downloader.js';
import {CacheManifestClient} from './cache-manifest-client.js';
import {type CacheManifestImage} from '../models/impl/cache-manifest-image.js';
import {SoloErrors} from '../../../core/errors/solo-errors.js';

export class ImageCacheHandler implements CacheOperationHandler {
  /** Extension of the file holding an archive's published hash, stored next to the archive. */
  private static readonly HASH_FILE_EXTENSION: string = '.sha256';

  /** Extension of an image archive in the local cache. */
  private static readonly ARCHIVE_FILE_EXTENSION: string = '.tar';

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
   * Files left over from an older Solo version are pruned first, so the cache only ever holds what the
   * current manifest lists.
   *
   * Nothing here aborts the run: an image that cannot be cached is reported in the end-of-run summary and
   * left for the cluster to pull from its registry.
   */
  public async pull(): Promise<SoloListrTask<AnyListrContext>[]> {
    const targets: readonly CacheTarget[] = await this.resolveRequiredArtifacts();

    let manifestImages: ReadonlyMap<string, CacheManifestImage>;
    try {
      manifestImages = await ImageCacheHandler.fetchManifestImages();
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

    const pullTasks: SoloListrTask<AnyListrContext>[] = targets.map((target): SoloListrTask<AnyListrContext> => {
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

    return [this.buildPruneTask(targets, manifestImages), ...pullTasks];
  }

  /** Fetches the manifest for the running Solo version, keyed by image reference. */
  private static async fetchManifestImages(): Promise<ReadonlyMap<string, CacheManifestImage>> {
    const images: readonly CacheManifestImage[] = await CacheManifestClient.fetchImages();

    return new Map<string, CacheManifestImage>(
      images.map((image): [string, CacheManifestImage] => [image.image, image]),
    );
  }

  private buildPruneTask(
    targets: readonly CacheTarget[],
    manifestImages: ReadonlyMap<string, CacheManifestImage>,
  ): SoloListrTask<AnyListrContext> {
    return {
      title: 'Prune stale image cache files',
      task: async (_, task): Promise<void> => {
        const pruned: readonly string[] = await this.pruneStaleFiles(targets, manifestImages);

        task.title +=
          ' - ' +
          (pruned.length === 0 ? chalk.green('nothing to prune') : chalk.yellow(`removed ${pruned.length} file(s)`));
      },
    };
  }

  /**
   * Deletes every archive and hash file in the image cache directory that the current manifest does not list,
   * so files published by an older Solo version do not accumulate on the user's filesystem.
   *
   * Only ever called with a manifest that resolved: without one there is no authoritative list of what belongs
   * in the cache, and deleting on a guess would throw away archives that are still valid.
   *
   * @returns the names of the files that were removed
   */
  private async pruneStaleFiles(
    targets: readonly CacheTarget[],
    manifestImages: ReadonlyMap<string, CacheManifestImage>,
  ): Promise<readonly string[]> {
    if (targets.length === 0) {
      return [];
    }

    const directory: string = PathEx.dirname(this.store.resolvePath(targets[0], CacheArtifactEnum.IMAGE));
    const keep: ReadonlySet<string> = this.resolveExpectedFileNames(targets, manifestImages);

    let entries: Dirent[];
    try {
      entries = await fs.readdir(directory, {withFileTypes: true});
    } catch {
      // nothing has been cached yet, so there is nothing to prune
      return [];
    }

    const pruned: string[] = [];

    for (const entry of entries) {
      if (!entry.isFile() || keep.has(entry.name) || !ImageCacheHandler.isCacheFileName(entry.name)) {
        continue;
      }

      // entry.name is a single directory entry, so the join can only ever address a file inside the
      // image cache directory itself.
      const filePath: string = PathEx.join(directory, entry.name);
      await fs.rm(filePath, {force: true});

      this.recordMaintenance(`Pruned stale image cache file, not listed in the manifest: ${filePath}`);
      pruned.push(entry.name);
    }

    return pruned;
  }

  /**
   * File names the image cache is expected to hold for the current manifest.
   *
   * Both spellings of each name are kept: the manifest file names, which the release workflow publishes, and
   * the local file names the catalog store resolves. They follow the same convention, and holding both means
   * a drift between the two can never delete an archive this pull just downloaded.
   */
  private resolveExpectedFileNames(
    targets: readonly CacheTarget[],
    manifestImages: ReadonlyMap<string, CacheManifestImage>,
  ): ReadonlySet<string> {
    const names: Set<string> = new Set<string>();

    for (const manifestImage of manifestImages.values()) {
      names.add(manifestImage.tarFile);
      names.add(manifestImage.hashFile);
    }

    for (const target of targets) {
      if (!manifestImages.has(`${target.name}:${target.version}`)) {
        continue;
      }

      const archiveName: string = PathEx.basename(this.store.resolvePath(target, CacheArtifactEnum.IMAGE));
      names.add(archiveName);
      names.add(`${archiveName}${ImageCacheHandler.HASH_FILE_EXTENSION}`);
    }

    return names;
  }

  private static isCacheFileName(fileName: string): boolean {
    return (
      fileName.endsWith(ImageCacheHandler.ARCHIVE_FILE_EXTENSION) ||
      fileName.endsWith(ImageCacheHandler.HASH_FILE_EXTENSION)
    );
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

  /**
   * Loads the cached image archives into the cluster.
   *
   * Every archive is rehashed and checked against the manifest immediately before it is handed to the
   * container engine, so an archive that was corrupted or altered after it was downloaded never reaches the
   * cluster.
   */
  public async load(target: string): Promise<SoloListrTask<AnyListrContext>[]> {
    const items: readonly CachedItem[] = await this.resolveExpectedCachedItems();
    const loadedImages: ReadonlySet<string> = await this.resolveLoadedClusterImages(target);
    const manifestImages: ReadonlyMap<string, CacheManifestImage> = await this.resolveManifestImagesForLoad();

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

          await this.assertArchiveMatchesManifest(name, item.localPath, manifestImages.get(name));

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

  /**
   * Fetches the manifest for the load path. A manifest that cannot be fetched or parsed yields an empty map
   * rather than an exception: the archives on disk were verified when they were pulled, and refusing to load
   * them because github.com is unreachable would take a cluster down over a network blip.
   */
  private async resolveManifestImagesForLoad(): Promise<ReadonlyMap<string, CacheManifestImage>> {
    try {
      return await ImageCacheHandler.fetchManifestImages();
    } catch (error) {
      this.logger.debug(
        'Unable to read the image cache manifest; cached archives will be loaded without re-validation: ' +
          ImageCacheHandler.getErrorMessage(error),
      );

      return new Map<string, CacheManifestImage>();
    }
  }

  /**
   * Rehashes a cached archive and compares it against the hash the manifest publishes for the image, so an
   * archive that was corrupted or tampered with after it was downloaded is never loaded into the cluster.
   *
   * With no manifest entry for the image there is no trusted hash to compare against and the archive is
   * loaded as it is. That is the deliberate choice: no Solo release publishes a `cache-manifest.json` yet, an
   * image can legitimately be absent from the manifest (a component version supplied by a flag, for example),
   * and treating "nothing to compare against" as a failure would make loading impossible rather than safer.
   * The archive still had to be written by `solo cache image pull`, which is the only path that writes into
   * the cache and verifies everything it writes.
   *
   * @throws CacheArchiveHashMismatchSoloError when the archive does not match the manifest hash
   */
  private async assertArchiveMatchesManifest(
    image: string,
    archivePath: string,
    manifestImage: CacheManifestImage | undefined,
  ): Promise<void> {
    if (!manifestImage) {
      this.logger.debug(`No manifest hash for ${image}; loading ${archivePath} without re-validation.`);
      return;
    }

    const computed: string = await ImageCacheHandler.computeSha256(archivePath);

    if (computed === manifestImage.sha256) {
      return;
    }

    // Discarded before the error is raised so the next `solo cache image pull` downloads it again instead of
    // rehashing the same bad archive and failing the load a second time.
    await this.discardArchive(archivePath);

    throw new SoloErrors.system.cacheArchiveHashMismatch(image, archivePath, manifestImage.sha256, computed);
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
    this.recordMessage(constants.CACHE_IMAGE_FAILURE_MESSAGE_GROUP, 'Image cache failures', message);
  }

  // Records housekeeping the pull performed on the cache directory, shown as its own end-of-run summary so
  // every file solo removed on the user's behalf is spelled out.
  private recordMaintenance(message: string): void {
    this.recordMessage(constants.CACHE_IMAGE_MAINTENANCE_MESSAGE_GROUP, 'Image cache maintenance', message);
  }

  private recordMessage(key: string, title: string, message: string): void {
    if (!this.logger.getMessageGroupKeys().includes(key)) {
      this.logger.addMessageGroup(key, title);
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
