// SPDX-License-Identifier: Apache-2.0

import {HelmConfigurationException} from '../helm-configuration-exception.js';
import {ShellRunner} from '../../../core/shell-runner.js';

/**
 * Get helm executable path
 */
export class HelmSoftwareLoader {
  public static async getHelmExecutablePath(): Promise<string> {
    try {
      const shellRunner = new ShellRunner();
      const platform = process.platform;

      let helmPath: string;
      // Use the appropriate command based on the platform
      if (platform === 'linux' || platform === 'darwin') {
        helmPath = (await shellRunner.run('which helm')).join('').trim();
      } else if (platform === 'win32') {
        helmPath = (await shellRunner.run('where helm')).join('').trim();
      } else {
        throw new HelmConfigurationException(`Unsupported operating system: ${platform}`);
      }

      if (!helmPath) {
        throw new HelmConfigurationException(
          'Helm executable not found in PATH. Please install Helm and ensure it is available in your system PATH.',
        );
      }

      return helmPath;
    } catch (e) {
      if (e instanceof HelmConfigurationException) {
        throw e;
      }
      throw new HelmConfigurationException(`Failed to locate Helm executable: ${(e as Error).message}`);
    }
  }
}
