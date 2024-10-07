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
import { describe, it } from 'mocha'

import { DependencyManager, HelmDependencyManager } from '../../../../src/core/dependency_managers/index.mjs'
import { logging, constants, PackageDownloader, Zippy } from '../../../../src/core/index.mjs'
import { SoloError } from '../../../../src/core/errors.mjs'
import { SECONDS } from '../../../../src/core/constants.mjs'

const testLogger = logging.NewLogger('debug', true)
describe('DependencyManager', () => {
  // prepare dependency manger registry
  const downloader = new PackageDownloader(testLogger)
  const zippy = new Zippy(testLogger)
  const helmDepManager = new HelmDependencyManager(downloader, zippy, testLogger)
  const depManagerMap = new Map()
    .set(constants.HELM, helmDepManager)
  const depManager = new DependencyManager(testLogger, depManagerMap)

  describe('checkDependency', () => {
    it('should fail during invalid dependency check', async () => {
      await expect(depManager.checkDependency('INVALID_PROGRAM')).to.be.rejectedWith("Dependency 'INVALID_PROGRAM' is not found")
    })

    it('should succeed during helm dependency check', async () => {
      await expect(depManager.checkDependency(constants.HELM)).to.eventually.equal(true)
    }).timeout(60 * SECONDS)
  })
})
