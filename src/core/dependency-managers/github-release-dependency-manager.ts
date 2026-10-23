// SPDX-License-Identifier: Apache-2.0

import {BaseDependencyManager} from './base-dependency-manager.js';
import {type PackageDownloader} from '../package-downloader.js';
import {SoloError} from '../errors/solo-error.js';
import {SoloErrors} from '../errors/solo-errors.js';
import {GitHubApiClient} from '../github-api-client.js';
import {type GitHubRelease, type GitHubReleaseAsset, type ReleaseInfo} from '../../types/index.js';
import {OperatingSystem} from '../../business/utils/operating-system.js';

/**
 * Base class for dependency managers whose artifact is discovered from a pinned GitHub release: the
 * releases list is fetched, the release matching the required version tag is selected, and the asset
 * built for the running platform supplies the download URL and the sha256 checksum. Subclasses provide
 * the releases list URL and the asset matcher; everything else (release parsing, checksum sourcing,
 * download/checksum URLs and the `--version` probe) lives here so it is changed and tested once.
 */
export abstract class GitHubReleaseDependencyManager extends BaseDependencyManager {
  /** Populated by {@link preInstall}; undefined until the release has been discovered. */
  protected releaseInfo: ReleaseInfo | undefined;

  /** The GitHub API URL listing the upstream project's releases. */
  protected abstract readonly releasesListUrl: string;

  protected constructor(
    downloader: PackageDownloader,
    installationDirectory: string,
    osArch: string,
    requiredVersion: string,
    dependencyName: string,
  ) {
    super(downloader, installationDirectory, osArch, requiredVersion, dependencyName, '');
  }

  /** Whether the given release asset is the one built for the running platform and architecture. */
  protected abstract isMatchingAsset(asset: GitHubReleaseAsset): boolean;

  public async getVersion(executableWithPath: string): Promise<string> {
    // The retry handles transient issues with the command execution: `<tool> --version` was sometimes
    // observed to return an empty output in the CI environment.
    const maxAttempts: number = 3;
    for (let attempt: number = 1; attempt <= maxAttempts; attempt++) {
      try {
        const output: string[] = await this.run(executableWithPath, ['--version']);
        const match: RegExpMatchArray | null = output.join('\n').match(/(\d+\.\d+\.\d+)/);
        if (match) {
          return match[1];
        }
      } catch (error) {
        throw new SoloErrors.system.dependencyVersionCheckFailed(this.dependencyName, error);
      }
    }
    throw new SoloErrors.system.dependencyVersionCheckFailed(this.dependencyName);
  }

  /**
   * The artifact name is only known once the release has been discovered; before {@link preInstall}
   * runs (notably from the base constructor) it is undefined.
   */
  protected getArtifactName(): string {
    return this.releaseInfo?.assetName;
  }

  /**
   * Fetches the pinned release's information from the GitHub API.
   * @returns Promise with the release base URL, asset name, sha256 checksum, and version
   */
  protected async fetchReleaseInfo(tagName: string): Promise<ReleaseInfo> {
    try {
      const response: Response = await GitHubApiClient.get(this.releasesListUrl);
      const releases: GitHubRelease[] = await response.json();

      if (!releases || releases.length === 0) {
        throw new SoloErrors.system.gitHubReleasesNotFound();
      }

      const release: GitHubRelease | undefined = releases.find(
        (candidate: GitHubRelease): boolean => candidate.tag_name === tagName,
      );
      if (!release) {
        throw new SoloErrors.system.gitHubReleaseTagNotFound(tagName);
      }

      const matchingAsset: GitHubReleaseAsset | undefined = release.assets.find((asset: GitHubReleaseAsset): boolean =>
        this.isMatchingAsset(asset),
      );
      if (!matchingAsset) {
        throw new SoloErrors.system.gitHubReleaseAssetNotFound(OperatingSystem.getFormattedPlatform(), this.getArch());
      }

      if (!matchingAsset.digest && this.getVerifyChecksum()) {
        // Refuse to install an unverifiable binary rather than downloading it only to fail verification.
        throw new SoloErrors.system.checksumReadFailed(
          `${matchingAsset.name} (no sha256 digest published for ${tagName})`,
        );
      }

      return {
        // the release base URL is the download URL without the trailing file name
        downloadUrl: matchingAsset.browser_download_url.slice(
          0,
          Math.max(0, matchingAsset.browser_download_url.lastIndexOf('/')),
        ),
        assetName: matchingAsset.name,
        // the placeholder keeps the checksum non-empty for managers that skip verification
        checksum: matchingAsset.digest ? matchingAsset.digest.replace('sha256:', '') : '0'.repeat(64),
        version: release.tag_name.replace(/^v/, ''),
      };
    } catch (error) {
      if (error instanceof SoloError) {
        throw error;
      }
      throw new SoloErrors.system.githubApiResponseParseFailed(this.releasesListUrl, error);
    }
  }

  protected override async preInstall(): Promise<void> {
    this.releaseInfo = await this.fetchReleaseInfo(this.getRequiredVersion());
  }

  protected getDownloadURL(): string {
    return `${this.releaseInfo?.downloadUrl}/${this.releaseInfo?.assetName}`;
  }

  protected getChecksumURL(): string {
    return this.releaseInfo?.checksum;
  }
}
