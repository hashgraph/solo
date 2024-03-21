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
import { describe, expect, it } from '@jest/globals'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { ClusterCommand } from '../src/commands/cluster.mjs'
import { flags } from '../src/commands/index.mjs'
import { InitCommand } from '../src/commands/init.mjs'
import { NetworkCommand } from '../src/commands/network.mjs'
import { NodeCommand } from '../src/commands/node.mjs'
import { AccountManager } from '../src/core/account_manager.mjs'
import {
  DependencyManager,
  HelmDependencyManager,
  KeytoolDependencyManager
} from '../src/core/dependency_managers/index.mjs'
import { sleep } from '../src/core/helpers.mjs'
import {
  ChartManager,
  ConfigManager,
  constants,
  Helm,
  K8,
  KeyManager,
  logging,
  PackageDownloader,
  PlatformInstaller,
  Zippy
} from '../src/core/index.mjs'

export const testLogger = logging.NewLogger('debug')
export const TEST_CLUSTER = 'solo-e2e'

export function getTestCacheDir (testName) {
  const baseDir = 'test/data/tmp'
  const d = testName ? path.join(baseDir, testName) : baseDir

  if (!fs.existsSync(d)) {
    fs.mkdirSync(d)
  }
  return d
}

export function getTmpDir () {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'solo-'))
}

/**
 * Return a config manager with the specified config file name
 * @param fileName solo config file name
 * @return {ConfigManager}
 */
export function getTestConfigManager (fileName = 'solo-test.config') {
  return new ConfigManager(testLogger, path.join(getTestCacheDir(), fileName))
}

/**
 * Get argv with defaults
 */
export function getDefaultArgv () {
  const argv = {}
  for (const f of flags.allFlags) {
    argv[f.name] = f.definition.defaultValue
  }
  return argv
}

/**
 * Initialize command test variables
 *
 * @param testName test name
 * @param argv argv for commands
 * @param k8Arg an instance of core/K8
 * @param initCmdArg an instance of command/InitCommand
 * @param clusterCmdArg an instance of command/ClusterCommand
 * @param networkCmdArg an instance of command/NetworkCommand
 * @param nodeCmdArg an instance of command/NodeCommand
 */
export function bootstrapTestVariables (testName, argv,
  k8Arg = null,
  initCmdArg = null,
  clusterCmdArg = null,
  networkCmdArg = null,
  nodeCmdArg = null
) {
  const namespace = argv[flags.namespace.name] || 'bootstrap-ns'
  const cacheDir = argv[flags.cacheDir.name] || getTestCacheDir(testName)
  const configManager = getTestConfigManager(`${testName}-solo.config`)
  configManager.update(argv, true)

  const downloader = new PackageDownloader(testLogger)
  const zippy = new Zippy(testLogger)
  const helmDepManager = new HelmDependencyManager(downloader, zippy, testLogger)
  const keytoolDepManager = new KeytoolDependencyManager(downloader, zippy, testLogger)
  const depManagerMap = new Map().set(constants.HELM, helmDepManager)
  const depManager = new DependencyManager(testLogger, depManagerMap)
  const keyManager = new KeyManager(testLogger)
  const helm = new Helm(testLogger)
  const chartManager = new ChartManager(helm, testLogger)
  const k8 = k8Arg || new K8(configManager, testLogger)
  const platformInstaller = new PlatformInstaller(testLogger, k8)
  const accountManager = new AccountManager(testLogger, k8, constants)
  const opts = {
    logger: testLogger,
    helm,
    k8,
    chartManager,
    configManager,
    downloader,
    platformInstaller,
    depManager,
    keyManager,
    accountManager,
    cacheDir,
    keytoolDepManager
  }

  const initCmd = initCmdArg || new InitCommand(opts)
  const clusterCmd = clusterCmdArg || new ClusterCommand(opts)
  const networkCmd = networkCmdArg || new NetworkCommand(opts)
  const nodeCmd = nodeCmdArg || new NodeCommand(opts)
  return {
    namespace,
    opts,
    cmd: {
      initCmd,
      clusterCmd,
      networkCmd,
      nodeCmd
    }
  }
}

/**
 * Bootstrap network in a given namespace
 *
 * @param testName test name
 * @param argv argv for commands
 * @param k8Arg an instance of core/K8
 * @param initCmdArg an instance of command/InitCommand
 * @param clusterCmdArg an instance of command/ClusterCommand
 * @param networkCmdArg an instance of command/NetworkCommand
 * @param nodeCmdArg an instance of command/NodeCommand
 */
export function bootstrapNetwork (testName, argv,
  k8Arg = null,
  initCmdArg = null,
  clusterCmdArg = null,
  networkCmdArg = null,
  nodeCmdArg = null
) {
  const bootstrapResp = bootstrapTestVariables(testName, argv, k8Arg, initCmdArg, clusterCmdArg, networkCmdArg, nodeCmdArg)
  const namespace = bootstrapResp.namespace
  const initCmd = bootstrapResp.cmd.initCmd
  const k8 = bootstrapResp.opts.k8
  const clusterCmd = bootstrapResp.cmd.clusterCmd
  const networkCmd = bootstrapResp.cmd.networkCmd
  const nodeCmd = bootstrapResp.cmd.nodeCmd
  const chartManager = bootstrapResp.opts.chartManager

  describe(`Bootstrap network for test [release ${argv[flags.releaseTag.name]}, keyFormat: ${argv[flags.keyFormat.name]}]`, () => {
    it('should cleanup previous deployment', async () => {
      await initCmd.init(argv)

      if (await k8.hasNamespace(namespace)) {
        await k8.deleteNamespace(namespace)

        while (await k8.hasNamespace(namespace)) {
          testLogger.debug(`Namespace ${namespace} still exist. Waiting...`)
          await sleep(1500)
        }
      }

      if (!await chartManager.isChartInstalled(constants.FULLSTACK_SETUP_NAMESPACE, constants.FULLSTACK_CLUSTER_SETUP_CHART)) {
        await clusterCmd.setup(argv)
      }
    }, 60000)

    it('should succeed with network deploy', async () => {
      await networkCmd.deploy(argv)
    }, 60000)

    it('should succeed with node setup command', async () => {
      expect.assertions(1)
      try {
        await expect(nodeCmd.setup(argv)).resolves.toBeTruthy()
      } catch (e) {
        nodeCmd.logger.showUserError(e)
        expect(e).toBeNull()
      }
    }, 120000)

    it('should succeed with node start command', async () => {
      expect.assertions(1)
      try {
        await expect(nodeCmd.start(argv)).resolves.toBeTruthy()
      } catch (e) {
        nodeCmd.logger.showUserError(e)
        expect(e).toBeNull()
      }
    }, 1200000)
  })

  return bootstrapResp
}
