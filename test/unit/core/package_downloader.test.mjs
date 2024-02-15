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
import * as core from '../../../src/core/index.mjs'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { IllegalArgumentError, MissingArgumentError, ResourceNotFoundError } from '../../../src/core/errors.mjs'

describe('PackageDownloader', () => {
  const testLogger = core.logging.NewLogger('debug')
  const downloader = new core.PackageDownloader(testLogger)

  describe('urlExists', () => {
    it('should return true if source URL is valid', async () => {
      expect.assertions(1)
      const url = 'https://builds.hedera.com/node/software/v0.42/build-v0.42.5.sha384'
      await expect(downloader.urlExists(url)).resolves.toBe(true)
    })
    it('should return false if source URL is valid', async () => {
      expect.assertions(1)
      const url = 'https://builds.hedera.com/node/software/v0.42/build-v0.42.5.INVALID'
      await expect(downloader.urlExists(url)).resolves.toBe(false)
    })
  })

  describe('fetchFile', () => {
    it('should fail if source URL is missing', async () => {
      expect.assertions(1)

      try {
        await downloader.fetchFile('', os.tmpdir())
      } catch (e) {
        expect(e.message).toBe('package URL is required')
      }
    })

    it('should fail if destination path is missing', async () => {
      expect.assertions(1)

      try {
        await downloader.fetchFile('https://localhost', '')
      } catch (e) {
        expect(e.message).toBe('destination path is required')
      }
    })

    it('should fail with a malformed URL', async () => {
      expect.assertions(2)

      try {
        await downloader.fetchFile('INVALID_URL', os.tmpdir())
      } catch (e) {
        expect(e).toBeInstanceOf(IllegalArgumentError)
        expect(e.message).toBe("package URL 'INVALID_URL' is invalid")
      }
    })

    it('should fail with an invalid URL', async () => {
      expect.assertions(2)

      try {
        await downloader.fetchFile('https://localhost/INVALID_FILE', os.tmpdir())
      } catch (e) {
        expect(e).toBeInstanceOf(ResourceNotFoundError)
        expect(e.message).toBe("package URL 'https://localhost/INVALID_FILE' does not exist")
      }
    })

    it('should succeed with a valid release artifact URL', async () => {
      try {
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'downloader-'))

        const tag = 'v0.42.5'
        const destPath = `${tmpDir}/build-${tag}.sha384`

        // we use the build-<tag>.sha384 file URL to test downloading a small file
        const url = `https://builds.hedera.com/node/software/v0.42/build-${tag}.sha384`
        await expect(downloader.fetchFile(url, destPath)).resolves.toBe(destPath)
        expect(fs.existsSync(destPath)).toBeTruthy()

        // remove the file to reduce disk usage
        fs.rmSync(tmpDir, { recursive: true })
      } catch (e) {
        expect(e).toBeNull()
      }
    })
  })

  describe('fetchPlatform', () => {
    it('should fail if platform release tag is missing', async () => {
      expect.assertions(2)

      try {
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'downloader-'))
        await downloader.fetchPlatform('', tmpDir)
        fs.rmSync(tmpDir, { recursive: true })
      } catch (e) {
        expect(e.cause).not.toBeNull()
        expect(e).toBeInstanceOf(MissingArgumentError)
      }
    })
    it('should fail if platform release artifact is not found', async () => {
      expect.assertions(2)

      const tag = 'v0.40.0-INVALID'

      try {
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'downloader-'))
        await downloader.fetchPlatform(tag, tmpDir)
        fs.rmSync(tmpDir, { recursive: true })
      } catch (e) {
        expect(e.cause).not.toBeNull()
        expect(e.cause).toBeInstanceOf(ResourceNotFoundError)
      }
    })

    it('should fail if platform release tag is invalid', async () => {
      expect.assertions(1)

      try {
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'downloader-'))
        await downloader.fetchPlatform('INVALID', os.tmpdir())
        fs.rmSync(tmpDir, { recursive: true })
      } catch (e) {
        expect(e.message).toContain('must include major, minor and patch fields')
      }
    })

    it('should fail if destination directory is null', async () => {
      expect.assertions(1)
      try {
        await downloader.fetchPlatform('v0.40.0', '')
      } catch (e) {
        expect(e.message).toContain('destination directory path is required')
      }
    })
  })
})
