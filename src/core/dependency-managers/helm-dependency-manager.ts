// SPDX-License-Identifier: Apache-2.0

import fs from 'fs';
import * as util from 'util';
import {MissingArgumentError} from '../errors/missing-argument-error.js';
import * as helpers from '../helpers.js';
import * as constants from '../constants.js';
import {type PackageDownloader} from '../package-downloader.js';
import {type Zippy} from '../zippy.js';
import {Templates} from '../templates.js';
import * as version from '../../../version.js';
import {ShellRunner} from '../shell-runner.js';
import * as semver from 'semver';
import {OS_WIN32, OS_WINDOWS} from '../constants.js';
import {inject, injectable} from 'tsyringe-neo';
import {patchInject} from '../dependency-injection/container-helper.js';
import {InjectTokens} from '../dependency-injection/inject-tokens.js';
import {PathEx} from '../util/path-ex.js';

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
@injectable()
export class HelmDependencyManager extends ShellRunner {
  private readonly osPlatform: string;
  private readonly osArch: string;
  private helmPath: string;
  private readonly artifactName: string;
  private readonly helmURL: string;
  private readonly checksumURL: string;

  constructor(
    @inject(InjectTokens.PackageDownloader) private readonly downloader?: PackageDownloader,
    @inject(InjectTokens.Zippy) private readonly zippy?: Zippy,
    @inject(InjectTokens.HelmInstallationDir) private readonly installationDir?: string,
    @inject(InjectTokens.OsPlatform) osPlatform?: NodeJS.Platform,
    @inject(InjectTokens.OsArch) osArch?: string,
    @inject(InjectTokens.HelmVersion) private readonly helmVersion?: string,
  ) {
    super();
    this.installationDir = patchInject(installationDir, InjectTokens.HelmInstallationDir, this.constructor.name);
    this.osPlatform = patchInject(osPlatform, InjectTokens.OsPlatform, this.constructor.name);
    this.osArch = patchInject(osArch, InjectTokens.OsArch, this.constructor.name);
    this.helmVersion = patchInject(helmVersion, InjectTokens.HelmVersion, this.constructor.name);

    if (!installationDir) throw new MissingArgumentError('installation directory is required');

    this.downloader = patchInject(downloader, InjectTokens.PackageDownloader, this.constructor.name);
    this.zippy = patchInject(zippy, InjectTokens.Zippy, this.constructor.name);
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
    const extractedDir = PathEx.join(tmpDir, 'extracted-helm');
    let helmSrc = PathEx.join(extractedDir, `${this.osPlatform}-${this.osArch}`, constants.HELM);

    const packageFile = await this.downloader.fetchPackage(this.helmURL, this.checksumURL, tmpDir);
    if (this.osPlatform === constants.OS_WINDOWS) {
      this.zippy.unzip(packageFile, extractedDir);
      // append .exe for windows
      helmSrc = PathEx.join(extractedDir, `${this.osPlatform}-${this.osArch}`, `${constants.HELM}.exe`);
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
