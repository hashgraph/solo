// SPDX-License-Identifier: Apache-2.0

import chalk from 'chalk';
import 'dotenv/config';
import 'reflect-metadata';
import {container} from 'tsyringe-neo';
import {ListrLogger} from 'listr2';

import * as constants from './core/constants.js';
import {type AnyObject} from './types/aliases.js';
import {CustomProcessOutput} from './core/process-output.js';
import {type SoloLogger} from './core/logging/solo-logger.js';
import {Container} from './core/dependency-injection/container-init.js';
import {InjectTokens} from './core/dependency-injection/inject-tokens.js';
import {SoloErrors} from './core/errors/solo-errors.js';
import {type SoloError} from './core/errors/solo-error.js';
import {SilentBreak} from './core/errors/silent-break.js';
import {ArgumentProcessor} from './argument-processor.js';
import {type ConfigProvider} from './data/configuration/api/config-provider.js';
import {VersionUpdateNotifier} from './core/version-update-notifier.js';
import {HomebrewDeprecationNotifier} from './core/homebrew-deprecation-notifier.js';
import {getSoloVersion} from '../version.js';

if (!process.stdout.isTTY) {
  chalk.level = 0;
}

// eslint-disable-next-line solo/no-exported-function
export async function main(argv: string[], context?: {logger: SoloLogger}): Promise<any> {
  try {
    // New files default to 0640 and new directories to 0750. No-op on Windows.
    process.umask(0o027);

    // `--dev` is the deprecated alias of `--debug`; accept either to raise the log level early.
    const developerMode: boolean = argv.includes('--debug') || argv.includes('--dev');
    const soloLogLevel: string = developerMode || constants.SOLO_DEV_OUTPUT ? 'debug' : constants.SOLO_LOG_LEVEL;
    Container.getInstance().init(constants.SOLO_HOME_DIR, constants.SOLO_CACHE_DIR, soloLogLevel);

    // The container registers the layered config sources through a synchronous factory, so it cannot
    // await them. Without this refresh every `SoloConfigSchema` value falls back to its class default,
    // leaving `resources/config/*.yaml` and all `SOLO_*` config-system overrides inert.
    await container.resolve<ConfigProvider>(InjectTokens.ConfigProvider).config().refresh();
  } catch (incomingError) {
    const error: SoloError = new SoloErrors.system.initSystemFilesFailed(
      incomingError instanceof Error ? incomingError : new Error(String(incomingError)),
    );
    if (context.logger) {
      context.logger.showUserError(error);
    } else {
      console.error(`Error initializing container: ${error?.message}`, error);
    }
    throw error;
  }

  const logger: SoloLogger = container.resolve<SoloLogger>(InjectTokens.SoloLogger);

  if (context) {
    // save the logger so that solo.ts can use it to properly flush the logs and exit
    context.logger = logger;
  }
  process.on('unhandledRejection', (reason: {error?: Error; target?: {url?: string}}, promise): void => {
    logger.showUserError(
      new SoloErrors.internal.commandReturnedFalse(
        `Unhandled Rejection at: ${JSON.stringify(promise)}`,
        `reason: ${JSON.stringify(reason)}`,
      ),
    );
  });
  process.on('uncaughtException', (error, origin): void => {
    logger.showUserError(new SoloErrors.internal.commandReturnedFalse('uncaughtException', String(origin)));
  });

  logger.debug('Initializing Solo CLI');
  constants.LISTR_DEFAULT_RENDERER_OPTION.logger = new ListrLogger({processOutput: new CustomProcessOutput(logger)});
  if (argv.some((argument): boolean => ['-version', '--version', '-v', '--v'].includes(argument))) {
    // Check for --output flag (K8s ecosystem standard)
    const outputFlagIndex: number = argv.findIndex(
      (argument): boolean => argument.startsWith('--output=') || argument === '--output' || argument === '-o',
    );

    let outputFormat: string = '';

    if (outputFlagIndex !== -1) {
      const outputArgument: string = argv[outputFlagIndex];

      if (outputArgument.startsWith('--output=')) {
        outputFormat = outputArgument.split('=', 2)[1] ?? '';
      } else if (outputFlagIndex + 1 < argv.length) {
        outputFormat = argv[outputFlagIndex + 1];
      }
    }

    const version: string = getSoloVersion();

    // Handle different output formats
    switch (outputFormat) {
      case 'json': {
        logger.showUser(JSON.stringify({version}, undefined, 2));
        break;
      }
      case 'yaml': {
        logger.showUser(`version: ${version}`);
        break;
      }
      case 'wide': {
        logger.showUser(version);
        break;
      }
      default: {
        // Default: full formatted banner
        logger.showUser(
          chalk.cyan('\n******************************* Solo *********************************************'),
        );
        logger.showUser(chalk.cyan('Version\t\t\t:'), chalk.yellow(version));
        logger.showUser(
          chalk.cyan('**********************************************************************************'),
        );
        break;
      }
    }
    throw new SilentBreak('displayed version information, exiting');
  }

  const result: AnyObject = await ArgumentProcessor.process(argv);
  await VersionUpdateNotifier.notifyIfUpdateAvailable(logger);
  HomebrewDeprecationNotifier.notifyIfInstalledViaHomebrew(logger);
  return result;
}
