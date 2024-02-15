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
import * as crypto from 'crypto'
import * as fs from 'fs'
import { pipeline as streamPipeline } from 'node:stream/promises'
import got from 'got'
import { DataValidationError, FullstackTestingError, IllegalArgumentError, ResourceNotFoundError } from './errors.mjs'
import * as https from 'https'
import { Templates } from './templates.mjs'
import { constants } from './index.mjs'

export class PackageDownloader {
  /**
   * Create an instance of Downloader
   * @param logger an instance of core/Logger
   */
  constructor (logger) {
    if (!logger) throw new IllegalArgumentError('an instance of core/Logger is required', logger)
    this.logger = logger
  }

  isValidURL (url) {
    try {
      // attempt to parse to check URL format
      const out = new URL(url)
      return out.href !== undefined
    } catch (e) {
    }

    return false
  }

  async urlExists (url) {
    const self = this

    return new Promise((resolve, reject) => {
      try {
        self.logger.debug(`Checking URL: ${url}`)
        // attempt to send a HEAD request to check URL exists
        const req = https.request(url, { method: 'HEAD', timeout: 100, headers: { Connection: 'close' } })

        req.on('response', r => {
          const statusCode = r.statusCode
          self.logger.debug({
            response: {
              connectOptions: r['connect-options'],
              statusCode: r.statusCode,
              headers: r.headers
            }

          })

          if (statusCode === 200) {
            resolve(true)
            return
          }

          resolve(false)
        })

        req.on('error', err => {
          self.logger.error(err)
          resolve(false)
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
   * @param url source file URL
   * @param destPath destination path for the downloaded file
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
        got.stream(url),
        fs.createWriteStream(destPath)
      )

      return destPath
    } catch (e) {
      throw new ResourceNotFoundError(e.message, url, e)
    }
  }

  /**
   * Compute hash of the file contents
   * @param filePath path of the file
   * @param algo hash algorithm
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
   * @param sourceFile path to the file for which checksum to be computed
   * @param checksum expected checksum
   * @param algo hash algorithm to be used to compute checksum
   * @throws DataValidationError if the checksum doesn't match
   */
  async verifyChecksum (sourceFile, checksum, algo = 'sha384') {
    const computed = await this.computeFileHash(sourceFile, algo)
    if (checksum !== computed) throw new DataValidationError('checksum', checksum, computed)
  }

  /**
   * Fetch platform release artifact
   *
   * It fetches the build.zip file containing the release from a URL like: https://builds.hedera.com/node/software/v0.40/build-v0.40.4.zip
   *
   * @param tag full semantic version e.g. v0.40.4
   * @param destDir directory where the artifact needs to be saved
   * @param force whether to download even if the file exists
   * @returns {Promise<string>} full path to the downloaded file
   */
  async fetchPlatform (tag, destDir, force = false) {
    const self = this
    const releaseDir = Templates.prepareReleasePrefix(tag)

    if (!destDir) throw new Error('destination directory path is required')

    if (!fs.existsSync(destDir)) {
      throw new IllegalArgumentError(`destDir (${destDir}) does not exist`, destDir)
    } else if (!fs.statSync(destDir).isDirectory()) {
      throw new IllegalArgumentError(`destDir (${destDir}) is not a directory`, destDir)
    }

    const downloadDir = `${destDir}/${releaseDir}`
    const packageURL = `${constants.HEDERA_BUILDS_URL}/node/software/${releaseDir}/build-${tag}.zip`
    const packageFile = `${downloadDir}/build-${tag}.zip`
    const checksumURL = `${constants.HEDERA_BUILDS_URL}/node/software/${releaseDir}/build-${tag}.sha384`
    const checksumPath = `${downloadDir}/build-${tag}.sha384`
    this.logger.debug(`Package URL: ${packageURL}`)

    try {
      if (fs.existsSync(packageFile) && !force) {
        return packageFile
      }

      if (!fs.existsSync(downloadDir)) {
        fs.mkdirSync(downloadDir, { recursive: true })
      }

      await this.fetchFile(packageURL, packageFile)
      await this.fetchFile(checksumURL, checksumPath)

      const checksum = fs.readFileSync(checksumPath).toString().split(' ')[0]
      await this.verifyChecksum(packageFile, checksum)
      return packageFile
    } catch (e) {
      self.logger.error(e)
      throw new FullstackTestingError(e.message, e, { tag, destDir })
    }
  }
}
