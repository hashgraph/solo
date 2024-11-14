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
import chalk from 'chalk'
import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'
import { flags } from './commands/index.ts'
import * as commands from './commands/index.ts'
import { HelmDependencyManager, DependencyManager } from './core/dependency_managers/index.ts'
import {
  ChartManager, ConfigManager, PackageDownloader, PlatformInstaller, Helm, logging,
  KeyManager, Zippy, constants, ProfileManager, AccountManager, LeaseManager, CertificateManager, LocalConfig,
  helpers, RemoteConfigManager
} from './core/index.ts'
import 'dotenv/config'
import { K8 } from './core/k8.ts'
import { ListrLogger } from 'listr2'
import { CustomProcessOutput } from './core/process_output.ts'
import { type Opts } from './types/index.ts'
import path from 'path'

export function main (argv: any) {
  const logger = logging.NewLogger('debug')
  constants.LISTR_DEFAULT_RENDERER_OPTION.logger = new ListrLogger({ processOutput: new CustomProcessOutput(logger) })
  if (argv.length >= 3 && ['-version', '--version', '-v', '--v'].includes(argv[2])) {
    logger.showUser(chalk.cyan('\n******************************* Solo *********************************************'))
    logger.showUser(chalk.cyan('Version\t\t\t:'), chalk.yellow(helpers.packageVersion()))
    logger.showUser(chalk.cyan('**********************************************************************************'))
    process.exit(0)
  }

  try {
    // prepare dependency manger registry
    const downloader = new PackageDownloader(logger)
    const zippy = new Zippy(logger)
    const helmDepManager = new HelmDependencyManager(downloader, zippy, logger)
    const depManagerMap = new Map()
    .set(constants.HELM, helmDepManager)
    const depManager = new DependencyManager(logger, depManagerMap)

    const helm = new Helm(logger)
    const chartManager = new ChartManager(helm, logger)
    const configManager = new ConfigManager(logger)
    const k8 = new K8(configManager, logger)
    const accountManager = new AccountManager(logger, k8)
    const platformInstaller = new PlatformInstaller(logger, k8, configManager)
    const keyManager = new KeyManager(logger)
    const profileManager = new ProfileManager(logger, configManager)
    const leaseManager = new LeaseManager(k8, logger, configManager)
    const certificateManager = new CertificateManager(k8, logger, configManager)
    const localConfig = new LocalConfig(path.join(constants.SOLO_CACHE_DIR, constants.DEFAULT_LOCAL_CONFIG_FILE), logger)
    const remoteConfigManager = new RemoteConfigManager(k8, logger, localConfig, configManager)

    // set cluster and namespace in the global configManager from kubernetes context
    // so that we don't need to prompt the user
    const kubeConfig = k8.getKubeConfig()
    const context = kubeConfig.getContextObject(kubeConfig.getCurrentContext())
    const cluster = kubeConfig.getCurrentCluster()

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
      localConfig
    }

    const processArguments = (argv: any, yargs: any) => {
      if (argv._[0] === 'init') {
        configManager.reset()
      }

      // Set default cluster name and namespace from kubernetes context
      // these will be overwritten if user has entered the flag values explicitly
      configManager.setFlag(flags.clusterName, cluster.name)
      if (context.namespace) {
        configManager.setFlag(flags.namespace, context.namespace)
      }

      // apply precedence for flags
      argv = configManager.applyPrecedence(argv, yargs.parsed.aliases)

      // update
      configManager.update(argv)

      logger.showUser(chalk.cyan('\n******************************* Solo *********************************************'))
      logger.showUser(chalk.cyan('Version\t\t\t:'), chalk.yellow(configManager.getVersion()))
      logger.showUser(chalk.cyan('Kubernetes Context\t:'), chalk.yellow(context.name))
      logger.showUser(chalk.cyan('Kubernetes Cluster\t:'), chalk.yellow(configManager.getFlag(flags.clusterName)))
      if (configManager.getFlag(flags.namespace) !== undefined) {
        logger.showUser(chalk.cyan('Kubernetes Namespace\t:'), chalk.yellow(configManager.getFlag(flags.namespace)))
      }
      logger.showUser(chalk.cyan('**********************************************************************************'))

      return argv
    }

    return yargs(hideBin(argv))
    .usage('Usage:\n  $0 <command> [options]')
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
    .middleware(processArguments, false) // applyBeforeValidate = false as otherwise middleware is called twice
    .parse()
  } catch (e: Error | any) {
    logger.showUserError(e)
    process.exit(1)
  }
}
