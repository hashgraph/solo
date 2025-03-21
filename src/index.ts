// SPDX-License-Identifier: Apache-2.0

import chalk from 'chalk';
import yargs from 'yargs';
import {hideBin} from 'yargs/helpers';
import 'dotenv/config';
// eslint-disable-next-line n/no-extraneous-import
import 'reflect-metadata';
import {container} from 'tsyringe-neo';
import {ListrLogger} from 'listr2';

import {Flags as flags} from './commands/flags.js';
import * as commands from './commands/index.js';
import * as constants from './core/constants.js';
import * as helpers from './core/helpers.js';
import {CustomProcessOutput} from './core/process-output.js';
import {type SoloLogger} from './core/logging.js';
import {Container} from './core/dependency-injection/container-init.js';
import {InjectTokens} from './core/dependency-injection/inject-tokens.js';
import {type Middlewares} from './core/middlewares.js';
import {SoloError} from './core/errors/solo-error.js';
import {UserBreak} from './core/errors/user-break.js';

export async function main(argv: string[], context?: {logger: SoloLogger}) {
  try {
    Container.getInstance().init();
  } catch (e) {
    console.error(`Error initializing container: ${e?.message}`, e);
    throw new SoloError('Error initializing container');
  }

  const logger = container.resolve<SoloLogger>(InjectTokens.SoloLogger);

  if (context) {
    // save the logger so that solo.ts can use it to properly flush the logs and exit
    context.logger = logger;
  }
  process.on('unhandledRejection', (reason, promise) => {
    logger.showUserError(
      new SoloError(`Unhandled Rejection at: ${JSON.stringify(promise)}, reason: ${JSON.stringify(reason)}`),
    );
  });
  process.on('uncaughtException', (err, origin) => {
    logger.showUserError(new SoloError(`Uncaught Exception: ${err}, origin: ${origin}`));
  });

  logger.debug('Initializing Solo CLI');
  constants.LISTR_DEFAULT_RENDERER_OPTION.logger = new ListrLogger({processOutput: new CustomProcessOutput(logger)});
  if (argv.length >= 3 && ['-version', '--version', '-v', '--v'].includes(argv[2])) {
    logger.showUser(chalk.cyan('\n******************************* Solo *********************************************'));
    logger.showUser(chalk.cyan('Version\t\t\t:'), chalk.yellow(helpers.getSoloVersion()));
    logger.showUser(chalk.cyan('**********************************************************************************'));
    throw new UserBreak('displayed version information, exiting');
  }

  const middlewares: Middlewares = container.resolve(InjectTokens.Middlewares);

  logger.debug('Initializing commands');
  const rootCmd = yargs(hideBin(argv))
    .scriptName('')
    .usage('Usage:\n  solo <command> [options]')
    .alias('h', 'help')
    .alias('v', 'version')
    // @ts-expect-error - TS2769: No overload matches this call.
    .command(commands.Initialize(opts))
    .strict()
    .demand(1, 'Select a command')

    .middleware(
      [
        // @ts-expect-error - TS2322: To assign middlewares
        middlewares.setLoggerDevFlag(),
        // @ts-expect-error - TS2322: To assign middlewares
        middlewares.processArgumentsAndDisplayHeader(),
        // @ts-expect-error - TS2322: To assign middlewares
        middlewares.checkIfInitialized(),
        // @ts-expect-error - TS2322: To assign middlewares
        middlewares.loadRemoteConfig(),
      ],
      false, // applyBeforeValidate is false as otherwise middleware is called twice
    );

  rootCmd.fail((msg, error) => {
    if (msg) {
      if (msg.includes('Unknown argument')) {
        logger.showUser(msg);
        rootCmd.showHelp();
      } else {
        logger.showUserError(new SoloError(`Error running Solo CLI, failure occurred: ${msg ? msg : ''}`));
      }
      rootCmd.exit(0, error);
    }
  });

  logger.debug('Setting up flags');
  // set root level flags
  flags.setCommandFlags(rootCmd, ...[flags.devMode, flags.forcePortForward]);
  logger.debug('Parsing root command (executing the commands)');
  return rootCmd.parse();
}
