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
import * as fs from 'fs'
import { logging, PackageDownloader, Templates } from '../../../src/core/index.mjs'

describe('PackageDownloaderE2E', () => {
  const testLogger = logging.NewLogger('debug')
  const downloader = new PackageDownloader(testLogger)

  it('should succeed with a valid Hedera release tag', async () => {
    const testCacheDir = 'test/data/tmp'

    const tag = 'v0.42.5'
    const releasePrefix = Templates.prepareReleasePrefix(tag)

    const destPath = `${testCacheDir}/${releasePrefix}/build-${tag}.zip`
    await expect(downloader.fetchPlatform(tag, testCacheDir)).resolves.toBe(destPath)
    expect(fs.existsSync(destPath)).toBeTruthy()
    testLogger.showUser(destPath)
  }, 200000)
})
