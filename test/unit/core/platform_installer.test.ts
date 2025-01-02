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
import {expect} from 'chai';
import {describe, it} from 'mocha';

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as constants from '../../../src/core/constants.js';
import {PlatformInstaller} from '../../../src/core/platform_installer.js';
import {IllegalArgumentError, MissingArgumentError} from '../../../src/core/errors.js';
import type {PodName} from '../../../src/types/aliases.js';
import {container} from 'tsyringe-neo';

describe('PackageInstaller', () => {
  let installer: PlatformInstaller;

  before(() => {
    installer = container.resolve(PlatformInstaller);
  });

  describe('validatePlatformReleaseDir', () => {
    it('should fail for missing path', () => {
      expect(() => installer.validatePlatformReleaseDir('')).to.throw(MissingArgumentError);
    });

    it('should fail for invalid path', () => {
      expect(() => installer.validatePlatformReleaseDir('/INVALID')).to.throw(IllegalArgumentError);
    });

    it('should fail if directory does not have data/apps directory', () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'installer-'));
      fs.mkdirSync(`${tmpDir}/${constants.HEDERA_DATA_LIB_DIR}`, {recursive: true});
      expect(() => installer.validatePlatformReleaseDir(tmpDir)).to.throw(IllegalArgumentError);
      fs.rmSync(tmpDir, {recursive: true});
    });

    it('should fail if directory does not have data/libs directory', () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'installer-'));
      fs.mkdirSync(`${tmpDir}/${constants.HEDERA_DATA_APPS_DIR}`, {recursive: true});
      expect(() => installer.validatePlatformReleaseDir(tmpDir)).to.throw(IllegalArgumentError);
      fs.rmSync(tmpDir, {recursive: true});
    });

    it('should fail if directory does not have data/app directory is empty', () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'installer-'));
      fs.mkdirSync(`${tmpDir}/${constants.HEDERA_DATA_APPS_DIR}`, {recursive: true});
      fs.mkdirSync(`${tmpDir}/${constants.HEDERA_DATA_LIB_DIR}`, {recursive: true});
      fs.writeFileSync(`${tmpDir}/${constants.HEDERA_DATA_LIB_DIR}/test.jar`, '');
      // @ts-expect-error - TS2554: Expected 1 arguments, but got 0
      expect(() => installer.validatePlatformReleaseDir()).to.throw(MissingArgumentError);
      fs.rmSync(tmpDir, {recursive: true});
    });

    it('should fail if directory does not have data/apps directory is empty', () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'installer-app-'));
      fs.mkdirSync(`${tmpDir}/${constants.HEDERA_DATA_APPS_DIR}`, {recursive: true});
      fs.writeFileSync(`${tmpDir}/${constants.HEDERA_DATA_APPS_DIR}/app.jar`, '');
      fs.mkdirSync(`${tmpDir}/${constants.HEDERA_DATA_LIB_DIR}`, {recursive: true});
      // @ts-expect-error - TS2554: Expected 1 arguments, but got 0
      expect(() => installer.validatePlatformReleaseDir()).to.throw(MissingArgumentError);
      fs.rmSync(tmpDir, {recursive: true});
    });

    it('should succeed with non-empty data/apps and data/libs directory', () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'installer-lib-'));
      fs.mkdirSync(`${tmpDir}/${constants.HEDERA_DATA_APPS_DIR}`, {recursive: true});
      fs.writeFileSync(`${tmpDir}/${constants.HEDERA_DATA_APPS_DIR}/app.jar`, '');
      fs.mkdirSync(`${tmpDir}/${constants.HEDERA_DATA_LIB_DIR}`, {recursive: true});
      fs.writeFileSync(`${tmpDir}/${constants.HEDERA_DATA_LIB_DIR}/lib-1.jar`, '');
      // @ts-expect-error - TS2554: Expected 1 arguments, but got 0
      expect(() => installer.validatePlatformReleaseDir()).to.throw(MissingArgumentError);
      fs.rmSync(tmpDir, {recursive: true});
    });
  });

  describe('extractPlatform', () => {
    it('should fail for missing pod name', async () => {
      await expect(installer.fetchPlatform('' as PodName, 'v0.42.5')).to.be.rejectedWith(MissingArgumentError);
    });
    it('should fail for missing tag', async () => {
      await expect(installer.fetchPlatform('network-node1-0', '')).to.be.rejectedWith(MissingArgumentError);
    });
  });

  describe('copyGossipKeys', () => {
    it('should fail for missing podName', async () => {
      // @ts-expect-error - TS2554: Expected 3 arguments, but got 2
      await expect(installer.copyGossipKeys('', os.tmpdir())).to.be.rejectedWith(MissingArgumentError);
    });

    it('should fail for missing stagingDir path', async () => {
      // @ts-expect-error - TS2554: Expected 3 arguments, but got 2
      await expect(installer.copyGossipKeys('node1', '')).to.be.rejectedWith(MissingArgumentError);
    });
  });
});
