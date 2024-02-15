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
import { FullstackTestingError, IllegalArgumentError, MissingArgumentError } from '../../../src/core/errors.mjs'
import os from 'os'
import fs from 'fs'
import path from 'path'
import { Zippy } from '../../../src/core/zippy.mjs'
describe('Zippy', () => {
  const testLogger = core.logging.NewLogger('debug')
  const zippy = new Zippy(testLogger)

  describe('unzip', () => {
    it('should fail if source file is missing', async () => {
      expect.assertions(1)
      await expect(zippy.unzip('', '')).rejects.toThrow(MissingArgumentError)
    })

    it('should fail if destination file is missing', async () => {
      expect.assertions(1)
      await expect(zippy.unzip('', '')).rejects.toThrow(MissingArgumentError)
    })

    it('should fail if source file is invalid', async () => {
      expect.assertions(1)
      await expect(zippy.unzip('/INVALID', os.tmpdir())).rejects.toThrow(IllegalArgumentError)
    })

    it('should fail for a directory', async () => {
      expect.assertions(1)
      await expect(zippy.unzip('test/data', os.tmpdir())).rejects.toThrow(FullstackTestingError)
    })

    it('should fail for a non-zip file', async () => {
      expect.assertions(1)
      await expect(zippy.unzip('test/data/test.txt', os.tmpdir())).rejects.toThrow(FullstackTestingError)
    })

    it('should succeed for valid inputs', async () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'installer-'))
      const zipFile = `${tmpDir}/test.zip`
      const unzippedFile = `${tmpDir}/unzipped`
      await expect(zippy.zip('test/data/.empty', zipFile)).resolves.toBe(zipFile)
      await expect(zippy.unzip(zipFile, unzippedFile, true)).resolves.toBe(unzippedFile)
      fs.rmSync(tmpDir, { recursive: true, force: true }) // not very safe!
    })
  })
})
