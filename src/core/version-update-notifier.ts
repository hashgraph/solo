// SPDX-License-Identifier: Apache-2.0

import fs from 'node:fs';
import https from 'node:https';
import {type ClientRequest, type IncomingMessage} from 'node:http';
import chalk from 'chalk';
import * as constants from './constants.js';
import {PACKAGE_NAME} from './constants.js';
import {type SoloLogger} from './logging/solo-logger.js';
import {PathEx} from '../business/utils/path-ex.js';
import {SemanticVersion} from '../business/utils/semantic-version.js';
import {getSoloVersion} from '../../version.js';
import {Duration} from './time/duration.js';

/**
 * Shape of the on-disk cache used to avoid hitting the npm registry on every invocation.
 */
interface UpdateCheckCache {
  lastCheckEpochMilliseconds: number;
  latestVersion: string;
}

/**
 * Notifies the user when a newer version of Solo is available on npmjs.com.
 *
 * The check is best-effort: it is skipped for non-interactive sessions,
 * caches the latest known version for a day to avoid a
 * network round-trip on every command, and never surfaces errors to the user.
 */
export class VersionUpdateNotifier {
  private static readonly REGISTRY_URL: string = `https://registry.npmjs.org/${PACKAGE_NAME}/latest`;

  /** Published documentation for the latest release, including install/upgrade instructions. */
  private static readonly UPGRADE_GUIDE_URL: string = 'https://solo.hiero.org/docs/simple-solo-setup/upgrading-solo/';

  /** GitHub releases page listing the changelog for every published version. */
  private static readonly RELEASE_NOTES_URL: string = 'https://github.com/hiero-ledger/solo/releases';

  /** How long a cached latest-version lookup is considered fresh (24 hours). */
  private static readonly CHECK_INTERVAL_MILLISECONDS: number = Duration.ofHours(24).toMinutes();

  private static readonly REQUEST_TIMEOUT_MILLISECONDS: number = 2000;

  /** Location of the cache file within the Solo cache directory. */
  private static readonly CACHE_FILE_PATH: string = PathEx.join(constants.SOLO_CACHE_DIR, 'update-check.json');

  /**
   * Displays an upgrade banner when a newer Solo version exists on npmjs.com.
   * Silently returns without a banner when disabled, non-interactive, offline, or already current.
   */
  public static async notifyIfUpdateAvailable(logger: SoloLogger): Promise<void> {
    try {
      if (!VersionUpdateNotifier.isEnabled()) {
        return;
      }

      const latestVersion: string | undefined = await VersionUpdateNotifier.resolveLatestVersion(logger);
      if (!latestVersion) {
        return;
      }

      const currentVersion: string = getSoloVersion();
      if (!VersionUpdateNotifier.isNewer(latestVersion, currentVersion)) {
        return;
      }

      VersionUpdateNotifier.displayBanner(logger, currentVersion, latestVersion);
    } catch (error) {
      logger.debug('Skipping update notification: ', error);
    }
  }

  /** Skips non-TTY sessions */
  private static isEnabled(): boolean {
    return process.stdout.isTTY;
  }

  /**
   * Returns the latest published version, preferring a fresh cache entry and falling
   * back to a stale cache entry when the network is unavailable.
   */
  private static async resolveLatestVersion(logger: SoloLogger): Promise<string | undefined> {
    const cache: UpdateCheckCache | undefined = VersionUpdateNotifier.readCache();
    const now: number = Date.now();

    if (cache && now - cache.lastCheckEpochMilliseconds < VersionUpdateNotifier.CHECK_INTERVAL_MILLISECONDS) {
      return cache.latestVersion;
    }

    const fetchedVersion: string | undefined = await VersionUpdateNotifier.fetchLatestVersion();
    if (fetchedVersion) {
      VersionUpdateNotifier.writeCache(logger, {lastCheckEpochMilliseconds: now, latestVersion: fetchedVersion});
      return fetchedVersion;
    }

    // network failed: fall back to any previously cached value so we can still notify offline.
    return cache?.latestVersion;
  }

