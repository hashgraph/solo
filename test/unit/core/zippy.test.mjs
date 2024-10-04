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
import * as core from '../../../src/core/index.mjs'
import { SoloError, IllegalArgumentError, MissingArgumentError } from '../../../src/core/errors.mjs'
import os from 'os'
import fs from 'fs'
import path from 'path'
import { Zippy } from '../../../src/core/zippy.mjs'
describe('Zippy', () => {
  const testLogger = core.logging.NewLogger('debug', true)
  const zippy = new Zippy(testLogger)

  describe('unzip', () => {
    it('should fail if source file is missing', () => {
      expect.assertions(1)
      expect(() => { zippy.unzip('', '') }).toThrow(MissingArgumentError)
    })

    it('should fail if destination file is missing', () => {
      expect.assertions(1)
      expect(() => { zippy.unzip('', '') }).toThrow(MissingArgumentError)
    })

    it('should fail if source file is invalid', () => {
      expect.assertions(1)
      expect(() => { zippy.unzip('/INVALID', os.tmpdir()) }).toThrow(IllegalArgumentError)
    })

    it('should fail for a directory', () => {
      expect.assertions(1)
      expect(() => { zippy.unzip('test/data', os.tmpdir()) }).toThrow(SoloError)
    })

    it('should fail for a non-zip file', () => {
      expect.assertions(1)
      expect(() => { zippy.unzip('test/data/test.txt', os.tmpdir()) }).toThrow(SoloError)
    })

    it('should succeed for valid inputs', async () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'installer-'))
      const zipFile = `${tmpDir}/test.zip`
      const unzippedFile = `${tmpDir}/unzipped`
      await expect(zippy.zip('test/data/.empty', zipFile)).resolves.toBe(zipFile)
      expect(zippy.unzip(zipFile, unzippedFile, true)).toBe(unzippedFile)
      fs.rmSync(tmpDir, { recursive: true, force: true }) // not very safe!
    })
  })

  describe('untar', () => {
    it('should fail if source file is missing', () => {
      expect.assertions(1)
      expect(() => { zippy.untar('', '') }).toThrow(MissingArgumentError)
    })

    it('should fail if destination file is missing', () => {
      expect.assertions(1)
      expect(() => { zippy.untar('', '') }).toThrow(MissingArgumentError)
    })

    it('should fail if source file is invalid', () => {
      expect.assertions(1)
      expect(() => { zippy.untar('/INVALID', os.tmpdir()) }).toThrow(IllegalArgumentError)
    })

    it('should fail for a directory', () => {
      expect.assertions(1)
      expect(() => { zippy.untar('test/data', os.tmpdir()) }).toThrow(SoloError)
    })

    it('should fail for a non-tar file', () => {
      expect.assertions(1)
      expect(() => { zippy.untar('test/data/test.txt', os.tmpdir()) }).toThrow(SoloError)
    })

    it('should succeed for valid inputs', () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'installer-'))
      const tarFile = `${tmpDir}/test.tar.gz`
      expect(zippy.tar('test/data/.empty', tarFile), 'tar file should match').toBe(tarFile)
      expect(zippy.untar(tarFile, tmpDir), 'tmp dir should match').toBe(tmpDir)
      fs.rmSync(tmpDir, { recursive: true, force: true }) // not very safe!
    })
  })
})
