// SPDX-License-Identifier: Apache-2.0

import * as constants from '../constants.js';
import * as version from '../../../version.js';
import {inject, injectable} from 'tsyringe-neo';
import {patchInject} from '../dependency-injection/container-helper.js';
import {InjectTokens} from '../dependency-injection/inject-tokens.js';
import {BaseDependencyManager} from './base-dependency-manager.js';
import {PackageDownloader} from '../package-downloader.js';
import util from 'node:util';
import {SoloError} from '../errors/solo-error.js';
import {SoloErrors} from '../errors/solo-errors.js';
import {GitHubApiClient} from '../github-api-client.js';
import fs from 'node:fs';
import {Zippy} from '../zippy.js';
import {GitHubRelease, ReleaseInfo, PodmanMode} from '../../types/index.js';
import {PathEx} from '../../business/utils/path-ex.js';
import {OperatingSystem} from '../../business/utils/operating-system.js';
import {SubprocessEnvironment} from '../subprocess-environment.js';

const PODMAN_RELEASES_LIST_URL: string = 'https://api.github.com/repos/containers/podman/releases';

@injectable()
export class PodmanDependencyManager extends BaseDependencyManager {
  protected checksum: string;
  protected releaseBaseUrl: string;
  protected artifactFileName: string;
  protected artifactVersion: string;

  public constructor(
    @inject(InjectTokens.PackageDownloader) downloader: PackageDownloader,
    @inject(InjectTokens.PodmanInstallationDirectory) installationDirectory: string,
    @inject(InjectTokens.OsArch) osArch: string,
    @inject(InjectTokens.PodmanVersion) podmanVersion: string,
    @inject(InjectTokens.Zippy) private readonly zippy: Zippy,
    @inject(InjectTokens.PodmanDependenciesInstallationDirectory) protected readonly helpersDirectory: string,
    @inject(InjectTokens.HomeDirectory) private readonly soloHomeDirectory: string,
    @inject(InjectTokens.CacheDir) private readonly cacheDirectory: string,
  ) {
    super(
      patchInject(downloader, InjectTokens.PackageDownloader, PodmanDependencyManager.name),
      patchInject(installationDirectory, InjectTokens.PodmanInstallationDirectory, PodmanDependencyManager.name),
      patchInject(osArch, InjectTokens.OsArch, PodmanDependencyManager.name),
      patchInject(podmanVersion, InjectTokens.PodmanVersion, PodmanDependencyManager.name) || version.PODMAN_VERSION,
      constants.PODMAN,
      '',
    );

    this.zippy = patchInject(this.zippy, InjectTokens.Zippy, PodmanDependencyManager.name);
    this.helpersDirectory = patchInject(
      this.helpersDirectory,
      InjectTokens.PodmanDependenciesInstallationDirectory,
      PodmanDependencyManager.name,
    );
    this.soloHomeDirectory = patchInject(
      this.soloHomeDirectory,
      InjectTokens.HomeDirectory,
      PodmanDependencyManager.name,
    );
    this.cacheDirectory = patchInject(this.cacheDirectory, InjectTokens.CacheDir, PodmanDependencyManager.name);
  }

  /**
   * Get the Podman artifact name based on version, OS, and architecture
   */
  protected getArtifactName(): string {
    return util.format(
      this.artifactFileName,
      this.getRequiredVersion(),
      OperatingSystem.getFormattedPlatform(),
      this.osArch,
    );
  }

  public get mode(): PodmanMode {
    return OperatingSystem.isLinux() ? PodmanMode.ROOTFUL : PodmanMode.VIRTUAL_MACHINE;
  }

