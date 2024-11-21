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
import { expect } from 'chai'

import { HelmDependencyManager, DependencyManager } from '../../../src/core/dependency_managers/index.js'
import {
  ChartManager,
  ConfigManager,
  Helm,
  logging, PackageDownloader, Zippy,
  constants,
  K8, LocalConfig
} from '../../../src/core/index.js'
import { BaseCommand } from '../../../src/commands/base.js'
import * as flags from '../../../src/commands/flags.js'
import sinon from 'sinon'
import path from 'path'
import { BASE_TEST_DIR } from '../../test_util.js'

const testLogger = logging.NewLogger('debug', true)

describe('BaseCommand', () => {
  const helm = new Helm(testLogger)
  const chartManager = new ChartManager(helm, testLogger)
  const configManager = new ConfigManager(testLogger)

  // prepare dependency manger registry
  const downloader = new PackageDownloader(testLogger)
  const zippy = new Zippy(testLogger)
  const helmDepManager = new HelmDependencyManager(downloader, zippy, testLogger)
  const depManagerMap = new Map().set(constants.HELM, helmDepManager)
  const depManager = new DependencyManager(testLogger, depManagerMap)
  const localConfig = new LocalConfig(path.join(BASE_TEST_DIR, 'local-config.yaml'), testLogger)

  let sandbox = sinon.createSandbox()

  let baseCmd : BaseCommand

  describe('runShell', () => {
    before(() => {
      sandbox = sinon.createSandbox()
      sandbox.stub(K8.prototype, 'init').callsFake(() => this)
      const k8 = new K8(configManager, testLogger)

      // @ts-ignore
      baseCmd = new BaseCommand({
        logger: testLogger,
        helm,
        k8,
        chartManager,
        configManager,
        depManager,
        localConfig
      })
    })

    after(() => {
     sandbox.restore()
    })

    it('should fail during invalid program check', async () => {
      await expect(baseCmd.run('INVALID_PROGRAM')).to.be.rejected
    })
    it('should succeed during valid program check', async () => {
      await expect(baseCmd.run('echo')).to.eventually.not.be.null
    })
    it('getConfig tracks property usage', () => {
      const flagsList = [
        flags.releaseTag,
        flags.tlsClusterIssuerType,
        flags.valuesFile
      ]
      const argv = {}
      argv[flags.releaseTag.name] = 'releaseTag1'
      argv[flags.tlsClusterIssuerType.name] = 'type2'
      argv[flags.valuesFile.name] = 'file3'
      configManager.update(argv)

      const extraVars = ['var1', 'var2']

      interface newClassInstance {
        releaseTag: string
        tlsClusterIssuerType: string
        valuesFile: string
        var1: string
        var2: string
        getUnusedConfigs: () => string[]
      }

      const NEW_CLASS1_NAME = 'newClassInstance1'
      const newClassInstance1 = baseCmd.getConfig(NEW_CLASS1_NAME, flagsList, extraVars) as newClassInstance
      expect(newClassInstance1.releaseTag).to.equal('releaseTag1')
      expect(newClassInstance1.tlsClusterIssuerType).to.equal('type2')
      expect(newClassInstance1.valuesFile).to.equal('file3')
      expect(newClassInstance1.var1).to.equal('')
      expect(newClassInstance1.var2).to.equal('')
      expect(baseCmd.getUnusedConfigs(NEW_CLASS1_NAME)).to.deep.equal([])

      const NEW_CLASS2_NAME = 'newClassInstance2'
      const newClassInstance2 = baseCmd.getConfig(NEW_CLASS2_NAME, flagsList, extraVars) as newClassInstance
      newClassInstance2.var1 = 'var1'
      newClassInstance2.var2 = 'var2'
      expect(newClassInstance2.var1).to.equal('var1')
      expect(newClassInstance2.var2).to.equal('var2')
      expect(baseCmd.getUnusedConfigs(NEW_CLASS2_NAME)).to.deep.equal([
        flags.releaseTag.constName,
        flags.tlsClusterIssuerType.constName,
        flags.valuesFile.constName
      ])

      const NEW_CLASS3_NAME = 'newClassInstance3'
      const newClassInstance3 = baseCmd.getConfig(NEW_CLASS3_NAME, flagsList, extraVars) as newClassInstance
      newClassInstance3.var1 = 'var1'
      expect(newClassInstance3.var1).to.equal('var1')
      expect(newClassInstance3.tlsClusterIssuerType).to.equal('type2')
      expect(baseCmd.getUnusedConfigs(NEW_CLASS3_NAME)).to.deep.equal([
        flags.releaseTag.constName,
        flags.valuesFile.constName,
        'var2'
      ])

      const newClassInstance4 = baseCmd.getConfig('newClassInstance4', []) as newClassInstance
      expect(newClassInstance4.getUnusedConfigs()).to.deep.equal([])
    })
  })
})
