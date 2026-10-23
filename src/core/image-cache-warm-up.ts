// SPDX-License-Identifier: Apache-2.0

import fs from 'node:fs';
import chalk from 'chalk';
import {confirm as confirmPrompt} from '@inquirer/prompts';
import {hideBin} from 'yargs/helpers';
import * as constants from './constants.js';
import {type SoloLogger} from './logging/solo-logger.js';
import {PathEx} from '../business/utils/path-ex.js';
import {Duration} from './time/duration.js';
import {getSoloVersion} from '../../version.js';
import {CacheManifestClient} from '../integration/cache/impl/cache-manifest-client.js';
import {type CacheManifestImage} from '../integration/cache/models/impl/cache-manifest-image.js';
import {type GitHubRequestOptions} from './git-hub-request-options.js';

/** What happened the last time Solo considered warming the image cache. */
type WarmUpOutcome = 'pulled' | 'accepted' | 'declined' | 'notified' | 'unavailable';

/** Shape of the per-user marker file. */
interface WarmUpMarker {
  outcome: WarmUpOutcome;
  soloVersion: string;
}

/**
 * Offers to warm the image cache once per user, after the first command that runs without a warm cache.
 * Interactive sessions get a prompt; quiet and non-interactive sessions get a one-line notice instead.
 */
export class ImageCacheWarmUp {
  public static readonly PULL_COMMAND: string = 'solo cache image pull';

  /** Kept outside the cache directory so `solo cache image prune` does not reset it. */
  private static readonly MARKER_FILE_PATH: string = PathEx.join(constants.SOLO_HOME_DIR, 'image-cache-warm-up.json');

  /** The check runs just before Solo exits, and a connection still open at exit can crash Node on Windows. */
  private static readonly MANIFEST_REQUEST_OPTIONS: GitHubRequestOptions = {
    timeout: Duration.ofSeconds(5),
    closeConnection: true,
  };

  private static readonly BYTES_PER_GIGABYTE: number = 1_000_000_000;

  private static readonly STRUCTURED_OUTPUT_FORMATS: ReadonlySet<string> = new Set<string>(['json', 'yaml']);

  private constructor() {}

  /** Records that the image cache holds images, so Solo no longer offers to pull them. */
  public static recordPulled(logger: SoloLogger): void {
    ImageCacheWarmUp.writeMarker(logger, 'pulled');
  }

  /**
   * Offers the image cache pull when no marker exists yet. Never throws: a failure is logged and the
   * offer is left for the next command.
   *
   * @param argv the full process arguments of the command that just completed
   * @param pull runs `solo cache image pull`
   * @param confirm asks the user whether to pull now
   */
  public static async offerIfFirstRun(
    argv: string[],
    logger: SoloLogger,
    pull: () => Promise<void>,
    confirm: (message: string) => Promise<boolean> = ImageCacheWarmUp.confirmPull,
  ): Promise<void> {
    try {
      const commandArguments: string[] = hideBin(argv);
      if (!ImageCacheWarmUp.isPending() || ImageCacheWarmUp.isExcluded(commandArguments)) {
        return;
      }

      let images: readonly CacheManifestImage[];
      try {
        images = await CacheManifestClient.fetchImages(getSoloVersion(), ImageCacheWarmUp.MANIFEST_REQUEST_OPTIONS);
      } catch (error) {
        // Without a manifest the pull caches nothing, so there is nothing to offer for this version.
        logger.debug('No image cache manifest for this version; skipping the image cache warm-up: ', error);
        ImageCacheWarmUp.writeMarker(logger, 'unavailable');
        return;
      }

      const summary: string = ImageCacheWarmUp.describe(images);
      const quiet: boolean = commandArguments.includes('--quiet-mode') || commandArguments.includes('-q');
      if (quiet || !process.stdout.isTTY || !process.stdin.isTTY) {
        logger.showUser(chalk.cyan(`Run '${ImageCacheWarmUp.PULL_COMMAND}' to pre-pull the ${summary} Solo deploys.`));
        ImageCacheWarmUp.writeMarker(logger, 'notified');
        return;
      }

      const accepted: boolean = await confirm(`Pre-pull the ${summary} Solo deploys now? This speeds up deployments.`);
      ImageCacheWarmUp.writeMarker(logger, accepted ? 'accepted' : 'declined');
      if (!accepted) {
        logger.showUser(chalk.cyan(`Run '${ImageCacheWarmUp.PULL_COMMAND}' any time to pre-pull them.`));
        return;
      }

      try {
        await pull();
      } catch (error) {
        logger.debug('The image cache warm-up pull failed: ', error);
        logger.showUser(
          chalk.yellow(`The image cache was not fully populated; run '${ImageCacheWarmUp.PULL_COMMAND}' to retry.`),
        );
      }
    } catch (error) {
      logger.debug('Skipping the image cache warm-up: ', error);
    }
  }

  /** Pending until an outcome is recorded; a manifest that was unavailable is re-checked after an upgrade. */
  private static isPending(): boolean {
    const marker: WarmUpMarker | undefined = ImageCacheWarmUp.readMarker();
    if (!marker) {
      return true;
    }
    return marker.outcome === 'unavailable' && marker.soloVersion !== getSoloVersion();
  }

  /** Cache commands manage the cache themselves, and a notice would corrupt JSON or YAML output. */
  private static isExcluded(commandArguments: string[]): boolean {
    if (commandArguments[0] === 'cache') {
      return true;
    }

    for (const [index, argument] of commandArguments.entries()) {
      const format: string | undefined =
        argument === '--output' || argument === '-o'
          ? commandArguments[index + 1]
          : /^(?:--output|-o)=(.+)$/.exec(argument)?.[1];
      if (format && ImageCacheWarmUp.STRUCTURED_OUTPUT_FORMATS.has(format)) {
        return true;
      }
    }
    return false;
  }

  /** Describes the download, with its total size when the manifest records one for every image. */
  private static describe(images: readonly CacheManifestImage[]): string {
    const count: string = `${images.length} container images`;
    if (images.some((image: CacheManifestImage): boolean => image.size === undefined)) {
      return count;
    }

    const totalBytes: number = images.reduce(
      (total: number, image: CacheManifestImage): number => total + image.size,
      0,
    );
    return `${count} (${(totalBytes / ImageCacheWarmUp.BYTES_PER_GIGABYTE).toFixed(1)} GB)`;
  }

  private static async confirmPull(message: string): Promise<boolean> {
    return confirmPrompt({message, default: true});
  }

  private static readMarker(): WarmUpMarker | undefined {
    try {
      const parsed: WarmUpMarker = JSON.parse(
        fs.readFileSync(ImageCacheWarmUp.MARKER_FILE_PATH, 'utf8'),
      ) as WarmUpMarker;
      return typeof parsed.outcome === 'string' && typeof parsed.soloVersion === 'string' ? parsed : undefined;
    } catch {
      // best-effort: a missing or corrupt marker means the offer has not been made yet.
      return undefined;
    }
  }

  private static writeMarker(logger: SoloLogger, outcome: WarmUpOutcome): void {
    try {
      const marker: WarmUpMarker = {outcome, soloVersion: getSoloVersion()};
      fs.mkdirSync(constants.SOLO_HOME_DIR, {recursive: true});
      fs.writeFileSync(ImageCacheWarmUp.MARKER_FILE_PATH, JSON.stringify(marker), 'utf8');
    } catch (error) {
      // best-effort: an unwritable marker only means Solo offers the pull again on the next command.
      logger.debug('Unable to persist the image cache warm-up marker: ', error);
    }
  }
}
