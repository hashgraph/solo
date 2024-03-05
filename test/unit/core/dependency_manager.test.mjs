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
import { DependencyManager, PackageDownloader, logging, constants } from '../../../src/core/index.mjs'
import * as testUtil from '../../test_util.js'

const testLogger = logging.NewLogger('debug')
describe('DependencyManager', () => {
  const downloadManager = new PackageDownloader(testLogger)
  const depManager = new DependencyManager(testLogger, downloadManager)

  describe('checks', () => {
    it('should succeed with checkHelm', async () => {
      await expect(depManager.checkHelm()).resolves.toBe(true)
    })
  })

  describe('checkDependency', () => {
    it('should fail during invalid dependency check', async () => {
      await expect(depManager.checkDependency('INVALID_PROGRAM')).resolves.toBeFalsy()
    })

    it('should succeed during kubectl dependency check', async () => {
      await expect(depManager.checkDependency(constants.HELM)).resolves.toBe(true)
    })

    it('should succeed in downloading helm installer', async () => {
      const downloadedScript = `${testUtil.getTestCacheDir()}/get-helm-3`
      await expect(depManager.downloadInstaller(DependencyManager.HELM_INSTALLER, downloadedScript)).resolves.toBeTruthy()
      expect(fs.existsSync(downloadedScript)).toBeTruthy()
    })
  })
})
