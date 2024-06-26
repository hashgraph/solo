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
  })
})
