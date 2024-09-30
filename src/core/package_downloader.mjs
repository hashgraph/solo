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
'use strict'
import * as crypto from 'crypto'
import * as fs from 'fs'
import { pipeline as streamPipeline } from 'node:stream/promises'
import got from 'got'
import path from 'path'
import {
  DataValidationError,
  FullstackTestingError,
  IllegalArgumentError,
  MissingArgumentError,
  ResourceNotFoundError
} from './errors.mjs'
import * as https from 'https'
import * as http from 'http'
import { Templates } from './templates.mjs'
import { constants } from './index.mjs'

export class PackageDownloader {
  /**
   * Create an instance of Downloader
   * @param {Logger} logger - an instance of core/Logger
   */
  constructor (logger) {
    if (!logger) throw new IllegalArgumentError('an instance of core/Logger is required', logger)
    this.logger = logger
  }

  /**
   * @param {string} url
   * @returns {boolean}
   */
  isValidURL (url) {
    try {
      // attempt to parse to check URL format
      const out = new URL(url)
      return out.href !== undefined
    } catch (e) {
    }

    return false
  }

  /**
   * @param {string} url
   * @returns {Promise<boolean>}
   */
  async urlExists (url) {
    const self = this

    return new Promise((resolve, reject) => {
      try {
        self.logger.debug(`Checking URL: ${url}`)
        let req
        // attempt to send a HEAD request to check URL exists
        if (url.startsWith('http://')) {
          req = http.request(url, { method: 'HEAD', timeout: 100, headers: { Connection: 'close' } })
        } else {
          req = https.request(url, { method: 'HEAD', timeout: 100, headers: { Connection: 'close' } })
        }

        req.on('response', r => {
          const statusCode = r.statusCode
          self.logger.debug({
            response: {
              connectOptions: r['connect-options'],
              statusCode: r.statusCode,
              headers: r.headers
            }

          })
          req.destroy()
          if ([200, 302].includes(statusCode)) {
            resolve(true)
            return
          }

          resolve(false)
        })

        req.on('error', err => {
          self.logger.error(err)
          resolve(false)
          req.destroy()
        })

        req.end() // make the request
      } catch (e) {
        self.logger.error(e)
        resolve(false)
      }
    })
  }

  /**
   * Fetch data from a URL and save the output to a file
   *
   * @param {string} url - source file URL
   * @param {string} destPath - destination path for the downloaded file
   * @returns {Promise<string>}
   */
  async fetchFile (url, destPath) {
    if (!url) {
      throw new IllegalArgumentError('package URL is required', url)
    }

    if (!destPath) {
      throw new IllegalArgumentError('destination path is required', destPath)
    }

    if (!this.isValidURL(url)) {
      throw new IllegalArgumentError(`package URL '${url}' is invalid`, url)
    }

    if (!await this.urlExists(url)) {
      throw new ResourceNotFoundError(`package URL '${url}' does not exist`, url)
    }

    try {
      await streamPipeline(
        got.stream(url, { followRedirect: true }),
        fs.createWriteStream(destPath)
      )

      return destPath
    } catch (e) {
      throw new FullstackTestingError(`Error fetching file ${url}: ${e.message}`, e)
    }
  }

  /**
   * Compute hash of the file contents
   * @param {string} filePath - path of the file
   * @param {string} [algo] - hash algorithm
   * @returns {Promise<string>} returns hex digest of the computed hash
   * @throws Error if the file cannot be read
   */
  async computeFileHash (filePath, algo = 'sha384') {
    const self = this

    return new Promise((resolve, reject) => {
      try {
        self.logger.debug(`Computing checksum for '${filePath}' using algo '${algo}'`)
        const checksum = crypto.createHash(algo)
        const s = fs.createReadStream(filePath)
        s.on('data', function (d) {
          checksum.update(d)
        })
        s.on('end', function () {
          const d = checksum.digest('hex')
          self.logger.debug(`Computed checksum '${d}' for '${filePath}' using algo '${algo}'`)
          resolve(d)
        })

        s.on('error', (e) => {
          reject(e)
        })
      } catch (e) {
        reject(new FullstackTestingError('failed to compute checksum', e, { filePath, algo }))
      }
    })
  }

  /**
   * Verifies that the checksum of the sourceFile matches with the contents of the checksumFile
   *
   * It throws error if the checksum doesn't match.
   *
   * @param {string} sourceFile - path to the file for which checksum to be computed
   * @param checksum - expected checksum
   * @param {string} [algo] - hash algorithm to be used to compute checksum
   * @returns {Promise<void>}
   * @throws DataValidationError if the checksum doesn't match
   */
  async verifyChecksum (sourceFile, checksum, algo = 'sha256') {
    const computed = await this.computeFileHash(sourceFile, algo)
    if (checksum !== computed) throw new DataValidationError('checksum', checksum, computed)
  }

  /**
   * Fetch a remote package
   * @param {string} packageURL
   * @param {string} checksumURL - package checksum URL
   * @param {string} destDir - a directory where the files should be downloaded to
   * @param {string} [algo] - checksum algo
   * @param {boolean} [force] - force download even if the file exists in the destDir
   * @returns {Promise<string>}
   */
  async fetchPackage (packageURL, checksumURL, destDir, algo = 'sha256', force = false) {
    if (!packageURL) throw new Error('package URL is required')
    if (!checksumURL) throw new Error('checksum URL is required')
    if (!destDir) throw new Error('destination directory path is required')

    this.logger.debug(`Downloading package: ${packageURL}, checksum: ${checksumURL}`)
    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true })
    }

    const packageFile = `${destDir}/${path.basename(packageURL)}`
    const checksumFile = `${destDir}/${path.basename(checksumURL)}`

    try {
      if (fs.existsSync(packageFile) && !force) {
        return packageFile
      }

      await this.fetchFile(checksumURL, checksumFile)
      const checksumData = fs.readFileSync(checksumFile).toString()
      if (!checksumData) throw new FullstackTestingError(`unable to read checksum file: ${checksumFile}`)
      const checksum = checksumData.split(' ')[0]
      await this.fetchFile(packageURL, packageFile)
      await this.verifyChecksum(packageFile, checksum, algo)
      return packageFile
    } catch (e) {
      if (fs.existsSync(checksumFile)) {
        fs.rmSync(checksumFile)
      }

      if (fs.existsSync(packageFile)) {
        fs.rmSync(packageFile)
      }

      throw new FullstackTestingError(e.message, e)
    }
  }

  /**
   * Fetch Hedera platform release artifact
   *
   * It fetches the build.zip file containing the release from a URL like: https://builds.hedera.com/node/software/v0.40/build-v0.40.4.zip
   *
   * @param {string} tag - full semantic version e.g. v0.40.4
   * @param {string} destDir - directory where the artifact needs to be saved
   * @param {boolean} [force] - whether to download even if the file exists
   * @returns {Promise<string>} full path to the downloaded file
   */
  async fetchPlatform (tag, destDir, force = false) {
    if (!tag) throw new MissingArgumentError('tag is required')
    if (!destDir) throw new MissingArgumentError('destination directory path is required')

    const releaseDir = Templates.prepareReleasePrefix(tag)
    const downloadDir = `${destDir}/${releaseDir}`
    const packageURL = `${constants.HEDERA_BUILDS_URL}/node/software/${releaseDir}/build-${tag}.zip`
    const checksumURL = `${constants.HEDERA_BUILDS_URL}/node/software/${releaseDir}/build-${tag}.sha384`

    return this.fetchPackage(packageURL, checksumURL, downloadDir, 'sha384', force)
  }
}
