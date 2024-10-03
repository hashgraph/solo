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
import { afterAll, beforeAll, describe, expect, it } from '@jest/globals'
import fs from 'fs'
import path from 'path'
import { HelmDependencyManager } from '../../../../src/core/dependency_managers/index.mjs'
import { PackageDownloader, Zippy } from '../../../../src/core/index.mjs'
import { getTestCacheDir, getTmpDir, testLogger } from '../../../test_util.js'
import * as version from '../../../../version.mjs'

describe('HelmDependencyManager', () => {
  const downloader = new PackageDownloader(testLogger)
  const tmpDir = path.join(getTmpDir(), 'bin')
  const zippy = new Zippy(testLogger)

  beforeAll(() => {
    fs.mkdirSync(tmpDir)
  })

  afterAll(() => {
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true })
    }
  })

  it('should return helm version', () => {
    const helmDependencyManager = new HelmDependencyManager(downloader, zippy, testLogger, tmpDir)
    expect(helmDependencyManager.getHelmVersion()).toStrictEqual(version.HELM_VERSION)
  })

  it('should be able to check when helm not installed', () => {
    const helmDependencyManager = new HelmDependencyManager(downloader, zippy, testLogger, tmpDir)
    expect(helmDependencyManager.isInstalled()).toBeFalsy()
  })

  it('should be able to check when helm is installed', () => {
    const helmDependencyManager = new HelmDependencyManager(downloader, zippy, testLogger, tmpDir)
    fs.writeFileSync(helmDependencyManager.getHelmPath(), '')
    expect(helmDependencyManager.isInstalled()).toBeTruthy()
  })

  it.each([
    {
      osPlatform: 'linux',
      osArch: 'x64'
    },
    {
      osRelease: 'linux',
      osArch: 'amd64'
    },
    {
      osRelease: 'windows',
      osArch: 'amd64'
    }
  ])('should be able to install helm base on os and architecture', async (input) => {
    const helmDependencyManager = new HelmDependencyManager(downloader, zippy, testLogger, tmpDir, input.osPlatform, input.osArch)
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true })
    }

    await helmDependencyManager.uninstall()
    expect(helmDependencyManager.isInstalled()).toBeFalsy()
    await expect(helmDependencyManager.install(getTestCacheDir())).resolves.toBeTruthy()
    expect(helmDependencyManager.isInstalled()).toBeTruthy()
    fs.rmSync(tmpDir, { recursive: true })
  }, 20000)
})
