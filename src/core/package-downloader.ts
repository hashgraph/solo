// SPDX-License-Identifier: Apache-2.0

import {SoloErrors} from './errors/solo-errors.js';
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import {pipeline as streamPipeline} from 'node:stream/promises';
import got from 'got';
import path from 'node:path';
import * as https from 'node:https';
import * as http from 'node:http';
import {Templates} from './templates.js';
import {PathEx} from '../business/utils/path-ex.js';
import * as constants from './constants.js';
import {type SoloLogger} from './logging/solo-logger.js';
import {StatusCodes} from 'http-status-codes';
import {inject, injectable} from 'tsyringe-neo';
import {patchInject} from './dependency-injection/container-helper.js';
import {InjectTokens} from './dependency-injection/inject-tokens.js';
import {ReadStream} from 'node:fs';
import {Hash} from 'node:crypto';
import {ClientRequest} from 'node:http';
import {Duration} from './time/duration.js';

const URL_EXISTS_TIMEOUT_ENV: string = 'PACKAGE_DOWNLOADER_URL_EXISTS_TIMEOUT_MS';
const DOWNLOAD_CONNECT_TIMEOUT_ENV: string = 'PACKAGE_DOWNLOADER_DOWNLOAD_CONNECT_TIMEOUT_MS';
const DOWNLOAD_RESPONSE_TIMEOUT_ENV: string = 'PACKAGE_DOWNLOADER_DOWNLOAD_RESPONSE_TIMEOUT_MS';
const DOWNLOAD_RETRY_LIMIT_ENV: string = 'PACKAGE_DOWNLOADER_RETRY_LIMIT';
const DEFAULT_URL_EXISTS_TIMEOUT: Duration = Duration.ofSeconds(5);
const DEFAULT_DOWNLOAD_CONNECT_TIMEOUT: Duration = Duration.ofSeconds(10);
const DEFAULT_DOWNLOAD_RESPONSE_TIMEOUT: Duration = Duration.ofMinutes(2);
const DEFAULT_DOWNLOAD_RETRY_LIMIT: number = 3;

@injectable()
export class PackageDownloader {
  public constructor(@inject(InjectTokens.SoloLogger) public readonly logger?: SoloLogger) {
    this.logger = patchInject(logger, InjectTokens.SoloLogger, this.constructor.name);
  }

  private resolveTimeout(name: string, fallback: Duration): Duration {
    const configuredValue: string | undefined = constants.getEnvironmentVariable(name);
    if (!configuredValue) {
      return fallback;
    }

    const milliseconds: number = Number(configuredValue);
    if (!Number.isFinite(milliseconds) || milliseconds <= 0) {
      this.logger.warn(`Invalid ${name} value '${configuredValue}', using default ${fallback.toMillis()}ms.`);
      return fallback;
    }

    return Duration.ofMillis(milliseconds);
  }

  private getUrlExistsTimeout(): Duration {
    return this.resolveTimeout(URL_EXISTS_TIMEOUT_ENV, DEFAULT_URL_EXISTS_TIMEOUT);
  }

  private getDownloadConnectTimeout(): Duration {
    return this.resolveTimeout(DOWNLOAD_CONNECT_TIMEOUT_ENV, DEFAULT_DOWNLOAD_CONNECT_TIMEOUT);
  }

  private getDownloadResponseTimeout(): Duration {
    return this.resolveTimeout(DOWNLOAD_RESPONSE_TIMEOUT_ENV, DEFAULT_DOWNLOAD_RESPONSE_TIMEOUT);
  }

  private getDownloadRetryLimit(): number {
    const configured: string | undefined = constants.getEnvironmentVariable(DOWNLOAD_RETRY_LIMIT_ENV);
    if (!configured) {
      return DEFAULT_DOWNLOAD_RETRY_LIMIT;
    }
    const value: number = Number(configured);
    if (!Number.isFinite(value) || value < 0) {
      this.logger.warn(
        `Invalid ${DOWNLOAD_RETRY_LIMIT_ENV} value '${configured}', using default ${DEFAULT_DOWNLOAD_RETRY_LIMIT}.`,
      );
      return DEFAULT_DOWNLOAD_RETRY_LIMIT;
    }
    return value;
  }

  private async streamToFile(
    url: string,
    destinationPath: string,
    connectTimeout: number,
    responseTimeout: number,
  ): Promise<void> {
    await streamPipeline(
      got.stream(url, {
        followRedirect: true,
        timeout: {connect: connectTimeout, response: responseTimeout},
      }),
      fs.createWriteStream(destinationPath),
    );
  }

  private isValidURL(url: string): boolean {
    try {
      // attempt to parse to check URL format
      const out: URL = new URL(url);
      return out.href !== undefined;
    } catch {
      return false;
    }
  }

  private isHeadCheckOptional(url: string): boolean {
    const parsedUrl: URL = new URL(url);
    return parsedUrl.hostname === 'github.com' && parsedUrl.pathname.includes('/releases/download/');
  }

