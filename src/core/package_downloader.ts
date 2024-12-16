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
import * as crypto from 'crypto';
import * as fs from 'fs';
import {pipeline as streamPipeline} from 'node:stream/promises';
import got from 'got';
import path from 'path';
import {
  DataValidationError,
  SoloError,
  IllegalArgumentError,
  MissingArgumentError,
  ResourceNotFoundError,
} from './errors.js';
import * as https from 'https';
import * as http from 'http';
import {Templates} from './templates.js';
import * as constants from './constants.js';
import {type SoloLogger} from './logging.js';
import {StatusCodes} from 'http-status-codes';

export class PackageDownloader {
  constructor(public readonly logger: SoloLogger) {
    if (!logger) throw new IllegalArgumentError('an instance of core/SoloLogger is required', logger);
  }

  isValidURL(url: string) {
    try {
      // attempt to parse to check URL format
      const out = new URL(url);
      return out.href !== undefined;
    } catch {
      return false;
    }
  }

  urlExists(url: string) {
    const self = this;

    return new Promise<boolean>(resolve => {
      try {
        self.logger.debug(`Checking URL: ${url}`);
        // attempt to send a HEAD request to check URL exists

        const req = url.startsWith('http://')
          ? http.request(url, {method: 'HEAD', timeout: 100, headers: {Connection: 'close'}})
          : https.request(url, {method: 'HEAD', timeout: 100, headers: {Connection: 'close'}});

        req.on('response', r => {
          const statusCode = r.statusCode;
          self.logger.debug({
            response: {
              // @ts-ignore
              connectOptions: r['connect-options'],
              statusCode: r.statusCode,
              headers: r.headers,
            },
          });
          req.destroy();
          if ([StatusCodes.OK, StatusCodes.MOVED_TEMPORARILY].includes(statusCode)) {
            resolve(true);
          }

          resolve(false);
        });

        req.on('error', err => {
          self.logger.error(err);
          resolve(false);
          req.destroy();
        });

        req.end(); // make the request
      } catch (e: Error | any) {
        self.logger.error(e);
        resolve(false);
      }
    });
  }

  /**
   * Fetch data from a URL and save the output to a file
   *
   * @param url - source file URL
   * @param destPath - destination path for the downloaded file
   */
  async fetchFile(url: string, destPath: string) {
    if (!url) {
      throw new IllegalArgumentError('package URL is required', url);
    }

    if (!destPath) {
      throw new IllegalArgumentError('destination path is required', destPath);
    }

    if (!this.isValidURL(url)) {
      throw new IllegalArgumentError(`package URL '${url}' is invalid`, url);
    }

    if (!(await this.urlExists(url))) {
      throw new ResourceNotFoundError(`package URL '${url}' does not exist`, url);
    }

    try {
      await streamPipeline(got.stream(url, {followRedirect: true}), fs.createWriteStream(destPath));

      return destPath;
    } catch (e: Error | any) {
      throw new SoloError(`Error fetching file ${url}: ${e.message}`, e);
    }
  }

  /**
   * Compute hash of the file contents
   * @param filePath - path of the file
   * @param [algo] - hash algorithm
   * @returns hex digest of the computed hash
   * @throws {Error} - if the file cannot be read
   */
  computeFileHash(this: any, filePath: string, algo = 'sha384') {
    const self = this;

    return new Promise<string>((resolve, reject) => {
      try {
        self.logger.debug(`Computing checksum for '${filePath}' using algo '${algo}'`);
        const checksum = crypto.createHash(algo);
        const s = fs.createReadStream(filePath);
        s.on('data', d => {
          checksum.update(d as crypto.BinaryLike);
        });
        s.on('end', () => {
          const d = checksum.digest('hex');
          self.logger.debug(`Computed checksum '${d}' for '${filePath}' using algo '${algo}'`);
          resolve(d);
        });

        s.on('error', e => {
          reject(e);
        });
      } catch (e: Error | any) {
        reject(new SoloError('failed to compute checksum', e, {filePath, algo}));
      }
    });
  }

  /**
   * Verifies that the checksum of the sourceFile matches with the contents of the checksumFile
   *
   * It throws error if the checksum doesn't match.
   *
   * @param sourceFile - path to the file for which checksum to be computed
   * @param checksum - expected checksum
   * @param [algo] - hash algorithm to be used to compute checksum
   * @returns
   * @throws {DataValidationError} - if the checksum doesn't match
   */
  async verifyChecksum(sourceFile: string, checksum: string, algo = 'sha256') {
    const computed = await this.computeFileHash(sourceFile, algo);
    if (checksum !== computed) throw new DataValidationError('checksum', checksum, computed);
  }

  /**
   * Fetch a remote package
   * @param packageURL
   * @param checksumURL - package checksum URL
   * @param destDir - a directory where the files should be downloaded to
   * @param [algo] - checksum algo
   * @param [force] - force download even if the file exists in the destDir
   */
  async fetchPackage(packageURL: string, checksumURL: string, destDir: string, algo = 'sha256', force = false) {
    if (!packageURL) throw new Error('package URL is required');
    if (!checksumURL) throw new Error('checksum URL is required');
    if (!destDir) throw new Error('destination directory path is required');

    this.logger.debug(`Downloading package: ${packageURL}, checksum: ${checksumURL}`);
    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, {recursive: true});
    }

    const packageFile = `${destDir}/${path.basename(packageURL)}`;
    const checksumFile = `${destDir}/${path.basename(checksumURL)}`;

    try {
      if (fs.existsSync(packageFile) && !force) {
        return packageFile;
      }

      await this.fetchFile(checksumURL, checksumFile);
      const checksumData = fs.readFileSync(checksumFile).toString();
      if (!checksumData) throw new SoloError(`unable to read checksum file: ${checksumFile}`);
      const checksum = checksumData.split(' ')[0];
      await this.fetchFile(packageURL, packageFile);
      await this.verifyChecksum(packageFile, checksum, algo);
      return packageFile;
    } catch (e: Error | any) {
      if (fs.existsSync(checksumFile)) {
        fs.rmSync(checksumFile);
      }

      if (fs.existsSync(packageFile)) {
        fs.rmSync(packageFile);
      }

      throw new SoloError(e.message, e);
    }
  }

  /**
   * Fetch Hedera platform release artifact
   *
   * It fetches the build.zip file containing the release from a URL like: https://builds.hedera.com/node/software/v0.40/build-v0.40.4.zip
   *
   * @param tag - full semantic version e.g. v0.40.4
   * @param destDir - directory where the artifact needs to be saved
   * @param [force] - whether to download even if the file exists
   * @returns full path to the downloaded file
   */
  async fetchPlatform(tag: string, destDir: string, force = false) {
    if (!tag) throw new MissingArgumentError('tag is required');
    if (!destDir) {
      throw new MissingArgumentError('destination directory path is required');
    }

    const releaseDir = Templates.prepareReleasePrefix(tag);
    const downloadDir = `${destDir}/${releaseDir}`;
    const packageURL = `${constants.HEDERA_BUILDS_URL}/node/software/${releaseDir}/build-${tag}.zip`;
    const checksumURL = `${constants.HEDERA_BUILDS_URL}/node/software/${releaseDir}/build-${tag}.sha384`;

    return await this.fetchPackage(packageURL, checksumURL, downloadDir, 'sha384', force);
  }
}
