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
import { describe, it } from 'mocha'
import { expect } from 'chai'

import { InitCommand } from '../../../../src/commands/init.js'
import {
  HelmDependencyManager,
  DependencyManager
} from '../../../../src/core/dependency_managers/index.js'
import {
  ChartManager, ConfigManager, constants, Helm, K8, KeyManager, LeaseManager,
  LocalConfig, logging, PackageDownloader, RemoteConfigManager, Zippy
} from '../../../../src/core/index.js'
import { SECONDS } from '../../../../src/core/constants.js'
import sinon from 'sinon'
import { IntervalLeaseRenewalService } from '../../../../src/core/lease/lease_renewal.js'
import path from 'path'
import { BASE_TEST_DIR } from '../../../test_util.js'

const testLogger = logging.NewLogger('debug', true)
describe('InitCommand', () => {
  // prepare dependency manger registry
  const downloader = new PackageDownloader(testLogger)
  const zippy = new Zippy(testLogger)
  const helmDepManager = new HelmDependencyManager(downloader, zippy, testLogger)
  const depManagerMap = new Map()
    .set(constants.HELM, helmDepManager)
  const depManager = new DependencyManager(testLogger, depManagerMap)

  const helm = new Helm(testLogger)
  const chartManager = new ChartManager(helm, testLogger)
  const configManager = new ConfigManager(testLogger)
  let k8 : K8
  let localConfig: LocalConfig

  const keyManager = new KeyManager(testLogger)

  let leaseManager: LeaseManager
  let remoteConfigManager: RemoteConfigManager

  let sandbox = sinon.createSandbox()
  let initCmd: InitCommand

  before(() => {
    sandbox = sinon.createSandbox()
    sandbox.stub(K8.prototype, 'init').callsFake(() => this)
    k8 = new K8(configManager, testLogger)
    localConfig = new LocalConfig(path.join(BASE_TEST_DIR, 'local-config.yaml'), testLogger, k8, configManager)
    remoteConfigManager = new RemoteConfigManager(k8, testLogger, localConfig, configManager)
    leaseManager = new LeaseManager(k8, configManager, testLogger, new IntervalLeaseRenewalService())
    // @ts-ignore
    initCmd = new InitCommand({
      logger: testLogger, helm, k8, chartManager, configManager, depManager, keyManager, leaseManager, localConfig, remoteConfigManager
    })
  })

  after(() => {
    sandbox.restore()
  })


  describe('commands', () => {
    it('init execution should succeed', async () => {
      await expect(initCmd.init({})).to.eventually.equal(true)
    }).timeout(60 * SECONDS)
  })

  describe('methods', () => {
    it('command definition should return a valid command def', () => {
      const def = initCmd.getCommandDefinition()

      // @ts-ignore
      expect(def.name).not.to.be.null
      expect(def.desc).not.to.be.null
      expect(def.handler).not.to.be.null
    })
  })
})
