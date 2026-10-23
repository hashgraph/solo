// SPDX-License-Identifier: Apache-2.0

import fs from 'node:fs';
import zlib from 'node:zlib';
import {GitHubReleaseDependencyManager} from './github-release-dependency-manager.js';
import {type PackageDownloader} from '../package-downloader.js';
import {type GitHubReleaseAsset} from '../../types/index.js';
import {OperatingSystem} from '../../business/utils/operating-system.js';
import {PathEx} from '../../business/utils/path-ex.js';

/**
 * Downloads a podman network helper binary (netavark, aardvark-dns) from its upstream
 * `containers/<helper>` GitHub release. Homebrew's podman formula does not package these two
 * helpers, so on Linux the brew-installed podman would otherwise fall through to whatever stale
 * helper the system container stack supplies. Each release publishes the helper as a single
 * gzipped `<helper>.gz` binary (Linux x86_64 only, matching Homebrew's Linux support).
 */
export abstract class PodmanNetworkHelperDependencyManager extends GitHubReleaseDependencyManager {
  protected readonly releasesListUrl: string;

  protected constructor(
    downloader: PackageDownloader,
    installationDirectory: string,
    osArch: string,
    requiredVersion: string,
    dependencyName: string,
  ) {
    super(downloader, installationDirectory, osArch, requiredVersion, dependencyName);
    this.releasesListUrl = `https://api.github.com/repos/containers/${dependencyName}/releases`;
  }

  /** The helpers exist only for the rootful Linux flow; every other platform runs podman in a VM. */
  public override async shouldInstall(): Promise<boolean> {
    return OperatingSystem.isLinux();
  }

  /**
   * Podman resolves these helpers only from the `helper_binaries_dir` list Solo writes into
   * containers.conf, never from PATH, so a copy found elsewhere on PATH must not satisfy the
   * install — the binary has to land in helpersDirectory.
   */
  protected override allowGlobalInstallation(): boolean {
    return false;
  }

  protected isMatchingAsset(asset: GitHubReleaseAsset): boolean {
    return asset.name === `${this.dependencyName}.gz`;
  }

  /** The release asset is the bare binary gzipped, so decompress it to the helper's name. */
  protected async processDownloadedPackage(packageFilePath: string, temporaryDirectory: string): Promise<string[]> {
    const targetPath: string = PathEx.join(temporaryDirectory, this.executableName);
    fs.writeFileSync(targetPath, zlib.gunzipSync(fs.readFileSync(packageFilePath)));
    return [targetPath];
  }
}
