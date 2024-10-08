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
import { AccountManager } from '../../../src/core/account_manager.mjs'
import { getK8Instance } from '../../test_util.js'
describe('PackageInstaller', () => {
  const testLogger = core.logging.NewLogger('debug', true)
  const configManager = new ConfigManager(testLogger)

  const k8 = getK8Instance(configManager)

  const accountManager = new AccountManager(testLogger, k8)
  const installer = new PlatformInstaller(testLogger, k8, configManager, accountManager)

  describe('validatePlatformReleaseDir', () => {
    it('should fail for missing path', () => {
      expect.assertions(1)
      expect(() => { installer.validatePlatformReleaseDir('') }).toThrow(MissingArgumentError)
    })

    it('should fail for invalid path', () => {
      expect.assertions(1)
      expect(() => { installer.validatePlatformReleaseDir('/INVALID') }).toThrow(IllegalArgumentError)
    })

    it('should fail if directory does not have data/apps directory', () => {
      expect.assertions(1)

      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'installer-'))
      fs.mkdirSync(`${tmpDir}/${core.constants.HEDERA_DATA_LIB_DIR}`, { recursive: true })
      expect(() => { installer.validatePlatformReleaseDir(tmpDir) }).toThrow(IllegalArgumentError)
      fs.rmSync(tmpDir, { recursive: true })
    })

    it('should fail if directory does not have data/libs directory', () => {
      expect.assertions(1)

      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'installer-'))
      fs.mkdirSync(`${tmpDir}/${core.constants.HEDERA_DATA_APPS_DIR}`, { recursive: true })
      expect(() => { installer.validatePlatformReleaseDir(tmpDir) }).toThrow(IllegalArgumentError)
      fs.rmSync(tmpDir, { recursive: true })
    })

    it('should fail if directory does not have data/app directory is empty', () => {
      expect.assertions(1)

      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'installer-'))
      fs.mkdirSync(`${tmpDir}/${core.constants.HEDERA_DATA_APPS_DIR}`, { recursive: true })
      fs.mkdirSync(`${tmpDir}/${core.constants.HEDERA_DATA_LIB_DIR}`, { recursive: true })
      fs.writeFileSync(`${tmpDir}/${core.constants.HEDERA_DATA_LIB_DIR}/test.jar`, '')
      expect(() => { installer.validatePlatformReleaseDir() }).toThrow(MissingArgumentError)
      fs.rmSync(tmpDir, { recursive: true })
    })

    it('should fail if directory does not have data/apps directory is empty', () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'installer-app-'))
      fs.mkdirSync(`${tmpDir}/${core.constants.HEDERA_DATA_APPS_DIR}`, { recursive: true })
      fs.writeFileSync(`${tmpDir}/${core.constants.HEDERA_DATA_APPS_DIR}/app.jar`, '')
      fs.mkdirSync(`${tmpDir}/${core.constants.HEDERA_DATA_LIB_DIR}`, { recursive: true })
      expect(() => { installer.validatePlatformReleaseDir() }).toThrow(MissingArgumentError)
      fs.rmSync(tmpDir, { recursive: true })
    })

    it('should succeed with non-empty data/apps and data/libs directory', () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'installer-lib-'))
      fs.mkdirSync(`${tmpDir}/${core.constants.HEDERA_DATA_APPS_DIR}`, { recursive: true })
      fs.writeFileSync(`${tmpDir}/${core.constants.HEDERA_DATA_APPS_DIR}/app.jar`, '')
      fs.mkdirSync(`${tmpDir}/${core.constants.HEDERA_DATA_LIB_DIR}`, { recursive: true })
      fs.writeFileSync(`${tmpDir}/${core.constants.HEDERA_DATA_LIB_DIR}/lib-1.jar`, '')
      expect(() => { installer.validatePlatformReleaseDir() }).toThrow(MissingArgumentError)
      fs.rmSync(tmpDir, { recursive: true })
    })
  })

  describe('extractPlatform', () => {
    it('should fail for missing pod name', async () => {
      expect.assertions(1)
      await expect(installer.fetchPlatform('', 'v0.42.5')).rejects.toThrow(MissingArgumentError)
    })
    it('should fail for missing tag', async () => {
      expect.assertions(1)
      await expect(installer.fetchPlatform('network-node1-0', '')).rejects.toThrow(MissingArgumentError)
    })
  })

  describe('copyGossipKeys', () => {
    it('should fail for missing podName', async () => {
      await expect(installer.copyGossipKeys('', os.tmpdir())).rejects.toThrow(MissingArgumentError)
    })

    it('should fail for missing stagingDir path', async () => {
      await expect(installer.copyGossipKeys('node1', '')).rejects.toThrow(MissingArgumentError)
    })
  })
})
