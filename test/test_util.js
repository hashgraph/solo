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
import { afterAll, beforeAll, describe, expect, it } from '@jest/globals'
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
  PlatformInstaller, ProfileManager, Templates,
  Zippy
} from '../src/core/index.mjs'
import {
  AccountBalanceQuery,
  AccountCreateTransaction, Hbar, HbarUnit,
  PrivateKey
} from '@hashgraph/sdk'
import { ROOT_CONTAINER } from '../src/core/constants.mjs'
import crypto from 'crypto'
import { AccountCommand } from '../src/commands/account.mjs'

export const testLogger = logging.NewLogger('debug', true)
export const TEST_CLUSTER = 'solo-e2e'
export const HEDERA_PLATFORM_VERSION_TAG = 'v0.53.2'

export function getTestCacheDir (testName) {
  const baseDir = 'test/data/tmp'
  const d = testName ? path.join(baseDir, testName) : baseDir

  if (!fs.existsSync(d)) {
    fs.mkdirSync(d, { recursive: true })
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
 * Initialize common test variables
 *
 * @param testName test name
 * @param argv argv for commands
 * @param k8Arg an instance of core/K8
 * @param initCmdArg an instance of command/InitCommand
 * @param clusterCmdArg an instance of command/ClusterCommand
 * @param networkCmdArg an instance of command/NetworkCommand
 * @param nodeCmdArg an instance of command/NodeCommand
 * @param accountCmdArg an instance of command/AccountCommand
 */
export function bootstrapTestVariables (testName, argv,
  k8Arg = null,
  initCmdArg = null,
  clusterCmdArg = null,
  networkCmdArg = null,
  nodeCmdArg = null,
  accountCmdArg = null
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
  const accountManager = new AccountManager(testLogger, k8, constants)
  const platformInstaller = new PlatformInstaller(testLogger, k8, configManager, accountManager)
  const profileManager = new ProfileManager(testLogger, configManager)
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
    keytoolDepManager,
    profileManager
  }

  const initCmd = initCmdArg || new InitCommand(opts)
  const clusterCmd = clusterCmdArg || new ClusterCommand(opts)
  const networkCmd = networkCmdArg || new NetworkCommand(opts)
  const nodeCmd = nodeCmdArg || new NodeCommand(opts)
  const accountCmd = accountCmdArg || new AccountCommand(opts, constants.SHORTER_SYSTEM_ACCOUNTS)
  return {
    namespace,
    opts,
    cmd: {
      initCmd,
      clusterCmd,
      networkCmd,
      nodeCmd,
      accountCmd
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
 * @param accountCmdArg an instance of command/AccountCommand
 * @param startNodes start nodes after deployment, default is true
 */
export function bootstrapNetwork (testName, argv,
  k8Arg = null,
  initCmdArg = null,
  clusterCmdArg = null,
  networkCmdArg = null,
  nodeCmdArg = null,
  accountCmdArg = null,
  startNodes = true
) {
  const bootstrapResp = bootstrapTestVariables(testName, argv, k8Arg, initCmdArg, clusterCmdArg, networkCmdArg, nodeCmdArg, accountCmdArg)
  const namespace = bootstrapResp.namespace
  const initCmd = bootstrapResp.cmd.initCmd
  const k8 = bootstrapResp.opts.k8
  const clusterCmd = bootstrapResp.cmd.clusterCmd
  const networkCmd = bootstrapResp.cmd.networkCmd
  const nodeCmd = bootstrapResp.cmd.nodeCmd
  const chartManager = bootstrapResp.opts.chartManager

  describe(`Bootstrap network for test [release ${argv[flags.releaseTag.name]}}]`, () => {
    beforeAll(() => {
      bootstrapResp.opts.logger.showUser(`------------------------- START: bootstrap (${testName}) ----------------------------`)
    })

    afterAll(() => {
      bootstrapResp.opts.logger.showUser(`------------------------- END: bootstrap (${testName}) ----------------------------`)
    })

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
    }, 120000)

    it('should succeed with network deploy', async () => {
      expect.assertions(1)
      await networkCmd.deploy(argv)

      expect(networkCmd.getUnusedConfigs(NetworkCommand.DEPLOY_CONFIGS_NAME)).toEqual([
        flags.apiPermissionProperties.constName,
        flags.app.constName,
        flags.applicationEnv.constName,
        flags.applicationProperties.constName,
        flags.bootstrapProperties.constName,
        flags.chainId.constName,
        flags.deployHederaExplorer.constName,
        flags.deployMirrorNode.constName,
        flags.hederaExplorerTlsHostName.constName,
        flags.hederaExplorerTlsLoadBalancerIp.constName,
        flags.log4j2Xml.constName,
        flags.profileFile.constName,
        flags.profileName.constName,
        flags.settingTxt.constName,
        flags.tlsClusterIssuerType.constName
      ])
    }, 180000)

    if (startNodes) {
      it('should succeed with node setup command', async () => {
        expect.assertions(2)
        // cache this, because `solo node setup.finalize()` will reset it to false
        const generateGossipKeys = bootstrapResp.opts.configManager.getFlag(flags.generateGossipKeys)
        try {
          await expect(nodeCmd.setup(argv)).resolves.toBeTruthy()
          const expectedUnusedConfigs = []
          expectedUnusedConfigs.push(flags.appConfig.constName)
          expectedUnusedConfigs.push(flags.devMode.constName)
          if (!generateGossipKeys) {
            expectedUnusedConfigs.push('curDate')
          }
          expect(nodeCmd.getUnusedConfigs(NodeCommand.SETUP_CONFIGS_NAME)).toEqual(expectedUnusedConfigs)
        } catch (e) {
          nodeCmd.logger.showUserError(e)
          expect(e).toBeNull()
        }
      }, 240000)

      it('should succeed with node start command', async () => {
        expect.assertions(1)
        try {
          await expect(nodeCmd.start(argv)).resolves.toBeTruthy()
        } catch (e) {
          nodeCmd.logger.showUserError(e)
          expect(e).toBeNull()
        }
      }, 1800000)
    }
  })

  return bootstrapResp
}

export function balanceQueryShouldSucceed (accountManager, cmd, namespace) {
  it('Balance query should succeed', async () => {
    expect.assertions(3)

    try {
      expect(accountManager._nodeClient).toBeNull()
      await accountManager.loadNodeClient(namespace)
      expect(accountManager._nodeClient).not.toBeNull()

      const balance = await new AccountBalanceQuery()
        .setAccountId(accountManager._nodeClient.getOperator().accountId)
        .execute(accountManager._nodeClient)

      expect(balance.hbars).not.toBeNull()
    } catch (e) {
      cmd.logger.showUserError(e)
      expect(e).toBeNull()
    }
    await sleep(1000)
  }, 120000)
}

export function accountCreationShouldSucceed (accountManager, nodeCmd, namespace) {
  it('Account creation should succeed', async () => {
    expect.assertions(3)

    try {
      await accountManager.loadNodeClient(namespace)
      expect(accountManager._nodeClient).not.toBeNull()
      const privateKey = PrivateKey.generate()
      const amount = 100

      const newAccount = await new AccountCreateTransaction()
        .setKey(privateKey)
        .setInitialBalance(Hbar.from(amount, HbarUnit.Hbar))
        .execute(accountManager._nodeClient)

      // Get the new account ID
      const getReceipt = await newAccount.getReceipt(accountManager._nodeClient)
      const accountInfo = {
        accountId: getReceipt.accountId.toString(),
        privateKey: privateKey.toString(),
        publicKey: privateKey.publicKey.toString(),
        balance: amount
      }

      expect(accountInfo.accountId).not.toBeNull()
      expect(accountInfo.balance).toEqual(amount)
    } catch (e) {
      nodeCmd.logger.showUserError(e)
      expect(e).toBeNull()
    }
  }, 120000)
}

export async function getNodeIdsPrivateKeysHash (networkNodeServicesMap, namespace, k8, destDir) {
  const dataKeysDir = path.join(constants.HEDERA_HAPI_PATH, 'data', 'keys')
  const tlsKeysDir = constants.HEDERA_HAPI_PATH
  const nodeKeyHashMap = new Map()
  for (const networkNodeServices of networkNodeServicesMap.values()) {
    const keyHashMap = new Map()
    const nodeId = networkNodeServices.nodeName
    const uniqueNodeDestDir = path.join(destDir, nodeId)
    if (!fs.existsSync(uniqueNodeDestDir)) {
      fs.mkdirSync(uniqueNodeDestDir, { recursive: true })
    }
    await addKeyHashToMap(k8, nodeId, dataKeysDir, uniqueNodeDestDir, keyHashMap, Templates.renderGossipPemPrivateKeyFile(constants.SIGNING_KEY_PREFIX, nodeId))
    await addKeyHashToMap(k8, nodeId, dataKeysDir, uniqueNodeDestDir, keyHashMap, Templates.renderGossipPemPrivateKeyFile(constants.AGREEMENT_KEY_PREFIX, nodeId))

    await addKeyHashToMap(k8, nodeId, tlsKeysDir, uniqueNodeDestDir, keyHashMap, 'hedera.key')
    nodeKeyHashMap.set(nodeId, keyHashMap)
  }
  return nodeKeyHashMap
}

async function addKeyHashToMap (k8, nodeId, keyDir, uniqueNodeDestDir, keyHashMap, privateKeyFileName) {
  await k8.copyFrom(
    Templates.renderNetworkPodName(nodeId),
    ROOT_CONTAINER,
    path.join(keyDir, privateKeyFileName),
    uniqueNodeDestDir)
  const keyBytes = await fs.readFileSync(path.join(uniqueNodeDestDir, privateKeyFileName))
  const keyString = keyBytes.toString()
  keyHashMap.set(privateKeyFileName, crypto.createHash('sha256').update(keyString).digest('base64'))
}
