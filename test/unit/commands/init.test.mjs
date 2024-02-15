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
  ChartManager,
  ConfigManager,
  DependencyManager,
  Helm,
  KeyManager,
  logging
} from '../../../src/core/index.mjs'
import { K8 } from '../../../src/core/k8.mjs'

const testLogger = logging.NewLogger('debug')
describe('InitCommand', () => {
  const helm = new Helm(testLogger)
  const chartManager = new ChartManager(helm, testLogger)
  const configManager = new ConfigManager(testLogger)
  const depManager = new DependencyManager(testLogger)
  const keyManager = new KeyManager(testLogger)
  const k8 = new K8(configManager, testLogger)

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

  describe('static', () => {
    it('command definition should return a valid command def', async () => {
      const def = InitCommand.getCommandDefinition(initCmd)
      expect(def.name).not.toBeNull()
      expect(def.desc).not.toBeNull()
      expect(def.handler).not.toBeNull()
    })
  })
})
