// SPDX-License-Identifier: Apache-2.0

import 'chai-as-promised';

import {expect} from 'chai';
import {describe, it} from 'mocha';

import {SoloError} from '../../../src/core/errors/solo-error.js';
import {MissingArgumentError} from '../../../src/core/errors/missing-argument-error.js';
import {IllegalArgumentError} from '../../../src/core/errors/illegal-argument-error.js';
import os from 'os';
import fs from 'fs';
import {Zippy} from '../../../src/core/zippy.js';
import * as logging from '../../../src/core/logging.js';
import {PathEx} from '../../../src/business/utils/path-ex.js';

describe('Zippy', () => {
  const testLogger = logging.NewLogger('debug', true);
  const zippy = new Zippy(testLogger);

  describe('unzip', () => {
    it('should fail if source file is missing', () => {
      expect(() => zippy.unzip('', '')).to.throw(MissingArgumentError);
    });

    it('should fail if destination file is missing', () => {
      expect(() => zippy.unzip('test/data/test.zip', '')).to.throw(MissingArgumentError);
    });

    it('should fail if source file is invalid', () => {
      expect(() => zippy.unzip('/INVALID', os.tmpdir())).to.throw(IllegalArgumentError);
    });

    it('should fail for a directory', () => {
      expect(() => zippy.unzip('test/data', os.tmpdir())).to.throw(SoloError);
    });

    it('should fail for a non-zip file', () => {
      expect(() => zippy.unzip('test/data/test.txt', os.tmpdir())).to.throw(SoloError);
    });

    it('should succeed for valid inputs', async () => {
      const tmpDir = fs.mkdtempSync(PathEx.join(os.tmpdir(), 'installer-'));
      const zipFile = `${tmpDir}/test.zip`;
      const unzippedFile = `${tmpDir}/unzipped`;
      await expect(zippy.zip('test/data/.empty', zipFile)).to.eventually.equal(zipFile);
      expect(zippy.unzip(zipFile, unzippedFile, true)).to.equal(unzippedFile);
      fs.rmSync(tmpDir, {recursive: true, force: true});
    });
  });

  describe('untar', () => {
    it('should fail if source file is missing', () => {
      expect(() => zippy.untar('', '')).to.throw(MissingArgumentError);
    });

    it('should fail if destination file is missing', () => {
      expect(() => zippy.untar('test/data/test.tar', '')).to.throw(MissingArgumentError);
    });

    it('should fail if source file is invalid', () => {
      expect(() => zippy.untar('/INVALID', os.tmpdir())).to.throw(IllegalArgumentError);
    });

    it('should fail for a directory', () => {
      expect(() => zippy.untar('test/data', os.tmpdir())).to.throw(SoloError);
    });

    it('should fail for a non-tar file', () => {
      expect(() => zippy.untar('test/data/test.txt', os.tmpdir())).to.throw(SoloError);
    });

    it('should succeed for valid inputs', () => {
      const tmpDir = fs.mkdtempSync(PathEx.join(os.tmpdir(), 'installer-'));
      const tarFile = `${tmpDir}/test.tar.gz`;
      expect(zippy.tar('test/data/.empty', tarFile)).to.equal(tarFile);
      expect(zippy.untar(tarFile, tmpDir)).to.equal(tmpDir);
      fs.rmSync(tmpDir, {recursive: true, force: true});
    });
  });
});
