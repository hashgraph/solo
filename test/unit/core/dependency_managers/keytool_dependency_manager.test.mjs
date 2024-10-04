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
import { describe, it, after, before } from 'mocha'

import fs from 'fs'
import path from 'path'
import { KeytoolDependencyManager } from '../../../../src/core/dependency_managers/index.mjs'
import { PackageDownloader, Zippy } from '../../../../src/core/index.mjs'
import { getTestCacheDir, testLogger } from '../../../test_util.js'

describe('KeytoolDependencyManager', () => {
  const downloader = new PackageDownloader(testLogger)
  const tmpDir = path.join(getTestCacheDir(), 'bin', 'jre')
  const zippy = new Zippy(testLogger)

  before(async () => {
    fs.mkdirSync(tmpDir, { recursive: true })
  })

  after(() => {
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true })
    }
  })

  it('should be able to check when keytool not installed', () => {
    const keytoolDependencyManager = new KeytoolDependencyManager(downloader, zippy, testLogger, tmpDir)
    expect(keytoolDependencyManager.isInstalled()).not.to.be.ok
  })

  it('should be able to check when keytool is installed', () => {
    const keytoolDependencyManager = new KeytoolDependencyManager(downloader, zippy, testLogger, tmpDir)
    fs.mkdirSync(path.dirname(keytoolDependencyManager.getKeytoolPath()), { recursive: true })
    fs.writeFileSync(keytoolDependencyManager.getKeytoolPath(), '')
    expect(keytoolDependencyManager.isInstalled()).to.be.ok
  })
})
