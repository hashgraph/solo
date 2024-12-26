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
import fs from 'fs';
import os from 'os';
import path from 'path';
import * as util from 'util';
import {MissingArgumentError} from '../errors.js';
import * as helpers from '../helpers.js';
import * as constants from '../constants.js';
import {PackageDownloader} from '../package_downloader.js';
import {Zippy} from '../zippy.js';
import {Templates} from '../templates.js';
import * as version from '../../../version.js';
import {ShellRunner} from '../shell_runner.js';
import * as semver from 'semver';
import {OS_WIN32, OS_WINDOWS} from '../constants.js';
import {inject, Lifecycle, scoped} from 'tsyringe-neo';
import {Container} from '../container_init.js';

// constants required by HelmDependencyManager
const HELM_RELEASE_BASE_URL = 'https://get.helm.sh';
const HELM_ARTIFACT_TEMPLATE = 'helm-%s-%s-%s.%s';

const HELM_ARTIFACT_EXT: Map<string, string> = new Map()
  .set(constants.OS_DARWIN, 'tar.gz')
  .set(constants.OS_LINUX, 'tar.gz')
  .set(constants.OS_WINDOWS, 'zip');

/**
 * Helm dependency manager installs or uninstalls helm client at SOLO_HOME_DIR/bin directory
 */
@scoped(Lifecycle.ContainerScoped)
export class HelmDependencyManager extends ShellRunner {
  private readonly osPlatform: string;
  private readonly osArch: string;
  private helmPath: string;
  private readonly artifactName: string;
  private readonly helmURL: string;
  private readonly checksumURL: string;

  constructor(
    @inject(PackageDownloader) private readonly downloader: PackageDownloader,
    @inject(Zippy) private readonly zippy: Zippy,
    private readonly installationDir = path.join(constants.SOLO_HOME_DIR, 'bin'),
    osPlatform = os.platform(),
    osArch = os.arch(),
    private readonly helmVersion = version.HELM_VERSION,
  ) {
    super();

    if (!installationDir) throw new MissingArgumentError('installation directory is required');

    this.downloader = Container.patchInject(downloader, PackageDownloader);
    this.zippy = Container.patchInject(zippy, Zippy);
    this.installationDir = installationDir;
    // Node.js uses 'win32' for windows in package.json os field, but helm uses 'windows'
    if (osPlatform === OS_WIN32) {
      this.osPlatform = OS_WINDOWS;
    } else {
      this.osPlatform = osPlatform;
    }
    this.osArch = ['x64', 'x86-64'].includes(osArch) ? 'amd64' : osArch;
    this.helmPath = Templates.installationPath(constants.HELM, this.osPlatform, this.installationDir);

    const fileExt = HELM_ARTIFACT_EXT.get(this.osPlatform);
    this.artifactName = util.format(HELM_ARTIFACT_TEMPLATE, this.helmVersion, this.osPlatform, this.osArch, fileExt);
    this.helmURL = `${HELM_RELEASE_BASE_URL}/${this.artifactName}`;
    this.checksumURL = `${HELM_RELEASE_BASE_URL}/${this.artifactName}.sha256sum`;
  }

  getHelmPath() {
    return this.helmPath;
  }

  isInstalled() {
    return fs.existsSync(this.helmPath);
  }

  /**
   * Uninstall helm from solo bin folder
   */
  uninstall() {
    if (this.isInstalled()) {
      fs.rmSync(this.helmPath);
    }
  }

  async install(tmpDir: string = helpers.getTmpDir()) {
    const extractedDir = path.join(tmpDir, 'extracted-helm');
    let helmSrc = path.join(extractedDir, `${this.osPlatform}-${this.osArch}`, constants.HELM);

    const packageFile = await this.downloader.fetchPackage(this.helmURL, this.checksumURL, tmpDir);
    if (this.osPlatform === constants.OS_WINDOWS) {
      this.zippy.unzip(packageFile, extractedDir);
      // append .exe for windows
      helmSrc = path.join(extractedDir, `${this.osPlatform}-${this.osArch}`, `${constants.HELM}.exe`);
    } else {
      this.zippy.untar(packageFile, extractedDir);
    }

    if (!fs.existsSync(this.installationDir)) {
      fs.mkdirSync(this.installationDir);
    }

    // install new helm
    this.uninstall();
    this.helmPath = Templates.installationPath(constants.HELM, this.osPlatform, this.installationDir);
    fs.cpSync(helmSrc, this.helmPath);

    if (fs.existsSync(extractedDir)) {
      fs.rmSync(extractedDir, {recursive: true});
    }

    return this.isInstalled();
  }

  async checkVersion(shouldInstall = true) {
    if (!this.isInstalled()) {
      if (shouldInstall) {
        await this.install();
      } else {
        return false;
      }
    }

    const output = await this.run(`${this.helmPath} version --short`);
    const parts = output[0].split('+');
    this.logger.debug(`Found ${constants.HELM}:${parts[0]}`);
    return semver.gte(parts[0], version.HELM_VERSION);
  }

  getHelmVersion() {
    return version.HELM_VERSION;
  }
}
