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
import { it, describe, after, before } from 'mocha'
import { expect } from 'chai'

import fs from 'fs'
import path from 'path'
import { KeytoolDependencyManager } from '../../../../../src/core/dependency_managers/index.mjs'
import { PackageDownloader, Zippy } from '../../../../../src/core/index.mjs'
import { getTestCacheDir, testLogger } from '../../../../test_util.js'
import os from 'os'
import { MINUTES } from '../../../../../src/core/constants.mjs'

describe('KeytoolDependencyManager', () => {
  const downloader = new PackageDownloader(testLogger)
  const tmpDir = path.join(getTestCacheDir(), 'bin', 'jre')
  const zippy = new Zippy(testLogger)

  before(() => {
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true })
    }
    fs.mkdirSync(tmpDir, { recursive: true })
  })

  after(() => {
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true })
    }
  })

  it('should be able to install keytool base on os and architecture', async () => {
    let osPlatform = ''
    let osArch = ''
    switch (os.platform()) {
      case 'linux':
        osPlatform = 'linux'
        osArch = 'x64'
        break
      case 'darwin':
        osPlatform = 'darwin'
        osArch = 'arm64'
        break
      case 'win32':
        osPlatform = 'windows'
        osArch = 'x64'
        break
      default:
        throw new Error('Unsupported platform')
    }
    const keytoolDependencyManager = new KeytoolDependencyManager(
      downloader, zippy, testLogger, tmpDir, osPlatform, osArch)
    await keytoolDependencyManager.uninstall()
    expect(keytoolDependencyManager.isInstalled()).not.to.be.ok
    await expect(keytoolDependencyManager.install(getTestCacheDir())).to.eventually.be.ok
    expect(keytoolDependencyManager.isInstalled()).to.be.ok
  }).timeout(2 * MINUTES)
})
