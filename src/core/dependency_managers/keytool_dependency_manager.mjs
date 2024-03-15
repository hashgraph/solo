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
import fs from 'fs'
import os from 'os'
import path from 'path'
import * as semver from 'semver'
import * as util from 'util'
import { MissingArgumentError, FullstackTestingError } from '../errors.mjs'
import * as helpers from '../helpers.mjs'
import { constants, Templates } from '../index.mjs'
import * as version from '../../../version.mjs'
import { ShellRunner } from '../shell_runner.mjs'
import got from 'got'

/**
 * Installs or uninstalls JRE client at SOLO_HOME_DIR/bin/jre directory
 */
export class KeytoolDependencyManager extends ShellRunner {
  constructor (
    downloader,
    zippy,
    logger,
    installationDir = path.join(constants.SOLO_HOME_DIR, 'bin', 'jre'),
    osPlatform = os.platform(),
    osArch = os.arch(),
    javaVersion = version.JAVA_VERSION
  ) {
    super(logger)

    if (!downloader) throw new MissingArgumentError('An instance of core/PackageDownloader is required')
    if (!zippy) throw new MissingArgumentError('An instance of core/Zippy is required')
    if (!installationDir) throw new MissingArgumentError('installation directory is required')

    this.downloader = downloader
    this.zippy = zippy
    this.installationDir = installationDir
    this.osPlatform = ['mac', 'darwin'].includes(osPlatform) ? constants.OS_MAC : osPlatform

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
        throw new FullstackTestingError(`unsupported os arch: ${osArch}`)
    }

    this.javaVersion = semver.parse(javaVersion, { includePrerelease: true })
    this.keytoolPath = Templates.installationPath(constants.KEYTOOL, this.osPlatform, this.installationDir)
    this.keytoolPath = Templates.installationPath(constants.KEYTOOL, this.osPlatform, this.installationDir)
  }

  async _fetchKeytoolArtifactUrl () {
    const keytoolRelease = `jdk-${this.javaVersion.major}.${this.javaVersion.minor}.${this.javaVersion.patch}%2B${this.javaVersion.build}`
    const adoptiumURL = `https://api.adoptium.net/v3/assets/release_name/eclipse/${keytoolRelease}?architecture=${this.osArch}&heap_size=normal&image_type=jre&os=${this.osPlatform}&project=jdk`
    const data = await got.get(adoptiumURL).json()
    return data.binaries[0].package
  }

  getKeytoolPath () {
    return this.keytoolPath
  }

  isInstalled () {
    return fs.existsSync(this.keytoolPath)
  }

  /**
   * Uninstall keytool from solo bin folder
   * @return {Promise<void>}
   */
  async uninstall () {
    if (fs.existsSync(this.installationDir)) {
      fs.rmSync(this.installationDir, { recursive: true })
    }
  }

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

    if (!fs.existsSync(this.installationDir)) {
      fs.mkdirSync(this.installationDir)
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

    fs.cpSync(keytoolSrcPath, this.installationDir, { recursive: true })

    if (fs.existsSync(extractedDir)) {
      fs.rmSync(extractedDir, { recursive: true })
    }

    return this.isInstalled()
  }

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
}
