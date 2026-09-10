// SPDX-License-Identifier: Apache-2.0

import * as constants from '../constants.js';
import * as version from '../../../version.js';
import {inject, injectable} from 'tsyringe-neo';
import {patchInject} from '../dependency-injection/container-helper.js';
import {InjectTokens} from '../dependency-injection/inject-tokens.js';
import {BaseDependencyManager} from './base-dependency-manager.js';
import {SubprocessCommandProfile} from '../subprocess-command-profile.js';
import {Zippy} from '../zippy.js';
import {PathEx} from '../../business/utils/path-ex.js';
import {PackageDownloader} from '../package-downloader.js';
import util from 'node:util';
import fs from 'node:fs';
import {SoloErrors} from '../errors/solo-errors.js';
import {OperatingSystem} from '../../business/utils/operating-system.js';

const HELM_RELEASE_BASE_URL: string = 'https://get.helm.sh';
const HELM_ARTIFACT_TEMPLATE: string = 'helm-%s-%s-%s.%s';

/**
 * Helm dependency manager installs or uninstalls helm client at SOLO_HOME_DIR/bin directory
 */
@injectable()
export class HelmDependencyManager extends BaseDependencyManager {
  public constructor(
    @inject(InjectTokens.PackageDownloader) downloader: PackageDownloader,
    @inject(InjectTokens.Zippy) private readonly zippy: Zippy,
    @inject(InjectTokens.HelmInstallationDirectory) installationDirectory: string,
    @inject(InjectTokens.OsArch) osArch: string,
    @inject(InjectTokens.HelmVersion) helmVersion: string,
  ) {
    super(
      patchInject(downloader, InjectTokens.PackageDownloader, HelmDependencyManager.name),
      patchInject(installationDirectory, InjectTokens.HelmInstallationDirectory, HelmDependencyManager.name),
      patchInject(osArch, InjectTokens.OsArch, HelmDependencyManager.name),
      patchInject(helmVersion, InjectTokens.HelmVersion, HelmDependencyManager.name) || version.HELM_VERSION,
      constants.HELM,
      HELM_RELEASE_BASE_URL,
    );
    // Patch injected values to handle undefined values

    this.zippy = patchInject(this.zippy, InjectTokens.Zippy, HelmDependencyManager.name);
  }

  /**
   * Get the Helm artifact name based on version, OS, and architecture
   */
  protected getArtifactName(): string {
    const fileExtension: string = OperatingSystem.isWin32() ? 'zip' : 'tar.gz';
    return util.format(
      HELM_ARTIFACT_TEMPLATE,
      this.getRequiredVersion(),
      OperatingSystem.getFormattedPlatform(),
      this.osArch,
      fileExtension,
    );
  }

  /**
   * Process the downloaded Helm package by extracting it and finding the executable
   */
  protected async processDownloadedPackage(packageFilePath: string, temporaryDirectory: string): Promise<string[]> {
    // Extract the archive
    if (OperatingSystem.isWin32()) {
      this.zippy!.unzip(packageFilePath, temporaryDirectory);
    } else {
      this.zippy!.untar(packageFilePath, temporaryDirectory);
    }

    // Find the Helm executable inside the extracted directory
    const helmExecutablePath: string = PathEx.join(
      temporaryDirectory,
      `${OperatingSystem.getFormattedPlatform()}-${this.osArch}`,
      this.executableName,
    );

    // Ensure the extracted file exists
    if (!fs.existsSync(helmExecutablePath)) {
      const executablePath: string = PathEx.join(temporaryDirectory, this.executableName);

      if (fs.existsSync(executablePath)) {
        fs.rmSync(executablePath);
      }

      fs.cpSync(helmExecutablePath, executablePath);

      if (!fs.existsSync(executablePath)) {
        throw new Error(`Helm executable not found in extracted archive: ${executablePath}`);
      }

      return [executablePath];
    }

    return [helmExecutablePath];
  }

  public async getVersion(executableWithPath: string): Promise<string> {
    try {
      // Override KUBECONFIG to prevent loading kubeconfig and triggering authentication
      // plugins (e.g., Teleport exec credentials) which can hang in non-interactive environments.
      const nullDevice: string = OperatingSystem.isWin32() ? 'nul' : '/dev/null';
      const output: string[] = await this.run(executableWithPath, ['version', '--short'], {
        commandProfile: SubprocessCommandProfile.HELM,
        environmentVariablesToAppend: {KUBECONFIG: nullDevice},
        timeoutMs: 30_000,
      });
      const parts: string[] = output[0].split('+');
      const versionOnly: string = parts[0];
      this.logger.info(`Helm version: ${versionOnly}`);
      this.logger.debug(`Found ${constants.HELM}:${versionOnly}`);
      return versionOnly;
    } catch (error) {
      throw new SoloErrors.system.dependencyVersionCheckFailed('helm', error);
    }
  }

  protected getDownloadURL(): string {
    return `${this.downloadBaseUrl}/${this.artifactName}`;
  }

  protected getChecksumURL(): string {
    return `${this.downloadURL}.sha256sum`;
  }
}
