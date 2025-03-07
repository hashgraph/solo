/**
 * SPDX-License-Identifier: Apache-2.0
 */
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
import {type DependencyManager} from './core/dependency_managers/index.js';
import * as constants from './core/constants.js';
import {type PackageDownloader} from './core/package_downloader.js';
import {type Helm} from './core/helm.js';
import {type ChartManager} from './core/chart_manager.js';
import {type ConfigManager} from './core/config_manager.js';
import {type AccountManager} from './core/account_manager.js';
import {type PlatformInstaller} from './core/platform_installer.js';
import {type KeyManager} from './core/key_manager.js';
import {type ProfileManager} from './core/profile_manager.js';
import {type LeaseManager} from './core/lease/lease_manager.js';
import {type CertificateManager} from './core/certificate_manager.js';
import {type LocalConfig} from './core/config/local_config.js';
import {type RemoteConfigManager} from './core/config/remote/remote_config_manager.js';
import * as helpers from './core/helpers.js';
import {type K8Factory} from './core/kube/k8_factory.js';
import {CustomProcessOutput} from './core/process_output.js';
import {type SoloLogger} from './core/logging.js';
import {Container} from './core/dependency_injection/container_init.js';
import {InjectTokens} from './core/dependency_injection/inject_tokens.js';
import {type Opts} from './commands/base.js';
import {Middlewares} from './core/middlewares.js';
import {SoloError, UserBreak} from './core/errors.js';

export async function main(argv: string[], context?: {logger: SoloLogger}) {
  try {
    Container.getInstance().init();
  } catch (e) {
    console.error(`Error initializing container: ${e.message}`, e);
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

  // prepare dependency manger registry
  const downloader: PackageDownloader = container.resolve(InjectTokens.PackageDownloader);
  const depManager: DependencyManager = container.resolve(InjectTokens.DependencyManager);
  const helm: Helm = container.resolve(InjectTokens.Helm);
  const chartManager: ChartManager = container.resolve(InjectTokens.ChartManager);
  const configManager: ConfigManager = container.resolve(InjectTokens.ConfigManager);
  const k8Factory: K8Factory = container.resolve(InjectTokens.K8Factory);
  const accountManager: AccountManager = container.resolve(InjectTokens.AccountManager);
  const platformInstaller: PlatformInstaller = container.resolve(InjectTokens.PlatformInstaller);
  const keyManager: KeyManager = container.resolve(InjectTokens.KeyManager);
  const profileManager: ProfileManager = container.resolve(InjectTokens.ProfileManager);
  const leaseManager: LeaseManager = container.resolve(InjectTokens.LeaseManager);
  const certificateManager: CertificateManager = container.resolve(InjectTokens.CertificateManager);
  const localConfig: LocalConfig = container.resolve(InjectTokens.LocalConfig);
  const remoteConfigManager: RemoteConfigManager = container.resolve(InjectTokens.RemoteConfigManager);

  const opts: Opts = {
    logger,
    helm,
    k8Factory,
    downloader,
    platformInstaller,
    chartManager,
    configManager,
    depManager,
    keyManager,
    accountManager,
    profileManager,
    leaseManager,
    remoteConfigManager,
    certificateManager,
    localConfig,
  };

  logger.debug('Initializing middlewares');
  const middlewares = new Middlewares(opts);

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
      // @ts-expect-error - TS2322: To assign middlewares
      [middlewares.setLoggerDevFlag(), middlewares.processArgumentsAndDisplayHeader(), middlewares.loadRemoteConfig()],
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