  public urlExists(url: string): Promise<boolean> {
    return new Promise<boolean>((resolve): void => {
      try {
        this.logger.debug(`Checking URL: ${url}`);
        // attempt to send a HEAD request to check URL exists
        const timeout: number = this.getUrlExistsTimeout().toMillis();

        const request: ClientRequest = url.startsWith('http://')
          ? http.request(url, {method: 'HEAD', timeout, headers: {Connection: 'close'}})
          : https.request(url, {method: 'HEAD', timeout, headers: {Connection: 'close'}});

        request.on('response', (response): void => {
          const statusCode: number = response.statusCode;
          this.logger.debug({
            response: {
              connectOptions: response['connect-options'],
              statusCode: response.statusCode,
              headers: response.headers,
            },
          });
          request.destroy();
          if ([StatusCodes.OK, StatusCodes.MOVED_TEMPORARILY, StatusCodes.MOVED_PERMANENTLY].includes(statusCode)) {
            resolve(true);
          }

          resolve(false);
        });

        request.on('error', (error): void => {
          this.logger.error(error);
          resolve(false);
          request.destroy();
        });

        request.end(); // make the request
      } catch (error) {
        this.logger.error(error);
        resolve(false);
      }
    });
  }

  /**
   * Fetch data from a URL and save the output to a file
   *
   * @param url - source file URL
   * @param destinationPath - destination path for the downloaded file
   */
  public async fetchFile(url: string, destinationPath: string): Promise<string> {
    if (!url) {
      throw new SoloErrors.validation.illegalArgument('package URL is required', url);
    }

    if (!destinationPath) {
      throw new SoloErrors.validation.illegalArgument('destination path is required', destinationPath);
    }

    if (!this.isValidURL(url)) {
      throw new SoloErrors.validation.illegalArgument(`package URL '${url}' is invalid`, url);
    }

    if (!(await this.urlExists(url))) {
      if (!this.isHeadCheckOptional(url)) {
        throw new SoloErrors.system.resourceNotFound(url);
      }
      this.logger.warn(`HEAD request reported missing URL; continuing with direct download attempt: ${url}`);
    }

    const connectTimeout: number = this.getDownloadConnectTimeout().toMillis();
    const responseTimeout: number = this.getDownloadResponseTimeout().toMillis();
    const retryLimit: number = this.getDownloadRetryLimit();

    let lastError: unknown;
    for (let attempt: number = 1; attempt <= retryLimit; attempt++) {
      try {
        await this.streamToFile(url, destinationPath, connectTimeout, responseTimeout);
        return destinationPath;
      } catch (error) {
        lastError = error;
        if (fs.existsSync(destinationPath)) {
          fs.rmSync(destinationPath);
        }
        if (attempt < retryLimit) {
          const delayMs: number = 2000 * attempt;
          this.logger.warn(`Download attempt ${attempt}/${retryLimit} failed, retrying in ${delayMs}ms: ${url}`, error);
          await new Promise<void>((resolve): void => {
            setTimeout(resolve, delayMs);
          });
        }
      }
    }
    throw new SoloErrors.system.packageDownloadFailed(url, lastError as Error);
  }