  public async getVersion(executableWithPath: string): Promise<string> {
    // The retry logic is to handle potential transient issues with the command execution
    // The command `podman --version` was sometimes observed to return an empty output in the CI environment
    const maxAttempts: number = 3;
    for (let attempt: number = 1; attempt <= maxAttempts; attempt++) {
      try {
        const output: string[] = await this.run(executableWithPath, ['--version']);
        if (output.length > 0) {
          const match: RegExpMatchArray | null = output[0].trim().match(/(\d+\.\d+\.\d+)/);
          return match[1];
        }
      } catch (error: any) {
        throw new SoloErrors.system.dependencyVersionCheckFailed('podman', error);
      }
    }
    throw new SoloErrors.system.dependencyVersionCheckFailed('podman');
  }

  /**
   * Fetches the latest release information from GitHub API
   * @returns Promise with the release base URL, asset name, digest, and version
   */
  private async fetchReleaseInfo(tagName: string): Promise<ReleaseInfo> {
    try {
      const response: Response = await GitHubApiClient.get(PODMAN_RELEASES_LIST_URL);
      const releases: GitHubRelease[] = await response.json();

      if (!releases || releases.length === 0) {
        throw new SoloErrors.system.gitHubReleasesNotFound();
      }

      // Get the latest release
      const release: GitHubRelease = releases.find(release => release.tag_name === tagName);
      const version: string = release.tag_name.replace(/^v/, ''); // Remove 'v' prefix if present

      // Normalize platform/arch for asset matching
      const arch: string = this.getArch();

      // Construct asset pattern based on platform
      let assetPattern: RegExp;
      if (OperatingSystem.isWin32()) {
        // Windows
        assetPattern = new RegExp(String.raw`podman-remote-release-windows_${arch}\.zip$`);
      } else if (OperatingSystem.isDarwin()) {
        // macOS
        assetPattern = new RegExp(String.raw`podman-remote-release-darwin_${arch}\.zip$`);
      } else {
        // Linux
        assetPattern = new RegExp(String.raw`podman-remote-static-linux_${arch}\.tar\.gz$`);
      }

      // Find the matching asset
      const matchingAsset = release.assets.find(asset => assetPattern.test(asset.browser_download_url));

      if (!matchingAsset) {
        throw new SoloErrors.system.gitHubReleaseAssetNotFound(OperatingSystem.getPlatform(), arch);
      }

      // Get the digest from the shasums file
      const checksum: string = matchingAsset.digest
        ? matchingAsset.digest.replace('sha256:', '')
        : '0000000000000000000000000000000000000000000000000000000000000000';

      // Construct the release base URL (removing the filename from the download URL)
      const downloadUrl: string = matchingAsset.browser_download_url.slice(
        0,
        Math.max(0, matchingAsset.browser_download_url.lastIndexOf('/')),
      );

      return {
        downloadUrl,
        assetName: matchingAsset.name,
        checksum,
        version,
      };
    } catch (error) {
      if (error instanceof SoloError) {
        throw error;
      }
      throw new SoloErrors.system.githubApiResponseParseFailed(PODMAN_RELEASES_LIST_URL, error);
    }
  }

  // Podman should only be installed if Docker is not already present on the client system
  public override async shouldInstall(): Promise<boolean> {
    // Check if Podman is explicitly requested via environment variable
    if (process.env.FORCE_PODMAN === 'true') {
      return true;
    }

    // Determine if Docker is already installed
    try {
      await this.run(constants.DOCKER, ['--version']);
      return false;
    } catch {
      return true;
    }
  }

  protected override async preInstall(): Promise<void> {
    const releaseInfo: ReleaseInfo = await this.fetchReleaseInfo(version.PODMAN_VERSION);
    this.checksum = releaseInfo.checksum;
    this.releaseBaseUrl = releaseInfo.downloadUrl;
    this.artifactFileName = releaseInfo.assetName;
    this.artifactVersion = releaseInfo.version;
  }

  protected getDownloadURL(): string {
    return `${this.releaseBaseUrl}/${this.artifactFileName}`;
  }

