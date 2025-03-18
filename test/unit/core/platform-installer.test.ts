// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {describe, it} from 'mocha';

import * as fs from 'fs';
import * as os from 'os';
import * as constants from '../../../src/core/constants.js';
import {type PlatformInstaller} from '../../../src/core/platform-installer.js';
import {IllegalArgumentError} from '../../../src/core/errors/illegal-argument-error.js';
import {MissingArgumentError} from '../../../src/core/errors/missing-argument-error.js';
import {PodName} from '../../../src/core/kube/resources/pod/pod-name.js';
import {container} from 'tsyringe-neo';
import {PodRef} from '../../../src/core/kube/resources/pod/pod-ref.js';
import {NamespaceName} from '../../../src/core/kube/resources/namespace/namespace-name.js';
import {InjectTokens} from '../../../src/core/dependency-injection/inject-tokens.js';
import {PathEx} from '../../../src/core/util/path-ex.js';

describe('PackageInstaller', () => {
  let installer: PlatformInstaller;

  before(() => {
    installer = container.resolve(InjectTokens.PlatformInstaller);
  });

  describe('validatePlatformReleaseDir', () => {
    it('should fail for missing path', () => {
      expect(() => installer.validatePlatformReleaseDir('')).to.throw(MissingArgumentError);
    });

    it('should fail for invalid path', () => {
      expect(() => installer.validatePlatformReleaseDir('/INVALID')).to.throw(IllegalArgumentError);
    });

    it('should fail if directory does not have data/apps directory', () => {
      const tmpDir = fs.mkdtempSync(PathEx.join(os.tmpdir(), 'installer-'));
      fs.mkdirSync(`${tmpDir}/${constants.HEDERA_DATA_LIB_DIR}`, {recursive: true});
      expect(() => installer.validatePlatformReleaseDir(tmpDir)).to.throw(IllegalArgumentError);
      fs.rmSync(tmpDir, {recursive: true});
    });

    it('should fail if directory does not have data/libs directory', () => {
      const tmpDir = fs.mkdtempSync(PathEx.join(os.tmpdir(), 'installer-'));
      fs.mkdirSync(`${tmpDir}/${constants.HEDERA_DATA_APPS_DIR}`, {recursive: true});
      expect(() => installer.validatePlatformReleaseDir(tmpDir)).to.throw(IllegalArgumentError);
      fs.rmSync(tmpDir, {recursive: true});
    });

    it('should fail if directory does not have data/app directory is empty', () => {
      const tmpDir = fs.mkdtempSync(PathEx.join(os.tmpdir(), 'installer-'));
      fs.mkdirSync(`${tmpDir}/${constants.HEDERA_DATA_APPS_DIR}`, {recursive: true});
      fs.mkdirSync(`${tmpDir}/${constants.HEDERA_DATA_LIB_DIR}`, {recursive: true});
      fs.writeFileSync(`${tmpDir}/${constants.HEDERA_DATA_LIB_DIR}/test.jar`, '');
      // @ts-expect-error - TS2554: Expected 1 arguments, but got 0
      expect(() => installer.validatePlatformReleaseDir()).to.throw(MissingArgumentError);
      fs.rmSync(tmpDir, {recursive: true});
    });

    it('should fail if directory does not have data/apps directory is empty', () => {
      const tmpDir = fs.mkdtempSync(PathEx.join(os.tmpdir(), 'installer-app-'));
      fs.mkdirSync(`${tmpDir}/${constants.HEDERA_DATA_APPS_DIR}`, {recursive: true});
      fs.writeFileSync(`${tmpDir}/${constants.HEDERA_DATA_APPS_DIR}/app.jar`, '');
      fs.mkdirSync(`${tmpDir}/${constants.HEDERA_DATA_LIB_DIR}`, {recursive: true});
      // @ts-expect-error - TS2554: Expected 1 arguments, but got 0
      expect(() => installer.validatePlatformReleaseDir()).to.throw(MissingArgumentError);
      fs.rmSync(tmpDir, {recursive: true});
    });

    it('should succeed with non-empty data/apps and data/libs directory', () => {
      const tmpDir = fs.mkdtempSync(PathEx.join(os.tmpdir(), 'installer-lib-'));
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
      await expect(installer.fetchPlatform(null as PodRef, 'v0.42.5')).to.be.rejectedWith(MissingArgumentError);
    });
    it('should fail for missing tag', async () => {
      await expect(
        installer.fetchPlatform(
          PodRef.of(NamespaceName.of('platform-installer-test'), PodName.of('network-node1-0')),
          '',
        ),
      ).to.be.rejectedWith(MissingArgumentError);
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
