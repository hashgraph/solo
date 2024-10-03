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
import { InitCommand } from '../../../src/commands/init.mjs'
import { expect, describe, it } from '@jest/globals'
import {
  HelmDependencyManager,
  DependencyManager,
  KeytoolDependencyManager
} from '../../../src/core/dependency_managers/index.mjs'
import {
  ChartManager,
  ConfigManager, constants,
  Helm,
  KeyManager,
  logging, PackageDownloader, Zippy
} from '../../../src/core/index.mjs'
import { getK8Instance } from '../../test_util.js'

const testLogger = logging.NewLogger('debug', true)
describe('InitCommand', () => {
  // prepare dependency manger registry
  const downloader = new PackageDownloader(testLogger)
  const zippy = new Zippy(testLogger)
  const helmDepManager = new HelmDependencyManager(downloader, zippy, testLogger)
  const keytoolDepManager = new KeytoolDependencyManager(downloader, zippy, testLogger)
  const depManagerMap = new Map()
    .set(constants.HELM, helmDepManager)
    .set(constants.KEYTOOL, keytoolDepManager)
  const depManager = new DependencyManager(testLogger, depManagerMap)

  const helm = new Helm(testLogger)
  const chartManager = new ChartManager(helm, testLogger)
  const configManager = new ConfigManager(testLogger)

  const keyManager = new KeyManager(testLogger)

  const k8 = getK8Instance(configManager)

  const initCmd = new InitCommand({
    logger: testLogger,
    helm,
    k8,
    chartManager,
    configManager,
    depManager,
    keyManager
  })

  describe('commands', () => {
    it('init execution should succeed', async () => {
      await expect(initCmd.init({})).resolves.toBe(true)
    }, 20000)
  })

  describe('methods', () => {
    it('command definition should return a valid command def', () => {
      const def = initCmd.getCommandDefinition()
      expect(def.name).not.toBeNull()
      expect(def.desc).not.toBeNull()
      expect(def.handler).not.toBeNull()
    })
  })
})