  /**
   * Handle any post-download processing before copying to destination
   * Child classes can override this for custom extraction or processing
   */
  protected async processDownloadedPackage(packageFilePath: string, temporaryDirectory: string): Promise<string[]> {
    // Extract the archive based on file extension
    if (packageFilePath.endsWith('.zip')) {
      this.zippy!.unzip(packageFilePath, temporaryDirectory);
    } else {
      this.zippy!.untar(packageFilePath, temporaryDirectory);
    }

    let binDirectory: string;
    if (OperatingSystem.isLinux()) {
      binDirectory = PathEx.join(temporaryDirectory, 'bin');
      const arch: string = this.getArch();
      fs.renameSync(
        PathEx.join(binDirectory, `podman-remote-static-linux_${arch}`),
        PathEx.join(binDirectory, constants.PODMAN),
      );
    } else {
      // Find the Podman executable inside the extracted directory
      binDirectory = PathEx.join(temporaryDirectory, `${constants.PODMAN}-${this.artifactVersion}`, 'usr', 'bin');
    }

    return fs.readdirSync(binDirectory).map((file: string): string => PathEx.join(binDirectory, file));
  }

  protected getChecksumURL(): string {
    return this.checksum;
  }

  /**
   * The container-configuration environment (CONTAINERS_CONF / CONTAINERS_REGISTRIES_CONF) pointing
   * at the files {@link setupConfig} persisted under this manager's home directory, so rootful
   * podman keeps using the solo-owned configuration in later solo invocations (image loads, cluster
   * destroy). Only entries whose file exists — and whose referenced runtime still exists — are
   * returned, so a configuration left stale by a later podman/brew change is ignored rather than
   * poisoning every subsequent command. Empty off Linux, where podman runs in a VM instead.
   */
  public containerConfigEnvironment(): Record<string, string> {
    const environment: Record<string, string> = {};
    if (!OperatingSystem.isLinux()) {
      return environment;
    }

    const configDirectory: string = PathEx.join(this.soloHomeDirectory, 'config');
    const containersConfigPath: string = PathEx.join(configDirectory, 'containers.conf');
    if (
      !fs.existsSync(containersConfigPath) ||
      !PodmanDependencyManager.referencedRuntimeExists(containersConfigPath)
    ) {
      return environment;
    }
    environment.CONTAINERS_CONF = containersConfigPath;

    const registriesConfigPath: string = PathEx.join(configDirectory, 'registries.conf');
    if (fs.existsSync(registriesConfigPath)) {
      environment.CONTAINERS_REGISTRIES_CONF = registriesConfigPath;
    }
    return environment;
  }

  /** `NAME=value` pairs for the given environment, in the shape a `sudo env` prefix expects. */
  public static toEnvironmentArguments(environment: Record<string, string>): string[] {
    return Object.entries(environment).map(([name, value]): string => `${name}=${value}`);
  }

  /**
   * Whether the crun runtime the generated containers.conf points at still exists on disk. Guards
   * against a configuration left behind by an earlier podman that a later `brew upgrade` relocated.
   */
  private static referencedRuntimeExists(containersConfigPath: string): boolean {
    try {
      const content: string = fs.readFileSync(containersConfigPath, 'utf8');
      const match: RegExpMatchArray | null = content.match(/crun\s*=\s*\["([^"]+)"\]/);
      // If the file has no runtime line to check, trust it rather than second-guessing.
      return !match || fs.existsSync(match[1]);
    } catch {
      // best-effort: treat an unreadable config as unusable so callers skip it
      return false;
    }
  }

