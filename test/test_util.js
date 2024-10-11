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
 * @mocha-environment steps
 */
import { expect } from 'chai'
import { describe, it, after, before } from 'mocha'

import fs from 'fs'
import os from 'os'
import path from 'path'
import { ClusterCommand } from '../src/commands/cluster.mjs'
import { InitCommand } from '../src/commands/init.mjs'
import { NetworkCommand } from '../src/commands/network.mjs'
import { NodeCommand } from '../src/commands/node/index.mjs'
import { AccountManager } from '../src/core/account_manager.mjs'
import {
  DependencyManager,
  HelmDependencyManager
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
import { flags } from '../src/commands/index.mjs'
import {
  AccountBalanceQuery,
  AccountCreateTransaction, Hbar, HbarUnit,
  PrivateKey
} from '@hashgraph/sdk'
import { MINUTES, ROOT_CONTAINER, SECONDS } from '../src/core/constants.mjs'
import crypto from 'crypto'
import { AccountCommand } from '../src/commands/account.mjs'
import { SoloError } from '../src/core/errors.mjs'
import { execSync } from 'child_process'
import * as NodeCommandConfigs from '../src/commands/node/configs.mjs'

export const testLogger = logging.NewLogger('debug', true)
export const TEST_CLUSTER = 'solo-e2e'
export const HEDERA_PLATFORM_VERSION_TAG = 'v0.54.0-alpha.4'

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
 * @param {string} testName
 * @param {Object} argv argv for commands
 * @param {K8|null} [k8Arg]
 * @param {InitCommand|null} [initCmdArg]
 * @param {ClusterCommand|null} [clusterCmdArg]
 * @param {NetworkCommand|null} [networkCmdArg]
 * @param {NodeCommand|null} [nodeCmdArg]
 * @param {AccountCommand|null} [accountCmdArg]
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
  const configManager = getTestConfigManager(`${testName}-solo.yaml`)
  configManager.update(argv, true)

  const downloader = new PackageDownloader(testLogger)
  const zippy = new Zippy(testLogger)
  const helmDepManager = new HelmDependencyManager(downloader, zippy, testLogger)
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
 * @param {string} testName
 * @param {Object} argv - argv for commands
 * @param {K8|null} [k8Arg]
 * @param {InitCommand|null} [initCmdArg]
 * @param {ClusterCommand|null} [clusterCmdArg]
 * @param {NetworkCommand|null} [networkCmdArg]
 * @param {NodeCommand|null} [nodeCmdArg]
 * @param {AccountCommand|null} [accountCmdArg]
 * @param {boolean} [startNodes] - start nodes after deployment, default is true
 * @returns {Promise<*>}
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

  return new Promise((resolve) => {
    describe(`Bootstrap network for test [release ${argv[flags.releaseTag.name]}}]`, () => {
      before(() => {
        bootstrapResp.opts.logger.showUser(`------------------------- START: bootstrap (${testName}) ----------------------------`)
      })

      after(() => {
        bootstrapResp.opts.logger.showUser(`------------------------- END: bootstrap (${testName}) ----------------------------`)
        resolve(bootstrapResp)
      })

      it('should cleanup previous deployment', async () => {
        await initCmd.init(argv)

        if (await k8.hasNamespace(namespace)) {
          await k8.deleteNamespace(namespace)

          while (await k8.hasNamespace(namespace)) {
            testLogger.debug(`Namespace ${namespace} still exist. Waiting...`)
            await sleep(1.5 * SECONDS)
          }
        }

        if (!await chartManager.isChartInstalled(constants.SOLO_SETUP_NAMESPACE, constants.SOLO_CLUSTER_SETUP_CHART)) {
          await clusterCmd.setup(argv)
        }
      }).timeout(2 * MINUTES)

      it('generate key files', async () => {
        await expect(nodeCmd.handlers.keys(argv)).to.eventually.be.ok
        expect(nodeCmd.getUnusedConfigs(NodeCommandConfigs.KEYS_CONFIGS_NAME)).to.deep.equal([
          flags.devMode.constName,
          flags.quiet.constName
        ])
      }).timeout(2 * MINUTES)

      it('should succeed with network deploy', async () => {
        await networkCmd.deploy(argv)

        expect(networkCmd.getUnusedConfigs(NetworkCommand.DEPLOY_CONFIGS_NAME)).to.deep.equal([
          flags.apiPermissionProperties.constName,
          flags.applicationEnv.constName,
          flags.applicationProperties.constName,
          flags.bootstrapProperties.constName,
          flags.chainId.constName,
          flags.log4j2Xml.constName,
          flags.profileFile.constName,
          flags.profileName.constName,
          flags.quiet.constName,
          flags.settingTxt.constName
        ])
      }).timeout(2 * MINUTES)

      if (startNodes) {
        it('should succeed with node setup command', async () => {
          // cache this, because `solo node setup.finalize()` will reset it to false
          try {
            await expect(nodeCmd.handlers.setup(argv)).to.eventually.be.ok
            expect(nodeCmd.getUnusedConfigs(NodeCommandConfigs.SETUP_CONFIGS_NAME)).to.deep.equal([
              flags.devMode.constName
            ])
          } catch (e) {
            nodeCmd.logger.showUserError(e)
            expect.fail()
          }
        }).timeout(4 * MINUTES)

        it('should succeed with node start command', async () => {
          try {
            await expect(nodeCmd.handlers.start(argv)).to.eventually.be.ok
          } catch (e) {
            nodeCmd.logger.showUserError(e)
            expect.fail()
          }
        }).timeout(30 * MINUTES)
      }
    })
  })
}

