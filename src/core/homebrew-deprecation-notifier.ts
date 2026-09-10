// SPDX-License-Identifier: Apache-2.0

import chalk from 'chalk';
import * as constants from './constants.js';
import {PACKAGE_NAME} from './constants.js';
import {type SoloLogger} from './logging/solo-logger.js';

/**
 * Warns users of a Homebrew-installed Solo that Homebrew support is going away.
 *
 * Homebrew swallows the output of a formula's install steps, so the deprecation cannot be surfaced
 * from `scripts/postinstall.mjs`; the banner is printed on the commands the user runs after
 * installing or upgrading instead. Like the update notifier, it is skipped for non-interactive
 * sessions and never surfaces errors to the user.
 */
export class HomebrewDeprecationNotifier {
  /** The date after which the Homebrew formula stops being updated. */
  private static readonly END_OF_UPDATES_DATE: string = 'August 31, 2026';

  /** Published documentation for installing and upgrading Solo. */
  private static readonly UPGRADE_GUIDE_URL: string = 'https://solo.hiero.org/docs/simple-solo-setup/upgrading-solo/';

  /**
   * Matches the Cellar path segment Homebrew installs every formula under, for both the `solo`
   * formula and the versioned `solo@<version>` formulas. The Homebrew prefix itself varies
   * (`/opt/homebrew`, `/usr/local`, `/home/linuxbrew/.linuxbrew`, or a custom one) but the
   * `Cellar/<formula>` segment does not, so it identifies a Homebrew-installed Solo without
   * matching an npm install that merely lives under a Homebrew prefix (`<prefix>/lib/node_modules`).
   */
  private static readonly HOMEBREW_CELLAR_PATTERN: RegExp = /[/\\]Cellar[/\\]solo(@[^/\\]+)?[/\\]/;

  /**
   * Displays the Homebrew deprecation banner when this Solo was installed by Homebrew.
   * Silently returns without a banner for non-interactive sessions and every other install method.
   */
  public static notifyIfInstalledViaHomebrew(logger: SoloLogger): void {
    try {
      if (!process.stdout.isTTY || !HomebrewDeprecationNotifier.isInstalledViaHomebrew()) {
        return;
      }

      HomebrewDeprecationNotifier.displayBanner(logger);
    } catch (error) {
      // best-effort: the deprecation banner must never interfere with the command the user ran.
      logger.debug('Skipping Homebrew deprecation notification: ', error);
    }
  }

  /** Returns true when the given installation directory is a Homebrew Cellar location. */
  public static isInstalledViaHomebrew(installationPath: string = constants.ROOT_DIR): boolean {
    return HomebrewDeprecationNotifier.HOMEBREW_CELLAR_PATTERN.test(installationPath);
  }

  /** Prints the deprecation banner with the end-of-updates date and the supported install method. */
  private static displayBanner(logger: SoloLogger): void {
    const width: number = 80;
    logger.showUser(chalk.yellow('\n' + '='.repeat(width)));
    logger.showUser(chalk.yellow('  WARNING: Homebrew support for Solo is being removed.'));
    logger.showUser(
      chalk.yellow('  This Solo came from Homebrew, which stops being updated after'),
      chalk.red(HomebrewDeprecationNotifier.END_OF_UPDATES_DATE + '.'),
    );
    logger.showUser(chalk.yellow('  Switch to npm to keep receiving updates:'));
    logger.showUser(chalk.cyan(`    brew uninstall solo && npm install -g ${PACKAGE_NAME}`));
    logger.showUser(chalk.yellow('  Upgrade guide:'), chalk.cyan(HomebrewDeprecationNotifier.UPGRADE_GUIDE_URL));
    logger.showUser(chalk.yellow('='.repeat(width) + '\n'));
  }
}
