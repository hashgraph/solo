// SPDX-License-Identifier: Apache-2.0

import * as constants from '../constants.js';
import * as version from '../../../version.js';
import {inject, injectable} from 'tsyringe-neo';
import {patchInject} from '../dependency-injection/container-helper.js';
import {InjectTokens} from '../dependency-injection/inject-tokens.js';
import {BaseDependencyManager} from './base-dependency-manager.js';
import {SubprocessCommandProfile} from '../subprocess-command-profile.js';
import {PackageDownloader} from '../package-downloader.js';
import {format} from 'node:util';
import {SoloErrors} from '../errors/solo-errors.js';
import {OperatingSystem} from '../../business/utils/operating-system.js';

const KUBECTL_RELEASE_BASE_URL: string = 'https://dl.k8s.io/release';
const KUBECTL_ARTIFACT_TEMPLATE: string = '%s/bin/%s/%s/kubectl';
const KUBECTL_WINDOWS_ARTIFACT_TEMPLATE: string = '%s/bin/%s/%s/kubectl.exe';

@injectable()
export class KubectlDependencyManager extends BaseDependencyManager {
  public constructor(
    @inject(InjectTokens.PackageDownloader) downloader: PackageDownloader,
    @inject(InjectTokens.KubectlInstallationDirectory) installationDirectory: string,
    @inject(InjectTokens.OsArch) osArch: string,
    @inject(InjectTokens.KubectlVersion) kubectlVersion: string,
  ) {
    // Call the base constructor with the Kubectl-specific parameters
    super(
      patchInject(downloader, InjectTokens.PackageDownloader, KubectlDependencyManager.name),
      patchInject(installationDirectory, InjectTokens.KubectlInstallationDirectory, KubectlDependencyManager.name),
      patchInject(osArch, InjectTokens.OsArch, KubectlDependencyManager.name),
      patchInject(kubectlVersion, InjectTokens.KubectlVersion, KubectlDependencyManager.name) ||
        version.KUBECTL_VERSION,
      constants.KUBECTL,
      KUBECTL_RELEASE_BASE_URL,
    );
  }

  /**
   * Get the Kubectl artifact name based on version, OS, and architecture
   */
  protected getArtifactName(): string {
    return format(
      OperatingSystem.isWin32() ? KUBECTL_WINDOWS_ARTIFACT_TEMPLATE : KUBECTL_ARTIFACT_TEMPLATE,
      this.getRequiredVersion(),
      OperatingSystem.getFormattedPlatform(),
      this.osArch,
    );
  }

  public async getVersion(executableWithPath: string): Promise<string> {
    try {
      // Override KUBECONFIG to prevent loading kubeconfig and triggering authentication
      // plugins (e.g., Teleport exec credentials) which can hang in non-interactive environments.
      // Using the null device ensures kubectl only reports the client version without any
      // server or credential-related operations.
      const nullDevice: string = OperatingSystem.isWin32() ? 'nul' : '/dev/null';
      const output: string[] = await this.run(executableWithPath, ['version', '--client'], {
        commandProfile: SubprocessCommandProfile.KUBECTL,
        environmentVariablesToAppend: {KUBECONFIG: nullDevice},
        timeoutMs: 30_000,
      });
      this.logger.debug(`Raw kubectl version output: ${output.join('\n')}`);
      if (output.length > 0) {
        for (const line of output) {
          if (line.trim().startsWith('Client Version')) {
            const match: RegExpMatchArray | null = line.trim().match(/(\d+\.\d+\.\d+)/);
            if (match) {
              const detectedVersion: string = match[1];
              this.logger.info(`Kubectl version: ${detectedVersion}`);
              return detectedVersion;
            }
          }
        }
      }
    } catch (error) {
      throw new SoloErrors.system.dependencyVersionCheckFailed('kubectl', error);
    }
    throw new SoloErrors.system.dependencyVersionCheckFailed('kubectl');
  }

  protected getDownloadURL(): string {
    return `${this.downloadBaseUrl}/${this.artifactName}`;
  }

  /**
   * Handle any post-download processing before copying to destination
   * Child classes can override this for custom extraction or processing
   */
  protected async processDownloadedPackage(packageFilePath: string): Promise<string[]> {
    // For kubectl, the downloaded file is the executable itself, so we can return it directly
    return [packageFilePath];
  }

  protected getChecksumURL(): string {
    return `${this.downloadURL}.sha256`;
  }
}