  /**
   * Compute hash of the file contents
   * @param filePath - path of the file
   * @param [algo] - hash algorithm
   * @returns hex digest of the computed hash
   * @throws {Error} - if the file cannot be read
   */
  private computeFileHash(this: PackageDownloader, filePath: string, algo: string = 'sha384'): Promise<string> {
    return new Promise<string>((resolve, reject): void => {
      try {
        this.logger.debug(`Computing checksum for '${filePath}' using algo '${algo}'`);
        const checksum: Hash = crypto.createHash(algo);
        const s: ReadStream = fs.createReadStream(filePath);
        s.on('data', (d): void => {
          checksum.update(d);
        });
        s.on('end', (): void => {
          const d: string = checksum.digest('hex');
          this.logger.debug(`Computed checksum '${d}' for '${filePath}' using algo '${algo}'`);
          resolve(d);
        });

        s.on('error', (error): void => {
          reject(error);
        });
      } catch (error) {
        reject(new SoloErrors.system.packageDownloadFailed(filePath, error));
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
  private async verifyChecksum(sourceFile: string, checksum: string, algo: string = 'sha256'): Promise<void> {
    const computed: string = await this.computeFileHash(sourceFile, algo);
    if (checksum !== computed) {
      throw new SoloErrors.internal.dataValidation('checksum', checksum, computed);
    }
  }

  /**
   * Download a checksum file and return the checksum it contains
   * @param checksumURL - URL of the checksum file
   * @param checksumFile - path where the checksum file should be saved
   * @returns the checksum read from the downloaded file
   */
  private async fetchChecksum(checksumURL: string, checksumFile: string): Promise<string> {
    await this.fetchFile(checksumURL, checksumFile);
    const checksumData: string = fs.readFileSync(checksumFile).toString();
    if (!checksumData) {
      throw new SoloErrors.system.checksumReadFailed(checksumFile);
    }
    return checksumData.split(' ', 1)[0];
  }

  /**
   * Read a previously downloaded checksum file
   * @param checksumFile - path of the cached checksum file
   * @param algo - hash algorithm the checksum is expected to be for
   * @returns the checksum, or undefined when the file is absent or not a well-formed digest for the algorithm
   */
  private readCachedChecksum(checksumFile: string, algo: string): string | undefined {
    try {
      const checksum: string = fs.readFileSync(checksumFile).toString().split(' ', 1)[0].trim();
      const digestHexLength: number = crypto.createHash(algo).digest().length * 2;
      return new RegExp(`^[0-9a-f]{${digestHexLength}}$`, 'i').test(checksum) ? checksum : undefined;
    } catch {
      // best-effort: an absent or unreadable cached checksum file simply means it must be downloaded
      return undefined;
    }
  }

  /**
   * Fetch a remote package
   * @param packageURL
   * @param checksumDataOrURL - package checksum URL or checksum data
   * @param destinationDirectory - a directory where the files should be downloaded to
   * @param verifyChecksum - whether to verify checksum or not
   * @param [algo] - checksum algo
   * @param [force] - download unconditionally, skipping the checksum check of an already present file.
   *                  When false, an already present file is reused only if its checksum matches; otherwise
   *                  it is discarded and downloaded again.
   */
  public async fetchPackage(
    packageURL: string,
    checksumDataOrURL: string,
    destinationDirectory: string,
    verifyChecksum: boolean = true,
    algo: string = 'sha256',
    force: boolean = false,
  ): Promise<string> {
    if (!packageURL) {
      throw new Error('package URL is required');
    }
    if (!checksumDataOrURL) {
      throw new Error('checksum data or URL is required');
    }
    if (!destinationDirectory) {
      throw new Error('destination directory path is required');
    }

    this.logger.debug(`Downloading package: ${packageURL}, checksum: ${checksumDataOrURL}`);
    if (!fs.existsSync(destinationDirectory)) {
      fs.mkdirSync(destinationDirectory, {recursive: true});
    }

    const packageFile: string = PathEx.join(destinationDirectory, path.basename(packageURL));

    let checksumFile: string;
    try {
      let checksum: string;
      let checksumIsFromCache: boolean = false;
      if (verifyChecksum) {
        if (this.isValidURL(checksumDataOrURL)) {
          checksumFile = PathEx.join(destinationDirectory, path.basename(checksumDataOrURL));
          // prefer the cached checksum file when reusing a cached package, so that a fully warm
          // cache stays usable without network access; download it when missing or malformed
          const cachedChecksum: string | undefined =
            fs.existsSync(packageFile) && !force ? this.readCachedChecksum(checksumFile, algo) : undefined;
          if (cachedChecksum === undefined) {
            checksum = await this.fetchChecksum(checksumDataOrURL, checksumFile);
          } else {
            checksum = cachedChecksum;
            checksumIsFromCache = true;
          }
        } else {
          checksum = checksumDataOrURL;
        }
      }

      if (fs.existsSync(packageFile) && !force) {
        if (!verifyChecksum) {
          return packageFile;
        }

        try {
          await this.verifyChecksum(packageFile, checksum, algo);
          return packageFile;
        } catch (error) {
          let verificationError: unknown = error;
          if (checksumIsFromCache) {
            // the cached checksum file may itself be the corrupt artifact, so retry against a
            // freshly downloaded one before giving up on the cached package
            checksum = await this.fetchChecksum(checksumDataOrURL, checksumFile);
            try {
              await this.verifyChecksum(packageFile, checksum, algo);
              return packageFile;
            } catch (freshChecksumError) {
              verificationError = freshChecksumError;
            }
          }
          // an already present file that fails verification (e.g. truncated by a crashed download) must
          // never be reused, so discard it and fall through to the download below, which verifies again
          this.logger.warn(
            `Cached package '${packageFile}' failed checksum verification, downloading it again`,
            verificationError,
          );
          fs.rmSync(packageFile);
        }
      }

      await this.fetchFile(packageURL, packageFile);

      if (verifyChecksum) {
        await this.verifyChecksum(packageFile, checksum, algo);
      }
      return packageFile;
    } catch (error) {
      if (checksumFile && fs.existsSync(checksumFile)) {
        fs.rmSync(checksumFile);
      }

      if (fs.existsSync(packageFile)) {
        fs.rmSync(packageFile);
      }

      throw new SoloErrors.system.packageDownloadFailed(packageURL, error);
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
  public async fetchPlatform(tag: string, destinationDirectory: string, force: boolean = false): Promise<string> {
    if (!tag) {
      throw new SoloErrors.validation.missingArgument('tag is required');
    }
    if (!destinationDirectory) {
      throw new SoloErrors.validation.missingArgument('destination directory path is required');
    }

    const releaseDirectory: string = Templates.prepareReleasePrefix(tag);
    const packageURL: string = `${constants.HEDERA_BUILDS_URL}/node/software/${releaseDirectory}/build-${tag}.zip`;
    const checksumURL: string = `${constants.HEDERA_BUILDS_URL}/node/software/${releaseDirectory}/build-${tag}.sha384`;

    return await this.fetchPackage(packageURL, checksumURL, destinationDirectory, true, 'sha384', force);
  }
}
