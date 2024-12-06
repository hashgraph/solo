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

import {PackageDownloader} from '../../../src/core/package_downloader.js';
import * as logging from '../../../src/core/logging.js';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {IllegalArgumentError, MissingArgumentError, ResourceNotFoundError} from '../../../src/core/errors.js';

describe('PackageDownloader', () => {
  const testLogger = logging.NewLogger('debug', true);
  const downloader = new PackageDownloader(testLogger);

  describe('urlExists', () => {
    it('should return true if source URL is valid', async () => {
      const url = 'https://builds.hedera.com/node/software/v0.42/build-v0.42.5.sha384';
      await expect(downloader.urlExists(url)).to.eventually.equal(true);
    });
    it('should return false if source URL is invalid', async () => {
      const url = 'https://builds.hedera.com/node/software/v0.42/build-v0.42.5.INVALID';
      await expect(downloader.urlExists(url)).to.eventually.equal(false);
    });
  });

  describe('fetchFile', () => {
    it('should fail if source URL is missing', async () => {
      await expect(downloader.fetchFile('', os.tmpdir())).to.be.rejectedWith('package URL is required');
    });

    it('should fail if destination path is missing', async () => {
      await expect(downloader.fetchFile('https://localhost', '')).to.be.rejectedWith('destination path is required');
    });

    it('should fail with a malformed URL', async () => {
      await expect(downloader.fetchFile('INVALID_URL', os.tmpdir())).to.be.rejectedWith(
        IllegalArgumentError,
        "package URL 'INVALID_URL' is invalid",
      );
    });

    it('should fail with an invalid URL', async () => {
      await expect(downloader.fetchFile('https://localhost/INVALID_FILE', os.tmpdir())).to.be.rejectedWith(
        ResourceNotFoundError,
        "package URL 'https://localhost/INVALID_FILE' does not exist",
      );
    });

    it('should succeed with a valid release artifact URL', async () => {
      try {
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'downloader-'));

        const tag = 'v0.42.5';
        const destPath = `${tmpDir}/build-${tag}.sha384`;

        // we use the build-<tag>.sha384 file URL to test downloading a small file
        const url = `https://builds.hedera.com/node/software/v0.42/build-${tag}.sha384`;
        await expect(downloader.fetchFile(url, destPath)).to.eventually.equal(destPath);
        expect(fs.existsSync(destPath)).to.be.ok;

        // remove the file to reduce disk usage
        fs.rmSync(tmpDir, {recursive: true});
      } catch (e) {
        expect.fail();
      }
    });
  });

  describe('fetchPlatform', () => {
    it('should fail if platform release tag is missing', async () => {
      try {
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'downloader-'));
        await downloader.fetchPlatform('', tmpDir);
        fs.rmSync(tmpDir, {recursive: true});
        throw new Error();
      } catch (e) {
        expect(e.cause).not.to.be.null;
        expect(e).to.be.instanceof(MissingArgumentError);
      }
    });
    it('should fail if platform release artifact is not found', async () => {
      const tag = 'v0.40.0-INVALID';

      try {
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'downloader-'));
        await downloader.fetchPlatform(tag, tmpDir);
        fs.rmSync(tmpDir, {recursive: true});
        throw new Error();
      } catch (e) {
        expect(e.cause).not.to.be.null;
        expect(e.cause).to.be.instanceof(ResourceNotFoundError);
      }
    });

    it('should fail if platform release tag is invalid', async () => {
      try {
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'downloader-'));
        await downloader.fetchPlatform('INVALID', os.tmpdir());
        fs.rmSync(tmpDir, {recursive: true});
        throw new Error();
      } catch (e) {
        expect(e.message).to.contain('must include major, minor and patch fields');
      }
    });

    it('should fail if destination directory is null', async () => {
      try {
        await downloader.fetchPlatform('v0.40.0', '');
        throw new Error();
      } catch (e) {
        expect(e.message).to.contain('destination directory path is required');
      }
    });
  });
});
