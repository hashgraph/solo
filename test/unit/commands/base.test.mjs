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
import { expect, it, describe } from '@jest/globals'
import { HelmDependencyManager, DependencyManager } from '../../../src/core/dependency_managers/index.mjs'
import {
  ChartManager,
  ConfigManager,
  Helm,
  logging, PackageDownloader, Zippy,
  constants
} from '../../../src/core/index.mjs'
import { BaseCommand } from '../../../src/commands/base.mjs'
import { K8 } from '../../../src/core/k8.mjs'
import * as flags from '../../../src/commands/flags.mjs'

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
  const k8 = new K8(configManager, testLogger)

  const baseCmd = new BaseCommand({
    logger: testLogger,
    helm,
    k8,
    chartManager,
    configManager,
    depManager
  })

  describe('runShell', () => {
    it('should fail during invalid program check', async () => {
      await expect(baseCmd.run('INVALID_PROGRAM')).rejects.toThrowError()
    })
    it('should succeed during valid program check', async () => {
      await expect(baseCmd.run('echo')).resolves.not.toBeNull()
    })
    it('dynamically alter a class', async () => {
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

      const NewClass = class {
        constructor () {
          this.usedConfigs = new Map()
          flagsList.forEach(flag => {
            this[`_${flag.constName}`] = configManager.getFlag(flag)
            Object.defineProperty(this, flag.constName, {
              get () {
                this.usedConfigs.set(flag.constName, this.usedConfigs.get(flag.constName) + 1 || 1)
                return this[`_${flag.constName}`]
              }
            })
          })
          extraVars.forEach(name => {
            this[`_${name}`] = ''
            Object.defineProperty(this, name, {
              get () {
                this.usedConfigs.set(name, this.usedConfigs.get(name) + 1 || 1)
                return this[`_${name}`]
              },
              set (value) {
                this[`_${name}`] = value
              }
            })
          })
        }

        getUnusedConfigs () {
          const unusedConfigs = []
          flagsList.forEach(flag => {
            if (!this.usedConfigs.has(flag.constName)) {
              unusedConfigs.push(flag.constName)
            }
          })
          extraVars.forEach(item => {
            if (!this.usedConfigs.has(item)) {
              unusedConfigs.push(item)
            }
          })
          return unusedConfigs
        }
      }

      const newClassInstance1 = new NewClass()
      expect(newClassInstance1.releaseTag).toBe('releaseTag1')
      expect(newClassInstance1.tlsClusterIssuerType).toBe('type2')
      expect(newClassInstance1.valuesFile).toBe('file3')
      expect(newClassInstance1.var1).toBe('')
      expect(newClassInstance1.var2).toBe('')
      expect(newClassInstance1.getUnusedConfigs()).toEqual([])

      const newClassInstance2 = new NewClass()
      newClassInstance2.var1 = 'var1'
      newClassInstance2.var2 = 'var2'
      expect(newClassInstance2.var1).toBe('var1')
      expect(newClassInstance2.var2).toBe('var2')
      expect(newClassInstance2.getUnusedConfigs()).toEqual([
        flags.releaseTag.constName,
        flags.tlsClusterIssuerType.constName,
        flags.valuesFile.constName
      ])

      const newClassInstance3 = new NewClass()
      newClassInstance3.var1 = 'var1'
      expect(newClassInstance3.var1).toBe('var1')
      expect(newClassInstance3.tlsClusterIssuerType).toBe('type2')
      expect(newClassInstance3.getUnusedConfigs()).toEqual([
        flags.releaseTag.constName,
        flags.valuesFile.constName,
        'var2'
      ])
    })
  })
})
