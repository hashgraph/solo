// SPDX-License-Identifier: Apache-2.0

import * as constants from '../constants.js';
import * as version from '../../../version.js';
import {inject, injectable} from 'tsyringe-neo';
import {patchInject} from '../dependency-injection/container-helper.js';
import {InjectTokens} from '../dependency-injection/inject-tokens.js';
import {GitHubReleaseDependencyManager} from './github-release-dependency-manager.js';
import {PackageDownloader} from '../package-downloader.js';
import {SoloErrors} from '../errors/solo-errors.js';
import {type GitHubReleaseAsset} from '../../types/index.js';
import fs from 'node:fs';
import {OperatingSystem} from '../../business/utils/operating-system.js';
import {PathEx} from '../../business/utils/path-ex.js';

@injectable()
export class GvproxyDependencyManager extends GitHubReleaseDependencyManager {
  protected readonly releasesListUrl: string = 'https://api.github.com/repos/containers/gvisor-tap-vsock/releases';

  public constructor(
    @inject(InjectTokens.PackageDownloader) downloader: PackageDownloader,
    @inject(InjectTokens.PodmanDependenciesInstallationDirectory) installationDirectory: string,
    @inject(InjectTokens.OsArch) osArch: string,
    @inject(InjectTokens.GvproxyVersion) gvproxyVersion: string,
  ) {
    super(
      patchInject(downloader, InjectTokens.PackageDownloader, GvproxyDependencyManager.name),
      patchInject(
        installationDirectory,
        InjectTokens.PodmanDependenciesInstallationDirectory,
        GvproxyDependencyManager.name,
      ),
      patchInject(osArch, InjectTokens.OsArch, GvproxyDependencyManager.name),
      patchInject(gvproxyVersion, InjectTokens.GvproxyVersion, GvproxyDependencyManager.name) ||
        version.GVPROXY_VERSION,
      constants.GVPROXY,
    );
  }

  /**
   * Determine the appropriate asset name for the current platform and architecture
   * based on the naming conventions used in gvproxy GitHub releases
   */
  private getAssetName(): string {
    const arch: string = this.getArch();

    if (OperatingSystem.isWin32()) {
      // For Windows, use the regular exe (not the GUI version)
      return arch === 'arm64' ? 'gvproxy-windows-arm64.exe' : 'gvproxy-windows.exe';
    }
    if (OperatingSystem.isDarwin()) {
      return 'gvproxy-darwin';
    }
    if (OperatingSystem.isLinux()) {
      return `gvproxy-linux-${arch}`;
    }
    throw new SoloErrors.validation.illegalArgument(`Unsupported platform: ${OperatingSystem.getPlatform()}`);
  }

  protected isMatchingAsset(asset: GitHubReleaseAsset): boolean {
    return asset.name === this.getAssetName();
  }

  /** The release asset is the bare binary, so rename it to the executable's name. */
  protected async processDownloadedPackage(packageFilePath: string, temporaryDirectory: string): Promise<string[]> {
    const targetPath: string = PathEx.join(temporaryDirectory, this.executableName);
    fs.renameSync(packageFilePath, targetPath);
    return [targetPath];
  }
}
