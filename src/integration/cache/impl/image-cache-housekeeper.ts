// SPDX-License-Identifier: Apache-2.0

import fs from 'node:fs/promises';
import {type Dirent} from 'node:fs';
import {CacheArtifactEnum} from '../enums/cache-artifact-enum.js';
import {type CacheCatalogStore} from '../api/cache-catalog-store.js';
import {type CacheTarget} from '../models/impl/cache-target.js';
import {type CacheManifestImage} from '../models/impl/cache-manifest-image.js';
import {PathEx} from '../../../business/utils/path-ex.js';

/**
 * Repairs the image cache directory before a pull writes into it: entries left behind by the registry-pull
 * cache model are migrated away and files the current manifest does not list are pruned.
 *
 * Nothing here downloads, verifies or loads an archive, and nothing here throws for a single file: every
 * removal, and every removal that failed, is reported through the maintenance callback so the end-of-run
 * summary spells out what solo did on the user's behalf, and a file solo cannot delete never costs a deploy.
 */
export class ImageCacheHousekeeper {
  /** Extension of the file holding an archive's published hash, stored next to the archive. */
  public static readonly HASH_FILE_EXTENSION: string = '.sha256';

  /** Extension of an image archive in the local cache. */
  public static readonly ARCHIVE_FILE_EXTENSION: string = '.tar';

  public constructor(
    private readonly store: CacheCatalogStore,
    private readonly recordMaintenance: (message: string) => void,
  ) {}

  /**
   * Removes the image cache entries an older Solo version wrote, so the first pull after an upgrade starts
   * from a cache the new model can reason about.
   *
   * Before the CDN model, archives were produced locally by exporting an image the container engine had
   * pulled from its registry. Nothing published a hash for those bytes, so they were written on their own,
   * and the registry-pull code that produced them is gone. An archive with no hash file next to it is
   * therefore an entry of the old model: it cannot be verified now, it cannot be verified later, and the
   * epic requires that only verified archives are loaded into a cluster. It is deleted, and the pull that
   * follows downloads the published archive for that image in the same run.
   *
   * Only ever called with a manifest that resolved, for the same reason as {@link pruneStaleFiles}: without
   * one nothing would replace the removed archive, and an archive with no manifest entry still loads, so
   * deleting it would only cost the user a cache that works.
   *
   * The rule is the layout rather than a file name, which is what makes this safe to run on every pull:
   * every archive the new model writes gets its hash file first, so a current entry is never mistaken for a
   * legacy one, and a second run finds nothing left to do.
   *
   * @returns the paths of the files that were removed
   */
  public async migrateLegacyEntries(targets: readonly CacheTarget[]): Promise<readonly string[]> {
    const entries: readonly Dirent[] = await this.readImageCacheDirectory(targets);
    const fileNames: ReadonlySet<string> = new Set<string>(
      entries.filter((entry): boolean => entry.isFile()).map((entry): string => entry.name),
    );

    const migrated: string[] = [];

    for (const fileName of fileNames) {
      if (
        !fileName.endsWith(ImageCacheHousekeeper.ARCHIVE_FILE_EXTENSION) ||
        fileNames.has(`${fileName}${ImageCacheHousekeeper.HASH_FILE_EXTENSION}`)
      ) {
        continue;
      }

      // fileName is a single directory entry, so the join can only ever address a file inside the image
      // cache directory itself.
      const filePath: string = PathEx.join(this.resolveImageCacheDirectory(targets), fileName);

      if (
        await this.remove(
          filePath,
          'Removed an image archive cached by an older version of solo, which published no hash to verify it ' +
            'against; the published archive is downloaded in its place',
        )
      ) {
        migrated.push(filePath);
      }
    }

    return migrated;
  }

  /**
   * Deletes every archive and hash file in the image cache directory that the current manifest does not list,
   * so files published by an older Solo version do not accumulate on the user's filesystem.
   *
   * Only ever called with a manifest that resolved: without one there is no authoritative list of what belongs
   * in the cache, and deleting on a guess would throw away archives that are still valid.
   *
   * @returns the paths of the files that were removed
   */
  public async pruneStaleFiles(
    targets: readonly CacheTarget[],
    manifestImages: ReadonlyMap<string, CacheManifestImage>,
  ): Promise<readonly string[]> {
    const entries: readonly Dirent[] = await this.readImageCacheDirectory(targets);
    const keep: ReadonlySet<string> = this.resolveExpectedFileNames(targets, manifestImages);
    const pruned: string[] = [];

    for (const entry of entries) {
      if (!entry.isFile() || keep.has(entry.name) || !ImageCacheHousekeeper.isCacheFileName(entry.name)) {
        continue;
      }

      // entry.name is a single directory entry, so the join can only ever address a file inside the
      // image cache directory itself.
      const filePath: string = PathEx.join(this.resolveImageCacheDirectory(targets), entry.name);

      if (await this.remove(filePath, 'Pruned stale image cache file, not listed in the manifest')) {
        pruned.push(filePath);
      }
    }

    return pruned;
  }

  /**
   * Removes one cache file and reports the outcome either way. A missing file counts as removed; a file the
   * process cannot delete (locked, EPERM, EACCES) is reported and left in place rather than raised, because
   * the pull runs inside the one-shot deploy and a leftover file is not worth stopping it for.
   *
   * @returns whether the file is gone
   */
  private async remove(filePath: string, description: string): Promise<boolean> {
    try {
      await fs.rm(filePath, {force: true});
    } catch (error) {
      // best-effort: report the file solo could not delete and carry on with the rest of the cache
      const reason: string = error instanceof Error ? error.message : String(error);
      this.recordMaintenance(`Could not remove image cache file, left in place: ${filePath} (${reason})`);
      return false;
    }

    this.recordMaintenance(`${description}: ${filePath}`);
    return true;
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
      names.add(`${archiveName}${ImageCacheHousekeeper.HASH_FILE_EXTENSION}`);
    }

    return names;
  }

  /**
   * The directory the catalog store keeps image archives in. Derived from a target's resolved archive path
   * rather than assembled here, so the layout stays owned by the store alone.
   */
  private resolveImageCacheDirectory(targets: readonly CacheTarget[]): string {
    return PathEx.dirname(this.store.resolvePath(targets[0], CacheArtifactEnum.IMAGE));
  }

  /**
   * Directory entries of the image cache, empty when nothing has been cached yet. Any other failure to read
   * the directory is raised: swallowing it would silently turn off both migration and pruning.
   */
  private async readImageCacheDirectory(targets: readonly CacheTarget[]): Promise<readonly Dirent[]> {
    if (targets.length === 0) {
      return [];
    }

    try {
      return await fs.readdir(this.resolveImageCacheDirectory(targets), {withFileTypes: true});
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }

      // nothing has been cached yet, so there is no directory to read
      return [];
    }
  }

  private static isCacheFileName(fileName: string): boolean {
    return (
      fileName.endsWith(ImageCacheHousekeeper.ARCHIVE_FILE_EXTENSION) ||
      fileName.endsWith(ImageCacheHousekeeper.HASH_FILE_EXTENSION)
    );
  }
}