  /**
   * Fetches the latest published version from the npm registry, or undefined on any failure.
   *
   * Deliberately uses `node:https` with `agent: false` rather than the global `fetch`. A pooled
   * client keeps the connection alive past the response and finishes tearing it down on the libuv
   * thread pool. This check is the last thing a command does before the CLI flushes its logs and
   * calls `process.exit()`, and on Windows a thread-pool completion that lands after that exit
   * begins aborts the process with `Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)` —
   * turning a successful command into a crash. An unpooled socket is closed with the response, so
   * nothing is left in flight at exit.
   */
  private static async fetchLatestVersion(): Promise<string | undefined> {
    return new Promise<string | undefined>((resolve): void => {
      let settled: boolean = false;

      // Resolves on whichever of response, error, or deadline arrives first; the rest become no-ops.
      const settle: (version?: string) => void = (version?: string): void => {
        if (settled) {
          return;
        }
        settled = true;
        resolve(version);
      };

      const request: ClientRequest = https.get(
        VersionUpdateNotifier.REGISTRY_URL,
        {agent: false, headers: {'User-Agent': constants.SOLO_USER_AGENT_HEADER}},
        (response: IncomingMessage): void => {
          if (response.statusCode !== 200) {
            response.resume(); // drain so the socket can close
            settle();
            return;
          }

          let body: string = '';
          response.setEncoding('utf8');
          response.on('data', (chunk: string): void => {
            body += chunk;
          });
          response.on('end', (): void => {
            try {
              const payload: {version?: string} = JSON.parse(body) as {version?: string};
              settle(payload.version);
            } catch {
              // best-effort: a malformed registry response is treated as "no update available".
              settle();
            }
          });
          response.on('error', (): void => {
            // best-effort: a connection reset mid-response falls back to no update.
            settle();
          });
        },
      );

      request.on('error', (): void => {
        // best-effort: offline, DNS failure, or a refused connection all fall back to no update.
        settle();
      });

      // unref() so this deadline never holds the CLI open once the answer has arrived, which also
      // means there is no timer to clear on the happy path.
      setTimeout((): void => {
        // best-effort: a registry too slow to answer must not delay the command, so give up quietly.
        request.destroy();
        settle();
      }, VersionUpdateNotifier.REQUEST_TIMEOUT_MILLISECONDS).unref();
    });
  }

  /** Reads and parses the cache file, returning undefined when it is absent or unreadable. */
  private static readCache(): UpdateCheckCache | undefined {
    try {
      const raw: string = fs.readFileSync(VersionUpdateNotifier.CACHE_FILE_PATH, 'utf8');
      const parsed: UpdateCheckCache = JSON.parse(raw) as UpdateCheckCache;
      if (typeof parsed.latestVersion === 'string' && typeof parsed.lastCheckEpochMilliseconds === 'number') {
        return parsed;
      }
      return undefined;
    } catch {
      // best-effort: a missing or corrupt cache simply triggers a fresh registry lookup.
      return undefined;
    }
  }

  /** Persists the latest-version cache, ignoring write failures. */
  private static writeCache(logger: SoloLogger, cache: UpdateCheckCache): void {
    try {
      fs.mkdirSync(constants.SOLO_CACHE_DIR, {recursive: true});
      fs.writeFileSync(VersionUpdateNotifier.CACHE_FILE_PATH, JSON.stringify(cache), 'utf8');
    } catch (error) {
      // best-effort: an unwritable cache only means we re-check on the next invocation.
      logger.debug('Unable to persist update-check cache: ', error);
    }
  }

  /** Compares two versions, returning true when {@link latestVersion} is strictly newer. */
  private static isNewer(latestVersion: string, currentVersion: string): boolean {
    try {
      const latest: SemanticVersion<string> = new SemanticVersion(latestVersion);
      const current: SemanticVersion<string> = new SemanticVersion(currentVersion);
      return latest.greaterThan(current);
    } catch {
      // best-effort: unparseable versions are treated as "no update" rather than erroring.
      return false;
    }
  }

  /** Prints the upgrade banner with the download link and install command. */
  private static displayBanner(logger: SoloLogger, currentVersion: string, latestVersion: string): void {
    const width: number = 80;
    logger.showUser(chalk.yellow('\n' + '='.repeat(width)));
    logger.showUser(
      chalk.yellow('  A new version of Solo is available:'),
      chalk.dim(currentVersion),
      chalk.yellow('→'),
      chalk.green(latestVersion),
    );

    logger.showUser(chalk.yellow('  Upgrade guide:'), chalk.cyan(VersionUpdateNotifier.UPGRADE_GUIDE_URL));
    logger.showUser(chalk.yellow('  Release notes:'), chalk.cyan(VersionUpdateNotifier.RELEASE_NOTES_URL));
    logger.showUser(chalk.yellow('='.repeat(width) + '\n'));
  }
}
