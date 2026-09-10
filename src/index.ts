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
import {SoloError} from './core/errors/solo-error.js';
import {FatalErrorReporter} from './core/fatal-error-reporter.js';
import {SilentBreak} from './core/errors/silent-break.js';
import {ArgumentProcessor} from './argument-processor.js';
import {VersionUpdateNotifier} from './core/version-update-notifier.js';
import {HomebrewDeprecationNotifier} from './core/homebrew-deprecation-notifier.js';
import {VersionBanner} from './core/version-banner.js';

if (!process.stdout.isTTY) {
  chalk.level = 0;
}

/**
 * The fatal-error handlers registered by the most recent {@link main} call.
 *
 * `main()` runs once per CLI invocation but many times per process in the end-to-end tests, and
 * `process.on` appends. Left unchecked, the Nth call would fan a single `uncaughtException` out to N
 * reports of the same error — the flood the report cap exists to prevent, arriving from the other
 * direction. Only our own listeners are removed, never ones registered elsewhere.
 */
let fatalErrorHandlers: {rejection: (reason: unknown) => void; exception: (error: Error) => void} | undefined;

function registerFatalErrorHandlers(logger: SoloLogger): void {
  if (fatalErrorHandlers) {
    process.off('unhandledRejection', fatalErrorHandlers.rejection);
    process.off('uncaughtException', fatalErrorHandlers.exception);
  }

  fatalErrorHandlers = {
    rejection: (reason: unknown): void => FatalErrorReporter.report(logger, 'unhandledRejection', reason),
    exception: (error: Error): void => FatalErrorReporter.report(logger, 'uncaughtException', error),
  };

  process.on('unhandledRejection', fatalErrorHandlers.rejection);
  process.on('uncaughtException', fatalErrorHandlers.exception);
}

// eslint-disable-next-line solo/no-exported-function
export async function main(argv: string[], context?: {logger: SoloLogger}): Promise<any> {
  // Latch escaped-error reporting per invocation, not per process: the CLI calls main() once, but the
  // end-to-end tests call it many times in one process, and a latch left set would reduce every failure
  // after the first to a bare stderr line.
  FatalErrorReporter.reset();

  // Answered before the container is built, so the version is readable whatever state the installation
  // is in — an unwritable ~/.solo/logs included. Reading the version is what a user reaches for when
  // Solo is already misbehaving, which is exactly the situation in #5370.
  if (VersionBanner.writeIfRequested(argv)) {
    throw new SilentBreak('displayed version information, exiting');
  }

  try {
    // New files default to 0640 and new directories to 0750. No-op on Windows.
    process.umask(0o027);

    // `--dev` is the deprecated alias of `--debug`; accept either to raise the log level early.
    const developerMode: boolean = argv.includes('--debug') || argv.includes('--dev');
    const soloLogLevel: string = developerMode || constants.SOLO_DEV_OUTPUT ? 'debug' : constants.SOLO_LOG_LEVEL;
    Container.getInstance().init(constants.SOLO_HOME_DIR, constants.SOLO_CACHE_DIR, soloLogLevel);
  } catch (incomingError) {
    // An already-coded failure (e.g. an unwritable log destination) carries the specific message and
    // remediation; wrapping it would replace its code with the generic one in the rendered error box.
    const error: SoloError =
      incomingError instanceof SoloError
        ? incomingError
        : new SoloErrors.system.initSystemFilesFailed(
            incomingError instanceof Error ? incomingError : new Error(String(incomingError)),
          );
    process.exitCode = 1;
    if (context?.logger) {
      context.logger.showUserError(error);
    } else {
      // Initialization builds the logger, so a failure here often means there is nothing to log through.
      FatalErrorReporter.reportWithoutLogger(error);
    }
    // The failure is rendered above; a SilentBreak keeps the entrypoint from rendering it a second time.
    // The coded error rides along as the cause so programmatic callers still reach its code and steps.
    throw new SilentBreak(error.message, error);
  }

  const logger: SoloLogger = container.resolve<SoloLogger>(InjectTokens.SoloLogger);

  if (context) {
    // save the logger so that solo.ts can use it to properly flush the logs and exit
    context.logger = logger;
  }
  registerFatalErrorHandlers(logger);

  logger.debug('Initializing Solo CLI');
  constants.LISTR_DEFAULT_RENDERER_OPTION.logger = new ListrLogger({processOutput: new CustomProcessOutput(logger)});
  const result: AnyObject = await ArgumentProcessor.process(argv);
  await VersionUpdateNotifier.notifyIfUpdateAvailable(logger);
  HomebrewDeprecationNotifier.notifyIfInstalledViaHomebrew(logger);
  return result;
}
