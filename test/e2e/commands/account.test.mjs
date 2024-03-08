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
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it
} from '@jest/globals'
import { DependencyManager, HelmDependencyManager } from '../../../src/core/dependency_managers/index.mjs'
import {
  ChartManager,
  ConfigManager,
  constants,
  Helm,
  K8, PackageDownloader, Zippy
} from '../../../src/core/index.mjs'
import { getTestCacheDir, testLogger } from '../../test_util.js'
import path from 'path'
import { AccountManager } from '../../../src/core/account_manager.mjs'
import { AccountCommand } from '../../../src/commands/account.mjs'
import { flags } from '../../../src/commands/index.mjs'
import { sleep } from '../../../src/core/helpers.mjs'

describe('account commands should work correctly', () => {
  const defaultTimeout = 20000
  let accountCmd
  let accountManager
  let configManager
  let k8
  let helm
  let chartManager
  let argv = {}
  let accountId1
  let accountId2

  beforeAll(() => {
    configManager = new ConfigManager(testLogger, path.join(getTestCacheDir('accountCmd'), 'solo.config'))
    k8 = new K8(configManager, testLogger)
    accountManager = new AccountManager(testLogger, k8, constants)
    helm = new Helm(testLogger)
    chartManager = new ChartManager(helm, testLogger)
    const downloader = new PackageDownloader(testLogger)
    const zippy = new Zippy(testLogger)
    const helmDepManager = new HelmDependencyManager(downloader, zippy, testLogger)
    const depManagerMap = new Map().set(constants.HELM, helmDepManager)
    const depManager = new DependencyManager(testLogger, depManagerMap)

    accountCmd = new AccountCommand({
      logger: testLogger,
      helm,
      k8,
      chartManager,
      configManager,
      depManager,
      accountManager
    })
  })

  beforeEach(() => {
    configManager.reset()
    argv = {}
    argv[flags.cacheDir.name] = getTestCacheDir('accountCmd')
    argv[flags.namespace.name] = 'solo-e2e'
    argv[flags.clusterName.name] = 'kind-solo-e2e'
    argv[flags.clusterSetupNamespace.name] = 'solo-e2e-cluster'
    configManager.update(argv, true)
  })

  afterEach(async () => {
    await sleep(5) // give a few ticks so that connections can close
  })

  it('account create with no options', async () => {
    try {
      await expect(accountCmd.create(argv)).resolves.toBeTruthy()

      const accountInfo = accountCmd.accountInfo
      expect(accountInfo).not.toBeNull()
      expect(accountInfo.accountId).not.toBeNull()
      accountId1 = accountInfo.accountId
      expect(accountInfo.privateKey).not.toBeNull()
      expect(accountInfo.publicKey).not.toBeNull()
      expect(accountInfo.balance).toEqual(flags.amount.definition.defaultValue)
    } catch (e) {
      testLogger.showUserError(e)
      expect(e).toBeNull()
    }
  }, defaultTimeout)

  it('account create with private key and hbar amount options', async () => {
    try {
      argv[flags.privateKey.name] = constants.GENESIS_KEY
      argv[flags.amount.name] = 777
      configManager.update(argv, true)

      await expect(accountCmd.create(argv)).resolves.toBeTruthy()

      const accountInfo = accountCmd.accountInfo
      expect(accountInfo).not.toBeNull()
      expect(accountInfo.accountId).not.toBeNull()
      accountId2 = accountInfo.accountId
      expect(accountInfo.privateKey.toString()).toEqual(constants.GENESIS_KEY)
      expect(accountInfo.publicKey).not.toBeNull()
      expect(accountInfo.balance).toEqual(777)
    } catch (e) {
      testLogger.showUserError(e)
      expect(e).toBeNull()
    }
  }, defaultTimeout)

  it('account update with account', async () => {
    try {
      argv[flags.accountId.name] = accountId1
      configManager.update(argv, true)

      await expect(accountCmd.update(argv)).resolves.toBeTruthy()

      const accountInfo = accountCmd.accountInfo
      expect(accountInfo).not.toBeNull()
      expect(accountInfo.accountId).toEqual(argv[flags.accountId.name])
      expect(accountInfo.privateKey).toBeUndefined()
      expect(accountInfo.publicKey).not.toBeNull()
      expect(accountInfo.balance).toEqual(200)
    } catch (e) {
      testLogger.showUserError(e)
      expect(e).toBeNull()
    }
  }, defaultTimeout)

  it('account update with account, amount, new private key, and standard out options', async () => {
    try {
      argv[flags.accountId.name] = accountId2
      argv[flags.privateKey.name] = constants.GENESIS_KEY
      argv[flags.amount.name] = 333
      configManager.update(argv, true)

      await expect(accountCmd.update(argv)).resolves.toBeTruthy()

      const accountInfo = accountCmd.accountInfo
      expect(accountInfo).not.toBeNull()
      expect(accountInfo.accountId).toEqual(argv[flags.accountId.name])
      expect(accountInfo.privateKey).toBeUndefined()
      expect(accountInfo.publicKey).not.toBeNull()
      expect(accountInfo.balance).toEqual(1110)
    } catch (e) {
      testLogger.showUserError(e)
      expect(e).toBeNull()
    }
  }, defaultTimeout)

  it('account get with account option', async () => {
    try {
      argv[flags.accountId.name] = accountId1
      configManager.update(argv, true)

      await expect(accountCmd.get(argv)).resolves.toBeTruthy()
      const accountInfo = accountCmd.accountInfo
      expect(accountInfo).not.toBeNull()
      expect(accountInfo.accountId).toEqual(argv[flags.accountId.name])
      expect(accountInfo.privateKey).toBeUndefined()
      expect(accountInfo.publicKey).toBeTruthy()
      expect(accountInfo.balance).toEqual(200)
    } catch (e) {
      testLogger.showUserError(e)
      expect(e).toBeNull()
    }
  }, defaultTimeout)

  it('account get with account id option', async () => {
    try {
      argv[flags.accountId.name] = accountId2
      configManager.update(argv, true)

      await expect(accountCmd.get(argv)).resolves.toBeTruthy()
      const accountInfo = accountCmd.accountInfo
      expect(accountInfo).not.toBeNull()
      expect(accountInfo.accountId).toEqual(argv[flags.accountId.name])
      expect(accountInfo.privateKey).toBeUndefined()
      expect(accountInfo.publicKey).toBeTruthy()
      expect(accountInfo.balance).toEqual(1110)
    } catch (e) {
      testLogger.showUserError(e)
      expect(e).toBeNull()
    }
  }, defaultTimeout)
})
