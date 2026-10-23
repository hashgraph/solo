// SPDX-License-Identifier: Apache-2.0

import * as constants from '../constants.js';
import * as version from '../../../version.js';
import {inject, injectable} from 'tsyringe-neo';
import {patchInject} from '../dependency-injection/container-helper.js';
import {InjectTokens} from '../dependency-injection/inject-tokens.js';
import {GitHubReleaseDependencyManager} from './github-release-dependency-manager.js';
import {PackageDownloader} from '../package-downloader.js';
import {type GitHubReleaseAsset} from '../../types/index.js';

@injectable()
export class VfkitDependencyManager extends GitHubReleaseDependencyManager {
  protected readonly releasesListUrl: string = 'https://api.github.com/repos/crc-org/vfkit/releases';

  public constructor(
    @inject(InjectTokens.PackageDownloader) downloader: PackageDownloader,
    @inject(InjectTokens.PodmanDependenciesInstallationDirectory) installationDirectory: string,
    @inject(InjectTokens.OsArch) osArch: string,
    @inject(InjectTokens.VfkitVersion) vfkitVersion: string,
  ) {
    super(
      patchInject(downloader, InjectTokens.PackageDownloader, VfkitDependencyManager.name),
      patchInject(
        installationDirectory,
        InjectTokens.PodmanDependenciesInstallationDirectory,
        VfkitDependencyManager.name,
      ),
      patchInject(osArch, InjectTokens.OsArch, VfkitDependencyManager.name),
      patchInject(vfkitVersion, InjectTokens.VfkitVersion, VfkitDependencyManager.name) || version.VFKIT_VERSION,
      constants.VFKIT,
    );
  }

  public override getVerifyChecksum(): boolean {
    return false;
  }

  /** vfkit releases a single universal macOS binary, so the asset is matched by name only. */
  protected isMatchingAsset(asset: GitHubReleaseAsset): boolean {
    return asset.name.includes(constants.VFKIT);
  }

  protected async processDownloadedPackage(packageFilePath: string, _temporaryDirectory: string): Promise<string[]> {
    return [packageFilePath];
  }
}
