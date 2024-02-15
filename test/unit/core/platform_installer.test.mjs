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
import { ConfigManager, PlatformInstaller } from '../../../src/core/index.mjs'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import {
  IllegalArgumentError,
  MissingArgumentError
} from '../../../src/core/errors.mjs'
describe('PackageInstaller', () => {
  const testLogger = core.logging.NewLogger('debug')
  const configManager = new ConfigManager(testLogger)
  const k8 = new core.K8(configManager, testLogger)
  const installer = new PlatformInstaller(testLogger, k8)

  describe('validatePlatformReleaseDir', () => {
    it('should fail for missing path', async () => {
      expect.assertions(1)
      await expect(installer.validatePlatformReleaseDir('')).rejects.toThrow(MissingArgumentError)
    })

    it('should fail for invalid path', async () => {
      expect.assertions(1)
      await expect(installer.validatePlatformReleaseDir('/INVALID')).rejects.toThrow(IllegalArgumentError)
    })

    it('should fail if directory does not have data/apps directory', async () => {
      expect.assertions(1)

      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'installer-'))
      fs.mkdirSync(`${tmpDir}/${core.constants.HEDERA_DATA_LIB_DIR}`, { recursive: true })
      await expect(installer.validatePlatformReleaseDir(tmpDir)).rejects.toThrow(IllegalArgumentError)
      fs.rmSync(tmpDir, { recursive: true })
    })

    it('should fail if directory does not have data/libs directory', async () => {
      expect.assertions(1)

      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'installer-'))
      fs.mkdirSync(`${tmpDir}/${core.constants.HEDERA_DATA_APPS_DIR}`, { recursive: true })
      await expect(installer.validatePlatformReleaseDir(tmpDir)).rejects.toThrow(IllegalArgumentError)
      fs.rmSync(tmpDir, { recursive: true })
    })

    it('should fail if directory does not have data/app directory is empty', async () => {
      expect.assertions(1)

      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'installer-'))
      fs.mkdirSync(`${tmpDir}/${core.constants.HEDERA_DATA_APPS_DIR}`, { recursive: true })
      fs.mkdirSync(`${tmpDir}/${core.constants.HEDERA_DATA_LIB_DIR}`, { recursive: true })
      fs.writeFileSync(`${tmpDir}/${core.constants.HEDERA_DATA_LIB_DIR}/test.jar`, '')
      await expect(installer.validatePlatformReleaseDir()).rejects.toThrow(MissingArgumentError)
      fs.rmSync(tmpDir, { recursive: true })
    })

    it('should fail if directory does not have data/apps directory is empty', async () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'installer-app-'))
      fs.mkdirSync(`${tmpDir}/${core.constants.HEDERA_DATA_APPS_DIR}`, { recursive: true })
      fs.writeFileSync(`${tmpDir}/${core.constants.HEDERA_DATA_APPS_DIR}/app.jar`, '')
      fs.mkdirSync(`${tmpDir}/${core.constants.HEDERA_DATA_LIB_DIR}`, { recursive: true })
      await expect(installer.validatePlatformReleaseDir()).rejects.toThrow(MissingArgumentError)
      fs.rmSync(tmpDir, { recursive: true })
    })

    it('should succeed with non-empty data/apps and data/libs directory', async () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'installer-lib-'))
      fs.mkdirSync(`${tmpDir}/${core.constants.HEDERA_DATA_APPS_DIR}`, { recursive: true })
      fs.writeFileSync(`${tmpDir}/${core.constants.HEDERA_DATA_APPS_DIR}/app.jar`, '')
      fs.mkdirSync(`${tmpDir}/${core.constants.HEDERA_DATA_LIB_DIR}`, { recursive: true })
      fs.writeFileSync(`${tmpDir}/${core.constants.HEDERA_DATA_LIB_DIR}/lib-1.jar`, '')
      await expect(installer.validatePlatformReleaseDir()).rejects.toThrow(MissingArgumentError)
      fs.rmSync(tmpDir, { recursive: true })
    })
  })

  describe('extractPlatform', () => {
    it('should fail for missing pod name', async () => {
      expect.assertions(1)
      await expect(installer.copyPlatform('', os.tmpdir())).rejects.toThrow(MissingArgumentError)
    })
    it('should fail for missing buildZipFile path', async () => {
      expect.assertions(1)
      await expect(installer.copyPlatform('network-node0-0', '')).rejects.toThrow(MissingArgumentError)
    })
  })

  describe('prepareConfigTxt', () => {
    it('should fail for missing nodeIDs', async () => {
      await expect(installer.prepareConfigTxt([], './test', '0.42.0')).rejects.toThrow(MissingArgumentError)
    })

    it('should fail for missing destPath', async () => {
      await expect(installer.prepareConfigTxt(['node0'], '', '0.42.0')).rejects.toThrow(MissingArgumentError)
    })

    it('should fail for missing release tag', async () => {
      await expect(installer.prepareConfigTxt(['node0'], `${os.tmpdir()}/config.txt`, '')).rejects.toThrow(MissingArgumentError)
    })

    it('should fail for invalid destPath', async () => {
      await expect(installer.prepareConfigTxt(['node0'], '/INVALID/config.txt', '0.42.0')).rejects.toThrow(IllegalArgumentError)
    })
  })

  describe('copyGossipKeys', () => {
    it('should fail for missing podName', async () => {
      await expect(installer.copyGossipKeys('', os.tmpdir())).rejects.toThrow(MissingArgumentError)
    })

    it('should fail for missing stagingDir path', async () => {
      await expect(installer.copyGossipKeys('network-node0-0', '')).rejects.toThrow(MissingArgumentError)
    })
  })
})