  /**
   * Create custom containers.conf (and, for rootful Linux, registries.conf) files for Podman and
   * point the CONTAINERS_CONF / CONTAINERS_REGISTRIES_CONF env variables at them.
   *
   * @param runtimeBinaryDirectory - directory holding the podman runtime stack (crun, conmon);
   *   required in {@link PodmanMode.ROOTFUL} mode, where it is the Homebrew bin directory
   */
  public override async setupConfig(runtimeBinaryDirectory?: string): Promise<void> {
    // Create the containers.conf file from the template
    const configDirectory: string = PathEx.join(this.soloHomeDirectory, 'config');
    if (!fs.existsSync(configDirectory)) {
      fs.mkdirSync(configDirectory, {recursive: true});
    }

    const templatesDirectory: string = PathEx.join(this.cacheDirectory, 'templates');
    const destinationPath: string = PathEx.join(configDirectory, 'containers.conf');

    if (this.mode === PodmanMode.ROOTFUL) {
      if (!runtimeBinaryDirectory) {
        throw new SoloErrors.validation.missingArgument(
          'runtimeBinaryDirectory is required to configure rootful podman',
        );
      }

      const templatePath: string = PathEx.join(templatesDirectory, 'podman', 'containers-rootful.conf');
      const configContent: string = fs
        .readFileSync(templatePath, 'utf8')
        .replaceAll('$CRUN_PATH', PathEx.join(runtimeBinaryDirectory, 'crun'))
        .replaceAll('$CONMON_PATH', PathEx.join(runtimeBinaryDirectory, 'conmon'))
        .replaceAll('$PODMAN_BINARY_DIR', runtimeBinaryDirectory)
        .replaceAll('$HELPER_BINARIES_DIR', this.helpersDirectory);
      fs.writeFileSync(destinationPath, configContent, 'utf8');

      const registriesTemplatePath: string = PathEx.join(templatesDirectory, 'podman', 'registries.conf');
      const registriesDestinationPath: string = PathEx.join(configDirectory, 'registries.conf');
      fs.copyFileSync(registriesTemplatePath, registriesDestinationPath);

      // Callers read these back through containerConfigEnvironment(); no process.env mutation here.
      return;
    }

    const templatePath: string = PathEx.join(templatesDirectory, 'podman', 'containers.conf');
    let configContent: string = fs.readFileSync(templatePath, 'utf8');
    configContent = configContent.replace('$HELPER_BINARIES_DIR', this.helpersDirectory.replaceAll('\\', '/'));
    fs.writeFileSync(destinationPath, configContent, 'utf8');
    SubprocessEnvironment.setSessionVariable('CONTAINERS_CONF', destinationPath);
  }

  /**
   * Pins podman's `crun` OCI runtime to the one shipped alongside the podman binary Solo is about to
   * drive, by writing a `CONTAINERS_CONF_OVERRIDE` file.
   *
   * podman resolves its OCI runtime from the absolute paths in `containers.conf`, never from `PATH`,
   * and the built-in search order puts the distribution `/usr/bin/crun` ahead of `/usr/local/bin/crun`.
   * A host carrying a self-contained podman bundle (podman plus its own matched crun/conmon/netavark)
   * next to an older distribution crun therefore runs that older crun, which rejects the OCI runtime
   * spec version podman 5+ writes and aborts the container with `crun: unknown version specified` —
   * surfacing through kind only as an opaque `exit status 126`.
   *
   * Only the runtime path is pinned, and `CONTAINERS_CONF_OVERRIDE` is layered on top of the host's
   * existing configuration rather than replacing it, so every other host setting still applies.
   *
   * @param podmanBinaryDirectory - directory holding the podman binary resolved from the PATH
   * @param soloHomeDirectory - Solo home directory; the override is written to its `config` subdirectory
   * @returns the path to the override file, or undefined when podman has no sibling crun to pin, in
   *   which case the host's own runtime resolution is left untouched
   */
  public static writeRuntimeOverride(podmanBinaryDirectory: string, soloHomeDirectory: string): string | undefined {
    const crunPath: string = PathEx.join(podmanBinaryDirectory, 'crun');
    if (!fs.existsSync(crunPath)) {
      return undefined;
    }

    const configDirectory: string = PathEx.join(soloHomeDirectory, 'config');
    if (!fs.existsSync(configDirectory)) {
      fs.mkdirSync(configDirectory, {recursive: true});
    }

    const overridePath: string = PathEx.join(configDirectory, 'containers-runtime-override.conf');
    fs.writeFileSync(overridePath, `[engine.runtimes]\ncrun = ["${crunPath.replaceAll('\\', '/')}"]\n`, 'utf8');
    return overridePath;
  }
}
