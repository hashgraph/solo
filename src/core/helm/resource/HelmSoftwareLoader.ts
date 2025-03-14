// SPDX-License-Identifier: Apache-2.0

import {HelmConfigurationException} from '../HelmConfigurationException.js';
import {OperatingSystem} from '../base/api/os/OperatingSystem.js';
import {ShellRunner} from '../../shell_runner.js';

/**
 * Get helm executable path
 */
export class HelmSoftwareLoader {
  public static async installSupportedVersion(): Promise<string> {
    try {
      const os = OperatingSystem.current();
      const shellRunner = new ShellRunner();
      // run shell command 'which helm' if OS is linux or macos
      if (os === OperatingSystem.LINUX || os === OperatingSystem.DARWIN) {
        return (await shellRunner.run('which helm')).join('');
      } else if (os === OperatingSystem.WINDOWS) {
        return (await shellRunner.run('where helm')).join('');
      } else {
        throw new HelmConfigurationException(`Unsupported operating system: ${os}`);
      }
    } catch (e) {
      throw new HelmConfigurationException(e as Error);
    }
  }
}