export function balanceQueryShouldSucceed (accountManager, cmd, namespace) {
  it('Balance query should succeed', async () => {
    try {
      expect(accountManager._nodeClient).to.be.null
      await accountManager.loadNodeClient(namespace)
      expect(accountManager._nodeClient).not.to.be.null

      const balance = await new AccountBalanceQuery()
        .setAccountId(accountManager._nodeClient.getOperator().accountId)
        .execute(accountManager._nodeClient)

      expect(balance.hbars).not.be.null
    } catch (e) {
      cmd.logger.showUserError(e)
      expect.fail()
    }
    await sleep(1 * SECONDS)
  }).timeout(2 * MINUTES)
}

export function accountCreationShouldSucceed (accountManager, nodeCmd, namespace) {
  it('Account creation should succeed', async () => {
    try {
      await accountManager.loadNodeClient(namespace)
      expect(accountManager._nodeClient).not.to.be.null
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

      expect(accountInfo.accountId).not.to.be.null
      expect(accountInfo.balance).to.equal(amount)
    } catch (e) {
      nodeCmd.logger.showUserError(e)
      expect.fail()
    }
  }).timeout(2 * MINUTES)
}

export async function getNodeAliasesPrivateKeysHash (networkNodeServicesMap, namespace, k8, destDir) {
  const dataKeysDir = path.join(constants.HEDERA_HAPI_PATH, 'data', 'keys')
  const tlsKeysDir = constants.HEDERA_HAPI_PATH
  const nodeKeyHashMap = new Map()
  for (const networkNodeServices of networkNodeServicesMap.values()) {
    const keyHashMap = new Map()
    const nodeAlias = networkNodeServices.nodeAlias
    const uniqueNodeDestDir = path.join(destDir, nodeAlias)
    if (!fs.existsSync(uniqueNodeDestDir)) {
      fs.mkdirSync(uniqueNodeDestDir, { recursive: true })
    }
    await addKeyHashToMap(k8, nodeAlias, dataKeysDir, uniqueNodeDestDir, keyHashMap, Templates.renderGossipPemPrivateKeyFile(constants.SIGNING_KEY_PREFIX, nodeAlias))
    await addKeyHashToMap(k8, nodeAlias, tlsKeysDir, uniqueNodeDestDir, keyHashMap, 'hedera.key')
    nodeKeyHashMap.set(nodeAlias, keyHashMap)
  }
  return nodeKeyHashMap
}

async function addKeyHashToMap (k8, nodeAlias, keyDir, uniqueNodeDestDir, keyHashMap, privateKeyFileName) {
  await k8.copyFrom(
    Templates.renderNetworkPodName(nodeAlias),
    ROOT_CONTAINER,
    path.join(keyDir, privateKeyFileName),
    uniqueNodeDestDir)
  const keyBytes = await fs.readFileSync(path.join(uniqueNodeDestDir, privateKeyFileName))
  const keyString = keyBytes.toString()
  keyHashMap.set(privateKeyFileName, crypto.createHash('sha256').update(keyString).digest('base64'))
}

/**
 * @param {ConfigManager} configManager
 * @returns {K8}
 */
export function getK8Instance (configManager) {
  try {
    return new K8(configManager, testLogger)
    // TODO: return a mock without running the init within constructor after we convert to Mocha, Jest ESModule mocks are broke.
  } catch (e) {
    if (!(e instanceof SoloError)) {
      throw e
    }

    // Set envs
    process.env.SOLO_CLUSTER_NAME = 'solo-e2e'
    process.env.SOLO_NAMESPACE = 'solo-e2e'
    process.env.SOLO_CLUSTER_SETUP_NAMESPACE = 'solo-setup'

    // Create cluster
    execSync(`kind create cluster --name "${process.env.SOLO_CLUSTER_NAME}"`, { stdio: 'inherit' })
    return new K8(configManager, testLogger)
  }
}
