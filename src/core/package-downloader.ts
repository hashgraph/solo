// SPDX-License-Identifier: Apache-2.0

import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import {pipeline as streamPipeline} from 'node:stream/promises';
import got from 'got';
import path from 'node:path';
import {DataValidationError} from './errors/data-validation-error.js';
import {SoloError} from './errors/solo-error.js';
import {IllegalArgumentError} from './errors/illegal-argument-error.js';
import {MissingArgumentError} from './errors/missing-argument-error.js';
import {ResourceNotFoundError} from './errors/resource-not-found-error.js';
import * as https from 'node:https';
import * as http from 'node:http';
import {Templates} from './templates.js';
import * as constants from './constants.js';
import {type SoloLogger} from './logging/solo-logger.js';
import {StatusCodes} from 'http-status-codes';
import {inject, injectable} from 'tsyringe-neo';
import {patchInject} from './dependency-injection/container-helper.js';
import {InjectTokens} from './dependency-injection/inject-tokens.js';

@injectable()
export class PackageDownloader {
  constructor(@inject(InjectTokens.SoloLogger) public readonly logger?: SoloLogger) {
    this.logger = patchInject(logger, InjectTokens.SoloLogger, this.constructor.name);
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

        const request = url.startsWith('http://')
          ? http.request(url, {method: 'HEAD', timeout: 100, headers: {Connection: 'close'}})
          : https.request(url, {method: 'HEAD', timeout: 100, headers: {Connection: 'close'}});

        request.on('response', r => {
          const statusCode = r.statusCode;
          self.logger.debug({
            response: {
              // @ts-ignore
              connectOptions: r['connect-options'],
              statusCode: r.statusCode,
              headers: r.headers,
            },
          });
          request.destroy();
          if ([StatusCodes.OK, StatusCodes.MOVED_TEMPORARILY].includes(statusCode)) {
            resolve(true);
          }

          resolve(false);
        });

        request.on('error', error => {
          self.logger.error(error);
          resolve(false);
          request.destroy();
        });

        request.end(); // make the request
      } catch (error: Error | any) {
        self.logger.error(error);
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
  async fetchFile(url: string, destinationPath: string) {
    if (!url) {
      throw new IllegalArgumentError('package URL is required', url);
    }

    if (!destinationPath) {
      throw new IllegalArgumentError('destination path is required', destinationPath);
    }

    if (!this.isValidURL(url)) {
      throw new IllegalArgumentError(`package URL '${url}' is invalid`, url);
    }

    if (!(await this.urlExists(url))) {
      throw new ResourceNotFoundError(`package URL '${url}' does not exist`, url);
    }

    try {
      await streamPipeline(got.stream(url, {followRedirect: true}), fs.createWriteStream(destinationPath));

      return destinationPath;
    } catch (error: Error | any) {
      throw new SoloError(`Error fetching file ${url}: ${error.message}`, error);
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

        s.on('error', error => {
          reject(error);
        });
      } catch (error: Error | any) {
        reject(new SoloError('failed to compute checksum', error, {filePath, algo}));
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
   * @param destinationDirectory - a directory where the files should be downloaded to
   * @param [algo] - checksum algo
   * @param [force] - force download even if the file exists in the destinationDirectory
   */
  async fetchPackage(
    packageURL: string,
    checksumURL: string,
    destinationDirectory: string,
    algo = 'sha256',
    force = false,
  ) {
    if (!packageURL) throw new Error('package URL is required');
    if (!checksumURL) throw new Error('checksum URL is required');
    if (!destinationDirectory) throw new Error('destination directory path is required');

    this.logger.debug(`Downloading package: ${packageURL}, checksum: ${checksumURL}`);
    if (!fs.existsSync(destinationDirectory)) {
      fs.mkdirSync(destinationDirectory, {recursive: true});
    }

    const packageFile = `${destinationDirectory}/${path.basename(packageURL)}`;
    const checksumFile = `${destinationDirectory}/${path.basename(checksumURL)}`;

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
    } catch (error: Error | any) {
      if (fs.existsSync(checksumFile)) {
        fs.rmSync(checksumFile);
      }

      if (fs.existsSync(packageFile)) {
        fs.rmSync(packageFile);
      }

      throw new SoloError(error.message, error);
    }
  }

  /**
   * Fetch Hedera platform release artifact
   *
   * It fetches the build.zip file containing the release from a URL like: https://builds.hedera.com/node/software/v0.40/build-v0.40.4.zip
   *
   * @param tag - full semantic version e.g. v0.40.4
   * @param destinationDirectory - directory where the artifact needs to be saved
   * @param [force] - whether to download even if the file exists
   * @returns full path to the downloaded file
   */
  async fetchPlatform(tag: string, destinationDirectory: string, force = false) {
    if (!tag) throw new MissingArgumentError('tag is required');
    if (!destinationDirectory) {
      throw new MissingArgumentError('destination directory path is required');
    }

    const releaseDirectory = Templates.prepareReleasePrefix(tag);
    const downloadDirectory = `${destinationDirectory}/${releaseDirectory}`;
    const packageURL = `${constants.HEDERA_BUILDS_URL}/node/software/${releaseDirectory}/build-${tag}.zip`;
    const checksumURL = `${constants.HEDERA_BUILDS_URL}/node/software/${releaseDirectory}/build-${tag}.sha384`;

    return await this.fetchPackage(packageURL, checksumURL, downloadDirectory, 'sha384', force);
  }
}
