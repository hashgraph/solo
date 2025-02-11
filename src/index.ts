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
import {type Opts} from './types/command_types.js';
import {type SoloLogger} from './core/logging.js';
import {Container} from './core/dependency_injection/container_init.js';
import {InjectTokens} from './core/dependency_injection/inject_tokens.js';
import {type NamespaceName} from './core/kube/resources/namespace/namespace_name.js';

export function main(argv: any) {
  Container.getInstance().init();

  const logger = container.resolve<SoloLogger>(InjectTokens.SoloLogger);
  constants.LISTR_DEFAULT_RENDERER_OPTION.logger = new ListrLogger({processOutput: new CustomProcessOutput(logger)});
  if (argv.length >= 3 && ['-version', '--version', '-v', '--v'].includes(argv[2])) {
    logger.showUser(chalk.cyan('\n******************************* Solo *********************************************'));
    logger.showUser(chalk.cyan('Version\t\t\t:'), chalk.yellow(helpers.packageVersion()));
    logger.showUser(chalk.cyan('**********************************************************************************'));
    process.exit(0);
  }

  try {
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

    // set cluster and namespace in the global configManager from kubernetes context
    // so that we don't need to prompt the user
    const contextNamespace: NamespaceName = k8Factory.default().contexts().readCurrentNamespace();
    const currentClusterName: string = k8Factory.default().clusters().readCurrent();
    const contextName: string = k8Factory.default().contexts().readCurrent();

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

    const processArguments = (argv: any, yargs: any): any => {
      if (argv._[0] === 'init') {
        configManager.reset();
      }

      const clusterName = configManager.getFlag(flags.clusterName) || currentClusterName;

      if (contextNamespace?.name) {
        configManager.setFlag(flags.namespace, contextNamespace);
      }

      // apply precedence for flags
      argv = configManager.applyPrecedence(argv, yargs.parsed.aliases);

      // update
      configManager.update(argv);

      const currentCommand = argv._.join(' ') as string;
      const commandArguments = flags.stringifyArgv(argv);
      const commandData = (currentCommand + ' ' + commandArguments).trim();

      logger.showUser(
        chalk.cyan('\n******************************* Solo *********************************************'),
      );
      logger.showUser(chalk.cyan('Version\t\t\t:'), chalk.yellow(configManager.getVersion()));
      logger.showUser(chalk.cyan('Kubernetes Context\t:'), chalk.yellow(contextName));
      logger.showUser(chalk.cyan('Kubernetes Cluster\t:'), chalk.yellow(clusterName));
      logger.showUser(chalk.cyan('Current Command\t\t:'), chalk.yellow(commandData));
      if (typeof configManager.getFlag<NamespaceName>(flags.namespace)?.name !== 'undefined') {
        logger.showUser(chalk.cyan('Kubernetes Namespace\t:'), chalk.yellow(configManager.getFlag(flags.namespace)));
      }
      logger.showUser(chalk.cyan('**********************************************************************************'));

      return argv;
    };

    const loadRemoteConfig = async (argv: any, yargs: any): Promise<any> => {
      const command = argv._[0];
      const subCommand = argv._[1];
      const skip =
        command === 'init' ||
        (command === 'node' && subCommand === 'keys') ||
        (command === 'cluster' && subCommand === 'connect') ||
        (command === 'cluster' && subCommand === 'info') ||
        (command === 'cluster' && subCommand === 'list') ||
        (command === 'cluster' && subCommand === 'setup') ||
        (command === 'deployment' && subCommand === 'create') ||
        (command === 'deployment' && subCommand === 'list');

      if (!skip) {
        await remoteConfigManager.loadAndValidate(argv);
      }

      return argv;
    };

    return (
      yargs(hideBin(argv))
        .scriptName('')
        .usage('Usage:\n  solo <command> [options]')
        .alias('h', 'help')
        .alias('v', 'version')
        // @ts-ignore
        .command(commands.Initialize(opts))
        .strict()
        // @ts-ignore
        .option(flags.devMode.name, flags.devMode.definition)
        .wrap(120)
        .demand(1, 'Select a command')
        // @ts-ignore
        .middleware([processArguments, loadRemoteConfig], false) // applyBeforeValidate = false as otherwise middleware is called twice
        .parse()
    );
  } catch (e: Error | any) {
    logger.showUserError(e);
    process.exit(1);
  }
}
