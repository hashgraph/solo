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
 * @jest-environment steps
 */
import {flags} from "./src/commands/index.mjs";
import {
  ChartManager,
  ConfigManager,
  constants,
  Helm,
  K8,
  logging,
  PackageDownloader,
  Zippy
} from "./src/core/index.mjs";
import {AccountManager} from "./src/core/account_manager.mjs";
import {AccountCommand} from "./src/commands/account.mjs";
import {
  DependencyManager,
  HelmDependencyManager,
  KeytoolDependencyManager
} from "./src/core/dependency_managers/index.mjs";


export async function main(sys_argv) {


  const logger = logging.NewLogger('debug')
  let argv = {}
  argv[flags.namespace.name] = 'solo-e2e'
  argv[flags.nodeIDs.name] = 'node0,node1,node2'
  argv[flags.generateGossipKeys.name] = true
  argv[flags.generateTlsKeys.name] = true
  argv[flags.clusterName.name] = 'solo-e2e'
  // set the env variable SOLO_FST_CHARTS_DIR if developer wants to use local FST charts
  argv[flags.chartDirectory.name] = process.env.SOLO_FST_CHARTS_DIR ? process.env.SOLO_FST_CHARTS_DIR : undefined



  const configManager = new ConfigManager(logger)
  configManager.update(argv, true)
  const helm = new Helm(logger)
  const chartManager = new ChartManager(helm, logger)

  const k8 = new K8(configManager, logger)
  const accountManager = new AccountManager(logger, k8)
  const downloader = new PackageDownloader(logger)
  const zippy = new Zippy(logger)
  const helmDepManager = new HelmDependencyManager(downloader, zippy, logger)
  const keytoolDepManager = new KeytoolDependencyManager(downloader, zippy, logger)
  const depManagerMap = new Map()
    .set(constants.HELM, helmDepManager)
    .set(constants.KEYTOOL, keytoolDepManager)
  const depManager = new DependencyManager(logger, depManagerMap)

  const opts = {
    accountManager: accountManager,
    configManager: configManager,
    k8: k8,
    logger: logger,
    chartManager: chartManager,
    helm: helm,
    depManager: depManager
  }

  const accountCmd = new AccountCommand(opts)


  const status = await accountCmd.init(argv)

}

main(process.argv)


