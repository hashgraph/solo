// SPDX-License-Identifier: Apache-2.0

import chalk from 'chalk';
import {getSoloVersion} from '../../version.js';

/**
 * Answers `--version` straight to stdout, before anything else is built.
 *
 * Reading the version number is the one thing that has to work in any state the installation is in —
 * it is what a user reaches for when Solo is already misbehaving. Writing it here, rather than through
 * the logger, keeps it independent of the dependency-injection container, the log destination and the
 * `~/.solo` directory as a whole.
 */
export class VersionBanner {
  private static readonly VERSION_FLAGS: string[] = ['-version', '--version', '-v', '--v'];

  /**
   * Writes the version when `argv` asked for it.
   *
   * @param argv - the raw process arguments
   * @returns true when the version was requested and written, so the caller can stop
   */
  public static writeIfRequested(argv: string[]): boolean {
    if (!argv.some((argument: string): boolean => VersionBanner.VERSION_FLAGS.includes(argument))) {
      return false;
    }

    const version: string = getSoloVersion();

    switch (VersionBanner.resolveOutputFormat(argv)) {
      case 'json': {
        VersionBanner.write(JSON.stringify({version}, undefined, 2));
        break;
      }
      case 'yaml': {
        VersionBanner.write(`version: ${version}`);
        break;
      }
      case 'wide': {
        VersionBanner.write(version);
        break;
      }
      default: {
        VersionBanner.write(
          chalk.cyan('\n******************************* Solo *********************************************'),
        );
        VersionBanner.write(`${chalk.cyan('Version\t\t\t:')} ${chalk.yellow(version)}`);
        VersionBanner.write(
          chalk.cyan('**********************************************************************************'),
        );
        break;
      }
    }

    return true;
  }

  /** Reads the K8s-ecosystem-standard `--output` flag, in either `--output=x` or `--output x` form. */
  private static resolveOutputFormat(argv: string[]): string {
    const outputFlagIndex: number = argv.findIndex(
      (argument: string): boolean => argument.startsWith('--output=') || argument === '--output' || argument === '-o',
    );
    if (outputFlagIndex === -1) {
      return '';
    }

    const outputArgument: string = argv[outputFlagIndex];
    if (outputArgument.startsWith('--output=')) {
      return outputArgument.split('=', 2)[1] ?? '';
    }
    return outputFlagIndex + 1 < argv.length ? argv[outputFlagIndex + 1] : '';
  }

  private static write(line: string): void {
    process.stdout.write(`${line}\n`);
  }
}
