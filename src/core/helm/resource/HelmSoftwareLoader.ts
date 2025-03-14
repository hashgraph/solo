// SPDX-License-Identifier: Apache-2.0

import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs/promises';

/**
 * Loader for Helm software resources.
 */
export class HelmSoftwareLoader {
  private static readonly HELM_EXECUTABLE_NAME = os.platform() === 'win32' ? 'helm.exe' : 'helm';
  private static readonly RESOURCE_PATH = path.join('resources', 'helm');

  /**
   * Loads the Helm executable for the current platform and architecture.
   * @returns Promise resolving to the path of the Helm executable
   * @throws Error if the executable cannot be found or loaded
   */
  public async loadHelmExecutable(): Promise<string> {
    const platform = os.platform();
    const arch = os.arch();

    const executablePath = this.getExecutablePath(platform, arch);

    try {
      await fs.access(executablePath, fs.constants.X_OK);
      return executablePath;
    } catch (error) {
      throw new Error(`Helm executable not found or not executable at ${executablePath}: ${error.message}`);
    }
  }

  /**
   * Gets the path to the Helm executable for the given platform and architecture.
   * @param platform The operating system platform
   * @param arch The CPU architecture
   * @returns The path to the Helm executable
   * @throws Error if the platform or architecture is not supported
   */
  private getExecutablePath(platform: string, arch: string): string {
    let platformDir: string;

    switch (platform) {
      case 'darwin':
        platformDir = 'macos';
        break;
      case 'linux':
        platformDir = 'linux';
        break;
      case 'win32':
        platformDir = 'windows';
        break;
      default:
        throw new Error(`Unsupported platform: ${platform}`);
    }

    let archDir: string;
    switch (arch) {
      case 'x64':
        archDir = 'amd64';
        break;
      case 'arm64':
        archDir = 'arm64';
        break;
      default:
        throw new Error(`Unsupported architecture: ${arch}`);
    }

    return path.join(
      __dirname,
      '..',
      HelmSoftwareLoader.RESOURCE_PATH,
      platformDir,
      archDir,
      HelmSoftwareLoader.HELM_EXECUTABLE_NAME,
    );
  }
}
