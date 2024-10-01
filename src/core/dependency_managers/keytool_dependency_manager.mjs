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
import fs from 'fs'
import os from 'os'
import path from 'path'
import * as semver from 'semver'
import * as util from 'util'
import { MissingArgumentError, SoloError, IllegalArgumentError } from '../errors.mjs'
import * as helpers from '../helpers.mjs'
import { constants, Keytool, Templates } from '../index.mjs'
import * as version from '../../../version.mjs'
import { ShellRunner } from '../shell_runner.mjs'
import got from 'got'
import { OS_WIN32, OS_WINDOWS } from '../constants.mjs'

/**
 * Installs or uninstalls JRE client at SOLO_HOME_DIR/bin/jre directory
 */
export class KeytoolDependencyManager extends ShellRunner {
  /**
   * @param {PackageDownloader} downloader
   * @param {Zippy} zippy
   * @param {Logger} logger
   * @param {string} [installationDir]
   * @param {NodeJS.Platform} [osPlatform]
   * @param {string} [osArch]
   * @param {string} [javaVersion]
   */
  constructor (
    downloader,
    zippy,
    logger,
    installationDir = path.join(constants.SOLO_HOME_DIR, 'bin'),
    osPlatform = os.platform(),
    osArch = os.arch(),
    javaVersion = version.JAVA_VERSION
  ) {
    super(logger)

    if (!downloader) throw new MissingArgumentError('An instance of core/PackageDownloader is required')
    if (!zippy) throw new MissingArgumentError('An instance of core/Zippy is required')
    if (!logger) throw new IllegalArgumentError('an instance of core/Logger is required', logger)
    if (!installationDir) throw new MissingArgumentError('installation directory is required')

    this.downloader = downloader
    this.zippy = zippy
    this.installationDir = installationDir
    this.jreDir = path.join(this.installationDir, 'jre')
    // Node.js uses 'win32' for windows in package.json os field, but jdk too uses 'windows'
    if (osPlatform === OS_WIN32) {
      this.osPlatform = OS_WINDOWS
    } else {
      this.osPlatform = ['mac', 'darwin'].includes(osPlatform) ? constants.OS_MAC : osPlatform
    }
    switch (osArch) {
      case 'x64':
      case 'x86-64':
      case 'amd64':
        this.osArch = 'x64'
        break
      case 'arm64':
        this.osArch = 'aarch64'
        break
      default:
        throw new SoloError(`unsupported os arch: ${osArch}`)
    }

    this.javaVersion = semver.parse(javaVersion, { includePrerelease: true })
    this.keytoolPath = Templates.installationPath(constants.KEYTOOL, this.osPlatform, this.installationDir)
  }

  /**
   * @returns {Promise<string>}
   * @private
   */
  async _fetchKeytoolArtifactUrl () {
    const keytoolRelease = `jdk-${this.javaVersion.major}.${this.javaVersion.minor}.${this.javaVersion.patch}%2B${this.javaVersion.build}`
    const adoptiumURL = `https://api.adoptium.net/v3/assets/release_name/eclipse/${keytoolRelease}?architecture=${this.osArch}&heap_size=normal&image_type=jre&os=${this.osPlatform}&project=jdk`
    const data = await got.get(adoptiumURL).json()
    return data.binaries[0].package
  }

  /**
   * @returns {string}
   */
  getKeytoolPath () {
    return this.keytoolPath
  }

  /**
   * @returns {boolean}
   */
  isInstalled () {
    return fs.existsSync(this.keytoolPath)
  }

  /**
   * Uninstall keytool from solo bin folder
   * @returns {Promise<void>}
   */
  async uninstall () {
    if (fs.existsSync(this.jreDir)) {
      fs.rmSync(this.jreDir, { recursive: true })
    }
  }

  /**
   * @param {string} [tmpDir]
   * @returns {Promise<boolean>}
   */
  async install (tmpDir = helpers.getTmpDir()) {
    const extractedDir = path.join(tmpDir, 'extracted-keytool')
    if (!this.keytoolPackage) {
      this.keytoolPackage = await this._fetchKeytoolArtifactUrl()
    }

    const packageURL = this.keytoolPackage.link
    const checksumURL = this.keytoolPackage.checksum_link
    const packageFile = await this.downloader.fetchPackage(packageURL, checksumURL, tmpDir)
    if ([constants.OS_WINDOWS].includes(this.osPlatform)) {
      await this.zippy.unzip(packageFile, extractedDir)
    } else {
      await this.zippy.untar(packageFile, extractedDir)
    }

    if (!fs.existsSync(this.jreDir)) {
      fs.mkdirSync(this.jreDir, { recursive: true })
    }

    // install new keytool
    await this.uninstall()

    // $extractedDir/jdk-21.0.1+12-jre
    let keytoolSrcPath = path.join(extractedDir,
      util.format('jdk-%s.%s.%s+%s-jre',
        this.javaVersion.major,
        this.javaVersion.minor,
        this.javaVersion.patch,
        this.javaVersion.build.join()
      ))

    if (this.osPlatform === constants.OS_MAC) {
      keytoolSrcPath = path.join(keytoolSrcPath, 'Contents', 'Home')
    }

    fs.cpSync(keytoolSrcPath, this.jreDir, { recursive: true })

    if (fs.existsSync(extractedDir)) {
      fs.rmSync(extractedDir, { recursive: true })
    }

    return this.isInstalled()
  }

  /**
   * @param {boolean} [shouldInstall]
   * @returns {Promise<boolean>}
   */
  async checkVersion (shouldInstall = true) {
    if (!this.isInstalled()) {
      if (shouldInstall) {
        await this.install()
      } else {
        return false
      }
    }

    const output = await this.run(`${this.keytoolPath} -version`)
    const parts = output[0].split(' ')
    this.logger.debug(`Found ${constants.KEYTOOL}:${parts[1]}`)
    return semver.gte(parts[1], version.JAVA_VERSION)
  }

  /**
   * @returns {Keytool}
   */
  getKeytool () {
    if (this.keytool) {
      return this.keytool
    }

    this.keytool = new Keytool(this.logger, this.osPlatform)
    return this.keytool
  }

  /**
   * @returns {string}
   */
  getKeytoolVersion () {
    return version.JAVA_VERSION
  }
}
