/**
 * Copyright (C) 2024 Hedera Hashgraph, LLC
 *
 * Licensed under the Apache License, Version 2.0 (the ""License"");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an ""AS IS"" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 */
import chalk from 'chalk';
import yargs from 'yargs';
import {hideBin} from 'yargs/helpers';
import 'dotenv/config';
import path from 'path';
// eslint-disable-next-line n/no-extraneous-import
import 'reflect-metadata';
import {container} from 'tsyringe-neo';
import './core/container_init.js';
import {ListrLogger} from 'listr2';

import {Flags as flags} from './commands/flags.js';
import * as commands from './commands/index.js';
import {DependencyManager} from './core/dependency_managers/index.js';
import * as constants from './core/constants.js';
import {PackageDownloader} from './core/package_downloader.js';
import {Helm} from './core/helm.js';
import {ChartManager} from './core/chart_manager.js';
import {ConfigManager} from './core/config_manager.js';
import {AccountManager} from './core/account_manager.js';
import {PlatformInstaller} from './core/platform_installer.js';
import {KeyManager} from './core/key_manager.js';
import {ProfileManager} from './core/profile_manager.js';
import {LeaseManager} from './core/lease/lease_manager.js';
import {CertificateManager} from './core/certificate_manager.js';
import {LocalConfig} from './core/config/local_config.js';
import {RemoteConfigManager} from './core/config/remote/remote_config_manager.js';
import * as helpers from './core/helpers.js';
import {K8} from './core/k8.js';
import {CustomProcessOutput} from './core/process_output.js';
import {type Opts} from './types/command_types.js';
import {SoloLogger} from './core/logging.js';
import {Container} from './core/container_init.js';

export function main(argv: any) {
  Container.getInstance().init();

  const logger = container.resolve(SoloLogger);
  constants.LISTR_DEFAULT_RENDERER_OPTION.logger = new ListrLogger({processOutput: new CustomProcessOutput(logger)});
  if (argv.length >= 3 && ['-version', '--version', '-v', '--v'].includes(argv[2])) {
    logger.showUser(chalk.cyan('\n******************************* Solo *********************************************'));
    logger.showUser(chalk.cyan('Version\t\t\t:'), chalk.yellow(helpers.packageVersion()));
    logger.showUser(chalk.cyan('**********************************************************************************'));
    process.exit(0);
  }

  try {
    // prepare dependency manger registry
    const downloader = container.resolve(PackageDownloader);
    const depManager = container.resolve(DependencyManager);
    const helm = container.resolve(Helm);
    const chartManager = container.resolve(ChartManager);
    const configManager = container.resolve(ConfigManager);
    const k8 = container.resolve(K8);
    const accountManager = container.resolve(AccountManager);
    const platformInstaller = container.resolve(PlatformInstaller);
    const keyManager = container.resolve(KeyManager);
    const profileManager = container.resolve(ProfileManager);
    const leaseManager = container.resolve(LeaseManager);
    const certificateManager = container.resolve(CertificateManager);
    const localConfig = container.resolve(LocalConfig);
    const remoteConfigManager = container.resolve(RemoteConfigManager);

    // set cluster and namespace in the global configManager from kubernetes context
    // so that we don't need to prompt the user
    const kubeConfig = k8.getKubeConfig();
    const context = kubeConfig.getContextObject(kubeConfig.getCurrentContext());
    const cluster = kubeConfig.getCurrentCluster();

    const opts: Opts = {
      logger,
      helm,
      k8,
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

      const clusterName = configManager.getFlag(flags.clusterName) || cluster.name;

      if (context.namespace) {
        configManager.setFlag(flags.namespace, context.namespace);
      }

      // apply precedence for flags
      argv = configManager.applyPrecedence(argv, yargs.parsed.aliases);

      // update
      configManager.update(argv);

      logger.showUser(
        chalk.cyan('\n******************************* Solo *********************************************'),
      );
      logger.showUser(chalk.cyan('Version\t\t\t:'), chalk.yellow(configManager.getVersion()));
      logger.showUser(chalk.cyan('Kubernetes Context\t:'), chalk.yellow(context.name));
      logger.showUser(chalk.cyan('Kubernetes Cluster\t:'), chalk.yellow(clusterName));
      if (configManager.getFlag(flags.namespace) !== undefined) {
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
        (command === 'deployment' && subCommand === 'create');
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
